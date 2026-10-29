/**
 * PHOBOSIA — Day 1 Outpost Orientation Configuration
 *
 * Source: src/jsons/plans/day01/day1_implementation.json
 * Authoritative constants, zone definitions, task definitions,
 * trigger mappings, and camera presentation parameters for Day 1.
 */

export type Day1ZoneId =
  | "HABITAT"
  | "CENTRAL_HUB"
  | "ENGINEERING_UNIT"
  | "RESEARCH_LAB"
  | "MISSION_CONTROL"
  | "AIRLOCK";

export type Day1TaskId =
  | "D1_HAB_LIFE_SUPPORT"
  | "D1_HAB_WATER_NUTRITION"
  | "D1_HAB_WORKSTATION"
  | "D1_HAB_REST_INTRODUCTION"
  | "D1_ENG_MONITORING"
  | "D1_ENG_POWER"
  | "D1_ENG_LIFE_SUPPORT"
  | "D1_ENG_DIAGNOSTICS"
  | "D1_ENG_STORAGE"
  | "D1_LAB_RESEARCH_MONITORING"
  | "D1_LAB_RESEARCH_ANALYSIS"
  | "D1_LAB_SEED_INVENTORY"
  | "D1_LAB_WATER_NUTRITION"
  | "D1_LAB_WATER_QUALITY"
  | "D1_LAB_CULTIVATION"
  | "D1_MC_MAIN"
  | "D1_MC_SYSTEMS"
  | "D1_MC_NAVIGATION"
  | "D1_AIRLOCK_CONTROL";

export interface Day1TaskDefinition {
  taskId: Day1TaskId;
  title: string;
  description: string;
  zoneId: Day1ZoneId;
  interactionGroupId: string;
  required: boolean;
  completionEvent: "DAY1_TASK_COMPLETED";
  dayTransitionOnTaskCompletion?: boolean;
}

export interface Day1InteractionGroupDefinition {
  id: string;
  friendlyName: string;
  description: string;
  triggerObjectName: string | null;
  screenObjectNames: string[];
  cameraPresentationId: string;
  cameraFraming?: string;
  cameraDurationSeconds: number;
  interactionMode: string;
  taskId?: Day1TaskId;
  required: boolean;
}

export interface Day1ZoneDefinition {
  zoneId: Day1ZoneId;
  friendlyName: string;
  description: string;
  moduleName: "Habitat" | "Hub" | "Engineering" | "Science" | "MissionControl" | "Airlock";
  introduction: {
    id: string;
    title: string;
    description: string;
    cameraPresentationId: string;
    durationSeconds: number;
    skipKey: string;
  };
  interactionGroups: Day1InteractionGroupDefinition[];
}

