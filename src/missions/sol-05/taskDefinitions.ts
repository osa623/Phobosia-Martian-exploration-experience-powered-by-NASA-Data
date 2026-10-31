import type { MissionStep } from "../../core/MissionManager";

/** Sol 5 uses the existing mission progression state; only this day's task set is defined here. */
export const SOL5_TASKS: Omit<MissionStep, "completed">[] = [
  { stepId: "SOL05_PREFLIGHT_BRIEFING", label: "Complete Drone Flight Operations Briefing", description: "Review the official Sol 3 target, Sol 4 findings, manual controls, guidance, and return-and-landing procedure at Mission Control.", targetTrigger: "MC_NAVIGATION_01" },
  { stepId: "SOL05_ACTIVATE_SIMULATION", label: "Activate Drone Reconnaissance Simulation", description: "Launch the target-dependent drone simulation from the Mission Control Navigation interface.", targetTrigger: "MC_NAVIGATION_01", requiresCompletedTasks: ["SOL05_PREFLIGHT_BRIEFING"] },
  { stepId: "SOL05_AERIAL_RECONNAISSANCE", label: "Inspect the Officially Selected Target", description: "Manually fly to the Sol 3 target and press E inside its validated inspection area to load its mission-provided evidence.", targetModule: "Terrain", requiresCompletedTasks: ["SOL05_ACTIVATE_SIMULATION"] },
  { stepId: "SOL05_SAFE_LANDING", label: "Return and Safely Land the Drone", description: "After target inspection, manually return to the launch pad and press E when landing checks pass, then press G to return to Mission Control Navigation.", targetModule: "Terrain", requiresCompletedTasks: ["SOL05_AERIAL_RECONNAISSANCE"] },
  { stepId: "SOL05_REVIEW_IMAGES", label: "Review Target-Specific Evidence", description: "Review the existing mission-provided images for the selected target through the authorized Mission Control Navigation interface.", targetTrigger: "MC_NAVIGATION_01", requiresCompletedTasks: ["SOL05_SAFE_LANDING"] },
  { stepId: "SOL05_SUBMIT_REPORT", label: "Submit Sol 5 Aerial Reconnaissance Report", description: "Report the validated flight, visible features in the selected target evidence, interpretation, uncertainties, and Sol 6 ground follow-up.", targetTrigger: "MC_NAVIGATION_01", requiresCompletedTasks: ["SOL05_REVIEW_IMAGES"] }
];

export const SOL5_OPTIONAL_TASK = {
  id: "SOL05_OPTIONAL_DRONE_INSPECTION",
  label: "Inspect Drone Readiness",
  description: "Optionally inspect the existing drone through the established physical Drone Section interaction. This does not block flight preparation."
} as const;
