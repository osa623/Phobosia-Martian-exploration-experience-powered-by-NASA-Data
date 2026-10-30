import type {
  GeologicalSurveyRecord,
  SurfaceObservationRecord,
  ScienceAnalysisRecord,
  DroneSurveyRecord
} from "./MissionManager";

export type TransitionPhase = "" | "loading" | "video" | "error";

export type ObjectiveState = "not_started" | "in_progress" | "completed" | "waiting_for_rest";

export interface DroneTelemetryData {
  battery: number;
  signal: number;
  altitude: number;
  x: number;
  z: number;
}

export interface GameState {
  ready: boolean;
  module: string;
  prompt: string;
  panel: string;
  error: string;
  fps: number;
  transition: TransitionPhase;
  transitionLabel: string;
  transitionProgress: number | null;

  // Mission & Progression state
  missionDay: number;
  missionTitle: string;
  objectiveTitle: string;
  objectiveState: ObjectiveState;
  completedStepCount: number;
  totalStepCount: number;
  dayBriefingSeen: boolean;
  showBriefingModal: boolean;
  briefingText: string;
  primaryObjective: string;
  controlHint: string;
  isOutdoorTerrain: boolean;
  showRoutePlanning: boolean;
  selectedRouteTargetId: string | null;
  notification: string | null;
  restFeedback: {
    type: "success" | "blocked";
    message: string;
    missingTasks?: { title: string; zone: string }[];
  } | null;
  restTransition: "out" | "in" | null;

  // Phase 3 dedicated UI states & records
  geologicalSurvey: GeologicalSurveyRecord | null;
  surfaceObservation: SurfaceObservationRecord | null;
  scienceAnalysis: ScienceAnalysisRecord | null;
  droneSurvey: DroneSurveyRecord | null;

  showGeologicalForm: boolean;
  showSurfaceObservationForm: boolean;
  showScienceAnalysisModal: boolean;
  showDroneConsoleModal: boolean;

  droneModeActive: boolean;
  droneTelemetry: DroneTelemetryData;

  // Cinematic screen interaction + PHOBOSIA OS Desktop
  showCinematicOverlay: boolean;
  showOSDesktop: boolean;
  osInitialApp?: string;

  // Day 1 Camera Presentation Banner
  cameraPresentation: {
    active: boolean;
    title: string;
    description: string;
    skipPrompt: string;
  } | null;
}

export type SetState = (value: GameState) => void;