export const DAY1_TASKS: Day1TaskDefinition[] = [
  {
    taskId: "D1_HAB_LIFE_SUPPORT",
    title: "Inspect Habitat Status",
    description: "Identify the Habitat life-support, general status, and emergency-status displays.",
    zoneId: "HABITAT",
    interactionGroupId: "HAB_LIFE_SUPPORT_GROUP",
    required: true,
    completionEvent: "DAY1_TASK_COMPLETED"
  },
  {
    taskId: "D1_HAB_WATER_NUTRITION",
    title: "Review Water and Nutrition",
    description: "Inspect the Habitat water and nutrition display.",
    zoneId: "HABITAT",
    interactionGroupId: "HAB_WATER_NUTRITION_GROUP",
    required: true,
    completionEvent: "DAY1_TASK_COMPLETED"
  },
  {
    taskId: "D1_HAB_WORKSTATION",
    title: "Use the Habitat Workstation",
    description: "Open or use the existing Habitat workstation interface.",
    zoneId: "HABITAT",
    interactionGroupId: "HAB_WORKSTATION_GROUP",
    required: true,
    completionEvent: "DAY1_TASK_COMPLETED"
  },
  {
    taskId: "D1_HAB_REST_INTRODUCTION",
    title: "Locate the Crew Rest Area",
    description: "Identify the rest area and learn how resting advances the mission day.",
    zoneId: "HABITAT",
    interactionGroupId: "HAB_REST_GROUP",
    required: true,
    completionEvent: "DAY1_TASK_COMPLETED",
    dayTransitionOnTaskCompletion: false
  },
  {
    taskId: "D1_ENG_MONITORING",
    title: "Inspect Engineering Monitoring",
    description: "Review the Engineering Unit's monitoring displays as one group.",
    zoneId: "ENGINEERING_UNIT",
    interactionGroupId: "ENG_MONITORING_GROUP",
    required: true,
    completionEvent: "DAY1_TASK_COMPLETED"
  },
  {
    taskId: "D1_ENG_POWER",
    title: "Inspect Power Systems",
    description: "Review the Engineering Unit's power-system displays as one group.",
    zoneId: "ENGINEERING_UNIT",
    interactionGroupId: "ENG_POWER_GROUP",
    required: true,
    completionEvent: "DAY1_TASK_COMPLETED"
  },
  {
    taskId: "D1_ENG_LIFE_SUPPORT",
    title: "Inspect Engineering Life Support",
    description: "Review the Engineering Unit's life-support displays as one group.",
    zoneId: "ENGINEERING_UNIT",
    interactionGroupId: "ENG_LIFE_SUPPORT_GROUP",
    required: true,
    completionEvent: "DAY1_TASK_COMPLETED"
  },
  {
    taskId: "D1_ENG_DIAGNOSTICS",
    title: "Inspect Diagnostics",
    description: "Review the diagnostics workbench display.",
    zoneId: "ENGINEERING_UNIT",
    interactionGroupId: "ENG_DIAGNOSTICS_GROUP",
    required: true,
    completionEvent: "DAY1_TASK_COMPLETED"
  },
  {
    taskId: "D1_ENG_STORAGE",
    title: "Inspect Engineering Storage",
    description: "Review the Engineering Unit storage-information display.",
    zoneId: "ENGINEERING_UNIT",
    interactionGroupId: "ENG_STORAGE_GROUP",
    required: true,
    completionEvent: "DAY1_TASK_COMPLETED"
  },
  {
    taskId: "D1_LAB_RESEARCH_MONITORING",
    title: "Inspect Research Monitoring",
    description: "Review the laboratory research-monitoring display.",
    zoneId: "RESEARCH_LAB",
    interactionGroupId: "LAB_RESEARCH_MONITORING_GROUP",
    required: true,
    completionEvent: "DAY1_TASK_COMPLETED"
  },
  {
    taskId: "D1_LAB_RESEARCH_ANALYSIS",
    title: "Inspect Research Analysis",
    description: "Review the laboratory research-analysis display.",
    zoneId: "RESEARCH_LAB",
    interactionGroupId: "LAB_RESEARCH_ANALYSIS_GROUP",
    required: true,
    completionEvent: "DAY1_TASK_COMPLETED"
  },
  {
    taskId: "D1_LAB_SEED_INVENTORY",
    title: "Review Seed Inventory",
    description: "Inspect the seed-storage inventory display.",
    zoneId: "RESEARCH_LAB",
    interactionGroupId: "LAB_SEED_INVENTORY_GROUP",
    required: true,
    completionEvent: "DAY1_TASK_COMPLETED"
  },
  {
    taskId: "D1_LAB_WATER_NUTRITION",
    title: "Review Water and Nutrient Preparation",
    description: "Inspect the water and nutrient preparation display.",
    zoneId: "RESEARCH_LAB",
    interactionGroupId: "LAB_WATER_NUTRITION_MIXING_GROUP",
    required: true,
    completionEvent: "DAY1_TASK_COMPLETED"
  },
  {
    taskId: "D1_LAB_WATER_QUALITY",
    title: "Inspect Water Quality",
    description: "Review the laboratory water-quality display.",
    zoneId: "RESEARCH_LAB",
    interactionGroupId: "LAB_WATER_QUALITY_GROUP",
    required: true,
    completionEvent: "DAY1_TASK_COMPLETED"
  },
  {
    taskId: "D1_LAB_CULTIVATION",
    title: "Inspect Cultivation Environment",
    description: "Review the cultivation-environment display.",
    zoneId: "RESEARCH_LAB",
    interactionGroupId: "LAB_CULTIVATION_GROUP",
    required: true,
    completionEvent: "DAY1_TASK_COMPLETED"
  },
  {
    taskId: "D1_MC_MAIN",
    title: "Review Mission Objectives",
    description: "Inspect the Mission Control main display group.",
    zoneId: "MISSION_CONTROL",
    interactionGroupId: "MC_MAIN_GROUP",
    required: true,
    completionEvent: "DAY1_TASK_COMPLETED"
  },
  {
    taskId: "D1_MC_SYSTEMS",
    title: "Review Communications and Systems",
    description: "Inspect the Mission Control communications and systems group.",
    zoneId: "MISSION_CONTROL",
    interactionGroupId: "MC_SYSTEMS_GROUP",
    required: true,
    completionEvent: "DAY1_TASK_COMPLETED"
  },
  {
    taskId: "D1_MC_NAVIGATION",
    title: "Review Terrain and Reconnaissance Systems",
    description: "Inspect the terrain, observation-site, and drone-operation display group.",
    zoneId: "MISSION_CONTROL",
    interactionGroupId: "MC_NAVIGATION_GROUP",
    required: true,
    completionEvent: "DAY1_TASK_COMPLETED"
  },
  {
    taskId: "D1_AIRLOCK_CONTROL",
    title: "Inspect Airlock Controls",
    description: "Identify the Airlock Control Console and understand its general purpose.",
    zoneId: "AIRLOCK",
    interactionGroupId: "AIRLOCK_CONTROL_GROUP",
    required: true,
    completionEvent: "DAY1_TASK_COMPLETED"
  }
];

