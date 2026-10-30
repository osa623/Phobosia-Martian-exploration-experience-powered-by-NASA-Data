export const assetPaths={Habitat:"/assets/models/Habitat_Zone.glb",Airlock:"/assets/models/AirLock.glb",Hub:"/assets/models/Central_Connector.glb",Engineering:"/assets/models/Engineering.glb",Science:"/assets/models/Science_Zone.glb",MissionControl:"/assets/models/Mission_Control.glb",Terrain:"/assets/models/mars_Terrain.glb",Drone:"/assets/models/drone_Zone.glb"} as const;
export type ModuleName = keyof typeof assetPaths;
export const screenActions: Record<string, string> = {
  HAB_MONITOR_01: "Habitat Status and Life Support",
  HAB_WATER_NUTRITION_01: "Water & Nutrition Display",
  HAB_WORKSTATION_01: "Habitat Workstation",
  HAB_REST_01: "Crew Rest Area",
  Env_Status_Display: "Environment Status Display",
  Internal_Communication_Display: "Internal Communications Display",
  Module_Status_Display: "Module Status Display",
  Engineering_Monitoring_Trigger: "Engineering Monitoring Section",
  Engineering_PowerUnit_Trigger: "Power Systems Section",
  Engineering_LifeSupport_Trigger: "Engineering Life Support Section",
  Engineering_Diagnostics_Trigger: "Engineering Diagnostics Workbench",
  Engineering_InfoDisplay_Trigger: "Engineering Storage Information",
  LAB_RESEARCH_MONITORING_01: "Research Monitoring Display",
  LAB_RESEARCH_ANALYSIS_01: "Research Analysis Display",
  LAB_SEED_STORAGE_01: "Seed Storage Inventory",
  LAB_WATER_NUTRITION_01: "Water & Nutrient Preparation",
  LAB_WATER_SERVICE_01: "Water Quality & Service",
  LAB_CULTIVATION_01: "Cultivation Environment Display",
  MC_MAIN_01: "Mission Objectives Overview",
  MC_SYSTEMS_01: "Communications & Systems",
  MC_NAVIGATION_01: "Terrain & Reconnaissance Systems",
  Airlock_Control_Console_Trigger: "Airlock Control Console"
};
