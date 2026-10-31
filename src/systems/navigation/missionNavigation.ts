import sol02Mission from "../../jsons/Missions/sol-02.json";
import sol03Mission from "../../jsons/Missions/sol-03.json";
import sol04Mission from "../../jsons/Missions/sol-04.json";
import sol02Navigation from "../../jsons/Instructions/sol-02-navigation.json";
import sol03Navigation from "../../jsons/Instructions/sol-03-navigation.json";
import sol04Navigation from "../../jsons/Instructions/sol-04-navigation.json";
import sol05Mission from "../../jsons/Missions/sol-05.json";
import sol05Navigation from "../../jsons/Instructions/sol-05-navigation.json";
import sol01Navigation from "../../jsons/Instructions/sol-01-navigation.json";
import { DAY1_TASKS } from "../../core/Day1Config";

type NavigationFile = typeof sol02Navigation | typeof sol03Navigation | typeof sol04Navigation | typeof sol05Navigation;
type NavigationTask = NavigationFile["instructions"][number];

const FILES: Partial<Record<number, { mission: typeof sol02Mission | typeof sol03Mission | typeof sol04Mission | typeof sol05Mission; navigation: NavigationFile }>> = {
  2: { mission: sol02Mission, navigation: sol02Navigation },
  3: { mission: sol03Mission, navigation: sol03Navigation },
  4: { mission: sol04Mission, navigation: sol04Navigation },
  5: { mission: sol05Mission, navigation: sol05Navigation }
};

// Runtime validator IDs that differ from the corresponding mission JSON task IDs.
// This adapter reports only a matching validated activity; it never synthesizes progress.
const RUNTIME_TASK_TO_MISSION_TASK: Record<number, Record<string, string>> = {
  2: {
    SOL02_HABITAT_STATUS: "SOL02_HABITAT_MAIN_STATUS",
    SOL02_POWER_REVIEW: "SOL02_POWER_INVESTIGATION"
  },
  3: {
    SOL03_SELECT_DATASET: "SOL03_DATASET_ANALYSIS",
    SOL03_SUBMIT_TARGET_RECORD: "SOL03_SUBMIT_TARGET_PROPOSAL"
  },
  // Sol 4 runtime task IDs already match the mission JSON. Keep them intact;
  // physical trigger resolution lives in TASK_TO_EXISTING_TRIGGER below.
};

// Private physical interaction resolver. These identifiers are never included in
// instruction JSON or rendered guidance; the existing game still owns interaction.
const TASK_TO_EXISTING_TRIGGER: Record<string, string> = {
  SOL02_HABITAT_MAIN_STATUS: "HAB_MONITOR_01",
  SOL02_HABITAT_LIFE_SUPPORT: "HAB_MONITOR_01",
  SOL02_HABITAT_EMERGENCY: "HAB_MONITOR_01",
  SOL02_WATER_NUTRITION: "HAB_WATER_NUTRITION_01",
  SOL02_ENGINEERING_MONITORING: "Engineering_Monitoring_Trigger",
  SOL02_POWER_INVESTIGATION: "Engineering_PowerUnit_Trigger",
  SOL02_ENGINEERING_LIFESUPPORT: "Engineering_LifeSupport_Trigger",
  SOL02_DIAGNOSTICS: "Engineering_Diagnostics_Trigger",
  SOL02_READINESS_ASSESSMENT: "Engineering_Monitoring_Trigger",
  SOL03_MISSION_CONTEXT: "MC_MAIN_01",
  SOL03_OBSERVATION_SITE_REVIEW: "MC_NAVIGATION_01",
  SOL03_SYSTEM_CONSTRAINTS: "MC_SYSTEMS_01",
  SOL03_SELECT_TARGET: "MC_NAVIGATION_01",
  SOL03_DATASET_ANALYSIS: "LAB_RESEARCH_ANALYSIS_01",
  SOL03_SUBMIT_TARGET_PROPOSAL: "MC_MAIN_01",
  SOL04_MISSION_CONTEXT: "MC_MAIN_01",
  SOL04_SELECTED_TARGET_INVESTIGATION: "MC_NAVIGATION_01",
  SOL04_TERRAIN_DATA_REVIEW: "LAB_RESEARCH_ANALYSIS_01",
  SOL04_DRONE_MISSION_PLAN: "MC_NAVIGATION_01",
  SOL04_SUBMIT_PREPARATION_REPORT: "MC_MAIN_01",
  SOL05_PREFLIGHT_BRIEFING: "MC_NAVIGATION_01",
  SOL05_ACTIVATE_SIMULATION: "MC_NAVIGATION_01",
  SOL05_REVIEW_IMAGES: "MC_NAVIGATION_01",
  SOL05_SUBMIT_REPORT: "MC_NAVIGATION_01"
};

