import habitatData from "../jsons/Screens/habitatScreenData.json";
import engineeringData from "../jsons/Screens/engineeringScreenData.json";
import missionControlData from "../jsons/Screens/mission-control-screens.json";

export type InvestigationClassification = "anomaly_detected" | "no_anomaly_detected" | "insufficient_evidence";

export interface InvestigationLogEntry {
  id: string;
  title: string;
  systemId: string;
  source: string;
  sourceType: "SIMULATED_GAME_DATA" | "PLAYER_MISSION_RECORD";
  observationTime: string;
  values: unknown;
  limitations: string[];
}

export interface InvestigationSystemDefinition {
  taskId: string;
  systemId: string;
  title: string;
  displayObjects: string[];
  procedure: string[];
  logs: InvestigationLogEntry[];
  notes?: string[];
}

function entry(
  id: string,
  title: string,
  systemId: string,
  moduleLabel: string,
  sourceFile: string,
  displayObject: string,
  values: unknown,
  limitations: string[] = []
): InvestigationLogEntry {
  return {
    id,
    title,
    systemId,
    source: `${sourceFile} → ${displayObject}.data`,
    sourceType: "SIMULATED_GAME_DATA",
    observationTime: "Not recorded in source configuration",
    values,
    limitations: [
      `${moduleLabel} screen configuration labels this information as simulated telemetry.`,
      "The project does not provide a measurement timestamp or external dataset provenance.",
      ...limitations
    ]
  };
}

const habitatScreens = habitatData.screens as Record<string, { data: unknown }>;
const engineeringScreens = engineeringData.screens as Record<string, { data: unknown }>;
const habitatSource = "src/jsons/Screens/habitatScreenData.json";
const engineeringSource = "src/jsons/Screens/engineeringScreenData.json";

