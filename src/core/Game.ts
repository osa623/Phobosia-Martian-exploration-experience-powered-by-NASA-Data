import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { assetPaths, screenActions } from "./Discovery";
import { Player } from "./Player";
import type { GameState, SetState } from "./EventBus";
import { buildCentralHubColliders, buildScienceLabColliders, buildCustomColliderSections, buildHabitatColliderSection, buildDroneSectionColliders, buildTerrainBuildingColliders, segmentHitsAnyBox, getSurfaceHeight, buildInteriorColliders, removeSpawnOverlaps } from "./Collision";
import { collisionProfiles } from "./CollisionProfiles";
import { configureModuleLighting, configureMeshShadows, getModuleHemisphereConfig } from "./ModuleLighting";
import {
  MissionManager,
  DAYS_CONFIG,
  MASTER_TERRAIN_TARGETS,
  type MissionProgressState,
  type GeologicalSurveyRecord,
  type SurfaceObservationRecord,
  type ScienceAnalysisRecord,
  type DroneSurveyRecord
} from "./MissionManager";
import { canLand, createDroneCameraRig, createDroneFlightState, createSol5Guidance, createSol5LandingBeacon, createSol5TargetBeacon, disposeSol5Guidance, disposeSol5LandingBeacon, disposeSol5TargetBeacon, detachDroneCameraRig, droneControlsFromKeys, getSol5TakeoffPosition, isInsideSol5LandingTrigger, orientDroneCameraRig, resolveSol5EAction, setSol5LandingBeaconVisible, setSol5TargetBeaconVisible, stepDroneFlight, updateSol5Guidance, updateSol5TargetBeacon, SOL5_LIMITS, type DroneCameraRig, type DroneFlightState, type DroneCameraView, type Sol5GuidanceRig, type Sol5LandingBeacon, type Sol5TargetBeacon } from "../missions/sol-05/droneSimulation";
import { resolveSol5Target, SOL5_EVIDENCE_ASSETS, SOL5_SCENE_TARGETS } from "../missions/sol-05/targetMapping";
import { ScreenRenderer } from "./ScreenRenderer";
import { HabitatScreenRenderer } from "./HabitatScreenRenderer";
import { EngineeringScreenRenderer } from "./EngineeringScreenRenderer";
import { ResearchScreenRenderer } from "./ResearchScreenRenderer";
import { MissionControlScreenRenderer } from "./MissionControlScreenRenderer";
import { CentralHubScreenRenderer } from "./CentralHubScreenRenderer";
import { AirlockScreenRenderer } from "./AirlockScreenRenderer";
import { CameraPresentationManager } from "./CameraPresentation";
import { GameAudioManager, resolveIndoorMovementAudioState } from "./GameAudioManager";
import {
  TRIGGER_TO_GROUP_MAP,
  MODULE_TO_ZONE_MAP,
  ZONE_TO_INTRO_MAP,
  ENTRANCE_INTERACTION_KEYS,
  DAY1_TASKS,
  DAY1_ZONES
} from "./Day1Config";

export type ModuleName = keyof typeof assetPaths;
type Transition = { module: ModuleName; spawn: string };
type InteractionTarget = { object: THREE.Object3D; identifier: string; center: THREE.Vector3; range: number };

const transitions: Record<ModuleName, Record<string, Transition>> = {
  Habitat: { HAB_EXIT_TRIGGER: { module: "Hub", spawn: "Habitat_Entrance_Trigger" } },
  Hub: {
    Main_Entrance_Trigger: { module: "Airlock", spawn: "Central_Hub_Entrance_Trigger" },
    Habitat_Entrance_Trigger: { module: "Habitat", spawn: "HABITAT_SPAWN_POINT" },
    Engineering_Entrance_Trigger: { module: "Engineering", spawn: "Engineering_Entrance" },
    ScienceLab_Entrance_Trigger: { module: "Science", spawn: "SCIENCE_LAB_SPAWN_POINT" },
    MissionControl_Entrance_Trigger: { module: "MissionControl", spawn: "MissionControl_Entrance_Trigger" }
  },
  Airlock: {
    Terrain_Entrance_Trigger: { module: "Terrain", spawn: "Spwaning_Position" },
    Drone_Section_Entrance_Trigger: { module: "Drone", spawn: "DroneZone_Entrance_Trigger" },
    Central_Hub_Entrance_Trigger: { module: "Hub", spawn: "Main_Entrance_Trigger" }
  },
  Engineering: { Engineering_Entrance: { module: "Hub", spawn: "Engineering_Entrance_Trigger" } },
  Science: { LAB_EXIT_TRIGGER: { module: "Hub", spawn: "ScienceLab_Entrance_Trigger" } },
  MissionControl: { MissionControl_Entrance_Trigger: { module: "Hub", spawn: "MissionControl_Entrance_Trigger" } },
  Terrain: { Spwaning_Position: { module: "Airlock", spawn: "Terrain_Entrance_Trigger" } },
  Drone: { DroneZone_Entrance_Trigger: { module: "Airlock", spawn: "Drone_Section_Entrance_Trigger" } }
};

const labels: Record<ModuleName, string> = {
  Habitat: "Habitat",
  Hub: "Central Hub",
  Airlock: "Airlock",
  Engineering: "Engineering Unit",
  Science: "Research Lab",
  MissionControl: "Mission Control",
  Terrain: "Mars Terrain",
  Drone: "Drone Section"
};

