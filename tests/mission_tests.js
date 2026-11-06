/**
 * PHOBOSIA â€” Phase 2 & Phase 3 Automated Mission Logic & Progression Test Suite
 *
 * Validates:
 * - P2-001: Correct initial Day 1 state
 * - P2-002: Day 1 step validation and checklist tracking
 * - P2-003: Objective remains incomplete when required steps are missing
 * - P2-004: Objective completes when all required steps are validated
 * - P2-005: Duplicate step events do not corrupt progress (idempotency)
 * - P2-006: Observation records are saved without duplicates
 * - P2-007: Rest is blocked when current day objective is incomplete
 * - P2-008: Rest advances a completed day exactly once
 * - P2-009: Repeated rest input cannot skip days
 * - P2-010: Day 2 Habitat readiness lifecycle
 * - P2-011: Day 3 Power observation lifecycle
 * - P2-012: Day 4 Life-support verification lifecycle
 * - P2-013: Day 5 Terrain route planning validation & invalid target rejection
 * - P3-001: Day 5 successfully advances to Day 6 upon route confirmation
 * - P3-002: Day 6 Geological Site Survey requires valid GeologicalSurveyRecord
 * - P3-003: Day 6 advances to Day 7 only when record is validated
 * - P3-004: Day 7 Surface Observation lifecycle & Airlock transition
 * - P3-005: Day 7 Surface Observation record persistence & prerequisite generation
 * - P3-006: Day 8 Research Lab Analysis strictly fails without Day 7 source record
 * - P3-007: Day 8 cross-references Day 6 survey and requires valid interpretation
 * - P3-008: Day 8 saves ScienceAnalysisRecord linked to Day 7 source ID
 * - P3-009: Day 9 Remote Drone Survey FPV activation and capture
 * - P3-010: Day 9 requires FPV exit and drone survey record before completion
 * - P3-011: Day 9 marks completion of Phase 3 and strictly prevents advancing to Day 10
 */

const assert = require('assert');

// Simple mock for browser localStorage in Node test environment
const mockStorage = new Map();
global.localStorage = {
  getItem: (k) => mockStorage.get(k) || null,
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: (k) => mockStorage.delete(k),
  clear: () => mockStorage.clear()
};

const { DAYS_CONFIG, MASTER_TERRAIN_TARGETS, PREDEFINED_INTERPRETATIONS, getMissionTaskProgressFor } = require('../dist/core/MissionManager.js');
const { MissionManager } = require('../dist/core/MissionManager.js');
const { resolveNextMissionNavigation, normalizeValidatedTaskIds } = require('../dist/systems/navigation/missionNavigation.js');
const THREE = require('three');
const { reprojectPlanarUVs, buildCentralHubColliders, buildCentralHubOrientedColliders, orientedBoxContainsPoint, buildCentralHubCylinderColliders, verticalCylinderContainsPoint, buildScienceLabColliders, buildHabitatColliderSection, buildDroneSectionColliders, getSurfaceHeight } = require('../dist/core/Collision.js');

function completeSol2(mm) {
  const tasks = [
    ['SOL02_HABITAT_STATUS', ['HAB-STATUS-MAIN'], 4], ['SOL02_WATER_NUTRITION', ['HAB-WATER-NUTRITION'], 3],
    ['SOL02_ENGINEERING_MONITORING', ['ENG-MON-INDICATORS'], 3], ['SOL02_POWER_REVIEW', ['ENG-POWER-MAIN'], 5],
    ['SOL02_ENGINEERING_LIFESUPPORT', ['ENG-LS-ENVIRONMENT'], 4], ['SOL02_DIAGNOSTICS', ['ENG-DIAG-WORKBENCH'], 4]
  ];
  for (const [taskId, evidenceReferences, count] of tasks) {
    const result = mm.submitInvestigation({ taskId, evidenceReferences, classification: 'insufficient_evidence', rationale: 'The available records do not contain enough reference context.', limitations: ['Simulated game data; no external validation.'], procedureChecks: Array.from({ length: count }, (_, i) => `${taskId}:${i}`) });
    assert.strictEqual(result.success, true, result.message);
  }
  const refs = mm.getInvestigationRecords().map(r => r.id);
  const result = mm.submitInvestigation({ taskId: 'SOL02_READINESS_ASSESSMENT', evidenceReferences: refs, classification: 'undetermined', rationale: 'Evidence gaps prevent a defensible readiness determination.', limitations: ['No approved system limits are supplied.'], procedureChecks: [] });
  assert.strictEqual(result.success, true, result.message);
}

function completeSol3(mm, targetId = MASTER_TERRAIN_TARGETS[0].id) {
  const prepare = (taskId, evidenceReferences, extra = {}) => {
    const result = mm.submitInvestigation({ taskId, evidenceReferences, classification: 'insufficient_evidence', rationale: 'This is a planning record based on limited simulated metadata.', limitations: ['No external scientific measurements.'], procedureChecks: [`${taskId}:0`, `${taskId}:1`], ...extra });
    assert.strictEqual(result.success, true, result.message);
  };
  prepare('SOL03_MISSION_CONTEXT', ['SOL03-MISSION-CONTEXT']);
  prepare('SOL03_OBSERVATION_SITE_REVIEW', MASTER_TERRAIN_TARGETS.map(target => `TARGET:${target.id}`));
  prepare('SOL03_SYSTEM_CONSTRAINTS', ['SOL03-COMMS-SYSTEMS']);
  prepare('SOL03_SELECT_TARGET', [`TARGET:${targetId}`], { selectedTargetId: targetId, scientificQuestion: 'Which site profile merits a future observation?' });
  prepare('SOL03_SELECT_DATASET', ['DATASET:PHOBOSIA_TARGET_PROFILE_TRAINING'], { datasetId: 'PHOBOSIA_TARGET_PROFILE_TRAINING' });
  const refs = mm.getInvestigationRecords().filter(r => r.taskId.startsWith('SOL03_')).map(r => r.id);
  const result = mm.submitInvestigation({ taskId: 'SOL03_SUBMIT_TARGET_RECORD', evidenceReferences: refs, classification: 'proposal_submitted', rationale: 'A cautious training proposal with explicit limits.', limitations: ['Metadata only; not scientific observations.'], procedureChecks: [], selectedTargetId: targetId, datasetId: 'PHOBOSIA_TARGET_PROFILE_TRAINING', scientificQuestion: 'What should a future surface observation examine?' });
  assert.strictEqual(result.success, true, result.message);
}

function completeSol4(mm) {
  const targetId = mm.getSelectedSiteId();
  assert(targetId && MASTER_TERRAIN_TARGETS.some(target => target.id === targetId), 'Sol 3 selected target must persist into Sol 4');
  const submit = (taskId, limitations = ['Target-specific coordinates, NASA products, and terrain measurements are unavailable.'], evidenceReferences = []) => {
    const result = mm.submitInvestigation({ taskId, evidenceReferences, classification: 'insufficient_evidence', rationale: 'The available target record supports planning, with important evidence limits.', limitations, procedureChecks: taskId === 'SOL04_SUBMIT_PREPARATION_REPORT' ? [] : ['reviewed', 'limitations-recorded'], selectedTargetId: targetId, playerComment: 'Player assessment; not an independently verified finding.' });
    assert.strictEqual(result.success, true, `${taskId}: ${result.message}`);
  };
  submit('SOL04_MISSION_CONTEXT');
  submit('SOL04_SELECTED_TARGET_INVESTIGATION');
  submit('SOL04_TERRAIN_DATA_REVIEW');
  assert.strictEqual(mm.recordPhysicalDroneInspection('Visible presence checked; readings unavailable.'), true);
  submit('SOL04_DRONE_MISSION_PLAN');
  const refs = mm.getInvestigationRecords().filter(record => record.sol === 4).map(record => record.id);
  submit('SOL04_SUBMIT_PREPARATION_REPORT', ['Terrain measurements and drone telemetry are unavailable.'], refs);
}

function completeSol5(mm) {
  const targetId = mm.getSelectedSiteId();
  assert(targetId, 'Sol 5 must inherit the official target');
  assert.strictEqual(mm.confirmSol5Briefing().success, true);
  assert.strictEqual(mm.startSol5Simulation().success, true);
  const takeoff = { x: 10, y: 2, z: 15 };
  const flight = { targetId, status: 'flying', takeoff, position: { x: 20, y: 3, z: 30 }, speedMps: 0.2, elapsedSeconds: 42,
    totalDistanceM: 61.5, maxAltitudeAglM: 4.4, batteryPercent: 98.2, signalPercent: 94, cameraView: 'down', landed: false };
  assert.strictEqual(mm.saveSol5FlightSnapshot(flight), true);
  assert.strictEqual(mm.markSol5TargetReached(targetId), true);
  const { SOL5_EVIDENCE_ASSETS } = require('../dist/missions/sol-05/targetMapping.js');
  const inspected = mm.completeSol5TargetInspection(targetId, SOL5_EVIDENCE_ASSETS[targetId]);
  assert.strictEqual(inspected.success, true, inspected.message);
  const reloadedAfterInspection = new MissionManager();
  assert.strictEqual(reloadedAfterInspection.getSol5Progress().attemptStatus, 'aborted', 'Reload before landing aborts even after target inspection');
  assert.strictEqual(reloadedAfterInspection.getSol5Progress().targetInspected, false, 'Inspection must be repeated on the new attempt');
  assert.strictEqual(reloadedAfterInspection.getSol5Progress().images.length, 0, 'Incomplete attempt evidence state is cleared for re-inspection');
  assert.strictEqual(reloadedAfterInspection.getSelectedSiteId(), targetId, 'Reload preserves the submitted target');
  mm = reloadedAfterInspection;
  assert.strictEqual(mm.startSol5Simulation().success, true);
  assert.strictEqual(mm.markSol5TargetReached(targetId), true);
  assert.strictEqual(mm.saveSol5FlightSnapshot(flight), true);
  assert.strictEqual(mm.completeSol5TargetInspection(targetId, SOL5_EVIDENCE_ASSETS[targetId]).success, true);
  const landed = { ...flight, status: 'landed', position: takeoff, speedMps: 0, landed: true };
  assert.strictEqual(mm.completeSol5Landing(landed, false).success, false, 'Landing task cannot complete without explicit landing-trigger validation');
  assert.strictEqual(mm.isStepComplete('SOL05_SAFE_LANDING'), false, 'Touchdown alone leaves the landing task pending for player confirmation');
  assert.strictEqual(mm.completeSol5Landing(landed, true).success, true, 'Validated L-key landing confirmation completes the landing task');
  assert.strictEqual(mm.isStepComplete('SOL05_AERIAL_RECONNAISSANCE'), true);
  assert.strictEqual(mm.isStepComplete('SOL05_SAFE_LANDING'), true);
  const review = mm.confirmSol5ImageReview();
  assert.strictEqual(review.success, true, review.message);
  const report = mm.submitSol5Report({ observedFeatures: 'Visible tonal variation in image frames.',
    playerInterpretation: 'Possible surface texture differences; tentative.', uncertainties: 'Scale and feature identity remain uncertain.',
    groundFollowUp: 'Verify the apparent texture from the ground during Sol 6.' });
  assert.strictEqual(report.success, true, report.message);
  assert.strictEqual(mm.getState().sol5.report.targetId, targetId);
  assert(mm.getState().sol5.images.every(image => image.targetId === targetId));
  return mm;
}

function completeSol6(mm) {
  const targetId = mm.getSelectedSiteId();
  assert(targetId, 'Sol 6 must inherit the validated Sol 3 target');
  assert.strictEqual(mm.confirmSol6Briefing().success, true);
  assert.strictEqual(mm.prepareSol6Equipment().success, true);
  assert.strictEqual(mm.markSol6EVAActivated(true), true);
  assert.strictEqual(mm.markSol6TargetReached(targetId), true);
  const observation = mm.saveSol6FieldObservation({ targetId, locationReference: 'selected target scene object', category: 'visible surface appearance', observation: 'Visible surface variation is recorded from the scene without assigning a geological classification.', interpretation: 'The variation may warrant later closer inspection.', uncertainty: 'No verified measurements or instrument data are available.' });
  assert(observation, 'Field observation should persist');
  const sample = mm.collectSol6Sample('selected target scene object', 'simulated sample container reference');
  assert(sample && sample.targetId === targetId, 'Sample must retain selected-target provenance');
  assert.strictEqual(mm.getCurrentNavigationInstruction().taskId, 'SOL06_RETURN_TO_AIRLOCK', 'The task list advances to Airlock return immediately after sample collection');
  // Model an interrupted/older save where the secured sample exists but its
  // collection task ID was not persisted. Airlock arrival must reconcile it.
  const completedIds = mm.getState().completedStepIds;
  completedIds.splice(completedIds.indexOf('SOL06_COLLECT_SOIL_SAMPLE'), 1);
  // The Airlock suit-removal interaction also repairs a missed arrival callback.
  assert.strictEqual(mm.markSol6EVAActivated(false), true);
  assert.strictEqual(mm.isStepComplete('SOL06_COLLECT_SOIL_SAMPLE'), true, 'Secured sample evidence repairs the missing task completion');
  assert.strictEqual(mm.isStepComplete('SOL06_RETURN_TO_AIRLOCK'), true, 'Suit removal confirms the player reached the Airlock when the transition callback was missed');
  assert.strictEqual(mm.isStepComplete('SOL06_REMOVE_EVA_SUIT'), true, 'Airlock suit removal completes its task');
  assert.strictEqual(mm.getCurrentNavigationInstruction().taskId, 'SOL06_TRANSFER_SAMPLE', 'After suit removal, the next task is sample transfer');
  assert.strictEqual(mm.transferSol6Sample().success, true);
  assert.strictEqual(mm.getCurrentNavigationInstruction().taskId, 'SOL06_ANALYSE_SAMPLE', 'Sample receipt advances directly to preliminary analysis');
  const analysis = mm.saveSol6Analysis({ visualAppearance: 'Player-authored visual description.', grainSizeOrTexture: 'Not instrument measured.', colourDescription: 'Player-authored colour note.', supportedIndicators: 'No laboratory indicators are configured.', limitationsAndUncertainty: 'No chemical or biological dataset is available.', playerInterpretation: 'Tentative player interpretation only.', reportUncertainty: '' });
  assert(analysis, 'Panel analysis fields save even while its separate report field is empty');
  assert.strictEqual(Object.hasOwn(analysis, 'reportUncertainty'), false, 'Unrelated report input is not stored in the analysis record');
  const experiment = mm.startSol6Cultivation();
  assert(experiment && experiment.status === 'IN_PROGRESS' && experiment.result === null);
  assert.strictEqual(mm.submitSol6Report('Physical composition, field coordinates and laboratory measurements are not independently verified.').success, true);
  return mm;
}

function completeSol7(mm) {
  const tasks = ['SOL07_HABITAT_STORM_ALERT', 'SOL07_MISSION_CONTROL_SYSTEMS', 'SOL07_CENTRAL_HUB_STATUS', 'SOL07_VERIFY_EVA_LOCKDOWN', 'SOL07_RESEARCH_POWER'];
  for (const id of tasks) assert.strictEqual(mm.recordSol7Assessment(id), true, `${id} should complete in order`);
  const unavailable = 'Unavailable: no verified source value configured.';
  const power = Object.fromEntries(['solarGeneration','availableReserve','estimatedReserveDuration','solarPanelA','solarPanelB','mainSolarLine','distribution','lifeSupport','scienceCultivation'].map(key => [key, unavailable]));
  assert.strictEqual(mm.recordSol7PowerAssessment(power), true);
  assert.strictEqual(mm.submitSol7Report().success, true);
  return mm;
}

function seedSol7SurfacePrerequisiteForSol8Test(mm) {
  // Isolated downstream Sol 8 tests use a synthetic fixture; runtime Sol 7 does not create a surface observation.
  mm.getState().surfaceObservation = { id: 'TEST_SOL7_SURFACE_RECORD', day: 7, targetId: 'TEST_TARGET', source: 'PHOBOSIA simulated surface observation', observedCategories: { surfacePattern: 'test', surfaceMaterialAppearance: 'test', terrainProfile: 'test', areaOfInterest: 'test' }, followUpQuestion: 'test', summary: 'test fixture', isSimulated: true, saved: true };
}
const { ScreenRenderer } = require('../dist/core/ScreenRenderer.js');
const { HabitatScreenRenderer } = require('../dist/core/HabitatScreenRenderer.js');
const { EngineeringScreenRenderer } = require('../dist/core/EngineeringScreenRenderer.js');
const { ResearchScreenRenderer } = require('../dist/core/ResearchScreenRenderer.js');
const { MissionControlScreenRenderer } = require('../dist/core/MissionControlScreenRenderer.js');
const { CentralHubScreenRenderer } = require('../dist/core/CentralHubScreenRenderer.js');
const { AirlockScreenRenderer } = require('../dist/core/AirlockScreenRenderer.js');
const { configureModuleLighting, configureMeshShadows, getModuleHemisphereConfig, configureHabitatAreaLights, discoverHubLights, configureHubLights } = require('../dist/core/ModuleLighting.js');
const { DAY1_TASKS, DAY1_ZONES, TRIGGER_TO_TASK_MAP, TRIGGER_TO_GROUP_MAP } = require('../dist/core/Day1Config.js');
const { CameraPresentationManager } = require('../dist/core/CameraPresentation.js');
const { getScreenConfigForSol } = require('../dist/core/ScreenConfigRegistry.js');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  âœ“ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  âœ— FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

test('Sol 6 mission and navigation JSON share the complete required task set', () => {
  const mission = require('../dist/jsons/Missions/sol-06.json');
  const navigation = require('../dist/jsons/Instructions/sol-06-navigation.json');
  const required = mission.missionCompletion.requiredTasks;
  assert.strictEqual(required.length, 12);
  assert.deepStrictEqual(mission.tasks.filter(task => task.mandatory).map(task => task.taskId), required);
  assert.deepStrictEqual(navigation.instructions.map(instruction => instruction.taskId), required);
  assert.strictEqual(mission.persistentMissionData.targetIds.includes('TARGET_GAMMA_SOUTH_ESCARPMENT'), true);
  assert.strictEqual(mission.interfaces.find(item => item.interfaceId === 'AIRLOCK_RETURN_TRANSITION').triggerId, 'Spwaning_Position');
});

