const assert = require("assert");

const store = new Map();
global.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key)
};

const { MissionManager } = require("../dist/core/MissionManager.js");
const { resolveNextMissionNavigation } = require("../dist/systems/navigation/missionNavigation.js");
const mission = require("../dist/jsons/Missions/sol-09.json");
const navigation = require("../dist/jsons/Instructions/sol-09-navigation.json");

const cases = [];
function test(name, fn) {
  try { fn(); cases.push({ name, result: "PASS", detail: "" }); }
  catch (error) { cases.push({ name, result: "FAIL", detail: error.message }); }
}
function saveState(overrides = {}) {
  store.clear();
  store.set("phobosia_mission_progress_v4", JSON.stringify({
    currentDay: 9,
    objectiveState: "in_progress",
    completedStepIds: [],
    completedIntroductionIds: [],
    observationRecords: [],
    selectedRouteTarget: null,
    dayBriefingSeen: true,
    campaignFinished: false,
    geologicalSurvey: null,
    surfaceObservation: null,
    scienceAnalysis: null,
    droneSurvey: null,
    investigationRecords: [],
    selectedSiteId: null,
    sol5: {},
    sol6: { cultivation: { id: "SOL06_EXP-1", sampleId: "PHO-SOL06-SAMPLE-1", unitReference: "LAB_CULTIVATION_01", startSol: 6, expectedResultSol: 8, status: "IN_PROGRESS", result: null } },
    sol7: { report: { validated: true, submittedAt: "2026-01-01T00:00:00.000Z" } },
    sol8: { started: true, powerFailureActive: false, communicationFailureActive: false, report: { validated: true, submittedAt: "2026-01-02T00:00:00.000Z", sections: {} } },
    sol9: { started: true },
    ...overrides
  }));
}

test("Sol 9 is locked until Sol 8 recovery is validated", () => {
  saveState({ sol8: { started: true, powerFailureActive: true, communicationFailureActive: false, report: null } });
  const manager = new MissionManager();
  assert.strictEqual(manager.getState().currentDay, 8);
  assert.strictEqual(manager.getSol09Progress().started, false);
});

test("Sol 9 loads its ten task definitions and existing destination mappings", () => {
  assert.strictEqual(mission.tasks.length, 10);
  assert.strictEqual(navigation.instructions.length, 10);
  for (const instruction of navigation.instructions) {
    const task = mission.tasks.find(item => item.taskId === instruction.taskId);
    assert.ok(task, `missing task ${instruction.taskId}`);
    assert.ok(mission.interfaces.some(item => item.triggerId === ({
      SOL09_TASK_01: "HAB_WATER_NUTRITION_01",
      SOL09_TASK_02: "LAB_CULTIVATION_01",
      SOL09_TASK_03: "LAB_CULTIVATION_01",
      SOL09_TASK_04: "LAB_CULTIVATION_01",
      SOL09_TASK_05: "Engineering_LifeSupport_Trigger",
      SOL09_TASK_06: "Engineering_LifeSupport_Trigger",
      SOL09_TASK_07: "LAB_CULTIVATION_01",
      SOL09_TASK_08: "LAB_CULTIVATION_01",
      SOL09_TASK_09: "LAB_CULTIVATION_01",
      SOL09_TASK_10: "MC_MAIN_01"
    })[instruction.taskId]), `unmapped task ${instruction.taskId}`);
  }
});

test("Sol 9 task actions validate their actual existing trigger and sequence", () => {
  saveState();
  const manager = new MissionManager();
  assert.strictEqual(manager.recordSol09TaskEvidence("SOL09_TASK_01", "LAB_CULTIVATION_01", "wrong source", "test"), false);
  assert.strictEqual(manager.recordSol09TaskEvidence("SOL09_TASK_01", "HAB_WATER_NUTRITION_01", "Habitat water record inspected.", "Existing Habitat WaterNutrition display"), true);
  assert.strictEqual(manager.recordSol09TaskEvidence("SOL09_TASK_03", "LAB_CULTIVATION_01", "premature", "test"), false);
  assert.strictEqual(manager.recordSol09TaskEvidence("SOL09_TASK_02", "LAB_CULTIVATION_01", "Sol 6 experiment PHO-SOL06-SAMPLE-1 remains IN_PROGRESS.", "Persisted Sol 6 experiment"), true);
  assert.strictEqual(manager.recordSol09TaskEvidence("SOL09_TASK_03", "LAB_CULTIVATION_01", "Rack 01 mapping unavailable.", "Existing cultivation display"), true);
  assert.strictEqual(manager.recordSol09TaskEvidence("SOL09_TASK_04", "LAB_CULTIVATION_01", "Rack 02 mapping unavailable.", "Existing cultivation display"), true);
  assert.strictEqual(manager.recordSol09TaskEvidence("SOL09_TASK_05", "Engineering_LifeSupport_Trigger", "Main water status unknown.", "Existing resource display"), true);
});

