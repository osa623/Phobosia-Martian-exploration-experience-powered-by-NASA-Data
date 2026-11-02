const assert = require("node:assert/strict");
const fs = require("node:fs");
const THREE = require("three");
const { MissionManager } = require("../dist/core/MissionManager.js");
const { resolveNextMissionNavigation } = require("../dist/systems/navigation/missionNavigation.js");
const { Sol07StormController } = require("../dist/missions/sol-07/Sol07StormController.js");
const { getEVAAccessBlockReason } = require("../dist/core/EVAAccess.js");
const { SOL07_EMERGENCY_LIGHTS } = require("../dist/missions/sol-07/Sol07StormController.js");
const { getScreenConfigForSol } = require("../dist/core/ScreenConfigRegistry.js");
const { renderSol07UnitScreen } = require("../dist/missions/sol-07/Sol07ScreenRenderer.js");

const storage = new Map();
global.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
storage.set("phobosia_mission_progress_v4", JSON.stringify({
  currentDay: 7, objectiveState: "in_progress", completedStepIds: [], completedIntroductionIds: [], observationRecords: [],
  selectedRouteTarget: null, dayBriefingSeen: true, campaignFinished: false, notification: null, geologicalSurvey: null,
  surfaceObservation: null, scienceAnalysis: null, droneSurvey: null, investigationRecords: [], selectedSiteId: null,
  sol7: { alertAcknowledged: false, assessments: {}, powerAssessment: null, report: null, stormEnded: false }
}));