test('Sol 1-4 routing covers all six physical-screen sections and preserves every screen association', () => {
  const sections = { airlock: 'airlock-screen-data.json', centralHub: 'central-hub-screens.json', engineering: 'engineeringScreenData.json', habitat: 'habitatScreenData.json', missionControl: 'mission-control-screens.json', research: 'research-zone-screens.json' };
  const signature = config => Array.isArray(config.screens)
    ? config.screens.map(({ screenId, meshName, rendererId }) => ({ screenId, meshName, rendererId }))
    : Object.entries(config.screens).map(([id, item]) => ({ id, physicalMesh: item.physicalMesh, geometry: item.geometry, orientation: item.orientation }));
  for (const sol of [1, 2, 3, 4]) for (const [section, file] of Object.entries(sections)) {
    const baseline = require(`../src/jsons/Screens/Sol_${sol < 3 ? sol : 2}/${file}`);
    const selected = getScreenConfigForSol(section, sol, baseline);
    assert.deepStrictEqual(signature(selected), signature(baseline), `Sol ${sol} ${section} must preserve physical screen bindings`);
    assert.strictEqual(signature(selected).length, signature(baseline).length);
  }
  const legacy = require('../src/jsons/Screens/Sol_2/mission-control-screens.json');
  for (const sol of [3, 4]) {
    const selected = getScreenConfigForSol('missionControl', sol, legacy);
    const renderer = new MissionControlScreenRenderer(selected);
    renderer.missionSol = sol;
    const overview = selected.screens.find(screen => screen.screenId === 'MC_OVERVIEW');
    const content = renderer.getMissionAwareContent(overview);
    assert(content.header.subtitle.includes(`SOL 0${sol}`));
  }
});

test('Sol 3 target catalogue screen references all nine existing image assets without duplicating selection state', () => {
  const mission = require('../src/jsons/Missions/sol-03.json');
  const config = getScreenConfigForSol('missionControl', 3, require('../src/jsons/Screens/Sol_2/mission-control-screens.json'));
  const screen = config.screens.find(item => item.screenId === 'MC_OBSERVATION_SITES');
  const gallery = screen.content.panels.find(panel => panel.type === 'IMAGE_GALLERY');
  const expected = mission.targetCatalogue.flatMap(target => Object.values(target.images));
  assert.deepStrictEqual(gallery.images.map(image => image.src).sort(), expected.sort());
  assert(mission.targetCatalogue.every(target => target.marsCoordinates === null && target.outpostDistance === null));
});

test('Sol 4 Mission Control and Research physical screens use the official target A/B/C reference', () => {
  const mission = require('../src/jsons/Missions/sol-03.json');
  const fs = require('fs');
  const path = require('path');
  const config = getScreenConfigForSol('missionControl', 4, require('../src/jsons/Screens/Sol_2/mission-control-screens.json'));
  const researchConfig = getScreenConfigForSol('research', 4, require('../src/jsons/Screens/Sol_2/research-zone-screens.json'));
  const objectiveScreen = config.screens.find(item => item.meshName === 'MissionControl_ObjectivesScreen');
  assert.deepStrictEqual(objectiveScreen.dimensionsMeters, { x: 0, y: 3.31, z: 2.64 });
  const navScreen = config.screens.find(item => item.meshName === 'MissionControl_TerrainMapScreen');
  assert.strictEqual(navScreen.screenId, 'MC_TERRAIN_MAP');
  const observationScreen = config.screens.find(item => item.meshName === 'MissionControl_ObservationSitesScreen');
  assert.strictEqual(observationScreen.screenId, 'MC_OBSERVATION_SITES');
  const researchScreen = researchConfig.screens.find(item => item.meshName === 'ResearchMonitoring_SystemScreen');
  assert.strictEqual(researchScreen.screenId, 'research_monitoring_system');
  assert.strictEqual(researchScreen.rendererId, 'ResearchMonitoringSystemRenderer');

  for (const target of mission.targetCatalogue) {
    const officialRecord = { taskId: 'SOL03_SUBMIT_TARGET_RECORD', evidenceReferences: [`TARGET:${target.targetId}`], rationale: 'Submitted Sol 3 target proposal.', limitations: ['No target-matched scientific measurements.'] };
    const state = {
      currentDay: 4,
      currentSol: 4,
      selectedSiteId: target.targetId,
      completedStepIds: ['SOL04_SELECTED_TARGET_INVESTIGATION', 'SOL04_TERRAIN_DATA_REVIEW', 'SOL04_DRONE_PHYSICAL_INSPECTION'],
      investigationRecords: [officialRecord, { taskId: 'SOL04_SELECTED_TARGET_INVESTIGATION', rationale: `Investigated ${target.targetId}.`, limitations: ['Coordinates unavailable.'] }, { taskId: 'SOL04_TERRAIN_DATA_REVIEW', rationale: `Reviewed terrain evidence for ${target.targetId}.`, limitations: ['No elevation or slope dataset available.'] }]
    };
    const renderer = new MissionControlScreenRenderer(config);
    renderer.missionSol = 4;
    renderer.missionState = state;
    const observation = renderer.getMissionAwareContent(observationScreen);
    const observationGallery = observation.panels.find(panel => panel.type === 'IMAGE_GALLERY');
    assert.strictEqual(observation.header.status, 'OFFICIAL SOL 3 TARGET');
    assert(observation.header.subtitle.includes(target.name));
    assert.deepStrictEqual(observationGallery.images.map(image => image.src).sort(), Object.values(target.images).sort());
    assert(observation.panels.find(panel => panel.id === 'site_registry').fallback[0].name.includes(target.targetId));

    const navigation = renderer.getMissionAwareContent(navScreen);
    assert(navigation.header.title.includes('NAVIGATION'));
    assert(navigation.header.subtitle.includes(target.name));
    assert(navigation.header.status.includes(target.targetId));
    const routeMessage = navigation.panels.find(panel => panel.id === 'route_summary').fallback.message;
    assert(routeMessage.includes(target.targetId));
    assert(routeMessage.includes('distance')); // explicitly unavailable; no route values are fabricated

    const objectives = renderer.getMissionAwareContent(objectiveScreen);
    const objectiveCard = objectives.panels.find(panel => panel.id === 'active_objective').fallback;
    assert(objectiveCard.name.includes(target.name));
    assert(objectiveCard.description.includes(target.targetId));
    assert(objectiveCard.description.includes('physical drone inspection: complete'));
    assert(objectives.panels.find(panel => panel.id === 'objective_checklist').fallback.some(item => item.label.includes('Drone') && item.completed === true));

    const research = new ResearchScreenRenderer(researchConfig);
    research.missionDay = 4;
    research.missionState = state;
    const researchContent = research.getMissionAwareContent(researchScreen);
    const imageGallery = researchContent.panels.find(panel => panel.type === 'IMAGE_GALLERY');
    assert(researchContent.header.subtitle.includes(target.name));
    assert.deepStrictEqual(imageGallery.images.map(image => image.src).sort(), Object.values(target.images).sort());
    for (const image of imageGallery.images) assert(fs.existsSync(path.join(__dirname, '..', 'public', image.src.slice(1))), `Image should exist: ${image.src}`);
    const targetRow = researchContent.panels.find(panel => panel.type === 'DATA_TABLE').rows[0];
    assert(targetRow.record.includes(target.targetId));
    assert.strictEqual(targetRow.status, 'Official target');
    const workflow = researchContent.panels.find(panel => panel.type === 'WORKFLOW_GRAPH');
    assert(workflow.stages[1].includes('RECORDED'));
    assert(workflow.stages[2].includes('RECORDED'));
    assert(researchContent.panels.find(panel => panel.type === 'DATA_TABLE').rows.some(row => row.record === 'Sol 4 terrain assessment'));
    const unavailableStatus = researchContent.panels.find(panel => panel.type === 'HEALTH_GRID').subsystems;
    assert.strictEqual(unavailableStatus.find(item => item.name === 'Elevation / slope').status, 'UNAVAILABLE');
    assert(!imageGallery.images.some(image => Object.values(mission.targetCatalogue.find(candidate => candidate.targetId !== target.targetId).images).includes(image.src)));
  }

  const unresolved = new ResearchScreenRenderer(researchConfig);
  unresolved.missionDay = 4;
  unresolved.missionState = { currentDay: 4, selectedSiteId: mission.targetCatalogue[0].targetId, investigationRecords: [] };
  const unresolvedContent = unresolved.getMissionAwareContent(researchScreen);
  assert.deepStrictEqual(unresolvedContent.panels.find(panel => panel.type === 'IMAGE_GALLERY').images, [], 'A state ID without a submitted proposal must not select target imagery');
  assert.strictEqual(unresolvedContent.header.subtitle, 'Official Sol 3 target unavailable');
});

console.log('=== PHOBOSIA PHASE 2 & PHASE 3 AUTOMATED MISSION TESTS ===\n');

test('Mission progress counts unique mission tasks rather than saved steps from prior Sols', () => {
  const sol2 = getMissionTaskProgressFor(2, ['D1_HAB_LIFE_SUPPORT', 'SOL02_HABITAT_STATUS', 'SOL02_HABITAT_STATUS']);
  assert.deepStrictEqual(sol2, { completed: 1, total: 7, remaining: 6 });
  assert.deepStrictEqual(getMissionTaskProgressFor(3, []), { completed: 0, total: 6, remaining: 6 });
  assert.deepStrictEqual(getMissionTaskProgressFor(3, ['SOL03_MISSION_CONTEXT', 'SOL03_OBSERVATION_SITE_REVIEW']), { completed: 2, total: 6, remaining: 4 });
  assert.deepStrictEqual(getMissionTaskProgressFor(4, []), { completed: 0, total: 6, remaining: 6 });
  const sol4 = getMissionTaskProgressFor(4, ['SOL04_MISSION_CONTEXT']);
  assert.deepStrictEqual(sol4, { completed: 1, total: 6, remaining: 5 });
  const sol4Complete = getMissionTaskProgressFor(4, DAYS_CONFIG[4].steps.map(step => step.stepId));
  assert.deepStrictEqual(sol4Complete, { completed: 6, total: 6, remaining: 0 });
});

test('Sol 2 and Sol 3 navigation instructions cover required JSON tasks and keep player names free of implementation IDs', () => {
  for (const sol of [2, 3, 4]) {
    const mission = require(`../src/jsons/Missions/sol-0${sol}.json`);
    const navigation = require(`../src/jsons/Instructions/sol-0${sol}-navigation.json`);
    const requiredIds = mission.missionCompletion.requiredTasks;
    assert.deepStrictEqual(navigation.instructions.map(item => item.taskId).sort(), [...requiredIds].sort());
    const serializedPlayerContent = JSON.stringify(navigation.instructions.map(({ taskId, ...content }) => content));
    assert(!/(HAB_MONITOR_01|HAB_WATER_NUTRITION_01|Engineering_[A-Za-z_]+_Trigger|MC_[A-Z_]+_01|LAB_[A-Z_]+_01|_Display|Screen)/.test(serializedPlayerContent));
  }
});

test('Navigation selects the next available task, respects dependencies, and maps only validated runtime aliases', () => {
  const sol1Navigation = require('../src/jsons/Instructions/sol-01-navigation.json');
  assert.deepStrictEqual(
    sol1Navigation.instructions.map(item => item.taskId),
    DAY1_TASKS.filter(task => task.required).map(task => task.taskId),
    'Sol 1 demonstrations must have one instruction for every required task, in configured order'
  );
  const sol1Instruction = resolveNextMissionNavigation(1, []);
  assert.strictEqual(sol1Instruction.taskId, 'D1_HAB_LIFE_SUPPORT');
  assert.strictEqual(sol1Instruction.destinationName, 'Habitat Main Monitor');
  const droneInstruction = resolveNextMissionNavigation(1, DAY1_TASKS.filter(task => task.taskId !== 'D1_DRONE_SECTION').map(task => task.taskId));
  assert.strictEqual(droneInstruction.taskId, 'D1_DRONE_SECTION');
  assert.strictEqual(droneInstruction.destinationName, 'Drone Section');
  assert(droneInstruction.guidance.includes('physical entrance'));
  assert(droneInstruction.activity.includes('Press E'));
  const allSol1Tasks = DAY1_TASKS.filter(task => task.required).map(task => task.taskId);
  assert.strictEqual(resolveNextMissionNavigation(1, allSol1Tasks).isCompletion, true);

  assert.strictEqual(resolveNextMissionNavigation(2, []).taskId, 'SOL02_HABITAT_MAIN_STATUS');
  assert.strictEqual(resolveNextMissionNavigation(3, []).taskId, 'SOL03_MISSION_CONTEXT');
  assert.strictEqual(resolveNextMissionNavigation(3, ['SOL03_MISSION_CONTEXT']).taskId, 'SOL03_OBSERVATION_SITE_REVIEW');
  assert.strictEqual(resolveNextMissionNavigation(3, ['SOL03_MISSION_CONTEXT', 'SOL03_OBSERVATION_SITE_REVIEW']).taskId, 'SOL03_SYSTEM_CONSTRAINTS');
  assert.strictEqual(resolveNextMissionNavigation(3, ['SOL03_MISSION_CONTEXT', 'SOL03_OBSERVATION_SITE_REVIEW', 'SOL03_SYSTEM_CONSTRAINTS']).taskId, 'SOL03_SELECT_TARGET');
  assert.strictEqual(resolveNextMissionNavigation(3, ['SOL03_MISSION_CONTEXT', 'SOL03_OBSERVATION_SITE_REVIEW', 'SOL03_SYSTEM_CONSTRAINTS', 'SOL03_SELECT_TARGET']).taskId, 'SOL03_DATASET_ANALYSIS');
  assert.strictEqual(resolveNextMissionNavigation(3, ['SOL03_MISSION_CONTEXT', 'SOL03_OBSERVATION_SITE_REVIEW', 'SOL03_SYSTEM_CONSTRAINTS', 'SOL03_SELECT_TARGET', 'SOL03_SELECT_DATASET']).taskId, 'SOL03_SUBMIT_TARGET_PROPOSAL');
  assert.strictEqual(resolveNextMissionNavigation(3, ['SOL03_MISSION_CONTEXT', 'SOL03_OBSERVATION_SITE_REVIEW', 'SOL03_SYSTEM_CONSTRAINTS', 'SOL03_SELECT_TARGET', 'SOL03_SELECT_DATASET', 'SOL03_SUBMIT_TARGET_RECORD']).isCompletion, true);
  assert.strictEqual(resolveNextMissionNavigation(4, []).taskId, 'SOL04_MISSION_CONTEXT');
  assert.strictEqual(resolveNextMissionNavigation(4, ['SOL04_MISSION_CONTEXT']).taskId, 'SOL04_SELECTED_TARGET_INVESTIGATION');
  assert.strictEqual(resolveNextMissionNavigation(4, ['SOL04_MISSION_CONTEXT', 'SOL04_SELECTED_TARGET_INVESTIGATION']).taskId, 'SOL04_TERRAIN_DATA_REVIEW');
  assert.strictEqual(resolveNextMissionNavigation(4, ['SOL04_MISSION_CONTEXT', 'SOL04_SELECTED_TARGET_INVESTIGATION', 'SOL04_TERRAIN_DATA_REVIEW']).taskId, 'SOL04_DRONE_PHYSICAL_INSPECTION');
  assert.strictEqual(resolveNextMissionNavigation(4, ['SOL04_MISSION_CONTEXT', 'SOL04_SELECTED_TARGET_INVESTIGATION', 'SOL04_TERRAIN_DATA_REVIEW', 'SOL04_DRONE_PHYSICAL_INSPECTION']).taskId, 'SOL04_DRONE_MISSION_PLAN');
  assert.strictEqual(resolveNextMissionNavigation(4, ['SOL04_MISSION_CONTEXT', 'SOL04_SELECTED_TARGET_INVESTIGATION', 'SOL04_TERRAIN_DATA_REVIEW', 'SOL04_DRONE_PHYSICAL_INSPECTION', 'SOL04_DRONE_MISSION_PLAN']).taskId, 'SOL04_SUBMIT_PREPARATION_REPORT');
  assert.strictEqual(resolveNextMissionNavigation(4, ['SOL04_MISSION_CONTEXT', 'SOL04_SELECTED_TARGET_INVESTIGATION', 'SOL04_TERRAIN_DATA_REVIEW', 'SOL04_DRONE_PHYSICAL_INSPECTION', 'SOL04_DRONE_MISSION_PLAN', 'SOL04_SUBMIT_PREPARATION_REPORT']).isCompletion, true);
  assert(normalizeValidatedTaskIds(3, ['SOL03_SELECT_DATASET']).includes('SOL03_DATASET_ANALYSIS'));
  assert(normalizeValidatedTaskIds(4, ['SOL04_MISSION_CONTEXT']).includes('SOL04_MISSION_CONTEXT'), 'Sol 4 completion IDs must match their mission JSON IDs');
  assert(!normalizeValidatedTaskIds(4, ['SOL04_MISSION_CONTEXT']).includes('MC_MAIN_01'), 'Physical trigger IDs must not replace Sol 4 task IDs');
  assert.strictEqual(resolveNextMissionNavigation(2, ['SOL02_HABITAT_STATUS']).taskId, 'SOL02_WATER_NUTRITION', 'The combined Habitat review must advance directly to the next real Sol 2 task');
  assert.strictEqual(resolveNextMissionNavigation(2, ['SOL02_HABITAT_STATUS', 'SOL02_WATER_NUTRITION']).taskId, 'SOL02_ENGINEERING_MONITORING');
  const runtimeSol2Complete = ['SOL02_HABITAT_STATUS', 'SOL02_WATER_NUTRITION', 'SOL02_ENGINEERING_MONITORING', 'SOL02_POWER_REVIEW', 'SOL02_ENGINEERING_LIFESUPPORT', 'SOL02_DIAGNOSTICS', 'SOL02_READINESS_ASSESSMENT'];
  assert.strictEqual(resolveNextMissionNavigation(2, runtimeSol2Complete).isCompletion, true);
});

