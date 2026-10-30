const assert = require('assert');
const { MissionManager, DAYS_CONFIG, MASTER_TERRAIN_TARGETS } = require('../dist/core/MissionManager.js');
const { SOL2_INVESTIGATION_RULES } = require('../dist/missions/sol-02/taskDefinitions.js');

global.localStorage = global.localStorage || { getItem: () => null, setItem: () => {}, removeItem: () => {} };
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
assert.strictEqual(submit3('SOL03_OBSERVATION_SITE_REVIEW', [`TARGET:${MASTER_TERRAIN_TARGETS[0].id}`, `TARGET:${MASTER_TERRAIN_TARGETS[1].id}`]).success, true);
assert.strictEqual(submit3('SOL03_SYSTEM_CONSTRAINTS', ['SOL03-COMMS-SYSTEMS']).success, true);
assert.strictEqual(submit3('SOL03_SELECT_TARGET', [], { selectedTargetId: MASTER_TERRAIN_TARGETS[0].id, scientificQuestion: 'Which profile merits a future observation?' }).success, true, 'Selecting a target must submit without a separate hidden evidence checkbox');
assert(manager.getInvestigationRecords().find(record => record.taskId === 'SOL03_SELECT_TARGET').evidenceReferences.includes(`TARGET:${MASTER_TERRAIN_TARGETS[0].id}`), 'The selected target profile is retained as supporting evidence');
assert.strictEqual(submit3('SOL03_SELECT_DATASET', ['DATASET:PHOBOSIA_TARGET_PROFILE_TRAINING'], { datasetId: 'PHOBOSIA_TARGET_PROFILE_TRAINING' }).success, true);
assert.strictEqual(manager.submitInvestigation({ taskId: 'SOL03_SUBMIT_TARGET_RECORD', evidenceReferences: [], classification: 'proposal', rationale: 'Proposal rationale is supported by the selected training record.', procedureChecks: [], selectedTargetId: 'NONEXISTENT', datasetId: 'PHOBOSIA_TARGET_PROFILE_TRAINING', scientificQuestion: 'What should be observed?' }).success, false);
const proposalRefs = manager.getInvestigationRecords().filter(record => record.taskId.startsWith('SOL03_')).map(record => record.id);
assert.strictEqual(manager.submitInvestigation({ taskId: 'SOL03_SUBMIT_TARGET_RECORD', evidenceReferences: [...proposalRefs, 'DATASET:PHOBOSIA_TARGET_PROFILE_TRAINING'], classification: 'proposal_submitted', rationale: 'Proposal rationale is supported by the selected training record.', limitations: ['Training metadata only; no measurements.'], procedureChecks: [], selectedTargetId: MASTER_TERRAIN_TARGETS[0].id, datasetId: 'PHOBOSIA_TARGET_PROFILE_TRAINING', scientificQuestion: 'What surface context should a future observation examine?' }).success, false, 'Final proposal evidence must reference submitted record IDs, not raw catalogue IDs');
assert.strictEqual(manager.submitInvestigation({ taskId: 'SOL03_SUBMIT_TARGET_RECORD', evidenceReferences: proposalRefs, classification: 'proposal_submitted', rationale: 'The profile prioritizes a future observation while data limitations remain.', limitations: ['Training metadata only; no measurements.'], procedureChecks: [], selectedTargetId: MASTER_TERRAIN_TARGETS[0].id, datasetId: 'PHOBOSIA_TARGET_PROFILE_TRAINING', scientificQuestion: 'What surface context should a future observation examine?' }).success, true);
assert.strictEqual(manager.canRestAndAdvance().canAdvance, true);
manager.resetProgress();
console.log('Sol 2 and Sol 3 investigation validation checks passed.');
