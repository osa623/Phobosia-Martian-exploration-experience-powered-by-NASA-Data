/**
 * PHOBOSIA — Mission System & State Progression Engine (Days 1–9)
 *
 * Implements the authoritative Days 1-9 mission sequence, step validation,
 * observation/verification/survey record persistence, and guarded rest-based day progression.
 */

import { DAY1_TASKS, DAY1_ZONES, TRIGGER_TO_TASK_MAP } from "./Day1Config";
import { SOL2_INVESTIGATION_RULES } from "../missions/sol-02/taskDefinitions";
import { SOL3_DATASET_IDS } from "../missions/sol-03/taskDefinitions";
import { resolveNextMissionNavigation } from "../systems/navigation/missionNavigation";
import sol03Mission from "../jsons/Missions/sol-03.json";
import { SOL5_TASKS } from "../missions/sol-05/taskDefinitions";
import { SOL06_TASKS, type Sol6AnalysisRecord, type Sol6CultivationExperiment, type Sol6FieldObservation, type Sol6Report, type Sol6SampleRecord } from "../missions/SOL_06/taskDefinitions";
import sol06Mission from "../jsons/Missions/sol-06.json";
import { SOL07_TASKS, createInitialSol7Progress, type Sol7Progress, type Sol7TaskId, type Sol7PowerAssessment } from "../missions/sol-07/taskDefinitions";

export type MissionDayNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type ObjectiveState = "not_started" | "in_progress" | "completed" | "waiting_for_rest";

export interface MissionStep {
  stepId: string;
  label: string;
  description: string;
  targetModule?: string;
  targetTrigger?: string;
  completed: boolean;
  requiresCompletedTasks?: string[];
}

export interface MissionTaskCard {
  id: string;
  title: string;
  description: string;
  status: "locked" | "available" | "in_progress" | "completed";
  steps: MissionStep[];
  targetTrigger?: string;
  moduleName: string;
  sectionName: string;
  interfaceName: string;
  viewName?: string;
  prerequisiteTaskTitles: string[];
}

const TRIGGER_GUIDANCE: Record<string, { moduleName: string; sectionName: string; interfaceName: string; viewName?: string }> = {
  HAB_MONITOR_01: { moduleName: "Habitat", sectionName: "Main Monitor", interfaceName: "Habitat Main Monitor" },
  HAB_WATER_NUTRITION_01: { moduleName: "Habitat", sectionName: "Water and Nutrition Station", interfaceName: "Water and Nutrition" },
  Engineering_Monitoring_Trigger: { moduleName: "Engineering Unit", sectionName: "Monitoring Section", interfaceName: "Engineering Monitoring" },
  Engineering_PowerUnit_Trigger: { moduleName: "Engineering Unit", sectionName: "Power Unit", interfaceName: "Power Unit Interface" },
  Engineering_LifeSupport_Trigger: { moduleName: "Engineering Unit", sectionName: "Life Support Section", interfaceName: "Engineering Life Support" },
  Engineering_Diagnostics_Trigger: { moduleName: "Engineering Unit", sectionName: "Diagnostics Workbench", interfaceName: "Diagnostics Interface" },
  Engineering_InfoDisplay_Trigger: { moduleName: "Engineering Unit", sectionName: "Storage Section", interfaceName: "Storage Interface" },
  MC_MAIN_01: { moduleName: "Mission Control", sectionName: "Main Operations Console", interfaceName: "Mission Control Main" },
  MC_SYSTEMS_01: { moduleName: "Mission Control", sectionName: "Systems Console", interfaceName: "Mission Control Systems" },
  MC_NAVIGATION_01: { moduleName: "Mission Control", sectionName: "Navigation Console", interfaceName: "Mission Control Navigation" },
  LAB_RESEARCH_ANALYSIS_01: { moduleName: "Research Laboratory", sectionName: "Analysis Station", interfaceName: "Research Analysis" },
  LAB_RESEARCH_MONITORING_01: { moduleName: "Research Laboratory", sectionName: "Monitoring Station", interfaceName: "Research Monitoring" },
  Airlock_Control_Console_Trigger: { moduleName: "Airlock", sectionName: "Control Console", interfaceName: "Airlock Control Console" },
  Spwaning_Position: { moduleName: "Mars Terrain", sectionName: "Airlock Return Entrance", interfaceName: "Existing Airlock Return Transition" },
  HAB_REST_01: { moduleName: "Habitat", sectionName: "Rest Area", interfaceName: "Habitat Rest Area" },
  Drone: { moduleName: "Drone Section", sectionName: "Drone Inspection Area", interfaceName: "Physical Drone Inspection" }
};

const TASK_VIEW_NAMES: Record<string, string> = {
  SOL02_HABITAT_STATUS: "Main Status, Life Support, and Emergency Status views",
  SOL02_WATER_NUTRITION: "Water and Nutrition view",
  SOL02_ENGINEERING_MONITORING: "Monitoring overview",
  SOL02_POWER_REVIEW: "Power status and logs",
  SOL02_ENGINEERING_LIFESUPPORT: "Engineering Life Support records",
  SOL02_DIAGNOSTICS: "Diagnostics records",
  SOL02_READINESS_ASSESSMENT: "Readiness assessment",
  SOL03_MISSION_CONTEXT: "Objectives, Outpost Status, and Mission Overview views",
  SOL03_OBSERVATION_SITE_REVIEW: "Observation Sites view",
  SOL03_SYSTEM_CONSTRAINTS: "Communications and Systems views",
  SOL03_SELECT_TARGET: "Observation Sites view",
  SOL03_SELECT_DATASET: "Dataset analysis view",
  SOL03_SUBMIT_TARGET_RECORD: "Target proposal review",
  D1_DRONE_SECTION: "Physical inspection of the existing drone",
  SOL05_PREFLIGHT_BRIEFING: "Sol 5 preflight briefing and target validation",
  SOL05_ACTIVATE_SIMULATION: "Drone simulation activation",
  SOL05_AERIAL_RECONNAISSANCE: "Manual flight to and inspection of the selected target",
  SOL05_SAFE_LANDING: "Player-confirmed landing on the designated pad",
  SOL05_REVIEW_IMAGES: "Review target-linked mission-provided imagery",
  SOL05_SUBMIT_REPORT: "Aerial reconnaissance report"
};

export interface ObservationRecord {
  id: string;
  day: number;
  type:
    | "orientation"
    | "habitat_readiness"
    | "power_observation"
    | "life_support_verification"
    | "route_plan"
    | "geological_survey"
    | "surface_observation"
    | "science_analysis"
    | "drone_survey";
  sourceIdentifier: string;
  timestamp: string;
  isSimulated: true;
  summary: string;
  details: Record<string, string | number | boolean>;
}

export interface TerrainRouteTarget {
  id: string;
  name: string;
  coordinates: { x: number; y: number; z: number };
  description: string;
  distanceEstimate: string;
  hazardRating: "Low" | "Moderate" | "High";
}

export interface GeologicalSurveyRecord {
  id: string;
  day: 6;
  targetId: string;
  source: "PHOBOSIA simulated field observation";
  observedCategories: {
    surfaceTexture: string;
    fragmentDistribution: string;
    terrainShape: string;
    dustCoverage: string;
    followUpInterest?: string;
  };
  summary: string;
  isSimulated: true;
  saved: true;
  routePlanReference?: string | null;
  missionTimestamp?: string;
}

export interface SurfaceObservationRecord {
  id: string;
  day: 7;
  targetId: string;
  source: "PHOBOSIA simulated surface observation";
  observedCategories: {
    surfacePattern: string;
    surfaceMaterialAppearance: string;
    terrainProfile: string;
    areaOfInterest: string;
  };
  followUpQuestion: string;
  summary: string;
  isSimulated: true;
  saved: true;
  missionTimestamp?: string;
  relatedGeologicalSurveyId?: string | null;
}

export interface PredefinedInterpretation {
  id: string;
  label: string;
  description: string;
  claimStrength: "Tentative" | "Moderate" | "Definitive";
}

export const PREDEFINED_INTERPRETATIONS: PredefinedInterpretation[] = [
  {
    id: "INTERPRETATION_SURFACE_PATTERN_REVIEW",
    label: "Surface pattern requires further observation",
    description: "The recorded surface pattern may justify a follow-up visual inspection.",
    claimStrength: "Tentative"
  },
  {
    id: "INTERPRETATION_TERRAIN_VARIATION",
    label: "Terrain variation is a useful survey factor",
    description: "Differences in the recorded terrain profile may help prioritise a future observation point.",
    claimStrength: "Tentative"
  },
  {
    id: "INTERPRETATION_DUST_COVERAGE",
    label: "Dust coverage should be considered",
    description: "The recorded dust coverage may affect how visible surface features are interpreted.",
    claimStrength: "Tentative"
  }
];

export interface ScienceAnalysisRecord {
  id: string;
  day: 8;
  sourceObservationId: string;
  selectedInterpretationId: string;
  summary: string;
  isSimulated: true;
  saved: true;
  comparedSurveyId?: string | null;
  comparisonSummary?: string;
  missionTimestamp?: string;
}

export interface DroneSurveyRecord {
  id: string;
  day: 9;
  targetId: string;
  source: "PHOBOSIA simulated remote drone survey";
  observedCategories: {
    viewpointTerrainShape: string;
    visibleSurfacePattern: string;
    followUpArea: string;
    routeRevisit: string;
  };
  summary: string;
  isSimulated: true;
  saved: true;
  missionTimestamp?: string;
  relatedGeologicalSurveyId?: string | null;
  relatedSurfaceObservationId?: string | null;
}

export interface Sol5ImageRecord {
  id: string; sequence: number; targetId: string; assetPath: string; fileName: string;
}
export type Sol5AttemptStatus = "not_started" | "active" | "aborted" | "completed";
export interface Sol5FlightSnapshot {
  targetId: string; status: "ready" | "flying" | "landed" | "aborted";
  takeoff: { x: number; y: number; z: number }; position: { x: number; y: number; z: number };
  elapsedSeconds: number; totalDistanceM: number; maxAltitudeAglM: number; speedMps: number;
  batteryPercent: number; signalPercent: number; cameraView: string; landed: boolean;
}
export interface Sol5ReconnaissanceReport {
  id: string; targetId: string; submittedAt: string; flight: Sol5FlightSnapshot;
  imageIds: string[]; observedFeatures: string; playerInterpretation: string;
  uncertainties: string; groundFollowUp: string;
}
export interface Sol5MissionProgress {
  briefingConfirmed: boolean; simulationActivated: boolean; optionalDroneInspection: boolean;
  attemptStatus: Sol5AttemptStatus; targetReached: boolean;
  targetInspected: boolean; evidenceLoaded: boolean;
  flight: Sol5FlightSnapshot | null; images: Sol5ImageRecord[]; imagesReviewed: boolean;
  report: Sol5ReconnaissanceReport | null;
}
const createInitialSol5Progress = (): Sol5MissionProgress => ({
  briefingConfirmed: false, simulationActivated: false, optionalDroneInspection: false,
  attemptStatus: "not_started", targetReached: false,
  targetInspected: false, evidenceLoaded: false,
  flight: null, images: [], imagesReviewed: false, report: null
});

export interface DayMissionDefinition {
  day: MissionDayNumber;
  id: string;
  title: string;
  storyContext: string;
  briefing: string;
  primaryObjective: string;
  steps: MissionStep[];
  allowedModules: string[];
  completionFeedback: string;
}

export interface MissionProgressState {
  currentDay: MissionDayNumber;
  objectiveState: ObjectiveState;
  completedStepIds: string[];
  completedIntroductionIds: string[];
  observationRecords: ObservationRecord[];
  selectedRouteTarget: TerrainRouteTarget | null;
  dayBriefingSeen: boolean;
  campaignFinished: boolean;
  notification: string | null;
  geologicalSurvey: GeologicalSurveyRecord | null;
  surfaceObservation: SurfaceObservationRecord | null;
  scienceAnalysis: ScienceAnalysisRecord | null;
  droneSurvey: DroneSurveyRecord | null;
  investigationRecords: InvestigationRecord[];
  selectedSiteId: string | null;
  sol5: Sol5MissionProgress;
  sol6: Sol6MissionProgress;
  sol7: Sol7Progress;
}

export interface Sol6MissionProgress {
  equipmentPrepared: boolean;
  evaActive: boolean;
  targetReached: boolean;
  fieldObservations: Sol6FieldObservation[];
  sample: Sol6SampleRecord | null;
  analysis: Sol6AnalysisRecord | null;
  cultivation: Sol6CultivationExperiment | null;
  report: Sol6Report | null;
}

const createInitialSol6Progress = (): Sol6MissionProgress => ({ equipmentPrepared: false, evaActive: false, targetReached: false, fieldObservations: [], sample: null, analysis: null, cultivation: null, report: null });
const sol6Steps = SOL06_TASKS.map(task => ({ stepId: task.stepId, label: task.label, description: task.description, targetTrigger: "targetTrigger" in task ? task.targetTrigger : undefined, targetModule: "targetModule" in task ? task.targetModule : undefined, requiresCompletedTasks: [...("requiresCompletedTasks" in task ? task.requiresCompletedTasks ?? [] : [])], completed: false }));

export interface InvestigationRecord {
  id: string; missionId: string; sol: number; taskId: string; triggerId: string; systemId: string;
  evidenceReferences: string[]; classification: string; rationale: string;
  limitations: string[]; sourceType: string; submittedAt: string; recommendedFollowUp?: string;
  playerConclusion: string; playerComment: string; systemValidation: string; dataProvenance: string[]; scientificQuestion?: string;
}