test('A newly validated Sol 2 task refreshes the existing mission notification once; duplicates do not repeat it', () => {
  mockStorage.clear();
  mockStorage.set('phobosia_mission_progress_v4', JSON.stringify({ currentDay: 2, completedStepIds: [], completedIntroductionIds: [], investigationRecords: [] }));
  const mm = new MissionManager();
  assert.strictEqual(mm.completeStep('SOL02_HABITAT_STATUS'), true);
  const next = mm.getState().notification;
  assert(next && next.includes('Habitat Water and Nutrition Station'));
  assert.strictEqual(mm.getCurrentNavigationInstruction().taskId, 'SOL02_WATER_NUTRITION');
  assert.strictEqual(mm.completeStep('SOL02_HABITAT_STATUS'), false);
  assert.strictEqual(mm.getState().notification, next);
});

// P2-001: Initial State
test('Initial state is Day 1 with in_progress status', () => {
  mockStorage.clear();
  const mm = new MissionManager();
  const state = mm.getState();
  assert.strictEqual(state.currentDay, 1);
  assert.strictEqual(state.objectiveState, 'in_progress');
  assert.strictEqual(state.completedStepIds.length, 0);
  assert.strictEqual(state.observationRecords.length, 0);
  assert.strictEqual(state.selectedRouteTarget, null);
});

// P2-002: Incomplete rest block
test('Rest is blocked when Day 1 objective is incomplete', () => {
  mockStorage.clear();
  const mm = new MissionManager();
  const check = mm.canRestAndAdvance();
  assert.strictEqual(check.canAdvance, false);
  assert(check.reason.includes('incomplete'));
  const adv = mm.advanceDay();
  assert.strictEqual(adv.success, false);
  assert.strictEqual(mm.getState().currentDay, 1);
});

// P2-003: Step tracking & duplicate idempotency
test('Step completion is tracked and idempotent against duplicate events', () => {
  mockStorage.clear();
  const mm = new MissionManager();
  
  const res1 = mm.completeStep('DAY1_REVIEW_CONTROLS');
  assert.strictEqual(res1, true);
  assert.strictEqual(mm.getState().completedStepIds.length, 1);
  
  const res2 = mm.completeStep('DAY1_REVIEW_CONTROLS');
  assert.strictEqual(res2, false);
  assert.strictEqual(mm.getState().completedStepIds.length, 1);
});

// P2-004: Complete Day 1 and advance
test('Day 1 completes when all steps are validated, and rest advances to Day 2 exactly once', () => {
  mockStorage.clear();
  const mm = new MissionManager();
  
  mm.completeStep('DAY1_REVIEW_CONTROLS');
  mm.completeStep('DAY1_VISIT_CENTRAL_HUB');
  mm.completeStep('DAY1_INSPECT_BASE_AREAS');
  mm.completeStep('DAY1_CONFIRM_ORIENTATION', {
    type: 'orientation',
    summary: 'Orientation status verified.'
  });

  const state = mm.getState();
  assert.strictEqual(state.objectiveState, 'completed');
  assert.strictEqual(state.observationRecords.length, 1);

  const check = mm.canRestAndAdvance();
  assert.strictEqual(check.canAdvance, true);

  const adv = mm.advanceDay();
  assert.strictEqual(adv.success, true);
  assert.strictEqual(adv.newDay, 2);
  assert.strictEqual(mm.getState().currentDay, 2);
  assert.strictEqual(mm.getState().objectiveState, 'in_progress');
});

// P2-005: Repeated rest calls cannot skip days
test('Repeated rest input cannot skip a day', () => {
  mockStorage.clear();
  const mm = new MissionManager();
  
  mm.completeStep('DAY1_REVIEW_CONTROLS');
  mm.completeStep('DAY1_VISIT_CENTRAL_HUB');
  mm.completeStep('DAY1_INSPECT_BASE_AREAS');
  mm.completeStep('DAY1_CONFIRM_ORIENTATION');

  const adv1 = mm.advanceDay();
  assert.strictEqual(adv1.success, true);
  assert.strictEqual(mm.getState().currentDay, 2);

  const adv2 = mm.advanceDay();
  assert.strictEqual(adv2.success, false);
  assert.strictEqual(mm.getState().currentDay, 2);
});

// Sol 2 interactive investigation lifecycle
test('Sol 2 requires six evidence-linked inspections and a readiness assessment', () => {
  mockStorage.clear();
  const mm = new MissionManager();
  mm.completeStep('DAY1_REVIEW_CONTROLS');
  mm.completeStep('DAY1_VISIT_CENTRAL_HUB');
  mm.completeStep('DAY1_INSPECT_BASE_AREAS');
  mm.completeStep('DAY1_CONFIRM_ORIENTATION');
  mm.advanceDay(true);

  assert.strictEqual(mm.getState().currentDay, 2);
  mm.handleContextEvent({ type: 'trigger_interacted', identifier: 'HAB_WATER_NUTRITION_01' });
  assert.strictEqual(mm.isStepComplete('SOL02_WATER_NUTRITION'), false, 'opening an interaction cannot complete an investigation');
  assert.strictEqual(mm.canRestAndAdvance().canAdvance, false);
  completeSol2(mm);
  assert.strictEqual(mm.getState().objectiveState, 'completed');
  assert.strictEqual(mm.getInvestigationRecords().length, 7);

  const adv = mm.advanceDay(true);
  assert.strictEqual(adv.success, true);
  assert.strictEqual(mm.getState().currentDay, 3);
});

// Sol 3 interactive proposal lifecycle
test('Sol 3 requires reviewed context, valid target and dataset references, and a final proposal', () => {
  mockStorage.clear();
  const mm = new MissionManager();
  mm.completeStep('DAY1_REVIEW_CONTROLS');
  mm.completeStep('DAY1_VISIT_CENTRAL_HUB');
  mm.completeStep('DAY1_INSPECT_BASE_AREAS');
  mm.completeStep('DAY1_CONFIRM_ORIENTATION');
  mm.advanceDay(true);
  completeSol2(mm);
  mm.advanceDay(true);

  assert.strictEqual(mm.getState().currentDay, 3);
  assert.strictEqual(mm.submitInvestigation({ taskId: 'SOL03_SUBMIT_TARGET_RECORD', evidenceReferences: [], classification: 'proposal', rationale: 'Attempt proposal.', procedureChecks: [], selectedTargetId: 'missing', datasetId: 'missing', scientificQuestion: 'What should be observed?' }).success, false);
  completeSol3(mm);
  assert.strictEqual(mm.getState().objectiveState, 'completed');
  assert(mm.getInvestigationRecords().some(record => record.taskId === 'SOL03_SUBMIT_TARGET_RECORD'));

  const adv = mm.advanceDay(true);
  assert.strictEqual(adv.success, true);
  assert.strictEqual(mm.getState().currentDay, 4);
});

// Sol 4: Selected target investigation, physical drone inspection, preparation report, progression
test('Sol 4 requires the Sol 3 target, physical drone inspection, and a valid preparation report before Sol 5', () => {
  mockStorage.clear();
  const mm = new MissionManager();
  mm.completeStep('DAY1_REVIEW_CONTROLS');
  mm.completeStep('DAY1_VISIT_CENTRAL_HUB');
  mm.completeStep('DAY1_INSPECT_BASE_AREAS');
  mm.completeStep('DAY1_CONFIRM_ORIENTATION');
  mm.advanceDay(true);
  completeSol2(mm);
  mm.advanceDay(true);
  completeSol3(mm);
  mm.advanceDay(true);

  assert.strictEqual(mm.getState().currentDay, 4);
  const selected = mm.getSelectedSiteId();
  assert.strictEqual(selected, MASTER_TERRAIN_TARGETS[0].id);
  assert.strictEqual(mm.canRestAndAdvance().canAdvance, false);
  completeSol4(mm);
  assert.strictEqual(mm.getState().objectiveState, 'completed');
  assert(mm.getInvestigationRecords().some(record => record.taskId === 'SOL04_DRONE_PHYSICAL_INSPECTION'));
  assert(mm.getInvestigationRecords().some(record => record.taskId === 'SOL04_SUBMIT_PREPARATION_REPORT'));

  const adv = mm.advanceDay(true);
  assert.strictEqual(adv.success, true);
  assert.strictEqual(mm.getState().currentDay, 5);
});

// Sol 5: Official-target manual reconnaissance, prepared evidence, landing, and report gates.
test('Sol 5 requires the official Sol 3 target and validates inspection, prepared evidence, landing, review, and report for A/B/C', () => {
  for (const target of MASTER_TERRAIN_TARGETS) {
    mockStorage.clear();
    let mm = new MissionManager();
    mm.completeStep('DAY1_REVIEW_CONTROLS');
    mm.completeStep('DAY1_VISIT_CENTRAL_HUB');
    mm.completeStep('DAY1_INSPECT_BASE_AREAS');
    mm.completeStep('DAY1_CONFIRM_ORIENTATION');
    mm.advanceDay(true);
    completeSol2(mm);
    mm.advanceDay(true);
    completeSol3(mm, target.id);
    mm.advanceDay(true);
    completeSol4(mm);
    mm.advanceDay(true);
    assert.strictEqual(mm.getState().currentDay, 5);
    assert.strictEqual(mm.getSelectedSiteId(), target.id);
    assert.strictEqual(mm.getMissionTaskProgress().total, 6);
    assert.strictEqual(resolveNextMissionNavigation(5, []).taskId, 'SOL05_PREFLIGHT_BRIEFING');
    assert.strictEqual(mm.startSol5Simulation().success, false, 'Simulation cannot bypass the briefing confirmation');
    assert.strictEqual(mm.canRestAndAdvance().canAdvance, false, 'Flight and report must remain incomplete');
    assert.strictEqual(mm.confirmSol5Briefing().success, true);
    assert.strictEqual(resolveNextMissionNavigation(5, mm.getState().completedStepIds).taskId, 'SOL05_ACTIVATE_SIMULATION');
    assert.strictEqual(mm.startSol5Simulation().success, true);
    const { SOL5_EVIDENCE_ASSETS } = require('../dist/missions/sol-05/targetMapping.js');
    assert.strictEqual(mm.completeStep('SOL05_AERIAL_RECONNAISSANCE'), false, 'Target survey cannot be completed before arrival and inspection');
    assert.strictEqual(mm.completeSol5TargetInspection('WRONG_TARGET', SOL5_EVIDENCE_ASSETS[target.id]).success, false, 'Inspection must remain linked to official target');
    assert.strictEqual(mm.completeSol5TargetInspection(target.id, []).success, false, 'Missing evidence must not be replaced by another target');
    assert.strictEqual(mm.getSol5Progress().targetInspected, false);
    let resumeSnapshot = { targetId: target.id, status: 'flying', takeoff: { x: 2, y: 3, z: 4 },
      position: { x: 5, y: 6, z: 7 }, elapsedSeconds: 12, totalDistanceM: 19, maxAltitudeAglM: 4,
      speedMps: 1, batteryPercent: 88, signalPercent: 96, cameraView: 'down', landed: false };
    assert.strictEqual(mm.saveSol5FlightSnapshot(resumeSnapshot), true);
    mm = new MissionManager();
    assert.strictEqual(mm.getSol5Progress().attemptStatus, 'aborted', 'An active persisted attempt is recovered as aborted');
    assert.strictEqual(mm.getSol5Progress().simulationActivated, false, 'Restart returns to the activation stage');
    assert.strictEqual(mm.getSol5Progress().flight, null, 'Aborted mid-flight coordinates are cleared');
    assert.strictEqual(mm.getSelectedSiteId(), target.id, 'Recovery preserves the authoritative Sol 3 target');
    assert.strictEqual(mm.isStepComplete('SOL05_PREFLIGHT_BRIEFING'), true, 'Completed briefing remains complete');
    assert.strictEqual(mm.isStepComplete('SOL05_ACTIVATE_SIMULATION'), false, 'Activation must be performed again');
    assert.strictEqual(resolveNextMissionNavigation(5, mm.getState().completedStepIds).taskId, 'SOL05_ACTIVATE_SIMULATION');
    assert.strictEqual(mm.completeStep('SOL05_SAFE_LANDING'), false, 'Landing cannot be skipped after an abort');

    assert.strictEqual(mm.startSol5Simulation().success, true, 'A new attempt can be activated from Mission Control');
    assert.strictEqual(mm.markSol5TargetReached(target.id), true);
    assert.strictEqual(mm.saveSol5FlightSnapshot(resumeSnapshot), true);
    assert.strictEqual(mm.abortSol5SimulationAttempt(), true, 'Manual abandonment persists an aborted attempt');
    assert.strictEqual(mm.getSol5Progress().targetReached, false);
    assert.strictEqual(mm.getSol5Progress().targetInspected, false);
    assert.strictEqual(mm.getSelectedSiteId(), target.id);

    assert.strictEqual(mm.startSol5Simulation().success, true, 'Retry starts a fresh attempt');
    assert.strictEqual(mm.getSol5Progress().flight, null, 'Retry does not resume previous mid-air coordinates');
    assert.strictEqual(mm.markSol5TargetReached(target.id), true, 'The canonical target must be reached again');
    resumeSnapshot = { ...resumeSnapshot, position: { ...resumeSnapshot.takeoff }, speedMps: 0.2 };
    assert.strictEqual(mm.saveSol5FlightSnapshot(resumeSnapshot), true);
    assert.strictEqual(mm.completeSol5TargetInspection(target.id, SOL5_EVIDENCE_ASSETS[target.id]).success, true, 'Target inspection succeeds only after target approach and correct evidence');
    assert.strictEqual(mm.completeSol5Landing({ ...resumeSnapshot, status: 'landed', position: { ...resumeSnapshot.takeoff }, speedMps: 0, landed: true }, true).success, true);
    assert.strictEqual(mm.getSol5Progress().attemptStatus, 'completed');
    const landedReload = new MissionManager();
    assert.strictEqual(landedReload.getSol5Progress().attemptStatus, 'completed', 'Successful landing survives reload without becoming aborted');
    assert.strictEqual(landedReload.startSol5Simulation().success, false, 'Completed attempt does not restart');
    assert.strictEqual(landedReload.getSelectedSiteId(), target.id);

    const review = mm.confirmSol5ImageReview();
    assert.strictEqual(review.success, true, review.message);
    const report = mm.submitSol5Report({ observedFeatures: 'Visible tonal variation in image frames.',
      playerInterpretation: 'Possible surface texture differences; tentative.', uncertainties: 'Scale and feature identity remain uncertain.',
      groundFollowUp: 'Verify the apparent texture from the ground during Sol 6.' });
    assert.strictEqual(report.success, true, report.message);
    assert.strictEqual(mm.getState().sol5.report.targetId, target.id);
    assert(mm.getState().sol5.images.every(image => image.targetId === target.id));
    assert.strictEqual(mm.getMissionTaskProgress().completed, 6);
    assert.strictEqual(mm.getMissionTaskProgress().remaining, 0);
    assert.strictEqual(mm.canRestAndAdvance().canAdvance, true);
    assert.strictEqual(resolveNextMissionNavigation(5, mm.getState().completedStepIds).isCompletion, true);
    assert.strictEqual(mm.advanceDay(true).success, true, 'Validated Sol 5 may advance using the existing progression system');
    assert.strictEqual(mm.getSelectedSiteId(), target.id, 'The official target remains unchanged after transition');
    assert(mm.getSol5Progress().images.every(image => image.targetId === target.id), 'Target-specific evidence remains available for Sol 6');
  }
});
// P3-002: Sol 6 requires validated target, field records, sample, lab chain and report.
test('Sol 6 validates its target-dependent field, sample, analysis, cultivation and report workflow', () => {
  mockStorage.clear();
  let mm = new MissionManager();
  // Fast forward to Day 6
  mm.completeStep('DAY1_REVIEW_CONTROLS');
  mm.completeStep('DAY1_VISIT_CENTRAL_HUB');
  mm.completeStep('DAY1_INSPECT_BASE_AREAS');
  mm.completeStep('DAY1_CONFIRM_ORIENTATION');
  mm.advanceDay(true);
  completeSol2(mm);
  mm.advanceDay(true);
  completeSol3(mm);
  mm.advanceDay(true);
  completeSol4(mm);
  mm.advanceDay(true);
  mm = completeSol5(mm);
  mm.advanceDay(true);

  assert.strictEqual(mm.getState().currentDay, 6);

  assert.deepStrictEqual(mm.getMissionTaskProgress(), { completed: 0, total: 12, remaining: 12 });
  assert.strictEqual(mm.getCurrentNavigationInstruction().taskId, 'SOL06_REVIEW_MISSION_BRIEFING');
  const sol6Mission = require('../src/jsons/Missions/sol-06.json');
  const sol6Navigation = require('../src/jsons/Instructions/sol-06-navigation.json');
  assert.deepStrictEqual(sol6Mission.tasks.map(task => task.taskId), sol6Mission.missionCompletion.requiredTasks, 'Sol 6 task list matches its mandatory completion sequence');
  assert.deepStrictEqual(sol6Navigation.instructions.map(task => task.taskId), sol6Mission.missionCompletion.requiredTasks, 'Sol 6 instructions cover the task list in the same order');
  assert.strictEqual(mm.completeStep('SOL06_REVIEW_MISSION_BRIEFING'), false, 'Generic task completion cannot bypass Sol 6 validation');
  assert.strictEqual(mm.confirmSol6Briefing().success, true, 'Briefing resolves the canonical Sol 3 target and matching Sol 4/5 records');
  assert.strictEqual(mm.getCurrentNavigationInstruction().taskId, 'SOL06_PREPARE_FIELD_EQUIPMENT');
  assert.strictEqual(mm.markSol6TargetReached(MASTER_TERRAIN_TARGETS[1].id), false, 'A different target cannot satisfy field arrival');
  assert.strictEqual(mm.canRestAndAdvance().canAdvance, false, 'Rest is blocked before the report and sample workflow');
  mm = completeSol6(mm);
  assert.strictEqual(mm.getMissionTaskProgress().completed, 12);
  assert.strictEqual(mm.getState().sol6.sample.targetId, mm.getSelectedSiteId());
  assert.strictEqual(mm.getState().sol6.sample.transferred, true);
  assert.strictEqual(mm.getState().sol6.analysis.sampleId, mm.getState().sol6.sample.sampleId);
  assert.strictEqual(mm.getState().sol6.cultivation.status, 'IN_PROGRESS');
  assert.strictEqual(mm.getState().sol6.cultivation.result, null, 'No cultivation result is generated during Sol 6');
  assert.strictEqual(mm.getState().sol6.report.targetId, mm.getSelectedSiteId());
  assert.strictEqual(mm.getCurrentNavigationInstruction().isCompletion, true);
  const reloaded = new MissionManager();
  assert.strictEqual(reloaded.getSelectedSiteId(), mm.getSelectedSiteId(), 'Official target persists during Sol 6');
  assert.strictEqual(reloaded.getSol6Progress().sample.sampleId, mm.getSol6Progress().sample.sampleId, 'Sample identity persists across reload');
  assert.strictEqual(reloaded.getSol6Progress().cultivation.result, null, 'Pending experiment remains pending after reload');
  assert.strictEqual(reloaded.getSol6Progress().report.sampleId, mm.getSol6Progress().report.sampleId, 'Report remains linked to its saved sample');
  assert.strictEqual(mm.canRestAndAdvance().canAdvance, true);
  const adv = mm.advanceDay(true);
  assert.strictEqual(adv.success, true);
  assert.strictEqual(adv.newDay, 7);
});

