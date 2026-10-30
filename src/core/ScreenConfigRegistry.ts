/**
 * Sol-specific physical-screen data. Keep the section JSON files independent;
 * this registry is only the routing table used by the existing renderers.
 */
export type ScreenConfigSection = "airlock" | "centralHub" | "engineering" | "habitat" | "missionControl" | "research";
export interface ScreenMissionSnapshot {
  currentDay?: number;
  currentSol?: number;
  objectiveState?: string;
  completedStepIds?: string[];
  observationRecords?: Array<{ day: number; type: string; summary?: string }>;
}

type ScreenConfigPair = { browser: () => any; node: () => any; path: string };
type SolScreenConfigs = Record<ScreenConfigSection, ScreenConfigPair>;

function loadNodeScreenConfig(path: string): unknown {
  const dynamicRequire = eval("require") as (modulePath: string) => unknown;
  try {
    return dynamicRequire(path);
  } catch {
    // The repository test compiler emits under dist/core, while older build scripts emitted flat under dist.
    return dynamicRequire(path.replace("../src/", "../../src/"));
  }
}

const bySol: Record<1 | 2, SolScreenConfigs> = {
  1: {
    airlock: { browser: () => require("../jsons/Screens/Sol_1/airlock-screen-data.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_1/airlock-screen-data.json"), path: "Screens/Sol_1/airlock-screen-data.json" },
    centralHub: { browser: () => require("../jsons/Screens/Sol_1/central-hub-screens.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_1/central-hub-screens.json"), path: "Screens/Sol_1/central-hub-screens.json" },
    engineering: { browser: () => require("../jsons/Screens/Sol_1/engineeringScreenData.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_1/engineeringScreenData.json"), path: "Screens/Sol_1/engineeringScreenData.json" },
    habitat: { browser: () => require("../jsons/Screens/Sol_1/habitatScreenData.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_1/habitatScreenData.json"), path: "Screens/Sol_1/habitatScreenData.json" },
    missionControl: { browser: () => require("../jsons/Screens/Sol_1/mission-control-screens.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_1/mission-control-screens.json"), path: "Screens/Sol_1/mission-control-screens.json" },
    research: { browser: () => require("../jsons/Screens/Sol_1/research-zone-screens.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_1/research-zone-screens.json"), path: "Screens/Sol_1/research-zone-screens.json" }
  },
  2: {
    airlock: { browser: () => require("../jsons/Screens/Sol_2/airlock-screen-data.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_2/airlock-screen-data.json"), path: "Screens/Sol_2/airlock-screen-data.json" },
    centralHub: { browser: () => require("../jsons/Screens/Sol_2/central-hub-screens.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_2/central-hub-screens.json"), path: "Screens/Sol_2/central-hub-screens.json" },
    engineering: { browser: () => require("../jsons/Screens/Sol_2/engineeringScreenData.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_2/engineeringScreenData.json"), path: "Screens/Sol_2/engineeringScreenData.json" },
    habitat: { browser: () => require("../jsons/Screens/Sol_2/habitatScreenData.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_2/habitatScreenData.json"), path: "Screens/Sol_2/habitatScreenData.json" },
    missionControl: { browser: () => require("../jsons/Screens/Sol_2/mission-control-screens.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_2/mission-control-screens.json"), path: "Screens/Sol_2/mission-control-screens.json" },
    research: { browser: () => require("../jsons/Screens/Sol_2/research-zone-screens.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_2/research-zone-screens.json"), path: "Screens/Sol_2/research-zone-screens.json" }
  }
};

/** Select Sol 1/2 content, retaining the legacy configuration for later Sols. */
export function getScreenConfigForSol<T>(section: ScreenConfigSection, sol: number, legacyConfig: T): T {
  if (sol !== 1 && sol !== 2) return legacyConfig;

  const entry = bySol[sol][section];
  try {
    let data: any;
    try {
      data = entry.browser();
    } catch {
      data = entry.node();
    }
    if (!data || !(Array.isArray(data.screens) || (data.screens && typeof data.screens === "object"))) {
      throw new Error("The file does not contain a valid screens collection.");
    }
    return data as T;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not load ${entry.path}: ${detail}`);
  }
}
