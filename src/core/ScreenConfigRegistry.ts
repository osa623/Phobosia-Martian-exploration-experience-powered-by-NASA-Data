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
  selectedSiteId?: string | null;
  investigationRecords?: Array<{ taskId: string; classification?: string; rationale?: string; playerComment?: string; limitations?: string[]; evidenceReferences?: string[] }>;
  sol6?: { cultivation?: { sampleId: string; status: string } | null };
}

type ScreenConfigPair = { browser: () => any; node: () => any; path: string };
type SolScreenConfigs = Partial<Record<ScreenConfigSection, ScreenConfigPair>>;

function loadNodeScreenConfig(path: string): unknown {
  const dynamicRequire = eval("require") as (modulePath: string) => unknown;
  try {
    return dynamicRequire(path);
  } catch {
    // The repository test compiler emits under dist/core, while older build scripts emitted flat under dist.
    return dynamicRequire(path.replace("../src/", "../../src/"));
  }
}

const bySol: Record<1 | 2 | 3 | 4 | 7, SolScreenConfigs> = {
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
  },
  3: {
    airlock: { browser: () => require("../jsons/Screens/Sol_3/airlock-screen-data.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_3/airlock-screen-data.json"), path: "Screens/Sol_3/airlock-screen-data.json" },
    centralHub: { browser: () => require("../jsons/Screens/Sol_3/central-hub-screens.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_3/central-hub-screens.json"), path: "Screens/Sol_3/central-hub-screens.json" },
    engineering: { browser: () => require("../jsons/Screens/Sol_3/engineeringScreenData.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_3/engineeringScreenData.json"), path: "Screens/Sol_3/engineeringScreenData.json" },
    habitat: { browser: () => require("../jsons/Screens/Sol_3/habitatScreenData.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_3/habitatScreenData.json"), path: "Screens/Sol_3/habitatScreenData.json" },
    missionControl: { browser: () => require("../jsons/Screens/Sol_3/mission-control-screens.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_3/mission-control-screens.json"), path: "Screens/Sol_3/mission-control-screens.json" },
    research: { browser: () => require("../jsons/Screens/Sol_3/research-zone-screens.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_3/research-zone-screens.json"), path: "Screens/Sol_3/research-zone-screens.json" }
  },
  4: {
    airlock: { browser: () => require("../jsons/Screens/Sol_4/airlock-screen-data.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_4/airlock-screen-data.json"), path: "Screens/Sol_4/airlock-screen-data.json" },
    centralHub: { browser: () => require("../jsons/Screens/Sol_4/central-hub-screens.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_4/central-hub-screens.json"), path: "Screens/Sol_4/central-hub-screens.json" },
    engineering: { browser: () => require("../jsons/Screens/Sol_4/engineeringScreenData.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_4/engineeringScreenData.json"), path: "Screens/Sol_4/engineeringScreenData.json" },
    habitat: { browser: () => require("../jsons/Screens/Sol_4/habitatScreenData.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_4/habitatScreenData.json"), path: "Screens/Sol_4/habitatScreenData.json" },
    missionControl: { browser: () => require("../jsons/Screens/Sol_4/mission-control-screens.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_4/mission-control-screens.json"), path: "Screens/Sol_4/mission-control-screens.json" },
    research: { browser: () => require("../jsons/Screens/Sol_4/research-zone-screens.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_4/research-zone-screens.json"), path: "Screens/Sol_4/research-zone-screens.json" }
  },
  7: {
    airlock: { browser: () => require("../jsons/Screens/Sol_7/airlock-screen-data.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_7/airlock-screen-data.json"), path: "Screens/Sol_7/airlock-screen-data.json" },
    centralHub: { browser: () => require("../jsons/Screens/Sol_7/central-hub-screens.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_7/central-hub-screens.json"), path: "Screens/Sol_7/central-hub-screens.json" },
    engineering: { browser: () => require("../jsons/Screens/Sol_7/engineeringScreenData.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_7/engineeringScreenData.json"), path: "Screens/Sol_7/engineeringScreenData.json" },
    habitat: { browser: () => require("../jsons/Screens/Sol_7/habitatScreenData.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_7/habitatScreenData.json"), path: "Screens/Sol_7/habitatScreenData.json" },
    missionControl: { browser: () => require("../jsons/Screens/Sol_7/mission-control-screens.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_7/mission-control-screens.json"), path: "Screens/Sol_7/mission-control-screens.json" },
    research: { browser: () => require("../jsons/Screens/Sol_7/research-zone-screens.json"), node: () => loadNodeScreenConfig("../src/jsons/Screens/Sol_7/research-zone-screens.json"), path: "Screens/Sol_7/research-zone-screens.json" }
  }
};

/** Select content for Sols 1-4 while leaving legacy behavior available to later Sols. */
export function getScreenConfigForSol<T>(section: ScreenConfigSection, sol: number, legacyConfig: T): T {
  if (sol !== 1 && sol !== 2 && sol !== 3 && sol !== 4 && sol !== 7) return legacyConfig;

  const entry = bySol[sol][section];
  if (!entry) return legacyConfig;
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
    if ((sol === 3 || sol === 4) && Array.isArray((legacyConfig as any)?.screens) && Array.isArray(data.screens)) {
      const overrides = new Map<string, any>(data.screens.map((screen: any) => [screen.screenId, screen]));
      const mergedScreens = (legacyConfig as any).screens.map((screen: any) => {
        const override = overrides.get(screen.screenId);
        return override ? { ...screen, ...override, content: override.content ?? screen.content } : screen;
      });
      return { ...(legacyConfig as any), screens: mergedScreens } as T;
    }
    return data as T;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not load ${entry.path}: ${detail}`);
  }
}