/* Legacy Sol 6 entry points are no longer sufficient for mission completion. */
test('Sol 6 rejects direct generic task completion when no validated Sol 3 target exists', () => {
  mockStorage.clear();
  const mm = new MissionManager();
  assert.strictEqual(mm.completeStep('SOL06_REVIEW_MISSION_BRIEFING'), false);
  assert.strictEqual(mm.getSol6Progress().report, null);
});

/*
  assert.strictEqual(mm.canRestAndAdvance().canAdvance, false);

  // Save Geological Survey Record
  const geoRecord = mm.saveGeologicalSurvey({
    targetId: 'TARGET_ALPHA_CRATER_RIM',
    observedCategories: {
      surfaceTexture: 'Vesicular Basalt & Fractured Regolith',
      fragmentDistribution: 'Scattered Angular Clasts (< 5 cm)',
      terrainShape: 'Low-Angle Talus Incline (8â€“12Â°)',
      dustCoverage: 'Thin Mantle (< 2 mm) with High Rock Exposure'
    },
    summary: 'Preliminary field survey at Crater Rim.'
  });

  assert(geoRecord !== null);
  assert.strictEqual(geoRecord.isSimulated, true);
  assert.strictEqual(geoRecord.day, 6);
  assert.strictEqual(mm.isStepComplete('D6_OBJ_03_INSPECT_SURFACE'), true);
  assert.strictEqual(mm.isStepComplete('D6_OBJ_04_SAVE_RECORD'), true);
  assert.strictEqual(mm.getState().objectiveState, 'completed');

  // Now rest is permitted and advances to Day 7
  const adv = mm.advanceDay(true);
  assert.strictEqual(adv.success, true);
  assert.strictEqual(adv.newDay, 7);
  assert.strictEqual(mm.getState().currentDay, 7);
});
*/

// P3-003: Sol 7 Dust Storm lifecycle
test('Sol 7 Dust Storm validates ordered assessments, EVA lockdown and final report without advancing Sol 8', () => {
  mockStorage.clear();
  let mm = new MissionManager();
  // Fast forward to Day 7
  mm.completeStep('DAY1_REVIEW_CONTROLS');
  mm.completeStep('DAY1_VISIT_CENTRAL_HUB');
  mm.completeStep('DAY1_INSPECT_BASE_AREAS');
  mm.completeStep('DAY1_CONFIRM_ORIENTATION');
  mm.advanceDay(true);
  completeSol2(mm);
  mm.advanceDay(true);
  completeSol3(mm);
  mm.advanceDay(true);
  completeSol4(mm);
  mm.advanceDay(true);
  mm = completeSol5(mm);
  mm.advanceDay(true);
  completeSol6(mm);
  mm.advanceDay(true); // to Day 7

  assert.strictEqual(mm.getState().currentDay, 7);

  assert.strictEqual(mm.canRestAndAdvance().canAdvance, false);
  assert.strictEqual(mm.submitSol7Report().success, false);
  completeSol7(mm);
  assert.strictEqual(mm.getSol7Progress().report.validated, true);
  assert.strictEqual(mm.getSol7Progress().stormEnded, true);
  assert.ok(mm.getSol7PostStormPowerAssessment());
  assert.strictEqual(mm.getState().objectiveState, 'completed');

  // The report itself must not advance to Sol 8; only the existing rest flow can do that.
  assert.strictEqual(mm.getState().currentDay, 7);
  const adv = mm.advanceDay(true);
  assert.strictEqual(adv.success, true);
  assert.strictEqual(adv.newDay, 8);
});

// P3-004: Day 8 Research Lab Analysis requires a Day 7 source record & interpretation
test('Day 8 Research Lab Analysis strictly requires a Day 7 test fixture and saves linked analysis', () => {
  mockStorage.clear();
  let mm = new MissionManager();
  // Fast forward through Days 1 to 7
  mm.completeStep('DAY1_REVIEW_CONTROLS');
  mm.completeStep('DAY1_VISIT_CENTRAL_HUB');
  mm.completeStep('DAY1_INSPECT_BASE_AREAS');
  mm.completeStep('DAY1_CONFIRM_ORIENTATION');
  mm.advanceDay(true);
  completeSol2(mm);
  mm.advanceDay(true);
  completeSol3(mm);
  mm.advanceDay(true);
  completeSol4(mm);
  mm.advanceDay(true);
  mm = completeSol5(mm);
  mm.advanceDay(true);
  const completedDay6 = completeSol6(mm);
  const d6Record = completedDay6.getState().geologicalSurvey;
  mm.advanceDay(true);
  completeSol7(mm);
  mm.advanceDay(true);
  seedSol7SurfacePrerequisiteForSol8Test(mm);
  const d7Record = mm.getState().surfaceObservation;

  assert.strictEqual(mm.getState().currentDay, 8);

  // Access Research Lab console
  mm.handleContextEvent({ type: 'trigger_interacted', identifier: 'LAB_RESEARCH_ANALYSIS_01' });
  assert.strictEqual(mm.isStepComplete('D8_OBJ_01_OPEN_SOURCE_RECORD'), true);
  assert.strictEqual(mm.isStepComplete('D8_OBJ_02_REVIEW_COMPARISON'), true);

  const badAnalysis = mm.saveScienceAnalysis({ selectedInterpretationId: 'NON_EXISTENT_INTERPRETATION', summary: 'Bad interpretation' });
  assert.strictEqual(badAnalysis, null);
  assert.strictEqual(mm.isStepComplete('D8_OBJ_04_SAVE_ANALYSIS'), false);
  const goodAnalysis = mm.saveScienceAnalysis({ selectedInterpretationId: 'INTERPRETATION_SURFACE_PATTERN_REVIEW', summary: 'Tentative observation analysis.' });
  assert(goodAnalysis !== null);
  assert.strictEqual(goodAnalysis.day, 8);
  assert.strictEqual(goodAnalysis.sourceObservationId, d7Record.id);
  assert.strictEqual(goodAnalysis.comparedSurveyId, d6Record.id);
  assert.strictEqual(goodAnalysis.isSimulated, true);
  assert.strictEqual(mm.isStepComplete('D8_OBJ_03_SELECT_INTERPRETATION'), true);
  assert.strictEqual(mm.isStepComplete('D8_OBJ_04_SAVE_ANALYSIS'), true);
  assert.strictEqual(mm.getState().objectiveState, 'completed');
  const adv = mm.advanceDay(true);
  assert.strictEqual(adv.success, true);
  assert.strictEqual(adv.newDay, 9);
  assert.strictEqual(mm.getState().currentDay, 9);
});

// P3-005: Sol 9 cultivation and water recovery lifecycle
test('Sol 9 starts after Sol 8 recovery and uses the cultivation and water assessment tasks', () => {
  mockStorage.clear();
  mockStorage.set('phobosia_mission_progress_v4', JSON.stringify({
    currentDay: 9,
    objectiveState: 'in_progress',
    completedStepIds: [],
    completedIntroductionIds: [],
    observationRecords: [],
    selectedRouteTarget: null,
    dayBriefingSeen: true,
    campaignFinished: false,
    sol8: { started: true, powerFailureActive: false, communicationFailureActive: false, report: { validated: true, submittedAt: new Date().toISOString(), sections: {} } },
    sol9: { started: true }
  }));
  const mm = new MissionManager();
  assert.strictEqual(mm.getState().currentDay, 9);

  // Legacy Day 9 drone interactions must not complete or replace Sol 9 tasks.
  mm.handleContextEvent({ type: 'trigger_interacted', identifier: 'MC_SYSTEMS_01' });
  assert.strictEqual(mm.isStepComplete('SOL09_TASK_01'), false);
  assert.strictEqual(mm.isStepComplete('SOL09_TASK_02'), false);
  assert.strictEqual(mm.getSol09Progress().started, true);
  assert.strictEqual(mm.canRestAndAdvance().canAdvance, false);
  assert.strictEqual(mm.advanceDay().success, false);
  assert.strictEqual(mm.getState().currentDay, 9);
});
// --- STABILIZATION MILESTONE TESTS ---

test('STAB-001: reprojectPlanarUVs correctly computes normalized UVs across mesh bounds', () => {
  const geom = new THREE.PlaneGeometry(2, 1);
  const result = reprojectPlanarUVs(geom);
  assert(result.width >= 1.99 && result.width <= 2.01);
  assert(result.height >= 0.99 && result.height <= 1.01);

  const uvAttr = geom.attributes.uv;
  assert(uvAttr !== undefined);
  assert.strictEqual(uvAttr.count, 4);

  // Check UV range clamp
  for (let i = 0; i < uvAttr.count; i++) {
    const u = uvAttr.getX(i);
    const v = uvAttr.getY(i);
    assert(u >= 0 && u <= 1);
    assert(v >= 0 && v <= 1);
  }
});

test('STAB-002: buildScienceLabColliders skips Collider.010 and Collider.011 at entrance corridor', () => {
  const root = new THREE.Group();

  const c1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  c1.name = 'Collider.001';
  root.add(c1);

  const c10 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  c10.name = 'Collider.010'; // entrance blocker
  root.add(c10);

  const c11 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  c11.name = 'Collider.011'; // entrance blocker
  root.add(c11);

  const c15 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  c15.name = 'Collider.015';
  root.add(c15);

  const colliders = buildScienceLabColliders(root);
  assert.strictEqual(colliders.length, 2); // Only c1 and c15 included
});

test('STAB-004: buildScienceLabColliders builds Collider_Section01 and sets visibility to false', () => {
  const root = new THREE.Group();
  const c = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  c.name = 'Collider_Section01';
  c.visible = true;
  root.add(c);

  const colliders = buildScienceLabColliders(root);
  assert(colliders.length > 0, 'Should generate bounding boxes from Collider_Section01');
  assert.strictEqual(c.visible, false, 'Collider_Section01 mesh must have visible = false');
});

test('STAB-005: buildHabitatColliderSection builds Collider_Section and sets visibility to false', () => {
  const root = new THREE.Group();
  const grp = new THREE.Group();
  grp.name = 'Collider_Section';
  grp.visible = true;

  const m1 = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  m1.name = 'Cube035';
  m1.visible = true;
  grp.add(m1);

  const m2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  m2.name = 'Collider_Section_01';
  m2.visible = true;

  root.add(grp);
  root.add(m2);

  const colliders = buildHabitatColliderSection(root);
  assert(colliders.length > 0, 'Should generate bounding boxes from Collider_Section');
  assert.strictEqual(grp.visible, false, 'Collider_Section group must have visible = false');
  assert.strictEqual(m1.visible, false, 'Child mesh must have visible = false');
  assert.strictEqual(m2.visible, false, 'Collider_Section_01 mesh must have visible = false');
});

test('STAB-007: Drone Section collision retains barriers outside a clear entrance-to-drone walkway', () => {
  const root = new THREE.Group();
  const colliderSection = new THREE.Group();
  colliderSection.name = 'Collider_Section02';
  const walkwayWall = new THREE.Mesh(new THREE.BoxGeometry(3, 0.01, 1));
  walkwayWall.position.set(-2, 0, 0);
  const sideWall = new THREE.Mesh(new THREE.BoxGeometry(2, 0.01, 2));
  sideWall.position.set(8, 0, 5);
  colliderSection.add(walkwayWall, sideWall);
  root.add(colliderSection);
  const entrance = new THREE.Object3D();
  entrance.name = 'DroneZone_Entrance_Trigger';
  const drone = new THREE.Object3D();
  drone.name = 'Drone';
  drone.position.set(-5, 0, 0);
  root.add(entrance, drone);

  const colliders = buildDroneSectionColliders(root);
  assert.strictEqual(colliders.length, 1, 'Only the proxy blocking the entrance-to-drone route should be cleared');
  assert(colliders[0].getCenter(new THREE.Vector3()).x > 7, 'Unrelated side-wall collision must remain');
});

test('STAB-008: Drone movement uses the authored walkable floor height', () => {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.264;
  assert(Math.abs(getSurfaceHeight(floor) - (-2.264)) < 0.001, 'World floor height should match the model instead of assuming y=0');
});

test('STAB-003: ScreenRenderer correctly matches screen identifiers across all outpost modules', () => {
  const sr = new ScreenRenderer();

  // Habitat
  assert.strictEqual(sr.matchScreenType('Habitat', 'Habitat_Workstation_Display'), 'habitat_workstation');
  assert.strictEqual(sr.matchScreenType('Habitat', 'Habitat_Main_Status_Display'), 'habitat_main');
  assert.strictEqual(sr.matchScreenType('Habitat', 'Habitat_LifeSupport_Display'), 'habitat_lifesupport');

  // Mission Control
  assert.strictEqual(sr.matchScreenType('MissionControl', 'MissionControl_TerrainMapScreen'), 'mc_terrain_map');
  assert.strictEqual(sr.matchScreenType('MissionControl', 'MissionControl_ObjectivesScreen'), 'mc_objectives');
  assert.strictEqual(sr.matchScreenType('MissionControl', 'MissionControl_DroneOperationScreen'), 'mc_drone');

  // Engineering
  assert.strictEqual(sr.matchScreenType('Engineering', 'PowerUnitScreenMain'), 'eng_power');
  assert.strictEqual(sr.matchScreenType('Engineering', 'LifeSupportUnitScreen'), 'eng_lifesupport');

  // Science
  assert.strictEqual(sr.matchScreenType('Science', 'ResearchMonitoring_MainScreen'), 'science_main');
  assert.strictEqual(sr.matchScreenType('Science', 'ResearchMonitoring_AnalysisScreen'), 'science_analysis');

  // Airlock & Hub
  assert.strictEqual(sr.matchScreenType('Airlock', 'Airlock_Control_Console'), 'airlock_console');
  assert.strictEqual(sr.matchScreenType('Hub', 'Env_Status_Display'), 'hub_env');
});

test('LIGHT-001: configureModuleLighting creates shadow-casting Sun for Terrain covering base', () => {
  const root = new THREE.Group();
  const additions = new THREE.Group();
  root.add(additions);
  const sunReference = new THREE.Object3D();
  sunReference.name = 'Sun_Object';
  sunReference.position.set(0, 60, 40);
  root.add(sunReference);
  const terrain = new THREE.Mesh(new THREE.BoxGeometry(800, 1, 800), new THREE.MeshStandardMaterial());
  terrain.name = 'PHOBOSIA_MarsTerrain_2km';
  terrain.position.y = -0.5;
  root.add(terrain);
  const habitat = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 10), new THREE.MeshStandardMaterial());
  habitat.position.set(2, 4, -3);
  root.add(habitat);
  configureModuleLighting(root, additions, 'Terrain');

  const sun = root.getObjectByName('MarsSun_DirectionalLight');
  assert(sun, 'MarsSun_DirectionalLight should exist');
  assert.strictEqual(sun.isDirectionalLight, true);
  assert.strictEqual(sun.castShadow, true);
  assert.strictEqual(sun.shadow.mapSize.width, 1024);
  assert.strictEqual(sun.shadow.mapSize.height, 1024);
  assert(sun.target, 'Sun must have a target');
  const target = sun.target.getWorldPosition(new THREE.Vector3());
  assert(Math.abs(target.x - habitat.position.x) < 0.01, 'Sun target should align with the outpost bounds');
  assert(Math.abs(target.y) < 0.01, 'Sun target should use the sampled terrain surface');
  assert(sun.shadow.camera.right > 0 && sun.shadow.camera.right < 100, 'Shadow bounds should cover the outpost without fitting the full 2 km terrain');
  assert(sun.shadow.camera.left < 0 && sun.shadow.camera.top > 0 && sun.shadow.camera.bottom < 0);
});

test('LIGHT-002: configureModuleLighting creates key shadow-casting SpotLights for indoor modules', () => {
  const modules = ['Habitat', 'Hub', 'MissionControl', 'Science', 'Engineering', 'Airlock', 'Drone'];

  for (const mod of modules) {
    const root = new THREE.Group();
    const additions = new THREE.Group();
    configureModuleLighting(root, additions, mod);

    const spots = additions.children.filter(c => c.isSpotLight);
    assert(spots.length >= 1, `${mod} must have at least one key SpotLight`);
    for (const spot of spots) {
      assert.strictEqual(spot.castShadow, true, `${spot.name} in ${mod} must cast shadows`);
      assert.strictEqual(spot.shadow.mapSize.width, 1024);
      assert(spot.target, `${spot.name} must have a designated target`);
    }
  }
  const droneRoot = new THREE.Group();
  const droneFloorMaterial = new THREE.MeshStandardMaterial();
  droneFloorMaterial.name = 'Floor';
  const droneFloor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), droneFloorMaterial);
  droneFloor.name = 'Floor';
  droneRoot.add(droneFloor);
  const droneLights = new THREE.Group();
  configureModuleLighting(droneRoot, droneLights, 'Drone');
  assert.strictEqual(droneLights.children.filter(child => child.isSpotLight).length, 3, 'Drone garage must receive three overhead key lights');
  assert(getModuleHemisphereConfig('Drone').intensity > getModuleHemisphereConfig('Habitat').intensity, 'Drone garage ambient fill must lift its dark floor texture');
  assert(droneFloorMaterial.emissiveIntensity > 0 && droneFloorMaterial.emissive.getHex() !== 0, 'Authored Floor material should get a subtle visibility lift');
});

