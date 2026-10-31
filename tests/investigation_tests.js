const assert = require('assert');
const { MissionManager, DAYS_CONFIG, MASTER_TERRAIN_TARGETS } = require('../dist/core/MissionManager.js');
const { SOL2_INVESTIGATION_RULES } = require('../dist/missions/sol-02/taskDefinitions.js');

const missionStorage = new Map();
global.localStorage = { getItem: key => missionStorage.get(key) ?? null, setItem: (key, value) => missionStorage.set(key, value), removeItem: key => missionStorage.delete(key) };
const manager = new MissionManager();
manager.resetProgress();
DAYS_CONFIG[1].steps.forEach(step => manager.completeStep(step.stepId));
assert.strictEqual(manager.advanceDay(true).success, true);
assert.strictEqual(manager.canRestAndAdvance().canAdvance, false, 'Sol 2 cannot rest without submitted records');
assert.strictEqual(manager.submitInvestigation({ taskId: 'SOL02_HABITAT_STATUS', evidenceReferences: [], classification: 'insufficient_evidence', rationale: 'Not enough data to decide.', procedureChecks: [1, 2, 3, 4] }).success, false);

const logIds = {
  SOL02_HABITAT_STATUS: ['HAB-STATUS-MAIN'], SOL02_WATER_NUTRITION: ['HAB-WATER-NUTRITION'],
  SOL02_ENGINEERING_MONITORING: ['ENG-MON-INDICATORS'], SOL02_POWER_REVIEW: ['ENG-POWER-MAIN'],
  SOL02_ENGINEERING_LIFESUPPORT: ['ENG-LS-ENVIRONMENT'], SOL02_DIAGNOSTICS: ['ENG-DIAG-WORKBENCH']
};
DAYS_CONFIG[2].steps.slice(0, 6).forEach(task => {
  const rule = SOL2_INVESTIGATION_RULES[task.stepId];
  const result = manager.submitInvestigation({ taskId: task.stepId, evidenceReferences: logIds[task.stepId], classification: 'insufficient_evidence', rationale: 'Reference limits or time context are incomplete.', limitations: ['Evidence is simulated and incomplete.'], procedureChecks: Array.from({ length: rule.procedureCount }, (_, i) => `${task.stepId}:${i}`) });
  assert.strictEqual(result.success, true, result.message);
});
assert.strictEqual(manager.submitInvestigation({ taskId: 'SOL02_READINESS_ASSESSMENT', evidenceReferences: [], classification: 'undetermined', rationale: 'Evidence limits prevent a readiness decision.', procedureChecks: [] }).success, false);
const sol2Refs = manager.getInvestigationRecords().map(record => record.id);
assert.strictEqual(manager.submitInvestigation({ taskId: 'SOL02_READINESS_ASSESSMENT', evidenceReferences: sol2Refs, classification: 'undetermined', rationale: 'Evidence limits prevent a readiness decision.', limitations: ['No approved system reference limits are provided.'], procedureChecks: [] }).success, true);
assert.strictEqual(manager.getState().objectiveState, 'completed');
assert.strictEqual(manager.advanceDay(true).success, true);

