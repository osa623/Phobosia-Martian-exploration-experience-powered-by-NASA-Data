"use client";

import { PhobosiaOS } from "@/components/game/PhobosiaOS";
import type { GameState } from "@/core/EventBus";

const mockState: GameState = {
  ready: true,
  module: "Habitat",
  prompt: "",
  panel: "",
  error: "",
  fps: 60,
  transition: "",
  transitionLabel: "",
  transitionProgress: null,
  missionDay: 5,
  missionTitle: "Master Terrain Route Planning",
  objectiveTitle: "Review candidate observation sites across Master Terrain and confirm route",
  objectiveState: "in_progress",
  completedStepCount: 1,
  totalStepCount: 3,
  dayBriefingSeen: true,
  showBriefingModal: false,
  briefingText: "",
  primaryObjective: "Review candidate observation sites across Master Terrain and confirm route",
  controlHint: "",
  isOutdoorTerrain: false,
  showRoutePlanning: false,
  selectedRouteTargetId: "TARGET_ALPHA_CRATER_RIM",
  notification: null,
  restFeedback: null,
  geologicalSurvey: null,
  surfaceObservation: null,
  scienceAnalysis: null,
  droneSurvey: null,
  showGeologicalForm: false,
  showSurfaceObservationForm: false,
  showScienceAnalysisModal: false,
  showDroneConsoleModal: false,
  droneModeActive: false,
  droneTelemetry: { battery: 88, signal: 96, altitude: 15, x: 470, z: -58.7 },
  showCinematicOverlay: false,
  showOSDesktop: true,
  osInitialApp: undefined,
  cameraPresentation: null
};

export default function OSPreviewPage() {
  return (
    <div style={{ width: "100vw", height: "100vh", background: "#3c4046", display: "grid", placeItems: "center" }}>
      <PhobosiaOS game={null} state={mockState} onClose={() => {}} />
    </div>
  );
}