test('LIGHT-003: configureMeshShadows correctly configures Terrain ground and structures', () => {
  const root = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10));
  ground.name = 'PHOBOSIA_MarsTerrain_2km';
  root.add(ground);

  const rover = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  rover.name = 'Rover_Body_Rover_2ver_0';
  root.add(rover);

  const solar = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  solar.name = 'Solar_Panel_UpperBase';
  root.add(solar);

  configureMeshShadows(root, 'Terrain');

  assert.strictEqual(ground.castShadow, false, 'Terrain ground must not cast shadow');
  assert.strictEqual(ground.receiveShadow, true, 'Terrain ground must receive shadow');
  assert.strictEqual(rover.castShadow, true, 'Rover must cast shadow');
  assert.strictEqual(rover.receiveShadow, true, 'Rover must receive shadow');
  assert.strictEqual(solar.castShadow, true, 'Solar panel must cast shadow');
});

test('LIGHT-004: configureMeshShadows sets indoor props to cast/receive shadows while excluding colliders', () => {
  const root = new THREE.Group();
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  desk.name = 'Workstation_Table';
  root.add(desk);

  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
  screen.name = 'Habitat_Workstation_Display';
  root.add(screen);

  const collider = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  collider.name = 'Collider_Section01';
  root.add(collider);

  configureMeshShadows(root, 'Habitat');

  assert.strictEqual(desk.castShadow, true, 'Desk must cast shadow');
  assert.strictEqual(desk.receiveShadow, true, 'Desk must receive shadow');
  assert.strictEqual(screen.castShadow, false, 'Screen display plane must not cast box shadow');
  assert.strictEqual(screen.receiveShadow, true, 'Screen display plane receives shadow');
  assert.strictEqual(collider.castShadow, false, 'Collider must not cast shadow');
  assert.strictEqual(collider.receiveShadow, false, 'Collider must not receive shadow');
});

test('LIGHT-005: getModuleHemisphereConfig provides distinct outdoor vs indoor lighting', () => {
  const outdoor = getModuleHemisphereConfig('Terrain');
  const indoor = getModuleHemisphereConfig('Habitat');

  assert.notStrictEqual(outdoor.skyColor, indoor.skyColor);
  assert.strictEqual(outdoor.skyColor, 0xd48858); // Mars warm sky
  assert.strictEqual(indoor.skyColor, 0x405568); // Cool indoor sci-fi base
  assert(outdoor.intensity > indoor.intensity);
});

test('LIGHT-006: configureHabitatAreaLights converts Light06 and Light07 into RectAreaLight instances', () => {
  const root = new THREE.Group();
  const additions = new THREE.Group();
  root.add(additions);

  // Create simulated plane meshes matching Habitat GLB setup (horizontal in XZ plane)
  const geom6 = new THREE.PlaneGeometry(0.3398, 0.3398).rotateX(-Math.PI / 2);
  const p6 = new THREE.Mesh(geom6);
  p6.name = 'Light06';
  p6.position.set(-2.548, 4.0, 0);
  p6.scale.set(7.5, 2.0, 4.0);
  root.add(p6);

  const geom7 = new THREE.PlaneGeometry(0.3398, 0.3398).rotateX(-Math.PI / 2);
  const p7 = new THREE.Mesh(geom7);
  p7.name = 'Light07';
  p7.position.set(2.548, 4.0, 0);
  p7.scale.set(7.5, 2.0, 4.0);
  root.add(p7);

  const configured = configureHabitatAreaLights(root, additions);
  assert.strictEqual(configured.length, 2, 'Must configure both Light06 and Light07');

  // Verify RectAreaLights
  const rect6 = additions.getObjectByName('AreaLight:Light06');
  const rect7 = additions.getObjectByName('AreaLight:Light07');
  assert(rect6 && rect6.isRectAreaLight, 'AreaLight:Light06 must exist and be RectAreaLight');
  assert(rect7 && rect7.isRectAreaLight, 'AreaLight:Light07 must exist and be RectAreaLight');

  // Verify dimensions
  assert(rect6.width > 2.0, `Width (${rect6.width}) must reflect world plane width (~2.55m)`);
  assert(rect6.height > 1.0, `Height (${rect6.height}) must reflect world plane depth (~1.36m)`);

  // Verify orientation: emission (+Z) points downward (y < 0)
  const emissionDir = new THREE.Vector3(0, 0, 1).applyQuaternion(rect6.quaternion);
  assert(emissionDir.y < -0.99, 'Emission vector must point downward into the room (-Y)');

  // Verify companion fill
  const fill6 = additions.getObjectByName('AreaFill:Light06');
  assert(fill6 && fill6.isPointLight, 'AreaFill:Light06 companion fill light must exist');

  // Verify idempotency
  const secondRun = configureHabitatAreaLights(root, additions);
  assert.strictEqual(secondRun.length, 0, 'Second run must not duplicate lights');
});

test('LIGHT-007: configureModuleLighting integrates Area Lights when module is Habitat', () => {
  const root = new THREE.Group();
  const additions = new THREE.Group();
  root.add(additions);

  const p6 = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
  p6.name = 'Light06';
  p6.position.set(-2.55, 4.0, 0);
  root.add(p6);

  configureModuleLighting(root, additions, 'Habitat');

  const rectLights = additions.children.filter(c => c.isRectAreaLight);
  assert.strictEqual(rectLights.length, 1, 'Habitat lighting must instantiate RectAreaLight for Light06');
  assert.strictEqual(rectLights[0].name, 'AreaLight:Light06');

  // Plane mesh must remain in scene and visible
  assert.strictEqual(p6.visible, true, 'Original plane mesh must remain visible');
});

// Setup minimal document mock for CanvasTexture / CanvasRenderingContext2D in Node environment
if (typeof document === 'undefined') {
  global.document = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        return {
          width: 1024,
          height: 768,
          getContext: () => ({
            fillStyle: '',
            fillRect: () => {},
            strokeStyle: '',
            lineWidth: 1,
            strokeRect: () => {},
            beginPath: () => {},
            closePath: () => {},
            moveTo: () => {},
            lineTo: () => {},
            stroke: () => {},
            fill: () => {},
            arc: () => {},
            fillText: () => {},
            font: '',
            textAlign: '',
            setLineDash: () => {},
            measureText: () => ({ width: 100 }),
            save: () => {},
            restore: () => {}
          })
        };
      }
      return {};
    }
  };
}

test('HAB-001: habitatScreenData.json defines valid configuration for all 4 Habitat physical displays', () => {
  const fs = require('fs');
  const path = require('path');
  const jsonPath = path.resolve(__dirname, '../src/jsons/Screens/habitatScreenData.json');
  assert(fs.existsSync(jsonPath), 'habitatScreenData.json must exist in src/jsons/Screens/');

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  assert.strictEqual(data.moduleId, 'Habitat');
  assert.strictEqual(data.rendering.renderingSystem, 'HabitatScreenRenderer');

  const requiredScreens = [
    'Habitat_LifeSupport_Display',
    'Habitat_Main_Status_Display',
    'Habitat_Emergency_Status_Display',
    'Habitat_WaterNutrition_Display'
  ];

  for (const s of requiredScreens) {
    assert(data.screens[s], `Screen configuration for ${s} must be defined`);
    assert.strictEqual(data.screens[s].enabled, true);
    assert(data.screens[s].geometry, `Geometry must be specified for ${s}`);
    assert(data.screens[s].geometry.aspectRatio > 0, `Aspect ratio must be > 0 for ${s}`);
    assert(data.screens[s].orientation, `Orientation must be specified for ${s}`);
    assert(data.screens[s].rendering, `Rendering settings must be specified for ${s}`);
    assert(data.screens[s].data, `Telemetry data must be defined for ${s}`);
  }
});

test('HAB-002: HabitatScreenRenderer attaches and binds all 4 physical screen meshes with planar UVs and materials', () => {
  const hsr = new HabitatScreenRenderer();
  const root = new THREE.Group();

  const screens = [
    'Habitat_LifeSupport_Display',
    'Habitat_Main_Status_Display',
    'Habitat_Emergency_Status_Display',
    'Habitat_WaterNutrition_Display'
  ];

  screens.forEach(name => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    mesh.name = name;
    root.add(mesh);
  });

  // Non-screen mesh should not be bound
  const chair = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5));
  chair.name = 'Habitat_Chair';
  root.add(chair);

  hsr.attachToHabitat(root, { currentDay: 2 });
  const bindings = hsr.getActiveBindings();

  assert.strictEqual(bindings.length, 4, 'Must bind exactly the 4 Habitat physical screens');

  screens.forEach(name => {
    const b = bindings.find(item => item.screenKey === name);
    assert(b, `Binding for ${name} must exist`);
    assert(b.texture instanceof THREE.CanvasTexture, `Binding for ${name} must have a CanvasTexture`);
    assert(b.material instanceof THREE.MeshBasicMaterial, `Binding for ${name} must have MeshBasicMaterial`);
    assert.strictEqual(b.mesh.visible, true, `Bound mesh for ${name} must be visible`);
  });

  hsr.dispose();
  assert.strictEqual(hsr.getActiveBindings().length, 0, 'Bindings must be empty after disposal');
});

test('HAB-003: HabitatScreenRenderer individual rendering functions execute cleanly', () => {
  const hsr = new HabitatScreenRenderer();
  const canvas = global.document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const fs = require('fs');
  const path = require('path');
  const jsonPath = path.resolve(__dirname, '../src/jsons/Screens/habitatScreenData.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  // Test Life Support Renderer
  assert.doesNotThrow(() => {
    hsr.renderHabitatLifeSupportDisplay(ctx, data.screens.Habitat_LifeSupport_Display.data, 1024, 746, 3);
  });

  // Test Main Status Renderer
  assert.doesNotThrow(() => {
    hsr.renderHabitatMainStatusDisplay(ctx, data.screens.Habitat_Main_Status_Display.data, 1024, 712, 3);
  });

  // Test Emergency Status Renderer
  assert.doesNotThrow(() => {
    hsr.renderHabitatEmergencyStatusDisplay(ctx, data.screens.Habitat_Emergency_Status_Display.data, 800, 736, 3);
  });

  // Test Water Nutrition Renderer
  assert.doesNotThrow(() => {
    hsr.renderHabitatWaterNutritionDisplay(ctx, data.screens.Habitat_WaterNutrition_Display.data, 768, 808, 3);
  });
});

test('HAB-004: HabitatScreenRenderer updateScreenData mutates telemetry and marks texture update', () => {
  const hsr = new HabitatScreenRenderer();
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
  mesh.name = 'Habitat_LifeSupport_Display';
  root.add(mesh);

  hsr.attachToHabitat(root, { currentDay: 4 });
  const binding = hsr.getActiveBindings().find(b => b.screenKey === 'Habitat_LifeSupport_Display');
  assert(binding, 'Life support binding must exist');

  const versionBefore = binding.texture.version;
  hsr.updateScreenData('Habitat_LifeSupport_Display', {
    oxygen: { label: 'OXYGEN', value: 20.8, unit: '%', status: 'NORMAL' }
  });

  const updatedConf = hsr.getScreenConfig('Habitat_LifeSupport_Display');
  assert.strictEqual(updatedConf.data.oxygen.value, 20.8);
  assert(binding.texture.version > versionBefore, 'Texture version must increment for GPU update');

  hsr.dispose();
});

test('HAB-005: ScreenRenderer skips Habitat 4 physical screens so they are solely handled by HabitatScreenRenderer', () => {
  const sr = new ScreenRenderer();
  const root = new THREE.Group();

  const screen1 = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
  screen1.name = 'Habitat_LifeSupport_Display';
  root.add(screen1);

  const workstation = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
  workstation.name = 'Habitat_Workstation_Display';
  root.add(workstation);

  // When attached to Habitat, ScreenRenderer binds workstation but skips the 4 physical telemetry screens
  sr.attachToModule(root, 'Habitat', { currentDay: 1 });
  
  // Workstation should have a material attached by ScreenRenderer
  assert(workstation.material instanceof THREE.MeshBasicMaterial, 'Workstation must be bound by ScreenRenderer');

  // Habitat_LifeSupport_Display must NOT be bound by ScreenRenderer
  assert.strictEqual(screen1.material.map, null, 'Physical display must not be bound by general ScreenRenderer');

  sr.dispose();
});

test('HAB-006: reprojectPlanarUVs with verified uAxis/vAxis generates upright, unmirrored UVs for all Habitat screens', () => {
  const fs = require('fs');
  const path = require('path');
  const jsonPath = path.resolve(__dirname, '../src/jsons/Screens/habitatScreenData.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  // Test WaterNutrition: plane on XY with minX=left, minY=bottom
  const waterGeom = new THREE.BufferGeometry();
  // Pos: [x, y, z]
  const waterPos = new Float32Array([
    -0.231, 0.161, 0.519,  // Left Top
    -0.110, 0.161, 0.519,  // Right Top
    -0.231, -0.329, 0.519, // Left Bottom
    -0.110, -0.329, 0.519  // Right Bottom
  ]);
  waterGeom.setAttribute('position', new THREE.BufferAttribute(waterPos, 3));
  const waterConf = data.screens.Habitat_WaterNutrition_Display.orientation;
  reprojectPlanarUVs(waterGeom, {
    uAxis: waterConf.uAxis,
    vAxis: waterConf.vAxis,
    flipU: Boolean(waterConf.mirrorHorizontal),
    flipV: Boolean(waterConf.mirrorVertical)
  });
  const waterUV = waterGeom.attributes.uv;
  // With mirrorHorizontal = true (flipU = true), minX (-0.231) maps to U=1 and maxX (-0.110) maps to U=0
  assert.strictEqual(Math.round(waterUV.getX(0)), 1, 'Right Top (minX) U must be 1 with flipU');
  assert.strictEqual(Math.round(waterUV.getY(0)), 1, 'Left Top V must be 1');
  assert.strictEqual(Math.round(waterUV.getX(1)), 0, 'Left Top (maxX) U must be 0 with flipU');
  assert.strictEqual(Math.round(waterUV.getY(1)), 1, 'Right Top V must be 1');
  assert.strictEqual(Math.round(waterUV.getX(2)), 1, 'Right Bottom (minX) U must be 1 with flipU');
  assert.strictEqual(Math.round(waterUV.getY(2)), 0, 'Left Bottom V must be 0');
  assert.strictEqual(Math.round(waterUV.getX(3)), 0, 'Left Bottom (maxX) U must be 0 with flipU');
  assert.strictEqual(Math.round(waterUV.getY(3)), 0, 'Right Bottom V must be 0');

  // Test Emergency Display: plane on YZ with maxZ=left (-0.625), minZ=right (-0.968)
  const emerGeom = new THREE.BufferGeometry();
  const emerPos = new Float32Array([
    0.174, 0.464, -0.625,  // Left Top
    0.174, 0.464, -0.968,  // Right Top
    0.174, -0.168, -0.625, // Left Bottom
    0.174, -0.168, -0.968  // Right Bottom
  ]);
  emerGeom.setAttribute('position', new THREE.BufferAttribute(emerPos, 3));
  const emerConf = data.screens.Habitat_Emergency_Status_Display.orientation;
  reprojectPlanarUVs(emerGeom, {
    uAxis: emerConf.uAxis,
    vAxis: emerConf.vAxis,
    flipU: Boolean(emerConf.mirrorHorizontal),
    flipV: Boolean(emerConf.mirrorVertical)
  });
  const emerUV = emerGeom.attributes.uv;
  assert.strictEqual(Math.round(emerUV.getX(0)), 0, 'Emergency Left Top U must be 0');
  assert.strictEqual(Math.round(emerUV.getY(0)), 1, 'Emergency Left Top V must be 1');
  assert.strictEqual(Math.round(emerUV.getX(1)), 1, 'Emergency Right Top U must be 1');
  assert.strictEqual(Math.round(emerUV.getY(1)), 1, 'Emergency Right Top V must be 1');
  assert.strictEqual(Math.round(emerUV.getX(2)), 0, 'Emergency Left Bottom U must be 0');
  assert.strictEqual(Math.round(emerUV.getY(2)), 0, 'Emergency Left Bottom V must be 0');
  assert.strictEqual(Math.round(emerUV.getX(3)), 1, 'Emergency Right Bottom U must be 1');
  assert.strictEqual(Math.round(emerUV.getY(3)), 0, 'Emergency Right Bottom V must be 0');
});

// ==========================================
// ENGINEERING UNIT PHYSICAL SCREEN TESTS
// ==========================================

test('ENG-001: engineeringScreenData.json defines valid configuration for all 12 Engineering physical displays', () => {
  const fs = require('fs');
  const path = require('path');
  const jsonPath = path.resolve(__dirname, '../src/jsons/Screens/engineeringScreenData.json');
  assert(fs.existsSync(jsonPath), 'engineeringScreenData.json must exist');

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  assert.strictEqual(data.zoneId || data.moduleId, data.zoneId ? 'ENGINEERING_UNIT' : 'Engineering');
  const useFullscreenOS = data.useFullscreenOS !== undefined ? data.useFullscreenOS : data.rendering?.useFullscreenOS;
  const useIndependentScreenRendering = data.useIndependentScreenRendering !== undefined ? data.useIndependentScreenRendering : data.rendering?.useIndependentScreenRendering;
  assert.strictEqual(useFullscreenOS, false, 'Physical screens must not hijack fullscreen OS');
  assert.strictEqual(useIndependentScreenRendering, true);

  const expectedScreens = [
    'MonitoringSection_Indicator_Screen',
    'MonitoringSection_Operational_Screen',
    'MonitoringSection_Screen',
    'PowerUnitScreenMain',
    'PowerUnitScreenMain02',
    'PowerUnitScreen000',
    'PowerUnitScreen000.001',
    'LifeSupportUnitScreenMain04',
    'LifeSupportUnitScreenMain02.001',
    'LifeSupportUnitScreenMain03',
    'DiagnosticsWorkbenchScreen_01',
    'Storage_Screen'
  ];

  const screenList = Array.isArray(data.screens)
    ? data.screens
    : Object.entries(data.screens).map(([key, val]) => ({ id: key, ...val }));
  assert.strictEqual(screenList.length, 12, 'Must configure exactly 12 Engineering displays');
  for (const screen of screenList) {
    assert(expectedScreens.includes(screen.id), `Screen id ${screen.id} must be in expectedScreens`);
    assert(screen.layout || screen.purpose, `Screen ${screen.id} must specify layout or purpose`);
    assert(screen.dimensionsM || screen.physicalMesh, `Screen ${screen.id} must specify dimensions or physicalMesh`);
    assert(screen.orientation || screen.dimensionsMeters, `Screen ${screen.id} must specify orientation`);
    assert(screen.content || screen.data, `Screen ${screen.id} must specify content or data`);
  }
});

test('ENG-002: EngineeringScreenRenderer attaches and binds all 12 physical screen meshes (including dot-tolerant names)', () => {
  const root = new THREE.Group();
  root.name = 'EngineeringSceneRoot';

  const expectedScreens = [
    'MonitoringSection_Indicator_Screen',
    'MonitoringSection_Operational_Screen',
    'MonitoringSection_Screen',
    'PowerUnitScreenMain',
    'PowerUnitScreenMain02',
    'PowerUnitScreen000',
    'PowerUnitScreen000001', // glTF export stripped dot
    'LifeSupportUnitScreenMain04',
    'LifeSupportUnitScreenMain02001', // glTF export stripped dot
    'LifeSupportUnitScreenMain03',
    'DiagnosticsWorkbenchScreen_01',
    'Storage_Screen'
  ];

  for (const name of expectedScreens) {
    const geom = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = name;
    root.add(mesh);
  }

  const renderer = new EngineeringScreenRenderer();
  renderer.renderEngineeringUnitScreens(root, { currentDay: 1 });

  const bindings = renderer.getBindings();
  assert.strictEqual(bindings.length, 12, 'Must bind all 12 Engineering screen meshes');

  for (const b of bindings) {
    assert(b.mesh, 'Binding must retain mesh reference');
    assert(b.canvas, 'Binding must create offscreen canvas');
    assert(b.ctx, 'Binding must provide 2D context');
    assert(b.texture, 'Binding must create CanvasTexture');
    assert(b.material, 'Binding must replace with MeshBasicMaterial');
    assert.strictEqual(b.mesh.material, b.material, 'Mesh material must be updated');
    assert.strictEqual(b.material.map, b.texture, 'Material map must be assigned canvas texture');
    assert.strictEqual(b.material.toneMapped, false, 'toneMapped must be false for emissive clarity');
    assert.strictEqual(b.mesh.visible, true, 'Screen mesh must remain visible');
  }

  renderer.dispose();
  assert.strictEqual(renderer.getBindings().length, 0, 'Disposal must clear active bindings');
});

test('ENG-003: EngineeringScreenRenderer individual rendering functions execute cleanly', () => {
  const root = new THREE.Group();
  const screenNames = [
    'MonitoringSection_Indicator_Screen',
    'MonitoringSection_Operational_Screen',
    'MonitoringSection_Screen',
    'PowerUnitScreenMain',
    'PowerUnitScreenMain02',
    'PowerUnitScreen000',
    'PowerUnitScreen000.001',
    'LifeSupportUnitScreenMain04',
    'LifeSupportUnitScreenMain02.001',
    'LifeSupportUnitScreenMain03',
    'DiagnosticsWorkbenchScreen_01',
    'Storage_Screen'
  ];

  for (const name of screenNames) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    mesh.name = name;
    root.add(mesh);
  }

  const renderer = new EngineeringScreenRenderer();
  renderer.attachToEngineering(root, { currentDay: 2 });

  // Test re-rendering across days
  renderer.renderAll({ currentDay: 3 });
  renderer.renderAll({ currentDay: 7 });

  const bindings = renderer.getBindings();
  assert.strictEqual(bindings.length, 12);
  for (const b of bindings) {
    assert(b.texture.version > 0, 'Texture version must be incremented after render');
  }

  renderer.dispose();
});

test('ENG-004: EngineeringScreenRenderer updateScreenData mutates telemetry and marks texture update', () => {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
  mesh.name = 'PowerUnitScreenMain';
  root.add(mesh);

  const renderer = new EngineeringScreenRenderer();
  renderer.attachToEngineering(root, { currentDay: 1 });

  const binding = renderer.getBindings()[0];
  assert(binding, 'PowerUnitScreenMain binding must exist');
  const versionBefore = binding.texture.version;

  renderer.updateScreenData('PowerUnitScreenMain', {
    summary: [
      { label: 'PHOTOVOLTAIC CAPTURE', value: '52.4 kW' }
    ]
  });

  const updatedConfig = renderer.getScreenConfig('PowerUnitScreenMain');
  assert.strictEqual(
    updatedConfig.content.summary[0].value,
    '52.4 kW',
    'Telemetry data must be updated in configuration'
  );
  assert(binding.texture.version > versionBefore, 'Texture version must increment for GPU update');

  renderer.dispose();
});

test('ENG-005: ScreenRenderer skips Engineering module physical screens so they are solely handled by EngineeringScreenRenderer', () => {
  const root = new THREE.Group();
  const engScreens = [
    'MonitoringSection_Indicator_Screen',
    'MonitoringSection_Operational_Screen',
    'MonitoringSection_Screen',
    'PowerUnitScreenMain',
    'PowerUnitScreenMain02',
    'PowerUnitScreen000',
    'LifeSupportUnitScreenMain04',
    'LifeSupportUnitScreenMain03',
    'DiagnosticsWorkbenchScreen_01',
    'Storage_Screen'
  ];

  for (const name of engScreens) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    mesh.name = name;
    root.add(mesh);
  }

  const sr = new ScreenRenderer();
  sr.attachToModule(root, 'Engineering', { currentDay: 1 });

  // None of the Engineering screens should be bound by generic ScreenRenderer
  for (const child of root.children) {
    assert.strictEqual(child.material.map, null, `${child.name} must not be bound by ScreenRenderer`);
  }

  sr.dispose();
});

