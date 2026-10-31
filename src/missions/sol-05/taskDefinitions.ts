import type { MissionStep } from "../../core/MissionManager";

/** Sol 5 uses the existing mission progression state; only this day's task set is defined here. */
export const SOL5_TASKS: Omit<MissionStep, "completed">[] = [
  { stepId: "SOL05_PREFLIGHT_BRIEFING", label: "Complete Drone Flight Operations Briefing", description: "Review the official Sol 3 target, Sol 4 findings, flight limits, takeoff and landing procedure, and image requirement at Mission Control.", targetTrigger: "MC_NAVIGATION_01" },
  { stepId: "SOL05_ACTIVATE_SIMULATION", label: "Activate Drone Reconnaissance Simulation", description: "Launch the target-dependent drone simulation from the Mission Control Navigation interface.", targetTrigger: "MC_NAVIGATION_01", requiresCompletedTasks: ["SOL05_PREFLIGHT_BRIEFING"] },
  { stepId: "SOL05_AERIAL_RECONNAISSANCE", label: "Conduct Aerial Route Reconnaissance", description: "Operate the existing drone, document the selected target approach, and capture at least five valid camera images.", targetModule: "Terrain", requiresCompletedTasks: ["SOL05_ACTIVATE_SIMULATION"] },
  { stepId: "SOL05_SAFE_LANDING", label: "Return and Safely Land the Drone", description: "Return to Drone_TakeoffPoint and perform a validated low-speed landing after capturing at least five images.", targetModule: "Terrain", requiresCompletedTasks: ["SOL05_AERIAL_RECONNAISSANCE"] },
  { stepId: "SOL05_REVIEW_IMAGES", label: "Review Aerial Observation Records", description: "Review the saved flight images and their target-linked position, altitude, heading, time, and camera metadata.", targetTrigger: "MC_NAVIGATION_01", requiresCompletedTasks: ["SOL05_SAFE_LANDING"] },
  { stepId: "SOL05_SUBMIT_REPORT", label: "Submit Sol 5 Aerial Reconnaissance Report", description: "Submit a report that distinguishes captured evidence, player interpretation, uncertainty, and areas requiring Sol 6 ground verification.", targetTrigger: "MC_NAVIGATION_01", requiresCompletedTasks: ["SOL05_REVIEW_IMAGES"] }
];

export const SOL5_OPTIONAL_TASK = {
  id: "SOL05_OPTIONAL_DRONE_INSPECTION",
  label: "Inspect Drone Readiness",
  description: "Optionally inspect the existing drone through the established physical Drone Section interaction. This does not block flight preparation."
} as const;