const STORAGE_KEY = "phobosia_mission_progress_v4";
const SOL5_EVIDENCE_ROOTS: Record<string, string> = {
  TARGET_ALPHA_CRATER_RIM: "/assets/images/Selected_Missions/target_01/",
  TARGET_BETA_DUNE_BASIN: "/assets/images/Selected_Missions/target_02/",
  TARGET_GAMMA_SOUTH_ESCARPMENT: "/assets/images/Selected_Missions/target_03/"
};
const V3_STORAGE_KEY = "phobosia_mission_progress_v3";
const PREV_STORAGE_KEY = "phobosia_mission_progress_v2";

export const MASTER_TERRAIN_TARGETS: TerrainRouteTarget[] = [
  {
    id: "TARGET_ALPHA_CRATER_RIM",
    name: "Site Alpha — North Crater Rim Ridge",
    coordinates: { x: 420.5, y: 14.2, z: -180.0 },
    description: "Elevated bedrock outcrop overlooking northern impact basin. High scientific value for stratified ejecta sampling.",
    distanceEstimate: "240 m NW from Airlock",
    hazardRating: "Moderate"
  },
  {
    id: "TARGET_BETA_DUNE_BASIN",
    name: "Site Beta — Dune Basin Depression",
    coordinates: { x: 485.0, y: 2.1, z: -95.5 },
    description: "Active basaltic sand dune field adjacent to the rover staging platform. Optimal for aeolian sedimentation study.",
    distanceEstimate: "85 m E from Airlock",
    hazardRating: "Low"
  },
  {
    id: "TARGET_GAMMA_SOUTH_ESCARPMENT",
    name: "Site Gamma — Canyon Overlook Escarpment",
    coordinates: { x: 60.7, y: -0.02, z: -265.1 },
    description: "Cliff edge at Cinematic Location overlooking deep Martian canyon. Prime geological vantage point.",
    distanceEstimate: "450 m SW from Base",
    hazardRating: "High"
  }
];

export const DAYS_CONFIG: Record<MissionDayNumber, DayMissionDefinition> = {
  1: {
    day: 1,
    id: "DAY_01_OUTPOST_ORIENTATION",
    title: "Outpost Orientation",
    storyContext: "Beginning of the 14-day Mars observation expedition. Operational systems are online.",
    briefing: "Welcome to Mars Outpost PHOBOSIA. Before commencing scientific field observations, explore the base, inspect each operational zone and system console, and complete the Day 1 orientation checklist.",
    primaryObjective: `Explore the outpost, inspect the required systems and consoles across all modules, and complete the ${DAY1_TASKS.filter(task => task.required).length}-task orientation checklist.`,
    steps: DAY1_TASKS.filter(t => t.required).map(t => ({
      stepId: t.taskId,
      label: t.title,
      description: t.description,
      completed: false
    })),
    allowedModules: ["Habitat", "Hub", "Airlock", "Engineering", "Science", "MissionControl", "Drone"],
    completionFeedback: `Outpost orientation complete. All ${DAY1_TASKS.filter(task => task.required).length} required tasks are complete. Return to Habitat Rest Area to finish Day 1.`
  },
  2: {
    day: 2,
    id: "DAY_02_OUTPOST_READINESS",
    title: "Outpost Readiness",
    storyContext: "Review simulated outpost records and document evidence limits before scientific operations.",
    briefing: "Inspect Habitat and Engineering records, submit evidence-linked investigations, then submit a readiness assessment.",
    primaryObjective: "Submit six system investigations and a readiness record based on those records.",
    steps: [
      ["SOL02_HABITAT_STATUS", "Habitat status inspection", "Inspect Habitat status records.", "HAB_MONITOR_01"],
      ["SOL02_WATER_NUTRITION", "Water and nutrition inspection", "Inspect supply status and logs.", "HAB_WATER_NUTRITION_01"],
      ["SOL02_ENGINEERING_MONITORING", "Engineering monitoring inspection", "Review monitoring records.", "Engineering_Monitoring_Trigger"],
      ["SOL02_POWER_REVIEW", "Power unit investigation", "Investigate power records and their limits.", "Engineering_PowerUnit_Trigger"],
      ["SOL02_ENGINEERING_LIFESUPPORT", "Engineering life-support inspection", "Review environmental and recycling records.", "Engineering_LifeSupport_Trigger"],
      ["SOL02_DIAGNOSTICS", "Diagnostics inspection", "Review diagnostic records and follow-up needs.", "Engineering_Diagnostics_Trigger"],
      ["SOL02_READINESS_ASSESSMENT", "Outpost readiness assessment", "Submit an assessment referencing the six investigations.", "HAB_MONITOR_01"]
    ].map(([stepId, label, description, targetTrigger]) => ({ stepId, label, description, targetTrigger, completed: false })),
    allowedModules: ["Habitat", "Engineering", "Hub"],
    completionFeedback: "Readiness record submitted. Return to Habitat to conclude Sol 2."
  },
  3: {
    day: 3,
    id: "DAY_03_SCIENTIFIC_TARGET_SELECTION",
    title: "Scientific Target Selection",
    storyContext: "Use PHOBOSIA training records to prepare a constrained observation proposal.",
    briefing: "Review mission context, compare the in-game target profiles and constraints, then submit a target and dataset proposal with limitations.",
    primaryObjective: "Submit an evidence-referenced target proposal using the available simulated training metadata.",
    steps: [
      ["SOL03_MISSION_CONTEXT", "Mission context review", "Review the Sol 2 readiness record and mission context.", "MC_MAIN_01"],
      ["SOL03_OBSERVATION_SITE_REVIEW", "Compare Target A, Target B, and Target C", "Review and reference all three in-game target profiles and their available imagery.", "MC_NAVIGATION_01"],
      ["SOL03_SYSTEM_CONSTRAINTS", "Systems and communications constraints", "Review simulated operational constraints.", "MC_SYSTEMS_01"],
      ["SOL03_SELECT_TARGET", "Select a proposed scientific target", "Choose or revise one proposed target and focused scientific question. It becomes official only after the final proposal is validated.", "MC_NAVIGATION_01"],
      ["SOL03_SELECT_DATASET", "Select and evaluate a dataset", "Evaluate the available training metadata.", "LAB_RESEARCH_ANALYSIS_01"],
      ["SOL03_SUBMIT_TARGET_RECORD", "Submit target proposal", "Review and submit the complete proposal.", "MC_MAIN_01"]
    ].map(([stepId, label, description, targetTrigger]) => ({ stepId, label, description, targetTrigger, completed: false })),
    allowedModules: ["MissionControl", "Science", "Hub", "Habitat"],
    completionFeedback: "Target proposal submitted. Return to Habitat to conclude Sol 3."
  },
  4: {
    day: 4,
    id: "DAY_04_LIFE_SUPPORT_VERIFICATION",
    title: "Selected Target Investigation and Drone Mission Preparation",
    storyContext: "The target submitted and validated during Sol 3 is now the focus of a careful scientific review. Mission Control and the Research Lab support the investigation; the Drone Section must be visited physically for inspection. The drone remains grounded until Sol 5.",
    briefing: "Continue with the target you selected during Sol 3; do not choose another. Review its available records in Mission Control, assess datasets and terrain evidence in the Research Lab, then physically visit and inspect the drone. Prepare the Sol 5 aerial observation plan and submit the preliminary assessment. No drone flight takes place today.",
    primaryObjective: "Investigate the selected target, assess evidence and terrain limitations, inspect the drone in person, and submit the Sol 5 preparation report.",
    steps: [
      { stepId: "SOL04_MISSION_CONTEXT", label: "Review Sol 4 Mission Objectives", description: "Review the selected target and Sol 4 constraints.", targetTrigger: "MC_MAIN_01", completed: false },
      { stepId: "SOL04_SELECTED_TARGET_INVESTIGATION", label: "Investigate Selected Observation Target", description: "Review available records for the Sol 3 target and record uncertainties.", targetTrigger: "MC_NAVIGATION_01", completed: false, requiresCompletedTasks: ["SOL04_MISSION_CONTEXT"] },
      { stepId: "SOL04_TERRAIN_DATA_REVIEW", label: "Review Terrain and Scientific Dataset Evidence", description: "Assess available datasets and terrain evidence in the Research Lab.", targetTrigger: "LAB_RESEARCH_ANALYSIS_01", completed: false, requiresCompletedTasks: ["SOL04_SELECTED_TARGET_INVESTIGATION"] },
      { stepId: "SOL04_DRONE_PHYSICAL_INSPECTION", label: "Visit and Inspect the Drone", description: "Physically enter the Drone Section and interact with the existing drone.", targetModule: "Drone Section", completed: false, requiresCompletedTasks: ["SOL04_MISSION_CONTEXT"] },
      { stepId: "SOL04_DRONE_MISSION_PLAN", label: "Prepare the Sol 5 Drone Observation Plan", description: "Prepare observation objectives and constraints for Sol 5.", targetTrigger: "MC_NAVIGATION_01", completed: false, requiresCompletedTasks: ["SOL04_SELECTED_TARGET_INVESTIGATION", "SOL04_TERRAIN_DATA_REVIEW", "SOL04_DRONE_PHYSICAL_INSPECTION"] },
      { stepId: "SOL04_SUBMIT_PREPARATION_REPORT", label: "Submit the Preliminary Terrain Assessment and Preparation Report", description: "Submit the evidence-linked Sol 4 assessment and preparation report.", targetTrigger: "MC_MAIN_01", completed: false, requiresCompletedTasks: ["SOL04_MISSION_CONTEXT", "SOL04_SELECTED_TARGET_INVESTIGATION", "SOL04_TERRAIN_DATA_REVIEW", "SOL04_DRONE_PHYSICAL_INSPECTION", "SOL04_DRONE_MISSION_PLAN"] }
    ],
    allowedModules: ["MissionControl", "Science", "Drone", "Hub", "Habitat"],
    completionFeedback: "Sol 4 preparation report validated. Return to Habitat Rest Area to begin Sol 5."
  },
  5: {
    day: 5,
    id: "DAY_05_DRONE_AERIAL_RECONNAISSANCE",
    title: "Drone-Based Aerial Reconnaissance",
    storyContext: "Manually fly the existing drone from Drone_TakeoffPoint to inspect the target submitted during Sol 3, review its prepared evidence, and return safely.",
    briefing: "At Mission Control, confirm the target-specific briefing and controls. Fly from the designated pad to the official target using the visual guide, press E in the valid inspection area to load mission-provided evidence, then follow the return guide and large beacon to the pad. Press E to land; when the on-pad completion prompt appears, press G to complete the landing objective and return to Mission Control. Review the evidence and submit the report.",
    primaryObjective: "Manually inspect the official target, review its prepared evidence, follow the landing beacon to the designated pad, and press G to confirm the landing before submitting the report.",
    steps: SOL5_TASKS.map(task => ({ ...task, completed: false })),
    allowedModules: ["MissionControl", "Hub", "Habitat", "Terrain", "Drone"],
    completionFeedback: "Sol 5 reconnaissance report submitted. Return to Habitat Rest Area to begin the next mission day."
  },  6: {
    day: 6,
    id: "DAY_06_GEOLOGICAL_SITE_SURVEY",
    title: sol06Mission.title,
    storyContext: "Continue on foot to the official Sol 3 target, document field observations, secure a provenance-linked sample, return through the Airlock, and begin laboratory analysis.",
    briefing: sol06Mission.description,
    primaryObjective: "Complete the target-linked field investigation, sample transfer and analysis, start the pending Sol 8 cultivation experiment, and submit the Sol 6 report.",
    steps: sol6Steps,
    allowedModules: ["MissionControl", "Hub", "Habitat", "Airlock", "Terrain", "Science"],
    completionFeedback: "Sol 6 surface investigation report validated. Cultivation results remain pending for Sol 8. Return to Habitat Rest Area to conclude Sol 6."
  },
  7: {
    day: 7,
    id: "PHOBOSIA_SOL_07_DUST_STORM_ASSESSMENT",
    title: "Dust Storm Emergency Assessment",
    storyContext: "A gameplay-simulated dust storm has activated the outpost emergency assessment. Outdoor access is temporarily restricted through the shared EVA policy.",
    briefing: "Complete Tasks 1–6 in order using existing unit screens, then submit the impact report in Engineering. Outdoor access remains restricted until report validation.",
    primaryObjective: "Assess storm safety, outpost systems, EVA lockdown, science power and Engineering power; submit the final impact report.",
    steps: SOL07_TASKS.map(task => ({ stepId: task.stepId, label: task.label, description: task.description, targetTrigger: task.targetTrigger, requiresCompletedTasks: task.stepId === "SOL07_SUBMIT_STORM_REPORT" ? SOL07_TASKS.slice(0, 6).map(item => item.stepId) : undefined, completed: false })),
    allowedModules: ["Habitat", "MissionControl", "Hub", "Airlock", "Science", "Engineering"],
    completionFeedback: "Sol 7 storm assessment validated. Post-storm power assessment saved for Sol 8. Sol 8 has not been started."
  },
  8: {
    day: 8,
    id: "DAY_08_RESEARCH_LAB_ANALYSIS",
    title: "Research Lab Analysis",
    storyContext: "Scientific Analysis Phase. Analysis of Day 7 surface observation in the Research Lab.",
    briefing: "Proceed to the Research Lab. Access the Analysis console to inspect your Day 7 surface observation, cross-reference earlier geological survey notes, select a cautious scientific interpretation, and log the final analysis record.",
    primaryObjective: "Review Day 7 surface observation in Research Lab, compare earlier survey data, select interpretation, and save scientific analysis.",
    steps: [
      { stepId: "D8_OBJ_01_OPEN_SOURCE_RECORD", label: "Open Day 7 record", description: "Open saved Day 7 surface observation in Research Lab interface.", targetTrigger: "LAB_RESEARCH_ANALYSIS_01", completed: false },
      { stepId: "D8_OBJ_02_REVIEW_COMPARISON", label: "Review comparison data", description: "Compare surface observation with Day 6 geological survey notes.", targetTrigger: "LAB_RESEARCH_ANALYSIS_01", completed: false },
      { stepId: "D8_OBJ_03_SELECT_INTERPRETATION", label: "Select interpretation", description: "Select a supported scientific interpretation.", targetTrigger: "LAB_RESEARCH_ANALYSIS_01", completed: false },
      { stepId: "D8_OBJ_04_SAVE_ANALYSIS", label: "Save scientific analysis", description: "Save ScienceAnalysisRecord linked to Day 7 source data.", targetTrigger: "LAB_RESEARCH_ANALYSIS_01", completed: false }
    ],
    allowedModules: ["Science", "Hub", "Habitat", "MissionControl"],
    completionFeedback: "Scientific analysis confirmed and archived. Laboratory review complete. Rest in Habitat to conclude Day 8."
  },
  9: {
    day: 9,
    id: "DAY_09_DRONE_SURVEY",
    title: "Drone Survey",
    storyContext: "Remote Surface Survey Phase. First-person remote FPV drone survey over Mars terrain operated from Mission Control.",
    briefing: "Mission Control has authorized a remote aerial survey over the terrain using the scout drone. Access the Drone Operation console in Mission Control, engage first-person FPV mode, survey the designated sector, capture telemetry, and return safely to Mission Control.",
    primaryObjective: "Engage Drone FPV mode from Mission Control, conduct aerial survey of target sector, capture survey record, and return to base.",
    steps: [
      { stepId: "D9_OBJ_01_REVIEW_DRONE_TASK", label: "Review drone mission", description: "Review remote survey console in Mission Control.", targetTrigger: "MC_SYSTEMS_01", completed: false },
      { stepId: "D9_OBJ_02_ACTIVATE_FPV", label: "Activate drone FPV", description: "Engage first-person remote FPV camera view.", completed: false },
      { stepId: "D9_OBJ_03_INSPECT_TARGET", label: "Survey target sector", description: "Maneuver drone over terrain survey sector.", completed: false },
      { stepId: "D9_OBJ_04_SAVE_DRONE_RECORD", label: "Save drone survey record", description: "Capture and save DroneSurveyRecord telemetry.", completed: false },
      { stepId: "D9_OBJ_05_EXIT_FPV", label: "Return to Mission Control", description: "Disengage FPV and restore astronaut controls.", completed: false }
    ],
    allowedModules: ["MissionControl", "Hub", "Habitat"],
    completionFeedback: "Drone survey complete. Remote telemetry archived. Astronaut controls restored. Day 9 marks completion of Phase 3."
  }
};

