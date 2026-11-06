export const SOL09_TASKS = [
  { stepId: "SOL09_TASK_01", label: "Inspect Habitat Water and Nutrient Reserves", trigger: "HAB_WATER_NUTRITION_01" },
  { stepId: "SOL09_TASK_02", label: "Review the Sol 6 Cultivation Experiment", trigger: "LAB_CULTIVATION_01" },
  { stepId: "SOL09_TASK_03", label: "Inspect Cultivation Rack 01", trigger: "LAB_CULTIVATION_01" },
  { stepId: "SOL09_TASK_04", label: "Inspect Cultivation Rack 02", trigger: "LAB_CULTIVATION_01" },
  { stepId: "SOL09_TASK_05", label: "Diagnose the Main Water Supply", trigger: "Engineering_LifeSupport_Trigger" },
  { stepId: "SOL09_TASK_06", label: "Assess Main Water Supply Restoration", trigger: "Engineering_LifeSupport_Trigger" },
  { stepId: "SOL09_TASK_07", label: "Verify Irrigation for Both Racks", trigger: "LAB_CULTIVATION_01" },
  { stepId: "SOL09_TASK_08", label: "Verify Nutrient Distribution", trigger: "LAB_CULTIVATION_01" },
  { stepId: "SOL09_TASK_09", label: "Review Cultivation and Water-System Evidence", trigger: "LAB_CULTIVATION_01" },
  { stepId: "SOL09_TASK_10", label: "Submit the Sol 9 Report", trigger: "MC_MAIN_01" }
] as const;

export type Sol09TaskId = typeof SOL09_TASKS[number]["stepId"];
export type Sol09RackId = "rack01" | "rack02";
export type Sol09EvidenceRecord = {
  taskId: Sol09TaskId;
  triggerId: string;
  completedAt: string;
  finding: string;
  provenance: string;
};
export type Sol09Progress = {
  started: boolean;
  evidence: Partial<Record<Sol09TaskId, Sol09EvidenceRecord>>;
  racks: Record<Sol09RackId, {
    inspection: Sol09EvidenceRecord | null;
    irrigationResult: "not_tested" | "unavailable" | "verified";
    irrigationRecord: Sol09EvidenceRecord | null;
  }>;
  water: {
    diagnosis: Sol09EvidenceRecord | null;
    mainSupplyStatus: "unknown" | "operational" | "restored" | "unavailable";
    restoration: Sol09EvidenceRecord | null;
  };
  nutrientVerification: Sol09EvidenceRecord | null;
  report: { validated: true; submittedAt: string; sections: Record<string, string> } | null;
};

export const createInitialSol09Progress = (): Sol09Progress => ({
  started: false,
  evidence: {},
  racks: {
    rack01: { inspection: null, irrigationResult: "not_tested", irrigationRecord: null },
    rack02: { inspection: null, irrigationResult: "not_tested", irrigationRecord: null }
  },
  water: { diagnosis: null, mainSupplyStatus: "unknown", restoration: null },
  nutrientVerification: null,
  report: null
});
