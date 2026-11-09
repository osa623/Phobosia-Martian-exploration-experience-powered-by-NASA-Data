import * as THREE from "three";
import { assetPaths, screenActions } from "./Discovery";
import { clonePreparedModel, getPreparedEXR, isPreparedAsset } from "./AssetLoading";
import { Player } from "./Player";
import type { GameState, SetState } from "./EventBus";
import { buildCentralHubColliders, buildCentralHubOrientedColliders, orientedBoxContainsPoint, type OrientedBoxCollider, buildCentralHubCylinderColliders, verticalCylinderContainsPoint, type VerticalCylinderCollider, buildScienceLabColliders, buildCustomColliderSections, buildHabitatColliderSection, buildDroneSectionColliders, buildTerrainBuildingColliders, buildNamedSceneColliders, segmentHitsAnyBox, getSurfaceHeight, buildInteriorColliders, removeSpawnOverlaps } from "./Collision";
import { collisionProfiles } from "./CollisionProfiles";
import { configureModuleLighting, configureMeshShadows, getModuleHemisphereConfig } from "./ModuleLighting";
import { advanceNighttimeGameplayClock, createMasterTerrainLightClusters, DAYTIME_EXR_URL, isMasterTerrainNighttimeEligible, NIGHTTIME_DURATION_SECONDS, NIGHTTIME_EXR_URL, NIGHTTIME_SKY_ROTATION_RADIANS_PER_SECOND, setTerrainNightLightsEnabled, type TerrainLightClusters } from "./MasterTerrainEnvironment";
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
import { LaptopScreenRenderer } from "@/jsons/Screens/Laptop_Screen/LaptopScreenRenderer";
import { LaptopPositionalAudio } from "@/systems/personal-laptop/LaptopPositionalAudio";
import type { LaptopAudioController } from "@/systems/personal-laptop/LaptopAudioController";
import { CameraPresentationManager } from "./CameraPresentation";
import { GameAudioManager, resolveIndoorMovementAudioState } from "./GameAudioManager";
import { DEFAULT_MOVEMENT_CONFIG, EVA_MOVEMENT_CONFIG } from "./MovementConfig";
import { EVA_PREPARATION_TRIGGER_ID, getEVAAccessBlockReason, isWithinEVAInteractionRange } from "./EVAAccess";
import { EVAResources, type EVAResourceStorage } from "./EVAResources";
import { RoverSystem } from "../systems/rover/RoverSystem";
import { Sol07StormController } from "../missions/sol-07/Sol07StormController";
import { Sol08PowerEffects } from "../missions/sol-08/Sol08PowerEffects";
import { SOL10_TRIGGER_CHECKS } from "../missions/sol-10/taskDefinitions";
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

function getEVAStorage(): EVAResourceStorage | undefined {
  try { return typeof window !== "undefined" ? window.localStorage : undefined; }
  catch { return undefined; }
}

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