export function getMissionTaskProgressFor(day: MissionDayNumber, completedStepIds: readonly string[]): { completed: number; total: number; remaining: number } {
  const completedSet = new Set(completedStepIds);
  if (day === 1) {
    const required = DAY1_TASKS.filter(task => task.required);
    const completed = required.filter(task => completedSet.has(task.taskId)).length;
    return { completed, total: required.length, remaining: required.length - completed };
  }
  const steps = DAYS_CONFIG[day].steps;
  // Sols 2–5 expose the validated mission tasks individually; later legacy days
  // retain their existing single-objective progress treatment.
  const total = day >= 2 && day <= 7 ? steps.length : steps.length ? 1 : 0;
  const completed = day >= 2 && day <= 7
    ? new Set(steps.filter(step => completedSet.has(step.stepId)).map(step => step.stepId)).size
    : total > 0 && steps.every(step => completedSet.has(step.stepId)) ? 1 : 0;
  return { completed, total, remaining: total - completed };
}

export class MissionManager {
  private state: MissionProgressState;
  private listeners = new Set<(state: Readonly<MissionProgressState>) => void>();
  private isAdvancingDay = false;
  private sol6ValidatedMutation = false;

  constructor() {
    this.state = this.loadState();
    if (this.state.sol5.attemptStatus === "aborted") this.saveState();
  }

