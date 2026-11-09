export type Section = "habitat" | "engineering" | "research" | "missionControl" | "centralHub" | "airlock";
export interface ScreenRecord { id: string; mesh: string; title: string; purpose?: string; data?: unknown; content?: any }
export interface TriggerSpec { title: string; location: string; section?: Section; screens: string[]; tasks?: string[]; workstation?: boolean }

// Physical E-key interaction registry used by TriggerOperatingSystem. Sol 10
// reuses these exact IDs so verification occurs at existing interaction points.
export const TRIGGERS: Record<string, TriggerSpec> = {
  HAB_MONITOR_01: { title: "Habitat Main Monitor", location: "Habitat — Main Status Console", section: "habitat", screens: ["Habitat_Main_Status_Display", "Habitat_LifeSupport_Display", "Habitat_Emergency_Status_Display"], tasks: ["SOL02_HABITAT_STATUS"] },
  HAB_WATER_NUTRITION_01: { title: "Water and Nutrition", location: "Habitat — Water and Nutrition Station", section: "habitat", screens: ["Habitat_WaterNutrition_Display"], tasks: ["SOL02_WATER_NUTRITION"] },
  HAB_WORKSTATION_01: { title: "Habitat Workstation", location: "Habitat — Crew Workstation", screens: ["Habitat_Workstation_Display"], workstation: true },
  Engineering_Monitoring_Trigger: { title: "Engineering Monitoring", location: "Engineering Unit — Monitoring Console", section: "engineering", screens: ["MonitoringSection_Indicator_Screen", "MonitoringSection_Operational_Screen", "MonitoringSection_Screen"], tasks: ["SOL02_ENGINEERING_MONITORING", "SOL02_READINESS_ASSESSMENT"] },
  Engineering_PowerUnit_Trigger: { title: "Power Unit", location: "Engineering Unit — Power Distribution Console", section: "engineering", screens: ["PowerUnitScreenMain", "PowerUnitScreenMain02", "PowerUnitScreen000", "PowerUnitScreen000.001"], tasks: ["SOL02_POWER_REVIEW"] },
  Engineering_LifeSupport_Trigger: { title: "Engineering Life Support", location: "Engineering Unit — Life Support Console", section: "engineering", screens: ["LifeSupportUnitScreenMain04", "LifeSupportUnitScreenMain02.001", "LifeSupportUnitScreenMain03"], tasks: ["SOL02_ENGINEERING_LIFESUPPORT"] },
  Engineering_Diagnostics_Trigger: { title: "Diagnostics Workbench", location: "Engineering Unit — Diagnostics Workbench", section: "engineering", screens: ["DiagnosticsWorkbenchScreen_01"], tasks: ["SOL02_DIAGNOSTICS"] },
  Engineering_InfoDisplay_Trigger: { title: "Storage and Inventory", location: "Engineering Unit — Storage Display", section: "engineering", screens: ["Storage_Screen"] },
  LAB_RESEARCH_MONITORING_01: { title: "Research Monitoring", location: "Science Lab — Monitoring Station", section: "research", screens: ["ResearchMonitoring_MainScreen"] },
  LAB_RESEARCH_ANALYSIS_01: { title: "Scientific Analysis", location: "Science Lab — Scientific Analysis Station", section: "research", screens: ["ResearchMonitoring_SystemScreen"], tasks: ["SOL03_SELECT_DATASET", "SOL04_TERRAIN_DATA_REVIEW"] },
  LAB_SEED_STORAGE_01: { title: "Seed Storage", location: "Science Lab — Seed Storage", section: "research", screens: ["SeedStorage_InventoryScreen"] },
  LAB_WATER_NUTRITION_01: { title: "Water and Nutrition Mixing", location: "Science Lab — Nutrient Preparation Station", section: "research", screens: ["WaterNutrition_MixingScreen"] },
  LAB_WATER_SERVICE_01: { title: "Water Quality and Service", location: "Science Lab — Water Quality Station", section: "research", screens: ["WaterNutrition_QualityScreen"] },
  LAB_CULTIVATION_01: { title: "Cultivation Environment", location: "Science Lab — Cultivation Bay Console", section: "research", screens: ["Cultivation_EnvironmentScreen"] },
  MC_MAIN_01: { title: "Mission Control Main Section", location: "Mission Control — Main Operations Console", section: "missionControl", screens: ["MissionControl_ObjectivesScreen", "MissionControl_OutpostStatusScreen", "MissionControl_OverviewScreen"], tasks: ["SOL03_MISSION_CONTEXT", "SOL03_SUBMIT_TARGET_RECORD", "SOL04_MISSION_CONTEXT", "SOL04_SUBMIT_PREPARATION_REPORT"] },
  MC_SYSTEMS_01: { title: "Communications and Systems", location: "Mission Control — Systems Console", section: "missionControl", screens: ["MissionControl_CommunicationsScreen", "MissionControl_SystemsScreen"], tasks: ["SOL03_SYSTEM_CONSTRAINTS"] },
  MC_NAVIGATION_01: { title: "Navigation and Observation Sites", location: "Mission Control — Observation Planning Console", section: "missionControl", screens: ["MissionControl_DroneOperationScreen", "MissionControl_ObservationSitesScreen", "MissionControl_TerrainMapScreen"], tasks: ["SOL03_OBSERVATION_SITE_REVIEW", "SOL03_SELECT_TARGET", "SOL04_SELECTED_TARGET_INVESTIGATION", "SOL04_DRONE_MISSION_PLAN"] },
  Env_Status_Display: { title: "Environment Status", location: "Central Connector — Environment Display", section: "centralHub", screens: ["Env_Status_Display"] },
  Internal_Communication_Display: { title: "Internal Communications", location: "Central Connector — Communications Display", section: "centralHub", screens: ["Internal_Communication_Display"] },
  Module_Status_Display: { title: "Module Status", location: "Central Connector — Module Status Display", section: "centralHub", screens: ["Module_Status_Display"] },
  Airlock_Control_Console_Trigger: { title: "Airlock Control Console", location: "Airlock — Egress Control Console", section: "airlock", screens: ["Airlock_Control_Console"] },
  PowerUnit_A: { title: "Solar Panel A Repair", location: "Mars Terrain — Solar Panel A", screens: [] },
  PowerUnit_B: { title: "Solar Panel B Repair", location: "Mars Terrain — Solar Panel B", screens: [] },
  PowerUnit_AB_Main: { title: "Main Solar Connection Repair", location: "Mars Terrain — Main Solar Connection", screens: [] },
  Commuication_fix_Trigger: { title: "External Communication Repair", location: "Mars Terrain — Communication Repair Point", screens: [] }
};