const terrainMissionTriggerIds = new Set([
  "PowerUnit_A",
  "PowerUnit_B",
  "PowerUnit_AB_Main",
  "Commuication_fix_Trigger"
]);

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

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(70, 1, 0.05, 2500);
  private transitionScene = new THREE.Scene();
  private transitionCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 20);
  private transitionPlanet: THREE.Mesh;
  private transitionPlanetMaterial: THREE.ShaderMaterial;
  private transitionPlanetElapsed = 0;
  private transitionPointer = new THREE.Vector2();
  private transitionPointerTarget = new THREE.Vector2();
  private player = new Player(this.camera);
  private audioManager: GameAudioManager;
  private clock = new THREE.Clock();
  private current?: THREE.Group;
  private loaded = new Map<ModuleName, THREE.Group>();
  private interactive: InteractionTarget[] = [];
  private triggerMarkerBeacons: THREE.Mesh[] = [];
  private colliders: THREE.Box3[] = [];
  private orientedColliders: OrientedBoxCollider[] = [];
  private cylinderColliders: VerticalCylinderCollider[] = [];
  private terrain?: THREE.Object3D;
  private roverSystem?: RoverSystem;
  private sol11RouteStart?: THREE.Vector3;
  private sol11RouteDirection?: THREE.Vector3;
  private sol11RouteBaseDistance = 0;
  private sol11RouteBeam?: THREE.Line;
  private sol11FinalVideoActive = false;
  private sol11HiddenObjectVisibility = new Map<THREE.Object3D, boolean>();
  private sol7Storm = new Sol07StormController();
  private sol8PowerEffects = new Sol08PowerEffects();
  private sol8PowerEffectsResolved = false;
  private roverKeys = new Set<string>();
  private droneFloorHeight?: number;
  private raycaster = new THREE.Raycaster();
  private down = new THREE.Vector3(0, -1, 0);
  private temp = new THREE.Vector3();
  private nearby?: InteractionTarget;
  private active: ModuleName = "Habitat";
  private evaResources: EVAResources;
  private evaSuitActive: boolean;
  private evaLastTickAt = Date.now();
  private pending?: Transition;

  public missionManager: MissionManager;
  private screenRenderer = new ScreenRenderer();
  private laptopScreenRenderer = new LaptopScreenRenderer();
  private laptopPositionalAudio = new LaptopPositionalAudio();
  private laptopAudioController?: LaptopAudioController;
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
  private transitionSourceModule?: ModuleName;
  private observer: ResizeObserver;
  private environmentTarget?: THREE.WebGLRenderTarget;
  private environmentTexture?: THREE.DataTexture;
  private nighttimeEnvironmentTarget?: THREE.WebGLRenderTarget;
  private nighttimeEnvironmentTexture?: THREE.DataTexture;
  private terrainLightClusters?: TerrainLightClusters;
  private nighttimeActive = false;
  private nighttimeElapsedSeconds = 0;
  private nighttimeExpiredForCycle = false;
  private nighttimePersistAccumulator = 0;
  private nighttimeSessionInitializedForDay: number | null = null;
  private nighttimeSkyRotation = 0;
  private terrainSunIntensityTarget = 2.6;
  private terrainSunTransitionInitialized = false;
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
  private sol6TargetBeacon?: Sol5TargetBeacon;
  private sol5BuildingColliders: THREE.Box3[] = [];
  private sol5BodyYaw = 0;
  private sol5LookYaw = 0;
  private sol5LookPitch = 0;
  private sol5EInteractionConsumed = false;
  private sol5LastSnapshotAt = 0;

  constructor(private host: HTMLDivElement, private emit: SetState, replayState?: MissionProgressState) {
    this.missionManager = new MissionManager(replayState);
    this.evaResources = new EVAResources(replayState ? undefined : getEVAStorage());
    const evaSnapshot = this.evaResources.getState();
    this.evaSuitActive = evaSnapshot.suitActive;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.prepend(this.renderer.domElement);

    this.transitionScene.background = new THREE.Color("#080d12");
    this.transitionCamera.position.set(0, 0, 0);
    this.transitionPlanetMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec3 vPlanetPosition; varying vec3 vPlanetNormal; void main(){ vPlanetPosition=position; vPlanetNormal=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vPlanetPosition; varying vec3 vPlanetNormal; uniform float uTime;
        float hash31(vec3 p){ p=fract(p*0.1031); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z); }
        float noise3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f); return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z); }
        float fbm(vec3 p){ float n=0.0, a=0.5; for(int i=0;i<4;i++){ n+=noise3(p)*a; p*=2.03; a*=0.5; } return n; }
        void main(){
          vec3 n=normalize(vPlanetNormal); vec3 p=normalize(vPlanetPosition);
          float broad=fbm(p*5.0+vec3(0.0,uTime*0.004,0.0));
          float detail=fbm(p*22.0+vec3(4.1,1.7,3.2));
          float craters=smoothstep(0.56,0.78,noise3(p*vec3(34.0,27.0,34.0)));
          vec3 rust=vec3(0.43,0.16,0.075); vec3 ochre=vec3(0.69,0.34,0.18); vec3 pale=vec3(0.78,0.53,0.34);
          vec3 surface=mix(rust,ochre,smoothstep(0.24,0.78,broad)); surface=mix(surface,pale,smoothstep(0.69,0.9,detail)*0.34); surface*=1.0-craters*0.19;
          float diffuse=max(dot(n,normalize(vec3(-0.58,0.42,0.88))),0.0);
          float shade=0.12+0.88*diffuse; float limb=pow(1.0-max(dot(n,vec3(0.0,0.0,1.0)),0.0),2.2);
          vec3 color=surface*shade+vec3(0.9,0.36,0.16)*limb*0.32;
          gl_FragColor=vec4(color,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    this.transitionPlanet = new THREE.Mesh(new THREE.SphereGeometry(1.2, 64, 48), this.transitionPlanetMaterial);
    this.transitionPlanet.position.set(1.15, 0, -4.35);
    this.transitionScene.add(this.transitionPlanet);
    const starPositions = new Float32Array(420 * 3);
    let starSeed = 17;
    for (let i = 0; i < 420; i++) {
      starSeed = (starSeed * 16807) % 2147483647;
      starPositions[i * 3] = ((starSeed / 2147483647) * 2 - 1) * 7;
      starSeed = (starSeed * 16807) % 2147483647;
      starPositions[i * 3 + 1] = ((starSeed / 2147483647) * 2 - 1) * 4.5;
      starPositions[i * 3 + 2] = -8;
    }
    const starsGeometry = new THREE.BufferGeometry();
    starsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
    this.transitionScene.add(new THREE.Points(starsGeometry, new THREE.PointsMaterial({ color: 0xb6c2c9, size: 0.012, transparent: true, opacity: 0.56, sizeAttenuation: true })));

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
      evaSuitActive: evaSnapshot.suitActive,
      evaMovementState: "IDLE",
      evaOxygenPercent: evaSnapshot.oxygenPercent,
      evaBatteryPercent: evaSnapshot.batteryPercent,
      evaHeadingDegrees: 0,
      evaTerrainElevation: null,
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
      roverActive: false,
      roverSpeed: 0,
      roverView: "FIRST PERSON",
      droneTelemetry: { battery: 88, signal: 96, altitude: 15, x: 470, z: -58.7 },
      sol5DroneActive: false,
      sol5LandingPromptActive: false,
      sol5Telemetry: null,
      sol5Images: mState.sol5.images,
      sol5Flight: mState.sol5.flight,
      sol5Message: null,
      finalDepartureVideo: false,

      showCinematicOverlay: false,
      showOSDesktop: false,
      showPersonalLaptop: false,
      osInitialApp: undefined,
      cameraPresentation: null
    };

    this.cameraPresentationManager = new CameraPresentationManager(this.camera);
    if (this.evaSuitActive) this.player.setConfig(EVA_MOVEMENT_CONFIG);
    this.audioManager = new GameAudioManager();
    if (mState.currentDay === 7 && !mState.sol7.stormEnded) this.sol7Storm.start();
    if (mState.currentDay === 8 && mState.sol8.powerFailureActive) this.sol8PowerEffects.start();
    this.renderer.domElement.addEventListener("pointerdown", this.unlockAudio);

    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(host);
    this.resize();
    this.bind();

    // Subscribe to mission state changes
    this.missionManager.subscribe(updated => {
      this.syncMasterTerrainEnvironment(updated);
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

  public connectLaptopAudio(controller: LaptopAudioController) {
    this.laptopAudioController = controller;
    const habitat = this.loaded.get("Habitat");
    if (habitat) this.attachLaptopPositionalAudio(habitat);
  }

  private attachLaptopPositionalAudio(model: THREE.Group) {
    const controller = this.laptopAudioController;
    if (!controller) return;
    const output = this.laptopPositionalAudio.attach(model, this.camera, controller.getMediaElement(), this.player.eyeHeight);
    controller.attachSpatialOutput(output.context, output.gate);
  }

  private getEVAAccessBlockMessage(destination: ModuleName): string | null {
    return destination === "Terrain" || destination === "Hub"
      ? getEVAAccessBlockReason(destination, this.evaSuitActive, destination === "Terrain" && this.state.missionDay === 7 && !this.missionManager.getSol7Progress().stormEnded)
      : null;
  }

  private toggleEVASuitAtPreparationTrigger() {
    const target = this.nearby;
    if (this.active !== "Airlock" || target?.identifier !== EVA_PREPARATION_TRIGGER_ID ||
      !isWithinEVAInteractionRange(this.camera.position.distanceTo(target.center), target.range)) return;

    this.evaSuitActive = !this.evaSuitActive;
    if (this.evaSuitActive && this.state.missionDay === 11) this.missionManager.markSol11EVAPrepared(true);
    this.missionManager.markSol6EVAActivated(this.evaSuitActive);
    if (this.evaSuitActive && this.state.missionDay === 8) this.missionManager.markSol08EVAPrepared(this.evaSuitActive);
    const resourceSnapshot = this.evaSuitActive ? this.evaResources.beginSession() : this.evaResources.endSession();
    const feedback = this.evaSuitActive
      ? "EVA SUIT READY · You are cleared for Mars surface observation."
      : "EVA suit removed. Normal indoor movement is restored.";
    if (this.evaSuitActive) {
      this.player.setConfig(EVA_MOVEMENT_CONFIG);
      this.player.resetVelocity();
      this.player.setEVAOutdoorMotion(false);
      this.set({ evaSuitActive: true, evaMovementState: "IDLE", evaOxygenPercent: resourceSnapshot.oxygenPercent, evaBatteryPercent: resourceSnapshot.batteryPercent, evaTerrainElevation: null, prompt: "", notification: feedback });
    } else {
      this.player.setConfig(DEFAULT_MOVEMENT_CONFIG);
      this.player.setEVAOutdoorMotion(false);
      this.player.resetVelocity();
      this.set({ evaSuitActive: false, evaMovementState: "IDLE", evaOxygenPercent: resourceSnapshot.oxygenPercent, evaBatteryPercent: resourceSnapshot.batteryPercent, evaTerrainElevation: null, prompt: "", notification: feedback });
    }
    window.setTimeout(() => {
      if (!this.disposed && this.state.notification === feedback) this.set({ notification: null });
    }, 3200);
  }

  private syncMissionStateToUI(mState: Readonly<MissionProgressState>) {
    this.applySol11HabitatPresentation(mState.currentDay === 11);
    if (mState.currentDay === 8 && mState.sol8.powerFailureActive) {
      this.sol8PowerEffects.start();
      this.sol8PowerEffects.disableModuleLights(this.current ?? new THREE.Group(), this.active);
    } else if (mState.currentDay === 8 && mState.sol8.mainPowerRestored && !this.sol8PowerEffectsResolved) {
      this.sol8PowerEffectsResolved = true;
      this.sol8PowerEffects.restoreLights();
      this.sol8PowerEffects.fadeOut();
    } else if (mState.currentDay !== 8 && this.sol8PowerEffects.isActive()) {
      this.sol8PowerEffects.dispose();
      this.sol8PowerEffectsResolved = false;
    }
    if (mState.currentDay === 7 && !mState.sol7.stormEnded) this.sol7Storm.start();
    else if (mState.currentDay === 7 && mState.sol7.report?.validated) this.sol7Storm.endAfterValidatedReport();
    else if (mState.currentDay !== 7 && this.sol7Storm.isActive()) this.sol7Storm.dispose();
    if (mState.currentDay === 7 && !mState.sol7.stormEnded && this.current) this.sol7Storm.applyToModule(this.current, this.active);
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

  private applySol11HabitatPresentation(active: boolean) {
    const habitat = this.loaded.get("Habitat");
    if (!habitat) return;
    const targets = new Set(["Laptop01", "Laptop02", "Sketchfab_model", "NoteBook", "SetOfBook", "PhotoGraph", "Habitat_Workstation_Display"]);
    const isTarget = (object: THREE.Object3D) => [object.name, object.userData?.name].some(name =>
      typeof name === "string" && [...targets].some(target => name === target || name.startsWith(`${target}.`))
    );
    if (active) {
      habitat.traverse(object => {
        if (!isTarget(object) || object.userData.sol11VisibilityCaptured) return;
        object.traverse(child => {
          if (!this.sol11HiddenObjectVisibility.has(child)) this.sol11HiddenObjectVisibility.set(child, child.visible);
          child.visible = false;
        });
        object.userData.sol11VisibilityCaptured = true;
      });
      return;
    }
    for (const [object, visible] of this.sol11HiddenObjectVisibility) object.visible = visible;
    this.sol11HiddenObjectVisibility.clear();
    habitat.traverse(object => { delete object.userData.sol11VisibilityCaptured; });
  }

  public verifySol7EVALockdown(): boolean {
    // Verification depends on the active Sol 7 access policy, not on audio/light
    // playback successfully starting in the presentation controller.
    if (this.state.missionDay !== 7 || this.missionManager.getSol7Progress().stormEnded) return false;
    const temporaryLock = getEVAAccessBlockReason("Terrain", true, true);
    const normalSuitGate = getEVAAccessBlockReason("Terrain", false, false);
    return Boolean(temporaryLock && normalSuitGate);
  }

  public onSol7ReportValidated(): void { this.sol7Storm.endAfterValidatedReport(); }

  private async loadEnvironment() {
    try {
      const source = getPreparedEXR(DAYTIME_EXR_URL);
      if (this.disposed) {
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

    try {
      const source = getPreparedEXR(NIGHTTIME_EXR_URL);
      if (this.disposed) {
        return;
      }
      source.mapping = THREE.EquirectangularReflectionMapping;
      this.nighttimeEnvironmentTexture = source;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.nighttimeEnvironmentTarget = pmrem.fromEquirectangular(source);
      pmrem.dispose();
      this.syncMasterTerrainEnvironment(this.missionManager.getState());
    } catch (error) {
      console.error(`[Master Terrain Environment] Nighttime EXR failed to load from ${NIGHTTIME_EXR_URL}.`, error);
    }
  }

  private updateEnvironment() {
    const hemiConfig = getModuleHemisphereConfig(this.active);
    this.hemiLight.color.setHex(hemiConfig.skyColor);
    this.hemiLight.groundColor.setHex(hemiConfig.groundColor);
    const useNight = this.active === "Terrain" && !this.transitioning && this.nighttimeActive && Boolean(this.nighttimeEnvironmentTarget);
    this.hemiLight.intensity = useNight ? 0.12 : hemiConfig.intensity;
    const terrainSun = this.current?.getObjectByName("MarsSun_DirectionalLight") as THREE.DirectionalLight | undefined;
    if (terrainSun) {
      this.terrainSunIntensityTarget = useNight ? 0 : 5.2;
      if (!this.terrainSunTransitionInitialized) {
        terrainSun.intensity = this.terrainSunIntensityTarget;
        this.terrainSunTransitionInitialized = true;
      }
      terrainSun.visible = terrainSun.intensity > 0.002 || this.terrainSunIntensityTarget > 0;
      terrainSun.castShadow = terrainSun.intensity > 0.08 || this.terrainSunIntensityTarget > 0;
    }
    setTerrainNightLightsEnabled(this.terrainLightClusters, useNight);
    // Keep the daytime EXR as the sky/reflection source, but let the authored
    // directional sun establish stronger contrast on the terrain and structures.
    this.scene.environmentIntensity = useNight ? 0.3 : (this.active === "Terrain" ? 0.18 : 1);
    this.scene.environmentRotation.y = useNight ? this.nighttimeSkyRotation : 0;
    this.scene.backgroundRotation.y = useNight ? this.nighttimeSkyRotation : 0;

    if (this.active === "Terrain") {
      this.scene.environment = (useNight ? this.nighttimeEnvironmentTarget : this.environmentTarget)?.texture ?? null;
      this.scene.background = (useNight ? this.nighttimeEnvironmentTexture : this.environmentTexture) ?? new THREE.Color("#101a20");
    } else {
      this.scene.environment = null;
      this.scene.background = new THREE.Color(0x0a1015);
      this.scene.environmentIntensity = 1;
    }
  }

  private syncMasterTerrainEnvironment(state: Readonly<MissionProgressState>) {
    const eligible = isMasterTerrainNighttimeEligible(state, this.transitioning);
    if (!eligible) {
      this.nighttimeActive = false;
      this.nighttimeElapsedSeconds = 0;
      this.nighttimePersistAccumulator = 0;
      this.nighttimeExpiredForCycle = false;
      this.nighttimeSessionInitializedForDay = null;
      this.clearStoredNightSession();
    } else if (this.active === "Terrain" && this.nighttimeEnvironmentTarget && this.nighttimeSessionInitializedForDay !== state.currentDay) {
      const stored = this.readStoredNightSession(state.currentDay);
      this.nighttimeSessionInitializedForDay = state.currentDay;
      this.nighttimeExpiredForCycle = stored?.expired ?? false;
      this.nighttimeElapsedSeconds = stored?.elapsedSeconds ?? 0;
      this.nighttimeActive = !this.nighttimeExpiredForCycle;
      if (this.nighttimeActive) this.persistNightSession(state.currentDay, false);
    }
    this.updateEnvironment();
  }

  private updateNighttimeGameplayClock(dt: number) {
    if (!this.nighttimeActive) return;
    const paused = document.hidden || this.transitioning || Boolean(
      this.state.panel || this.state.showBriefingModal || this.state.showRoutePlanning ||
      this.state.showGeologicalForm || this.state.showSurfaceObservationForm || this.state.showScienceAnalysisModal ||
      this.state.showDroneConsoleModal || this.state.restFeedback || this.state.showCinematicOverlay ||
      this.state.showOSDesktop || this.state.showPersonalLaptop || this.cameraPresentationManager.isPresentationActive()
    );
    const result = advanceNighttimeGameplayClock(this.nighttimeElapsedSeconds, dt, paused);
    if (paused) return;
    this.nighttimeElapsedSeconds = result.elapsedSeconds;
    this.nighttimePersistAccumulator += dt;
    if (!result.expired && this.nighttimePersistAccumulator < 60) return;
    this.nighttimePersistAccumulator = 0;
    const currentDay = this.missionManager.getState().currentDay;
    if (!result.expired) {
      this.persistNightSession(currentDay, false);
      return;
    }
    this.nighttimeActive = false;
    this.nighttimeElapsedSeconds = 0;
    this.nighttimeExpiredForCycle = true;
    this.persistNightSession(currentDay, true);
    this.updateEnvironment();
  }

  private readStoredNightSession(day: number): { day: number; elapsedSeconds: number; expired: boolean } | null {
    try {
      const raw = window.localStorage.getItem("phobosia_master_terrain_night_session_v1");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { day?: unknown; elapsedSeconds?: unknown; expired?: unknown };
      if (parsed.day !== day || typeof parsed.elapsedSeconds !== "number" || !Number.isFinite(parsed.elapsedSeconds)) return null;
      return { day, elapsedSeconds: Math.max(0, Math.min(parsed.elapsedSeconds, NIGHTTIME_DURATION_SECONDS)), expired: parsed.expired === true };
    } catch { return null; }
  }

  private persistNightSession(day: number, expired: boolean) {
    if (this.missionManager.isReplaySession) return;
    try {
      window.localStorage.setItem("phobosia_master_terrain_night_session_v1", JSON.stringify({ day, elapsedSeconds: this.nighttimeElapsedSeconds, expired }));
    } catch { /* Storage may be unavailable in private or embedded sessions. */ }
  }

  private clearStoredNightSession() {
    if (this.missionManager.isReplaySession) return;
    try { window.localStorage.removeItem("phobosia_master_terrain_night_session_v1"); }
    catch { /* Storage may be unavailable in private or embedded sessions. */ }
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
          // Direct URLs cannot bypass the preparation room.
          initialModule = "Airlock";
          initialSpawn = "Central_Hub_Entrance_Trigger";
          this.set({ notification: "EVA suit required. Visit the suit preparation area before entering Mars terrain." });
        }
      }
      if (this.evaSuitActive) {
        // After a reload, resume an active EVA in the existing Airlock so its suit can be removed safely.
        initialModule = "Airlock";
        initialSpawn = "Terrain_Entrance_Trigger";
        hideBriefing = true;
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
        isOutdoorTerrain: false,
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
      this.state.showOSDesktop ||
      this.state.showPersonalLaptop;

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
    if (targetModule === "Terrain" && !this.evaSuitActive) {
      this.set({ notification: "EVA suit required. Visit the suit preparation area before entering Mars terrain." });
      return false;
    }
    if (targetModule === "Hub" && this.evaSuitActive) {
      this.set({ notification: "EVA suit active. Remove your suit at the preparation area before entering the Central Hub." });
      return false;
    }

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
      transitionProgress: null
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
        evaSuitActive: this.evaSuitActive,
        evaOxygenPercent: this.evaResources.getState().oxygenPercent,
        evaBatteryPercent: this.evaResources.getState().batteryPercent,
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

  submitSol6FieldObservation(data: { category: string; observation: string; interpretation: string; uncertainty: string }) {
    const targetId = this.missionManager.getSelectedSiteId();
    const target = resolveSol5Target(this.loaded.get("Terrain") ?? new THREE.Group(), targetId, MASTER_TERRAIN_TARGETS);
    if (!target || this.active !== "Terrain" || this.camera.position.distanceTo(target.position) > SOL5_LIMITS.targetInspectionRadiusM) {
      this.set({ notification: "Field entry blocked: return to the validated official target area." });
      return;
    }
    const record = this.missionManager.saveSol6FieldObservation({ targetId: target.definition.id, locationReference: target.object.name, category: data.category, observation: data.observation, interpretation: data.interpretation, uncertainty: data.uncertainty });
    this.set(record
      ? { showGeologicalForm: false, notification: "Target-linked field observation saved. Sample collection is now available." }
      : { notification: "Observation not saved. Complete every field and remain at the official target." });
    if (record) this.lock();
  }

  collectSol6Sample(containerReference: string) {
    const targetId = this.missionManager.getSelectedSiteId();
    const target = resolveSol5Target(this.loaded.get("Terrain") ?? new THREE.Group(), targetId, MASTER_TERRAIN_TARGETS);
    if (!target || this.active !== "Terrain" || this.camera.position.distanceTo(target.position) > SOL5_LIMITS.targetInspectionRadiusM) {
      this.set({ notification: "Sample collection blocked: return to the validated official target area." });
      return;
    }
    const sample = this.missionManager.collectSol6Sample(target.object.name, containerReference);
    this.set(sample
      ? { showGeologicalForm: false, prompt: "", notification: `Sample ${sample.sampleId} registered and secured for return.` }
      : { notification: "Sample not registered. Save the field observation first and provide a container reference." });
    if (sample) this.lock();
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

  openPersonalLaptop() {
    if (this.active !== "Habitat" || this.transitioning) return;
    if (document.pointerLockElement) document.exitPointerLock();
    this.player.keys.clear();
    this.set({ showPersonalLaptop: true, prompt: "" });
  }

  closePersonalLaptop() {
    if (!this.state.showPersonalLaptop) return;
    this.set({ showPersonalLaptop: false });
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
    if (evidenceAssets.some(asset => !isPreparedAsset(asset.assetPath))) {
      this.set({ sol5Message: "Simulation unavailable: selected-target image assets were not prepared. No other target's imagery will be used." }); return;
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
    if (this.sol6TargetBeacon) disposeSol5TargetBeacon(this.sol6TargetBeacon);
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

  private unlockAudio = () => { this.audioManager.unlock(); this.sol7Storm.unlock(); this.sol8PowerEffects.unlock(); };

  private resize = () => {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.transitionCamera.aspect = width / height;
    this.transitionCamera.updateProjectionMatrix();
    if (this.sol5CameraRig) {
      for (const camera of Object.values(this.sol5CameraRig)) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
    }
    this.renderer.setSize(width, height, false);
  };

  setTransitionPointer(x: number, y: number) {
    this.transitionPointerTarget.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1));
  }

  private waitForTransitionFrame() {
    return new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }

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
      this.state.showPersonalLaptop ||
      this.cameraPresentationManager.isPresentationActive();

    if (isModalOpen) return;

    if (this.roverSystem?.isActive) return;

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
    if (this.state.finalDepartureVideo) { e.preventDefault(); return; }
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

    if (this.roverSystem?.isActive) {
      if (["KeyW", "KeyA", "KeyS", "KeyD", "Space"].includes(e.code)) { e.preventDefault(); this.roverKeys.add(e.code); }
      if (e.code === "KeyC" && !e.repeat) { e.preventDefault(); this.roverSystem.switchView(); this.publishRoverState(); }
      if (e.code === "KeyR" && !e.repeat) { e.preventDefault(); this.exitRover(); }
      if (e.code === "KeyE" && !e.repeat) {
        e.preventDefault();
        if (Math.abs(this.roverSystem.snapshot.speed) < 0.18) this.exitRover();
        else this.set({ prompt: "BRAKE TO A STOP BEFORE EXITING THE ROVER" });
      }
      return;
    }

    if (e.code === "KeyR" && !e.repeat && this.active === "Terrain" && this.roverSystem) {
      e.preventDefault();
      if (!this.roverSystem.canEnterFrom(this.camera.position)) {
        this.set({ prompt: "MOVE CLOSER TO THE TERRAIN ROVER TRIGGER TO ENTER" });
      } else if (!this.evaSuitActive) {
        this.set({ prompt: "EVA SUIT REQUIRED · ACCESS MARS FROM THE AIRLOCK" });
      } else {
        this.enterRover();
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

    if (this.state.showPersonalLaptop) {
      if (e.code === "Escape") {
        e.preventDefault();
        this.closePersonalLaptop();
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
    } else if (this.roverSystem?.isActive) {
      this.roverKeys.delete(e.code);
    } else {
      this.player.keys.delete(e.code);
    }
  };

  private visibility = () => {
    if (document.hidden) {
      this.player.keys.clear();
      this.droneKeys.clear();
      this.roverKeys.clear();
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

  private async getModel(module: ModuleName) {
    const cached = this.loaded.get(module);
    if (cached) return cached;
    const model = clonePreparedModel(assetPaths[module]);
    this.loaded.set(module, model);
    return model;
  }

  private configureModule(model: THREE.Group, module: ModuleName) {
    this.interactive = [];
    this.triggerMarkerBeacons = [];
    this.colliders = [];
    this.orientedColliders = [];
    this.cylinderColliders = [];
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
      if (module === "Terrain") {
        let owner: THREE.Object3D | null = o;
        while (owner && owner !== model && owner.name !== "RoverStation") owner = owner.parent;
        if (owner?.name === "RoverStation") {
          o.visible = false;
          return;
        }
      }
      if (module === "Habitat" && this.state.missionDay === 11 &&
        (o.name === "HAB_WORKSTATION_01" || o.userData?.name === "HAB_WORKSTATION_01")) return;
      const route = this.resolve(transitions[module], o);
      const screen = this.resolve(screenActions, o);
      const isTrigger = /trigger|spawn|entrance/i.test(o.name) ||
        (module === "Terrain" && terrainMissionTriggerIds.has(o.name));

      // Preserve authored trigger materials and visibility. Screen renderers
      // restore each mesh's original material when their canvas binding ends.
      let triggerAncestor: THREE.Object3D | null = o;
      let belongsToTrigger = false;
      while (triggerAncestor && triggerAncestor !== additions) {
        if (/trigger|spawn|entrance/i.test(triggerAncestor.name) ||
          (module === "Terrain" && terrainMissionTriggerIds.has(triggerAncestor.name))) {
          belongsToTrigger = true;
          break;
        }
        triggerAncestor = triggerAncestor.parent;
      }
      const mesh = o as THREE.Mesh;
      if (belongsToTrigger && mesh.isMesh) mesh.visible = true;

      if (route || screen) {
        const target = this.makeTarget(o, (route ?? screen)![0]);
        if (isTrigger) target.center.copy(o.getWorldPosition(new THREE.Vector3()));
        this.interactive.push(target);
        if (route || isTrigger) this.addHolographicMarker(additions, target);
      } else if (isTrigger) {
        const target = this.makeTarget(o, o.name);
        target.center.copy(o.getWorldPosition(new THREE.Vector3()));
        this.addHolographicMarker(additions, target);
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

    if (module === "Habitat") this.applySol11HabitatPresentation(this.state.missionDay === 11);

    if (module === "Terrain") {
      try {
        this.roverSystem = new RoverSystem(model, this.camera);
        this.interactive.push({ object: this.roverSystem.trigger, identifier: "terrainRover_trigger", center: this.roverSystem.interactionCenter, range: this.roverSystem.interactionRange });
      } catch (error) {
        this.roverSystem = undefined;
        console.error(error);
        this.set({ notification: error instanceof Error ? error.message : "Mars Rover scene mapping could not be resolved." });
      }
    } else {
      this.roverSystem = undefined;
      this.roverKeys.clear();
    }

    if (module === "Terrain" && (this.state.missionDay === 8 || this.state.missionDay === 10)) {
      for (const id of ["PowerUnit_A", "PowerUnit_B", "PowerUnit_AB_Main", "Commuication_fix_Trigger"]) {
        const object = model.getObjectByName(id);
        if (object) this.interactive.push(this.makeTarget(object, id));
        else console.warn(`[Sol 8] Existing repair trigger missing from loaded Terrain scene: ${id}`);
      }
    }

    if (module === "Airlock") {
      const preparationTrigger = model.getObjectByName(EVA_PREPARATION_TRIGGER_ID);
      if (preparationTrigger) this.interactive.push(this.makeTarget(preparationTrigger, EVA_PREPARATION_TRIGGER_ID));
    }

    // 1. Configure mesh castShadow and receiveShadow flags across the module hierarchy
    configureMeshShadows(model, module);

    // 2. Configure comprehensive realistic lighting and shadow system (Sun or SpotLights + ambient fill)
    configureModuleLighting(model, additions, module);
    if (module === "Terrain") {
      this.terrainLightClusters = createMasterTerrainLightClusters(model, additions);
      console.info("[Master Terrain Environment] Authored fixture audit", this.terrainLightClusters.audit);
      console.info("[Master Terrain Environment] Night shadow lights", this.terrainLightClusters.shadowLightNames);
      this.syncMasterTerrainEnvironment(this.missionManager.getState());
    }
    if (this.state.missionDay === 8 && this.missionManager.getSol8Progress().powerFailureActive) this.sol8PowerEffects.disableModuleLights(model, module);
    if (this.state.missionDay === 7 && !this.missionManager.getSol7Progress().stormEnded) this.sol7Storm.applyToModule(model, module);

    if (module === "Habitat") {
      this.colliders = buildHabitatColliderSection(model);
    } else if (module === "Hub") {
      this.colliders = buildCentralHubColliders(model);
      this.orientedColliders = buildCentralHubOrientedColliders(model);
      this.cylinderColliders = buildCentralHubCylinderColliders(model);
    } else if (module === "Science") {
      this.colliders = buildScienceLabColliders(model);
    } else if (module === "Drone") {
      this.colliders = buildDroneSectionColliders(model);
    } else if (module === "Terrain") {
      const authoredNames = Array.from({ length: 18 }, (_, index) => `Collider_${index + 1}`);
      const authored = buildNamedSceneColliders(model, authoredNames);
      if (authored.missingNames.length || authored.invalidNames.length) {
        console.warn(`[Master Scene] Collider mapping: found ${authored.foundNames.length}/18; missing: ${authored.missingNames.join(", ") || "none"}; invalid geometry: ${authored.invalidNames.join(", ") || "none"}.`);
      }
      this.colliders = [...buildTerrainBuildingColliders(model, true, true, true), ...authored.colliders];
    } else if (["Engineering", "MissionControl", "Airlock"].includes(module)) {
      this.colliders = buildCustomColliderSections(model, ["Collider_Section01"]);
    }

    // Attach 3D screen plane rendering to actual screen meshes
    if (module === "Habitat") {
      this.habitatScreenRenderer.attachToHabitat(model, this.missionManager.getState());
      if (this.state.missionDay === 11) this.laptopScreenRenderer.dispose();
      else this.laptopScreenRenderer.attachToHabitat(model);
      this.attachLaptopPositionalAudio(model);
    } else {
      this.habitatScreenRenderer.dispose();
      this.laptopScreenRenderer.dispose();
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

  private addHolographicMarker(parent: THREE.Group, target: InteractionTarget) {
    // Keep floor markers compact so nearby interaction points do not merge
    // into oversized, overlapping rings.
    const radius = 0.48;
    // Use the trigger anchor rather than its bounds: some imported triggers
    // contain offset screen planes that would drag a marker away from its spot.
    const markerPosition = parent.worldToLocal(target.center.clone());
    markerPosition.y += 0.04;
    if (parent.children.some(child =>
      child.name.startsWith("Holographic interaction marker ") &&
      child.position.distanceTo(markerPosition) < 0.15
    )) return;
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffa044,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      // Trigger meshes sit on or slightly below the floor; render the marker
      // above the scene depth buffer so it remains visible from either side.
      depthTest: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    // Keep trigger marker materials independent of authored trigger meshes
    // (which may contain imported screen or environmental textures).
    const innerRingMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    const rings = new THREE.Group();
    rings.name = `Holographic interaction marker ${target.identifier}`;
    rings.position.copy(markerPosition);

    const outer = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.014, 6, 48), ringMaterial);
    outer.rotation.x = Math.PI / 2;
    rings.add(outer);

    const inner = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.76, 0.014, 6, 48), innerRingMaterial);
    inner.rotation.x = Math.PI / 2;
    rings.add(inner);

    const sweep = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.01, 5, 36, Math.PI * 0.38), ringMaterial.clone());
    sweep.rotation.x = Math.PI / 2;
    sweep.rotation.z = Math.PI * 0.28;
    rings.add(sweep);

    const beacon = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.42, 0.012, 6, 40),
      ringMaterial.clone()
    );
    beacon.position.y = 0.34;
    beacon.renderOrder = 1000;
    this.triggerMarkerBeacons.push(beacon);
    rings.add(beacon);
    outer.renderOrder = 1000;
    inner.renderOrder = 1000;
    sweep.renderOrder = 1000;
    parent.add(rings);
  }

  private async loadAndSpawn(route: Transition) {
    const model = await this.getModel(route.module);
    if (this.disposed) return;

    if (this.roverSystem?.isActive) this.roverSystem.exit();
    this.roverKeys.clear();
    if (this.state.roverActive) this.set({ roverActive: false, roverSpeed: 0, prompt: "" });

    if (this.current) this.scene.remove(this.current);
    this.current = model;
    this.scene.add(model);
    this.active = route.module;
    const evaSnapshot = this.evaResources.setLocation(route.module === "Terrain");
    this.evaLastTickAt = Date.now();

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
    this.player.setEVAOutdoorMotion(route.module === "Terrain" && this.evaSuitActive);

    // Check mission context event for entering module
    this.missionManager.handleContextEvent({ type: "module_entered", module: route.module });

    this.playZoneIntroduction(route.module);

    this.set({
      module: labels[route.module],
      isOutdoorTerrain: route.module === "Terrain",
      evaSuitActive: this.evaSuitActive,
      evaOxygenPercent: evaSnapshot.oxygenPercent,
      evaBatteryPercent: evaSnapshot.batteryPercent
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
    this.transitionSourceModule = this.active;
    const blockedMessage = this.getEVAAccessBlockMessage(route.module);
    if (blockedMessage) {
      this.set({ prompt: "", notification: blockedMessage });
      return;
    }
    if (this.active === "Terrain" && route.module !== "Terrain" && this.evaSuitActive) {
      const now = Date.now();
      const elapsed = Math.max(0, (now - this.evaLastTickAt) / 1000);
      const finalOutdoorSnapshot = this.evaResources.update(elapsed, true, now);
      this.evaResources.setLocation(false, now);
      this.evaLastTickAt = now;
      this.audioManager.setMarsTerrain(false);
      this.set({ evaOxygenPercent: finalOutdoorSnapshot.oxygenPercent, evaBatteryPercent: finalOutdoorSnapshot.batteryPercent });
    }
    this.transitioning = true;
    this.pending = route;
    this.player.keys.clear();
    document.exitPointerLock();

    this.set({
      error: "",
      prompt: "",
      transition: "loading",
      transitionLabel: labels[route.module],
      transitionProgress: 0
    });

    try {
      // Paint the transition scene before starting destination preparation.
      await this.waitForTransitionFrame();
      if (this.disposed || !this.pending) return;

      const model = await this.getModel(route.module);
      if (this.disposed || !this.pending) return;

      this.set({ transitionProgress: 25 });
      await this.waitForTransitionFrame();
      if (this.disposed || !this.pending) return;

      await this.finishTransition();
    } catch (error) {
      if (this.active === "Terrain" && this.evaSuitActive) this.evaResources.setLocation(true);
      this.set({
        transition: "error",
        error: `Could not prepare ${labels[route.module]}: ${error instanceof Error ? error.message : "unknown error"}`
      });
    }
  }

  retryTransition() {
    if (!this.pending) return;
    this.transitioning = false;
    void this.beginTransition(this.pending);
  }

  continueTransition() {
    if (this.pending) void this.finishTransition();
  }

  private async finishTransition() {
    const route = this.pending;
    if (!route || !this.transitioning) return;
    const blockedMessage = this.getEVAAccessBlockMessage(route.module);
    if (blockedMessage) {
      this.pending = undefined;
      this.transitioning = false;
      this.set({ transition: "", transitionProgress: null, transitionLabel: "", prompt: "", notification: blockedMessage });
      return;
    }

    try {
      const model = this.loaded.get(route.module);
      if (!model) throw new Error("Destination model is no longer available.");

      if (this.current) this.scene.remove(this.current);
      this.current = model;
      this.scene.add(model);
      this.active = route.module;
      const evaSnapshot = this.evaResources.setLocation(route.module === "Terrain");
      this.evaLastTickAt = Date.now();

      this.updateEnvironment();
      this.player.setEyeHeight(route.module === "Hub" ? 0.95 : route.module === "Drone" ? 0.55 : 1.65);
      this.configureModule(model, route.module);
      this.set({ transitionProgress: 50 });
      await this.waitForTransitionFrame();
      if (this.disposed || this.pending !== route) return;

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
      this.player.setEVAOutdoorMotion(route.module === "Terrain" && this.evaSuitActive);
      this.set({ transitionProgress: 75 });
      await this.waitForTransitionFrame();
      if (this.disposed || this.pending !== route) return;

      // Sol 6 return completion is tied specifically to the successful Terrain → Airlock transition.
      if (this.missionManager.getState().currentDay === 6 && this.transitionSourceModule === "Terrain" && route.module === "Airlock") {
        this.missionManager.markSol6AirlockReturned();
      }
      this.transitionSourceModule = undefined;
      // Trigger module entered event
      this.missionManager.handleContextEvent({ type: "module_entered", module: route.module });
      this.playZoneIntroduction(route.module);

      // Show completion only after destination scene, spawn, and mission context are ready.
      this.set({ transitionProgress: 100 });
      await this.waitForTransitionFrame();
      if (this.disposed || this.pending !== route) return;

      this.pending = undefined;
      this.transitioning = false;
      this.syncMasterTerrainEnvironment(this.missionManager.getState());
      this.set({
        module: labels[route.module],
        transition: "",
        transitionProgress: null,
        transitionLabel: "",
        error: "",
        isOutdoorTerrain: route.module === "Terrain",
        evaSuitActive: this.evaSuitActive,
        evaOxygenPercent: evaSnapshot.oxygenPercent,
        evaBatteryPercent: evaSnapshot.batteryPercent
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

      // Sol 6 field observations and sample registration are only valid at the selected target.
      if (day === 6) {
        const target = resolveSol5Target(this.loaded.get("Terrain") ?? new THREE.Group(), this.missionManager.getSelectedSiteId(), MASTER_TERRAIN_TARGETS);
        if (target && pos.distanceTo(target.position) <= SOL5_LIMITS.targetInspectionRadiusM && this.missionManager.isStepComplete("SOL06_REACH_SELECTED_TARGET") && (!this.missionManager.isStepComplete("SOL06_COMPLETE_FIELD_OBSERVATIONS") || !this.missionManager.isStepComplete("SOL06_COLLECT_SOIL_SAMPLE"))) {
          document.exitPointerLock();
          this.set({ showGeologicalForm: true, prompt: "" });
          return;
        }
      }

    }

    if (!this.nearby) return;

    if (this.active === "Airlock" && this.nearby.identifier === EVA_PREPARATION_TRIGGER_ID) {
      if (key === "E") this.toggleEVASuitAtPreparationTrigger();
      return;
    }

    if (this.nearby.identifier === "Terrain_Entrance_Trigger" || this.nearby.identifier === "Central_Hub_Entrance_Trigger") {
      const route = transitions[this.active][this.nearby.identifier];
      const blockedMessage = route && this.getEVAAccessBlockMessage(route.module);
      if (blockedMessage) {
        this.set({ notification: blockedMessage });
        return;
      }
    }

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

    if (this.active === "Habitat" && this.nearby.identifier === "HAB_WORKSTATION_01") {
      document.exitPointerLock();
      const result = this.missionManager.handleContextEvent({ type: "trigger_interacted", module: this.active, identifier: this.nearby.identifier });
      this.set({
        notification: result.feedback ?? (this.state.missionDay === 1 ? "Habitat workstation opened. Personal laptop ready." : null),
        prompt: "",
        showPersonalLaptop: true
      });
      this.player.keys.clear();
      return;
    }

    // 2. Habitat Rest & Day Advance
    if (this.nearby.identifier === "HAB_REST_01") {
      document.exitPointerLock();
      if (this.state.missionDay === 1) {
        this.missionManager.completeStep("D1_HAB_REST_INTRODUCTION");
      }
      const check = this.missionManager.canRestAndAdvance();
      if (!check.canAdvance) {
        const terminalMissionComplete = this.state.missionDay === 9 && Boolean(this.missionManager.getSol09Progress().report?.validated);
        const remaining = this.missionManager.getRemainingSteps();
        const missingTasks = remaining.map(task => {
          const dayOneTask = DAY1_TASKS.find(item => item.taskId === task.stepId);
          const inferredZone = task.targetTrigger?.startsWith("HAB_") ? "Habitat" : task.targetTrigger?.startsWith("Engineering_") ? "Engineering Unit" : task.targetTrigger?.startsWith("MC_") ? "Mission Control" : task.targetTrigger?.startsWith("LAB_") ? "Science Lab" : "";
          return { title: task.label, zone: task.targetModule ?? (inferredZone || (dayOneTask ? DAY1_ZONES.find(zone => zone.zoneId === dayOneTask.zoneId)?.friendlyName ?? "" : "")) };
        });
        this.set({
          restFeedback: {
            type: terminalMissionComplete ? "success" : "blocked",
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

    // 3. Sol 8 Science Lab analysis sequence. Sol 3 uses the same physical
    // analysis trigger for its dataset investigation through TriggerOperatingSystem.
    if (
      this.state.missionDay === 8 &&
      !this.missionManager.getSol8Progress().started &&
      this.active === "Science" &&
      (this.nearby.identifier === "LAB_RESEARCH_ANALYSIS_01" || this.nearby.identifier === "LAB_RESEARCH_MONITORING_01")
    ) {
      document.exitPointerLock();
      const mState = this.missionManager.getState();
      if (!mState.surfaceObservation) {
        this.set({
          restFeedback: {
            type: "blocked",
            message: "Prerequisite Incomplete: No saved Day 7 surface observation found. Complete Sol 07 outdoor scan before analysing in the Science Lab."
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
    const sol8Interactives = ["HAB_MONITOR_01", "Engineering_PowerUnit_Trigger", "MC_SYSTEMS_01", "MC_MAIN_01", "PowerUnit_A", "PowerUnit_B", "PowerUnit_AB_Main", "Commuication_fix_Trigger"];
    const interactedTriggerId = this.nearby?.identifier ?? "";
    const sol10Trigger = this.state.missionDay === 10 && SOL10_TRIGGER_CHECKS.some(check => check.triggerId === interactedTriggerId);
    const title = screenActions[this.nearby.identifier] ?? (this.state.missionDay === 8 && sol8Interactives.includes(this.nearby.identifier) ? this.nearby.identifier : sol10Trigger ? this.nearby.identifier : undefined);
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
    if (this.active !== "Terrain") {
      if (this.sol6TargetBeacon) { disposeSol5TargetBeacon(this.sol6TargetBeacon); this.sol6TargetBeacon = undefined; }
      return;
    }

    const pos = this.camera.position;
    const mState = this.missionManager.getState();
    const day = mState.currentDay;

    // Sol 6 arrival is measured against the official target's loaded scene transform.
    if (day === 6) {
      const targetId = this.missionManager.getSelectedSiteId();
      const target = resolveSol5Target(this.loaded.get("Terrain") ?? new THREE.Group(), targetId, MASTER_TERRAIN_TARGETS);
      const sol6Progress = this.missionManager.getSol6Progress();
      if (this.evaSuitActive && this.missionManager.isStepComplete("SOL06_ACTIVATE_EVA_SESSION") && target && !sol6Progress.targetReached) {
        if (!this.sol6TargetBeacon) this.sol6TargetBeacon = createSol5TargetBeacon(this.scene, target.object);
        updateSol5TargetBeacon(this.sol6TargetBeacon, target.object, true);
      } else if (this.sol6TargetBeacon) {
        setSol5TargetBeaconVisible(this.sol6TargetBeacon, false);
      }
      if (target && pos.distanceTo(target.position) <= SOL5_LIMITS.targetInspectionRadiusM) {
        if (this.missionManager.markSol6TargetReached(target.definition.id)) this.set({ notification: `Official Sol 3 target reached: ${target.definition.name}.` });
        if (this.missionManager.isStepComplete("SOL06_REACH_SELECTED_TARGET") && !this.missionManager.isStepComplete("SOL06_COMPLETE_FIELD_OBSERVATIONS")) {
          this.set({ prompt: "Press E to Record Ground-Level Field Observation" });
        } else if (this.missionManager.isStepComplete("SOL06_COMPLETE_FIELD_OBSERVATIONS") && !this.missionManager.isStepComplete("SOL06_COLLECT_SOIL_SAMPLE")) {
          this.set({ prompt: "Press E to Register and Secure Field Sample" });
        }
      }
    }

  }

  private findNearby() {
    const at = this.camera.position;
    let best: InteractionTarget | undefined;
    let nearest = Infinity;

    for (const target of this.interactive) {
      if (this.state.missionDay === 11 && this.active === "Habitat" && target.identifier === "HAB_WORKSTATION_01") continue;
      const distance = at.distanceTo(target.center);
      if (distance <= target.range && distance < nearest) {
        nearest = distance;
        best = target;
      }
    }

    if (this.active === "Terrain" && this.roverSystem?.canEnterFrom(at)) {
      const roverTarget = this.interactive.find(target => target.identifier === "terrainRover_trigger");
      if (roverTarget && (!best || best.identifier !== "terrainRover_trigger")) best = roverTarget;
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
      if (this.active !== "Terrain" || this.state.missionDay !== 6) {
        this.set({ prompt: "" });
      }
      return;
    }

    const route = transitions[this.active][best.identifier];
    if (best.identifier === "terrainRover_trigger") {
      this.set({ prompt: this.evaSuitActive ? "[R] ENTER TERRAIN ROVER" : "EVA SUIT REQUIRED · ACCESS MARS FROM THE AIRLOCK" });
    } else if (best.identifier === EVA_PREPARATION_TRIGGER_ID) {
      this.set({ prompt: this.evaSuitActive ? "[E] REMOVE EVA SUIT" : "[E] PREPARE EVA SUIT" });
    } else if (route) {
      const key = ENTRANCE_INTERACTION_KEYS[best.identifier] ?? "E";
      const blockMessage = this.getEVAAccessBlockMessage(route.module);
      if (blockMessage && best.identifier === "Terrain_Entrance_Trigger") {
        const sol7Lockdown = this.state.missionDay === 7 && !this.missionManager.getSol7Progress().stormEnded;
        this.set({ prompt: sol7Lockdown
          ? "SOL 7 LOCKDOWN · VERIFY AT AIRLOCK CONTROL CONSOLE"
          : "EVA SUIT REQUIRED · VISIT THE PREPARATION AREA" });
      } else if (blockMessage && best.identifier === "Central_Hub_Entrance_Trigger") {
        this.set({ prompt: "EVA SUIT ACTIVE · REMOVE SUIT BEFORE ENTERING THE CENTRAL HUB" });
      } else {
        this.set({ prompt: `[${key}] TRAVEL TO ${labels[route.module].toUpperCase()}` });
      }
    } else if (best.identifier === "HAB_REST_01") {
      this.set({ prompt: `[E] REST · CREW REST AREA` });
    } else if (this.active === "Drone" && best.identifier === "Drone") {
      this.set({ prompt: "[E] INSPECT · EXISTING DRONE" });
    } else if (best.identifier === "MC_NAVIGATION_01" || (this.active === "MissionControl" && best.identifier === "MC_MAIN_01")) {
      if (this.state.missionDay === 5) {
        this.set({ prompt: "[E] ACCESS · SOL 5 DRONE OPERATIONS" });
      } else if (this.state.missionDay === 6) {
        this.set({ prompt: "[E] ACCESS · SOL 6 FIELD INVESTIGATION BRIEFING" });
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

  private canOccupy = (position: THREE.Vector3) => {
    const blockedByAabb = this.colliders.some(box =>
      box.containsPoint(new THREE.Vector3(position.x, Math.max(position.y - 1, box.min.y + 0.1), position.z))
    );
    if (blockedByAabb) return false;
    const blockedByOrientedBox = this.orientedColliders.some(collider =>
      orientedBoxContainsPoint(
        new THREE.Vector3(position.x, Math.max(position.y - 1, collider.bounds.min.y + 0.1), position.z),
        collider
      )
    );
    if (blockedByOrientedBox) return false;
    return !this.cylinderColliders.some(collider =>
      verticalCylinderContainsPoint(
        new THREE.Vector3(position.x, Math.max(position.y - 1, collider.minY + 0.1), position.z),
        collider
      )
    );
  };

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

  private canOccupyRover(position: THREE.Vector3, radius: number, height: number): boolean {
    const centerY = position.y + height * 0.45;
    return !this.colliders.some(box => {
      const x = THREE.MathUtils.clamp(position.x, box.min.x, box.max.x);
      const z = THREE.MathUtils.clamp(position.z, box.min.z, box.max.z);
      return Math.hypot(position.x - x, position.z - z) < radius && centerY + height * 0.5 > box.min.y && centerY - height * 0.5 < box.max.y;
    });
  }

  private publishRoverState() {
    const rover = this.roverSystem?.snapshot;
    if (!rover) return;
    this.set({ roverActive: rover.active, roverSpeed: rover.speed, roverView: rover.view,
      prompt: rover.active ? "[R] EXIT ROVER · [E] EXIT WHEN STOPPED · [C] CAMERA VIEW" : this.state.prompt,
      controlHint: rover.active ? "W/S drive · A/D steer · Space brake · C camera · R exit" : this.state.controlHint });
  }

  private enterRover() {
    if (this.active !== "Terrain" || !this.evaSuitActive || !this.roverSystem) return;
    this.nearby = undefined; this.player.keys.clear(); this.roverKeys.clear();
    this.player.setEVAOutdoorMotion(false);
    this.roverSystem.enter((x, z) => this.groundHeight(new THREE.Vector3(x, 0, z)));
    if (this.state.missionDay === 11) {
      this.missionManager.markSol11VehicleEntered();
      if (this.missionManager.isStepComplete("SOL11_COMPLETE_DEPARTURE_ROUTE")) this.beginSol11FinalVideo();
      else if (this.missionManager.isStepComplete("SOL11_ENTER_VEHICLE")) this.startSol11DepartureRoute();
    }
    this.set({ roverActive: true, roverSpeed: 0, roverView: this.roverSystem.snapshot.view,
      prompt: "[R] EXIT ROVER · [E] EXIT WHEN STOPPED · [C] CAMERA VIEW", controlHint: "W/S drive · A/D steer · Space brake · C camera · R exit" });
  }

  private startSol11DepartureRoute() {
    const rover = this.roverSystem?.rover;
    if (!rover || this.active !== "Terrain" || this.state.missionDay !== 11) return;
    rover.updateWorldMatrix(true, false);
    const start = rover.getWorldPosition(new THREE.Vector3());
    const direction = new THREE.Vector3(0, -1, 0).applyQuaternion(rover.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    if (direction.lengthSq() < 0.5) return;
    this.sol11RouteStart = start.clone();
    this.sol11RouteDirection = direction;
    this.sol11RouteBaseDistance = this.missionManager.getState().sol11.routeDistanceMeters;
    const routeLength = Math.max(1, 200 - this.sol11RouteBaseDistance);
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 50; i++) {
      const distance = routeLength * i / 50;
      const x = start.x + direction.x * distance, z = start.z + direction.z * distance;
      const height = this.groundHeight(new THREE.Vector3(x, 0, z));
      points.push(new THREE.Vector3(x, (Number.isFinite(height) ? height : start.y) + 1.4, z));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0x55e5f4, transparent: true, opacity: 0.92, depthTest: false });
    this.sol11RouteBeam = new THREE.Line(geometry, material);
    this.sol11RouteBeam.name = "SOL11_DEPARTURE_ROUTE_BEAM";
    this.sol11RouteBeam.renderOrder = 1000;
    this.current?.add(this.sol11RouteBeam);
    this.set({ notification: "Departure route active · follow the visible beam for 200 metres." });
  }

  private clearSol11DepartureRoute() {
    if (this.sol11RouteBeam) {
      this.sol11RouteBeam.parent?.remove(this.sol11RouteBeam);
      this.sol11RouteBeam.geometry.dispose();
      (this.sol11RouteBeam.material as THREE.Material).dispose();
      this.sol11RouteBeam = undefined;
    }
    this.sol11RouteStart = undefined;
    this.sol11RouteDirection = undefined;
  }

  private updateSol11DepartureRoute() {
    if (this.state.missionDay !== 11 || !this.roverSystem?.isActive || !this.sol11RouteStart || !this.sol11RouteDirection || this.state.finalDepartureVideo) return;
    const position = this.roverSystem.rover.getWorldPosition(new THREE.Vector3());
    const delta = new THREE.Vector3(position.x - this.sol11RouteStart.x, 0, position.z - this.sol11RouteStart.z);
    const progress = Math.min(200, this.sol11RouteBaseDistance + delta.dot(this.sol11RouteDirection));
    const lateral = Math.abs(delta.x * this.sol11RouteDirection.z - delta.z * this.sol11RouteDirection.x);
    const savedProgress = this.missionManager.getState().sol11.routeDistanceMeters;
    if (lateral < 8 && (progress >= 200 || Math.floor(progress) > Math.floor(savedProgress))) {
      this.missionManager.recordSol11RouteDistance(progress);
      if (progress >= 200 && !this.sol11FinalVideoActive) this.beginSol11FinalVideo();
    }
  }

  private beginSol11FinalVideo() {
    if (this.sol11FinalVideoActive || !this.missionManager.isStepComplete("SOL11_COMPLETE_DEPARTURE_ROUTE")) return;
    this.sol11FinalVideoActive = true;
    this.roverSystem?.exit();
    this.clearSol11DepartureRoute();
    this.set({ finalDepartureVideo: true, roverActive: false, roverSpeed: 0, prompt: "", controlHint: "" });
  }

  public finishSol11FinalVideo(): boolean {
    if (!this.sol11FinalVideoActive) return false;
    if (!this.missionManager.completeSol11FinalVideo()) return false;
    this.set({ notification: "The PHOBOSIA expedition is complete." });
    return true;
  }

  private exitRover() {
    const system = this.roverSystem;
    if (!system?.isActive) return;
    const roverPosition = system.rover.getWorldPosition(new THREE.Vector3());
    const triggerPosition = system.trigger.getWorldPosition(new THREE.Vector3());
    const towardTrigger = triggerPosition.sub(roverPosition);
    towardTrigger.y = 0;
    if (towardTrigger.lengthSq() < 1e-6) towardTrigger.set(1, 0, 0);
    towardTrigger.normalize();
    const exit = roverPosition.addScaledVector(towardTrigger, system.exitOffset);
    exit.y = this.groundHeight(exit) + this.player.eyeHeight;
    if (!this.canOccupy(exit)) { exit.addScaledVector(towardTrigger, system.exitOffset); exit.y = this.groundHeight(exit) + this.player.eyeHeight; }
    system.exit(); this.roverKeys.clear(); this.player.velocity.set(0, 0, 0);
    const forward = new THREE.Vector3(0, -1, 0).applyQuaternion(system.rover.getWorldQuaternion(new THREE.Quaternion()));
    this.player.yaw = Math.atan2(-forward.x, -forward.z);
    this.player.pitch = 0; this.camera.position.copy(exit); this.camera.rotation.set(0, this.player.yaw, 0, "YXZ"); this.player.syncBasePosition();
    this.player.setEVAOutdoorMotion(this.evaSuitActive);
    this.set({ roverActive: false, roverSpeed: 0, prompt: "[R] ENTER TERRAIN ROVER", controlHint: "W A S D move · Shift jog · Space jump · E interact · Esc unlock" });
  }

  private updateTerrainSunTransition(dt: number) {
    const sun = this.active === "Terrain"
      ? this.current?.getObjectByName("MarsSun_DirectionalLight") as THREE.DirectionalLight | undefined
      : undefined;
    if (!sun) return;
    sun.intensity = THREE.MathUtils.damp(sun.intensity, this.terrainSunIntensityTarget, 1.25, dt);
    sun.visible = sun.intensity > 0.002 || this.terrainSunIntensityTarget > 0;
    sun.castShadow = this.terrainSunIntensityTarget > 0 || sun.intensity > 0.08;
  }

  private loop = () => {
    if (this.disposed) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    for (const beacon of this.triggerMarkerBeacons) beacon.rotation.y += dt * 0.8;
    this.updateTerrainSunTransition(dt);
    this.updateNighttimeGameplayClock(dt);
    if (this.active === "Terrain" && this.nighttimeActive) {
      this.nighttimeSkyRotation = (this.nighttimeSkyRotation + NIGHTTIME_SKY_ROTATION_RADIANS_PER_SECOND * dt) % (Math.PI * 2);
      this.scene.environmentRotation.y = this.nighttimeSkyRotation;
      this.scene.backgroundRotation.y = this.nighttimeSkyRotation;
    }
    const now = Date.now();
    const evaElapsedSeconds = Math.max(0, (now - this.evaLastTickAt) / 1000);
    this.evaLastTickAt = now;
    const evaSnapshot = this.evaResources.update(
      evaElapsedSeconds,
      this.active === "Terrain" && this.evaSuitActive && !this.droneModeActive && !this.sol5DroneActive,
      now
    );
    if (Math.round(evaSnapshot.oxygenPercent * 10) !== Math.round(this.state.evaOxygenPercent * 10) ||
      Math.round(evaSnapshot.batteryPercent * 10) !== Math.round(this.state.evaBatteryPercent * 10)) {
      this.set({ evaOxygenPercent: evaSnapshot.oxygenPercent, evaBatteryPercent: evaSnapshot.batteryPercent });
    }

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
      this.audioManager.setMarsTerrain(false);
    } else if (this.droneModeActive) {
      this.updateDrone(dt);
      this.audioManager.setIndoorMovement("idle");
      this.audioManager.setMarsTerrain(false);
    } else if (this.roverSystem?.isActive) {
      this.roverSystem.update(dt, this.roverKeys, (x, z) => this.groundHeight(new THREE.Vector3(x, 0, z)), (position, radius, height) => this.canOccupyRover(position, radius, height));
      this.updateSol11DepartureRoute();
      if (this.frame % 8 === 0) this.publishRoverState();
      this.audioManager.setIndoorMovement("idle");
      this.audioManager.setMarsTerrain(this.evaSuitActive, "idle");
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
        const playerControlled = !this.droneModeActive && !this.sol5DroneActive && !this.cinematicGliding;
        const horizontalSpeed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
        const running = this.player.keys.has("ShiftLeft") || this.player.keys.has("ShiftRight");
        if (this.evaSuitActive) {
          const movementState = !this.player.grounded || horizontalSpeed <= 0.15
            ? "IDLE" as const
            : running ? "RUNNING" as const : "WALKING" as const;
          if (this.state.evaMovementState !== movementState) this.set({ evaMovementState: movementState });
          const heading = (Math.round((this.player.yaw * 180 / Math.PI + 360) % 360) + 360) % 360;
          const elevation = this.active === "Terrain" ? Math.round(this.player.lastGroundHeight * 10) / 10 : null;
          if (heading !== this.state.evaHeadingDegrees || elevation !== this.state.evaTerrainElevation) {
            this.set({ evaHeadingDegrees: heading, evaTerrainElevation: elevation });
          }
        }
        const terrainEVAActive = this.active === "Terrain" && this.evaSuitActive && playerControlled;
        this.audioManager.setIndoorMovement(resolveIndoorMovementAudioState({
          indoor: this.active !== "Terrain",
          playerControlled,
          grounded: this.player.grounded,
          horizontalSpeed,
          running
        }));
        this.audioManager.setMarsTerrain(terrainEVAActive, resolveIndoorMovementAudioState({
          indoor: terrainEVAActive,
          playerControlled,
          grounded: this.player.grounded,
          horizontalSpeed,
          running
        }));
      } else {
        this.audioManager.setIndoorMovement("idle");
        const terrainEVAActive = this.active === "Terrain" && this.evaSuitActive && !this.droneModeActive && !this.sol5DroneActive;
        this.audioManager.setMarsTerrain(terrainEVAActive, "idle");
      }
    }
    this.audioManager.update(dt);
    this.sol7Storm.update(dt);
    this.sol8PowerEffects.update(dt);

    if (this.state.transition === "loading") {
      this.transitionPlanetElapsed += dt;
      this.transitionPointer.lerp(this.transitionPointerTarget, 1 - Math.exp(-dt * 3.5));
      this.transitionPlanet.rotation.y = this.transitionPlanetElapsed * 0.075 + this.transitionPointer.x * 0.48;
      this.transitionPlanet.rotation.x = this.transitionPointer.y * 0.2;
      this.transitionPlanetMaterial.uniforms.uTime.value = this.transitionPlanetElapsed;
      this.renderer.render(this.transitionScene, this.transitionCamera);
    } else {
      const renderCamera = this.sol5DroneActive && this.sol5Flight && this.sol5CameraRig
        ? this.sol5CameraRig[this.sol5Flight.cameraView]
        : this.camera;
      this.renderer.render(this.scene, renderCamera);
    }

    if (++this.frame % 30 === 0) {
      this.set({ fps: Math.round(1 / Math.max(dt, 0.001)) });
    }
  };

  dispose() {
    if (this.sol5DroneActive) this.missionManager.abortSol5SimulationAttempt(false);
    if (this.nighttimeActive) this.persistNightSession(this.missionManager.getState().currentDay, false);
    this.sol5DroneActive = false;
    this.roverSystem?.exit();
    this.roverKeys.clear();
    this.disposed = true;
    this.clearSol11DepartureRoute();
    this.audioManager.dispose();
    this.sol7Storm.dispose();
    this.sol8PowerEffects.dispose();
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
    this.laptopScreenRenderer.dispose();
    this.laptopPositionalAudio.dispose();
    this.engineeringScreenRenderer.dispose();
    this.researchScreenRenderer.dispose();
    this.missionControlScreenRenderer.dispose();
    this.centralHubScreenRenderer.dispose();
    this.airlockScreenRenderer.dispose();
    this.screenRenderer.dispose();
    this.scene.environment = null;
    this.environmentTarget?.dispose();
    this.nighttimeEnvironmentTarget?.dispose();

    this.loaded.forEach(root => {
      const runtimeResources = new Set<THREE.BufferGeometry>();
      const runtimeMaterials = new Set<THREE.Material>();
      const disposedMaterials = new Set<THREE.Material>();
      const runtimeGroup = root.getObjectByName("Runtime interaction indicators and lighting");
      runtimeGroup?.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        runtimeResources.add(mesh.geometry);
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) runtimeMaterials.add(material);
      });
      runtimeResources.forEach(geometry => geometry.dispose());
      runtimeMaterials.forEach(material => material.dispose());
      runtimeMaterials.forEach(material => disposedMaterials.add(material));
      root.traverse(o => {
        const light = o as THREE.SpotLight;
        if (light.isSpotLight && light.name.endsWith("_NightSpot")) light.shadow.map?.dispose();
        const directional = o as THREE.DirectionalLight;
        if (directional.isDirectionalLight && directional.name === "MarsSun_DirectionalLight") directional.shadow.map?.dispose();
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (!runtimeResources.has(mesh.geometry)) {
          for (const item of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            if (!disposedMaterials.has(item)) { item.dispose(); disposedMaterials.add(item); }
          }
        }
      });
    });

    this.renderer.dispose();
    this.transitionPlanet.geometry.dispose();
    this.transitionPlanetMaterial.dispose();
    this.transitionScene.traverse(object => {
      const points = object as THREE.Points;
      if (!points.isPoints) return;
      points.geometry.dispose();
      (points.material as THREE.Material).dispose();
    });
    this.renderer.domElement.remove();
  }
}
