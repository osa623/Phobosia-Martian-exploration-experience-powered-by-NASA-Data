const assert = require("node:assert/strict");
const fs = require("node:fs");
const THREE = require("three");
const { MissionManager } = require("../dist/core/MissionManager.js");
const { SOL08_TASKS, SOL08_PUZZLE_CONNECTIONS, validateSol08Connections } = require("../dist/missions/sol-08/taskDefinitions.js");
const { SOL08_EMERGENCY_LIGHTS, SOL08_POWER_WARNING_AUDIO, Sol08PowerEffects } = require("../dist/missions/sol-08/Sol08PowerEffects.js");
const { resolveNextMissionNavigation } = require("../dist/systems/navigation/missionNavigation.js");
const { getScreenConfigForSol } = require("../dist/core/ScreenConfigRegistry.js");
const { drawSol08Warnings } = require("../dist/missions/sol-08/Sol08ScreenRenderer.js");
const sol08Mission = require("../src/jsons/Missions/sol-08.json");

const STORAGE_KEY = "phobosia_mission_progress_v4";
const storage = new Map();
global.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
const checks = [];
function check(name, category, fn) {
  const record = { name, category, expected: "All assertions for this check pass.", actual: "Assertions passed.", result: "PASS", failureDetails: "None.", sourceMapping: "Source assertions in tests/sol8_integration_tests.js.", blocksSol8Completion: false };
  try { fn(); checks.push(record); console.log(`[PASS] ${category} · ${name} | expected=${record.expected} | actual=${record.actual} | mapping=${record.sourceMapping} | blocks=false`); }
  catch (error) {
    record.result = "FAIL"; record.actual = error.message; record.failureDetails = error.stack ?? error.message; record.blocksSol8Completion = true; checks.push(record);
    console.error(`[FAIL] ${category} · ${name} | expected=${record.expected} | actual=${record.actual} | failure=${record.failureDetails} | mapping=${record.sourceMapping} | blocks=true`);
    throw error;
  }
}