async function main() {
  const initialSave = storage.get("phobosia_mission_progress_v4");
  storage.set("phobosia_mission_progress_v4", JSON.stringify({ ...JSON.parse(initialSave), objectiveState: "completed" }));
  const migratedManager = new MissionManager();
  assert.equal(migratedManager.getState().objectiveState, "in_progress", "stale Sol 7 completion state should clear until all seven tasks are complete");
  storage.set("phobosia_mission_progress_v4", initialSave);
  const manager = new MissionManager();
  assert.equal(manager.getCurrentMission().title, "Dust Storm Emergency Assessment");
  assert.equal(resolveNextMissionNavigation(7, []).taskId, "SOL07_HABITAT_STORM_ALERT");
  assert.equal(manager.getCurrentNavigationInstruction().taskId, "SOL07_HABITAT_STORM_ALERT", "MissionManager should expose the Sol 7 navigation JSON to the top-right panel");
  for (const section of ["airlock", "centralHub", "engineering", "habitat", "missionControl", "research"]) {
    const config = getScreenConfigForSol(section, 7, { screens: {} });
    assert.ok(config.screens && Object.keys(config.screens).length, `Sol 7 ${section} physical screen map should load`);
  }
  const screenText = [];
  const canvasContext = { save() {}, restore() {}, fillRect() {}, strokeRect() {}, fillText(value) { screenText.push(value); } };
  assert.equal(renderSol07UnitScreen(canvasContext, 800, 450, "habitatAlert", { currentDay: 7, completedStepIds: [] }), true);
  assert.ok(screenText.some(value => value.includes("DUST STORM WARNING")), "Habitat physical screen renderer should show the Sol 7 alert");
  assert.equal(renderSol07UnitScreen(canvasContext, 800, 450, "habitatAlert", { currentDay: 8 }), false, "storm alert screen override must be Sol 7-only");
  const modelFiles = { Airlock: "AirLock.glb", Hub: "Central_Connector.glb", Habitat: "Habitat_Zone.glb", MissionControl: "Mission_Control.glb", Science: "Science_Zone.glb", Engineering: "Engineering.glb" };
  for (const [module, file] of Object.entries(modelFiles)) {
    const bytes = fs.readFileSync(`public/assets/models/${file}`);
    const jsonLength = bytes.readUInt32LE(12);
    const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
    const names = new Set((gltf.nodes ?? []).map(node => node.name).filter(Boolean));
    for (const name of SOL07_EMERGENCY_LIGHTS[module]) assert.ok(names.has(name), `${module} emergency light ${name} should resolve from its loaded GLB`);
  }

  assert.equal(manager.submitSol7Report().success, false, "final report must be gated by Tasks 1–6");
  assert.equal(manager.recordSol7ScreenReview("MC_SYSTEMS_01", "Systems status reviewed"), false, "Mission Control review cannot precede Habitat alert");
  assert.equal(manager.recordSol7Assessment("SOL07_HABITAT_STORM_ALERT"), true);
  assert.equal(manager.getCurrentNavigationInstruction().taskId, "SOL07_MISSION_CONTROL_SYSTEMS", "navigation panel should advance after the Habitat task is validated");
  assert.equal(manager.recordSol7ScreenReview("MC_SYSTEMS_01", "Communications and warnings reviewed"), false, "both Mission Control screens are required");
  assert.equal(manager.recordSol7ScreenReview("MC_NAVIGATION_01", "Navigation status and unavailable data recorded"), true, "communications/systems and navigation displays complete Task 2");
  assert.equal(manager.recordSol7Assessment("SOL07_CENTRAL_HUB_STATUS"), true);
  assert.equal(manager.recordSol7Assessment("SOL07_VERIFY_EVA_LOCKDOWN"), true);
  assert.equal(manager.recordSol7ScreenReview("LAB_RESEARCH_MONITORING_01", "Science power status reviewed"), false, "both science monitoring and cultivation displays are required");
  assert.equal(manager.recordSol7ScreenReview("LAB_CULTIVATION_01", "Existing Sol 6 status preserved"), true, "paired science displays complete Task 5");
  const unavailable = "Unavailable: no verified source value configured.";
  const assessment = Object.fromEntries(["solarGeneration", "availableReserve", "estimatedReserveDuration", "solarPanelA", "solarPanelB", "mainSolarLine", "distribution", "lifeSupport", "scienceCultivation"].map(key => [key, unavailable]));
  assert.equal(manager.recordSol7PowerAssessment(assessment), true, "classified unavailable values are valid assessment entries");
  const nav = resolveNextMissionNavigation(7, manager.getState().completedStepIds);
  assert.equal(nav.taskId, "SOL07_SUBMIT_STORM_REPORT");

  const storm = new Sol07StormController();
  const sounds = [];
  const createAudio = src => {
    const audio = { src, volume: 0, loop: false, currentTime: 0, paused: true,
      play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; } };
    sounds.push(audio); return audio;
  };
  storm.start(createAudio);
  const scene = new THREE.Group();
  const lamp = new THREE.PointLight(0xffffff, 1);
  lamp.name = "Light02";
  scene.add(lamp);
  const secondLamp = new THREE.PointLight(0xffffff, 0.7);
  secondLamp.name = "Light08";
  scene.add(secondLamp);
  const originalIntensity = lamp.intensity;
  const originalColor = lamp.color.clone();
  assert.deepEqual(storm.applyToModule(scene, "Airlock").found, ["Light02", "Light08"]);
  assert.notEqual(lamp.color.g, originalColor.g, "emergency tint should apply");
  assert.ok(lamp.intensity > originalIntensity, "SOS on pulse should make the red warning lamp visibly brighter");
  storm.update(0.29);
  assert.ok(lamp.intensity < originalIntensity, "SOS pattern should include a visible off interval between dots");
  storm.update(0.22);
  assert.ok(lamp.intensity > originalIntensity, "SOS pattern should pulse on again after the short gap");
  const stripMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222, emissiveIntensity: 0.4 });
  const strip = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 0.05), stripMaterial);
  strip.name = "LightStrip08";
  const habitat = new THREE.Group(); habitat.add(strip);
  for (const name of SOL07_EMERGENCY_LIGHTS.Habitat.filter(name => name !== "LightStrip08")) {
    const fixture = new THREE.Group(); fixture.name = name; habitat.add(fixture);
  }
  const stripOriginalColor = stripMaterial.color.clone();
  const stripOriginalEmissive = stripMaterial.emissive.clone();
  const stripOriginalEmissiveIntensity = stripMaterial.emissiveIntensity;
  storm.applyToModule(habitat, "Habitat");
  assert.ok(stripMaterial.emissiveIntensity >= 2.8, "emergency strip should receive a strong emissive red pulse");
  const hub = new THREE.Group();
  const hubLamp = new THREE.PointLight(0xfff2e0, 8.5);
  const hubAnchor = new THREE.Group(); hubAnchor.name = "Light_12"; hubAnchor.add(hubLamp); hub.add(hubAnchor);
  for (const name of ["Light_15", "Light_16", "Light_17", "Light_18"]) { const anchor = new THREE.Group(); anchor.name = name; anchor.add(new THREE.PointLight(0xfff2e0, 8.5)); hub.add(anchor); }
  const hubOriginalIntensity = hubLamp.intensity;
  assert.equal(storm.applyToModule(hub, "Hub").found.length, 5);
  assert.notEqual(hubLamp.intensity, hubOriginalIntensity, "lights attached below Hub anchor transforms should flicker too");
  assert.equal(sounds.length, 2, "both Sol 7 audio sources should start together");
  assert.equal(getEVAAccessBlockReason("Terrain", true, true) !== null, true, "storm lockdown must block an EVA-equipped player");
  assert.equal(getEVAAccessBlockReason("Terrain", false, false) !== null, true, "existing suit requirement must remain active");

  const report = manager.submitSol7Report();
  assert.equal(report.success, true);
  assert.equal(manager.getSol7Progress().stormEnded, true);
  assert.ok(manager.getSol7PostStormPowerAssessment(), "post-storm power assessment must persist");
  storm.endAfterValidatedReport();
  for (let i = 0; i < 120 && storm.isEnding(); i++) storm.update(0.1);
  assert.equal(storm.isActive(), false, "validated report should fade and end the storm controller");
  assert.equal(lamp.intensity, originalIntensity, "captured emergency light intensity must restore exactly");
  assert.ok(lamp.color.equals(originalColor), "captured emergency light color must restore exactly");
  assert.ok(stripMaterial.color.equals(stripOriginalColor), "emergency mesh tint must restore exactly");
  assert.ok(stripMaterial.emissive.equals(stripOriginalEmissive), "emergency mesh emission color must restore exactly");
  assert.equal(stripMaterial.emissiveIntensity, stripOriginalEmissiveIntensity, "emergency mesh emissive intensity must restore exactly");
  assert.equal(hubLamp.intensity, hubOriginalIntensity, "Hub child light intensity must restore exactly");
  assert.ok(sounds.every(audio => audio.paused), "both sounds should stop after fade");
  const persisted = JSON.parse(storage.get("phobosia_mission_progress_v4"));
  assert.equal(persisted.sol7.report.validated, true);
  assert.ok(persisted.sol7.powerAssessment);
  assert.equal(manager.getState().currentDay, 7, "report submission must not auto-start Sol 8");
  console.log("Sol 7 integration checks passed: mission order, report gate, EVA lock, audio/light cleanup and persisted assessment.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
