/**
 * PHOBOSIA — Mission System & State Progression Engine (Days 1–9)
 *
 * Implements the authoritative Days 1-9 mission sequence, step validation,
 * observation/verification/survey record persistence, and guarded rest-based day progression.
 */

import { DAY1_TASKS, TRIGGER_TO_TASK_MAP } from "./Day1Config";
import { SOL2_INVESTIGATION_RULES, SOL3_DATASET_IDS } from "./MissionInvestigationRules";

export type MissionDayNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type ObjectiveState = "not_started" | "in_progress" | "completed" | "waiting_for_rest";

export interface MissionStep {
  stepId: string;
  label: string;
  description: string;
  targetModule?: string;
  targetTrigger?: string;
  completed: boolean;
}

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
}

export interface InvestigationRecord {
  id: string; missionId: string; taskId: string; systemId: string;
  evidenceReferences: string[]; classification: string; rationale: string;
  limitations: string[]; sourceType: string; submittedAt: string;
  playerConclusion: string; systemValidation: string; scientificQuestion?: string;
}

const STORAGE_KEY = "phobosia_mission_progress_v4";
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
    primaryObjective: "Explore the outpost, inspect the required systems and consoles across all modules, and complete the 19-task orientation checklist.",
    steps: DAY1_TASKS.filter(t => t.required).map(t => ({
      stepId: t.taskId,
      label: t.title,
      description: t.description,
      completed: false
    })),
    allowedModules: ["Habitat", "Hub", "Airlock", "Engineering", "Science", "MissionControl"],
    completionFeedback: "Outpost orientation complete. All 19 required tasks are complete. Return to Habitat Rest Area to finish Day 1."
  },
  2: {
    day: 2,
    id: "DAY_02_OUTPOST_READINESS",
    title: "Outpost Readiness",
    storyContext: "Review simulated outpost records and document evidence limits before scientific operations.",
    briefing: "Inspect Habitat and Engineering records, submit evidence-linked investigations, then submit a readiness assessment.",
    primaryObjective: "Submit six system investigations and a readiness record based on those records.",
    steps: [
      ["SOL02_HABITAT_STATUS", "Habitat status inspection", "Inspect Habitat status records."],
      ["SOL02_WATER_NUTRITION", "Water and nutrition inspection", "Inspect supply status and logs."],
      ["SOL02_ENGINEERING_MONITORING", "Engineering monitoring inspection", "Review monitoring records."],
      ["SOL02_POWER_REVIEW", "Power unit investigation", "Investigate power records and their limits."],
      ["SOL02_ENGINEERING_LIFESUPPORT", "Engineering life-support inspection", "Review environmental and recycling records."],
      ["SOL02_DIAGNOSTICS", "Diagnostics inspection", "Review diagnostic records and follow-up needs."],
      ["SOL02_READINESS_ASSESSMENT", "Outpost readiness assessment", "Submit an assessment referencing the six investigations."]
    ].map(([stepId, label, description]) => ({ stepId, label, description, completed: false })),
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
      ["SOL03_MISSION_CONTEXT", "Mission context review", "Review the Sol 2 readiness record and mission context."],
      ["SOL03_OBSERVATION_SITE_REVIEW", "Observation site investigation", "Compare available in-game target profiles."],
      ["SOL03_SYSTEM_CONSTRAINTS", "Systems and communications constraints", "Review simulated operational constraints."],
      ["SOL03_SELECT_TARGET", "Select a scientific target", "Choose a target and focused scientific question."],
      ["SOL03_SELECT_DATASET", "Select and evaluate a dataset", "Evaluate the available training metadata."],
      ["SOL03_SUBMIT_TARGET_RECORD", "Submit target proposal", "Review and submit the complete proposal."]
    ].map(([stepId, label, description]) => ({ stepId, label, description, completed: false })),
    allowedModules: ["MissionControl", "Science", "Hub", "Habitat"],
    completionFeedback: "Target proposal submitted. Return to Habitat to conclude Sol 3."
  },
  4: {
    day: 4,
    id: "DAY_04_LIFE_SUPPORT_VERIFICATION",
    title: "Life-Support Verification",
    storyContext: "Pre-EVA verification. Atmospheric scrubbers and pressurization balance must be validated.",
    briefing: "Perform a comprehensive life-support verification across Engineering and Habitat subsystems before tomorrow's outdoor route planning.",
    primaryObjective: "Inspect life-support diagnostics console and save verification record.",
    steps: [
      { stepId: "DAY4_REACH_RELEVANT_MODULE", label: "Access Life Support", description: "Locate Life Support diagnostics console in Engineering Unit.", targetModule: "Engineering", completed: false },
      { stepId: "DAY4_INSPECT_LIFE_SUPPORT", label: "Inspect Life Support Diagnostics", description: "Verify atmospheric scrubber and thermal regulation loops.", targetTrigger: "Engineering_LifeSupport_Trigger", completed: false },
      { stepId: "DAY4_RECORD_VERIFICATION", label: "Record Verification", description: "Save Life Support Verification report.", targetTrigger: "Engineering_LifeSupport_Trigger", completed: false }
    ],
    allowedModules: ["Engineering", "Habitat", "Hub"],
    completionFeedback: "Life-support verification logged. CO2 scrubbers nominal (0.04% vol). Return to Habitat to rest."
  },
  5: {
    day: 5,
    id: "DAY_05_TERRAIN_ROUTE_PLANNING",
    title: "Terrain Route Planning",
    storyContext: "Preparation for outdoor scientific observation on the Martian surface.",
    briefing: "Proceed to Mission Control. Access the Terrain Map console, review verified Master Terrain observation targets, and select your primary route plan for future field surveys.",
    primaryObjective: "Review Master Terrain map in Mission Control and select a validated survey route plan.",
    steps: [
      { stepId: "DAY5_REACH_MISSION_CONTROL", label: "Enter Mission Control", description: "Transit to Mission Control from Central Hub.", targetModule: "MissionControl", completed: false },
      { stepId: "DAY5_REVIEW_MASTER_TERRAIN", label: "Review Terrain Map", description: "Inspect Terrain Map screen in Mission Control.", targetTrigger: "MC_NAVIGATION_01", completed: false },
      { stepId: "DAY5_SELECT_ROUTE_OR_TARGET", label: "Select Survey Target", description: "Choose a validated observation target from Master Terrain.", targetTrigger: "MC_NAVIGATION_01", completed: false },
      { stepId: "DAY5_SAVE_ROUTE_PLAN", label: "Save Route Plan", description: "Confirm and save Route Plan to mission telemetry.", targetTrigger: "MC_NAVIGATION_01", completed: false }
    ],
    allowedModules: ["MissionControl", "Hub", "Habitat", "Airlock", "Terrain"],
    completionFeedback: "Route plan registered. Target survey profile logged. You may rest in Habitat to commence Day 6 field surveys."
  },
  6: {
    day: 6,
    id: "DAY_06_GEOLOGICAL_SITE_SURVEY",
    title: "Geological Site Survey",
    storyContext: "Field Survey Phase. Utilizing the Day 5 route plan for an outdoor geological site survey on the Martian surface.",
    briefing: "Mission Control has prepared your survey sortie using the Day 5 route plan. Exit through the Airlock to the Mars master terrain, navigate to the designated survey target area, inspect surface characteristics, and log the preliminary geological record.",
    primaryObjective: "Navigate to the designated terrain survey area, inspect geological characteristics, and save preliminary field survey record.",
    steps: [
      { stepId: "D6_OBJ_01_REVIEW_TARGET", label: "Review survey target", description: "Review geological survey target at Mission Control navigation console.", targetTrigger: "MC_NAVIGATION_01", completed: false },
      { stepId: "D6_OBJ_02_REACH_TARGET", label: "Reach survey area", description: "Exit via Airlock and reach designated survey area on Mars terrain.", targetModule: "Terrain", completed: false },
      { stepId: "D6_OBJ_03_INSPECT_SURFACE", label: "Inspect surface", description: "Perform geological observation scan of surface characteristics.", completed: false },
      { stepId: "D6_OBJ_04_SAVE_RECORD", label: "Save geological record", description: "Save preliminary GeologicalSurveyRecord to telemetry.", completed: false }
    ],
    allowedModules: ["MissionControl", "Hub", "Habitat", "Airlock", "Terrain"],
    completionFeedback: "Preliminary geological record registered. Field survey complete. Return to Habitat rest area to conclude Day 6."
  },
  7: {
    day: 7,
    id: "DAY_07_SURFACE_OBSERVATION",
    title: "Surface Observation",
    storyContext: "Field Observation Phase. Focused outdoor surface feature inspection for tomorrow's lab analysis.",
    briefing: "Mission Control requests a focused observation of a surface feature. Proceed through the Airlock to the terrain, perform the surface scan at the designated site, and save the observation record for Day 8 laboratory analysis.",
    primaryObjective: "Exit through Airlock, perform surface scan at designated observation site, and save surface record for lab analysis.",
    steps: [
      { stepId: "D7_OBJ_01_REVIEW_TASK", label: "Review observation task", description: "Review Day 7 surface observation objectives.", completed: false },
      { stepId: "D7_OBJ_02_USE_AIRLOCK", label: "Exit through Airlock", description: "Transit through Airlock to outdoor terrain.", targetModule: "Terrain", completed: false },
      { stepId: "D7_OBJ_03_PERFORM_SCAN", label: "Perform surface scan", description: "Conduct focused surface observation scan on Mars terrain.", completed: false },
      { stepId: "D7_OBJ_04_SAVE_OBSERVATION", label: "Save observation record", description: "Confirm and save SurfaceObservationRecord for lab analysis.", completed: false }
    ],
    allowedModules: ["Habitat", "Hub", "Airlock", "Terrain"],
    completionFeedback: "Surface observation recorded and transferred to Research Lab. Return to Habitat rest area to conclude Day 7."
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

export class MissionManager {
  private state: MissionProgressState;
  private listeners = new Set<(state: Readonly<MissionProgressState>) => void>();
  private isAdvancingDay = false;

  constructor() {
    this.state = this.loadState();
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
            return {
              currentDay: parsed.currentDay as MissionDayNumber,
              objectiveState: parsed.objectiveState ?? "not_started",
              completedStepIds: Array.isArray(parsed.completedStepIds) ? parsed.completedStepIds : [],
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
              investigationRecords: Array.isArray(parsed.investigationRecords) ? parsed.investigationRecords : []
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
      investigationRecords: []
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

  public markBriefingSeen(): void {
    if (!this.state.dayBriefingSeen) {
      this.state.dayBriefingSeen = true;
      if (this.state.objectiveState === "not_started") {
        this.state.objectiveState = "in_progress";
      }

      // Day 7: reviewing briefing satisfies D7_OBJ_01_REVIEW_TASK
      if (this.state.currentDay === 7) {
        this.completeStep("D7_OBJ_01_REVIEW_TASK");
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

  public submitInvestigation(input: { taskId: string; evidenceReferences: string[]; classification: string; rationale: string; limitations?: string[]; procedureChecks: string[]; selectedTargetId?: string; datasetId?: string; scientificQuestion?: string }): { success: boolean; message: string } {
    const day = this.state.currentDay;
    if (day !== 2 && day !== 3) return { success: false, message: "Investigations are not available on the active Sol." };
    const task = DAYS_CONFIG[day].steps.find(step => step.stepId === input.taskId);
    if (!task) return { success: false, message: "This task is not part of the active Sol." };
    if (input.rationale.trim().length < 12) return { success: false, message: "Enter a rationale of at least 12 characters." };
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
    if (input.taskId === "SOL03_OBSERVATION_SITE_REVIEW" && !MASTER_TERRAIN_TARGETS.some(t => input.evidenceReferences.includes(`TARGET:${t.id}`))) return { success: false, message: "Reference at least one available target profile." };
    if (input.taskId === "SOL03_SELECT_TARGET" && !input.evidenceReferences.includes(`TARGET:${input.selectedTargetId}`)) return { success: false, message: "Reference the selected target profile as supporting evidence." };
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
      missionId: DAYS_CONFIG[day].id, taskId: input.taskId,
      systemId: definition?.systemId ?? input.taskId,
      evidenceReferences: [...new Set(input.evidenceReferences)], classification: input.classification,
      rationale: input.rationale.trim(), limitations: input.limitations ?? [],
      sourceType: day === 2 ? "SIMULATED_GAME_DATA" : "PHOBOSIA_SIMULATED_TRAINING_AND_PLAYER_RECORDS",
      submittedAt: prior.find(r => r.taskId === input.taskId)?.submittedAt ?? new Date().toISOString(),
      playerConclusion: input.classification,
      systemValidation: "Record structure and references validated. The player's conclusion is not an independently verified technical or scientific finding.",
      scientificQuestion: input.scientificQuestion?.trim()
    };
    if (input.selectedTargetId) record.evidenceReferences.push(`TARGET:${input.selectedTargetId}`);
    if (input.datasetId) record.evidenceReferences.push(`DATASET:${input.datasetId}`);
    this.state.investigationRecords = [...prior.filter(r => r.taskId !== input.taskId), record];
    this.completeStep(input.taskId);
    this.emit();
    return { success: true, message: "Mission record saved with its evidence and provenance." };
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
      this.emit();
      return true;
    }
    return false;
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

    // Day 5
    if (day === 5) {
      if (event.type === "module_entered" && event.module === "MissionControl") {
        this.completeStep("DAY5_REACH_MISSION_CONTROL");
      }
      if (event.type === "trigger_interacted" && (event.identifier === "MC_NAVIGATION_01" || event.identifier === "MC_MAIN_01")) {
        this.completeStep("DAY5_REVIEW_MASTER_TERRAIN");
        return { handled: true, feedback: "Terrain Map console active. Select a survey route." };
      }
    }

    // Day 6
    if (day === 6) {
      if (event.type === "trigger_interacted" && (event.identifier === "MC_NAVIGATION_01" || event.identifier === "MC_MAIN_01")) {
        this.completeStep("D6_OBJ_01_REVIEW_TARGET");
        return { handled: true, feedback: "Day 6 Survey Target verified on navigation console." };
      }
      if (event.type === "module_entered" && event.module === "Terrain") {
        this.completeStep("D6_OBJ_02_REACH_TARGET");
        return { handled: true, feedback: "Entered Martian surface. Navigate toward survey area." };
      }
    }

    // Day 7
    if (day === 7) {
      if (event.type === "module_entered" && event.module === "Terrain") {
        this.completeStep("D7_OBJ_02_USE_AIRLOCK");
        return { handled: true, feedback: "Airlock transit complete. Approach designated observation area." };
      }
    }

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

  public selectRouteTarget(targetId: string): boolean {
    const target = MASTER_TERRAIN_TARGETS.find(t => t.id === targetId);
    if (!target || this.state.currentDay !== 5) return false;

    this.state.selectedRouteTarget = target;
    this.completeStep("DAY5_SELECT_ROUTE_OR_TARGET");
    this.completeStep("DAY5_SAVE_ROUTE_PLAN", {
      type: "route_plan",
      summary: `Survey Route Plan confirmed: ${target.name} (${target.distanceEstimate})`,
      details: {
        targetId: target.id,
        targetName: target.name,
        targetX: target.coordinates.x,
        targetY: target.coordinates.y,
        targetZ: target.coordinates.z,
        hazard: target.hazardRating
      }
    });
    this.emit();
    return true;
  }

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
    if (this.state.currentDay !== 7) return null;

    const record: SurfaceObservationRecord = {
      id: `REC_D7_SURFACE_${Date.now()}`,
      day: 7,
      targetId: data.targetId,
      source: "PHOBOSIA simulated surface observation",
      observedCategories: data.observedCategories,
      followUpQuestion: data.followUpQuestion,
      summary: data.summary,
      isSimulated: true,
      saved: true,
      missionTimestamp: new Date().toISOString(),
      relatedGeologicalSurveyId: this.state.geologicalSurvey?.id ?? null
    };

    this.state.surfaceObservation = record;
    this.completeStep("D7_OBJ_03_PERFORM_SCAN");
    this.completeStep("D7_OBJ_04_SAVE_OBSERVATION", {
      type: "surface_observation",
      sourceIdentifier: data.targetId,
      summary: data.summary,
      details: {
        pattern: data.observedCategories.surfacePattern,
        appearance: data.observedCategories.surfaceMaterialAppearance,
        profile: data.observedCategories.terrainProfile,
        question: data.followUpQuestion
      }
    });

    this.emit();
    return record;
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

    if (this.state.currentDay === 7 && !this.state.surfaceObservation) {
      return {
        canAdvance: false,
        reason: "Cannot rest yet. Surface observation record has not been saved for lab analysis."
      };
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
    this.state.notification = `Day ${nextDay} Begun: ${DAYS_CONFIG[nextDay].title}`;

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
      investigationRecords: []
    };
    this.emit();
  }
}
