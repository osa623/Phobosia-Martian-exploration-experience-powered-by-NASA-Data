import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { assetPaths, screenActions } from "./Discovery";
import { Player } from "./Player";
import type { GameState, SetState } from "./EventBus";
import { buildCentralHubColliders, buildScienceLabColliders, buildCustomColliderSections, buildHabitatColliderSection, buildInteriorColliders, removeSpawnOverlaps } from "./Collision";
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
import { ScreenRenderer } from "./ScreenRenderer";
import { HabitatScreenRenderer } from "./HabitatScreenRenderer";
import { EngineeringScreenRenderer } from "./EngineeringScreenRenderer";
import { ResearchScreenRenderer } from "./ResearchScreenRenderer";
import { MissionControlScreenRenderer } from "./MissionControlScreenRenderer";
import { CentralHubScreenRenderer } from "./CentralHubScreenRenderer";
import { AirlockScreenRenderer } from "./AirlockScreenRenderer";
import { CameraPresentationManager } from "./CameraPresentation";
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
    Central_Hub_Entrance_Trigger: { module: "Hub", spawn: "Main_Entrance_Trigger" }
  },
  Engineering: { Engineering_Entrance: { module: "Hub", spawn: "Engineering_Entrance_Trigger" } },
  Science: { LAB_EXIT_TRIGGER: { module: "Hub", spawn: "ScienceLab_Entrance_Trigger" } },
  MissionControl: { MissionControl_Entrance_Trigger: { module: "Hub", spawn: "MissionControl_Entrance_Trigger" } },
  Terrain: { Spwaning_Position: { module: "Airlock", spawn: "Terrain_Entrance_Trigger" } }
};

