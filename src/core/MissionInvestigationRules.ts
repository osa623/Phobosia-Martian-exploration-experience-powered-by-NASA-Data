export const SOL2_INVESTIGATION_RULES: Record<string, { systemId: string; logIds: string[]; procedureCount: number }> = {
  SOL02_HABITAT_STATUS: { systemId: "habitat_general_status", logIds: ["HAB-STATUS-MAIN", "HAB-LIFE-SUPPORT", "HAB-EMERGENCY"], procedureCount: 4 },
  SOL02_WATER_NUTRITION: { systemId: "habitat_water_nutrition", logIds: ["HAB-WATER-NUTRITION"], procedureCount: 3 },
  SOL02_ENGINEERING_MONITORING: { systemId: "engineering_monitoring", logIds: ["ENG-MON-INDICATORS", "ENG-MON-OPERATIONAL", "ENG-MON-NETWORK"], procedureCount: 3 },
  SOL02_POWER_REVIEW: { systemId: "engineering_power_unit", logIds: ["ENG-POWER-MAIN", "ENG-POWER-DIAGNOSTICS", "ENG-POWER-BUS", "ENG-POWER-BATTERY"], procedureCount: 5 },
  SOL02_ENGINEERING_LIFESUPPORT: { systemId: "engineering_life_support", logIds: ["ENG-LS-ENVIRONMENT", "ENG-LS-WATER", "ENG-LS-AIRFLOW"], procedureCount: 4 },
  SOL02_DIAGNOSTICS: { systemId: "engineering_diagnostics", logIds: ["ENG-DIAG-WORKBENCH"], procedureCount: 4 }
};
export const SOL3_DATASET_IDS = ["PHOBOSIA_TARGET_PROFILE_TRAINING"];