test('ENG-006: reprojectPlanarUVs with verified uAxis/vAxis generates upright, unmirrored UVs for Engineering screens', () => {
  const fs = require('fs');
  const path = require('path');
  const jsonPath = path.resolve(__dirname, '../src/jsons/Screens/engineeringScreenData.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  // Test PowerUnitScreenMain: normal faces (-1, 0, 0), uAxis: z, vAxis: y
  // Z goes from minZ to maxZ, Y goes from minY to maxY
  const powerGeom = new THREE.BufferGeometry();
  const powerPos = new Float32Array([
    10.0, 3.0, 5.0,  // Top Left: max Y (3.0), min Z (5.0)
    10.0, 3.0, 8.0,  // Top Right: max Y (3.0), max Z (8.0)
    10.0, 1.0, 5.0,  // Bottom Left: min Y (1.0), min Z (5.0)
    10.0, 1.0, 8.0   // Bottom Right: min Y (1.0), max Z (8.0)
  ]);
  powerGeom.setAttribute('position', new THREE.BufferAttribute(powerPos, 3));
  const powerScreen = Array.isArray(data.screens)
    ? data.screens.find(s => s.id === 'PowerUnitScreenMain')
    : data.screens.PowerUnitScreenMain;
  const powerConf = powerScreen.orientation;
  reprojectPlanarUVs(powerGeom, {
    uAxis: powerConf.uAxis || 'z',
    vAxis: powerConf.vAxis || 'y',
    flipU: Boolean(powerConf.mirrorHorizontal),
    flipV: Boolean(powerConf.mirrorVertical)
  });
  const powerUV = powerGeom.attributes.uv;
  const expectedMinZ_U = powerConf.mirrorHorizontal ? 1 : 0;
  const expectedMaxZ_U = powerConf.mirrorHorizontal ? 0 : 1;
  assert.strictEqual(Math.round(powerUV.getX(0)), expectedMinZ_U, 'Top Left U matching mirrorHorizontal');
  assert.strictEqual(Math.round(powerUV.getY(0)), 1, 'Top Left V must be 1 (max Y)');
  assert.strictEqual(Math.round(powerUV.getX(1)), expectedMaxZ_U, 'Top Right U matching mirrorHorizontal');
  assert.strictEqual(Math.round(powerUV.getY(1)), 1, 'Top Right V must be 1 (max Y)');
  assert.strictEqual(Math.round(powerUV.getX(2)), expectedMinZ_U, 'Bottom Left U matching mirrorHorizontal');
  assert.strictEqual(Math.round(powerUV.getY(2)), 0, 'Bottom Left V must be 0 (min Y)');
  assert.strictEqual(Math.round(powerUV.getX(3)), expectedMaxZ_U, 'Bottom Right U matching mirrorHorizontal');
  assert.strictEqual(Math.round(powerUV.getY(3)), 0, 'Bottom Right V must be 0 (min Y)');
});

// ==========================================
// RESEARCH LAB PHYSICAL SCREEN TESTS
// ==========================================

test('RES-001: research-zone-screens.json defines valid configuration for all 6 Science Lab physical displays', () => {
  const fs = require('fs');
  const path = require('path');
  const jsonPath = path.resolve(__dirname, '../src/jsons/Screens/research-zone-screens.json');
  assert(fs.existsSync(jsonPath), 'research-zone-screens.json must exist');

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  assert.strictEqual(data.project, 'PHOBOSIA');
  assert.strictEqual(data.zone, 'RESEARCH_SCIENCE_LAB');
  assert.strictEqual(data.dataPolicy.displayDisclaimer, true);
  assert.strictEqual(data.rendering.separateFromFullScreenOS, true);

  const expectedScreens = [
    { meshName: 'ResearchMonitoring_MainScreen', rendererId: 'ResearchMonitoringMainRenderer' },
    { meshName: 'ResearchMonitoring_SystemScreen', rendererId: 'ResearchMonitoringSystemRenderer' },
    { meshName: 'SeedStorage_InventoryScreen', rendererId: 'SeedStorageInventoryRenderer' },
    { meshName: 'WaterNutrition_MixingScreen', rendererId: 'WaterNutritionMixingRenderer' },
    { meshName: 'WaterNutrition_QualityScreen', rendererId: 'WaterNutritionQualityRenderer' },
    { meshName: 'Cultivation_EnvironmentScreen', rendererId: 'CultivationEnvironmentRenderer' }
  ];

  assert(Array.isArray(data.screens), 'screens must be an array');
  assert.strictEqual(data.screens.length, 6, 'Must configure exactly 6 Research displays');

  for (const exp of expectedScreens) {
    const sc = data.screens.find(s => s.meshName === exp.meshName);
    assert(sc, `Screen ${exp.meshName} must exist in research-zone-screens.json`);
    assert.strictEqual(sc.rendererId, exp.rendererId, `Renderer ID must match for ${exp.meshName}`);
    assert(sc.dimensionsMeters, `Dimensions must exist for ${exp.meshName}`);
    assert(sc.content, `Content must exist for ${exp.meshName}`);
    assert(sc.content.header, `Header must exist for ${exp.meshName}`);
    assert(Array.isArray(sc.content.panels), `Panels must be array for ${exp.meshName}`);
  }
});

test('RES-002: ResearchScreenRenderer binds all 6 physical screen meshes (including trimmed Cultivation_EnvironmentScreen)', () => {
  const root = new THREE.Group();
  root.name = 'ScienceLabSceneRoot';

  const meshNames = [
    'ResearchMonitoring_MainScreen',
    'ResearchMonitoring_SystemScreen',
    'SeedStorage_InventoryScreen',
    'WaterNutrition_MixingScreen',
    'WaterNutrition_QualityScreen',
    ' Cultivation_EnvironmentScreen' // Leading space as found in GLB
  ];

  for (const name of meshNames) {
    const geom = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = name;
    root.add(mesh);
  }

  const renderer = new ResearchScreenRenderer();
  renderer.renderResearchLabScreens(root, { currentDay: 1 });

  const bindings = renderer.getBindings();
  assert.strictEqual(bindings.length, 6, 'Must bind all 6 Research screen meshes');

  for (const b of bindings) {
    assert(b.mesh, 'Binding must retain mesh reference');
    assert(b.canvas, 'Binding must create offscreen canvas');
    assert(b.ctx, 'Binding must provide 2D context');
    assert(b.texture, 'Binding must create CanvasTexture');
    assert(b.material, 'Binding must replace with MeshBasicMaterial');
    assert.strictEqual(b.mesh.material, b.material, 'Mesh material must be updated');
    assert.strictEqual(b.material.map, b.texture, 'Material map must be assigned canvas texture');
    assert.strictEqual(b.material.toneMapped, false, 'toneMapped must be false for emissive clarity');
    assert.strictEqual(b.mesh.visible, true, 'Screen mesh must remain visible');
  }

  renderer.dispose();
  assert.strictEqual(renderer.getBindings().length, 0, 'Disposal must clear active bindings');
});

test('RES-003: ResearchScreenRenderer renders all 18 panel types cleanly without runtime exceptions', () => {
  const root = new THREE.Group();
  const meshNames = [
    'ResearchMonitoring_MainScreen',
    'ResearchMonitoring_SystemScreen',
    'SeedStorage_InventoryScreen',
    'WaterNutrition_MixingScreen',
    'WaterNutrition_QualityScreen',
    'Cultivation_EnvironmentScreen'
  ];

  for (const name of meshNames) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    mesh.name = name;
    root.add(mesh);
  }

  const renderer = new ResearchScreenRenderer();
  renderer.attachToScience(root, { currentDay: 2 });

  // Re-render across multiple days to verify stability
  renderer.renderAll({ currentDay: 4 });
  renderer.renderAll({ currentDay: 8 });

  const bindings = renderer.getBindings();
  assert.strictEqual(bindings.length, 6);
  for (const b of bindings) {
    assert(b.texture.version > 0, 'Texture version must be incremented after render');
  }

  renderer.dispose();
});

test('RES-004: ResearchScreenRenderer updateScreenData mutates telemetry and marks texture update', () => {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
  mesh.name = 'ResearchMonitoring_MainScreen';
  root.add(mesh);

  const renderer = new ResearchScreenRenderer();
  renderer.attachToScience(root, { currentDay: 1 });

  const binding = renderer.getBindings()[0];
  assert(binding, 'ResearchMonitoring_MainScreen binding must exist');
  const versionBefore = binding.texture.version;

  renderer.updateScreenData('research_monitoring_main', {
    primaryMetrics: [
      { id: 'activeExperiments', label: 'Active Experiments', value: 12, unit: 'experiments', status: 'NORMAL' }
    ]
  });

  const updatedConfig = renderer.getScreenConfig('research_monitoring_main');
  assert.strictEqual(
    updatedConfig.content.primaryMetrics[0].value,
    12,
    'Telemetry data must be updated in configuration'
  );
  assert(binding.texture.version > versionBefore, 'Texture version must increment for GPU update');

  renderer.dispose();
});

test('RES-005: ScreenRenderer skips Science Lab physical screens so they are solely handled by ResearchScreenRenderer', () => {
  const root = new THREE.Group();
  const scienceScreens = [
    'ResearchMonitoring_MainScreen',
    'ResearchMonitoring_SystemScreen',
    'SeedStorage_InventoryScreen',
    'WaterNutrition_MixingScreen',
    'WaterNutrition_QualityScreen',
    'Cultivation_EnvironmentScreen'
  ];

  for (const name of scienceScreens) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    mesh.name = name;
    root.add(mesh);
  }

  const sr = new ScreenRenderer();
  sr.attachToModule(root, 'Science', { currentDay: 1 });

  for (const child of root.children) {
    assert.strictEqual(child.material.map, null, `${child.name} must not be bound by ScreenRenderer`);
  }

  sr.dispose();
});

test('RES-006: reprojectPlanarUVs generates upright, normalized UVs for Research Lab screen meshes', () => {
  const geom = new THREE.BufferGeometry();
  const pos = new Float32Array([
    -2.36, 0.97, 6.94,  // Top Left (Y max, Z min or max)
    -2.36, 0.97, 9.66,
    -2.36, 2.35, 6.94,
    -2.36, 2.35, 9.66
  ]);
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  reprojectPlanarUVs(geom, { uAxis: 'z', vAxis: 'y', flipU: true, flipV: false });
  const uv = geom.attributes.uv;
  assert.strictEqual(Math.round(uv.getX(0)), 1, 'Top Left U must be 1 with flipU');
  assert.strictEqual(Math.round(uv.getY(0)), 0, 'Top Left V must be 0 with min Y');
  assert.strictEqual(Math.round(uv.getX(1)), 0, 'Top Right U must be 0 with flipU');
  assert.strictEqual(Math.round(uv.getY(1)), 0, 'Top Right V must be 0 with min Y');
  assert.strictEqual(Math.round(uv.getX(2)), 1, 'Bottom Left U must be 1 with flipU');
  assert.strictEqual(Math.round(uv.getY(2)), 1, 'Bottom Left V must be 1 with max Y');
  assert.strictEqual(Math.round(uv.getX(3)), 0, 'Bottom Right U must be 0 with flipU');
  assert.strictEqual(Math.round(uv.getY(3)), 1, 'Bottom Right V must be 1 with max Y');
});

// ============================================================================
// MISSION CONTROL SCREEN RENDERING & INTEGRATION TESTS
// ============================================================================

test('MC-001: mission-control-screens.json defines valid configuration for all 8 Mission Control physical displays', () => {
  const fs = require('fs');
  const path = require('path');
  const jsonPath = path.resolve(__dirname, '../src/jsons/Screens/mission-control-screens.json');
  assert(fs.existsSync(jsonPath), 'mission-control-screens.json must exist');

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  assert.strictEqual(data.zone, 'MISSION_CONTROL');
  assert(data.dataPolicy.disclaimer.includes('SIMULATED'), 'Must include simulation disclaimer');
  assert(data.rendering.independentScreenRendering, 'Must use independent screen rendering');
  assert(data.rendering.fullscreenOSSeparation, 'Must maintain fullscreen OS separation');

  const expectedScreens = [
    'MissionControl_ObjectivesScreen',
    'MissionControl_OutpostStatusScreen',
    'MissionControl_OverviewScreen',
    'MissionControl_CommunicationsScreen',
    'MissionControl_SystemsScreen',
    'MissionControl_DroneOperationScreen',
    'MissionControl_ObservationSitesScreen',
    'MissionControl_TerrainMapScreen'
  ];

  assert.strictEqual(data.screens.length, 8, 'Must configure exactly 8 Mission Control displays');
  for (const screen of data.screens) {
    assert(expectedScreens.includes(screen.meshName), `Screen mesh ${screen.meshName} must be in expectedScreens`);
    assert(screen.screenId, `Screen ${screen.meshName} must specify screenId`);
    assert(screen.content, `Screen ${screen.meshName} must specify content`);
    assert(screen.content.header, `Screen ${screen.meshName} content must specify header`);
    assert(Array.isArray(screen.content.panels), `Screen ${screen.meshName} content must have panels array`);
    assert(screen.content.panels.length > 0, `Screen ${screen.meshName} must have at least one panel`);
  }
});

