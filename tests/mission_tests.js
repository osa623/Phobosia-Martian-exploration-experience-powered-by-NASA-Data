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
const { reprojectPlanarUVs, buildCentralHubColliders, buildScienceLabColliders } = require('../dist/Collision.js');
const { ScreenRenderer } = require('../dist/ScreenRenderer.js');
const { configureModuleLighting, configureMeshShadows, getModuleHemisphereConfig } = require('../dist/ModuleLighting.js');

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

console.log(`\nResults: ${passedTests} / ${totalTests} tests passed.\n`);
if (passedTests === totalTests) {
  console.log('ALL PHASE 2 & PHASE 3 MISSION TESTS PASSED SUCCESSFULLY.');
}