const submit3 = (taskId, evidenceReferences, extra = {}) => manager.submitInvestigation({ taskId, evidenceReferences, classification: 'insufficient_evidence', rationale: 'Use only the limited simulated mission metadata.', limitations: ['No external scientific measurements.'], procedureChecks: [`${taskId}:0`, `${taskId}:1`], ...extra });
assert.strictEqual(submit3('SOL03_MISSION_CONTEXT', ['SOL03-MISSION-CONTEXT']).success, true);
assert.strictEqual(submit3('SOL03_OBSERVATION_SITE_REVIEW', [`TARGET:${MASTER_TERRAIN_TARGETS[0].id}`, `TARGET:${MASTER_TERRAIN_TARGETS[1].id}`]).success, false, 'The comparison requires all three target profile references');
assert.strictEqual(submit3('SOL03_OBSERVATION_SITE_REVIEW', MASTER_TERRAIN_TARGETS.map(target => `TARGET:${target.id}`)).success, true);
assert.strictEqual(submit3('SOL03_SYSTEM_CONSTRAINTS', ['SOL03-COMMS-SYSTEMS']).success, true);
assert.strictEqual(submit3('SOL03_SELECT_TARGET', [], { selectedTargetId: MASTER_TERRAIN_TARGETS[0].id, scientificQuestion: 'Which profile merits a future observation?' }).success, true, 'Selecting a target must submit without a separate hidden evidence checkbox');
assert(manager.getInvestigationRecords().find(record => record.taskId === 'SOL03_SELECT_TARGET').evidenceReferences.includes(`TARGET:${MASTER_TERRAIN_TARGETS[0].id}`), 'The selected target profile is retained as supporting evidence');
assert.strictEqual(manager.getSelectedSiteId(), null, 'A provisional target must not become the official mission target');
assert.strictEqual(manager.getProposedSiteId(), MASTER_TERRAIN_TARGETS[0].id, 'The proposal choice remains available for review');
assert.strictEqual(submit3('SOL03_SELECT_DATASET', ['DATASET:PHOBOSIA_TARGET_PROFILE_TRAINING'], { datasetId: 'PHOBOSIA_TARGET_PROFILE_TRAINING' }).success, true);
assert.strictEqual(manager.submitInvestigation({ taskId: 'SOL03_SUBMIT_TARGET_RECORD', evidenceReferences: [], classification: 'proposal', rationale: 'Proposal rationale is supported by the selected training record.', procedureChecks: [], selectedTargetId: 'NONEXISTENT', datasetId: 'PHOBOSIA_TARGET_PROFILE_TRAINING', scientificQuestion: 'What should be observed?' }).success, false);
const proposalRefs = manager.getInvestigationRecords().filter(record => record.taskId.startsWith('SOL03_')).map(record => record.id);
assert.strictEqual(manager.submitInvestigation({ taskId: 'SOL03_SUBMIT_TARGET_RECORD', evidenceReferences: [...proposalRefs, 'DATASET:PHOBOSIA_TARGET_PROFILE_TRAINING'], classification: 'proposal_submitted', rationale: 'Proposal rationale is supported by the selected training record.', limitations: ['Training metadata only; no measurements.'], procedureChecks: [], selectedTargetId: MASTER_TERRAIN_TARGETS[0].id, datasetId: 'PHOBOSIA_TARGET_PROFILE_TRAINING', scientificQuestion: 'What surface context should a future observation examine?' }).success, false, 'Final proposal evidence must reference submitted record IDs, not raw catalogue IDs');
assert.strictEqual(manager.submitInvestigation({ taskId: 'SOL03_SUBMIT_TARGET_RECORD', evidenceReferences: proposalRefs, classification: 'proposal_submitted', rationale: 'The profile prioritizes a future observation while data limitations remain.', limitations: ['Training metadata only; no measurements.'], procedureChecks: [], selectedTargetId: MASTER_TERRAIN_TARGETS[0].id, datasetId: 'PHOBOSIA_TARGET_PROFILE_TRAINING', scientificQuestion: 'What surface context should a future observation examine?' }).success, true);
assert.strictEqual(manager.getSelectedSiteId(), MASTER_TERRAIN_TARGETS[0].id, 'Only a validated proposal establishes the official target');
assert.strictEqual(submit3('SOL03_SELECT_TARGET', [], { selectedTargetId: MASTER_TERRAIN_TARGETS[1].id, scientificQuestion: 'Can the locked target be replaced?' }).success, false, 'A submitted target cannot be changed through the normal selection task');
assert.strictEqual(manager.canRestAndAdvance().canAdvance, true);
manager.resetProgress();

