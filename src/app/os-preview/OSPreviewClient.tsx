"use client";

import { PhobosiaOS } from "@/components/game/PhobosiaOS";
import type { GameState } from "@/core/EventBus";

const mockState: GameState = {
  ready: true, module: "Habitat", prompt: "", panel: "", error: "", fps: 60, transition: "", transitionLabel: "", transitionProgress: null,
  missionDay: 5, missionTitle: "Master Terrain Route Planning", objectiveTitle: "Review candidate observation sites across Master Terrain and confirm route",
  objectiveState: "in_progress", completedStepCount: 1, totalStepCount: 3, dayBriefingSeen: true, showBriefingModal: false, briefingText: "",
  primaryObjective: "Review candidate observation sites across Master Terrain and confirm route", controlHint: "", isOutdoorTerrain: false,
  evaSuitActive: false, evaMovementState: "IDLE", evaOxygenPercent: 100, evaBatteryPercent: 100, evaHeadingDegrees: 0, evaTerrainElevation: null,
  showRoutePlanning: false, selectedRouteTargetId: "TARGET_ALPHA_CRATER_RIM", notification: null, navigationInstruction: null, restFeedback: null,
  restTransition: null, geologicalSurvey: null, surfaceObservation: null, scienceAnalysis: null, droneSurvey: null, showGeologicalForm: false,
  showSurfaceObservationForm: false, showScienceAnalysisModal: false, showDroneConsoleModal: false, droneModeActive: false, roverActive: false,
  roverSpeed: 0, roverView: "FIRST PERSON", droneTelemetry: { battery: 88, signal: 96, altitude: 15, x: 470, z: -58.7 },
  sol5DroneActive: false, sol5LandingPromptActive: false, sol5Telemetry: null, sol5Images: [], sol5Flight: null, sol5Message: null,
  finalDepartureVideo: false, showCinematicOverlay: false, showOSDesktop: true, showPersonalLaptop: false, osInitialApp: undefined, cameraPresentation: null,
};

export default function OSPreviewClient() {
  return <div className="grid h-screen w-screen place-items-center bg-[#3c4046]"><PhobosiaOS game={null} state={mockState} onClose={() => {}} /></div>;
}