export const DAY1_ZONES: Day1ZoneDefinition[] = [
  {
    zoneId: "HABITAT",
    friendlyName: "Habitat",
    description: "The crew's living and personal space on Mars. It supports rest, daily living, life-support awareness, and access to personal workstation functions.",
    moduleName: "Habitat",
    introduction: {
      id: "INTRO_HABITAT",
      title: "Welcome to the Habitat",
      description: "This is the crew's living area. It provides a place to rest, monitor essential living conditions, review water and nutrition information, and use a personal workstation.",
      cameraPresentationId: "CAM_HABITAT_OVERVIEW",
      durationSeconds: 5,
      skipKey: "Enter"
    },
    interactionGroups: [
      {
        id: "HAB_LIFE_SUPPORT_GROUP",
        friendlyName: "Habitat Status and Life Support",
        description: "Review the Habitat's essential living conditions, general operating status, and emergency status.",
        triggerObjectName: "HAB_MONITOR_01",
        screenObjectNames: [
          "Habitat_LifeSupport_Display",
          "Habitat_Main_Status_Display",
          "Habitat_Emergency_Status_Display"
        ],
        cameraPresentationId: "CAM_HAB_LIFE_SUPPORT_WIDE",
        cameraFraming: "One wide horizontal view that includes all three displays.",
        cameraDurationSeconds: 4,
        interactionMode: "InspectGroup",
        taskId: "D1_HAB_LIFE_SUPPORT",
        required: true
      },
      {
        id: "HAB_WATER_NUTRITION_GROUP",
        friendlyName: "Water and Nutrition Display",
        description: "Review information associated with water availability and nutrition support in the Habitat.",
        triggerObjectName: "HAB_WATER_NUTRITION_01",
        screenObjectNames: ["Habitat_WaterNutrition_Display"],
        cameraPresentationId: "CAM_HAB_WATER_NUTRITION",
        cameraFraming: "A short horizontal presentation of the existing display.",
        cameraDurationSeconds: 3,
        interactionMode: "InspectScreen",
        taskId: "D1_HAB_WATER_NUTRITION",
        required: true
      },
      {
        id: "HAB_WORKSTATION_GROUP",
        friendlyName: "Habitat Workstation",
        description: "Introduce the personal workstation and its existing in-game computer interface.",
        triggerObjectName: "HAB_WORKSTATION_01",
        screenObjectNames: ["Habitat_Workstation_Display"],
        cameraPresentationId: "CAM_HAB_WORKSTATION",
        cameraFraming: "A short horizontal view of the existing workstation.",
        cameraDurationSeconds: 3,
        interactionMode: "UseExistingWorkstation",
        taskId: "D1_HAB_WORKSTATION",
        required: true
      },
      {
        id: "HAB_REST_GROUP",
        friendlyName: "Crew Rest Area",
        description: "The crew's designated rest area. Resting ends the current mission day after all required tasks are complete.",
        triggerObjectName: "HAB_REST_01",
        screenObjectNames: [],
        cameraPresentationId: "CAM_HAB_REST_AREA",
        cameraFraming: "Optional short horizontal introduction to the existing bed area.",
        cameraDurationSeconds: 3,
        interactionMode: "Rest",
        taskId: "D1_HAB_REST_INTRODUCTION",
        required: true
      }
    ]
  },
  {
    zoneId: "CENTRAL_HUB",
    friendlyName: "Central Hub",
    description: "The main internal connection area linking the outpost's major modules and helping the crew understand the layout of the facility.",
    moduleName: "Hub",
    introduction: {
      id: "INTRO_CENTRAL_HUB",
      title: "Central Hub",
      description: "This central connection area links the Habitat, Engineering Unit, Research Laboratory, and Mission Control through the existing internal passages.",
      cameraPresentationId: "CAM_CENTRAL_HUB_OVERVIEW",
      durationSeconds: 5,
      skipKey: "Enter"
    },
    interactionGroups: [
      {
        id: "HUB_ENVIRONMENT_STATUS",
        friendlyName: "Environment Status Display",
        description: "Review the environmental status information available in the Central Hub.",
        triggerObjectName: "Env_Status_Display",
        screenObjectNames: ["Env_Status_Display"],
        cameraPresentationId: "CAM_HUB_ENVIRONMENT_STATUS",
        cameraFraming: "A short horizontal presentation of the existing display.",
        cameraDurationSeconds: 3,
        interactionMode: "InspectScreen",
        required: false
      },
      {
        id: "HUB_INTERNAL_COMMUNICATIONS",
        friendlyName: "Internal Communications Display",
        description: "Introduce the existing internal communications display and its role in outpost coordination.",
        triggerObjectName: "Internal_Communication_Display",
        screenObjectNames: ["Internal_Communication_Display"],
        cameraPresentationId: "CAM_HUB_INTERNAL_COMMUNICATIONS",
        cameraFraming: "A horizontal view that accommodates the tall display.",
        cameraDurationSeconds: 3,
        interactionMode: "InspectScreen",
        required: false
      },
      {
        id: "HUB_MODULE_STATUS",
        friendlyName: "Outpost Module Status Display",
        description: "Review the available status information associated with the outpost modules.",
        triggerObjectName: "Module_Status_Display",
        screenObjectNames: ["Module_Status_Display"],
        cameraPresentationId: "CAM_HUB_MODULE_STATUS",
        cameraFraming: "A short horizontal presentation of the existing display.",
        cameraDurationSeconds: 3,
        interactionMode: "InspectScreen",
        required: false
      }
    ]
  },
  {
    zoneId: "ENGINEERING_UNIT",
    friendlyName: "Engineering Unit",
    description: "The outpost's engineering area for understanding monitoring systems, power systems, life-support equipment, diagnostics, and storage information.",
    moduleName: "Engineering",
    introduction: {
      id: "INTRO_ENGINEERING_UNIT",
      title: "Engineering Unit",
      description: "The Engineering Unit supports the technical systems that keep the outpost operating. Its sections provide monitoring, power, life-support, diagnostic, and storage information.",
      cameraPresentationId: "CAM_ENGINEERING_OVERVIEW",
      durationSeconds: 5,
      skipKey: "Enter"
    },
    interactionGroups: [
      {
        id: "ENG_MONITORING_GROUP",
        friendlyName: "Engineering Monitoring Section",
        description: "Review the monitoring displays used to understand the status and operation of engineering systems.",
        triggerObjectName: "Engineering_Monitoring_Trigger",
        screenObjectNames: [
          "MonitoringSection_Indicator_Screen",
          "MonitoringSection_Operational_Screen",
          "MonitoringSection_Screen"
        ],
        cameraPresentationId: "CAM_ENGINEERING_MONITORING_WIDE",
        cameraFraming: "One wide horizontal view covering the monitoring section.",
        cameraDurationSeconds: 4,
        interactionMode: "InspectGroup",
        taskId: "D1_ENG_MONITORING",
        required: true
      },
      {
        id: "ENG_POWER_GROUP",
        friendlyName: "Power Systems Section",
        description: "Review the power-system displays used to monitor power generation and storage.",
        triggerObjectName: "Engineering_PowerUnit_Trigger",
        screenObjectNames: [
          "PowerUnitScreenMain",
          "PowerUnitScreenMain02",
          "PowerUnitScreen000",
          "PowerUnitScreen000.001"
        ],
        cameraPresentationId: "CAM_ENGINEERING_POWER_WIDE",
        cameraFraming: "One wide horizontal view covering the power unit section.",
        cameraDurationSeconds: 4,
        interactionMode: "InspectGroup",
        taskId: "D1_ENG_POWER",
        required: true
      },
      {
        id: "ENG_LIFE_SUPPORT_GROUP",
        friendlyName: "Engineering Life Support Section",
        description: "Review the life-support displays associated with environmental regulation in the Engineering Unit.",
        triggerObjectName: "Engineering_LifeSupport_Trigger",
        screenObjectNames: [
          "LifeSupportUnitScreenMain04",
          "LifeSupportUnitScreenMain02.001",
          "LifeSupportUnitScreenMain03"
        ],
        cameraPresentationId: "CAM_ENGINEERING_LIFE_SUPPORT_WIDE",
        cameraFraming: "One wide horizontal view covering the life-support section.",
        cameraDurationSeconds: 4,
        interactionMode: "InspectGroup",
        taskId: "D1_ENG_LIFE_SUPPORT",
        required: true
      },
      {
        id: "ENG_DIAGNOSTICS_GROUP",
        friendlyName: "Diagnostics Workbench",
        description: "Review the diagnostics workbench display.",
        triggerObjectName: "Engineering_Diagnostics_Trigger",
        screenObjectNames: ["DiagnosticsWorkbenchScreen_01"],
        cameraPresentationId: "CAM_ENGINEERING_DIAGNOSTICS",
        cameraFraming: "A short horizontal presentation of the diagnostics display.",
        cameraDurationSeconds: 3,
        interactionMode: "InspectScreen",
        taskId: "D1_ENG_DIAGNOSTICS",
        required: true
      },
      {
        id: "ENG_STORAGE_GROUP",
        friendlyName: "Engineering Storage Information",
        description: "Review the storage-information display in the Engineering Unit.",
        triggerObjectName: "Engineering_InfoDisplay_Trigger",
        screenObjectNames: ["Storage_Screen"],
        cameraPresentationId: "CAM_ENGINEERING_STORAGE",
        cameraFraming: "A short horizontal presentation of the storage display.",
        cameraDurationSeconds: 3,
        interactionMode: "InspectScreen",
        taskId: "D1_ENG_STORAGE",
        required: true
      }
    ]
  },
  {
    zoneId: "RESEARCH_LAB",
    friendlyName: "Research Laboratory",
    description: "The scientific heart of the outpost, supporting research monitoring, analysis, seed preservation, and plant cultivation.",
    moduleName: "Science",
    introduction: {
      id: "INTRO_RESEARCH_LAB",
      title: "Research Laboratory",
      description: "The Research Laboratory is dedicated to sample analysis, agricultural research, seed inventory, water quality testing, and cultivation experiments.",
      cameraPresentationId: "CAM_RESEARCH_LAB_OVERVIEW",
      durationSeconds: 5,
      skipKey: "Enter"
    },
    interactionGroups: [
      {
        id: "LAB_RESEARCH_MONITORING_GROUP",
        friendlyName: "Research Monitoring Display",
        description: "Review the display used to track active laboratory experiments and observation schedules.",
        triggerObjectName: "LAB_RESEARCH_MONITORING_01",
        screenObjectNames: ["ResearchMonitoring_MainScreen"],
        cameraPresentationId: "CAM_LAB_RESEARCH_MONITORING",
        cameraFraming: "A short horizontal presentation of the display.",
        cameraDurationSeconds: 3,
        interactionMode: "InspectScreen",
        taskId: "D1_LAB_RESEARCH_MONITORING",
        required: true
      },
      {
        id: "LAB_RESEARCH_ANALYSIS_GROUP",
        friendlyName: "Research Analysis Display",
        description: "Review the display used to analyze experimental data and scientific measurements.",
        triggerObjectName: "LAB_RESEARCH_ANALYSIS_01",
        screenObjectNames: ["ResearchMonitoring_SystemScreen"],
        cameraPresentationId: "CAM_LAB_RESEARCH_ANALYSIS",
        cameraFraming: "A short horizontal presentation of the display.",
        cameraDurationSeconds: 3,
        interactionMode: "InspectScreen",
        taskId: "D1_LAB_RESEARCH_ANALYSIS",
        required: true
      },
      {
        id: "LAB_SEED_INVENTORY_GROUP",
        friendlyName: "Seed Storage Inventory",
        description: "Review the seed inventory display to understand crop stores and preservation conditions.",
        triggerObjectName: "LAB_SEED_STORAGE_01",
        screenObjectNames: ["SeedStorage_InventoryScreen"],
        cameraPresentationId: "CAM_LAB_SEED_INVENTORY",
        cameraFraming: "A short horizontal presentation of the seed-inventory display.",
        cameraDurationSeconds: 3,
        interactionMode: "InspectScreen",
        taskId: "D1_LAB_SEED_INVENTORY",
        required: true
      },
      {
        id: "LAB_WATER_NUTRITION_MIXING_GROUP",
        friendlyName: "Water & Nutrient Preparation",
        description: "Review the preparation display used for mixing nutrients and preparing water for cultivation.",
        triggerObjectName: "LAB_WATER_NUTRITION_01",
        screenObjectNames: ["WaterNutrition_MixingScreen"],
        cameraPresentationId: "CAM_LAB_WATER_NUTRITION",
        cameraFraming: "A short horizontal presentation of the display.",
        cameraDurationSeconds: 3,
        interactionMode: "InspectScreen",
        taskId: "D1_LAB_WATER_NUTRITION",
        required: true
      },
      {
        id: "LAB_WATER_QUALITY_GROUP",
        friendlyName: "Water Quality & Service",
        description: "Review the water-quality display used to evaluate water safety and filtration status.",
        triggerObjectName: "LAB_WATER_SERVICE_01",
        screenObjectNames: ["WaterNutrition_QualityScreen"],
        cameraPresentationId: "CAM_LAB_WATER_QUALITY",
        cameraFraming: "A short horizontal presentation of the display.",
        cameraDurationSeconds: 3,
        interactionMode: "InspectScreen",
        taskId: "D1_LAB_WATER_QUALITY",
        required: true
      },
      {
        id: "LAB_CULTIVATION_GROUP",
        friendlyName: "Cultivation Environment Display",
        description: "Review the cultivation display used to monitor plant-growth bays and environmental parameters.",
        triggerObjectName: "LAB_CULTIVATION_01",
        screenObjectNames: ["Cultivation_EnvironmentScreen"],
        cameraPresentationId: "CAM_LAB_CULTIVATION",
        cameraFraming: "A short horizontal presentation of the display.",
        cameraDurationSeconds: 3,
        interactionMode: "InspectScreen",
        taskId: "D1_LAB_CULTIVATION",
        required: true
      }
    ]
  },
  {
    zoneId: "MISSION_CONTROL",
    friendlyName: "Mission Control",
    description: "The operational center for mission objectives, outpost status, communications, and remote reconnaissance.",
    moduleName: "MissionControl",
    introduction: {
      id: "INTRO_MISSION_CONTROL",
      title: "Mission Control",
      description: "Mission Control is the communications and expedition command center. It coordinates daily mission objectives, orbital tracking, exterior navigation, and remote telemetry.",
      cameraPresentationId: "CAM_MISSION_CONTROL_OVERVIEW",
      durationSeconds: 5,
      skipKey: "Enter"
    },
    interactionGroups: [
      {
        id: "MC_MAIN_GROUP",
        friendlyName: "Mission Objectives Overview",
        description: "Review the main Mission Control display group covering mission objectives and outpost status.",
        triggerObjectName: "MC_MAIN_01",
        screenObjectNames: [
          "MissionControl_ObjectivesScreen",
          "MissionControl_OutpostStatusScreen",
          "MissionControl_OverviewScreen"
        ],
        cameraPresentationId: "CAM_MISSION_CONTROL_MAIN_WIDE",
        cameraFraming: "One wide horizontal view covering the main Mission Control console.",
        cameraDurationSeconds: 4,
        interactionMode: "InspectGroup",
        taskId: "D1_MC_MAIN",
        required: true
      },
      {
        id: "MC_SYSTEMS_GROUP",
        friendlyName: "Communications & Systems",
        description: "Review the communications and systems display group in Mission Control.",
        triggerObjectName: "MC_SYSTEMS_01",
        screenObjectNames: [
          "MissionControl_CommunicationsScreen",
          "MissionControl_SystemsScreen"
        ],
        cameraPresentationId: "CAM_MISSION_CONTROL_SYSTEMS_WIDE",
        cameraFraming: "One wide horizontal view covering the communications and systems displays.",
        cameraDurationSeconds: 4,
        interactionMode: "InspectGroup",
        taskId: "D1_MC_SYSTEMS",
        required: true
      },
      {
        id: "MC_NAVIGATION_GROUP",
        friendlyName: "Terrain & Reconnaissance Systems",
        description: "Review the terrain, observation-site, and drone-operation display group in Mission Control.",
        triggerObjectName: "MC_NAVIGATION_01",
        screenObjectNames: [
          "MissionControl_DroneOperationScreen",
          "MissionControl_ObservationSitesScreen",
          "MissionControl_TerrainMapScreen"
        ],
        cameraPresentationId: "CAM_MISSION_CONTROL_NAVIGATION_WIDE",
        cameraFraming: "One wide horizontal view covering the navigation, observation-site, and drone displays.",
        cameraDurationSeconds: 4,
        interactionMode: "InspectGroup",
        taskId: "D1_MC_NAVIGATION",
        required: true
      }
    ]
  },
  {
    zoneId: "AIRLOCK",
    friendlyName: "Airlock",
    description: "The transition area between the pressurized outpost interior and the Martian surface.",
    moduleName: "Airlock",
    introduction: {
      id: "INTRO_AIRLOCK",
      title: "Airlock",
      description: "The Airlock serves as the primary environmental pressure barrier between the interior habitat and the Martian surface. The control console operates pressure equalization and exterior egress protocols.",
      cameraPresentationId: "CAM_AIRLOCK_OVERVIEW",
      durationSeconds: 5,
      skipKey: "Enter"
    },
    interactionGroups: [
      {
        id: "AIRLOCK_CONTROL_GROUP",
        friendlyName: "Airlock Control Console",
        description: "Identify the Airlock Control Console and understand its role in surface egress and repressurization.",
        triggerObjectName: "Airlock_Control_Console_Trigger",
        screenObjectNames: ["Airlock_Control_Console"],
        cameraPresentationId: "CAM_AIRLOCK_CONTROL",
        cameraFraming: "A short horizontal presentation of the existing control console.",
        cameraDurationSeconds: 3,
        interactionMode: "InspectScreen",
        taskId: "D1_AIRLOCK_CONTROL",
        required: true
      }
    ]
  }
];

