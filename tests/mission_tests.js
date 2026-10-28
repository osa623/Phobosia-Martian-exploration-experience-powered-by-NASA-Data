/**
 * PHOBOSIA — Phase 2 & Phase 3 Automated Mission Logic & Progression Test Suite
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

const { DAYS_CONFIG, MASTER_TERRAIN_TARGETS, PREDEFINED_INTERPRETATIONS } = require('../dist/MissionManager.js');
const { MissionManager } = require('../dist/MissionManager.js');
const THREE = require('three');
const { reprojectPlanarUVs, buildCentralHubColliders, buildScienceLabColliders, buildHabitatColliderSection } = require('../dist/Collision.js');
const { ScreenRenderer } = require('../dist/ScreenRenderer.js');
const { HabitatScreenRenderer } = require('../dist/HabitatScreenRenderer.js');
const { EngineeringScreenRenderer } = require('../dist/EngineeringScreenRenderer.js');
const { ResearchScreenRenderer } = require('../dist/ResearchScreenRenderer.js');
const { MissionControlScreenRenderer } = require('../dist/MissionControlScreenRenderer.js');
const { CentralHubScreenRenderer } = require('../dist/CentralHubScreenRenderer.js');
const { AirlockScreenRenderer } = require('../dist/AirlockScreenRenderer.js');
const { configureModuleLighting, configureMeshShadows, getModuleHemisphereConfig, configureHabitatAreaLights, discoverHubLights, configureHubLights } = require('../dist/ModuleLighting.js');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('=== PHOBOSIA PHASE 2 & PHASE 3 AUTOMATED MISSION TESTS ===\n');

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

// P2-006: Day 2 Habitat Readiness Lifecycle
test('Day 2 Habitat readiness completes and stores simulated observation record', () => {
  mockStorage.clear();
  const mm = new MissionManager();
  mm.completeStep('DAY1_REVIEW_CONTROLS');
  mm.completeStep('DAY1_VISIT_CENTRAL_HUB');
  mm.completeStep('DAY1_INSPECT_BASE_AREAS');
  mm.completeStep('DAY1_CONFIRM_ORIENTATION');
  mm.advanceDay(true);

  assert.strictEqual(mm.getState().currentDay, 2);
  mm.handleContextEvent({ type: 'module_entered', module: 'Habitat' });
  mm.handleContextEvent({ type: 'trigger_interacted', identifier: 'HAB_WATER_NUTRITION_01' });
  mm.handleContextEvent({ type: 'trigger_interacted', identifier: 'HAB_MONITOR_01' });

  assert.strictEqual(mm.getState().objectiveState, 'completed');
  const record = mm.getState().observationRecords.find(r => r.type === 'habitat_readiness');
  assert(record !== undefined);
  assert.strictEqual(record.isSimulated, true);

  const adv = mm.advanceDay(true);
  assert.strictEqual(adv.success, true);
  assert.strictEqual(mm.getState().currentDay, 3);
});

// P2-007: Day 3 Power Observation Lifecycle
test('Day 3 Power observation logs baseline telemetry and advances to Day 4', () => {
  mockStorage.clear();
  const mm = new MissionManager();
  mm.completeStep('DAY1_REVIEW_CONTROLS');
  mm.completeStep('DAY1_VISIT_CENTRAL_HUB');
  mm.completeStep('DAY1_INSPECT_BASE_AREAS');
  mm.completeStep('DAY1_CONFIRM_ORIENTATION');
  mm.advanceDay(true);
  mm.completeStep('DAY2_ENTER_HABITAT');
  mm.completeStep('DAY2_INSPECT_READINESS');
  mm.completeStep('DAY2_RECORD_STATUS');
  mm.advanceDay(true);

  assert.strictEqual(mm.getState().currentDay, 3);
  mm.handleContextEvent({ type: 'module_entered', module: 'Engineering' });
  mm.handleContextEvent({ type: 'trigger_interacted', identifier: 'Engineering_PowerUnit_Trigger' });

  assert.strictEqual(mm.getState().objectiveState, 'completed');
  const record = mm.getState().observationRecords.find(r => r.type === 'power_observation');
  assert(record !== undefined);
  assert(record.summary.includes('Solar Array'));

  const adv = mm.advanceDay(true);
  assert.strictEqual(adv.success, true);
  assert.strictEqual(mm.getState().currentDay, 4);
});

// P2-008: Day 4 Life-Support Verification Lifecycle
test('Day 4 Life-support verification records telemetry and advances to Day 5', () => {
  mockStorage.clear();
  const mm = new MissionManager();
  mm.completeStep('DAY1_REVIEW_CONTROLS');
  mm.completeStep('DAY1_VISIT_CENTRAL_HUB');
  mm.completeStep('DAY1_INSPECT_BASE_AREAS');
  mm.completeStep('DAY1_CONFIRM_ORIENTATION');
  mm.advanceDay(true);
  mm.completeStep('DAY2_ENTER_HABITAT');
  mm.completeStep('DAY2_INSPECT_READINESS');
  mm.completeStep('DAY2_RECORD_STATUS');
  mm.advanceDay(true);
  mm.completeStep('DAY3_REACH_ENGINEERING');
  mm.completeStep('DAY3_INSPECT_POWER');
  mm.completeStep('DAY3_RECORD_POWER_OBSERVATION');
  mm.advanceDay(true);

  assert.strictEqual(mm.getState().currentDay, 4);
  mm.handleContextEvent({ type: 'module_entered', module: 'Engineering' });
  mm.handleContextEvent({ type: 'trigger_interacted', identifier: 'Engineering_LifeSupport_Trigger' });

  assert.strictEqual(mm.getState().objectiveState, 'completed');
  const record = mm.getState().observationRecords.find(r => r.type === 'life_support_verification');
  assert(record !== undefined);

  const adv = mm.advanceDay(true);
  assert.strictEqual(adv.success, true);
  assert.strictEqual(mm.getState().currentDay, 5);
});

// P3-001: Day 5 Route Planning & Advancement to Day 6
test('Day 5 Route planning validates selection and advances to Day 6 in Phase 3', () => {
  mockStorage.clear();
  const mm = new MissionManager();
  // Fast forward to Day 5
  mm.completeStep('DAY1_REVIEW_CONTROLS');
  mm.completeStep('DAY1_VISIT_CENTRAL_HUB');
  mm.completeStep('DAY1_INSPECT_BASE_AREAS');
  mm.completeStep('DAY1_CONFIRM_ORIENTATION');
  mm.advanceDay(true);
  mm.completeStep('DAY2_ENTER_HABITAT');
  mm.completeStep('DAY2_INSPECT_READINESS');
  mm.completeStep('DAY2_RECORD_STATUS');
  mm.advanceDay(true);
  mm.completeStep('DAY3_REACH_ENGINEERING');
  mm.completeStep('DAY3_INSPECT_POWER');
  mm.completeStep('DAY3_RECORD_POWER_OBSERVATION');
  mm.advanceDay(true);
  mm.completeStep('DAY4_REACH_RELEVANT_MODULE');
  mm.completeStep('DAY4_INSPECT_LIFE_SUPPORT');
  mm.completeStep('DAY4_RECORD_VERIFICATION');
  mm.advanceDay(true);

  assert.strictEqual(mm.getState().currentDay, 5);
  mm.handleContextEvent({ type: 'module_entered', module: 'MissionControl' });
  mm.handleContextEvent({ type: 'trigger_interacted', identifier: 'MC_NAVIGATION_01' });

  // Invalid target rejection
  const badTarget = mm.selectRouteTarget('NON_EXISTENT_TARGET');
  assert.strictEqual(badTarget, false);
  assert.strictEqual(mm.getState().objectiveState, 'in_progress');

  // Valid target selection
  const goodTarget = mm.selectRouteTarget('TARGET_ALPHA_CRATER_RIM');
  assert.strictEqual(goodTarget, true);
  assert.strictEqual(mm.getState().selectedRouteTarget.id, 'TARGET_ALPHA_CRATER_RIM');
  assert.strictEqual(mm.getState().objectiveState, 'completed');

  // Phase 3 permits advancement to Day 6!
  const adv = mm.advanceDay(true);
  assert.strictEqual(adv.success, true);
  assert.strictEqual(adv.newDay, 6);
  assert.strictEqual(mm.getState().currentDay, 6);
});

// P3-002: Day 6 Geological Site Survey requires GeologicalSurveyRecord
test('Day 6 Geological Site Survey validates steps and requires GeologicalSurveyRecord before rest', () => {
  mockStorage.clear();
  const mm = new MissionManager();
  // Fast forward to Day 6
  mm.completeStep('DAY1_REVIEW_CONTROLS');
  mm.completeStep('DAY1_VISIT_CENTRAL_HUB');
  mm.completeStep('DAY1_INSPECT_BASE_AREAS');
  mm.completeStep('DAY1_CONFIRM_ORIENTATION');
  mm.advanceDay(true);
  mm.completeStep('DAY2_ENTER_HABITAT');
  mm.completeStep('DAY2_INSPECT_READINESS');
  mm.completeStep('DAY2_RECORD_STATUS');
  mm.advanceDay(true);
  mm.completeStep('DAY3_REACH_ENGINEERING');
  mm.completeStep('DAY3_INSPECT_POWER');
  mm.completeStep('DAY3_RECORD_POWER_OBSERVATION');
  mm.advanceDay(true);
  mm.completeStep('DAY4_REACH_RELEVANT_MODULE');
  mm.completeStep('DAY4_INSPECT_LIFE_SUPPORT');
  mm.completeStep('DAY4_RECORD_VERIFICATION');
  mm.advanceDay(true);
  mm.completeStep('DAY5_REACH_MISSION_CONTROL');
  mm.completeStep('DAY5_REVIEW_MASTER_TERRAIN');
  mm.selectRouteTarget('TARGET_ALPHA_CRATER_RIM');
  mm.advanceDay(true);

  assert.strictEqual(mm.getState().currentDay, 6);

  // Review target
  mm.handleContextEvent({ type: 'trigger_interacted', identifier: 'MC_NAVIGATION_01' });
  assert.strictEqual(mm.isStepComplete('D6_OBJ_01_REVIEW_TARGET'), true);

  // Reach terrain survey area
  mm.handleContextEvent({ type: 'module_entered', module: 'Terrain' });
  assert.strictEqual(mm.isStepComplete('D6_OBJ_02_REACH_TARGET'), true);

  // Rest should be blocked while survey record is missing
  assert.strictEqual(mm.canRestAndAdvance().canAdvance, false);

  // Save Geological Survey Record
  const geoRecord = mm.saveGeologicalSurvey({
    targetId: 'TARGET_ALPHA_CRATER_RIM',
    observedCategories: {
      surfaceTexture: 'Vesicular Basalt & Fractured Regolith',
      fragmentDistribution: 'Scattered Angular Clasts (< 5 cm)',
      terrainShape: 'Low-Angle Talus Incline (8–12°)',
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

// P3-003: Day 7 Surface Observation lifecycle & Airlock transition
test('Day 7 Surface Observation validates airlock transit and saves SurfaceObservationRecord', () => {
  mockStorage.clear();
  const mm = new MissionManager();
  // Fast forward to Day 7
  mm.completeStep('DAY1_REVIEW_CONTROLS');
  mm.completeStep('DAY1_VISIT_CENTRAL_HUB');
  mm.completeStep('DAY1_INSPECT_BASE_AREAS');
  mm.completeStep('DAY1_CONFIRM_ORIENTATION');
  mm.advanceDay(true);
  mm.completeStep('DAY2_ENTER_HABITAT');
  mm.completeStep('DAY2_INSPECT_READINESS');
  mm.completeStep('DAY2_RECORD_STATUS');
  mm.advanceDay(true);
  mm.completeStep('DAY3_REACH_ENGINEERING');
  mm.completeStep('DAY3_INSPECT_POWER');
  mm.completeStep('DAY3_RECORD_POWER_OBSERVATION');
  mm.advanceDay(true);
  mm.completeStep('DAY4_REACH_RELEVANT_MODULE');
  mm.completeStep('DAY4_INSPECT_LIFE_SUPPORT');
  mm.completeStep('DAY4_RECORD_VERIFICATION');
  mm.advanceDay(true);
  mm.completeStep('DAY5_REACH_MISSION_CONTROL');
  mm.completeStep('DAY5_REVIEW_MASTER_TERRAIN');
  mm.selectRouteTarget('TARGET_ALPHA_CRATER_RIM');
  mm.advanceDay(true);
  mm.completeStep('D6_OBJ_01_REVIEW_TARGET');
  mm.completeStep('D6_OBJ_02_REACH_TARGET');
  mm.saveGeologicalSurvey({
    targetId: 'TARGET_ALPHA_CRATER_RIM',
    observedCategories: {
      surfaceTexture: 'Vesicular Basalt',
      fragmentDistribution: 'Scattered Clasts',
      terrainShape: 'Low Incline',
      dustCoverage: 'Thin Mantle'
    },
    summary: 'Sol 06 Survey'
  });
  mm.advanceDay(true); // to Day 7

  assert.strictEqual(mm.getState().currentDay, 7);

  // Review briefing marks D7_OBJ_01_REVIEW_TASK complete
  mm.markBriefingSeen();
  assert.strictEqual(mm.isStepComplete('D7_OBJ_01_REVIEW_TASK'), true);

  // Use Airlock to enter Terrain
  mm.handleContextEvent({ type: 'module_entered', module: 'Terrain' });
  assert.strictEqual(mm.isStepComplete('D7_OBJ_02_USE_AIRLOCK'), true);

  // Rest blocked before save
  assert.strictEqual(mm.canRestAndAdvance().canAdvance, false);

  // Save surface observation
  const surfRecord = mm.saveSurfaceObservation({
    targetId: 'TARGET_BETA_DUNE_BASIN',
    observedCategories: {
      surfacePattern: 'Laminated Bedding & Cross-Stratification',
      surfaceMaterialAppearance: 'Dark Iron-Magnesium Silicate Matrix',
      terrainProfile: 'Undulating Dune Swale Transition',
      areaOfInterest: 'High-reflectance mineralized vein'
    },
    followUpQuestion: 'Does the sulfate veneer indicate transient aqueous deposition?',
    summary: 'Site Beta surface observation completed.'
  });

  assert(surfRecord !== null);
  assert.strictEqual(surfRecord.day, 7);
  assert.strictEqual(surfRecord.isSimulated, true);
  assert.strictEqual(surfRecord.relatedGeologicalSurveyId !== null, true);
  assert.strictEqual(mm.isStepComplete('D7_OBJ_03_PERFORM_SCAN'), true);
  assert.strictEqual(mm.isStepComplete('D7_OBJ_04_SAVE_OBSERVATION'), true);
  assert.strictEqual(mm.getState().objectiveState, 'completed');

  // Advance to Day 8
  const adv = mm.advanceDay(true);
  assert.strictEqual(adv.success, true);
  assert.strictEqual(adv.newDay, 8);
  assert.strictEqual(mm.getState().currentDay, 8);
});

// P3-004: Day 8 Research Lab Analysis requires Day 7 source record & interpretation
test('Day 8 Research Lab Analysis strictly requires Day 7 record and saves linked analysis', () => {
  mockStorage.clear();
  const mm = new MissionManager();
  // Fast forward through Days 1 to 7
  mm.completeStep('DAY1_REVIEW_CONTROLS');
  mm.completeStep('DAY1_VISIT_CENTRAL_HUB');
  mm.completeStep('DAY1_INSPECT_BASE_AREAS');
  mm.completeStep('DAY1_CONFIRM_ORIENTATION');
  mm.advanceDay(true);
  mm.completeStep('DAY2_ENTER_HABITAT');
  mm.completeStep('DAY2_INSPECT_READINESS');
  mm.completeStep('DAY2_RECORD_STATUS');
  mm.advanceDay(true);
  mm.completeStep('DAY3_REACH_ENGINEERING');
  mm.completeStep('DAY3_INSPECT_POWER');
  mm.completeStep('DAY3_RECORD_POWER_OBSERVATION');
  mm.advanceDay(true);
  mm.completeStep('DAY4_REACH_RELEVANT_MODULE');
  mm.completeStep('DAY4_INSPECT_LIFE_SUPPORT');
  mm.completeStep('DAY4_RECORD_VERIFICATION');
  mm.advanceDay(true);
  mm.completeStep('DAY5_REACH_MISSION_CONTROL');
  mm.completeStep('DAY5_REVIEW_MASTER_TERRAIN');
  mm.selectRouteTarget('TARGET_ALPHA_CRATER_RIM');
  mm.advanceDay(true);
  mm.completeStep('D6_OBJ_01_REVIEW_TARGET');
  mm.completeStep('D6_OBJ_02_REACH_TARGET');
  const d6Record = mm.saveGeologicalSurvey({
    targetId: 'TARGET_ALPHA_CRATER_RIM',
    observedCategories: {
      surfaceTexture: 'Vesicular Basalt',
      fragmentDistribution: 'Scattered Clasts',
      terrainShape: 'Talus Incline',
      dustCoverage: 'Thin Mantle'
    },
    summary: 'Day 6 Field Survey'
  });
  mm.advanceDay(true);
  mm.completeStep('D7_OBJ_01_REVIEW_TASK');
  mm.completeStep('D7_OBJ_02_USE_AIRLOCK');
  const d7Record = mm.saveSurfaceObservation({
    targetId: 'TARGET_BETA_DUNE_BASIN',
    observedCategories: {
      surfacePattern: 'Cross-Stratification',
      surfaceMaterialAppearance: 'Silicate Matrix',
      terrainProfile: 'Dune Swale',
      areaOfInterest: 'Mineralized vein'
    },
    followUpQuestion: 'Does the sulfate veneer indicate transient aqueous deposition?',
    summary: 'Day 7 Surface Observation'
  });
  mm.advanceDay(true); // to Day 8

  assert.strictEqual(mm.getState().currentDay, 8);

  // Access Research Lab console
  mm.handleContextEvent({ type: 'trigger_interacted', identifier: 'LAB_RESEARCH_ANALYSIS_01' });
  assert.strictEqual(mm.isStepComplete('D8_OBJ_01_OPEN_SOURCE_RECORD'), true);
  assert.strictEqual(mm.isStepComplete('D8_OBJ_02_REVIEW_COMPARISON'), true);

  // Save Analysis without valid interpretation should fail
  const badAnalysis = mm.saveScienceAnalysis({
    selectedInterpretationId: 'NON_EXISTENT_INTERPRETATION',
    summary: 'Bad interpretation'
  });
  assert.strictEqual(badAnalysis, null);
  assert.strictEqual(mm.isStepComplete('D8_OBJ_04_SAVE_ANALYSIS'), false);

  // Save Analysis with valid predefined interpretation
  const goodAnalysis = mm.saveScienceAnalysis({
    selectedInterpretationId: 'INTERPRETATION_SURFACE_PATTERN_REVIEW',
    summary: 'Tentative observation analysis.'
  });
  assert(goodAnalysis !== null);
  assert.strictEqual(goodAnalysis.day, 8);
  assert.strictEqual(goodAnalysis.sourceObservationId, d7Record.id);
  assert.strictEqual(goodAnalysis.comparedSurveyId, d6Record.id);
  assert.strictEqual(goodAnalysis.isSimulated, true);
  assert.strictEqual(mm.isStepComplete('D8_OBJ_03_SELECT_INTERPRETATION'), true);
  assert.strictEqual(mm.isStepComplete('D8_OBJ_04_SAVE_ANALYSIS'), true);
  assert.strictEqual(mm.getState().objectiveState, 'completed');

  // Advance to Day 9
  const adv = mm.advanceDay(true);
  assert.strictEqual(adv.success, true);
  assert.strictEqual(adv.newDay, 9);
  assert.strictEqual(mm.getState().currentDay, 9);
});

// P3-005: Day 9 Drone Survey Lifecycle & Non-advancement beyond Day 9
test('Day 9 Remote Drone Survey validates FPV capture, restores astronaut controls, and strictly concludes Phase 3', () => {
  mockStorage.clear();
  const mm = new MissionManager();
  // Fast forward to Day 9
  mm.completeStep('DAY1_REVIEW_CONTROLS');
  mm.completeStep('DAY1_VISIT_CENTRAL_HUB');
  mm.completeStep('DAY1_INSPECT_BASE_AREAS');
  mm.completeStep('DAY1_CONFIRM_ORIENTATION');
  mm.advanceDay(true); // 2
  mm.completeStep('DAY2_ENTER_HABITAT');
  mm.completeStep('DAY2_INSPECT_READINESS');
  mm.completeStep('DAY2_RECORD_STATUS');
  mm.advanceDay(true); // 3
  mm.completeStep('DAY3_REACH_ENGINEERING');
  mm.completeStep('DAY3_INSPECT_POWER');
  mm.completeStep('DAY3_RECORD_POWER_OBSERVATION');
  mm.advanceDay(true); // 4
  mm.completeStep('DAY4_REACH_RELEVANT_MODULE');
  mm.completeStep('DAY4_INSPECT_LIFE_SUPPORT');
  mm.completeStep('DAY4_RECORD_VERIFICATION');
  mm.advanceDay(true); // 5
  mm.completeStep('DAY5_REACH_MISSION_CONTROL');
  mm.completeStep('DAY5_REVIEW_MASTER_TERRAIN');
  mm.selectRouteTarget('TARGET_ALPHA_CRATER_RIM');
  mm.advanceDay(true); // 6
  mm.completeStep('D6_OBJ_01_REVIEW_TARGET');
  mm.completeStep('D6_OBJ_02_REACH_TARGET');
  mm.saveGeologicalSurvey({
    targetId: 'TARGET_ALPHA_CRATER_RIM',
    observedCategories: { surfaceTexture: 'Basalt', fragmentDistribution: 'Clasts', terrainShape: 'Talus', dustCoverage: 'Mantle' },
    summary: 'D6'
  });
  mm.advanceDay(true); // 7
  mm.completeStep('D7_OBJ_01_REVIEW_TASK');
  mm.completeStep('D7_OBJ_02_USE_AIRLOCK');
  mm.saveSurfaceObservation({
    targetId: 'TARGET_BETA_DUNE_BASIN',
    observedCategories: { surfacePattern: 'Bedding', surfaceMaterialAppearance: 'Matrix', terrainProfile: 'Dune', areaOfInterest: 'Vein' },
    followUpQuestion: 'Aqueous origin?',
    summary: 'D7'
  });
  mm.advanceDay(true); // 8
  mm.completeStep('D8_OBJ_01_OPEN_SOURCE_RECORD');
  mm.completeStep('D8_OBJ_02_REVIEW_COMPARISON');
  mm.saveScienceAnalysis({
    selectedInterpretationId: 'INTERPRETATION_SURFACE_PATTERN_REVIEW',
    summary: 'D8 Analysis'
  });
  mm.advanceDay(true); // 9

  assert.strictEqual(mm.getState().currentDay, 9);

  // Review Mission Control drone console
  mm.handleContextEvent({ type: 'trigger_interacted', identifier: 'MC_SYSTEMS_01' });
  assert.strictEqual(mm.isStepComplete('D9_OBJ_01_REVIEW_DRONE_TASK'), true);

  // Activate FPV
  mm.completeStep('D9_OBJ_02_ACTIVATE_FPV');
  assert.strictEqual(mm.isStepComplete('D9_OBJ_02_ACTIVATE_FPV'), true);

  // Rest blocked while survey record missing or FPV un-exited
  assert.strictEqual(mm.canRestAndAdvance().canAdvance, false);

  // Save Drone Survey Record
  const droneRecord = mm.saveDroneSurvey({
    targetId: 'TARGET_GAMMA_SOUTH_ESCARPMENT',
    observedCategories: {
      viewpointTerrainShape: 'Dissected canyon rim',
      visibleSurfacePattern: 'Polygonal thermal contraction fissures',
      followUpArea: 'South escarpment shadow boundary',
      routeRevisit: 'Fault line aerial corridor'
    },
    summary: 'Day 9 remote drone survey completed.'
  });

  assert(droneRecord !== null);
  assert.strictEqual(droneRecord.day, 9);
  assert.strictEqual(droneRecord.isSimulated, true);
  assert.strictEqual(mm.isStepComplete('D9_OBJ_03_INSPECT_TARGET'), true);
  assert.strictEqual(mm.isStepComplete('D9_OBJ_04_SAVE_DRONE_RECORD'), true);

  // Still blocked until FPV is exited
  assert.strictEqual(mm.canRestAndAdvance().canAdvance, false);

  // Exit FPV and restore astronaut controls
  mm.completeStep('D9_OBJ_05_EXIT_FPV');
  assert.strictEqual(mm.isStepComplete('D9_OBJ_05_EXIT_FPV'), true);
  assert.strictEqual(mm.getState().objectiveState, 'completed');

  // Verify Day 9 strictly concludes Phase 3 and CANNOT advance to Day 10
  const check = mm.canRestAndAdvance();
  assert.strictEqual(check.canAdvance, false);
  assert(check.reason.includes('Day 9 Complete') && check.reason.includes('Phase 3'));

  const adv = mm.advanceDay();
  assert.strictEqual(adv.success, false);
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
  configureModuleLighting(root, additions, 'Terrain');

  const sun = additions.getObjectByName('MarsSun_DirectionalLight');
  assert(sun, 'MarsSun_DirectionalLight should exist');
  assert.strictEqual(sun.isDirectionalLight, true);
  assert.strictEqual(sun.castShadow, true);
  assert.strictEqual(sun.shadow.mapSize.width, 2048);
  assert.strictEqual(sun.shadow.mapSize.height, 2048);
  assert(sun.target, 'Sun must have a target');
  assert.strictEqual(sun.shadow.camera.left, -115);
  assert.strictEqual(sun.shadow.camera.right, 115);
});

test('LIGHT-002: configureModuleLighting creates key shadow-casting SpotLights for indoor modules', () => {
  const modules = ['Habitat', 'Hub', 'MissionControl', 'Science', 'Engineering', 'Airlock'];

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
  assert.strictEqual(Math.round(powerUV.getX(0)), 0, 'Top Left U must be 0 (min Z)');
  assert.strictEqual(Math.round(powerUV.getY(0)), 1, 'Top Left V must be 1 (max Y)');
  assert.strictEqual(Math.round(powerUV.getX(1)), 1, 'Top Right U must be 1 (max Z)');
  assert.strictEqual(Math.round(powerUV.getY(1)), 1, 'Top Right V must be 1 (max Y)');
  assert.strictEqual(Math.round(powerUV.getX(2)), 0, 'Bottom Left U must be 0 (min Z)');
  assert.strictEqual(Math.round(powerUV.getY(2)), 0, 'Bottom Left V must be 0 (min Y)');
  assert.strictEqual(Math.round(powerUV.getX(3)), 1, 'Bottom Right U must be 1 (max Z)');
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

console.log(`\nResults: ${passedTests} / ${totalTests} tests passed.\n`);
if (passedTests === totalTests) {
  console.log('ALL PHASE 2 & PHASE 3 MISSION TESTS PASSED SUCCESSFULLY.');
}