const labels: Record<ModuleName, string> = {
  Habitat: "Habitat",
  Hub: "Central Hub",
  Airlock: "Airlock",
  Engineering: "Engineering Unit",
  Science: "Research Lab",
  MissionControl: "Mission Control",
  Terrain: "Mars Terrain"
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
  private clock = new THREE.Clock();
  private current?: THREE.Group;
  private loaded = new Map<ModuleName, THREE.Group>();
  private interactive: InteractionTarget[] = [];
  private colliders: THREE.Box3[] = [];
  private terrain?: THREE.Object3D;
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
    const day1RequiredTasks = mState.currentDay === 1 ? DAY1_TASKS.filter(task => task.required) : null;

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
      completedStepCount: day1RequiredTasks
        ? day1RequiredTasks.filter(task => mState.completedStepIds.includes(task.taskId)).length
        : mState.completedStepIds.length,
      totalStepCount: day1RequiredTasks?.length ?? mission.steps.length,
      dayBriefingSeen: mState.dayBriefingSeen,
      showBriefingModal: !mState.dayBriefingSeen,
      briefingText: mission.briefing,
      primaryObjective: mission.primaryObjective,
      controlHint: "W A S D move · Shift jog · Space jump · E interact · Esc unlock",
      isOutdoorTerrain: false,
      showRoutePlanning: false,
      selectedRouteTargetId: mState.selectedRouteTarget?.id ?? null,
      notification: mState.notification,
      restFeedback: null,

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

      showCinematicOverlay: false,
      showOSDesktop: false,
      osInitialApp: undefined,
      cameraPresentation: null
    };

    this.cameraPresentationManager = new CameraPresentationManager(this.camera);

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
    const day1RequiredTasks = mState.currentDay === 1 ? DAY1_TASKS.filter(task => task.required) : null;
    this.set({
      missionDay: mState.currentDay,
      missionTitle: mission.title,
      objectiveTitle: mission.primaryObjective,
      objectiveState: mState.objectiveState,
      completedStepCount: day1RequiredTasks
        ? day1RequiredTasks.filter(task => mState.completedStepIds.includes(task.taskId)).length
        : mState.completedStepIds.length,
      totalStepCount: day1RequiredTasks?.length ?? mission.steps.length,
      dayBriefingSeen: mState.dayBriefingSeen,
      showBriefingModal: !mState.dayBriefingSeen,
      briefingText: mission.briefing,
      primaryObjective: mission.primaryObjective,
      selectedRouteTargetId: mState.selectedRouteTarget?.id ?? null,
      notification: mState.notification,
      geologicalSurvey: mState.geologicalSurvey,
      surfaceObservation: mState.surfaceObservation,
      scienceAnalysis: mState.scienceAnalysis,
      droneSurvey: mState.droneSurvey
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
  }

  private resize = () => {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
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

    if (this.droneModeActive) {
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

    // Drone FPV Input Handling
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
    if (this.droneModeActive) {
      this.droneKeys.delete(e.code);
    } else {
      this.player.keys.delete(e.code);
    }
  };

  private visibility = () => {
    if (document.hidden) {
      this.player.keys.clear();
      this.droneKeys.clear();
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

      if (o.name === "PHOBOSIA_MarsTerrain_2km") {
        this.terrain = o;
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
      this.player.setEyeHeight(route.module === "Hub" ? 0.95 : 1.65);
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
        const remaining = this.state.missionDay === 1
          ? DAY1_TASKS.filter(task => task.required && !this.missionManager.isStepComplete(task.taskId))
          : [];
        const missingTasks = remaining.map(task => ({
          title: task.title,
          zone: DAY1_ZONES.find(zone => zone.zoneId === task.zoneId)?.friendlyName ?? ""
        }));
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
        const adv = this.missionManager.advanceDay();
        if (adv.success) {
          this.set({
            restFeedback: { type: "success", message: adv.message },
            prompt: "",
            showBriefingModal: true
          });
        }
      }
      return;
    }

    // 2B. Day 1 Screen / Group Inspection & Horizontal Camera Presentation
    if (this.state.missionDay === 1) {
      const group = TRIGGER_TO_GROUP_MAP[this.nearby.identifier];
      if (group) {
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
      if (this.state.missionDay === 5 && (this.nearby.identifier === "MC_NAVIGATION_01" || this.nearby.identifier === "MC_MAIN_01")) {
        document.exitPointerLock();
        this.missionManager.completeStep("DAY5_REVIEW_MASTER_TERRAIN");
        this.set({
          showRoutePlanning: true,
          prompt: ""
        });
        return;
      }

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

    // 4. Research Lab Day 8 Analysis Interaction
    if (
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
      let targetApp = "overview";
      const sol2InvestigationApps: Record<string, string> = {
        HAB_MONITOR_01: "SOL02_HABITAT_STATUS", HAB_WATER_NUTRITION_01: "SOL02_WATER_NUTRITION",
        Engineering_Monitoring_Trigger: "SOL02_ENGINEERING_MONITORING", Engineering_PowerUnit_Trigger: "SOL02_POWER_REVIEW",
        Engineering_LifeSupport_Trigger: "SOL02_ENGINEERING_LIFESUPPORT", Engineering_Diagnostics_Trigger: "SOL02_DIAGNOSTICS"
      };
      const sol3InvestigationApps: Record<string, string> = {
        MC_MAIN_01: "SOL03_MISSION_CONTEXT", MC_NAVIGATION_01: "SOL03_OBSERVATION_SITE_REVIEW",
        MC_SYSTEMS_01: "SOL03_SYSTEM_CONSTRAINTS", LAB_RESEARCH_ANALYSIS_01: "SOL03_SELECT_DATASET"
      };
      if (this.state.missionDay === 2 && sol2InvestigationApps[id]) targetApp = `investigation:${sol2InvestigationApps[id]}`;
      if (this.state.missionDay === 3 && sol3InvestigationApps[id]) targetApp = `investigation:${sol3InvestigationApps[id]}`;
      if (/Habitat/i.test(id)) targetApp = "habitat";
      else if (/Power|LifeSupportUnit|Monitoring|Diagnostics/i.test(id)) targetApp = "engineering";
      else if (/Science|Research|Lab|Seed|Water/i.test(id)) targetApp = "science";
      else if (/Navigation|TerrainMap|Sites/i.test(id)) targetApp = "navigation";
      else if (/Drone/i.test(id)) targetApp = "drone";
      else if (/Comms|Communications/i.test(id)) targetApp = "comms";
      else if (/Timeline|Log|Objectives/i.test(id)) targetApp = "timeline";

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
    } else if (best.identifier === "MC_NAVIGATION_01" || (this.active === "MissionControl" && best.identifier === "MC_MAIN_01")) {
      if (this.state.missionDay === 5) {
        this.set({ prompt: "Press E to Access Terrain Survey Planning" });
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

    if (this.droneModeActive) {
      this.updateDrone(dt);
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
      }
    }

    this.renderer.render(this.scene, this.camera);

    if (++this.frame % 30 === 0) {
      this.set({ fps: Math.round(1 / Math.max(dt, 0.001)) });
    }
  };

  dispose() {
    this.disposed = true;
    this.observer.disconnect();
    document.removeEventListener("pointerlockchange", this.pointer);
    document.removeEventListener("mousemove", this.mouse);
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    document.removeEventListener("visibilitychange", this.visibility);

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