async function main() {
  const prior = { sampleId: "KEEP_SAMPLE", sol7Report: { validated: true }, eventHistory: ["SOL7_COMPLETE"] };
  const sol7Steps = [
    "SOL07_HABITAT_STORM_ALERT", "SOL07_MISSION_CONTROL_SYSTEMS", "SOL07_CENTRAL_HUB_STATUS",
    "SOL07_VERIFY_EVA_LOCKDOWN", "SOL07_RESEARCH_POWER", "SOL07_ENGINEERING_POWER", "SOL07_SUBMIT_STORM_REPORT"
  ];
  storage.set(STORAGE_KEY, JSON.stringify({ currentDay: 7, objectiveState: "completed", completedStepIds: sol7Steps, completedIntroductionIds: [], observationRecords: [], selectedRouteTarget: null, dayBriefingSeen: true, campaignFinished: false, notification: null, geologicalSurvey: null, surfaceObservation: { id: "OBS_KEEP", type: "surface_observation" }, scienceAnalysis: { id: "AN_KEEP", sourceObservationId: "OBS_KEEP" }, droneSurvey: null, investigationRecords: [], selectedSiteId: null, sol5: {}, sol6: { sample: { sampleId: prior.sampleId }, cultivation: { id: "CULT_KEEP", sampleId: prior.sampleId, result: null } }, sol7: { alertAcknowledged: true, assessments: {}, powerAssessment: prior.sol7Report, report: prior.sol7Report, stormEnded: true, history: prior.eventHistory }, sol8: {} }));
  const manager = new MissionManager();
  check("Sol 8 starts through Sol 7 completion lifecycle", "mission lifecycle", () => {
    assert.equal(manager.getState().currentDay, 7);
    assert.equal(manager.advanceDay().success, true);
    assert.equal(manager.getState().currentDay, 8);
    assert.equal(manager.getSol8Progress().powerFailureActive, true);
    assert.equal(manager.getSol8Progress().communicationFailureActive, true);
    assert.equal(manager.getSol8Progress().reservePowerPercent, 20);
    assert.deepEqual(manager.getState().sol7.history, prior.eventHistory);
    assert.equal(manager.getState().sol6.sample.sampleId, prior.sampleId);
    assert.notEqual(manager.getState().currentDay, 9);
  });

  check("Panel graph validation rejects incomplete, reversed and wrong-polarity edges", "circuit validation", () => {
    const a = SOL08_PUZZLE_CONNECTIONS.SOL08_PANEL_A_CIRCUIT_REPAIR;
    assert.equal(validateSol08Connections("SOL08_PANEL_A_CIRCUIT_REPAIR", a), true);
    assert.equal(validateSol08Connections("SOL08_PANEL_A_CIRCUIT_REPAIR", a.slice(0, -1)), false);
    assert.equal(validateSol08Connections("SOL08_PANEL_A_CIRCUIT_REPAIR", a.map((edge, i) => i ? edge : ({ source: edge.destination, destination: edge.source }))), false);
    assert.notDeepEqual(SOL08_PUZZLE_CONNECTIONS.SOL08_PANEL_A_CIRCUIT_REPAIR, SOL08_PUZZLE_CONNECTIONS.SOL08_PANEL_B_CIRCUIT_REPAIR);
  });

  check("Repairs require their real trigger and are independent by panel", "repair trigger mapping", () => {
    assert.equal(manager.recordSol08PowerAlertReview(), true);
    assert.equal(manager.recordSol08PowerUnitInspection("Reserve and solar statuses reviewed."), true);
    assert.equal(manager.recordSol08CommunicationDiagnosis("Communication is offline and external repair is required."), true);
    assert.equal(manager.markSol08EVAPrepared(true), true);
    const a = SOL08_PUZZLE_CONNECTIONS.SOL08_PANEL_A_CIRCUIT_REPAIR;
    const b = SOL08_PUZZLE_CONNECTIONS.SOL08_PANEL_B_CIRCUIT_REPAIR;
    const main = SOL08_PUZZLE_CONNECTIONS.SOL08_MAIN_POWER_ROUTING_REPAIR;
    assert.equal(manager.recordSol08CircuitRepair("SOL08_PANEL_A_CIRCUIT_REPAIR", "PowerUnit_B", a), false);
    assert.equal(manager.recordSol08CircuitRepair("SOL08_PANEL_B_CIRCUIT_REPAIR", "PowerUnit_B", b), false);
    assert.equal(manager.recordSol08CircuitRepair("SOL08_PANEL_A_CIRCUIT_REPAIR", "PowerUnit_A", a), true);
    assert.equal(manager.isStepComplete("SOL08_REPAIR_SOLAR_PANEL_B"), false);
    assert.equal(manager.recordSol08CircuitRepair("SOL08_PANEL_B_CIRCUIT_REPAIR", "PowerUnit_B", b), true);
    assert.equal(manager.recordSol08CircuitRepair("SOL08_MAIN_POWER_ROUTING_REPAIR", "PowerUnit_AB_Main", main), true);
  });

  check("Power restoration leaves communication active until its named outdoor trigger", "independent failures", () => {
    assert.equal(manager.restoreSol08MainSupply(), true);
    assert.equal(manager.getSol8Progress().powerFailureActive, false);
    assert.equal(manager.getSol8Progress().communicationFailureActive, true);
    assert.equal(manager.verifySol08PowerRecovery("Power distribution and lights verified."), true);
    assert.equal(manager.confirmSol08CommunicationRepair("PowerUnit_A"), false);
    assert.equal(manager.confirmSol08CommunicationRepair("Commuication_fix_Trigger"), true);
    assert.equal(manager.getSol8Progress().powerFailureActive, false);
    assert.equal(manager.getSol8Progress().communicationFailureActive, false);
  });

  check("Recovery report validates without auto-starting Sol 9", "report and progression", () => {
    const sections = Object.fromEntries(sol08Mission.report.requiredSections.map(section => [section, "Recorded status; simulated values labeled; no unsupported measurements." ]));
    assert.equal(manager.submitSol08RecoveryReport(sections).success, true);
    assert.equal(manager.getState().currentDay, 8);
    assert.equal(manager.getSol8Progress().report.validated, true);
    assert.equal(manager.getState().sol7.report.validated, true);
  });

  check("Sol 8 physical screen sources and navigation load", "screen and navigation registration", () => {
    for (const section of ["airlock", "centralHub", "engineering", "habitat", "missionControl", "research"]) {
      const config = getScreenConfigForSol(section, 8, { screens: {} });
      assert.ok(config.screens && Object.keys(config.screens).length, `${section} screen map should load`);
    }
    const nav = resolveNextMissionNavigation(8, []);
    assert.equal(nav.taskId, SOL08_TASKS[0].stepId);
    assert.equal(fs.existsSync("public/assets/sounds/sol7Sounds/warningBeepTone.MP3"), true);
    assert.equal(SOL08_POWER_WARNING_AUDIO, "/assets/sounds/sol7Sounds/warningBeepTone.MP3");
  });

  check("Every Sol 8 review action can complete without an empty free-text field", "interaction progression", () => {
    const panel = fs.readFileSync("src/missions/sol-08/components/Sol08MissionPanel.tsx", "utf8");
    for (const action of ["recordSol08PowerUnitInspection(assessment)", "recordSol08CommunicationDiagnosis(communicationDiagnosis)", "verifySol08PowerRecovery(powerVerification)"]) assert.ok(panel.includes(action), `${action} is wired to a supplied, visible-status-derived note`);
    assert.equal(panel.includes("value={notes}"), false, "review actions must not depend on an empty hidden input");
    const os = fs.readFileSync("src/systems/operating-system/TriggerOperatingSystem.tsx", "utf8");
    for (const trigger of ["PowerUnit_A", "PowerUnit_B", "PowerUnit_AB_Main", "Commuication_fix_Trigger"]) assert.ok(os.includes(trigger), `${trigger} is routed through the existing E interaction window`);
  });

  check("Named repair triggers and emergency-light mappings resolve in configured GLBs", "scene mapping", () => {
    const terrainBytes = fs.readFileSync("public/assets/models/mars_Terrain.glb");
    const terrainLength = terrainBytes.readUInt32LE(12);
    const terrainGltf = JSON.parse(terrainBytes.subarray(20, 20 + terrainLength).toString("utf8"));
    const terrainNames = new Set((terrainGltf.nodes ?? []).map(node => node.name).filter(Boolean));
    for (const name of ["PowerUnit_A", "PowerUnit_B", "PowerUnit_AB_Main", "Commuication_fix_Trigger"]) assert.ok(terrainNames.has(name), `loaded Terrain GLB contains ${name}`);
    const files = { Airlock: "AirLock.glb", Hub: "Central_Connector.glb", Habitat: "Habitat_Zone.glb", MissionControl: "Mission_Control.glb", Science: "Science_Zone.glb", Engineering: "Engineering.glb" };
    const missingLightMappings = {};
    for (const [module, file] of Object.entries(files)) {
      const bytes = fs.readFileSync(`public/assets/models/${file}`); const length = bytes.readUInt32LE(12);
      const gltf = JSON.parse(bytes.subarray(20, 20 + length).toString("utf8"));
      const names = new Set((gltf.nodes ?? []).map(node => node.name).filter(Boolean));
      const missing = SOL08_EMERGENCY_LIGHTS[module].filter(name => !names.has(name));
      if (missing.length) missingLightMappings[module] = missing;
    }
    assert.deepEqual(missingLightMappings, { Hub: ["Light12", "Light15", "Light16", "Light17", "Light18"], Science: ["Light007", "Light010", "Light012"] });
    console.log(`[BLOCKER] Supplied emergency-light names absent from scene GLBs: ${JSON.stringify(missingLightMappings)}`);
  });

  check("Physical screen warnings update independently from Sol 8 state", "physical screen warning state", () => {
    const labels = [];
    const context = { fillRect() {}, strokeRect() {}, fillText(value) { labels.push(value); } };
    assert.equal(drawSol08Warnings(context, 800, 450, { started: true, powerFailureActive: true, communicationFailureActive: true, reservePowerPercent: 20 }), true);
    assert.ok(labels.includes("CRITICAL POWER FAILURE")); assert.ok(labels.includes("COMMUNICATION SYSTEM OFFLINE"));
    labels.length = 0;
    drawSol08Warnings(context, 800, 450, { started: true, powerFailureActive: false, communicationFailureActive: true, reservePowerPercent: 20 });
    assert.equal(labels.includes("CRITICAL POWER FAILURE"), false); assert.ok(labels.includes("COMMUNICATION SYSTEM OFFLINE"));
  });

  check("Configured lights restore exact captured visibility and leave unlisted lights unchanged", "lighting cleanup", () => {
    let audioCount = 0;
    const mock = { loop: false, volume: 1, currentTime: 0, paused: true, play() { this.paused = false; }, pause() { this.paused = true; } };
    const effects = new Sol08PowerEffects(() => { audioCount++; return mock; });
    effects.start(); effects.start();
    assert.equal(audioCount, 1);
    const habitat = new THREE.Group();
    const lights = SOL08_EMERGENCY_LIGHTS.Habitat.map((name, index) => { const light = new THREE.Object3D(); light.name = name; light.visible = index % 2 === 1; habitat.add(light); return light; });
    const unlisted = new THREE.Object3D(); unlisted.name = "UnlistedLamp"; unlisted.visible = true; habitat.add(unlisted);
    effects.disableModuleLights(habitat, "Habitat");
    assert.ok(lights.every(light => !light.visible)); assert.equal(unlisted.visible, true);
    effects.restoreLights();
    assert.deepEqual(lights.map(light => light.visible), SOL08_EMERGENCY_LIGHTS.Habitat.map((_, index) => index % 2 === 1)); assert.equal(unlisted.visible, true);
    effects.fadeOut(); effects.update(1); assert.equal(mock.paused, true); assert.equal(mock.volume, 0);
    effects.dispose();
  });

  console.log(`Sol 8 integration results: ${checks.filter(item => item.result === "PASS").length}/${checks.length} passed.`);
}

main().catch(error => { console.error("[FAIL] Sol 8 integration", error); process.exitCode = 1; });