export const SOL2_INVESTIGATION_SYSTEMS: Record<string, InvestigationSystemDefinition> = {
  SOL02_HABITAT_STATUS: {
    taskId: "SOL02_HABITAT_STATUS",
    systemId: "habitat_general_status",
    title: "Habitat Status and Life Support",
    displayObjects: ["Habitat_Main_Status_Display", "Habitat_LifeSupport_Display", "Habitat_Emergency_Status_Display"],
    procedure: [
      "Review the Habitat main status display.",
      "Open and inspect the life-support status record.",
      "Open and inspect the emergency status record.",
      "Select the relevant records and document the evidence limits."
    ],
    logs: [
      entry("HAB-STATUS-MAIN", "Habitat main status snapshot", "habitat_general_status", "Habitat", habitatSource, "Habitat_Main_Status_Display", habitatScreens.Habitat_Main_Status_Display.data),
      entry("HAB-LIFE-SUPPORT", "Habitat life-support snapshot", "habitat_life_support", "Habitat", habitatSource, "Habitat_LifeSupport_Display", habitatScreens.Habitat_LifeSupport_Display.data),
      entry("HAB-EMERGENCY", "Habitat emergency status snapshot", "habitat_emergency_status", "Habitat", habitatSource, "Habitat_Emergency_Status_Display", habitatScreens.Habitat_Emergency_Status_Display.data)
    ]
  },
  SOL02_WATER_NUTRITION: {
    taskId: "SOL02_WATER_NUTRITION",
    systemId: "habitat_water_nutrition",
    title: "Water and Nutrition Systems",
    displayObjects: ["Habitat_WaterNutrition_Display"],
    procedure: [
      "Review the water and nutrition status snapshot.",
      "Open and inspect the available supply and quality record.",
      "Record whether the available values support a conclusion or leave an evidence gap."
    ],
    logs: [entry("HAB-WATER-NUTRITION", "Water and nutrition status snapshot", "habitat_water_nutrition", "Habitat", habitatSource, "Habitat_WaterNutrition_Display", habitatScreens.Habitat_WaterNutrition_Display.data)]
  },
  SOL02_ENGINEERING_MONITORING: {
    taskId: "SOL02_ENGINEERING_MONITORING",
    systemId: "engineering_monitoring",
    title: "Engineering Monitoring Records",
    displayObjects: ["MonitoringSection_Indicator_Screen", "MonitoringSection_Operational_Screen", "MonitoringSection_Screen"],
    procedure: [
      "Review the subsystem indicator snapshot.",
      "Inspect the operational monitoring record.",
      "Select records relevant to outpost readiness and explain why they matter."
    ],
    logs: [
      entry("ENG-MON-INDICATORS", "Subsystem health indicators", "engineering_monitoring", "Engineering Unit", engineeringSource, "MonitoringSection_Indicator_Screen", engineeringScreens.MonitoringSection_Indicator_Screen.data),
      entry("ENG-MON-OPERATIONAL", "Engineering operational snapshot", "engineering_monitoring", "Engineering Unit", engineeringSource, "MonitoringSection_Operational_Screen", engineeringScreens.MonitoringSection_Operational_Screen.data),
      entry("ENG-MON-NETWORK", "Monitoring network snapshot", "engineering_monitoring", "Engineering Unit", engineeringSource, "MonitoringSection_Screen", engineeringScreens.MonitoringSection_Screen.data)
    ]
  },
  SOL02_POWER_REVIEW: {
    taskId: "SOL02_POWER_REVIEW",
    systemId: "engineering_power_unit",
    title: "Power Unit Investigation",
    displayObjects: ["PowerUnitScreenMain", "PowerUnitScreenMain02", "PowerUnitScreen000", "PowerUnitScreen000.001"],
    procedure: [
      "Review the primary power status and identify its provenance.",
      "Open the power diagnostic and bus records.",
      "Compare the displayed simulated generation and load values.",
      "Inspect the battery record and note that source reference limits are not provided.",
      "Select supporting records, classify the evidence, and explain your conclusion."
    ],
    logs: [
      entry("ENG-POWER-MAIN", "Primary power generation snapshot", "engineering_power_unit", "Engineering Unit", engineeringSource, "PowerUnitScreenMain", engineeringScreens.PowerUnitScreenMain.data, ["No approved power-system reference limits are included in the project."]),
      entry("ENG-POWER-DIAGNOSTICS", "Load distribution and diagnostics snapshot", "engineering_power_unit", "Engineering Unit", engineeringSource, "PowerUnitScreenMain02", engineeringScreens.PowerUnitScreenMain02.data, ["Trend values are simulated screen data, not a time-stamped field log."]),
      entry("ENG-POWER-BUS", "Power bus snapshot", "engineering_power_unit", "Engineering Unit", engineeringSource, "PowerUnitScreen000", engineeringScreens.PowerUnitScreen000.data, ["The source display does not define voltage or frequency reference limits."]),
      entry("ENG-POWER-BATTERY", "Battery storage snapshot", "engineering_power_unit", "Engineering Unit", engineeringSource, "PowerUnitScreen000.001", engineeringScreens["PowerUnitScreen000.001"].data, ["The source display does not define battery reference limits."])
    ],
    notes: ["The existing screen renderer labels the generation and load values in kW and the battery value in percent.", "Simulated arithmetic check: 98.4 kW reactor output + 42.1 kW solar generation − 118.6 kW total load = 21.9 kW simulated margin.", "The 21.9 kW margin is a calculation from simulated values; it is not a verified outpost power measurement or an external safety limit."]
  },
  SOL02_ENGINEERING_LIFESUPPORT: {
    taskId: "SOL02_ENGINEERING_LIFESUPPORT",
    systemId: "engineering_life_support",
    title: "Engineering Life-Support Records",
    displayObjects: ["LifeSupportUnitScreenMain04", "LifeSupportUnitScreenMain02.001", "LifeSupportUnitScreenMain03"],
    procedure: [
      "Review the Engineering environmental and gas-generation snapshot.",
      "Inspect water and recycling status.",
      "Inspect airflow, filter load, and integrity status.",
      "Record any cross-system comparison limits."
    ],
    logs: [
      entry("ENG-LS-ENVIRONMENT", "Environmental and gas-generation snapshot", "engineering_life_support", "Engineering Unit", engineeringSource, "LifeSupportUnitScreenMain04", engineeringScreens.LifeSupportUnitScreenMain04.data),
      entry("ENG-LS-WATER", "Water and recycling snapshot", "engineering_life_support", "Engineering Unit", engineeringSource, "LifeSupportUnitScreenMain02.001", engineeringScreens["LifeSupportUnitScreenMain02.001"].data),
      entry("ENG-LS-AIRFLOW", "Airflow and filtration snapshot", "engineering_life_support", "Engineering Unit", engineeringSource, "LifeSupportUnitScreenMain03", engineeringScreens.LifeSupportUnitScreenMain03.data)
    ]
  },
  SOL02_DIAGNOSTICS: {
    taskId: "SOL02_DIAGNOSTICS",
    systemId: "engineering_diagnostics",
    title: "Engineering Diagnostics",
    displayObjects: ["DiagnosticsWorkbenchScreen_01"],
    procedure: [
      "Review the diagnostic status and any available fault entries.",
      "Open the diagnostic record and inspect each listed result.",
      "Separate missing diagnostic information from a confirmed fault.",
      "Document whether a follow-up check is justified."
    ],
    logs: [entry("ENG-DIAG-WORKBENCH", "Diagnostics workbench snapshot", "engineering_diagnostics", "Engineering Unit", engineeringSource, "DiagnosticsWorkbenchScreen_01", engineeringScreens.DiagnosticsWorkbenchScreen_01.data, ["A missing diagnostic result is not evidence of a fault."])]
  }
};