// Exercise the full Sol 3 submission path with each catalogue target and confirm
// the canonical reference survives the Sol 3 -> Sol 4 mission transition.
for (const target of MASTER_TERRAIN_TARGETS) {
  missionStorage.clear();
  const scenario = new MissionManager();
  scenario.resetProgress();
  DAYS_CONFIG[1].steps.forEach(step => scenario.completeStep(step.stepId));
  assert.strictEqual(scenario.advanceDay(true).success, true);
  const sol2LogIds = {
    SOL02_HABITAT_STATUS: ['HAB-STATUS-MAIN'], SOL02_WATER_NUTRITION: ['HAB-WATER-NUTRITION'],
    SOL02_ENGINEERING_MONITORING: ['ENG-MON-INDICATORS'], SOL02_POWER_REVIEW: ['ENG-POWER-MAIN'],
    SOL02_ENGINEERING_LIFESUPPORT: ['ENG-LS-ENVIRONMENT'], SOL02_DIAGNOSTICS: ['ENG-DIAG-WORKBENCH']
  };
  DAYS_CONFIG[2].steps.slice(0, 6).forEach(task => {
    const rule = SOL2_INVESTIGATION_RULES[task.stepId];
    const result = scenario.submitInvestigation({ taskId: task.stepId, evidenceReferences: sol2LogIds[task.stepId], classification: 'insufficient_evidence', rationale: 'Reference limits or time context are incomplete.', limitations: ['Evidence is simulated and incomplete.'], procedureChecks: Array.from({ length: rule.procedureCount }, (_, i) => `${task.stepId}:${i}`) });
    assert.strictEqual(result.success, true, result.message);
  });
  const readinessRefs = scenario.getInvestigationRecords().map(record => record.id);
  assert.strictEqual(scenario.submitInvestigation({ taskId: 'SOL02_READINESS_ASSESSMENT', evidenceReferences: readinessRefs, classification: 'undetermined', rationale: 'Evidence limits prevent a readiness decision.', limitations: ['No approved system reference limits are provided.'], procedureChecks: [] }).success, true);
  assert.strictEqual(scenario.advanceDay(true).success, true);
  const submit3ForScenario = (taskId, evidenceReferences, extra = {}) => scenario.submitInvestigation({ taskId, evidenceReferences, classification: 'insufficient_evidence', rationale: 'Use only the limited simulated mission metadata.', limitations: ['No external scientific measurements.'], procedureChecks: [`${taskId}:0`, `${taskId}:1`], ...extra });
  assert.strictEqual(submit3ForScenario('SOL03_MISSION_CONTEXT', ['SOL03-MISSION-CONTEXT']).success, true);
  assert.strictEqual(submit3ForScenario('SOL03_OBSERVATION_SITE_REVIEW', MASTER_TERRAIN_TARGETS.map(item => `TARGET:${item.id}`)).success, true);
  assert.strictEqual(submit3ForScenario('SOL03_SYSTEM_CONSTRAINTS', ['SOL03-COMMS-SYSTEMS']).success, true);
  assert.strictEqual(submit3ForScenario('SOL03_SELECT_TARGET', [], { selectedTargetId: target.id, scientificQuestion: 'What surface context should a future observation examine?' }).success, true);
  assert.strictEqual(scenario.getSelectedSiteId(), null);
  assert.strictEqual(submit3ForScenario('SOL03_SELECT_DATASET', ['DATASET:PHOBOSIA_TARGET_PROFILE_TRAINING'], { datasetId: 'PHOBOSIA_TARGET_PROFILE_TRAINING' }).success, true);
  const evidenceIds = scenario.getInvestigationRecords().filter(record => record.taskId.startsWith('SOL03_')).map(record => record.id);
  assert.strictEqual(scenario.submitInvestigation({ taskId: 'SOL03_SUBMIT_TARGET_RECORD', evidenceReferences: evidenceIds, classification: 'proposal_submitted', rationale: 'The profile prioritizes a future observation while data limitations remain.', limitations: ['Training metadata only; no measurements.'], procedureChecks: [], selectedTargetId: target.id, datasetId: 'PHOBOSIA_TARGET_PROFILE_TRAINING', scientificQuestion: 'What surface context should a future observation examine?' }).success, true);
  assert.strictEqual(scenario.getSelectedSiteId(), target.id);
  assert.strictEqual(scenario.advanceDay(true).success, true);
  assert.strictEqual(scenario.getSelectedSiteId(), target.id, `${target.id} should carry into Sol 4`);
  const refreshedScenario = new MissionManager();
  assert.strictEqual(refreshedScenario.getSelectedSiteId(), target.id, `${target.id} should persist after reload`);
  assert.strictEqual(refreshedScenario.getCurrentMission().day, 4, 'The reload should resume on Sol 4');
  const sol4Context = scenario.submitInvestigation({ taskId: 'SOL04_MISSION_CONTEXT', evidenceReferences: [`TARGET:${target.id}`], classification: 'context_reviewed', rationale: 'The submitted target is the sole target for this investigation.', procedureChecks: ['SOL04_MISSION_CONTEXT:0', 'SOL04_MISSION_CONTEXT:1'], selectedTargetId: target.id });
  assert.strictEqual(sol4Context.success, true, sol4Context.message);
  assert(scenario.getInvestigationRecords().find(record => record.taskId === 'SOL04_MISSION_CONTEXT').evidenceReferences.includes(`TARGET:${target.id}`), `${target.id} should be recorded on the Sol 4 investigation`);
}
console.log('Sol 2 and Sol 3 investigation validation checks passed.');