test("Unavailable water and rack data is recorded without claiming successful recovery", () => {
  saveState();
  const manager = new MissionManager();
  manager.recordSol09TaskEvidence("SOL09_TASK_01", "HAB_WATER_NUTRITION_01", "Habitat inspected.", "Existing display");
  manager.recordSol09TaskEvidence("SOL09_TASK_02", "LAB_CULTIVATION_01", "Sol 6 experiment PHO-SOL06-SAMPLE-1 reviewed.", "Persisted record");
  manager.recordSol09TaskEvidence("SOL09_TASK_03", "LAB_CULTIVATION_01", "Rack 01 mapping unavailable.", "Existing display");
  manager.recordSol09TaskEvidence("SOL09_TASK_04", "LAB_CULTIVATION_01", "Rack 02 mapping unavailable.", "Existing display");
  manager.recordSol09TaskEvidence("SOL09_TASK_05", "Engineering_LifeSupport_Trigger", "Main supply state unavailable.", "Engineering resource display");
  assert.strictEqual(manager.recordSol09WaterRecoveryUnavailable("Engineering_LifeSupport_Trigger", "No mapped repair control; restoration not claimed.", "Scene audit"), true);
  assert.strictEqual(manager.recordSol09IrrigationTest("rack01", "LAB_CULTIVATION_01", "unavailable", "Rack 01 test unavailable.", "Scene audit"), true);
  assert.strictEqual(manager.recordSol09IrrigationTest("rack02", "LAB_CULTIVATION_01", "unavailable", "Rack 02 test unavailable.", "Scene audit"), true);
  assert.strictEqual(manager.getSol09Progress().water.mainSupplyStatus, "unavailable");
  assert.strictEqual(manager.getSol09Progress().racks.rack01.irrigationResult, "unavailable");
  assert.strictEqual(manager.getSol09Progress().racks.rack02.irrigationResult, "unavailable");
  const reportSections = Object.fromEntries(mission.report.requiredSections.map(section => [section, "reviewed"]));
  const report = manager.submitSol09Report(reportSections);
  assert.strictEqual(report.success, false);
  assert.strictEqual(manager.getSol09Progress().report, null);
});

test("Sol 6, Sol 7, Sol 8 history and water status survive reload", () => {
  saveState();
  const manager = new MissionManager();
  manager.recordSol09TaskEvidence("SOL09_TASK_01", "HAB_WATER_NUTRITION_01", "Habitat inspected.", "Existing display");
  const reloaded = new MissionManager();
  assert.strictEqual(reloaded.getState().sol6.cultivation.sampleId, "PHO-SOL06-SAMPLE-1");
  assert.strictEqual(reloaded.getState().sol7.report.validated, true);
  assert.strictEqual(reloaded.getState().sol8.report.validated, true);
  assert.strictEqual(reloaded.getSol09Progress().evidence.SOL09_TASK_01.triggerId, "HAB_WATER_NUTRITION_01");
});

test("Navigation advances from evidence and never completes a task itself", () => {
  const next = resolveNextMissionNavigation(9, []);
  assert.strictEqual(next.taskId, "SOL09_TASK_01");
  const afterFirst = resolveNextMissionNavigation(9, ["SOL09_TASK_01"]);
  assert.strictEqual(afterFirst.taskId, "SOL09_TASK_02");
  saveState();
  const manager = new MissionManager();
  assert.strictEqual(manager.getCurrentNavigationInstruction().taskId, "SOL09_TASK_01");
  assert.strictEqual(manager.completeStep("SOL09_TASK_01"), false);
});

const failures = cases.filter(item => item.result === "FAIL");
for (const item of cases) console.log(`${item.result} | Sol 9 integration | ${item.name}${item.detail ? ` | ${item.detail}` : ""}`);
console.log(`Sol 9 integration result: ${cases.length - failures.length}/${cases.length} passed`);
process.exitCode = failures.length ? 1 : 0;