const videos: Partial<Record<ModuleName, string>> = {
  Habitat: "/assets/videos/Habitat_Entrance.mp4",
  Airlock: "/assets/videos/AirLock.mp4",
  Engineering: "/assets/videos/Engineering_Entrance.mp4",
  Science: "/assets/videos/ReserachLab_Entrance.mp4",
  MissionControl: "/assets/videos/MissionControl_Entrance.mp4"
};

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(70, 1, 0.05, 2500);
  private player = new Player(this.camera);
  private audioManager: GameAudioManager;
  private clock = new THREE.Clock();
  private current?: THREE.Group;
  private loaded = new Map<ModuleName, THREE.Group>();
  private interactive: InteractionTarget[] = [];
  private colliders: THREE.Box3[] = [];
  private terrain?: THREE.Object3D;
  private droneFloorHeight?: number;
  private raycaster = new THREE.Raycaster();
  private down = new THREE.Vector3(0, -1, 0);
  private temp = new THREE.Vector3();
  private nearby?: InteractionTarget;
  private active: ModuleName = "Habitat";
  private pending?: Transition;
  private transitionVideoPath?: string;

  public missionManager = new MissionManager();
  private screenRenderer = new ScreenRenderer();
  private habitatScreenRenderer = new HabitatScreenRenderer();
  private engineeringScreenRenderer = new EngineeringScreenRenderer();
  private researchScreenRenderer = new ResearchScreenRenderer();
  private missionControlScreenRenderer = new MissionControlScreenRenderer();
  private centralHubScreenRenderer = new CentralHubScreenRenderer();
  private airlockScreenRenderer = new AirlockScreenRenderer();

  private state: GameState;
  private frame = 0;
  private disposed = false;
  private transitioning = false;
  private observer: ResizeObserver;
  private environmentTarget?: THREE.WebGLRenderTarget;
  private environmentTexture?: THREE.DataTexture;
  private hemiLight: THREE.HemisphereLight;

  // Cinematic screen camera transition state
  private astronautPreTerminalState?: {
    position: THREE.Vector3;
    rotation: THREE.Euler;
  };
  private cinematicTargetPos = new THREE.Vector3();
  private cinematicTargetQuat = new THREE.Quaternion();
  private cinematicStartPos = new THREE.Vector3();
  private cinematicStartQuat = new THREE.Quaternion();
  private cinematicProgress = 0;
  private cinematicGliding = false;

  // Day 1 Camera Presentation Manager
  private cameraPresentationManager: CameraPresentationManager;

  // Drone FPV Mode State
  private droneModeActive = false;
  private astronautStateBeforeDrone?: {
    module: ModuleName;
    position: THREE.Vector3;
    rotation: THREE.Euler;
  };
  private droneKeys = new Set<string>();
  private dronePosition = new THREE.Vector3(470.0, 15.0, -58.7);
  private droneOrigin = new THREE.Vector3(470.0, 1.02, -58.71);
  private droneYaw = 0;
  private dronePitch = -0.15;
  private droneBattery = 88;
  // Sol 5 state is isolated from the legacy later-day FPV implementation above.
  private sol5DroneActive = false;
  private sol5Flight?: DroneFlightState;
  private sol5DroneAnchor?: THREE.Object3D;
  private sol5TargetNode?: THREE.Object3D;
  private sol5TakeoffNode?: THREE.Object3D;
  private sol5CameraRig?: DroneCameraRig;
  private sol5Guidance?: Sol5GuidanceRig;
  private sol5TargetBeacon?: Sol5TargetBeacon;
  private sol5LandingBeacon?: Sol5LandingBeacon;
  private sol5BuildingColliders: THREE.Box3[] = [];
  private sol5BodyYaw = 0;
  private sol5LookYaw = 0;
  private sol5LookPitch = 0;
  private sol5EInteractionConsumed = false;
  private sol5LastSnapshotAt = 0;

  constructor(private host: HTMLDivElement, private emit: SetState) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.prepend(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x0a1015);
    const initialHemi = getModuleHemisphereConfig("Habitat");
    this.hemiLight = new THREE.HemisphereLight(initialHemi.skyColor, initialHemi.groundColor, initialHemi.intensity);
    this.scene.add(this.hemiLight);

    const mission = this.missionManager.getCurrentMission();
    const mState = this.missionManager.getState();
    const taskProgress = this.missionManager.getMissionTaskProgress();

    this.state = {
      ready: false,
      module: "Habitat",
      prompt: "",
      panel: "",
      error: "",
      fps: 0,
      transition: "",
      transitionLabel: "",
      transitionProgress: null,

      missionDay: mState.currentDay,
      missionTitle: mission.title,
      objectiveTitle: mission.primaryObjective,
      objectiveState: mState.objectiveState,
      completedStepCount: taskProgress.completed,
      totalStepCount: taskProgress.total,
      dayBriefingSeen: mState.dayBriefingSeen,
      showBriefingModal: !mState.dayBriefingSeen,
      briefingText: this.missionManager.getCurrentMissionBriefing(),
      primaryObjective: mission.primaryObjective,
      controlHint: "W A S D move · Shift jog · Space jump · E interact · Esc unlock",
      isOutdoorTerrain: false,
      showRoutePlanning: false,
      selectedRouteTargetId: mState.selectedRouteTarget?.id ?? null,
      notification: mState.notification ?? this.missionManager.getCurrentNavigationNotification(),
      navigationInstruction: this.missionManager.getCurrentNavigationInstruction(),
      restFeedback: null,
      restTransition: null,

      geologicalSurvey: mState.geologicalSurvey,
      surfaceObservation: mState.surfaceObservation,
      scienceAnalysis: mState.scienceAnalysis,
      droneSurvey: mState.droneSurvey,

      showGeologicalForm: false,
      showSurfaceObservationForm: false,
      showScienceAnalysisModal: false,
      showDroneConsoleModal: false,

      droneModeActive: false,
      droneTelemetry: { battery: 88, signal: 96, altitude: 15, x: 470, z: -58.7 },
      sol5DroneActive: false,
      sol5LandingPromptActive: false,
      sol5Telemetry: null,
      sol5Images: mState.sol5.images,
      sol5Flight: mState.sol5.flight,
      sol5Message: null,

      showCinematicOverlay: false,
      showOSDesktop: false,
      osInitialApp: undefined,
      cameraPresentation: null
    };

    this.cameraPresentationManager = new CameraPresentationManager(this.camera);
    this.audioManager = new GameAudioManager();
    this.renderer.domElement.addEventListener("pointerdown", this.unlockAudio);

    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(host);
    this.resize();
    this.bind();

    // Subscribe to mission state changes
    this.missionManager.subscribe(updated => {
      this.syncMissionStateToUI(updated);
      this.screenRenderer.renderAll(this.active, updated);
      if (this.active === "Habitat") {
        this.habitatScreenRenderer.renderAll(updated);
      } else if (this.active === "Engineering") {
        this.engineeringScreenRenderer.renderAll(updated);
      } else if (this.active === "Science") {
        this.researchScreenRenderer.renderAll(updated);
      } else if (this.active === "MissionControl") {
        this.missionControlScreenRenderer.renderAll(updated);
      } else if (this.active === "Hub") {
        this.centralHubScreenRenderer.renderAll(updated);
      } else if (this.active === "Airlock") {
        this.airlockScreenRenderer.renderAll(updated);
      }
    });

    void this.loadEnvironment();
  }

  private set(p: Partial<GameState>) {
    this.state = { ...this.state, ...p };
    this.emit(this.state);
  }

  private syncMissionStateToUI(mState: Readonly<MissionProgressState>) {
    const mission = this.missionManager.getCurrentMission();
    const taskProgress = this.missionManager.getMissionTaskProgress();
    this.set({
      missionDay: mState.currentDay,
      missionTitle: mission.title,
      objectiveTitle: mission.primaryObjective,
      objectiveState: mState.objectiveState,
      completedStepCount: taskProgress.completed,
      totalStepCount: taskProgress.total,
      dayBriefingSeen: mState.dayBriefingSeen,
      showBriefingModal: !mState.dayBriefingSeen,
      briefingText: this.missionManager.getCurrentMissionBriefing(),
      primaryObjective: mission.primaryObjective,
      selectedRouteTargetId: mState.selectedRouteTarget?.id ?? null,
      notification: mState.notification,
      navigationInstruction: this.missionManager.getCurrentNavigationInstruction(),
      geologicalSurvey: mState.geologicalSurvey,
      surfaceObservation: mState.surfaceObservation,
      scienceAnalysis: mState.scienceAnalysis,
      droneSurvey: mState.droneSurvey,
      sol5Images: mState.sol5.images,
      sol5Flight: mState.sol5.flight
    });
  }

  private async loadEnvironment() {
    try {
      const source = await new EXRLoader().loadAsync(
        "/assets/exr/mars-dunes-day-light_2K_fc2ff73b-6eed-4836-92ed-f94e0d2d649f.exr"
      );
      if (this.disposed) {
        source.dispose();
        return;
      }
      // Store source texture for sky background (equirectangular mapping)
      source.mapping = THREE.EquirectangularReflectionMapping;
      this.environmentTexture = source;

      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.environmentTarget = pmrem.fromEquirectangular(source);
      pmrem.dispose();
      this.updateEnvironment();
    } catch {
      this.set({ error: "Environment EXR could not be loaded; continuing without terrain reflections." });
    }
  }

  private updateEnvironment() {
    const hemiConfig = getModuleHemisphereConfig(this.active);
    this.hemiLight.color.setHex(hemiConfig.skyColor);
    this.hemiLight.groundColor.setHex(hemiConfig.groundColor);
    this.hemiLight.intensity = hemiConfig.intensity;

    if (this.active === "Terrain") {
      this.scene.environment = this.environmentTarget?.texture ?? null;
      this.scene.background = this.environmentTexture ?? new THREE.Color(0x101a20);
    } else {
      this.scene.environment = null;
      this.scene.background = new THREE.Color(0x0a1015);
    }
  }

  async start() {
    let initialModule: ModuleName = "Habitat";
    let initialSpawn = "HABITAT_SPAWN_POINT";
    let hideBriefing = false;

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const mod = params.get("module") as ModuleName | null;
      if (!mod && this.state.missionDay === 5 && this.missionManager.getSol5Progress().attemptStatus === "aborted") {
        initialModule = "MissionControl";
        initialSpawn = "MissionControl_Entrance_Trigger";
      }
      if (mod) {
        hideBriefing = true;
        if (mod === "Hub") {
          initialModule = "Hub";
          initialSpawn = "Habitat_Entrance_Trigger";
        } else if (mod === "MissionControl") {
          initialModule = "MissionControl";
          initialSpawn = "MissionControl_Entrance_Trigger";
        } else if (mod === "Science") {
          initialModule = "Science";
          initialSpawn = "SCIENCE_LAB_SPAWN_POINT";
        } else if (mod === "Engineering") {
          initialModule = "Engineering";
          initialSpawn = "Engineering_Entrance";
        } else if (mod === "Airlock") {
          initialModule = "Airlock";
          initialSpawn = "Central_Hub_Entrance_Trigger";
        } else if (mod === "Terrain") {
          initialModule = "Terrain";
          initialSpawn = "Spwaning_Position";
        }
      }
      if (params.get("nobriefing") === "true") {
        hideBriefing = true;
      }
    }

    if (hideBriefing) {
      this.missionManager.markBriefingSeen();
      this.set({ showBriefingModal: false, dayBriefingSeen: true });
    }

    await this.loadAndSpawn({ module: initialModule, spawn: initialSpawn });
    if (!this.disposed) {
      this.set({
        ready: true,
        module: initialModule,
        isOutdoorTerrain: initialModule === "Terrain",
        showBriefingModal: hideBriefing ? false : this.state.showBriefingModal
      });
      this.loop();
    }
  }

  lock() {
    const isModalOpen =
      this.state.panel ||
      this.transitioning ||
      this.state.showBriefingModal ||
      this.state.showRoutePlanning ||
      this.state.showGeologicalForm ||
      this.state.showSurfaceObservationForm ||
      this.state.showScienceAnalysisModal ||
      this.state.showDroneConsoleModal ||
      this.state.restFeedback ||
      this.state.showCinematicOverlay ||
      this.state.showOSDesktop;

    if (!isModalOpen) {
      void this.renderer.domElement.requestPointerLock();
    }
  }

  closePanel() {
    this.set({ panel: "" });
    this.lock();
  }

  // =========================================================================
  // SPEED TRAVEL / DEV TELEPORT SYSTEM (SEPARATE REMOVABLE FUNCTION)
  // =========================================================================
  /**
   * Activates instant speed travel to any outpost module.
   * Directly loads the model, switches scene, attaches screens, and spawns the player.
   * Can be removed when dev modifications are complete.
   */
  public async speedTravel(targetModule: ModuleName | string): Promise<boolean> {
    if (this.disposed) return false;

    // Release mouse pointer lock so user can interact with the UI
    if (typeof document !== "undefined" && document.pointerLockElement) {
      document.exitPointerLock();
    }

    // Reset controls and ongoing transitions
    this.player.keys.clear();
    this.transitioning = false;
    this.pending = undefined;

    const spawnMap: Record<string, string> = {
      Habitat: "HABITAT_SPAWN_POINT",
      Hub: "Habitat_Entrance_Trigger",
      Airlock: "Central_Hub_Entrance_Trigger",
      Engineering: "Engineering_Entrance",
      Science: "SCIENCE_LAB_SPAWN_POINT",
      MissionControl: "MissionControl_Entrance_Trigger",
      Terrain: "Spwaning_Position"
    };

    const mod = targetModule as ModuleName;
    const spawn = spawnMap[mod];
    if (!spawn) {
      console.warn(`[SpeedTravel] Unknown module "${targetModule}". Valid modules: ${Object.keys(spawnMap).join(", ")}`);
      return false;
    }

    // Close any open modals or terminals
    this.set({
      showBriefingModal: false,
      showRoutePlanning: false,
      showGeologicalForm: false,
      showSurfaceObservationForm: false,
      showScienceAnalysisModal: false,
      showDroneConsoleModal: false,
      showCinematicOverlay: false,
      showOSDesktop: false,
      droneModeActive: false,
      panel: "",
      prompt: "",
      error: "",
      transition: "loading",
      transitionLabel: labels[mod] || String(mod),
      transitionProgress: this.loaded.has(mod) ? 100 : null
    });

    try {
      await this.loadAndSpawn({ module: mod, spawn });

      this.set({
        module: labels[mod] || String(mod),
        transition: "",
        transitionProgress: null,
        transitionLabel: "",
        error: "",
        prompt: "",
        isOutdoorTerrain: mod === "Terrain",
        notification: `⚡ Speed traveled to ${labels[mod] || mod}`
      });
      return true;
    } catch (error) {
      console.error("[SpeedTravel] Failed to teleport to", mod, error);
      this.set({
        transition: "error",
        error: error instanceof Error ? error.message : `Could not speed travel to ${labels[mod] || mod}`
      });
      return false;
    }
  }

  dismissBriefing() {
    this.missionManager.markBriefingSeen();
    this.set({ showBriefingModal: false });
    this.lock();
  }

  closeRoutePlanning() {
    this.set({ showRoutePlanning: false });
    this.lock();
  }

  selectRouteTarget(targetId: string) {
    const success = this.missionManager.selectRouteTarget(targetId);
    if (success) {
      this.set({
        selectedRouteTargetId: targetId,
        showRoutePlanning: false,
        notification: "Route Plan validated and recorded to telemetry."
      });
      this.lock();
    }
  }

  dismissRestFeedback() {
    this.set({ restFeedback: null });
    this.lock();
  }

  // --- Phase 3 Interaction Controls ---

  closeGeologicalForm() {
    this.set({ showGeologicalForm: false });
    this.lock();
  }

  submitGeologicalForm(data: {
    targetId: string;
    observedCategories: {
      surfaceTexture: string;
      fragmentDistribution: string;
      terrainShape: string;
      dustCoverage: string;
      followUpInterest?: string;
    };
    summary: string;
  }) {
    const record = this.missionManager.saveGeologicalSurvey(data);
    if (record) {
      this.set({
        showGeologicalForm: false,
        notification: "Field survey registered. Preliminary GeologicalSurveyRecord saved."
      });
      this.lock();
    }
  }

  closeSurfaceObservationForm() {
    this.set({ showSurfaceObservationForm: false });
    this.lock();
  }

  submitSurfaceObservationForm(data: {
    targetId: string;
    observedCategories: {
      surfacePattern: string;
      surfaceMaterialAppearance: string;
      terrainProfile: string;
      areaOfInterest: string;
    };
    followUpQuestion: string;
    summary: string;
  }) {
    const record = this.missionManager.saveSurfaceObservation(data);
    if (record) {
      this.set({
        showSurfaceObservationForm: false,
        notification: "Surface observation logged and transmitted to Research Lab."
      });
      this.lock();
    }
  }

  closeScienceAnalysisModal() {
    this.set({ showScienceAnalysisModal: false });
    this.lock();
  }

  submitScienceAnalysis(selectedInterpretationId: string, summary: string) {
    const record = this.missionManager.saveScienceAnalysis({
      selectedInterpretationId,
      summary
    });
    if (record) {
      this.set({
        showScienceAnalysisModal: false,
        notification: "Laboratory scientific analysis confirmed and archived."
      });
      this.lock();
    }
  }

  closeDroneConsoleModal() {
    this.set({ showDroneConsoleModal: false });
    this.lock();
  }

  // --- Cinematic Screen Transition & PHOBOSIA OS Desktop ---

  openScreenOS(initialApp?: string) {
    this.cinematicGliding = false;
    // Every OS entry path must release first-person pointer lock so UI controls can receive clicks.
    if (document.pointerLockElement) document.exitPointerLock();
    this.set({
      showCinematicOverlay: false,
      showOSDesktop: true,
      osInitialApp: initialApp
    });
  }

  closeOSDesktop() {
    if (this.astronautPreTerminalState) {
      this.camera.position.copy(this.astronautPreTerminalState.position);
      this.camera.rotation.copy(this.astronautPreTerminalState.rotation);
      this.player.face(new THREE.Quaternion().setFromEuler(this.astronautPreTerminalState.rotation));
      this.player.resetVelocity();
      this.player.syncBasePosition();
      this.astronautPreTerminalState = undefined;
    }
    this.cinematicGliding = false;
    this.set({ showOSDesktop: false, showCinematicOverlay: false });
    this.lock();
  }

  confirmSol5Briefing() {
    const result = this.missionManager.confirmSol5Briefing();
    this.set({ sol5Message: result.message, notification: result.success ? result.message : this.state.notification });
  }

  async startSol5DroneSimulation() {
    if (this.sol5DroneActive || this.state.missionDay !== 5) return;
    const targetId = this.missionManager.getSelectedSiteId();
    if (!targetId) { this.set({ sol5Message: "Sol 5 is blocked: the official Sol 3 target is missing or invalid." }); return; }
    const terrainModel = await this.getModel("Terrain");
    if (this.disposed) return;
    terrainModel.updateWorldMatrix(true, true);
    const anchor = terrainModel.getObjectByName("Drone_Object");
    const takeoffRef = terrainModel.getObjectByName("Drone_TakeoffPoint");
    const target = resolveSol5Target(terrainModel, targetId, MASTER_TERRAIN_TARGETS);
    const missingTargetNodes = Object.values(SOL5_SCENE_TARGETS).filter(name => !terrainModel.getObjectByName(name));
    if (!anchor || !takeoffRef || !target || missingTargetNodes.length > 0 || !this.missionManager.getSol5Progress().briefingConfirmed) {
      this.set({ sol5Message: `Simulation unavailable: verify briefing, Drone_Object, Drone_TakeoffPoint, selected target, and all target nodes in mars_Terrain. Missing: ${missingTargetNodes.join(", ") || "none"}.` });
      return;
    }
    const previous = this.loaded.get("MissionControl");
    const mcNav = previous?.getObjectByName("MC_NAVIGATION_01");
    if (!previous || !mcNav) {
      this.set({ sol5Message: "Simulation unavailable: the existing Mission Control Navigation reference is not loaded." });
      return;
    }
    const terrainSurface = terrainModel.getObjectByName("PHOBOSIA_MarsTerrain_2km");
    const takeoff = getSol5TakeoffPosition(takeoffRef);
    const evidenceAssets = SOL5_EVIDENCE_ASSETS[targetId];
    if (!terrainSurface) { this.set({ sol5Message: "Simulation unavailable: master terrain mesh is missing." }); return; }
    if (!evidenceAssets?.length || evidenceAssets.some(asset => asset.targetId !== targetId)) {
      this.set({ sol5Message: "Simulation unavailable: verified mission-provided evidence for the official target is missing." }); return;
    }
    try {
      const responses = await Promise.all(evidenceAssets.map(asset => fetch(asset.assetPath, { method: "HEAD" })));
      if (this.disposed) return;
      if (responses.some(response => !response.ok || !response.headers.get("content-type")?.startsWith("image/"))) {
        this.set({ sol5Message: "Simulation unavailable: one or more selected-target image files are missing or unsupported. No other target's imagery will be used." }); return;
      }
    } catch {
      this.set({ sol5Message: "Simulation unavailable: selected-target image assets could not be verified." }); return;
    }
    this.raycaster.set(new THREE.Vector3(takeoff.x, 1000, takeoff.z), this.down);
    const takeoffGround = this.raycaster.intersectObject(terrainSurface, true)[0]?.point.y;
    if (!Number.isFinite(takeoffGround)) { this.set({ sol5Message: "Simulation unavailable: no terrain surface is resolved below Drone_TakeoffPoint." }); return; }
    const authorization = this.missionManager.startSol5Simulation();
    if (!authorization.success) { this.set({ sol5Message: authorization.message }); return; }
    this.astronautStateBeforeDrone = { module: "MissionControl", position: this.camera.position.clone(), rotation: this.camera.rotation.clone() };
    if (this.current) this.scene.remove(this.current);
    this.current = terrainModel;
    this.scene.add(terrainModel);
    this.active = "Terrain";
    this.updateEnvironment();
    this.configureModule(terrainModel, "Terrain");
    terrainModel.updateWorldMatrix(true, true);

    const resolvedTarget = resolveSol5Target(terrainModel, targetId, MASTER_TERRAIN_TARGETS);
    if (!resolvedTarget) { this.set({ sol5Message: "Simulation unavailable: official target scene mapping was lost during initialization." }); return; }
    this.sol5Flight = createDroneFlightState(takeoff, resolvedTarget.position);
    this.sol5Flight.maxAltitudeAglM = this.sol5Flight.position.y - takeoff.y;
    this.sol5DroneAnchor = anchor;
    this.sol5TargetNode = resolvedTarget.object;
    this.sol5TakeoffNode = takeoffRef;
    this.sol5BuildingColliders = buildTerrainBuildingColliders(terrainModel);
    const direction = resolvedTarget.position.clone().sub(takeoff);
    this.sol5BodyYaw = Math.atan2(-direction.x, -direction.z);
    this.setSol5DroneWorldPose(this.sol5Flight.position, this.sol5BodyYaw);
    this.sol5LookYaw = 0;
    this.sol5LookPitch = -0.04;
    this.sol5CameraRig = createDroneCameraRig(anchor, this.camera);
    orientDroneCameraRig(this.sol5CameraRig, this.sol5LookYaw, this.sol5LookPitch);
    this.sol5Guidance = createSol5Guidance(this.scene);
    updateSol5Guidance(this.sol5Guidance, anchor, resolvedTarget.object, takeoffRef, this.missionManager.getSol5Progress().targetInspected);
    if (this.sol5TargetBeacon) disposeSol5TargetBeacon(this.sol5TargetBeacon);
    if (this.sol5LandingBeacon) disposeSol5LandingBeacon(this.sol5LandingBeacon);
    this.sol5TargetBeacon = createSol5TargetBeacon(this.scene, resolvedTarget.object);
    setSol5TargetBeaconVisible(this.sol5TargetBeacon, !this.missionManager.getSol5Progress().targetInspected);
    this.sol5LandingBeacon = createSol5LandingBeacon(this.scene, takeoffRef);
    setSol5LandingBeaconVisible(this.sol5LandingBeacon, false);
    this.sol5DroneActive = true;
    this.audioManager.setSol5DroneActive(true);
    this.droneKeys.clear();
    this.sol5EInteractionConsumed = false;
    const ground = this.sol5GroundHeight(this.sol5Flight.position.x, this.sol5Flight.position.z);
    const agl = ground === null ? 1 : this.sol5Flight.position.y - ground;
    this.set({
      showOSDesktop: false, showCinematicOverlay: false, sol5DroneActive: true,
      sol5LandingPromptActive: false,
      sol5Message: "Sol 5 simulation active. All flight telemetry is simulated from current scene coordinates.",
      controlHint: "W/A/S/D fly · E ascend / interact · Q descend · Shift boost · Mouse look · 1–5 camera · Esc abort",
      sol5Telemetry: { targetId, targetName: target.definition.name, batteryPercent: this.sol5Flight.batteryPercent,
        signalPercent: 100, altitudeAglM: agl, speedMps: 0, distanceTravelledM: this.sol5Flight.totalDistanceM,
        distanceFromTakeoffM: 0, distanceToTargetM: takeoff.distanceTo(resolvedTarget.position), headingDegrees: (this.sol5BodyYaw * 180 / Math.PI + 360) % 360, targetBearingDegrees: (this.sol5BodyYaw * 180 / Math.PI + 360) % 360,
        elapsedSeconds: this.sol5Flight.elapsedSeconds, cameraView: "front", warning: null, boundaryStatus: "INSIDE",
        evidenceCount: this.missionManager.getSol5Progress().images.length, status: "READY" }
    });
    this.astronautStateBeforeDrone = { module: "MissionControl", position: mcNav.getWorldPosition(new THREE.Vector3()), rotation: new THREE.Euler() };
    this.missionManager.saveSol5FlightSnapshot(this.toSol5Snapshot("flying"));
    void this.renderer.domElement.requestPointerLock();
  }

  confirmSol5ImageReview() {
    const result = this.missionManager.confirmSol5ImageReview();
    this.set({ sol5Message: result.message });
  }

  setSol5Camera(view: DroneCameraView) {
    if (!this.sol5DroneActive || !this.sol5Flight) return;
    this.sol5Flight.cameraView = view;
    this.sol5LookYaw = 0;
    this.sol5LookPitch = 0;
  }

  submitSol5Report(input: { observedFeatures: string; playerInterpretation: string; uncertainties: string; groundFollowUp: string }) {
    const result = this.missionManager.submitSol5Report(input);
    this.set({ sol5Message: result.message });
  }

  private toSol5Snapshot(status: "ready" | "flying" | "landed" | "aborted") {
    const flight = this.sol5Flight!;
    const targetId = this.missionManager.getSelectedSiteId()!;
    return {
      targetId, status, takeoff: { x: flight.takeoff.x, y: flight.takeoff.y, z: flight.takeoff.z },
      position: { x: flight.position.x, y: flight.position.y, z: flight.position.z },
      elapsedSeconds: flight.elapsedSeconds, totalDistanceM: flight.totalDistanceM, maxAltitudeAglM: flight.maxAltitudeAglM, speedMps: flight.velocity.length(),
      batteryPercent: flight.batteryPercent, signalPercent: this.state.sol5Telemetry?.signalPercent ?? 100,
      cameraView: flight.cameraView, landed: flight.landed
    } as const;
  }

  private sol5GroundHeight(x: number, z: number): number | null {
    if (!this.terrain) return null;
    this.raycaster.set(new THREE.Vector3(x, 1000, z), this.down);
    const hit = this.raycaster.intersectObject(this.terrain, true)[0];
    return hit?.point.y ?? null;
  }

  private setSol5AnchorWorldPosition(position: THREE.Vector3) {
    this.setSol5DroneWorldPose(position, this.sol5BodyYaw);
  }

  private setSol5DroneWorldPose(position: THREE.Vector3, yaw: number) {
    const anchor = this.sol5DroneAnchor;
    if (!anchor) return;
    anchor.parent?.updateWorldMatrix(true, false);
    const localPosition = position.clone();
    anchor.parent?.worldToLocal(localPosition);
    anchor.position.copy(localPosition);
    const worldRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0, "YXZ"));
    const parentRotation = anchor.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
    anchor.quaternion.copy(parentRotation.invert().multiply(worldRotation));
    anchor.updateWorldMatrix(true, false);
  }

  private detachSol5Camera() {
    if (this.sol5CameraRig && this.sol5DroneAnchor) detachDroneCameraRig(this.sol5DroneAnchor, this.scene, this.sol5CameraRig, this.camera);
    this.sol5CameraRig = undefined;
    this.sol5DroneAnchor = undefined;
  }

  private cleanupSol5Guidance() {
    if (this.sol5Guidance) disposeSol5Guidance(this.sol5Guidance);
    this.sol5Guidance = undefined;
    disposeSol5TargetBeacon(this.sol5TargetBeacon);
    this.sol5TargetBeacon = undefined;
    disposeSol5LandingBeacon(this.sol5LandingBeacon);
    this.sol5LandingBeacon = undefined;
    this.sol5TargetNode = undefined;
    this.sol5TakeoffNode = undefined;
    this.sol5BuildingColliders = [];
  }

  private updateSol5Drone(dt: number) {
    const flight = this.sol5Flight;
    if (!flight || !this.sol5DroneAnchor) return;
    if (flight.landed) {
      const promptActive = this.isSol5LandingPromptValid();
      if (this.state.sol5LandingPromptActive !== promptActive) this.set({ sol5LandingPromptActive: promptActive });
      if (this.state.sol5Telemetry && this.state.sol5Telemetry.status !== "LANDED") {
        this.set({ sol5Telemetry: { ...this.state.sol5Telemetry, status: "LANDED", speedMps: 0 } });
      }
      return;
    }
    this.sol5TargetNode?.getWorldPosition(flight.target);
    if (this.sol5TakeoffNode) flight.takeoff.copy(getSol5TakeoffPosition(this.sol5TakeoffNode));
    const controls = droneControlsFromKeys(this.droneKeys, this.sol5BodyYaw);
    stepDroneFlight(flight, controls, dt, (x, z) => this.sol5GroundHeight(x, z), (from, to) => segmentHitsAnyBox(from, to, this.sol5BuildingColliders));
    this.setSol5DroneWorldPose(flight.position, this.sol5BodyYaw);
    const progress = this.missionManager.getSol5Progress();
    const landingPromptActive = this.isSol5LandingApproachReady();
    if (this.state.sol5LandingPromptActive !== landingPromptActive) this.set({ sol5LandingPromptActive: landingPromptActive });
    if (this.sol5TargetNode) updateSol5TargetBeacon(this.sol5TargetBeacon, this.sol5TargetNode, !progress.targetInspected);
    setSol5LandingBeaconVisible(this.sol5LandingBeacon, progress.targetInspected);
    if (this.sol5Guidance && this.sol5DroneAnchor && this.sol5TargetNode && this.sol5TakeoffNode) {
      updateSol5Guidance(this.sol5Guidance, this.sol5DroneAnchor, this.sol5TargetNode, this.sol5TakeoffNode, progress.targetInspected);
    }
    const telemetry = this.state.sol5Telemetry;
    if (!telemetry) return;
    const baseDistance = Math.hypot(flight.position.x - flight.takeoff.x, flight.position.z - flight.takeoff.z);
    const targetWorld = this.sol5TargetNode?.getWorldPosition(new THREE.Vector3()) ?? flight.target;
    const guidanceWorld = progress.targetInspected
      ? (this.sol5TakeoffNode?.getWorldPosition(new THREE.Vector3()) ?? flight.takeoff)
      : targetWorld;
    const targetDx = guidanceWorld.x - flight.position.x, targetDz = guidanceWorld.z - flight.position.z;
    const ground = this.sol5GroundHeight(flight.position.x, flight.position.z);
    const agl = ground === null ? 0 : flight.position.y - ground;
    if (this.sol5CameraRig) orientDroneCameraRig(this.sol5CameraRig, this.sol5LookYaw, this.sol5LookPitch);
    const warning = flight.warning ?? (agl >= 9 ? "Approaching 10 m AGL limit." : baseDistance > 1200 ? "Simulated communication link degrading with distance." : null);
    const signal = Math.max(0, Math.round(100 - Math.min(baseDistance, 1500) / 1500 * 100));
    const targetDistance = flight.position.distanceTo(targetWorld);
    if (targetDistance <= SOL5_LIMITS.targetInspectionRadiusM && this.missionManager.markSol5TargetReached(this.missionManager.getSelectedSiteId() ?? "")) {
      this.set({ sol5Message: "Selected target reached. Press E to inspect and load its prepared evidence." });
    }
    const boundaryHalf = 750;
    const atBoundary = Math.abs(flight.position.x - flight.boundaryCenter.x) > boundaryHalf - 20 || Math.abs(flight.position.z - flight.boundaryCenter.z) > boundaryHalf - 20;
    if (this.frame % 6 === 0) {
      const targetBearingDegrees = (Math.atan2(-targetDx, -targetDz) * 180 / Math.PI + 360) % 360;
      const update = { ...telemetry, batteryPercent: Math.round(flight.batteryPercent), signalPercent: signal,
        altitudeAglM: Math.round(agl * 10) / 10, speedMps: Math.round(flight.velocity.length() * 10) / 10,
        distanceTravelledM: Math.round(flight.totalDistanceM * 10) / 10, distanceFromTakeoffM: Math.round(baseDistance * 10) / 10,
        distanceToTargetM: Math.round(targetDistance * 10) / 10, headingDegrees: (this.sol5BodyYaw * 180 / Math.PI + 360) % 360, targetBearingDegrees,
        elapsedSeconds: Math.floor(flight.elapsedSeconds), cameraView: flight.cameraView,
        warning: warning ?? (signal < 20 ? "Simulated signal is critically low; return toward base." : null),
        boundaryStatus: atBoundary ? "BOUNDARY" as const : "INSIDE" as const,
        evidenceCount: this.missionManager.getSol5Progress().images.length, status: progress.targetInspected ? "RETURN TO LANDING ZONE" : "FLIGHT TO SELECTED TARGET" };
      this.set({ sol5Telemetry: update });
      if (flight.elapsedSeconds - this.sol5LastSnapshotAt >= 3) {
        this.sol5LastSnapshotAt = flight.elapsedSeconds;
        this.missionManager.saveSol5FlightSnapshot(this.toSol5Snapshot("flying"));
      }
    }
  }

  inspectSol5Target() {
    if (!this.sol5DroneActive || !this.sol5Flight || !this.sol5TargetNode) return;
    const targetId = this.missionManager.getSelectedSiteId();
    if (!targetId || this.missionManager.getSol5Progress().targetInspected) return;
    const targetPosition = this.sol5TargetNode.getWorldPosition(new THREE.Vector3());
    const inspectionDistance = this.sol5Flight.position.distanceTo(targetPosition);
    if (inspectionDistance > SOL5_LIMITS.targetInspectionRadiusM) { this.set({ sol5Message: `Inspection unavailable: move into the selected target area (${inspectionDistance.toFixed(1)} m away).` }); return; }
    if (!this.missionManager.getSol5Progress().targetReached) { this.set({ sol5Message: "Approach the selected target before inspecting it." }); return; }
    const assets = SOL5_EVIDENCE_ASSETS[targetId];
    if (!assets?.length) { this.set({ sol5Message: `Inspection unavailable: no verified evidence assets are mapped to ${targetId}.` }); return; }
    const result = this.missionManager.completeSol5TargetInspection(targetId, assets);
    if (this.missionManager.getSol5Progress().targetInspected) setSol5TargetBeaconVisible(this.sol5TargetBeacon, false);
    if (result.success) setSol5LandingBeaconVisible(this.sol5LandingBeacon, true);
    this.set({ sol5Message: result.message, sol5Images: this.missionManager.getSol5Progress().images });
  }

  requestSol5Landing(): boolean {
    if (!this.sol5Flight || !this.sol5TakeoffNode || !this.state.sol5Telemetry) return false;
    if (!isInsideSol5LandingTrigger(this.sol5Flight.position, this.sol5TakeoffNode)) {
      this.set({ sol5Message: "Landing rejected: bring the drone fully onto the designated landing pad." });
      return false;
    }
    this.sol5Flight.takeoff.copy(getSol5TakeoffPosition(this.sol5TakeoffNode));
    const ground = this.sol5GroundHeight(this.sol5Flight.position.x, this.sol5Flight.position.z);
    if (ground === null) { this.set({ sol5Message: "Landing blocked: no terrain surface is resolved beneath the drone." }); return false; }
    const result = canLand(this.sol5Flight, ground, this.missionManager.getSol5Progress().targetInspected);
    if (!result.ok) { this.set({ sol5Message: result.reason }); return false; }
    this.setSol5AnchorWorldPosition(this.sol5Flight.position);
    if (this.state.sol5Telemetry) this.set({ sol5Telemetry: { ...this.state.sol5Telemetry, status: "LANDED", speedMps: 0 } });
    const valid = this.isSol5LandingPromptValid();
    this.set({ sol5LandingPromptActive: valid, sol5Message: valid ? "Landing validated. Press L to complete the landing and return to Mission Control." : "Landing rejected: the landed position is outside the designated pad." });
    setSol5TargetBeaconVisible(this.sol5TargetBeacon, false);
    this.audioManager.setSol5DroneActive(false);
    this.droneKeys.clear();
    document.exitPointerLock();
    return valid;
  }

  private isSol5LandingApproachReady(): boolean {
    const flight = this.sol5Flight;
    const progress = this.missionManager.getSol5Progress();
    const targetId = this.missionManager.getSelectedSiteId();
    if (!this.sol5DroneActive || !flight || flight.landed || !this.sol5TakeoffNode || !targetId ||
      progress.attemptStatus !== "active" || !progress.targetInspected || !progress.evidenceLoaded || progress.images.length === 0 ||
      this.state.sol5Telemetry?.targetId !== targetId || flight.velocity.length() > SOL5_LIMITS.landingMaxSpeedMps ||
      !isInsideSol5LandingTrigger(flight.position, this.sol5TakeoffNode)) return false;
    const ground = this.sol5GroundHeight(flight.position.x, flight.position.z);
    return ground !== null && Math.max(0, flight.position.y - ground) <= SOL5_LIMITS.landingMaxAglM;
  }

  private isSol5LandingPromptValid(): boolean {
    const flight = this.sol5Flight;
    const progress = this.missionManager.getSol5Progress();
    const targetId = this.missionManager.getSelectedSiteId();
    return Boolean(this.sol5DroneActive && flight?.landed && this.sol5TakeoffNode && targetId &&
      progress.attemptStatus === "active" && progress.targetInspected && progress.evidenceLoaded && progress.images.length > 0 &&
      this.state.sol5Telemetry?.targetId === targetId && flight.velocity.length() <= SOL5_LIMITS.landingMaxSpeedMps &&
      isInsideSol5LandingTrigger(flight.position, this.sol5TakeoffNode));
  }

  private finishSol5LandingAndReturn() {
    if (!this.isSol5LandingPromptValid() || !this.sol5Flight) {
      this.set({ sol5LandingPromptActive: false, sol5Message: "Mission completion is unavailable: land on the designated pad and confirm a stable landing first." });
      return;
    }
    const saved = this.missionManager.completeSol5Landing(this.toSol5Snapshot("landed"), true);
    if (!saved.success) {
      this.set({ sol5LandingPromptActive: false, sol5Message: saved.message });
      return;
    }
    this.set({ sol5LandingPromptActive: false, sol5Message: saved.message });
    setSol5LandingBeaconVisible(this.sol5LandingBeacon, false);
    this.sol5DroneActive = false;
    this.droneKeys.clear();
    document.exitPointerLock();
    void this.returnPlayerToMissionControlNavigation("Sol 5 landing mission complete. Returned to Mission Control Navigation.");
  }

  private async returnPlayerToMissionControlNavigation(message: string) {
    this.detachSol5Camera();
    this.cleanupSol5Guidance();
    const mc = await this.getModel("MissionControl");
    if (this.disposed) return;
    const nav = mc.getObjectByName("MC_NAVIGATION_01");
    if (!nav) { this.set({ sol5DroneActive: false, sol5LandingPromptActive: false, sol5Message: "Landing succeeded, but the existing Mission Control Navigation spawn marker could not be resolved." }); return; }
    if (this.current) this.scene.remove(this.current);
    this.current = mc; this.scene.add(mc); this.active = "MissionControl";
    this.updateEnvironment(); this.player.setEyeHeight(1.65); this.configureModule(mc, "MissionControl");
    mc.updateWorldMatrix(true, true);
    const position = nav.getWorldPosition(new THREE.Vector3());
    this.camera.position.copy(position).add(new THREE.Vector3(0, this.player.eyeHeight, 0));
    const rotation = new THREE.Euler().setFromQuaternion(nav.getWorldQuaternion(new THREE.Quaternion()), "YXZ");
    this.camera.rotation.copy(rotation); this.player.face(new THREE.Quaternion().setFromEuler(rotation));
    this.player.resetVelocity(); this.player.syncBasePosition();
    this.set({ module: labels.MissionControl, isOutdoorTerrain: false, sol5DroneActive: false, sol5Flight: this.missionManager.getSol5Progress().flight,
      sol5Images: this.missionManager.getSol5Progress().images, sol5Message: message,
      sol5Telemetry: this.state.sol5Telemetry ? { ...this.state.sol5Telemetry, status: "LANDED · REVIEW REQUIRED" } : null,
      sol5LandingPromptActive: false,
      prompt: "", notification: message });
    this.lock();
  }

  abortSol5Flight() {
    if (!this.sol5DroneActive || !this.sol5Flight) return;
    this.missionManager.abortSol5SimulationAttempt();
    this.sol5DroneActive = false; this.audioManager.setSol5DroneActive(false); setSol5TargetBeaconVisible(this.sol5TargetBeacon, false); this.droneKeys.clear(); document.exitPointerLock();
    this.set({ sol5LandingPromptActive: false });
    void this.returnPlayerToMissionControlNavigation("Drone attempt aborted. Return to Mission Control to activate a new attempt from the launch pad.");
  }

  async startDroneFPV() {
    if (this.droneModeActive || this.state.missionDay !== 9) return;

    // 1. Store astronaut camera transform and module in Mission Control
    this.astronautStateBeforeDrone = {
      module: this.active,
      position: this.camera.position.clone(),
      rotation: this.camera.rotation.clone()
    };

    // 2. Prepare Terrain model
    const terrainModel = await this.getModel("Terrain");
    if (this.current) this.scene.remove(this.current);
    this.current = terrainModel;
    this.scene.add(terrainModel);
    this.active = "Terrain";
    this.updateEnvironment();
    this.configureModule(terrainModel, "Terrain");

    // Check if Drone_Object anchor exists in terrain
    const droneAnchor = terrainModel.getObjectByName("Drone_Object");
    if (droneAnchor) {
      droneAnchor.getWorldPosition(this.droneOrigin);
    } else {
      this.droneOrigin.set(470.0, 1.02, -58.71);
    }

    // Set initial drone position
    this.dronePosition.set(this.droneOrigin.x, 15.0, this.droneOrigin.z);
    this.droneYaw = 0;
    this.dronePitch = -0.15;
    this.camera.position.copy(this.dronePosition);
    this.camera.rotation.set(this.dronePitch, this.droneYaw, 0, "YXZ");

    this.droneModeActive = true;
    this.droneKeys.clear();
    this.missionManager.completeStep("D9_OBJ_02_ACTIVATE_FPV");

    this.set({
      droneModeActive: true,
      showDroneConsoleModal: false,
      isOutdoorTerrain: false, // Ensure astronaut helmet HUD is hidden during drone FPV
      prompt: "DRONE FPV ACTIVE · WASD maneuver · Space/Shift altitude · C capture survey · ESC return to base"
    });

    void this.renderer.domElement.requestPointerLock();
  }

  exitDroneFPV() {
    if (!this.droneModeActive) return;
    this.droneModeActive = false;
    this.droneKeys.clear();

    const previous = this.astronautStateBeforeDrone;
    if (previous) {
      const mcModel = this.loaded.get(previous.module);
      if (mcModel) {
        if (this.current) this.scene.remove(this.current);
        this.current = mcModel;
        this.scene.add(mcModel);
        this.active = previous.module;
        this.updateEnvironment();
        this.player.setEyeHeight(1.65);
        this.configureModule(mcModel, previous.module);

        this.camera.position.copy(previous.position);
        this.camera.rotation.copy(previous.rotation);
        this.player.face(new THREE.Quaternion().setFromEuler(previous.rotation));
        this.player.resetVelocity();
        this.player.syncBasePosition();
      }
    }

    this.missionManager.completeStep("D9_OBJ_05_EXIT_FPV");

    this.set({
      droneModeActive: false,
      module: labels[this.active],
      prompt: "",
      isOutdoorTerrain: false,
      notification: "Returned to Mission Control. Astronaut controls restored."
    });

    document.exitPointerLock();
  }

  captureDroneSurvey() {
    if (!this.droneModeActive || this.state.missionDay !== 9) return;

    const record = this.missionManager.saveDroneSurvey({
      targetId: "TARGET_GAMMA_SOUTH_ESCARPMENT",
      observedCategories: {
        viewpointTerrainShape: "Elevated vantage over dissected canyon rim and talus apron",
        visibleSurfacePattern: "Polygonal thermal contraction fissures along ridge crest",
        followUpArea: "South escarpment shadow boundary",
        routeRevisit: "Aerial corridor along north-south fault line"
      },
      summary: "Remote drone FPV aerial survey of Site Gamma canyon overlook. High-resolution imagery archived."
    });

    if (record) {
      this.set({
        notification: "Drone remote survey telemetry archived. Press ESC or click Exit to return to base."
      });
    }
  }

  private bind() {
    document.addEventListener("pointerlockchange", this.pointer);
    document.addEventListener("mousemove", this.mouse);
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    document.addEventListener("visibilitychange", this.visibility);
    window.addEventListener("pagehide", this.pageExit);
    window.addEventListener("beforeunload", this.pageExit);
    window.addEventListener("pageshow", this.pageRestore);
  }

  private pageExit = () => {
    if (!this.sol5DroneActive) return;
    this.missionManager.abortSol5SimulationAttempt(false);
    this.sol5DroneActive = false;
    this.set({ sol5LandingPromptActive: false });
    this.droneKeys.clear();
    this.audioManager.setSol5DroneActive(false);
    setSol5TargetBeaconVisible(this.sol5TargetBeacon, false);
    setSol5LandingBeaconVisible(this.sol5LandingBeacon, false);
  };

  private pageRestore = (event: PageTransitionEvent) => {
    if (event.persisted && this.active === "Terrain" && this.missionManager.getSol5Progress().attemptStatus === "aborted") {
      void this.returnPlayerToMissionControlNavigation("The previous drone attempt was aborted. Activate a new attempt from Mission Control.");
    }
  };

  private unlockAudio = () => this.audioManager.unlock();

  private resize = () => {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.sol5CameraRig) {
      for (const camera of Object.values(this.sol5CameraRig)) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
    }
    this.renderer.setSize(width, height, false);
  };

  private pointer = () => {
    if (document.pointerLockElement !== this.renderer.domElement) {
      this.player.keys.clear();
      this.droneKeys.clear();
    }
  };

  private mouse = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.renderer.domElement) return;

    const isModalOpen =
      this.state.panel ||
      this.transitioning ||
      this.state.showBriefingModal ||
      this.state.showRoutePlanning ||
      this.state.showGeologicalForm ||
      this.state.showSurfaceObservationForm ||
      this.state.showScienceAnalysisModal ||
      this.state.showDroneConsoleModal ||
      this.state.restFeedback ||
      this.state.showCinematicOverlay ||
      this.state.showOSDesktop ||
      this.cameraPresentationManager.isPresentationActive();

    if (isModalOpen) return;

    if (this.sol5DroneActive) {
      this.sol5LookYaw -= e.movementX * 0.002;
      this.sol5LookPitch = THREE.MathUtils.clamp(this.sol5LookPitch - e.movementY * 0.002, -1.35, 1.35);
    } else if (this.droneModeActive) {
      this.droneYaw -= e.movementX * 0.002;
      this.dronePitch = Math.max(-1.4, Math.min(1.4, this.dronePitch - e.movementY * 0.002));
      this.camera.rotation.set(this.dronePitch, this.droneYaw, 0, "YXZ");
    } else {
      this.player.look(e.movementX, e.movementY);
    }
  };

  private keyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | undefined;
    if (target?.matches("input,textarea,[contenteditable='true']")) return;
    this.audioManager.unlock();

    // Day 1 Camera Presentation Skip with Enter
    if (this.cameraPresentationManager.isPresentationActive() && e.code === "Enter") {
      e.preventDefault();
      this.cameraPresentationManager.skip();
      this.set({ cameraPresentation: null });
      return;
    }
    if (this.cameraPresentationManager.isPresentationActive()) return;

    if (this.state.transition === "video" && e.code === "Enter" && !e.repeat) {
      e.preventDefault();
      this.videoFinished();
      return;
    }

    if (this.transitioning) return;

    // Sol 5 owns its controls only during the isolated drone simulation.
    if (this.sol5DroneActive) {
      if (e.code === "KeyL" && !e.repeat && this.state.sol5LandingPromptActive && this.isSol5LandingApproachReady()) {
        e.preventDefault();
        if (this.requestSol5Landing()) this.finishSol5LandingAndReturn();
        return;
      }
      if (this.sol5Flight?.landed) {
        if (e.code === "KeyL" && !e.repeat && this.isSol5LandingPromptValid()) { e.preventDefault(); this.finishSol5LandingAndReturn(); }
        else if (e.code === "KeyL") e.preventDefault();
        if (e.code === "Escape" && !e.repeat) { e.preventDefault(); this.abortSol5Flight(); }
        return;
      }
      if (e.code === "KeyE" && this.sol5Flight) {
        if (e.repeat && this.sol5EInteractionConsumed) { e.preventDefault(); return; }
        if (!e.repeat) {
          this.sol5EInteractionConsumed = false;
          const progress = this.missionManager.getSol5Progress();
          const target = this.sol5TargetNode?.getWorldPosition(new THREE.Vector3()) ?? this.sol5Flight.target;
          const takeoff = this.sol5TakeoffNode?.getWorldPosition(new THREE.Vector3()) ?? this.sol5Flight.takeoff;
          const action = resolveSol5EAction(this.sol5Flight.position, target, takeoff, progress.targetInspected);
          if (action === "inspect_target") { this.sol5EInteractionConsumed = true; e.preventDefault(); this.inspectSol5Target(); return; }
          if (action === "confirm_landing") { this.sol5EInteractionConsumed = true; e.preventDefault(); return; }
          // E does not land; landing and mission completion are the explicit L-key action at the pad.
        }
      }
      const movementCodes = ["KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "KeyQ", "ShiftLeft", "ShiftRight"];
      if (movementCodes.includes(e.code)) { e.preventDefault(); this.droneKeys.add(e.code); }
      const views: Record<string, DroneCameraView> = { Digit1: "front", Digit2: "rear", Digit3: "left", Digit4: "right", Digit5: "down" };
      if (views[e.code] && this.sol5Flight) {
        e.preventDefault(); this.sol5Flight.cameraView = views[e.code]; this.sol5LookYaw = 0; this.sol5LookPitch = 0;
      }
      if (e.code === "Escape" && !e.repeat) { e.preventDefault(); this.abortSol5Flight(); }
      return;
    }

    // Legacy later-day drone FPV Input Handling
    if (this.droneModeActive) {
      if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ShiftRight"].includes(e.code)) {
        e.preventDefault();
        this.droneKeys.add(e.code);
      }
      if (e.code === "KeyC" && !e.repeat) {
        e.preventDefault();
        this.captureDroneSurvey();
      }
      if (e.code === "Escape") {
        e.preventDefault();
        this.exitDroneFPV();
      }
      return;
    }

    if (this.state.showBriefingModal) {
      if (e.code === "Enter" || e.code === "Space" || e.code === "Escape") {
        e.preventDefault();
        this.dismissBriefing();
      }
      return;
    }

    if (this.state.restFeedback) {
      if (e.code === "Escape" || e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        this.dismissRestFeedback();
      }
      return;
    }

    if (this.state.showRoutePlanning) {
      if (e.code === "Escape") {
        e.preventDefault();
        this.closeRoutePlanning();
      }
      return;
    }

    if (this.state.showGeologicalForm) {
      if (e.code === "Escape") {
        e.preventDefault();
        this.closeGeologicalForm();
      }
      return;
    }

    if (this.state.showSurfaceObservationForm) {
      if (e.code === "Escape") {
        e.preventDefault();
        this.closeSurfaceObservationForm();
      }
      return;
    }

    if (this.state.showScienceAnalysisModal) {
      if (e.code === "Escape") {
        e.preventDefault();
        this.closeScienceAnalysisModal();
      }
      return;
    }

    if (this.state.showDroneConsoleModal) {
      if (e.code === "Escape") {
        e.preventDefault();
        this.closeDroneConsoleModal();
      }
      return;
    }

    if (this.state.showOSDesktop) {
      if (e.code === "Escape") {
        e.preventDefault();
        this.closeOSDesktop();
      }
      return;
    }

    if (this.state.showCinematicOverlay) {
      return; // Block movement during transition
    }

    if (this.state.panel) {
      if (e.code === "Escape") this.closePanel();
      return;
    }

    if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ShiftRight"].includes(e.code)) {
      e.preventDefault();
      this.player.keys.add(e.code);
    }

    if ((e.code === "KeyE" || e.code === "KeyQ") && !e.repeat) {
      const key = e.code === "KeyQ" ? "Q" : "E";
      if (key === "E" || (this.nearby && ENTRANCE_INTERACTION_KEYS[this.nearby.identifier] === "Q")) {
        this.interact(key);
      }
    }
  };

  private keyUp = (e: KeyboardEvent) => {
    if (this.sol5DroneActive) {
      this.droneKeys.delete(e.code);
      if (e.code === "KeyE") this.sol5EInteractionConsumed = false;
    } else if (this.droneModeActive) {
      this.droneKeys.delete(e.code);
    } else {
      this.player.keys.delete(e.code);
    }
  };

  private visibility = () => {
    if (document.hidden) {
      this.player.keys.clear();
      this.droneKeys.clear();
      this.sol5EInteractionConsumed = false;
      this.audioManager.setIndoorMovement("idle");
    }
  };

  private sourceNames(object: THREE.Object3D) {
    return [object.name, typeof object.userData.name === "string" ? object.userData.name : ""];
  }

  private resolve<T>(table: Record<string, T>, object: THREE.Object3D): [string, T] | undefined {
    for (const [identifier, value] of Object.entries(table)) {
      if (this.sourceNames(object).some(name => name === identifier || name.startsWith(`${identifier}.`))) {
        return [identifier, value];
      }
    }
    return undefined;
  }

  private async getModel(module: ModuleName, report?: (percent: number | null) => void) {
    const cached = this.loaded.get(module);
    if (cached) {
      report?.(100);
      return cached;
    }
    const manager = new THREE.LoadingManager();
    let bytes = 0, total = 0, itemsLoaded = 0, itemsTotal = 0;
    const publish = () =>
      report?.(total > 0 ? Math.min(99, Math.floor((bytes / total) * 100)) : itemsTotal ? Math.min(99, Math.floor((itemsLoaded / itemsTotal) * 100)) : null);

    manager.onProgress = (_, loaded, count) => {
      itemsLoaded = loaded;
      itemsTotal = count;
      publish();
    };

    const loader = new GLTFLoader(manager);
    const gltf = await new Promise<Awaited<ReturnType<GLTFLoader["loadAsync"]>>>((resolve, reject) =>
      loader.load(
        assetPaths[module],
        resolve,
        event => {
          if (event.lengthComputable) {
            bytes = event.loaded;
            total = event.total;
          }
          publish();
        },
        reject
      )
    );

    this.loaded.set(module, gltf.scene);
    report?.(100);
    return gltf.scene;
  }

  private configureModule(model: THREE.Group, module: ModuleName) {
    this.interactive = [];
    this.colliders = [];
    this.terrain = undefined;
    this.droneFloorHeight = undefined;

    const previous = model.getObjectByName("Runtime interaction indicators and lighting");
    if (previous) {
      previous.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
      });
      model.remove(previous);
    }

    const additions = new THREE.Group();
    additions.name = "Runtime interaction indicators and lighting";
    model.add(additions);
    model.updateWorldMatrix(true, true);

    model.traverse(o => {
      const route = this.resolve(transitions[module], o);
      const screen = this.resolve(screenActions, o);

      if (route || screen) {
        const target = this.makeTarget(o, (route ?? screen)![0]);
        this.interactive.push(target);
        if (route || /trigger|spawn|entrance/i.test(o.name)) {
          this.addHolographicMarker(additions, target, Boolean(route));
        }
      }

      if (/collider/i.test(o.name)) {
        o.visible = false;
      }
      if (module === "Drone" && o.name === "Drone") {
        const target = this.makeTarget(o, "Drone");
        this.interactive.push(target);
      }

      if (o.name === "PHOBOSIA_MarsTerrain_2km") {
        this.terrain = o;
      }
      if (module === "Drone" && o.name === "Floor" && (o as THREE.Mesh).isMesh) {
        this.droneFloorHeight = getSurfaceHeight(o);
      }
    });

    // 1. Configure mesh castShadow and receiveShadow flags across the module hierarchy
    configureMeshShadows(model, module);

    // 2. Configure comprehensive realistic lighting and shadow system (Sun or SpotLights + ambient fill)
    configureModuleLighting(model, additions, module);

    if (module === "Habitat") {
      this.colliders = buildHabitatColliderSection(model);
    } else if (module === "Hub") {
      this.colliders = buildCentralHubColliders(model);
    } else if (module === "Science") {
      this.colliders = buildScienceLabColliders(model);
    } else if (module === "Drone") {
      this.colliders = buildDroneSectionColliders(model);
    } else if (["Engineering", "MissionControl", "Airlock"].includes(module)) {
      this.colliders = buildCustomColliderSections(model, ["Collider_Section01"]);
    } else if (module !== "Terrain") {
      this.colliders = buildInteriorColliders(
        model,
        new Set(this.interactive.map(target => target.object)),
        collisionProfiles[module]
      );
    }

    // Attach 3D screen plane rendering to actual screen meshes
    if (module === "Habitat") {
      this.habitatScreenRenderer.attachToHabitat(model, this.missionManager.getState());
    } else {
      this.habitatScreenRenderer.dispose();
    }
    if (module === "Engineering") {
      this.engineeringScreenRenderer.attachToEngineering(model, this.missionManager.getState());
    } else {
      this.engineeringScreenRenderer.dispose();
    }
    if (module === "Science") {
      this.researchScreenRenderer.attachToScience(model, this.missionManager.getState());
    } else {
      this.researchScreenRenderer.dispose();
    }
    if (module === "MissionControl") {
      this.missionControlScreenRenderer.attachToMissionControl(model, this.missionManager.getState());
    } else {
      this.missionControlScreenRenderer.dispose();
    }
    if (module === "Hub") {
      this.centralHubScreenRenderer.attachToHub(model, this.missionManager.getState());
    } else {
      this.centralHubScreenRenderer.dispose();
    }
    if (module === "Airlock") {
      this.airlockScreenRenderer.attachToAirlock(model, this.missionManager.getState());
    } else {
      this.airlockScreenRenderer.dispose();
    }
    this.screenRenderer.attachToModule(model, module, this.missionManager.getState());
  }

  private makeTarget(object: THREE.Object3D, identifier: string): InteractionTarget {
    const box = new THREE.Box3().setFromObject(object);
    const center = box.isEmpty() ? object.getWorldPosition(new THREE.Vector3()) : box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    return { object, identifier, center, range: Math.max(2.5, Math.min(4, Math.hypot(size.x, size.z) / 2 + 1)) };
  }

  private addHolographicMarker(parent: THREE.Group, target: InteractionTarget, entrance: boolean) {
    const bounds = new THREE.Box3().setFromObject(target.object);
    const size = bounds.getSize(new THREE.Vector3());
    const radius = THREE.MathUtils.clamp(Math.hypot(size.x, size.z) * 0.42, 0.34, 1.25);
    const color = entrance ? 0xe88747 : 0x55cde8;
    const ringMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const floorY = bounds.isEmpty() ? target.center.y : bounds.min.y + 0.035;
    const rings = new THREE.Group();
    rings.name = `Holographic interaction marker ${target.identifier}`;
    rings.position.set(target.center.x, floorY, target.center.z);

    const outer = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.018, 6, 48), ringMaterial);
    outer.rotation.x = Math.PI / 2;
    rings.add(outer);

    const inner = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.72, 0.009, 5, 40), ringMaterial.clone());
    (inner.material as THREE.MeshBasicMaterial).opacity = 0.42;
    inner.rotation.x = Math.PI / 2;
    rings.add(inner);

    const sweep = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.012, 5, 36, Math.PI * 0.38), ringMaterial.clone());
    sweep.rotation.x = Math.PI / 2;
    sweep.rotation.z = Math.PI * 0.28;
    rings.add(sweep);
    parent.add(rings);
  }

  private async loadAndSpawn(route: Transition) {
    const model = await this.getModel(route.module);
    if (this.disposed) return;

    if (this.current) this.scene.remove(this.current);
    this.current = model;
    this.scene.add(model);
    this.active = route.module;

    this.updateEnvironment();
    this.player.setEyeHeight(route.module === "Hub" ? 0.95 : 1.65);
    this.configureModule(model, route.module);

    const marker = model.getObjectByName(route.spawn);
    if (!marker) throw new Error(`${labels[route.module]} does not contain required object “${route.spawn}”.`);

    model.updateWorldMatrix(true, true);
    marker.getWorldPosition(this.temp);

    // Offset Science Lab spawn so player doesn't land on door partition or LAB_EXIT_TRIGGER
    if (route.spawn === "SCIENCE_LAB_SPAWN_POINT") {
      this.temp.z = 10.6; // Clear of doorframe partition and exit trigger
    }
    // Offset Hub spawn when arriving from Science Lab to avoid re-triggering entrance
    if (route.spawn === "ScienceLab_Entrance_Trigger") {
      this.temp.x += 0.5; // Nudge inward toward hub center
      this.temp.z -= 0.5;
    }
    // Offset Engineering spawn forward into the main walkway aisle
    if (route.spawn === "Engineering_Entrance") {
      this.temp.x = 0.5;
      this.temp.z = -12.0;
    }

    this.camera.position.copy(this.temp).add(new THREE.Vector3(0, this.player.eyeHeight, 0));
    this.colliders = removeSpawnOverlaps(this.colliders, this.camera.position, this.player.eyeHeight);

    const q = new THREE.Quaternion();
    marker.getWorldQuaternion(q);
    this.player.face(q);

    // Orientation corrections: face toward the room interior rather than outward doorways
    if (route.module === "Hub") {
      const centerDir = new THREE.Vector3(0, 0, 0).sub(this.camera.position).normalize();
      this.player.face(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), centerDir));
    } else if (route.module === "Engineering") {
      const forwardDir = new THREE.Vector3(0.5, 0, 5.0).normalize();
      this.player.face(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), forwardDir));
    }

    this.player.resetVelocity();

    // Check mission context event for entering module
    this.missionManager.handleContextEvent({ type: "module_entered", module: route.module });

    this.playZoneIntroduction(route.module);

    this.set({
      module: labels[route.module],
      isOutdoorTerrain: route.module === "Terrain"
    });
  }

  private playZoneIntroduction(module: ModuleName) {
    if (this.missionManager.getState().currentDay !== 1) return;
    const zoneId = MODULE_TO_ZONE_MAP[module];
    const intro = zoneId && ZONE_TO_INTRO_MAP[zoneId];
    if (!intro || this.missionManager.hasSeenIntroduction(intro.id) || this.cameraPresentationManager.isPresentationActive()) return;

    const zoneDef = DAY1_ZONES.find(zone => zone.zoneId === zoneId);
    const targetName = zoneDef?.interactionGroups[0]?.screenObjectNames[0];
    const targetMesh = targetName ? this.current?.getObjectByName(targetName) ?? null : null;
    const started = this.cameraPresentationManager.startPresentation({
      id: intro.cameraPresentationId,
      title: intro.title,
      description: intro.description,
      durationSeconds: intro.durationSeconds,
      skipKey: intro.skipKey,
      targetMesh,
      targetWorldPosition: targetMesh ? undefined : this.camera.position.clone().add(new THREE.Vector3(0, 0, -2))
    }, () => {
      this.missionManager.markIntroductionSeen(intro.id);
      this.set({ cameraPresentation: null });
    });
    if (!started) return;
    this.set({
      cameraPresentation: { active: true, title: intro.title, description: intro.description, skipPrompt: `[${intro.skipKey.toUpperCase()}] Skip` },
      prompt: ""
    });
  }

  private async beginTransition(route: Transition) {
    if (this.transitioning) return;
    this.transitioning = true;
    this.pending = route;
    this.transitionVideoPath = videos[route.module];
    this.player.keys.clear();
    document.exitPointerLock();

    this.set({
      error: "",
      prompt: "",
      transition: "loading",
      transitionLabel: labels[route.module],
      transitionProgress: this.loaded.has(route.module) ? 100 : null
    });

    try {
      const model = await this.getModel(route.module, progress => this.set({ transitionProgress: progress }));
      if (this.disposed || !this.pending) return;

      this.configureModule(model, route.module);
      this.set({ transitionProgress: 100 });

      if (this.transitionVideoPath) {
        this.set({ transition: "video" });
      } else {
        await this.finishTransition();
      }
    } catch (error) {
      this.set({
        transition: "error",
        error: `Could not prepare ${labels[route.module]}: ${error instanceof Error ? error.message : "unknown error"}`
      });
    }
  }

  transitionVideo() {
    return this.transitionVideoPath;
  }

  videoFinished() {
    if (this.state.transition === "video") void this.finishTransition();
  }

  videoFailed(message: string) {
    if (this.state.transition === "video") this.set({ transition: "error", error: message });
  }

  retryTransition() {
    if (!this.pending) return;
    this.transitioning = false;
    void this.beginTransition(this.pending);
  }

  continueWithoutVideo() {
    if (this.pending) void this.finishTransition();
  }

  private async finishTransition() {
    const route = this.pending;
    if (!route || !this.transitioning) return;

    try {
      const model = this.loaded.get(route.module);
      if (!model) throw new Error("Destination model is no longer available.");

      if (this.current) this.scene.remove(this.current);
      this.current = model;
      this.scene.add(model);
      this.active = route.module;

      this.updateEnvironment();
      this.player.setEyeHeight(route.module === "Hub" ? 0.95 : route.module === "Drone" ? 0.55 : 1.65);
      this.configureModule(model, route.module);

      const marker = model.getObjectByName(route.spawn);
      if (!marker) throw new Error(`${labels[route.module]} does not contain required object “${route.spawn}”.`);

      model.updateWorldMatrix(true, true);
      marker.getWorldPosition(this.temp);

      // Offset Science Lab spawn so player doesn't land on door partition or LAB_EXIT_TRIGGER
      if (route.spawn === "SCIENCE_LAB_SPAWN_POINT") {
        this.temp.z = 10.6;
      }
      // Offset Hub spawn when arriving from Science Lab to avoid re-triggering entrance
      if (route.spawn === "ScienceLab_Entrance_Trigger") {
        this.temp.x += 0.5;
        this.temp.z -= 0.5;
      }
      // Offset Engineering spawn forward into the main walkway aisle
      if (route.spawn === "Engineering_Entrance") {
        this.temp.x = 0.5;
        this.temp.z = -12.0;
      }

      this.camera.position.copy(this.temp).add(new THREE.Vector3(0, this.player.eyeHeight, 0));
      this.colliders = removeSpawnOverlaps(this.colliders, this.camera.position, this.player.eyeHeight);

      const q = new THREE.Quaternion();
      marker.getWorldQuaternion(q);
      this.player.face(q);

      // Orientation corrections: face toward the room interior rather than outward doorways
      if (route.module === "Hub") {
        const centerDir = new THREE.Vector3(0, 0, 0).sub(this.camera.position).normalize();
        this.player.face(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), centerDir));
      } else if (route.module === "Engineering") {
        const forwardDir = new THREE.Vector3(0.5, 0, 5.0).normalize();
        this.player.face(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), forwardDir));
      } else if (route.module === "Drone") {
        const drone = model.getObjectByName("Drone");
        if (drone) {
          const forwardDir = drone.getWorldPosition(new THREE.Vector3()).sub(this.camera.position);
          forwardDir.y = 0;
          if (forwardDir.lengthSq() > 0.001) {
            forwardDir.normalize();
            this.player.face(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), forwardDir));
          }
        }
      }

      this.player.resetVelocity();

      // Trigger module entered event
      this.missionManager.handleContextEvent({ type: "module_entered", module: route.module });
      this.playZoneIntroduction(route.module);

      this.pending = undefined;
      this.transitioning = false;
      this.set({
        module: labels[route.module],
        transition: "",
        transitionProgress: null,
        transitionLabel: "",
        error: "",
        isOutdoorTerrain: route.module === "Terrain"
      });
    } catch (error) {
      this.set({
        transition: "error",
        error: error instanceof Error ? error.message : "Could not enter destination."
      });
    }
  }

  private interact(key: "E" | "Q" = "E") {
    if (this.transitioning) return;

    if (key === "E" && this.active === "Drone") {
      const exitTarget = this.interactive.find(target => target.identifier === "DroneZone_Entrance_Trigger");
      if (exitTarget && this.camera.position.distanceTo(exitTarget.center) <= exitTarget.range + 0.5) {
        this.nearby = exitTarget;
        void this.beginTransition(transitions.Drone.DroneZone_Entrance_Trigger);
        return;
      }
    }

    // A. Check outdoor terrain survey triggers if outdoors on Terrain
    if (this.active === "Terrain") {
      const pos = this.camera.position;
      const mState = this.missionManager.getState();
      const day = mState.currentDay;

      // Day 6: Field Geological Survey Form
      if (day === 6) {
        const target = mState.selectedRouteTarget || MASTER_TERRAIN_TARGETS[0];
        const dist = Math.hypot(pos.x - target.coordinates.x, pos.z - target.coordinates.z);
        if (dist <= 60 || pos.distanceTo(new THREE.Vector3(485, 2, -78)) <= 85) {
          document.exitPointerLock();
          this.set({ showGeologicalForm: true, prompt: "" });
          return;
        }
      }

      // Day 7: Surface Observation Form
      if (day === 7) {
        const dist = pos.distanceTo(new THREE.Vector3(485.0, 2.1, -95.5));
        if (dist <= 75 || pos.distanceTo(new THREE.Vector3(485, 2, -78)) <= 85) {
          document.exitPointerLock();
          this.set({ showSurfaceObservationForm: true, prompt: "" });
          return;
        }
      }
    }

    if (!this.nearby) return;

    if (this.active === "Drone" && this.nearby.identifier === "Drone" && this.state.missionDay === 1 && key === "E") {
      const wasComplete = this.missionManager.isStepComplete("D1_DRONE_SECTION");
      const result = this.missionManager.handleContextEvent({
        type: "trigger_interacted",
        module: this.active,
        identifier: this.nearby.identifier
      });
      const completed = this.missionManager.isStepComplete("D1_DRONE_SECTION");
      this.set({
        prompt: "",
        notification: !wasComplete && completed
          ? "Task Complete: Drone Section"
          : result.feedback && completed
            ? "Drone Section inspection already recorded."
            : "The drone inspection could not be validated."
      });
      return;
    }

    if (this.active === "Drone" && this.nearby.identifier === "Drone" && this.state.missionDay === 4) {
      const saved = this.missionManager.recordPhysicalDroneInspection("Physical inspection completed in the Drone Section. Only visible presence was verified; battery, fuel, mechanical, camera, and communications readings are unavailable.");
      this.set({ prompt: "", notification: saved ? "Physical drone inspection recorded. The drone remains grounded for Sol 5." : "Drone inspection is already recorded." });
      return;
    }

    if (this.active === "Drone" && this.nearby.identifier === "Drone" && this.state.missionDay === 5) {
      const recorded = this.missionManager.recordSol5OptionalDroneInspection();
      this.set({ prompt: "", notification: recorded ? "Optional physical drone readiness inspection recorded. It does not block the mission." : "Optional inspection is unavailable." });
      return;
    }

    // 1. Entrance / Module Transition
    const route = transitions[this.active][this.nearby.identifier];
    if (route) {
      if (key !== (ENTRANCE_INTERACTION_KEYS[this.nearby.identifier] ?? "E")) return;
      void this.beginTransition(route);
      return;
    }
    if (key !== "E") return;

    // 2. Habitat Rest & Day Advance
    if (this.nearby.identifier === "HAB_REST_01") {
      document.exitPointerLock();
      if (this.state.missionDay === 1) {
        this.missionManager.completeStep("D1_HAB_REST_INTRODUCTION");
      }
      const check = this.missionManager.canRestAndAdvance();
      if (!check.canAdvance) {
        const remaining = this.missionManager.getRemainingSteps();
        const missingTasks = remaining.map(task => {
          const dayOneTask = DAY1_TASKS.find(item => item.taskId === task.stepId);
          const inferredZone = task.targetTrigger?.startsWith("HAB_") ? "Habitat" : task.targetTrigger?.startsWith("Engineering_") ? "Engineering Unit" : task.targetTrigger?.startsWith("MC_") ? "Mission Control" : task.targetTrigger?.startsWith("LAB_") ? "Research Lab" : "";
          return { title: task.label, zone: task.targetModule ?? (inferredZone || (dayOneTask ? DAY1_ZONES.find(zone => zone.zoneId === dayOneTask.zoneId)?.friendlyName ?? "" : "")) };
        });
        this.set({
          restFeedback: {
            type: "blocked",
            message: this.state.missionDay === 1
              ? `Sol 1 Incomplete: ${missingTasks.length} required ${missingTasks.length === 1 ? "task remains" : "tasks remain"} before resting. Finish them and return to the Habitat Rest Area.`
              : check.reason,
            missingTasks
          },
          prompt: ""
        });
      } else {
        this.missionManager.saveState();
        this.set({ restTransition: "out", restFeedback: { type: "success", message: "Rest cycle in progress…" }, prompt: "" });
        window.setTimeout(() => {
          if (this.disposed) return;
          const adv = this.missionManager.advanceDay();
          if (adv.success) {
            this.set({ restTransition: "in", restFeedback: { type: "success", message: adv.message }, showBriefingModal: true });
            window.setTimeout(() => { if (!this.disposed) this.set({ restTransition: null }); }, 950);
          } else {
            this.set({ restTransition: "in", restFeedback: { type: "blocked", message: adv.message } });
            window.setTimeout(() => { if (!this.disposed) this.set({ restTransition: null }); }, 950);
          }
        }, 1100);
      }
      return;
    }

    // 2B. Day 1 Screen / Group Inspection & Horizontal Camera Presentation
    if (this.state.missionDay === 1) {
      const group = TRIGGER_TO_GROUP_MAP[this.nearby.identifier];
      if (group) {
        const triggerId = this.nearby.identifier;
        if (group.taskId) this.missionManager.completeStep(group.taskId);
        let targetMesh: THREE.Object3D | null = null;
        if (this.current) {
          for (const sName of group.screenObjectNames) {
            const found = this.current.getObjectByName(sName);
            if (found) {
              targetMesh = found;
              break;
            }
          }
        }

        const started = this.cameraPresentationManager.startPresentation(
          {
            id: group.cameraPresentationId,
            title: group.friendlyName,
            description: group.description,
            durationSeconds: group.cameraDurationSeconds,
            skipKey: "Enter",
            targetMesh: targetMesh,
            targetWorldPosition: this.nearby.center
          },
          () => {
            this.set({ cameraPresentation: null });
            if (!this.disposed && screenActions[triggerId]) {
              this.openScreenOS(`trigger:${triggerId}`);
            }
          }
        );

        if (started) {
          this.set({
            prompt: "",
            notification: group.required ? `Task Complete: ${group.friendlyName}` : `Inspection Complete: ${group.friendlyName}`,
            cameraPresentation: {
              active: true,
              title: group.friendlyName,
              description: group.description,
              skipPrompt: "[ENTER] Skip"
            }
          });
          return;
        }
      }
    }

    // 3. Mission Control Day 5 Route Planning & Day 6 Target Review & Day 9 Drone Console
    if (this.active === "MissionControl") {
      if (this.state.missionDay === 6 && (this.nearby.identifier === "MC_NAVIGATION_01" || this.nearby.identifier === "MC_MAIN_01")) {
        document.exitPointerLock();
        this.missionManager.completeStep("D6_OBJ_01_REVIEW_TARGET");
        const target = this.missionManager.getState().selectedRouteTarget || MASTER_TERRAIN_TARGETS[0];
        this.set({
          panel: "Survey Target Profile",
          notification: `Target Reviewed: ${target.name} (${target.distanceEstimate}). Proceed through Airlock to Martian terrain.`
        });
        return;
      }

      if (
        this.state.missionDay === 9 &&
        (this.nearby.identifier === "MC_SYSTEMS_01" ||
          this.nearby.identifier === "MC_NAVIGATION_01" ||
          this.nearby.identifier === "MC_MAIN_01" ||
          /Drone/i.test(this.nearby.identifier))
      ) {
        document.exitPointerLock();
        this.missionManager.completeStep("D9_OBJ_01_REVIEW_DRONE_TASK");
        this.set({
          showDroneConsoleModal: true,
          prompt: ""
        });
        return;
      }
    }

    // 4. Sol 8 Research Lab analysis sequence. Sol 3 uses the same physical
    // analysis trigger for its dataset investigation through TriggerOperatingSystem.
    if (
      this.state.missionDay === 8 &&
      this.active === "Science" &&
      (this.nearby.identifier === "LAB_RESEARCH_ANALYSIS_01" || this.nearby.identifier === "LAB_RESEARCH_MONITORING_01")
    ) {
      document.exitPointerLock();
      const mState = this.missionManager.getState();
      if (!mState.surfaceObservation) {
        this.set({
          restFeedback: {
            type: "blocked",
            message: "Prerequisite Incomplete: No saved Day 7 surface observation found. Complete Sol 07 outdoor scan before analysing in the Research Lab."
          },
          prompt: ""
        });
        return;
      }
      this.missionManager.completeStep("D8_OBJ_01_OPEN_SOURCE_RECORD");
      this.missionManager.completeStep("D8_OBJ_02_REVIEW_COMPARISON");
      this.set({
        showScienceAnalysisModal: true,
        prompt: ""
      });
      return;
    }

    // 5. Mission Contextual Interaction (Days 1–4)
    const contextResult = this.missionManager.handleContextEvent({
      type: "trigger_interacted",
      module: this.active,
      identifier: this.nearby.identifier
    });

    // 6. Screen Actions / Cinematic Transition to PHOBOSIA OS Desktop
    const title = screenActions[this.nearby.identifier];
    if (title) {
      document.exitPointerLock();

      const id = this.nearby.identifier;
      const targetApp = `trigger:${id}`;

      this.astronautPreTerminalState = {
        position: this.camera.position.clone(),
        rotation: this.camera.rotation.clone()
      };
      this.cinematicStartPos.copy(this.camera.position);
      this.cinematicStartQuat.copy(this.camera.quaternion);

      const screenCenter = this.nearby.center.clone();
      const dir = this.camera.position.clone().sub(screenCenter);
      dir.y = 0;
      if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
      dir.normalize();
      this.cinematicTargetPos.copy(screenCenter).addScaledVector(dir, 0.75);

      const lookMat = new THREE.Matrix4().lookAt(this.cinematicTargetPos, screenCenter, new THREE.Vector3(0, 1, 0));
      this.cinematicTargetQuat.setFromRotationMatrix(lookMat);

      this.cinematicProgress = 0;
      this.cinematicGliding = true;

      this.set({
        prompt: "",
        notification: contextResult.feedback ?? null,
        showCinematicOverlay: true
      });

      setTimeout(() => {
        if (!this.disposed && this.state.showCinematicOverlay) {
          this.openScreenOS(targetApp);
        }
      }, 550);
      return;
    }
  }

  private checkTerrainMissionZones() {
    if (this.active !== "Terrain") return;

    const pos = this.camera.position;
    const mState = this.missionManager.getState();
    const day = mState.currentDay;

    // Day 6: Field Geological Survey
    if (day === 6) {
      const target = mState.selectedRouteTarget || MASTER_TERRAIN_TARGETS[0];
      const dist = Math.hypot(pos.x - target.coordinates.x, pos.z - target.coordinates.z);
      if (dist <= 60 || pos.distanceTo(new THREE.Vector3(485, 2, -78)) <= 85) {
        this.missionManager.completeStep("D6_OBJ_02_REACH_TARGET");
        if (!this.state.geologicalSurvey) {
          this.set({ prompt: "Press E to Conduct Geological Field Survey" });
        }
      }
    }

    // Day 7: Surface Observation Scan
    if (day === 7) {
      const dist = pos.distanceTo(new THREE.Vector3(485.0, 2.1, -95.5));
      if (dist <= 75 || pos.distanceTo(new THREE.Vector3(485, 2, -78)) <= 85) {
        this.missionManager.completeStep("D7_OBJ_02_USE_AIRLOCK");
        if (!this.state.surfaceObservation) {
          this.set({ prompt: "Press E to Perform Surface Observation Scan" });
        }
      }
    }
  }

  private findNearby() {
    const at = this.camera.position;
    let best: InteractionTarget | undefined;
    let nearest = Infinity;

    for (const target of this.interactive) {
      const distance = at.distanceTo(target.center);
      if (distance <= target.range && distance < nearest) {
        nearest = distance;
        best = target;
      }
    }

    // The three Airlock portal meshes are authored close together. Resolve an
    // aimed-at portal before falling back to nearest-center proximity so the
    // Drone Section entrance remains selectable beside the Hub/Terrain exits.
    if (this.active === "Airlock") {
      const routeTargets = this.interactive.filter(target =>
        Boolean(transitions.Airlock[target.identifier]) && at.distanceTo(target.center) <= target.range
      );
      if (routeTargets.length > 1) {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const intersections = raycaster.intersectObjects(routeTargets.map(target => target.object), true);
        for (const hit of intersections) {
          const aimedTarget = routeTargets.find(target => {
            let object: THREE.Object3D | null = hit.object;
            while (object) {
              if (object === target.object) return true;
              object = object.parent;
            }
            return false;
          });
          if (aimedTarget) {
            best = aimedTarget;
            break;
          }
        }
      }
    }

    // Prefer the authored return portal when the player is standing on it,
    // even if the Drone interaction is also within proximity range.
    if (this.active === "Drone") {
      const exitTarget = this.interactive.find(target => target.identifier === "DroneZone_Entrance_Trigger");
      if (exitTarget && at.distanceTo(exitTarget.center) <= exitTarget.range + 0.5) {
        best = exitTarget;
      }
    }

    this.nearby = best;
    if (!best) {
      // Don't clear prompt if on terrain and inside survey zone
      if (this.active !== "Terrain" || (this.state.missionDay !== 6 && this.state.missionDay !== 7)) {
        this.set({ prompt: "" });
      }
      return;
    }

    const route = transitions[this.active][best.identifier];
    if (route) {
      const key = ENTRANCE_INTERACTION_KEYS[best.identifier] ?? "E";
      this.set({ prompt: `[${key}] TRAVEL TO ${labels[route.module].toUpperCase()}` });
    } else if (best.identifier === "HAB_REST_01") {
      this.set({ prompt: `[E] REST · CREW REST AREA` });
    } else if (this.active === "Drone" && best.identifier === "Drone") {
      this.set({ prompt: "[E] INSPECT · EXISTING DRONE" });
    } else if (best.identifier === "MC_NAVIGATION_01" || (this.active === "MissionControl" && best.identifier === "MC_MAIN_01")) {
      if (this.state.missionDay === 5) {
        this.set({ prompt: "[E] ACCESS · SOL 5 DRONE OPERATIONS" });
      } else if (this.state.missionDay === 6) {
        this.set({ prompt: "Press E to Review Geological Survey Target" });
      } else if (this.state.missionDay === 9) {
        this.set({ prompt: "Press E to Access Remote Drone Survey Console" });
      } else {
        const group = TRIGGER_TO_GROUP_MAP[best.identifier];
        const title = group ? group.friendlyName : "Terrain & Reconnaissance Systems";
        this.set({ prompt: `[E] INSPECT · ${title.toUpperCase()}` });
      }
    } else if (
      this.active === "Science" &&
      (best.identifier === "LAB_RESEARCH_ANALYSIS_01" || best.identifier === "LAB_RESEARCH_MONITORING_01")
    ) {
      if (this.state.missionDay === 8) {
        this.set({ prompt: "Press E to Access Scientific Analysis Console" });
      } else {
        const group = TRIGGER_TO_GROUP_MAP[best.identifier];
        const title = group ? group.friendlyName : "Research Analysis Display";
        this.set({ prompt: `[E] INSPECT · ${title.toUpperCase()}` });
      }
    } else if (this.active === "MissionControl" && best.identifier === "MC_SYSTEMS_01") {
      if (this.state.missionDay === 9) {
        this.set({ prompt: "Press E to Access Remote Drone Survey Console" });
      } else {
        const group = TRIGGER_TO_GROUP_MAP[best.identifier];
        const title = group ? group.friendlyName : "Communications & Systems";
        this.set({ prompt: `[E] INSPECT · ${title.toUpperCase()}` });
      }
    } else {
      const group = TRIGGER_TO_GROUP_MAP[best.identifier];
      const title = group ? group.friendlyName : (screenActions[best.identifier] || "Terminal Display");
      this.set({ prompt: `[E] INSPECT · ${title.toUpperCase()}` });
    }
  }

  private canOccupy = (position: THREE.Vector3) =>
    !this.colliders.some(box =>
      box.containsPoint(new THREE.Vector3(position.x, Math.max(position.y - 1, box.min.y + 0.1), position.z))
    );

  private groundHeight = (position: THREE.Vector3) => {
    if (this.active === "Drone" && this.droneFloorHeight !== undefined) {
      return this.droneFloorHeight;
    }
    if (!this.terrain) return 0;
    this.raycaster.set(new THREE.Vector3(position.x, 1000, position.z), this.down);
    const hit = this.raycaster.intersectObject(this.terrain, true)[0];
    return hit?.point.y ?? 0;
  };

  private updateDrone(dt: number) {
    const forward = new THREE.Vector3(-Math.sin(this.droneYaw), 0, -Math.cos(this.droneYaw));
    const right = new THREE.Vector3(Math.cos(this.droneYaw), 0, -Math.sin(this.droneYaw));
    const up = new THREE.Vector3(0, 1, 0);

    const move = new THREE.Vector3();
    if (this.droneKeys.has("KeyW")) move.add(forward);
    if (this.droneKeys.has("KeyS")) move.sub(forward);
    if (this.droneKeys.has("KeyD")) move.add(right);
    if (this.droneKeys.has("KeyA")) move.sub(right);
    if (this.droneKeys.has("Space")) move.add(up);
    if (this.droneKeys.has("ShiftLeft") || this.droneKeys.has("ShiftRight")) move.sub(up);

    if (move.lengthSq() > 0) {
      move.normalize();
    }

    const droneSpeed = 16.0; // m/s
    this.dronePosition.addScaledVector(move, droneSpeed * dt);

    // Altitude constraint: 2.5m to 50.0m
    this.dronePosition.y = Math.max(2.5, Math.min(50.0, this.dronePosition.y));

    // Bounded radius constraint: 250m from drone base origin
    const horizontalDist = Math.hypot(
      this.dronePosition.x - this.droneOrigin.x,
      this.dronePosition.z - this.droneOrigin.z
    );
    if (horizontalDist > 250) {
      const angle = Math.atan2(
        this.dronePosition.z - this.droneOrigin.z,
        this.dronePosition.x - this.droneOrigin.x
      );
      this.dronePosition.x = this.droneOrigin.x + Math.cos(angle) * 250;
      this.dronePosition.z = this.droneOrigin.z + Math.sin(angle) * 250;
    }

    this.camera.position.copy(this.dronePosition);
    this.camera.rotation.set(this.dronePitch, this.droneYaw, 0, "YXZ");

    const signalPercent = Math.max(50, Math.round(100 - (horizontalDist / 250) * 45));
    if (this.frame % 15 === 0) {
      this.set({
        droneTelemetry: {
          battery: this.droneBattery,
          signal: signalPercent,
          altitude: Math.round(this.dronePosition.y * 10) / 10,
          x: Math.round(this.dronePosition.x * 10) / 10,
          z: Math.round(this.dronePosition.z * 10) / 10
        }
      });
    }
  }

  private loop = () => {
    if (this.disposed) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.cameraPresentationManager.isPresentationActive()) {
      this.cameraPresentationManager.update(dt);
    } else if (this.cinematicGliding) {
      this.cinematicProgress = Math.min(1, this.cinematicProgress + dt * 2.0);
      const t = 0.5 - 0.5 * Math.cos(Math.PI * this.cinematicProgress);
      this.camera.position.lerpVectors(this.cinematicStartPos, this.cinematicTargetPos, t);
      this.camera.quaternion.slerpQuaternions(this.cinematicStartQuat, this.cinematicTargetQuat, t);
      if (this.cinematicProgress >= 1) {
        this.cinematicGliding = false;
      }
    }

    if (this.sol5DroneActive) {
      this.updateSol5Drone(dt);
      this.audioManager.setIndoorMovement("idle");
    } else if (this.droneModeActive) {
      this.updateDrone(dt);
      this.audioManager.setIndoorMovement("idle");
    } else {
      const isModalOpen =
        document.hidden ||
        this.state.panel ||
        this.transitioning ||
        this.state.showBriefingModal ||
        this.state.showRoutePlanning ||
        this.state.showGeologicalForm ||
        this.state.showSurfaceObservationForm ||
        this.state.showScienceAnalysisModal ||
        this.state.showDroneConsoleModal ||
        this.state.restFeedback ||
        this.state.showCinematicOverlay ||
        this.state.showOSDesktop ||
        this.cameraPresentationManager.isPresentationActive();

      if (!isModalOpen) {
        this.player.update(dt, this.canOccupy, this.groundHeight);
        this.findNearby();
        this.checkTerrainMissionZones();
        this.audioManager.setIndoorMovement(resolveIndoorMovementAudioState({
          indoor: this.active !== "Terrain",
          playerControlled: !this.droneModeActive && !this.sol5DroneActive && !this.cinematicGliding,
          grounded: this.player.grounded,
          horizontalSpeed: Math.hypot(this.player.velocity.x, this.player.velocity.z),
          running: this.player.keys.has("ShiftLeft") || this.player.keys.has("ShiftRight")
        }));
      } else {
        this.audioManager.setIndoorMovement("idle");
      }
    }
    this.audioManager.update(dt);

    const renderCamera = this.sol5DroneActive && this.sol5Flight && this.sol5CameraRig
      ? this.sol5CameraRig[this.sol5Flight.cameraView]
      : this.camera;
    this.renderer.render(this.scene, renderCamera);

    if (++this.frame % 30 === 0) {
      this.set({ fps: Math.round(1 / Math.max(dt, 0.001)) });
    }
  };

  dispose() {
    if (this.sol5DroneActive) this.missionManager.abortSol5SimulationAttempt(false);
    this.sol5DroneActive = false;
    this.disposed = true;
    this.audioManager.dispose();
    this.renderer.domElement.removeEventListener("pointerdown", this.unlockAudio);
    this.detachSol5Camera();
    this.cleanupSol5Guidance();
    this.observer.disconnect();
    document.removeEventListener("pointerlockchange", this.pointer);
    document.removeEventListener("mousemove", this.mouse);
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    document.removeEventListener("visibilitychange", this.visibility);
    window.removeEventListener("pagehide", this.pageExit);
    window.removeEventListener("beforeunload", this.pageExit);
    window.removeEventListener("pageshow", this.pageRestore);

    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }

    this.habitatScreenRenderer.dispose();
    this.engineeringScreenRenderer.dispose();
    this.researchScreenRenderer.dispose();
    this.missionControlScreenRenderer.dispose();
    this.centralHubScreenRenderer.dispose();
    this.airlockScreenRenderer.dispose();
    this.screenRenderer.dispose();
    this.scene.environment = null;
    this.environmentTarget?.dispose();
    this.environmentTexture?.dispose();

    this.loaded.forEach(root =>
      root.traverse(o => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        for (const item of material ? (Array.isArray(material) ? material : [material]) : []) {
          item.dispose();
        }
      })
    );

    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