  private loadState(): MissionProgressState {
    if (typeof window !== "undefined" || (typeof globalThis !== "undefined" && globalThis.localStorage)) {
      try {
        let raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) raw = localStorage.getItem(V3_STORAGE_KEY);
        if (!raw) {
          raw = localStorage.getItem(PREV_STORAGE_KEY);
        }
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<MissionProgressState>;
      if (parsed && typeof parsed.currentDay === "number" && parsed.currentDay >= 1 && parsed.currentDay <= 9) {
            const rawSol5 = parsed.sol5 && typeof parsed.sol5 === "object"
              ? { ...createInitialSol5Progress(), ...(parsed.sol5 as Partial<Sol5MissionProgress>) }
              : createInitialSol5Progress();
            const rawSol6 = parsed.sol6 && typeof parsed.sol6 === "object"
              ? { ...createInitialSol6Progress(), ...(parsed.sol6 as Partial<Sol6MissionProgress>) }
              : createInitialSol6Progress();
            const landedSuccessfully = Boolean(rawSol5.flight?.landed && rawSol5.flight.status === "landed");
            const rawAttemptStatus = (parsed.sol5 as Partial<Sol5MissionProgress> | undefined)?.attemptStatus;
            const interruptedAttempt = parsed.currentDay === 5 && !landedSuccessfully && (
              rawAttemptStatus === "active" || rawAttemptStatus === "aborted" || rawAttemptStatus === "completed" ||
              (rawAttemptStatus === undefined && rawSol5.simulationActivated)
            );
            const evidence = Array.isArray(rawSol5.images) ? rawSol5.images.filter((image): image is Sol5ImageRecord =>
              Boolean(image && typeof image.assetPath === "string" && image.assetPath.startsWith("/assets/images/Selected_Missions/") && typeof image.targetId === "string" && typeof image.fileName === "string")
            ) : [];
            const persistedTargetId = this.targetIdFromRecords(Array.isArray(parsed.investigationRecords) ? parsed.investigationRecords as InvestigationRecord[] : []);
            const validEvidenceState = Boolean(rawSol5.targetInspected && rawSol5.evidenceLoaded && persistedTargetId && SOL5_EVIDENCE_ROOTS[persistedTargetId] && evidence.length && evidence.every(image => image.targetId === persistedTargetId && image.assetPath.startsWith(SOL5_EVIDENCE_ROOTS[persistedTargetId])));
            const resumableFlightOnly = Boolean(rawAttemptStatus === undefined && !rawSol5.targetInspected && Array.isArray(rawSol5.images) && rawSol5.images.length === 0 && rawSol5.flight && !rawSol5.flight.landed && rawSol5.flight.targetId === persistedTargetId);
            const sol5 = interruptedAttempt
              ? {
                  ...rawSol5, simulationActivated: false, attemptStatus: "aborted" as const, targetReached: false,
                  targetInspected: false, evidenceLoaded: false, flight: null, images: [], imagesReviewed: false, report: null
                }
              : validEvidenceState
              ? { ...rawSol5, attemptStatus: landedSuccessfully ? "completed" as const : (rawAttemptStatus ?? "not_started") as Sol5AttemptStatus, images: evidence, imagesReviewed: Boolean(rawSol5.imagesReviewed && rawSol5.flight?.landed) }
              : resumableFlightOnly
                ? { ...rawSol5, attemptStatus: "aborted" as const, simulationActivated: false, targetReached: false, targetInspected: false, evidenceLoaded: false, flight: null, images: [], imagesReviewed: false, report: null }
                : createInitialSol5Progress();
            const oldSol5StepIds = new Set(SOL5_TASKS.map(step => step.stepId));
            const retryableSol5StepIds = new Set([
              "SOL05_ACTIVATE_SIMULATION", "SOL05_AERIAL_RECONNAISSANCE", "SOL05_SAFE_LANDING",
              "SOL05_REVIEW_IMAGES", "SOL05_SUBMIT_REPORT"
            ]);
            const completedStepIds = Array.isArray(parsed.completedStepIds)
              ? parsed.completedStepIds.filter(id => !interruptedAttempt && !resumableFlightOnly
                ? validEvidenceState || !oldSol5StepIds.has(id)
                : !retryableSol5StepIds.has(id))
              : [];
            const sol7 = parsed.sol7 && typeof parsed.sol7 === "object"
              ? { ...createInitialSol7Progress(), ...(parsed.sol7 as Partial<Sol7Progress>) }
              : createInitialSol7Progress();
            const sol7TasksActuallyComplete = SOL07_TASKS.every(task => completedStepIds.includes(task.stepId))
              && sol7.report?.validated === true;
            // Older Sol 7 saves could inherit a completed flag from the prior surface objective.
            // Keep the badge and mission state aligned with the seven assessment tasks/report.
            const objectiveState = parsed.currentDay === 7 && parsed.objectiveState === "completed" && !sol7TasksActuallyComplete
              ? "in_progress"
              : parsed.objectiveState ?? "not_started";
            return {
              currentDay: parsed.currentDay as MissionDayNumber,
              objectiveState,
              completedStepIds,
              completedIntroductionIds: Array.isArray(parsed.completedIntroductionIds) ? parsed.completedIntroductionIds : [],
              observationRecords: Array.isArray(parsed.observationRecords) ? parsed.observationRecords : [],
              selectedRouteTarget: parsed.selectedRouteTarget ?? null,
              dayBriefingSeen: Boolean(parsed.dayBriefingSeen),
              campaignFinished: Boolean(parsed.campaignFinished),
              notification: null,
              geologicalSurvey: (parsed.geologicalSurvey as GeologicalSurveyRecord) ?? null,
              surfaceObservation: (parsed.surfaceObservation as SurfaceObservationRecord) ?? null,
              scienceAnalysis: (parsed.scienceAnalysis as ScienceAnalysisRecord) ?? null,
              droneSurvey: (parsed.droneSurvey as DroneSurveyRecord) ?? null,
              investigationRecords: Array.isArray(parsed.investigationRecords) ? parsed.investigationRecords : [],
              selectedSiteId: typeof parsed.selectedSiteId === "string" ? parsed.selectedSiteId : this.targetIdFromRecords(Array.isArray(parsed.investigationRecords) ? parsed.investigationRecords as InvestigationRecord[] : []),
              sol5,
              sol6: rawSol6,
              sol7
            };
          }
        }
      } catch {
        // Fall back to clean state
      }
    }

    return {
      currentDay: 1,
      objectiveState: "in_progress",
      completedStepIds: [],
      completedIntroductionIds: [],
      observationRecords: [],
      selectedRouteTarget: null,
      dayBriefingSeen: false,
      campaignFinished: false,
      notification: null,
      geologicalSurvey: null,
      surfaceObservation: null,
      scienceAnalysis: null,
      droneSurvey: null,
      investigationRecords: [],
      selectedSiteId: null,
      sol5: createInitialSol5Progress(),
      sol6: createInitialSol6Progress(),
      sol7: createInitialSol7Progress()
    };
  }

  public saveState(): void {
    if (typeof window === "undefined" && !(typeof globalThis !== "undefined" && globalThis.localStorage)) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Ignore storage errors in restricted iframe/private mode
    }
  }

  public getState(): Readonly<MissionProgressState> {
    return this.state;
  }

  public getSol7Progress(): Readonly<Sol7Progress> { return this.state.sol7; }
  public getSol7PostStormPowerAssessment(): Readonly<Sol7PowerAssessment> | null {
    return this.state.sol7.report?.validated ? this.state.sol7.powerAssessment : null;
  }

  public recordSol7ScreenReview(screenTriggerId: string, notes: string): boolean {
    if (this.state.currentDay !== 7 || this.state.sol7.stormEnded) return false;
    const requirements: Record<string, { task: Sol7TaskId; screens: string[] }> = {
      MC_SYSTEMS_01: { task: "SOL07_MISSION_CONTROL_SYSTEMS", screens: ["MC_SYSTEMS_01", "MC_NAVIGATION_01"] },
      MC_NAVIGATION_01: { task: "SOL07_MISSION_CONTROL_SYSTEMS", screens: ["MC_SYSTEMS_01", "MC_NAVIGATION_01"] },
      LAB_RESEARCH_MONITORING_01: { task: "SOL07_RESEARCH_POWER", screens: ["LAB_RESEARCH_MONITORING_01", "LAB_CULTIVATION_01"] },
      LAB_CULTIVATION_01: { task: "SOL07_RESEARCH_POWER", screens: ["LAB_RESEARCH_MONITORING_01", "LAB_CULTIVATION_01"] }
    };
    const mapping = requirements[screenTriggerId];
    if (!mapping || notes.trim().length < 8) return false;
    const order = SOL07_TASKS.findIndex(task => task.stepId === mapping.task);
    if (order > 0 && !this.state.completedStepIds.includes(SOL07_TASKS[order - 1].stepId)) return false;
    if (!this.state.sol7.reviewedScreens.includes(screenTriggerId)) this.state.sol7.reviewedScreens.push(screenTriggerId);
    this.state.sol7.screenReviewNotes[screenTriggerId] = notes.trim();
    const allReviewed = mapping.screens.every(id => this.state.sol7.reviewedScreens.includes(id));
    if (allReviewed) this.recordSol7Assessment(mapping.task, `${mapping.screens.map(id => `${id}: ${this.state.sol7.screenReviewNotes[id]}`).join("; ")}. Telemetry provenance and unavailable values retained.`);
    else this.emit();
    return allReviewed;
  }

  public recordSol7Assessment(taskId: Sol7TaskId, notes = "Reviewed available screen information; source data limitations were retained."): boolean {
    if (this.state.currentDay !== 7 || this.state.sol7.stormEnded || !SOL07_TASKS.some(task => task.stepId === taskId) || taskId === "SOL07_SUBMIT_STORM_REPORT") return false;
    const index = SOL07_TASKS.findIndex(task => task.stepId === taskId);
    if (index > 0 && !this.state.completedStepIds.includes(SOL07_TASKS[index - 1].stepId)) return false;
    if (taskId === "SOL07_HABITAT_STORM_ALERT") this.state.sol7.alertAcknowledged = true;
    this.state.sol7.assessments[taskId] = { status: taskId === "SOL07_VERIFY_EVA_LOCKDOWN" ? "verified" : "reviewed", recordedAt: new Date().toISOString(), notes };
    const completed = this.completeStep(taskId);
    if (!completed && !this.state.completedStepIds.includes(taskId)) return false;
    this.emit();
    return true;
  }

  public recordSol7PowerAssessment(input: Sol7PowerAssessment): boolean {
    if (this.state.currentDay !== 7 || !this.state.completedStepIds.includes("SOL07_RESEARCH_POWER") || this.state.sol7.stormEnded) return false;
    if (Object.values(input).some(value => !/^(source-backed|existing telemetry|unavailable|gameplay simulation):/i.test(value.trim()))) return false;
    this.state.sol7.powerAssessment = { ...input };
    return this.recordSol7Assessment("SOL07_ENGINEERING_POWER", "Existing Engineering power unit reviewed. Gameplay-only telemetry is identified as simulated; values without source data remain unavailable.");
  }

  public submitSol7Report(): { success: boolean; message: string } {
    if (this.state.currentDay !== 7 || this.state.sol7.stormEnded) return { success: false, message: "Sol 7 report is unavailable." };
    const required = SOL07_TASKS.slice(0, 6).map(task => task.stepId);
    if (!required.every(id => this.state.completedStepIds.includes(id))) return { success: false, message: "Complete Tasks 1–6 before submitting the report." };
    if (!this.state.sol7.alertAcknowledged || !this.state.sol7.powerAssessment) return { success: false, message: "Storm alert acknowledgement and Engineering power assessment are required." };
    this.state.sol7.report = { submittedAt: new Date().toISOString(), validated: true, taskIds: required };
    this.state.sol7.stormEnded = true;
    this.completeStep("SOL07_SUBMIT_STORM_REPORT");
    this.state.notification = "Sol 7 impact report validated. Storm shutdown complete; Sol 8 has not started.";
    this.emit();
    return { success: true, message: "Report validated. Storm shutdown complete; Sol 8 has not started." };
  }

  public subscribe(listener: (state: Readonly<MissionProgressState>) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.saveState();
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch {
        // Guard listener failures
      }
    }
  }

  public getCurrentMission(): DayMissionDefinition {
    return DAYS_CONFIG[this.state.currentDay];
  }

  public getCurrentMissionBriefing(): string {
    const mission = this.getCurrentMission();
    if (this.state.currentDay !== 4) return mission.briefing;
    const profile = sol03Mission.targetCatalogue.find(item => item.targetId === this.getSelectedSiteId());
    return `${mission.briefing}${profile ? `\n\nSelected target: Target ${profile.targetNumber} · ${profile.name}.` : "\n\nSelected target: unavailable in the saved Sol 3 record."}`;
  }

  public markBriefingSeen(): void {
    if (!this.state.dayBriefingSeen) {
      this.state.dayBriefingSeen = true;
      if (this.state.objectiveState === "not_started") {
        this.state.objectiveState = "in_progress";
      }

      this.emit();
    }
  }

  public hasSeenIntroduction(introId: string): boolean {
    return this.state.completedIntroductionIds.includes(introId);
  }

  public markIntroductionSeen(introId: string): void {
    if (!this.state.completedIntroductionIds.includes(introId)) {
      this.state.completedIntroductionIds.push(introId);
      this.saveState();
    }
  }

  public getCompletedIntroductionIds(): string[] {
    return [...this.state.completedIntroductionIds];
  }

  public isStepComplete(stepId: string): boolean {
    return this.state.completedStepIds.includes(stepId);
  }

  public getInvestigationRecords(): InvestigationRecord[] { return [...this.state.investigationRecords]; }

  private targetIdFromRecords(records: InvestigationRecord[]): string | null {
    const submitted = records.find(record => record.taskId === "SOL03_SUBMIT_TARGET_RECORD");
    return submitted?.evidenceReferences.find(reference => reference.startsWith("TARGET:"))?.slice("TARGET:".length) ?? null;
  }

  /** Temporary Sol 3 choice, used for proposal review only. */
  public getProposedSiteId(): string | null {
    const proposed = this.state.investigationRecords.find(record => record.taskId === "SOL03_SELECT_TARGET");
    return proposed?.evidenceReferences.find(reference => reference.startsWith("TARGET:"))?.slice("TARGET:".length) ?? null;
  }

  /** Official target exists only after a validated proposal record is saved. */
  public getSelectedSiteId(): string | null {
    const submittedTargetId = this.targetIdFromRecords(this.state.investigationRecords);
    return submittedTargetId && submittedTargetId === this.state.selectedSiteId && MASTER_TERRAIN_TARGETS.some(target => target.id === submittedTargetId)
      ? submittedTargetId
      : null;
  }

  public getSol5Progress(): Readonly<Sol5MissionProgress> { return this.state.sol5; }

  public confirmSol5Briefing(): { success: boolean; message: string } {
    const targetId = this.getSelectedSiteId();
    const prep = this.state.investigationRecords.find(record => record.taskId === "SOL04_SUBMIT_PREPARATION_REPORT");
    if (this.state.currentDay !== 5) return { success: false, message: "The Sol 5 briefing is unavailable outside Sol 5." };
    if (!targetId || !prep?.evidenceReferences.includes(`TARGET:${targetId}`) || !this.isStepComplete("SOL04_SUBMIT_PREPARATION_REPORT")) {
      return { success: false, message: "Sol 5 is blocked: no valid Sol 3 target with a matching validated Sol 4 preparation report." };
    }
    this.state.sol5.briefingConfirmed = true;
    this.completeStep("SOL05_PREFLIGHT_BRIEFING");
    return { success: true, message: `Preflight briefing confirmed for ${targetId}.` };
  }

  public startSol5Simulation(): { success: boolean; message: string } {
    const targetId = this.getSelectedSiteId();
    const prep = this.state.investigationRecords.find(record => record.taskId === "SOL04_SUBMIT_PREPARATION_REPORT");
    if (this.state.currentDay !== 5 || !this.state.sol5.briefingConfirmed) return { success: false, message: "Complete the Sol 5 preflight briefing first." };
    if (!this.isStepComplete("SOL05_PREFLIGHT_BRIEFING")) return { success: false, message: "Complete the Sol 5 preflight briefing task before activation." };
    if (!targetId || !prep?.evidenceReferences.includes(`TARGET:${targetId}`)) return { success: false, message: "Official target or matching Sol 4 preparation record is unresolved." };
    if (this.state.sol5.attemptStatus === "completed" || this.state.sol5.flight?.landed) return { success: false, message: "The Sol 5 drone attempt has already landed successfully." };
    this.state.sol5.simulationActivated = true;
    this.state.sol5.attemptStatus = "active";
    this.state.sol5.targetReached = false;
    this.state.sol5.targetInspected = false;
    this.state.sol5.evidenceLoaded = false;
    this.state.sol5.flight = null;
    this.state.sol5.images = [];
    this.state.sol5.imagesReviewed = false;
    this.state.sol5.report = null;
    this.completeStep("SOL05_ACTIVATE_SIMULATION");
    return { success: true, message: `Drone simulation authorized for ${targetId}.` };
  }

  public markSol5TargetReached(targetId: string): boolean {
    if (this.state.currentDay !== 5 || this.state.sol5.attemptStatus !== "active" || !this.state.sol5.simulationActivated || targetId !== this.getSelectedSiteId() || this.state.sol5.targetReached) return false;
    this.state.sol5.targetReached = true;
    this.emit();
    return true;
  }

  public abortSol5SimulationAttempt(emitUpdate = true): boolean {
    const sol5 = this.state.sol5;
    if (this.state.currentDay !== 5 || sol5.attemptStatus !== "active" || (sol5.flight?.landed && sol5.flight.status === "landed")) return false;
    const targetId = this.getSelectedSiteId();
    sol5.simulationActivated = false;
    sol5.attemptStatus = "aborted";
    sol5.targetReached = false;
    sol5.targetInspected = false;
    sol5.evidenceLoaded = false;
    sol5.flight = null;
    sol5.images = [];
    sol5.imagesReviewed = false;
    sol5.report = null;
    const retryable = new Set(["SOL05_ACTIVATE_SIMULATION", "SOL05_AERIAL_RECONNAISSANCE", "SOL05_SAFE_LANDING", "SOL05_REVIEW_IMAGES", "SOL05_SUBMIT_REPORT"]);
    this.state.completedStepIds = this.state.completedStepIds.filter(id => !retryable.has(id));
    this.state.observationRecords = this.state.observationRecords.filter(record => !(record.day === 5 && record.type === "drone_survey" && record.sourceIdentifier === targetId));
    this.state.notification = "Drone attempt aborted. Return to Mission Control to start again from the launch pad.";
    if (emitUpdate) this.emit();
    else this.saveState();
    return true;
  }

  public recordSol5OptionalDroneInspection(): boolean {
    if (this.state.currentDay !== 5) return false;
    this.state.sol5.optionalDroneInspection = true;
    this.emit();
    return true;
  }

  public saveSol5FlightSnapshot(snapshot: Sol5FlightSnapshot): boolean {
    const targetId = this.getSelectedSiteId();
    if (this.state.currentDay !== 5 || !this.state.sol5.simulationActivated || !targetId || snapshot.targetId !== targetId) return false;
    this.state.sol5.flight = { ...snapshot, takeoff: { ...snapshot.takeoff }, position: { ...snapshot.position } };
    this.emit();
    return true;
  }

  public completeSol5TargetInspection(requestedTargetId: string, assets: readonly { id: string; targetId: string; fileName: string; assetPath: string }[]): { success: boolean; message: string } {
    const officialTargetId = this.getSelectedSiteId();
    if (this.state.currentDay !== 5 || this.state.sol5.attemptStatus !== "active" || !this.state.sol5.simulationActivated || !this.state.sol5.targetReached || this.state.sol5.flight?.landed) return { success: false, message: "Reach the official target during the active drone attempt before inspecting it." };
    if (!officialTargetId || requestedTargetId !== officialTargetId) return { success: false, message: "Inspection target does not match the official Sol 3 selection." };
    if (this.state.sol5.targetInspected) return { success: false, message: "The official target has already been inspected." };
    const expectedEvidenceRoot = SOL5_EVIDENCE_ROOTS[officialTargetId];
    if (!assets.length || !expectedEvidenceRoot || assets.some(asset => asset.targetId !== officialTargetId || !asset.assetPath.startsWith(expectedEvidenceRoot) || !asset.fileName)) {
      return { success: false, message: "No valid mission-provided evidence is available for the official target; no other target's evidence was substituted." };
    }
    this.state.sol5.targetInspected = true;
    this.state.sol5.evidenceLoaded = true;
    this.state.sol5.images = assets.map((asset, index) => ({ ...asset, sequence: index + 1 }));
    this.completeStep("SOL05_AERIAL_RECONNAISSANCE", {
      type: "drone_survey", sourceIdentifier: officialTargetId,
      summary: `Manual drone inspection completed for ${officialTargetId}; target-specific mission evidence loaded.`,
      details: { targetId: officialTargetId, evidenceIds: this.state.sol5.images.map(asset => asset.id).join(","), evidenceCount: this.state.sol5.images.length }
    });
    this.emit();
    return { success: true, message: `Inspection validated for ${officialTargetId}. Mission-provided evidence is ready for review at Mission Control after landing.` };
  }

  public completeSol5Landing(snapshot: Sol5FlightSnapshot, landingTriggerValidated: boolean): { success: boolean; message: string } {
    const targetId = this.getSelectedSiteId();
    const landingOffset = Math.hypot(snapshot.position.x - snapshot.takeoff.x, snapshot.position.z - snapshot.takeoff.z);
    const landingHeightOffset = Math.abs(snapshot.position.y - snapshot.takeoff.y);
    if (!landingTriggerValidated || this.state.currentDay !== 5 || this.state.sol5.attemptStatus !== "active" || !targetId || snapshot.targetId !== targetId || !this.state.sol5.targetInspected || !this.state.sol5.evidenceLoaded || !this.state.sol5.images.length ||
      !snapshot.landed || snapshot.status !== "landed" || snapshot.speedMps > 0.4 || landingOffset > 1.25 || landingHeightOffset > 1.25) {
      return { success: false, message: "Landing cannot complete: inspect the official target and load its evidence before a valid landing." };
    }
    this.state.sol5.flight = { ...snapshot, status: "landed", landed: true, takeoff: { ...snapshot.takeoff }, position: { ...snapshot.position } };
    this.state.sol5.attemptStatus = "completed";
    this.completeStep("SOL05_SAFE_LANDING");
    return { success: true, message: "Landing validated and flight records saved." };
  }

  public confirmSol5ImageReview(): { success: boolean; message: string } {
    if (this.state.currentDay !== 5 || !this.state.sol5.flight?.landed || !this.state.sol5.targetInspected || !this.state.sol5.evidenceLoaded || !this.state.sol5.images.length || this.state.sol5.images.some(image => image.targetId !== this.getSelectedSiteId())) {
      return { success: false, message: "Review is blocked until the official target is inspected, its matching evidence is loaded, and the drone is safely landed." };
    }
    this.state.sol5.imagesReviewed = true;
    this.completeStep("SOL05_REVIEW_IMAGES");
    return { success: true, message: "Mission-provided images for the official target have been reviewed and are ready for reporting." };
  }

  public submitSol5Report(input: { observedFeatures: string; playerInterpretation: string; uncertainties: string; groundFollowUp: string }): { success: boolean; message: string } {
    const targetId = this.getSelectedSiteId();
    const flight = this.state.sol5.flight;
    if (this.state.currentDay !== 5 || !targetId || !flight?.landed || !this.state.sol5.targetInspected || !this.state.sol5.imagesReviewed || !this.state.sol5.images.length) {
      return { success: false, message: "Complete target inspection, valid landing, evidence review, and target validation before reporting." };
    }
    if ([input.observedFeatures, input.playerInterpretation, input.uncertainties, input.groundFollowUp].some(value => value.trim().length < 8)) {
      return { success: false, message: "Describe image observations, interpretation, uncertainty, and ground follow-up (at least eight characters each)." };
    }
    this.state.sol5.report = {
      id: `SOL05_REPORT_${Date.now()}`, targetId, submittedAt: new Date().toISOString(), flight: { ...flight },
      imageIds: this.state.sol5.images.map(image => image.id), observedFeatures: input.observedFeatures.trim(),
      playerInterpretation: input.playerInterpretation.trim(), uncertainties: input.uncertainties.trim(), groundFollowUp: input.groundFollowUp.trim()
    };
    this.completeStep("SOL05_SUBMIT_REPORT", {
      type: "drone_survey", sourceIdentifier: targetId,
      summary: `Sol 5 manual reconnaissance report submitted for ${targetId}; ${this.state.sol5.images.length} mission-provided evidence images reviewed.`,
      details: { targetId, flightSeconds: flight.elapsedSeconds, distanceMeters: flight.totalDistanceM, maximumAglMeters: flight.maxAltitudeAglM, evidenceCount: this.state.sol5.images.length, reportId: this.state.sol5.report.id }
    });
    return { success: true, message: "Sol 5 reconnaissance report validated and saved." };
  }

  /** Mission-level progress. Sols 4–9 have one primary objective with several implementation steps. */
  public getMissionTaskCards(): MissionTaskCard[] {
    const mission = this.getCurrentMission();
    const currentDay = this.state.currentDay;
    const stepById = new Map(mission.steps.map(step => [step.stepId, step]));
    let groups: MissionStep[][];

    if (currentDay === 1) {
      groups = DAY1_TASKS.filter(task => task.required).map(task => {
        const step = stepById.get(task.taskId);
        if (!step) return [];
        const group = DAY1_ZONES.find(zone => zone.zoneId === task.zoneId)?.interactionGroups.find(item => item.id === task.interactionGroupId);
        return [{ ...step, targetTrigger: group?.triggerObjectName ?? undefined, targetModule: DAY1_ZONES.find(zone => zone.zoneId === task.zoneId)?.moduleName }];
      }).filter(group => group.length > 0);
    } else if (currentDay === 2 || currentDay === 3 || currentDay === 4 || currentDay === 5 || currentDay === 6) {
      groups = mission.steps.map(step => [step]);
    } else {
      // The Sol 4–9 definitions describe one primary mission outcome; their
      // listed steps are its sub-actions and must not inflate task progress.
      groups = mission.steps.length ? [mission.steps] : [];
    }

    const prerequisiteMap: Record<string, string[]> = {
      SOL02_READINESS_ASSESSMENT: mission.steps.slice(0, 6).map(step => step.stepId),
      SOL03_SELECT_TARGET: ["SOL03_OBSERVATION_SITE_REVIEW", "SOL03_SYSTEM_CONSTRAINTS"],
      SOL03_SELECT_DATASET: ["SOL03_SELECT_TARGET"],
      SOL03_SUBMIT_TARGET_RECORD: mission.steps.slice(0, 5).map(step => step.stepId)
    };

    return groups.map((steps, index) => {
      const first = steps.find(step => step.targetTrigger) ?? steps.find(step => step.targetModule) ?? steps[0];
      const triggerId = first?.targetTrigger;
      const mapped = triggerId ? TRIGGER_GUIDANCE[triggerId] : undefined;
      const module = mapped?.moduleName ?? (first?.targetModule === "Engineering" ? "Engineering Unit" : first?.targetModule === "Drone" ? "Drone Section" : first?.targetModule ?? "Location not mapped");
      const prereqs = first?.requiresCompletedTasks ?? prerequisiteMap[first?.stepId ?? ""] ?? [];
      const lockedOn = prereqs.filter(id => !this.state.completedStepIds.includes(id));
      const completed = steps.length > 0 && steps.every(step => this.state.completedStepIds.includes(step.stepId));
      const started = steps.some(step => this.state.completedStepIds.includes(step.stepId));
      const section = mapped?.sectionName ?? (triggerId ? "Interaction point" : "Location guidance only");
      return {
        id: steps.length === 1 ? steps[0].stepId : `SOL${String(currentDay).padStart(2, "0")}_MISSION_OBJECTIVE`,
        title: steps.length === 1 ? steps[0].label : mission.title,
        description: steps.length === 1 ? steps[0].description : mission.primaryObjective,
        status: completed ? "completed" : lockedOn.length ? "locked" : started ? "in_progress" : "available",
        steps,
        targetTrigger: triggerId,
        moduleName: module,
        sectionName: section,
        interfaceName: mapped?.interfaceName ?? (triggerId ? "Existing module interaction" : "No interface mapping available"),
        viewName: TASK_VIEW_NAMES[first?.stepId ?? ""] ?? mapped?.viewName,
        prerequisiteTaskTitles: lockedOn.map(id => mission.steps.find(step => step.stepId === id)?.label ?? id)
      };
    });
  }

  public getMissionTaskProgress(): { completed: number; total: number; remaining: number } {
    return getMissionTaskProgressFor(this.state.currentDay, this.state.completedStepIds);
  }

  public getCurrentNavigationNotification(): string | null {
    return resolveNextMissionNavigation(this.state.currentDay, this.state.completedStepIds)?.notification ?? null;
  }

  public getCurrentNavigationInstruction() {
    if (this.state.currentDay < 1 || this.state.currentDay > 7) return null;
    return resolveNextMissionNavigation(this.state.currentDay, this.state.completedStepIds);
  }

  public submitInvestigation(input: { taskId: string; evidenceReferences: string[]; classification: string; rationale: string; playerComment?: string; recommendedFollowUp?: string; limitations?: string[]; procedureChecks: string[]; selectedTargetId?: string; datasetId?: string; scientificQuestion?: string }): { success: boolean; message: string } {
    const day = this.state.currentDay;
    if (day !== 2 && day !== 3 && day !== 4) return { success: false, message: "Investigations are not available on the active Sol." };
    const task = DAYS_CONFIG[day].steps.find(step => step.stepId === input.taskId);
    if (!task) return { success: false, message: "This task is not part of the active Sol." };
    if (day === 3 && this.getSelectedSiteId() && ["SOL03_SELECT_TARGET", "SOL03_SUBMIT_TARGET_RECORD"].includes(input.taskId)) {
      return { success: false, message: "The Sol 3 target proposal has been validated and is locked for this mission." };
    }
    if (input.rationale.trim().length < 12) return { success: false, message: "Enter a rationale of at least 12 characters." };
    if (day === 4) {
      const selected = this.getSelectedSiteId();
      if (!selected || !MASTER_TERRAIN_TARGETS.some(target => target.id === selected)) return { success: false, message: "A valid Sol 3 selected target is required before continuing." };
      if (input.selectedTargetId !== selected) return { success: false, message: "Sol 4 must use the target already selected during Sol 3." };
      if (input.taskId === "SOL04_TERRAIN_DATA_REVIEW" && !input.limitations?.some(item => item.trim())) return { success: false, message: "Record unavailable terrain measurements and dataset limitations." };
      if (input.taskId !== "SOL04_SUBMIT_PREPARATION_REPORT" && input.procedureChecks.length < 2) return { success: false, message: "Complete both review steps before submitting this Sol 4 activity." };
      if (input.taskId === "SOL04_DRONE_MISSION_PLAN" && !input.limitations?.some(item => item.trim())) return { success: false, message: "Record planning constraints and unresolved issues." };
      if (input.taskId === "SOL04_SUBMIT_PREPARATION_REPORT") {
        const required = ["SOL04_MISSION_CONTEXT", "SOL04_SELECTED_TARGET_INVESTIGATION", "SOL04_TERRAIN_DATA_REVIEW", "SOL04_DRONE_PHYSICAL_INSPECTION", "SOL04_DRONE_MISSION_PLAN"];
        if (!required.every(id => this.state.investigationRecords.some(record => record.taskId === id))) return { success: false, message: "Complete and save the investigation, terrain review, physical drone inspection, and mission plan first." };
        if (!input.limitations?.some(item => item.trim()) || !input.evidenceReferences.length) return { success: false, message: "Reference prior Sol 4 records and include known limitations in the report." };
      }
      const dependency = task.requiresCompletedTasks ?? [];
      if (dependency.some(id => !this.isStepComplete(id))) return { success: false, message: "Complete the prerequisite Sol 4 activities first." };
      if (input.taskId !== "SOL04_SUBMIT_PREPARATION_REPORT" && input.taskId !== "SOL04_MISSION_CONTEXT" && !input.limitations?.some(item => item.trim())) return { success: false, message: "State what remains unknown or unsupported in the available evidence." };
      if (input.taskId === "SOL04_SUBMIT_PREPARATION_REPORT" && input.evidenceReferences.some(id => !this.state.investigationRecords.some(record => record.id === id))) return { success: false, message: "Every report reference must point to a saved mission record." };
    }
    if (day === 2 && input.taskId !== "SOL02_READINESS_ASSESSMENT" && !["anomaly_detected", "no_anomaly_detected", "insufficient_evidence"].includes(input.classification)) return { success: false, message: "Choose a supported system investigation classification." };
    if (input.taskId === "SOL02_READINESS_ASSESSMENT" && !["undetermined", "ready_with_cautions", "not_ready"].includes(input.classification)) return { success: false, message: "Choose a supported readiness assessment." };
    if (day === 3 && input.taskId !== "SOL03_SUBMIT_TARGET_RECORD" && !["anomaly_detected", "no_anomaly_detected", "insufficient_evidence"].includes(input.classification)) return { success: false, message: "Choose a supported investigation classification." };
    if (input.taskId === "SOL03_SUBMIT_TARGET_RECORD" && !["proposal_submitted", "proposal_with_limits"].includes(input.classification)) return { success: false, message: "Set the proposal to a supported submission state." };
    if (input.classification === "insufficient_evidence" && !input.limitations?.some(item => item.trim())) return { success: false, message: "Describe the missing or inadequate evidence behind an insufficient-evidence conclusion." };
    if ((input.taskId === "SOL03_SELECT_DATASET" || input.taskId === "SOL03_SUBMIT_TARGET_RECORD") && !input.limitations?.some(item => item.trim())) return { success: false, message: "Record the dataset or proposal limitations before submission." };
    const definition = SOL2_INVESTIGATION_RULES[input.taskId];
    if (day === 2 && input.taskId !== "SOL02_READINESS_ASSESSMENT") {
      const expectedChecks = Array.from({ length: definition?.procedureCount ?? 0 }, (_, i) => `${input.taskId}:${i}`);
      if (!definition || expectedChecks.some(check => !input.procedureChecks.includes(check))) return { success: false, message: "Complete each listed procedure step before submitting." };
      const ids = definition.logIds;
      if (!input.evidenceReferences.length || input.evidenceReferences.some(id => !ids.includes(id))) return { success: false, message: "Select valid supporting log entries." };
    }
    if (input.taskId === "SOL03_SELECT_TARGET" && !MASTER_TERRAIN_TARGETS.some(t => t.id === input.selectedTargetId)) return { success: false, message: "Select an available in-game target profile." };
    if (input.taskId === "SOL03_SELECT_DATASET" && !SOL3_DATASET_IDS.includes(input.datasetId ?? "")) return { success: false, message: "Select an available dataset record." };
    if (day === 3 && !["SOL03_SUBMIT_TARGET_RECORD"].includes(input.taskId) && [0, 1].some(i => !input.procedureChecks.includes(`${input.taskId}:${i}`))) return { success: false, message: "Complete both review steps before submitting." };
    if (input.taskId === "SOL03_MISSION_CONTEXT" && !input.evidenceReferences.includes("SOL03-MISSION-CONTEXT")) return { success: false, message: "Reference the active mission context record." };
    if (input.taskId === "SOL03_MISSION_CONTEXT" && !this.state.investigationRecords.some(record => record.taskId === "SOL02_READINESS_ASSESSMENT")) return { success: false, message: "A saved Sol 2 readiness assessment is required for this context review." };
    if (input.taskId === "SOL03_SYSTEM_CONSTRAINTS" && !input.evidenceReferences.includes("SOL03-COMMS-SYSTEMS")) return { success: false, message: "Reference the available communications and systems record." };
    if (input.taskId === "SOL03_OBSERVATION_SITE_REVIEW" && MASTER_TERRAIN_TARGETS.some(target => !input.evidenceReferences.includes(`TARGET:${target.id}`))) return { success: false, message: "Review and reference Target A, Target B, and Target C before submitting the comparison." };
    // Selecting a target is itself an explicit reference to that catalogue profile.
    // The canonical target reference is appended to the saved record below, so do
    // not require the player to make a second, hidden checkbox selection.
    if ((input.taskId === "SOL03_SELECT_TARGET" || input.taskId === "SOL03_SUBMIT_TARGET_RECORD") && !input.scientificQuestion?.trim()) return { success: false, message: "Enter a focused scientific question for this target proposal." };
    if (input.taskId === "SOL03_SELECT_DATASET" && !input.evidenceReferences.includes(`DATASET:${input.datasetId}`)) return { success: false, message: "Reference the selected dataset metadata record." };
    const prior = this.state.investigationRecords;
    if (input.taskId === "SOL02_READINESS_ASSESSMENT") {
      const required = DAYS_CONFIG[2].steps.slice(0, 6).map(s => s.stepId);
      if (!required.every(id => prior.some(r => r.taskId === id))) return { success: false, message: "Submit all six system investigations first." };
      if (!input.evidenceReferences.length || !input.evidenceReferences.every(id => prior.some(r => r.id === id))) return { success: false, message: "Reference submitted investigation records." };
    }
    if (input.taskId === "SOL03_SUBMIT_TARGET_RECORD") {
      const required = DAYS_CONFIG[3].steps.slice(0, 5).map(s => s.stepId);
      if (!required.every(id => prior.some(r => r.taskId === id))) return { success: false, message: "Complete all five proposal preparation tasks first." };
      if (!input.selectedTargetId || !MASTER_TERRAIN_TARGETS.some(t => t.id === input.selectedTargetId) || !input.datasetId || !SOL3_DATASET_IDS.includes(input.datasetId)) return { success: false, message: "Proposal must reference an available target and dataset." };
      if (!prior.some(r => r.taskId === "SOL03_SELECT_TARGET" && r.evidenceReferences.includes(`TARGET:${input.selectedTargetId}`)) || !prior.some(r => r.taskId === "SOL03_SELECT_DATASET" && r.evidenceReferences.includes(`DATASET:${input.datasetId}`))) return { success: false, message: "Target and dataset must match the submitted selection records." };
      if (!input.evidenceReferences.length || !input.evidenceReferences.every(id => prior.some(r => r.id === id))) return { success: false, message: "Reference submitted investigation evidence." };
    }
    const record: InvestigationRecord = {
      id: prior.find(r => r.taskId === input.taskId)?.id ?? `INV_${day}_${input.taskId}`,
      missionId: day === 2 ? "PHOBOSIA_SOL_02" : day === 3 ? "PHOBOSIA_SOL_03" : "PHOBOSIA_SOL_04", sol: day, taskId: input.taskId,
      triggerId: task.targetTrigger ?? "MISSION_RECORD_SUBMISSION",
      systemId: definition?.systemId ?? input.taskId,
      evidenceReferences: [...new Set(input.evidenceReferences)], classification: input.classification,
      rationale: input.rationale.trim(), limitations: input.limitations ?? [],
      recommendedFollowUp: input.recommendedFollowUp?.trim(),
      sourceType: day === 2 ? "SIMULATED_GAME_DATA" : day === 3 ? "PHOBOSIA_SIMULATED_TRAINING_AND_PLAYER_RECORDS" : "PHOBOSIA_ANALYSIS_AND_PLAYER_RECORDS",
      submittedAt: prior.find(r => r.taskId === input.taskId)?.submittedAt ?? new Date().toISOString(),
      playerConclusion: input.classification,
      playerComment: input.playerComment?.trim() ?? "",
      systemValidation: "Record structure and references validated. The player's conclusion is not an independently verified technical or scientific finding.",
      dataProvenance: [day === 2 ? "Sol 2 simulated outpost display configuration" : day === 3 ? "PHOBOSIA in-game mission and target profile records" : "Sol 4 player-authored investigation; no target-specific NASA measurements inferred", ...new Set(input.evidenceReferences.map(ref => ref.startsWith("TARGET:") ? "PHOBOSIA selected target reference" : ref.startsWith("DATASET:") ? "PHOBOSIA training metadata" : ref.startsWith("INV_") ? "Player-submitted mission record" : "Existing display record"))],
      scientificQuestion: input.scientificQuestion?.trim()
    };
    if (input.selectedTargetId) record.evidenceReferences.push(`TARGET:${input.selectedTargetId}`);
    if (input.datasetId) record.evidenceReferences.push(`DATASET:${input.datasetId}`);
    if (day === 4) record.evidenceReferences.push(`TARGET:${this.getSelectedSiteId()}`);
    this.state.investigationRecords = [...prior.filter(r => r.taskId !== input.taskId), record];
    if (day === 3 && input.taskId === "SOL03_SUBMIT_TARGET_RECORD" && input.selectedTargetId) this.state.selectedSiteId = input.selectedTargetId;
    this.completeStep(input.taskId);
    this.emit();
    return { success: true, message: "Mission record saved with its evidence and provenance." };
  }

  public recordPhysicalDroneInspection(notes: string): boolean {
    if (this.state.currentDay !== 4 || !this.getSelectedSiteId() || !this.isStepComplete("SOL04_MISSION_CONTEXT")) return false;
    const taskId = "SOL04_DRONE_PHYSICAL_INSPECTION";
    if (this.isStepComplete(taskId)) return false;
    const timestamp = new Date().toISOString();
    const selectedSiteId = this.getSelectedSiteId()!;
    const record: InvestigationRecord = {
      id: `INV_4_${taskId}`, missionId: "PHOBOSIA_SOL_04", sol: 4, taskId,
      triggerId: "Drone_Section_Entrance_Trigger", systemId: "PHYSICAL_DRONE_INSPECTION",
      evidenceReferences: [`TARGET:${selectedSiteId}`], classification: "physical_visual_inspection",
      rationale: notes.trim() || "Physically viewed and inspected the existing drone in the Drone Section.",
      limitations: ["Battery, fuel, mechanical condition, camera, and communications readings are unavailable."],
      sourceType: "PLAYER_PHYSICAL_INSPECTION", submittedAt: timestamp,
      playerConclusion: "physical_visual_inspection", playerComment: notes.trim(),
      systemValidation: "Physical inspection was recorded only after the player interacted with the existing drone object in the Drone Section. No telemetry was asserted.",
      dataProvenance: ["Player physical observation in the Drone Section"], scientificQuestion: undefined
    };
    this.state.investigationRecords = [...this.state.investigationRecords.filter(item => item.taskId !== taskId), record];
    this.completeStep(taskId);
    return true;
  }

  /**
   * Validates and records a step in the current mission. Idempotent and deterministic.
   */
  public completeStep(stepId: string, associatedData?: Partial<ObservationRecord>): boolean {
    const mission = this.getCurrentMission();
    const stepDef = mission.steps.find(s => s.stepId === stepId);

    // Backwards-compatibility alias for legacy test IDs
    if (!stepDef && this.state.currentDay === 1) {
      if (stepId === "DAY1_REVIEW_CONTROLS") {
        return this.completeStep("D1_HAB_LIFE_SUPPORT", associatedData);
      }
      if (stepId === "DAY1_VISIT_CENTRAL_HUB") {
        return this.completeStep("D1_HUB_ENVIRONMENT_STATUS", associatedData);
      }
      if (stepId === "DAY1_INSPECT_BASE_AREAS") {
        return this.completeStep("D1_ENG_MONITORING", associatedData);
      }
      if (stepId === "DAY1_CONFIRM_ORIENTATION") {
        let anyAdded = false;
        for (const s of mission.steps) {
          if (!this.state.completedStepIds.includes(s.stepId)) {
            this.state.completedStepIds.push(s.stepId);
            anyAdded = true;
          }
        }
        if (associatedData) {
          this.state.observationRecords.push({
            id: `REC_1_CONFIRM_${Date.now()}`,
            day: 1,
            type: "orientation",
            sourceIdentifier: "DAY1_CONFIRM_ORIENTATION",
            timestamp: new Date().toISOString(),
            isSimulated: true,
            summary: associatedData.summary || "Base Orientation status verified.",
            details: associatedData.details || {}
          });
        }
        this.evaluateObjectiveCompletion();
        this.emit();
        return anyAdded || Boolean(associatedData);
      }
      return false;
    }

    if (!stepDef) return false;

    if (this.state.currentDay === 6 && !this.sol6ValidatedMutation) return false;

    if ((this.state.currentDay === 5 || this.state.currentDay === 6) && (stepDef.requiresCompletedTasks ?? []).some(required => !this.state.completedStepIds.includes(required))) {
      return false;
    }
    if (this.state.currentDay === 5) {
      if (stepId === "SOL05_PREFLIGHT_BRIEFING" && !this.state.sol5.briefingConfirmed) return false;
      if (stepId === "SOL05_ACTIVATE_SIMULATION" && (!this.state.sol5.simulationActivated || this.state.sol5.attemptStatus !== "active")) return false;
      if (stepId === "SOL05_AERIAL_RECONNAISSANCE" && (!this.state.sol5.targetReached || !this.state.sol5.targetInspected || !this.state.sol5.evidenceLoaded)) return false;
      if (stepId === "SOL05_SAFE_LANDING" && (this.state.sol5.attemptStatus !== "completed" || !this.state.sol5.flight?.landed)) return false;
      if (stepId === "SOL05_REVIEW_IMAGES" && !this.state.sol5.imagesReviewed) return false;
      if (stepId === "SOL05_SUBMIT_REPORT" && !this.state.sol5.report) return false;
    }

    if (!this.state.completedStepIds.includes(stepId)) {
      this.state.completedStepIds.push(stepId);

      // Check if this step adds a generic observation record
      if (associatedData) {
        const record: ObservationRecord = {
          id: `REC_${this.state.currentDay}_${stepId}_${Date.now()}`,
          day: this.state.currentDay,
          type: associatedData.type || "orientation",
          sourceIdentifier: associatedData.sourceIdentifier || stepId,
          timestamp: new Date().toISOString(),
          isSimulated: true,
          summary: associatedData.summary || `Simulated reading for ${stepDef.label}`,
          details: associatedData.details || {}
        };
        this.state.observationRecords.push(record);
      }

      this.evaluateObjectiveCompletion();
      if (this.state.currentDay >= 2 && this.state.currentDay <= 5) {
        this.state.notification = this.getCurrentNavigationNotification();
      }
      this.emit();
      return true;
    }
    return false;
  }

  private completeSol6Step(stepId: string, record?: Partial<ObservationRecord>): boolean {
    this.sol6ValidatedMutation = true;
    try { return this.completeStep(stepId, record); }
    finally { this.sol6ValidatedMutation = false; }
  }

  public getSol6Progress(): Readonly<Sol6MissionProgress> { return this.state.sol6; }

  public confirmSol6Briefing(): { success: boolean; message: string } {
    const targetId = this.getSelectedSiteId();
    const sol4 = this.state.investigationRecords.find(record => record.taskId === "SOL04_SUBMIT_PREPARATION_REPORT");
    const sol5 = this.state.sol5.report;
    if (this.state.currentDay !== 6) return { success: false, message: "The Sol 6 briefing is unavailable outside Sol 6." };
    if (!targetId || !sol4?.evidenceReferences.includes(`TARGET:${targetId}`) || !sol5 || sol5.targetId !== targetId) return { success: false, message: "Sol 6 is blocked: a valid Sol 3 target and matching Sol 4 and Sol 5 records are required." };
    this.completeSol6Step("SOL06_REVIEW_MISSION_BRIEFING");
    return { success: true, message: `Briefing confirmed for the official Sol 3 target (${targetId}).` };
  }

  public prepareSol6Equipment(): { success: boolean; message: string } {
    if (this.state.currentDay !== 6 || !this.isStepComplete("SOL06_REVIEW_MISSION_BRIEFING")) return { success: false, message: "Review the Sol 6 briefing first." };
    this.state.sol6.equipmentPrepared = true;
    this.completeSol6Step("SOL06_PREPARE_FIELD_EQUIPMENT");
    if (this.state.sol6.evaActive) this.completeSol6Step("SOL06_ACTIVATE_EVA_SESSION");
    return { success: true, message: "Available sample-handling workflow reviewed. Hardware-specific capabilities remain unverified." };
  }

  public markSol6EVAActivated(active: boolean): boolean {
    if (this.state.currentDay !== 6) return false;
    this.state.sol6.evaActive = active;
    if (active && this.isStepComplete("SOL06_PREPARE_FIELD_EQUIPMENT")) return this.completeSol6Step("SOL06_ACTIVATE_EVA_SESSION");
    if (!active) {
      // This method is called by the existing Airlock preparation/removal
      // interaction. Retry the return validation here as a recovery path in
      // case a transition event was missed during the Terrain -> Airlock load.
      if (!this.isStepComplete("SOL06_RETURN_TO_AIRLOCK")) this.markSol6AirlockReturned();
      if (this.isStepComplete("SOL06_RETURN_TO_AIRLOCK")) return this.completeSol6Step("SOL06_REMOVE_EVA_SUIT");
    }
    return false;
  }

  public markSol6TargetReached(targetId: string): boolean {
    if (this.state.currentDay !== 6 || targetId !== this.getSelectedSiteId() || !this.isStepComplete("SOL06_ACTIVATE_EVA_SESSION")) return false;
    this.state.sol6.targetReached = true;
    return this.completeSol6Step("SOL06_REACH_SELECTED_TARGET");
  }

  public saveSol6FieldObservation(input: { targetId: string; locationReference: string; category: string; observation: string; interpretation: string; uncertainty: string }): Sol6FieldObservation | null {
    if (this.state.currentDay !== 6 || !this.state.sol6.targetReached || input.targetId !== this.getSelectedSiteId() || !this.isStepComplete("SOL06_REACH_SELECTED_TARGET")) return null;
    if (![input.locationReference, input.category, input.observation, input.interpretation, input.uncertainty].every(value => value.trim().length >= 3)) return null;
    const existing = this.state.sol6.fieldObservations.find(record => record.targetId === input.targetId);
    const record: Sol6FieldObservation = { id: existing?.id ?? `SOL06_OBS_${Date.now()}`, targetId: input.targetId, sol: 6, timestamp: existing?.timestamp ?? new Date().toISOString(), locationReference: input.locationReference.trim(), observationCategory: input.category.trim(), observationDescription: input.observation.trim(), playerInterpretation: input.interpretation.trim(), evidenceReferences: [`TARGET:${input.targetId}`, "PHOBOSIA_SCENE_VISUAL_OBSERVATION"], uncertainty: input.uncertainty.trim(), simulated: true };
    this.state.sol6.fieldObservations = [record];
    this.state.geologicalSurvey = {
      id: record.id, day: 6, targetId: record.targetId, source: "PHOBOSIA simulated field observation",
      observedCategories: { surfaceTexture: record.observationDescription, fragmentDistribution: "Not separately quantified in this observation", terrainShape: "Not measured in this observation", dustCoverage: "Not measured in this observation", followUpInterest: record.playerInterpretation },
      summary: record.observationDescription, isSimulated: true, saved: true, routePlanReference: null, missionTimestamp: record.timestamp
    };
    this.completeSol6Step("SOL06_COMPLETE_FIELD_OBSERVATIONS", { type: "geological_survey", sourceIdentifier: input.targetId, summary: record.observationDescription, details: { category: record.observationCategory, interpretation: record.playerInterpretation, uncertainty: record.uncertainty, simulated: true } });
    this.emit();
    return record;
  }

  public collectSol6Sample(locationReference: string, containerReference: string): Sol6SampleRecord | null {
    const targetId = this.getSelectedSiteId();
    if (this.state.currentDay !== 6 || !targetId || !this.state.sol6.fieldObservations.length || !locationReference.trim() || !containerReference.trim()) return null;
    const sample: Sol6SampleRecord = this.state.sol6.sample ?? { sampleId: `PHO-SOL06-${Date.now().toString(36).toUpperCase()}`, targetId, collectionSol: 6, collectionLocationReference: locationReference.trim(), sampleType: "soil_regolith", containerReference: containerReference.trim(), collectionStatus: "COLLECTED_AND_SECURED", sealingStatus: "SECURED", transferred: false };
    if (sample.targetId !== targetId) return null;
    this.state.sol6.sample = sample;
    this.completeSol6Step("SOL06_COLLECT_SOIL_SAMPLE", { type: "geological_survey", sourceIdentifier: targetId, summary: `Simulated regolith sample ${sample.sampleId} recorded and secured.`, details: { sampleId: sample.sampleId, sampleType: sample.sampleType, collectionStatus: sample.collectionStatus } });
    this.emit();
    return sample;
  }

  public markSol6AirlockReturned(): boolean {
    const sample = this.state.sol6.sample;
    const targetId = this.getSelectedSiteId();
    const hasValidSecuredSample = Boolean(
      sample &&
      targetId &&
      sample.targetId === targetId &&
      sample.collectionStatus === "COLLECTED_AND_SECURED" &&
      sample.sealingStatus === "SECURED" &&
      sample.sampleId.trim() &&
      sample.containerReference.trim() &&
      this.state.sol6.targetReached &&
      this.state.sol6.fieldObservations.some(record => record.targetId === targetId)
    );
    if (this.state.currentDay !== 6 || !hasValidSecuredSample) return false;

    // A previous save or interrupted transition may contain the validated sample
    // record without its task ID. Reconcile that durable evidence on Airlock entry
    // so the task list can advance instead of asking the player to collect again.
    if (!this.isStepComplete("SOL06_COLLECT_SOIL_SAMPLE")) {
      this.completeSol6Step("SOL06_COLLECT_SOIL_SAMPLE", {
        type: "geological_survey",
        sourceIdentifier: sample!.targetId,
        summary: `Simulated regolith sample ${sample!.sampleId} recorded and secured.`,
        details: { sampleId: sample!.sampleId, sampleType: sample!.sampleType, collectionStatus: sample!.collectionStatus, reconciledOnAirlockReturn: true }
      });
    }
    if (!this.isStepComplete("SOL06_COLLECT_SOIL_SAMPLE")) return false;
    return this.completeSol6Step("SOL06_RETURN_TO_AIRLOCK");
  }

  public transferSol6Sample(): { success: boolean; message: string } {
    const sample = this.state.sol6.sample;
    if (this.state.currentDay !== 6 || !sample || !this.isStepComplete("SOL06_REMOVE_EVA_SUIT")) return { success: false, message: "Return to the Airlock, remove the suit, and retain the secured sample first." };
    sample.transferred = true;
    this.completeSol6Step("SOL06_TRANSFER_SAMPLE", { type: "geological_survey", sourceIdentifier: sample.targetId, summary: `Sample ${sample.sampleId} received for preliminary analysis.`, details: { sampleId: sample.sampleId, provenanceTargetId: sample.targetId } });
    return { success: true, message: `Sample ${sample.sampleId} receipt recorded.` };
  }

  public saveSol6Analysis(input: Omit<Sol6AnalysisRecord, "id" | "sampleId" | "simulated" | "timestamp">): Sol6AnalysisRecord | null {
    const sample = this.state.sol6.sample;
    if (this.state.currentDay !== 6 || !sample?.transferred || !this.isStepComplete("SOL06_TRANSFER_SAMPLE")) return null;
    const analysisFields = {
      visualAppearance: input.visualAppearance,
      grainSizeOrTexture: input.grainSizeOrTexture,
      colourDescription: input.colourDescription,
      supportedIndicators: input.supportedIndicators,
      limitationsAndUncertainty: input.limitationsAndUncertainty,
      playerInterpretation: input.playerInterpretation
    };
    if (!Object.values(analysisFields).every(value => value.trim().length >= 3)) return null;
    const record: Sol6AnalysisRecord = { ...analysisFields, id: this.state.sol6.analysis?.id ?? `SOL06_ANALYSIS_${Date.now()}`, sampleId: sample.sampleId, simulated: true, timestamp: this.state.sol6.analysis?.timestamp ?? new Date().toISOString() };
    this.state.sol6.analysis = record;
    this.completeSol6Step("SOL06_ANALYSE_SAMPLE", { type: "geological_survey", sourceIdentifier: sample.targetId, summary: record.visualAppearance, details: { sampleId: sample.sampleId, texture: record.grainSizeOrTexture, colour: record.colourDescription, interpretation: record.playerInterpretation, limitations: record.limitationsAndUncertainty, simulated: true } });
    this.emit();
    return record;
  }

  public startSol6Cultivation(): Sol6CultivationExperiment | null {
    const sample = this.state.sol6.sample;
    if (this.state.currentDay !== 6 || !sample || !this.state.sol6.analysis || !this.isStepComplete("SOL06_ANALYSE_SAMPLE")) return null;
    const experiment = this.state.sol6.cultivation ?? { id: `SOL06_CULTIVATION_${Date.now()}`, sampleId: sample.sampleId, unitReference: "LAB_CULTIVATION_01" as const, startSol: 6 as const, expectedResultSol: 8 as const, status: "IN_PROGRESS" as const, result: null };
    this.state.sol6.cultivation = experiment;
    this.completeSol6Step("SOL06_START_CULTIVATION_EXPERIMENT", { type: "geological_survey", sourceIdentifier: sample.targetId, summary: `Cultivation experiment ${experiment.id} started; result pending until Sol 8.`, details: { sampleId: sample.sampleId, status: experiment.status, expectedResultSol: 8 } });
    this.emit();
    return experiment;
  }

  public submitSol6Report(uncertainty: string): { success: boolean; message: string } {
    const targetId = this.getSelectedSiteId(); const sample = this.state.sol6.sample; const analysis = this.state.sol6.analysis; const cultivation = this.state.sol6.cultivation;
    if (this.state.currentDay !== 6 || !targetId || !sample || sample.targetId !== targetId || !analysis || analysis.sampleId !== sample.sampleId || !cultivation || cultivation.sampleId !== sample.sampleId || cultivation.result !== null || !uncertainty.trim()) return { success: false, message: "The report requires the official target, matching sample and analysis records, pending cultivation status, and stated uncertainty." };
    const report: Sol6Report = { id: "PHOBOSIA_SOL_06_REPORT", targetId, sampleId: sample.sampleId, submittedAt: new Date().toISOString(), observationIds: this.state.sol6.fieldObservations.map(record => record.id), analysisId: analysis.id, cultivationExperimentId: cultivation.id, cultivationStatus: "IN_PROGRESS", uncertainty: uncertainty.trim() };
    this.state.sol6.report = report;
    this.completeSol6Step("SOL06_SUBMIT_INVESTIGATION_REPORT", { type: "geological_survey", sourceIdentifier: targetId, summary: `Sol 6 field report submitted for ${targetId}; cultivation remains pending until Sol 8.`, details: { sampleId: sample.sampleId, analysisId: analysis.id, experimentId: cultivation.id, cultivationStatus: cultivation.status } });
    this.emit();
    return { success: true, message: "Sol 6 report validated. Cultivation remains in progress; no Sol 8 result is available yet." };
  }

  /**
   * Contextual trigger evaluator when the player enters a module or interacts with an object.
   */
  public handleContextEvent(event: { type: "module_entered" | "trigger_interacted"; module: string; identifier?: string }): {
    handled: boolean;
    feedback?: string;
  } {
    const day = this.state.currentDay;

    // Day 1
    if (day === 1) {
      if (event.type === "trigger_interacted" && event.identifier) {
        if (event.identifier === "Drone" && event.module !== "Drone") {
          return { handled: true, feedback: "The drone can only be inspected from the Drone Section." };
        }
        const taskId = TRIGGER_TO_TASK_MAP[event.identifier];
        if (taskId) {
          const added = this.completeStep(taskId);
          return {
            handled: true,
            feedback: added ? `Orientation task validated: ${taskId}` : undefined
          };
        }
      }
    }

    // Sol 2 and Sol 3 steps are completed only by validated investigation submissions.

    // Day 4
    if (day === 4) {
      if (event.type === "module_entered" && (event.module === "Engineering" || event.module === "Habitat")) {
        this.completeStep("DAY4_REACH_RELEVANT_MODULE");
      }
      if (event.type === "trigger_interacted" && (event.identifier === "Engineering_LifeSupport_Trigger" || event.identifier === "Habitat_LifeSupport_Display")) {
        this.completeStep("DAY4_INSPECT_LIFE_SUPPORT");
        this.completeStep("DAY4_RECORD_VERIFICATION", {
          type: "life_support_verification",
          summary: "Life Support Verification: CO2 scrubbers 0.04% vol, N2/O2 mix balanced, cabin temp 21.5°C.",
          details: { co2Level: "0.04%", cabinTempC: 21.5, cabinPressureKPa: 101.2 }
        });
        return { handled: true, feedback: "Life support verification logged successfully." };
      }
    }

    // Sol 5 tasks are completed by explicit briefing, flight, image-review, and report validation.

    // Day 6
    if (day === 6) {
      if (event.type === "module_entered" && event.module === "Terrain") {
        return { handled: true, feedback: this.isStepComplete("SOL06_ACTIVATE_EVA_SESSION") ? "EVA active. Walk to the official Sol 3 selected target." : "Sol 6 surface work requires the validated briefing, equipment preparation, and active EVA suit." };
      }
    }

    // Sol 7 outdoor access is controlled by the shared EVA policy while the storm is active.

    // Day 8
    if (day === 8) {
      if (
        event.type === "trigger_interacted" &&
        (event.identifier === "LAB_RESEARCH_ANALYSIS_01" || event.identifier === "LAB_RESEARCH_MONITORING_01")
      ) {
        if (!this.state.surfaceObservation) {
          return {
            handled: true,
            feedback: "Prerequisite Missing: No saved Day 7 surface observation found. Complete Sol 07 before analysing."
          };
        }
        this.completeStep("D8_OBJ_01_OPEN_SOURCE_RECORD");
        this.completeStep("D8_OBJ_02_REVIEW_COMPARISON");
        return { handled: true, feedback: "Research Lab Analysis console active. Source observation loaded." };
      }
    }

    // Day 9
    if (day === 9) {
      if (
        event.type === "trigger_interacted" &&
        (event.identifier === "MC_SYSTEMS_01" || event.identifier === "MC_NAVIGATION_01" || event.identifier === "MC_MAIN_01")
      ) {
        this.completeStep("D9_OBJ_01_REVIEW_DRONE_TASK");
        return { handled: true, feedback: "Drone Operation console ready. Prepare for remote FPV survey." };
      }
    }

    return { handled: false };
  }

  /** Sol 5 derives its only mission target from the validated Sol 3 proposal. */
  public selectRouteTarget(_targetId: string): boolean { return false; }

  /**
   * Day 6: Saves Geological Survey Record
   */
  public saveGeologicalSurvey(data: {
    targetId: string;
    observedCategories: {
      surfaceTexture: string;
      fragmentDistribution: string;
      terrainShape: string;
      dustCoverage: string;
      followUpInterest?: string;
    };
    summary: string;
  }): GeologicalSurveyRecord | null {
    if (this.state.currentDay !== 6) return null;
    // Legacy entry point retained for later-day record compatibility. Sol 6
    // completion now requires the target-linked observation/sample workflow.
    if (this.state.sol6.fieldObservations.length === 0) return null;

    const record: GeologicalSurveyRecord = {
      id: `REC_D6_GEOLOGY_${Date.now()}`,
      day: 6,
      targetId: data.targetId,
      source: "PHOBOSIA simulated field observation",
      observedCategories: data.observedCategories,
      summary: data.summary,
      isSimulated: true,
      saved: true,
      routePlanReference: this.state.selectedRouteTarget?.id ?? null,
      missionTimestamp: new Date().toISOString()
    };

    this.state.geologicalSurvey = record;
    this.completeStep("D6_OBJ_03_INSPECT_SURFACE");
    this.completeStep("D6_OBJ_04_SAVE_RECORD", {
      type: "geological_survey",
      sourceIdentifier: data.targetId,
      summary: data.summary,
      details: {
        texture: data.observedCategories.surfaceTexture,
        distribution: data.observedCategories.fragmentDistribution,
        shape: data.observedCategories.terrainShape,
        dust: data.observedCategories.dustCoverage
      }
    });

    this.emit();
    return record;
  }

  /**
   * Day 7: Saves Surface Observation Record
   */
  public saveSurfaceObservation(data: {
    targetId: string;
    observedCategories: {
      surfacePattern: string;
      surfaceMaterialAppearance: string;
      terrainProfile: string;
      areaOfInterest: string;
    };
    followUpQuestion: string;
    summary: string;
  }): SurfaceObservationRecord | null {
    return null;
  }

  /**
   * Day 8: Saves Science Analysis Record (requires Day 7 SurfaceObservationRecord)
   */
  public saveScienceAnalysis(data: {
    selectedInterpretationId: string;
    summary: string;
  }): ScienceAnalysisRecord | null {
    if (this.state.currentDay !== 8) return null;
    if (!this.state.surfaceObservation) {
      return null;
    }

    const interp = PREDEFINED_INTERPRETATIONS.find(i => i.id === data.selectedInterpretationId);
    if (!interp) return null;

    const record: ScienceAnalysisRecord = {
      id: `REC_D8_ANALYSIS_${Date.now()}`,
      day: 8,
      sourceObservationId: this.state.surfaceObservation.id,
      selectedInterpretationId: data.selectedInterpretationId,
      summary: data.summary || `Analysis: ${interp.label}. (${interp.claimStrength} simulated interpretation).`,
      isSimulated: true,
      saved: true,
      comparedSurveyId: this.state.geologicalSurvey?.id ?? null,
      comparisonSummary: this.state.geologicalSurvey
        ? `Cross-referenced against Sol 06 survey (${this.state.geologicalSurvey.id}).`
        : "Solo observation analysis (Sol 06 record not found).",
      missionTimestamp: new Date().toISOString()
    };

    this.state.scienceAnalysis = record;
    this.completeStep("D8_OBJ_03_SELECT_INTERPRETATION");
    this.completeStep("D8_OBJ_04_SAVE_ANALYSIS", {
      type: "science_analysis",
      sourceIdentifier: this.state.surfaceObservation.id,
      summary: record.summary,
      details: {
        sourceId: this.state.surfaceObservation.id,
        interpretation: interp.label,
        comparedGeologyId: this.state.geologicalSurvey?.id ?? "none"
      }
    });

    this.emit();
    return record;
  }

  /**
   * Day 9: Saves Drone Survey Record
   */
  public saveDroneSurvey(data: {
    targetId: string;
    observedCategories: {
      viewpointTerrainShape: string;
      visibleSurfacePattern: string;
      followUpArea: string;
      routeRevisit: string;
    };
    summary: string;
  }): DroneSurveyRecord | null {
    if (this.state.currentDay !== 9) return null;

    const record: DroneSurveyRecord = {
      id: `REC_D9_DRONE_${Date.now()}`,
      day: 9,
      targetId: data.targetId,
      source: "PHOBOSIA simulated remote drone survey",
      observedCategories: data.observedCategories,
      summary: data.summary,
      isSimulated: true,
      saved: true,
      missionTimestamp: new Date().toISOString(),
      relatedGeologicalSurveyId: this.state.geologicalSurvey?.id ?? null,
      relatedSurfaceObservationId: this.state.surfaceObservation?.id ?? null
    };

    this.state.droneSurvey = record;
    this.completeStep("D9_OBJ_03_INSPECT_TARGET");
    this.completeStep("D9_OBJ_04_SAVE_DRONE_RECORD", {
      type: "drone_survey",
      sourceIdentifier: data.targetId,
      summary: data.summary,
      details: {
        target: data.targetId,
        shape: data.observedCategories.viewpointTerrainShape,
        pattern: data.observedCategories.visibleSurfacePattern
      }
    });

    this.emit();
    return record;
  }

  private evaluateObjectiveCompletion(): void {
    const mission = this.getCurrentMission();
    const allStepsComplete = mission.steps.every(s => this.state.completedStepIds.includes(s.stepId));

    if (allStepsComplete && this.state.objectiveState !== "completed" && this.state.objectiveState !== "waiting_for_rest") {
      this.state.objectiveState = "completed";
      this.state.notification = `Objective Completed: ${mission.title}. Return to Habitat to rest.`;
    }
  }

  public getRemainingSteps(): MissionStep[] {
    const mission = this.getCurrentMission();
    return mission.steps.filter(s => !this.state.completedStepIds.includes(s.stepId));
  }

  public canRestAndAdvance(): { canAdvance: boolean; reason: string } {
    const mission = this.getCurrentMission();
    const remaining = this.getRemainingSteps();

    if (this.state.currentDay === 2) {
      const required = DAYS_CONFIG[2].steps.map(step => step.stepId);
      if (!required.every(id => this.state.investigationRecords.some(record => record.taskId === id)) || !this.state.investigationRecords.some(record => record.taskId === "SOL02_READINESS_ASSESSMENT")) {
        return { canAdvance: false, reason: "Sol 2 requires six submitted system investigations and a validated readiness assessment record." };
      }
    }
    if (this.state.currentDay === 3) {
      const required = DAYS_CONFIG[3].steps.map(step => step.stepId);
      if (!required.every(id => this.state.investigationRecords.some(record => record.taskId === id)) || !this.state.investigationRecords.some(record => record.taskId === "SOL03_SUBMIT_TARGET_RECORD")) {
        return { canAdvance: false, reason: "Sol 3 requires all preparation records and a validated target proposal before resting." };
      }
    }
    if (this.state.currentDay === 4) {
      const required = DAYS_CONFIG[4].steps.map(step => step.stepId);
      if (!required.every(id => this.state.investigationRecords.some(record => record.taskId === id)) || !this.isStepComplete("SOL04_DRONE_PHYSICAL_INSPECTION")) {
        return { canAdvance: false, reason: "Sol 4 requires all five valid preparation records and the physical drone inspection before resting." };
      }
      if (this.getSelectedSiteId() !== this.state.selectedSiteId) return { canAdvance: false, reason: "The Sol 4 report must retain the target selected during Sol 3." };
    }

    if (this.state.currentDay === 5) {
      const targetId = this.getSelectedSiteId();
      const prep = this.state.investigationRecords.find(record => record.taskId === "SOL04_SUBMIT_PREPARATION_REPORT");
      if (!targetId || !prep?.evidenceReferences.includes(`TARGET:${targetId}`) || !this.state.sol5.targetInspected || !this.state.sol5.evidenceLoaded || !this.state.sol5.imagesReviewed || !this.state.sol5.flight?.landed || !this.state.sol5.report || this.state.sol5.report.targetId !== targetId) {
        return { canAdvance: false, reason: "Sol 5 requires the valid Sol 3 target, matching Sol 4 preparation report, target inspection, target-specific evidence review, validated landing, and a target-linked report." };
      }
    }

    if (remaining.length > 0) {
      if (this.state.currentDay === 1) {
        return {
          canAdvance: false,
          reason: `Complete the remaining outpost orientation tasks before resting. Day 1 objective incomplete (${remaining.length} of ${mission.steps.length} tasks remaining).`
        };
      }
      const remainingLabels = remaining.map(s => s.label).join(", ");
      return {
        canAdvance: false,
        reason: `Cannot rest yet. Day ${this.state.currentDay} objective incomplete. Remaining: ${remainingLabels}.`
      };
    }

    // Specific record validations per phase
    if (this.state.currentDay === 6 && !this.state.geologicalSurvey) {
      return {
        canAdvance: false,
        reason: "Cannot rest yet. Geological survey record has not been confirmed and saved."
      };
    }
    if (this.state.currentDay === 6 && (!this.state.sol6.report || !this.state.sol6.cultivation || this.state.sol6.cultivation.result !== null)) {
      return { canAdvance: false, reason: "Sol 6 requires the validated field report and a persisted cultivation experiment whose result remains pending for Sol 8." };
    }

    if (this.state.currentDay === 7 && (!this.state.sol7.report?.validated || !this.state.sol7.stormEnded || !this.state.sol7.powerAssessment)) {
      return { canAdvance: false, reason: "Sol 7 requires the validated impact report, storm shutdown and persisted post-storm power assessment before resting." };
    }

    if (this.state.currentDay === 8) {
      if (!this.state.surfaceObservation) {
        return {
          canAdvance: false,
          reason: "Cannot rest yet. Missing prerequisite Day 7 surface observation."
        };
      }
      if (!this.state.scienceAnalysis || this.state.scienceAnalysis.sourceObservationId !== this.state.surfaceObservation.id) {
        return {
          canAdvance: false,
          reason: "Cannot rest yet. Scientific analysis linked to Day 7 record has not been saved."
        };
      }
    }

    // Day 9 concludes Phase 3
    if (this.state.currentDay === 9) {
      if (!this.state.droneSurvey || !this.isStepComplete("D9_OBJ_05_EXIT_FPV")) {
        return {
          canAdvance: false,
          reason: "Cannot rest yet. Drone survey record must be saved and FPV mode exited."
        };
      }
      return {
        canAdvance: false,
        reason: "Day 9 Complete. All Phase 3 geological, surface, lab analysis, and drone survey objectives achieved. Future campaign days will follow in subsequent phases."
      };
    }

    return { canAdvance: true, reason: "Day objective validated. Ready to advance." };
  }

  /**
   * Rest and advance to the next day. Guarded against race conditions, duplicate clicks,
   * and accidental skips.
   */
  public advanceDay(forceImmediate = false): { success: boolean; message: string; newDay?: MissionDayNumber } {
    if (this.isAdvancingDay && !forceImmediate) {
      return { success: false, message: "Day transition already in progress." };
    }

    const check = this.canRestAndAdvance();
    if (!check.canAdvance) {
      return { success: false, message: check.reason };
    }

    if (this.state.currentDay >= 9) {
      return { success: false, message: "Day 9 is the final day of Phase 3." };
    }

    this.isAdvancingDay = true;
    const nextDay = (this.state.currentDay + 1) as MissionDayNumber;

    this.state.currentDay = nextDay;
    this.state.objectiveState = "in_progress";
    this.state.dayBriefingSeen = false;
    this.state.notification = this.getCurrentNavigationNotification() ?? `Day ${nextDay} Begun: ${DAYS_CONFIG[nextDay].title}`;

    this.emit();

    if (forceImmediate) {
      this.isAdvancingDay = false;
    } else {
      setTimeout(() => {
        this.isAdvancingDay = false;
      }, 500);
    }

    return {
      success: true,
      message: `Rest completed. Day ${nextDay} commenced.`,
      newDay: nextDay
    };
  }

  public clearNotification(): void {
    if (this.state.notification) {
      this.state.notification = null;
      this.emit();
    }
  }

  public resetProgress(): void {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(PREV_STORAGE_KEY);
      } catch {
        // Ignore
      }
    }
    this.state = {
      currentDay: 1,
      objectiveState: "in_progress",
      completedStepIds: [],
      completedIntroductionIds: [],
      observationRecords: [],
      selectedRouteTarget: null,
      dayBriefingSeen: false,
      campaignFinished: false,
      notification: null,
      geologicalSurvey: null,
      surfaceObservation: null,
      scienceAnalysis: null,
      droneSurvey: null,
      investigationRecords: [],
      selectedSiteId: null,
      sol5: createInitialSol5Progress(),
      sol6: createInitialSol6Progress(),
      sol7: createInitialSol7Progress()
    };
    this.emit();
  }
}