export interface TrainingDataset {
  id: string;
  title: string;
  source: string;
  provider: string;
  productType: string;
  measurementType: string;
  spatialCoverage: string;
  temporalCoverage: string;
  units: string;
  limitations: string[];
  provenance: string;
  isSimulated: true;
}

export const SOL3_TRAINING_DATASETS: TrainingDataset[] = [
  {
    id: "PHOBOSIA_TARGET_PROFILE_TRAINING",
    title: "PHOBOSIA Training Target Profiles",
    source: "Existing PHOBOSIA MissionManager target profiles",
    provider: "PHOBOSIA simulated mission configuration",
    productType: "Target-planning metadata",
    measurementType: "No scientific measurements included",
    spatialCoverage: "PHOBOSIA in-game scene profiles only; not Mars geodetic coordinates",
    temporalCoverage: "Not recorded",
    units: "Scene coordinate units only; no scientific measurement units",
    limitations: [
      "This is simulated planning metadata, not a NASA or other external dataset.",
      "It contains target descriptions, scene coordinates, distance estimates, and hazard labels only.",
      "It contains no imagery, spectra, geology measurements, or independently verified accessibility data.",
      "It can support a training plan for what to observe, but cannot establish a scientific conclusion."
    ],
    provenance: "src/core/MissionManager.ts → MASTER_TERRAIN_TARGETS",
    isSimulated: true
  }
];

export const SOL3_CONTEXT_LOGS: InvestigationLogEntry[] = [
  entry("SOL03-MISSION-CONTEXT", "Active mission context", "mission_context", "MissionManager", "src/core/MissionManager.ts → DAYS_CONFIG[3]", "Sol 3 mission definition", {
    missionObjective: "Scientific Target Selection",
    availableReadinessRecord: "Loaded from the player's submitted Sol 2 readiness assessment",
    provenance: "Player-generated PHOBOSIA mission record",
    limitations: ["Does not certify real outpost conditions."]
  }, ["Mission context is fictional PHOBOSIA story information; readiness evidence remains simulated/player-generated."])
];

export const SOL3_SYSTEM_LOGS: InvestigationLogEntry[] = [
  entry("SOL03-COMMS-SYSTEMS", "Mission communications and systems snapshot", "mission_system_constraints", "Mission Control", "src/jsons/Screens/mission-control-screens.json", "MC_COMMUNICATIONS and MC_SYSTEMS screen fallbacks", {
    communications: (missionControlData.screens as any[]).find(s => s.screenId === "MC_COMMUNICATIONS")?.content,
    systems: (missionControlData.screens as any[]).find(s => s.screenId === "MC_SYSTEMS")?.content
  }, ["The configuration marks these fallback values as simulated mission data; they are not live links or telemetry."])
];