test('MC-002: MissionControlScreenRenderer attaches and binds all 8 physical screen meshes with planar UVs and materials', () => {
  const root = new THREE.Group();
  root.name = 'MissionControlSceneRoot';

  const screens = [
    'MissionControl_ObjectivesScreen',
    'MissionControl_OutpostStatusScreen',
    'MissionControl_OverviewScreen',
    'MissionControl_CommunicationsScreen',
    'MissionControl_SystemsScreen',
    'MissionControl_DroneOperationScreen',
    'MissionControl_ObservationSitesScreen',
    'MissionControl_TerrainMapScreen'
  ];

  screens.forEach((name) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.5), new THREE.MeshBasicMaterial());
    mesh.name = name;
    root.add(mesh);
  });

  const renderer = new MissionControlScreenRenderer();
  renderer.attachToMissionControl(root, { currentSol: 4 });

  const bindings = renderer.getBindings();
  assert.strictEqual(bindings.length, 8, 'Must bind all 8 Mission Control physical screen meshes');

  for (const binding of bindings) {
    assert(binding.mesh, 'Binding must reference target mesh');
    assert(binding.canvas, 'Binding must create offscreen canvas');
    assert(binding.texture, 'Binding must create CanvasTexture');
    assert.strictEqual(binding.mesh.material.map, binding.texture, 'Mesh material must map to CanvasTexture');
    assert(binding.width >= 256 && binding.width <= 1024, 'Canvas width must be within budget');
    assert(binding.height >= 256 && binding.height <= 1024, 'Canvas height must be within budget');
  }

  renderer.dispose();
  assert.strictEqual(renderer.getBindings().length, 0, 'Bindings must be cleared on dispose');
});

test('MC-003: MissionControlScreenRenderer renders all 12 panel types cleanly without runtime exceptions', () => {
  const root = new THREE.Group();
  const screens = [
    'MissionControl_ObjectivesScreen',
    'MissionControl_OutpostStatusScreen',
    'MissionControl_OverviewScreen',
    'MissionControl_CommunicationsScreen',
    'MissionControl_SystemsScreen',
    'MissionControl_DroneOperationScreen',
    'MissionControl_ObservationSitesScreen',
    'MissionControl_TerrainMapScreen'
  ];

  screens.forEach((name) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.5), new THREE.MeshBasicMaterial());
    mesh.name = name;
    root.add(mesh);
  });

  const renderer = new MissionControlScreenRenderer();
  renderer.attachToMissionControl(root, { currentSol: 4 });

  // renderAll exercises all 12 panel types across the 8 screens
  assert.doesNotThrow(() => {
    renderer.renderAll({ currentSol: 5 });
  }, 'MissionControlScreenRenderer.renderAll must execute cleanly without exceptions');

  renderer.dispose();
});

test('MC-004: MissionControlScreenRenderer updateScreenData mutates telemetry and marks texture update', () => {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.5), new THREE.MeshBasicMaterial());
  mesh.name = 'MissionControl_ObjectivesScreen';
  root.add(mesh);

  const renderer = new MissionControlScreenRenderer();
  renderer.attachToMissionControl(root, { currentSol: 4 });

  const binding = renderer.getBindings()[0];
  assert(binding, 'MissionControl_ObjectivesScreen binding must exist');
  const versionBefore = binding.texture.version;

  renderer.updateScreenData('MC_OBJECTIVES', {
    header: {
      title: 'UPDATED OBJECTIVES TITLE'
    }
  });

  const updatedConfig = renderer.getScreenConfig('MC_OBJECTIVES');
  assert.strictEqual(
    updatedConfig.content.header.title,
    'UPDATED OBJECTIVES TITLE',
    'Header title must be updated in configuration'
  );
  assert(binding.texture.version > versionBefore, 'Texture version must increment for WebGL upload');

  renderer.dispose();
});

test('MC-005: ScreenRenderer skips Mission Control physical screens so they are solely handled by MissionControlScreenRenderer', () => {
  const root = new THREE.Group();
  const mcScreens = [
    'MissionControl_ObjectivesScreen',
    'MissionControl_OutpostStatusScreen',
    'MissionControl_OverviewScreen',
    'MissionControl_CommunicationsScreen',
    'MissionControl_SystemsScreen',
    'MissionControl_DroneOperationScreen',
    'MissionControl_ObservationSitesScreen',
    'MissionControl_TerrainMapScreen'
  ];

  for (const name of mcScreens) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    mesh.name = name;
    root.add(mesh);
  }

  const sr = new ScreenRenderer();
  sr.attachToModule(root, 'MissionControl', { currentDay: 1 });

  for (const child of root.children) {
    assert.strictEqual(child.material.map, null, `${child.name} must not be bound by legacy ScreenRenderer`);
  }

  sr.dispose();
});

test('MC-006: reprojectPlanarUVs generates upright, normalized UVs for Mission Control screens', () => {
  const geom = new THREE.BufferGeometry();
  const pos = new Float32Array([
    0, 0, 0,
    0, 3.31, 0,
    0, 0, 2.64,
    0, 3.31, 2.64
  ]);
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  reprojectPlanarUVs(geom, { uAxis: 'z', vAxis: 'y', flipU: false, flipV: false });
  const uv = geom.attributes.uv;
  assert.strictEqual(Math.round(uv.getX(0)), 0, 'Min Z must map to U=0');
  assert.strictEqual(Math.round(uv.getY(0)), 0, 'Min Y must map to V=0');
  assert.strictEqual(Math.round(uv.getX(3)), 1, 'Max Z must map to U=1');
  assert.strictEqual(Math.round(uv.getY(3)), 1, 'Max Y must map to V=1');
});

// ============================================================================
// CENTRAL HUB SCREEN RENDERING, LIGHTING & SCENE VALIDATION TESTS
// ============================================================================

test('HUB-001: central-hub-screens.json defines valid configuration for all 3 Central Hub physical displays', () => {
  const fs = require('fs');
  const path = require('path');
  const jsonPath = path.resolve(__dirname, '../src/jsons/Screens/central-hub-screens.json');
  assert(fs.existsSync(jsonPath), 'central-hub-screens.json must exist');

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  assert.strictEqual(data.zone, 'CENTRAL_HUB');
  assert(data.dataPolicy.disclaimer.includes('SIMULATED'), 'Must include simulation disclaimer');

  const expectedScreens = [
    'Env_Status_Display',
    'Internal_Communication_Display',
    'Module_Status_Display'
  ];

  assert.strictEqual(data.screens.length, 3, 'Must configure exactly 3 Central Hub displays');
  for (const screen of data.screens) {
    assert(expectedScreens.includes(screen.meshName), `Screen mesh ${screen.meshName} must be in expectedScreens`);
    assert(screen.screenId, `Screen ${screen.meshName} must specify screenId`);
    assert(screen.content, `Screen ${screen.meshName} must specify content`);
    assert(screen.content.header, `Screen ${screen.meshName} content must specify header`);
    assert(Array.isArray(screen.content.panels), `Screen ${screen.meshName} content must have panels array`);
  }

  const portraitScreen = data.screens.find(s => s.meshName === 'Internal_Communication_Display');
  assert(portraitScreen, 'Internal_Communication_Display must exist');
  assert.strictEqual(portraitScreen.displayProfile.shape, 'TALL_PORTRAIT');
  assert.strictEqual(portraitScreen.displayProfile.preferVerticalStacking, true);
});

test('HUB-002: CentralHubScreenRenderer attaches and binds all 3 physical screen meshes with planar UVs and materials', () => {
  const root = new THREE.Group();
  root.name = 'CentralHubSceneRoot';

  const screens = [
    'Env_Status_Display',
    'Internal_Communication_Display',
    'Module_Status_Display'
  ];

  screens.forEach((name) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), new THREE.MeshBasicMaterial());
    mesh.name = name;
    root.add(mesh);
  });

  const renderer = new CentralHubScreenRenderer();
  renderer.attachToHub(root, { currentSol: 4 });

  const bindings = renderer.getBindings();
  assert.strictEqual(bindings.length, 3, 'Must bind all 3 Central Hub physical screen meshes');

  for (const binding of bindings) {
    assert(binding.mesh, 'Binding must reference target mesh');
    assert(binding.canvas, 'Binding must create offscreen canvas');
    assert(binding.texture, 'Binding must create CanvasTexture');
    assert.strictEqual(binding.mesh.material.map, binding.texture, 'Mesh material must map to CanvasTexture');

    if (binding.meshName === 'Internal_Communication_Display') {
      // Must be tall portrait aspect ratio (512x1024)
      assert.strictEqual(binding.width, 512, 'Portrait screen width must be 512');
      assert.strictEqual(binding.height, 1024, 'Portrait screen height must be 1024');
    }
  }

  renderer.dispose();
  assert.strictEqual(renderer.getBindings().length, 0, 'Bindings must be cleared on dispose');
});

test('HUB-003: CentralHubScreenRenderer renders all panel types cleanly without runtime exceptions', () => {
  const root = new THREE.Group();
  const screens = [
    'Env_Status_Display',
    'Internal_Communication_Display',
    'Module_Status_Display'
  ];

  screens.forEach((name) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), new THREE.MeshBasicMaterial());
    mesh.name = name;
    root.add(mesh);
  });

  const renderer = new CentralHubScreenRenderer();
  renderer.attachToHub(root, { currentSol: 4 });

  assert.doesNotThrow(() => {
    renderer.renderAll({ currentSol: 5 });
  }, 'CentralHubScreenRenderer.renderAll must execute cleanly without exceptions');

  renderer.dispose();
});

test('HUB-004: CentralHubScreenRenderer updateScreenData mutates telemetry and marks texture update', () => {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), new THREE.MeshBasicMaterial());
  mesh.name = 'Env_Status_Display';
  root.add(mesh);

  const renderer = new CentralHubScreenRenderer();
  renderer.attachToHub(root, { currentSol: 4 });

  const binding = renderer.getBindings()[0];
  assert(binding, 'Env_Status_Display binding must exist');
  const versionBefore = binding.texture.version;

  renderer.updateScreenData('CH_ENV_STATUS', {
    header: {
      title: 'CENTRAL HUB ENVIRONMENTAL V2'
    }
  });

  const updatedConfig = renderer.getScreenConfig('CH_ENV_STATUS');
  assert.strictEqual(
    updatedConfig.content.header.title,
    'CENTRAL HUB ENVIRONMENTAL V2',
    'Header title must be updated in configuration'
  );
  assert(binding.texture.version > versionBefore, 'Texture version must increment for WebGL upload');

  renderer.dispose();
});

test('HUB-005: ScreenRenderer skips Central Hub physical screens so they are solely handled by CentralHubScreenRenderer', () => {
  const root = new THREE.Group();
  const hubScreens = [
    'Env_Status_Display',
    'Internal_Communication_Display',
    'Module_Status_Display'
  ];

  for (const name of hubScreens) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    mesh.name = name;
    root.add(mesh);
  }

  const sr = new ScreenRenderer();
  sr.attachToModule(root, 'Hub', { currentDay: 1 });

  for (const child of root.children) {
    assert.strictEqual(child.material.map, null, `${child.name} must not be bound by legacy ScreenRenderer`);
  }

  sr.dispose();
});

test('HUB-006: discoverHubLights discovers and classifies all 14 Light_01-Light_14 objects in Central Hub scene', () => {
  const root = new THREE.Group();

  // Create mock Light_01 to Light_14
  for (let i = 1; i <= 14; i++) {
    const numStr = i < 10 ? `0${i}` : `${i}`;
    if (i <= 2) {
      // Mesh luminaires
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshStandardMaterial({ emissive: new THREE.Color(0xffffff) }));
      mesh.name = `Light_${numStr}`;
      root.add(mesh);
    } else {
      // Empty marker nodes
      const empty = new THREE.Object3D();
      empty.name = `Light_${numStr}`;
      root.add(empty);
    }
  }

  const report = discoverHubLights(root);
  assert.strictEqual(report.allDiscovered.length, 14, 'Must discover all 14 lights');
  assert.strictEqual(report.emissiveMeshes.length, 2, 'Light_01 and Light_02 must be classified as emissive meshes');
  assert.strictEqual(report.portalLights.length, 6, 'Light_03 to Light_08 must be classified as doorway portal lights');
  assert.strictEqual(report.walkwayMarkers.length, 6, 'Light_09 to Light_14 must be classified as walkway markers');
});

test('HUB-007: configureHubLights adds shadow-casting high-intensity PointLights under every object Light_03 to Light_14', () => {
  const moduleRoot = new THREE.Group();
  const lightObjects = [];

  for (let i = 1; i <= 14; i++) {
    const numStr = i < 10 ? `0${i}` : `${i}`;
    const obj = i <= 2 ? new THREE.Mesh(new THREE.SphereGeometry(0.5)) : new THREE.Object3D();
    obj.name = `Light_${numStr}`;
    obj.position.set(i * 1.0, 2.45, 0);
    moduleRoot.add(obj);
    if (i >= 3) {
      lightObjects.push(obj);
    }
  }

  const report = configureHubLights(moduleRoot);
  assert.strictEqual(report.allDiscovered.length, 14);
  assert.strictEqual(report.lightsCreated.length, 12, 'Must create lights for all 12 objects Light_03 to Light_14');

  // Verify that every object named Light_03 to Light_14 has a light object added directly under it
  for (const obj of lightObjects) {
    const childLight = obj.children.find((c) => c.name.startsWith('HubLight:'));
    assert(childLight, `Object ${obj.name} must have a HubLight child object added under it`);
    assert(childLight instanceof THREE.PointLight, `${obj.name} child light must be a PointLight`);
    assert.strictEqual(childLight.castShadow, true, `${obj.name} light must have castShadow = true for shadows to appear`);
    assert(childLight.intensity >= 8.0, `${obj.name} light intensity must be increased (>= 8.0) to eliminate darkness`);
  }

  // Idempotency: verify calling configureHubLights again does not duplicate lights
  configureHubLights(moduleRoot);
  for (const obj of lightObjects) {
    const hubLights = obj.children.filter((c) => c.name.startsWith('HubLight:'));
    assert.strictEqual(hubLights.length, 1, `Object ${obj.name} must not have duplicate lights attached`);
  }
});

test('STAB-006: buildCentralHubColliders builds colliders for Collider_Section01 and sets visibility to false', () => {
  const root = new THREE.Group();

  // Create mock Collider_Section01 with multi-primitive child meshes resembling Central_Connector.glb
  const section01 = new THREE.Group();
  section01.name = 'Collider_Section01';
  section01.position.set(0, 0.55, 0);

  for (let i = 0; i < 6; i++) {
    const geom = new THREE.BoxGeometry(2, 2, 2);
    const m = new THREE.Mesh(geom, new THREE.MeshBasicMaterial());
    m.name = `Collider_Section01_Prim_${i}`;
    section01.add(m);
  }
  root.add(section01);

  const colliders = buildCentralHubColliders(root);
  assert(colliders.length > 0, 'Central Hub must generate colliders for Collider_Section01');
  assert.strictEqual(section01.visible, false, 'Collider_Section01 must have visibility set to false');
  section01.traverse((child) => {
    assert.strictEqual(child.visible, false, `Child ${child.name} must have visibility set to false`);
  });
});

test('HUB-COLLIDERS: every authored rotated Central Hub primitive keeps its oriented collision bounds', () => {
  const root = new THREE.Group();
  const authored = [];
  for (let i = 0; i < 6; i++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 0.5), new THREE.MeshBasicMaterial());
    mesh.name = `Collider_${i + 1}`;
    mesh.position.set(i - 2.5, 0.8, 1);
    mesh.rotation.y = (i + 1) * 0.21;
    root.add(mesh);
    authored.push(mesh);
  }
  root.updateWorldMatrix(true, true);
  const colliders = buildCentralHubOrientedColliders(root);
  assert.strictEqual(colliders.length, 6, 'all six root-level non-section collider meshes are registered');
  for (let i = 0; i < colliders.length; i++) {
    const collider = colliders[i];
    const mesh = authored[i];
    assert.strictEqual(mesh.visible, false, `${mesh.name} is hidden as a collision-only proxy`);
    assert(collider.orientation.angleTo(mesh.getWorldQuaternion(new THREE.Quaternion())) < 1e-6, `${mesh.name} rotation is retained`);
    const localInside = new THREE.Vector3(collider.halfExtents.x * 0.9, 0, 0).applyQuaternion(collider.orientation).add(collider.center);
    const localOutside = new THREE.Vector3(collider.halfExtents.x + 0.01, 0, 0).applyQuaternion(collider.orientation).add(collider.center);
    assert(orientedBoxContainsPoint(localInside, collider), `${mesh.name} blocks inside its actual oriented volume`);
    assert(!orientedBoxContainsPoint(localOutside, collider), `${mesh.name} does not over-block outside its rotated volume`);
  }
});

test('HUB-COLLIDERS: circular Central Hub section preserves its cylinder footprint and transformed position', () => {
  const root = new THREE.Group();
  root.position.set(3, 0, -2);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.02, 32), new THREE.MeshBasicMaterial());
  mesh.name = 'Collider_Section02';
  mesh.position.set(2, 0.5, 4);
  root.add(mesh);
  root.updateWorldMatrix(true, true);
  const colliders = buildCentralHubCylinderColliders(root);
  assert.equal(colliders.length, 1);
  assert.equal(mesh.visible, false);
  const collider = colliders[0];
  assert(Math.abs(collider.center.x - 5) < 1e-6 && Math.abs(collider.center.z - 2) < 1e-6, 'world position includes the parent transform');
  assert(verticalCylinderContainsPoint(new THREE.Vector3(5, collider.minY + 0.5, 2), collider));
  assert(!verticalCylinderContainsPoint(new THREE.Vector3(5 + collider.radiusX * 1.1, collider.minY + 0.5, 2), collider), 'circular collider does not block beyond its radius');
});

