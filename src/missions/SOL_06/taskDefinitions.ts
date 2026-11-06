/** Sol 6 task IDs mirror the mandatory task list in jsons/Missions/sol-06.json. */
export const SOL06_TASKS = [
  { stepId: "SOL06_REVIEW_MISSION_BRIEFING", label: "Review Surface Investigation Briefing", description: "Review the official Sol 3 target, prior Sol 4/5 records and field requirements.", targetTrigger: "MC_NAVIGATION_01" },
  { stepId: "SOL06_PREPARE_FIELD_EQUIPMENT", label: "Prepare Geological Field Equipment", description: "Review the available sample-handling and contamination-control workflow.", targetTrigger: "LAB_RESEARCH_ANALYSIS_01", requiresCompletedTasks: ["SOL06_REVIEW_MISSION_BRIEFING"] },
  { stepId: "SOL06_ACTIVATE_EVA_SESSION", label: "Prepare for Mars Surface Exploration", description: "Activate the existing EVA suit in the Airlock.", targetModule: "Airlock", requiresCompletedTasks: ["SOL06_PREPARE_FIELD_EQUIPMENT"] },
  { stepId: "SOL06_REACH_SELECTED_TARGET", label: "Reach the Selected Investigation Target", description: "Walk to the exact Sol 3 target resolved from the loaded terrain scene.", targetModule: "Terrain", requiresCompletedTasks: ["SOL06_ACTIVATE_EVA_SESSION"] },
  { stepId: "SOL06_COMPLETE_FIELD_OBSERVATIONS", label: "Conduct Ground-Level Geological Observations", description: "Save a target-linked field record that separates visible observations from interpretation.", targetModule: "Terrain", requiresCompletedTasks: ["SOL06_REACH_SELECTED_TARGET"] },
  { stepId: "SOL06_COLLECT_SOIL_SAMPLE", label: "Collect and Secure a Soil Sample", description: "Register one uniquely identified simulated regolith sample with provenance.", targetModule: "Terrain", requiresCompletedTasks: ["SOL06_COMPLETE_FIELD_OBSERVATIONS"] },
  { stepId: "SOL06_RETURN_TO_AIRLOCK", label: "Return to the Airlock", description: "Use the existing Mars terrain Airlock return transition with suit and sample state preserved.", targetTrigger: "Spwaning_Position", requiresCompletedTasks: ["SOL06_COLLECT_SOIL_SAMPLE"] },
  { stepId: "SOL06_REMOVE_EVA_SUIT", label: "Complete Airlock Entry and Remove EVA Suit", description: "Remove the suit at the existing preparation interaction inside the Airlock.", targetModule: "Airlock", requiresCompletedTasks: ["SOL06_RETURN_TO_AIRLOCK"] },
  { stepId: "SOL06_TRANSFER_SAMPLE", label: "Transfer Sample to the Research Lab", description: "Register receipt of the same secured sample in the existing analysis station.", targetTrigger: "LAB_RESEARCH_ANALYSIS_01", requiresCompletedTasks: ["SOL06_REMOVE_EVA_SUIT"] },
  { stepId: "SOL06_ANALYSE_SAMPLE", label: "Perform Preliminary Sample Analysis", description: "Save a cautious simulated visual analysis and its data limitations.", targetTrigger: "LAB_RESEARCH_ANALYSIS_01", requiresCompletedTasks: ["SOL06_TRANSFER_SAMPLE"] },
  { stepId: "SOL06_START_CULTIVATION_EXPERIMENT", label: "Initiate Soil Cultivation Experiment", description: "Register the same sample in the existing cultivation unit; result remains pending until Sol 8.", targetTrigger: "LAB_CULTIVATION_01", requiresCompletedTasks: ["SOL06_ANALYSE_SAMPLE"] },
  { stepId: "SOL06_SUBMIT_INVESTIGATION_REPORT", label: "Submit Sol 6 Surface Investigation Report", description: "Submit the report with observation, provenance, analysis and pending cultivation evidence.", targetTrigger: "MC_NAVIGATION_01", requiresCompletedTasks: ["SOL06_START_CULTIVATION_EXPERIMENT"] }
] as const;

export type Sol6TaskId = typeof SOL06_TASKS[number]["stepId"];
export const SOL06_TASK_IDS: readonly Sol6TaskId[] = SOL06_TASKS.map(task => task.stepId);

export interface Sol6FieldObservation {
  id: string;
  targetId: string;
  sol: 6;
  timestamp: string;
  locationReference: string;
  observationCategory: string;
  observationDescription: string;
  playerInterpretation: string;
  evidenceReferences: string[];
  uncertainty: string;
  simulated: true;
}

export interface Sol6SampleRecord {
  sampleId: string;
  targetId: string;
  collectionSol: 6;
  collectionLocationReference: string;
  sampleType: "soil_regolith";
  containerReference: string;
  collectionStatus: "COLLECTED_AND_SECURED";
  sealingStatus: "SECURED";
  transferred: boolean;
}

export interface Sol6AnalysisRecord {
  id: string;
  sampleId: string;
  visualAppearance: string;
  grainSizeOrTexture: string;
  colourDescription: string;
  supportedIndicators: string;
  limitationsAndUncertainty: string;
  playerInterpretation: string;
  simulated: true;
  timestamp: string;
}

export interface Sol6CultivationExperiment {
  id: string;
  sampleId: string;
  unitReference: "LAB_CULTIVATION_01";
  startSol: 6;
  expectedResultSol: 8;
  status: "IN_PROGRESS";
  result: null;
}

export interface Sol6Report {
  id: string;
  targetId: string;
  sampleId: string;
  submittedAt: string;
  observationIds: string[];
  analysisId: string;
  cultivationExperimentId: string;
  cultivationStatus: "IN_PROGRESS";
  uncertainty: string;
}