// Quick index lookups
export const TRIGGER_TO_TASK_MAP: Record<string, Day1TaskId> = {};
export const TRIGGER_TO_GROUP_MAP: Record<string, Day1InteractionGroupDefinition> = {};
export const MODULE_TO_ZONE_MAP: Record<string, Day1ZoneId> = {
  Habitat: "HABITAT",
  Hub: "CENTRAL_HUB",
  Engineering: "ENGINEERING_UNIT",
  Science: "RESEARCH_LAB",
  MissionControl: "MISSION_CONTROL",
  Airlock: "AIRLOCK"
};

/** Per-entrance travel key. Omitted entries continue to use the game's E key. */
export const ENTRANCE_INTERACTION_KEYS: Record<string, "E" | "Q"> = {};

export const ZONE_TO_INTRO_MAP: Record<Day1ZoneId, Day1ZoneDefinition["introduction"]> = {} as any;

for (const zone of DAY1_ZONES) {
  ZONE_TO_INTRO_MAP[zone.zoneId] = zone.introduction;
  for (const group of zone.interactionGroups) {
    if (group.triggerObjectName) {
      if (group.taskId) TRIGGER_TO_TASK_MAP[group.triggerObjectName] = group.taskId;
      TRIGGER_TO_GROUP_MAP[group.triggerObjectName] = group;
    }
    // Also index individual screen names for mesh direct hits
    for (const screenName of group.screenObjectNames) {
      if (group.taskId && !TRIGGER_TO_TASK_MAP[screenName]) {
        TRIGGER_TO_TASK_MAP[screenName] = group.taskId;
      }
      if (!TRIGGER_TO_GROUP_MAP[screenName]) {
        TRIGGER_TO_GROUP_MAP[screenName] = group;
      }
    }
  }
}