export interface ResolvedMissionNavigation {
  taskId?: string;
  title: string;
  notification: string;
  message?: string;
  destinationName?: string;
  destinationModule?: string;
  destinationSection?: string;
  guidance?: string;
  activity?: string;
  isCompletion: boolean;
  hasInstruction: boolean;
}

export function normalizeValidatedTaskIds(sol: number, runtimeTaskIds: readonly string[]): string[] {
  const aliases = RUNTIME_TASK_TO_MISSION_TASK[sol] ?? {};
  return [...new Set(runtimeTaskIds.map(id => aliases[id] ?? id))];
}

export function resolveNextMissionNavigation(sol: number, validatedRuntimeTaskIds: readonly string[]): ResolvedMissionNavigation | null {
  if (sol === 1) {
    const completed = new Set(validatedRuntimeTaskIds);
    const nextTask = DAY1_TASKS.find(task => task.required && !completed.has(task.taskId));
    if (!nextTask) {
      return {
        title: sol01Navigation.completion.title,
        notification: sol01Navigation.completion.message,
        isCompletion: true,
        hasInstruction: true
      };
    }
    const instruction = sol01Navigation.instructions.find(item => item.taskId === nextTask.taskId);
    if (!instruction) return null;
    return {
      taskId: instruction.taskId,
      title: instruction.title,
      notification: `${instruction.title} · ${instruction.destination.name}. ${instruction.message} ${instruction.guidance} ${instruction.activity}`,
      message: instruction.message,
      destinationName: instruction.destination.name,
      destinationModule: instruction.destination.module,
      destinationSection: instruction.destination.section,
      guidance: instruction.guidance,
      activity: instruction.activity,
      isCompletion: false,
      hasInstruction: true
    };
  }

  const source = FILES[sol];
  if (!source) return null;

  const completed = new Set(normalizeValidatedTaskIds(sol, validatedRuntimeTaskIds));
  const requiredIds = new Set(source.mission.missionCompletion.requiredTasks);
  const tasks = source.mission.tasks.filter(task => task.mandatory && requiredIds.has(task.taskId));
  const available = tasks.find(task =>
    !completed.has(task.taskId) &&
    (task.requiresCompletedTasks ?? []).every(required => completed.has(required))
  );

  if (!available) {
    const allComplete = tasks.length > 0 && tasks.every(task => completed.has(task.taskId));
    if (!allComplete) return null;
    return {
      title: source.navigation.completion.title,
      notification: source.navigation.completion.message,
      isCompletion: true,
      hasInstruction: true
    };
  }

  const instruction: NavigationTask | undefined = source.navigation.instructions.find(item => item.taskId === available.taskId);
  if (!instruction) {
    const location = source.mission.interfaces.find(item => item.interfaceId === available.interfaceId)?.location;
    return {
      taskId: available.taskId,
      title: available.title,
      notification: `Next activity: ${available.title}${location ? ` — ${location}` : ""}. Open the assigned interface and complete the required activity.`,
      message: `Proceed to ${location ?? "the assigned module"} and continue the required activity.`,
      destinationName: location,
      destinationModule: location,
      activity: available.objective,
      guidance: available.objective,
      isCompletion: false,
      hasInstruction: false
    };
  }

  // Resolve once internally to validate that guidance has a known existing interaction.
  // Do not expose or use this ID to open the interface remotely.
  const resolvedTrigger = TASK_TO_EXISTING_TRIGGER[instruction.taskId];
  const destinationIsMapped = Boolean(resolvedTrigger && source.mission.interfaces.some(item => item.triggerId === resolvedTrigger));
  if (!destinationIsMapped) {
    return {
      taskId: instruction.taskId,
      title: instruction.title,
      notification: `${instruction.title} — ${instruction.destination.module}. ${instruction.message} ${instruction.guidance}`,
      message: instruction.message,
      destinationName: instruction.destination.name,
      destinationModule: instruction.destination.module,
      destinationSection: instruction.destination.section,
      guidance: instruction.guidance,
      activity: instruction.activity,
      isCompletion: false,
      hasInstruction: true
    };
  }

  return {
    taskId: instruction.taskId,
    title: instruction.title,
    notification: `${instruction.title} · ${instruction.destination.name}. ${instruction.message} ${instruction.activity}`,
    message: instruction.message,
    destinationName: instruction.destination.name,
    destinationModule: instruction.destination.module,
    destinationSection: instruction.destination.section,
    guidance: instruction.guidance,
    activity: instruction.activity,
    isCompletion: false,
    hasInstruction: true
  };
}