// =========================================================================
// AIRLOCK SCREEN RENDERING TESTS
// =========================================================================

test('AIR-001: airlock-screen-data.json defines valid configuration for Airlock_Control_Console', () => {
  const fs = require('fs');
  const path = require('path');
  const jsonPath = path.resolve(__dirname, '../src/jsons/Screens/airlock-screen-data.json');
  assert(fs.existsSync(jsonPath), 'airlock-screen-data.json must exist');
  const raw = fs.readFileSync(jsonPath, 'utf8');
  const data = JSON.parse(raw);
  assert.strictEqual(data.project, 'PHOBOSIA');
  assert.strictEqual(data.zone, 'AIRLOCK');
  assert(Array.isArray(data.screens), 'screens must be an array');
  assert.strictEqual(data.screens.length, 1, 'Must configure exactly 1 Airlock display');
  const screen = data.screens[0];
  assert.strictEqual(screen.meshName, 'Airlock_Control_Console');
  assert.strictEqual(screen.screenId, 'AL_CONTROL_CONSOLE');
  assert(screen.content, 'Screen must provide content object');
  assert(screen.content.header, 'Screen must provide header content');
  assert(Array.isArray(screen.content.panels), 'Screen must provide panels array');
});

test('AIR-002: AirlockScreenRenderer attaches and binds Airlock_Control_Console with planar UVs and CanvasTexture', () => {
  const root = new THREE.Group();
  root.name = 'AirlockSceneRoot';
  const geom = new THREE.PlaneGeometry(1.5, 1.0);
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial());
  mesh.name = 'Airlock_Control_Console';
  root.add(mesh);

  const renderer = new AirlockScreenRenderer();
  renderer.attachToAirlock(root, { currentSol: 4 });

  const bindings = renderer.getBindings();
  assert.strictEqual(bindings.length, 1, 'Must bind Airlock_Control_Console physical screen mesh');
  const binding = bindings[0];
  assert.strictEqual(binding.meshName, 'Airlock_Control_Console');
  assert.strictEqual(binding.screenId, 'AL_CONTROL_CONSOLE');
  assert(binding.material, 'Must assign MeshBasicMaterial');
  assert(binding.texture, 'Must assign CanvasTexture');
  assert.strictEqual(binding.width, 640);
  assert.strictEqual(binding.height, 512);

  renderer.dispose();
  assert.strictEqual(renderer.getBindings().length, 0, 'Bindings must be emptied after dispose');
});

test('AIR-003: AirlockScreenRenderer renders all panel types cleanly without runtime exceptions', () => {
  const root = new THREE.Group();
  const geom = new THREE.PlaneGeometry(1.5, 1.0);
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial());
  mesh.name = 'Airlock_Control_Console';
  root.add(mesh);

  const renderer = new AirlockScreenRenderer();
  renderer.attachToAirlock(root, { currentSol: 4 });

  assert.doesNotThrow(() => {
    renderer.renderAll({ currentSol: 5 });
  }, 'AirlockScreenRenderer.renderAll must execute cleanly without exceptions');

  renderer.dispose();
});

test('AIR-004: AirlockScreenRenderer updateScreenData mutates telemetry and marks texture update', () => {
  const root = new THREE.Group();
  const geom = new THREE.PlaneGeometry(1.5, 1.0);
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial());
  mesh.name = 'Airlock_Control_Console';
  root.add(mesh);

  const renderer = new AirlockScreenRenderer();
  renderer.attachToAirlock(root, { currentSol: 4 });

  renderer.updateScreenData('AL_CONTROL_CONSOLE', {
    header: {
      title: 'AIRLOCK DEPRESSURIZATION ACTIVE',
      status: 'CYCLING'
    }
  });

  const conf = renderer.getScreenConfig('AL_CONTROL_CONSOLE');
  assert.strictEqual(
    conf.content.header.title,
    'AIRLOCK DEPRESSURIZATION ACTIVE',
    'updateScreenData must update screen title in config'
  );
  assert.strictEqual(
    conf.content.header.status,
    'CYCLING',
    'updateScreenData must update status in config'
  );

  renderer.dispose();
});

test('AIR-005: ScreenRenderer skips Airlock physical screens so they are solely handled by AirlockScreenRenderer', () => {
  const root = new THREE.Group();
  const geom = new THREE.PlaneGeometry(1.5, 1.0);
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial());
  mesh.name = 'Airlock_Control_Console';
  root.add(mesh);

  const sr = new ScreenRenderer();
  sr.attachToModule(root, 'Airlock', { currentDay: 1 });

  // Generic ScreenRenderer must NOT bind the screen because moduleName === 'Airlock'
  assert.strictEqual(
    mesh.material.map,
    null,
    'Generic ScreenRenderer must skip Airlock physical screens'
  );

  sr.dispose();
});

// ============================================================
// DAY 1 ACCEPTANCE TESTS (AT_D1_001 to AT_D1_012)
// ============================================================

test('AT_D1_001: The player begins at the existing Habitat spawn', () => {
  const day1Config = DAYS_CONFIG[1];
  assert.strictEqual(day1Config.allowedModules[0], 'Habitat', 'Initial module must be Habitat');
  assert(day1Config.allowedModules.includes('Drone'), 'The existing Drone Section should be visitable during Sol 1');
  assert.strictEqual(day1Config.id, 'DAY_01_OUTPOST_ORIENTATION');
});

test('AT_D1_002: The Habitat introduction plays once at the start of Day 1', () => {
  mockStorage.clear();
  const mm = new MissionManager();
  assert.strictEqual(mm.hasSeenIntroduction('INTRO_HABITAT'), false);
  mm.markIntroductionSeen('INTRO_HABITAT');
  assert.strictEqual(mm.hasSeenIntroduction('INTRO_HABITAT'), true);

  // Persistence across reloads
  const mm2 = new MissionManager();
  assert.strictEqual(mm2.hasSeenIntroduction('INTRO_HABITAT'), true);
});

test('AT_D1_003: The player presses Enter during an introduction to skip', () => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(1, 1.65, 2);
  camera.quaternion.set(0, 0, 0, 1);

  const manager = new CameraPresentationManager(camera);
  const started = manager.startPresentation({
    id: 'CAM_HABITAT_OVERVIEW',
    title: 'Welcome to the Habitat',
    description: 'This is the crew living area.',
    durationSeconds: 5,
    skipKey: 'Enter',
    targetWorldPosition: new THREE.Vector3(5, 1.65, 5)
  });

  assert.strictEqual(started, true);
  assert.strictEqual(manager.isPresentationActive(), true);

  // Advance time partially
  manager.update(1.0);
  assert.strictEqual(manager.isPresentationActive(), true);

  // Player presses Enter to skip
  manager.skip();
  assert.strictEqual(manager.isPresentationActive(), false);
  assert.strictEqual(camera.position.x, 1);
  assert.strictEqual(camera.position.y, 1.65);
  assert.strictEqual(camera.position.z, 2);
});

test('AT_D1_004: Camera movement is slow and horizontal (constant Y, pitch unchanged, roll 0)', () => {
  const camera = new THREE.PerspectiveCamera();
  const initialEyeHeight = 1.65;
  camera.position.set(0, initialEyeHeight, 0);
  camera.quaternion.set(0, 0, 0, 1);

  const manager = new CameraPresentationManager(camera);
  manager.startPresentation({
    id: 'CAM_HAB_LIFE_SUPPORT_WIDE',
    title: 'Habitat Status and Life Support',
    description: 'Review Habitat displays',
    durationSeconds: 4,
    targetWorldPosition: new THREE.Vector3(3, 0.5, 3) // Target has lower Y in world
  });

  // Verify across multiple time steps that Y remains strictly constant at eye height
  for (let t = 0.5; t <= 3.5; t += 0.5) {
    manager.update(0.5);
    assert.strictEqual(
      Math.round(camera.position.y * 1000) / 1000,
      initialEyeHeight,
      `Camera Y must remain strictly horizontal at eye height ${initialEyeHeight}`
    );

    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    assert.strictEqual(
      Math.abs(euler.x) < 0.0001,
      true,
      'Camera pitch must remain 0 during horizontal presentation'
    );
    assert.strictEqual(
      Math.abs(euler.z) < 0.0001,
      true,
      'Camera roll must remain 0 during horizontal presentation'
    );
  }
});

test('AT_D1_005: Habitat shared monitor trigger presents all three status displays as one group', () => {
  const group = TRIGGER_TO_GROUP_MAP['HAB_MONITOR_01'];
  assert(group, 'HAB_MONITOR_01 must resolve to an interaction group');
  assert.strictEqual(group.id, 'HAB_LIFE_SUPPORT_GROUP');
  assert.strictEqual(group.screenObjectNames.length, 3);
  assert(group.screenObjectNames.includes('Habitat_LifeSupport_Display'));
  assert(group.screenObjectNames.includes('Habitat_Main_Status_Display'));
  assert(group.screenObjectNames.includes('Habitat_Emergency_Status_Display'));
  assert.strictEqual(group.cameraFraming.includes('wide horizontal view'), true);
});

test('AT_D1_006: Engineering shared triggers present wide views for multi-screen sections', () => {
  const monGroup = TRIGGER_TO_GROUP_MAP['Engineering_Monitoring_Trigger'];
  assert.strictEqual(monGroup.screenObjectNames.length, 3);
  assert.strictEqual(monGroup.cameraPresentationId, 'CAM_ENGINEERING_MONITORING_WIDE');

  const pwrGroup = TRIGGER_TO_GROUP_MAP['Engineering_PowerUnit_Trigger'];
  assert.strictEqual(pwrGroup.screenObjectNames.length, 4);
  assert.strictEqual(pwrGroup.cameraPresentationId, 'CAM_ENGINEERING_POWER_WIDE');

  const lsGroup = TRIGGER_TO_GROUP_MAP['Engineering_LifeSupport_Trigger'];
  assert.strictEqual(lsGroup.screenObjectNames.length, 3);
  assert.strictEqual(lsGroup.cameraPresentationId, 'CAM_ENGINEERING_LIFE_SUPPORT_WIDE');
});

test('AT_D1_007: Skipping a presentation does not complete its associated task', () => {
  mockStorage.clear();
  const mm = new MissionManager();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.65, 0);

  const manager = new CameraPresentationManager(camera);
  manager.startPresentation({
    id: 'CAM_HAB_WATER_NUTRITION',
    title: 'Water and Nutrition',
    description: 'Review water and nutrition',
    durationSeconds: 3,
    skipKey: 'Enter'
  });

  // Skip presentation
  manager.skip();

  // Task must still be incomplete
  assert.strictEqual(mm.isStepComplete('D1_HAB_WATER_NUTRITION'), false);
});

test('AT_D1_008: Removed Central Hub inspections remain interactive but do not count as required tasks', () => {
  mockStorage.clear();
  const mm = new MissionManager();

  const res1 = mm.completeStep('D1_HUB_ENVIRONMENT_STATUS');
  assert.strictEqual(res1, false);
  assert.strictEqual(mm.isStepComplete('D1_HUB_ENVIRONMENT_STATUS'), false);
  assert.strictEqual(mm.getCurrentMission().steps.length, 20);
  assert(TRIGGER_TO_GROUP_MAP['Env_Status_Display'], 'Environment status trigger must remain configured');
  assert.strictEqual(TRIGGER_TO_TASK_MAP['Env_Status_Display'], undefined, 'Removed inspections must not map to a Sol 1 task');

  const res2 = mm.completeStep('D1_HUB_ENVIRONMENT_STATUS');
  assert.strictEqual(res2, false);
  assert.strictEqual(mm.getState().completedStepIds.length, 0);
});

test('AT_D1_009: Rest trigger is blocked while required Day 1 tasks remain incomplete', () => {
  mockStorage.clear();
  const mm = new MissionManager();

  // Only complete 1 of 20 required tasks
  mm.completeStep('D1_HAB_LIFE_SUPPORT');

  const check = mm.canRestAndAdvance();
  assert.strictEqual(check.canAdvance, false);
  assert.strictEqual(check.reason.includes('Complete the remaining outpost orientation tasks before resting'), true);
  assert.strictEqual(check.reason.includes('19 of 20 tasks remaining'), true);

  const adv = mm.advanceDay();
  assert.strictEqual(adv.success, false);
  assert.strictEqual(mm.getState().currentDay, 1);
});

test('AT_D1_010: Player rests after completing every required task, advancing to Day 2 exactly once', () => {
  mockStorage.clear();
  const mm = new MissionManager();

  // Complete all 20 required tasks
  for (const t of DAY1_TASKS.filter(task => task.required)) {
    mm.completeStep(t.taskId);
  }

  assert.strictEqual(mm.getState().completedStepIds.length, 20);
  assert.strictEqual(mm.getState().objectiveState, 'completed');

  const check = mm.canRestAndAdvance();
  assert.strictEqual(check.canAdvance, true);

  const adv = mm.advanceDay();
  assert.strictEqual(adv.success, true);
  assert.strictEqual(adv.newDay, 2);
  assert.strictEqual(mm.getState().currentDay, 2);

  // Duplicate rest does not advance past Day 2
  const check2 = mm.canRestAndAdvance();
  assert.strictEqual(check2.canAdvance, false, 'Day 2 objectives must now be completed before resting again');
});

test('AT_D1_011: Unresolved target fallback runs presentation without camera motion', () => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(3, 1.65, 4);
  camera.quaternion.set(0, 0, 0, 1);

  const manager = new CameraPresentationManager(camera);
  manager.startPresentation({
    id: 'CAM_MISSING_TARGET',
    title: 'Unresolved Screen',
    description: 'Target mesh is null',
    durationSeconds: 3,
    targetMesh: null,
    targetWorldPosition: null
  });

  manager.update(1.5);
  // Position should have zero translation
  assert.strictEqual(camera.position.x, 3);
  assert.strictEqual(camera.position.y, 1.65);
  assert.strictEqual(camera.position.z, 4);

  manager.update(2.0);
  assert.strictEqual(manager.isPresentationActive(), false);
});

test('AT_D1_012: 20 required tasks are uniquely configured, mapped, and validated', () => {
  assert.strictEqual(DAY1_TASKS.length, 20, 'Only required Sol 1 tasks should be defined');
  const taskSet = new Set(DAY1_TASKS.map(t => t.taskId));
  assert.strictEqual(taskSet.size, 20, 'All task IDs must be unique');

  const day1Steps = DAYS_CONFIG[1].steps;
  assert.strictEqual(day1Steps.length, 20, 'DAYS_CONFIG[1].steps must contain only required tasks');

  // Verify all zones are accounted for
  assert.strictEqual(DAY1_ZONES.length, 7, 'Must include the existing Drone Section alongside the 6 outpost zones');
  const zoneSet = new Set(DAY1_ZONES.map(z => z.zoneId));
  assert.strictEqual(zoneSet.size, 7);
  assert(zoneSet.has('HABITAT'));
  assert(zoneSet.has('CENTRAL_HUB'));
  assert(zoneSet.has('ENGINEERING_UNIT'));
  assert(zoneSet.has('RESEARCH_LAB'));
  assert(zoneSet.has('MISSION_CONTROL'));
  assert(zoneSet.has('AIRLOCK'));
  assert(zoneSet.has('DRONE_SECTION'));
});

test('AT_D1_013: Drone Section task requires E on the existing drone inside the Drone module', () => {
  mockStorage.clear();
  const mm = new MissionManager();
  const progressBefore = mm.getMissionTaskProgress();
  assert.strictEqual(progressBefore.total, 20);
  assert.strictEqual(progressBefore.completed, 0);
  assert.strictEqual(TRIGGER_TO_TASK_MAP['DroneZone_Entrance_Trigger'], undefined, 'Entering cannot validate the inspection task');
  assert.strictEqual(mm.isStepComplete('D1_DRONE_SECTION'), false);
  assert.strictEqual(mm.getCurrentNavigationInstruction().destinationName, 'Habitat Main Monitor');
  const taskCard = mm.getMissionTaskCards().find(task => task.id === 'D1_DRONE_SECTION');
  assert(taskCard, 'Drone Section must appear as a normal Sol 1 task card');
  assert.strictEqual(taskCard.title, 'Drone Section');
  assert.strictEqual(taskCard.status, 'available');
  assert.strictEqual(taskCard.moduleName, 'Drone Section');
  assert.strictEqual(taskCard.targetTrigger, 'Drone');

  const wrongModule = mm.handleContextEvent({ type: 'trigger_interacted', module: 'Airlock', identifier: 'Drone' });
  assert.strictEqual(wrongModule.handled, true);
  assert.strictEqual(mm.isStepComplete('D1_DRONE_SECTION'), false, 'An invalid module interaction must not complete the task');

  const entered = mm.handleContextEvent({ type: 'module_entered', module: 'Drone' });
  assert.strictEqual(entered.handled, false);
  assert.strictEqual(mm.isStepComplete('D1_DRONE_SECTION'), false, 'Entering the module must not complete the task');

  const inspected = mm.handleContextEvent({ type: 'trigger_interacted', module: 'Drone', identifier: 'Drone' });
  assert.strictEqual(inspected.handled, true);
  assert.strictEqual(mm.isStepComplete('D1_DRONE_SECTION'), true);
  assert.strictEqual(mm.getMissionTaskProgress().completed, 1);
  assert.strictEqual(mm.getMissionTaskProgress().remaining, 19);
  assert.notStrictEqual(mm.getCurrentNavigationInstruction().taskId, 'D1_DRONE_SECTION');
  assert.strictEqual(TRIGGER_TO_GROUP_MAP['Drone'].taskId, 'D1_DRONE_SECTION');
});

console.log(`\nResults: ${passedTests} / ${totalTests} tests passed.\n`);
if (passedTests === totalTests) {
  console.log('ALL PHASE 2 & PHASE 3 MISSION TESTS PASSED SUCCESSFULLY.');
}
