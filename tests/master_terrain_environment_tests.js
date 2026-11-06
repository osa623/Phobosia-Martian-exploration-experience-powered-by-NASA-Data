const assert = require('node:assert/strict');
const fs = require('node:fs');
const THREE = require('three');
const { MissionManager, DAYS_CONFIG } = require('../dist/core/MissionManager.js');
const { DAY1_TASKS } = require('../dist/core/Day1Config.js');
const {
  advanceNighttimeGameplayClock,
  createMasterTerrainLightClusters,
  isMasterTerrainNighttimeEligible,
  NIGHTTIME_DURATION_SECONDS,
  setTerrainNightLightsEnabled
} = require('../dist/core/MasterTerrainEnvironment.js');

const base = new MissionManager().getState();
function completeSol(day) {
  const state = structuredClone(base);
  state.currentDay = day;
  state.objectiveState = 'completed';
  state.completedStepIds = day === 1
    ? DAY1_TASKS.filter(task => task.required).map(task => task.taskId)
    : DAYS_CONFIG[day].steps.map(step => step.stepId);
  if (day === 2) state.investigationRecords.push({ taskId: 'SOL02_READINESS_ASSESSMENT' });
  if (day === 3) state.investigationRecords.push({ taskId: 'SOL03_SUBMIT_TARGET_RECORD' });
  if (day === 4) state.investigationRecords.push({ taskId: 'SOL04_SUBMIT_PREPARATION_REPORT' });
  if (day === 7) state.sol7 = { ...state.sol7, stormEnded: true, report: { validated: true } };
  if (day === 8) state.sol8 = { ...state.sol8, report: { validated: true } };
  if (day === 9) state.sol9 = { ...state.sol9, report: { validated: true } };
  return state;
}

let executed = 0;
function check(name, fn) {
  fn(); executed += 1; console.log(`PASS ${name}`);
}

for (let day = 1; day <= 9; day += 1) {
  check(`SOL ${day} complete required tasks unlock independently`, () => {
    assert.equal(isMasterTerrainNighttimeEligible(completeSol(day), false), true);
  });
  check(`SOL ${day} incomplete required task blocks nighttime`, () => {
    const state = completeSol(day);
    state.completedStepIds.pop();
    assert.equal(isMasterTerrainNighttimeEligible(state, false), false);
  });
}

check('SOL 1 does not depend on SOL 2 through 9', () => assert.equal(isMasterTerrainNighttimeEligible(completeSol(1), false), true));
check('SOL 2 does not depend on future SOL completion', () => assert.equal(isMasterTerrainNighttimeEligible(completeSol(2), false), true));
check('Optional SOL 1 tasks do not block nighttime', () => assert.equal(isMasterTerrainNighttimeEligible(completeSol(1), false), true));
check('Active task state forces daytime', () => {
  const state = completeSol(2); state.objectiveState = 'in_progress';
  assert.equal(isMasterTerrainNighttimeEligible(state, false), false);
});
check('Mission transition forces daytime', () => assert.equal(isMasterTerrainNighttimeEligible(completeSol(2), true), false));
check('Active Sol 5 drone activity forces daytime', () => {
  const state = completeSol(5); state.sol5.attemptStatus = 'active';
  assert.equal(isMasterTerrainNighttimeEligible(state, false), false);
});
check('Missing authoritative Sol 2 readiness record fails safely', () => {
  const state = completeSol(2); state.investigationRecords = [];
  assert.equal(isMasterTerrainNighttimeEligible(state, false), false);
});
check('Invalid mission day fails safely to daytime', () => {
  const state = completeSol(2); state.currentDay = 10;
  assert.equal(isMasterTerrainNighttimeEligible(state, false), false);
});
check('Active gameplay time advances nighttime clock', () => {
  assert.deepEqual(advanceNighttimeGameplayClock(30, 0.5, false), { elapsedSeconds: 30.5, expired: false });
});
check('Paused time does not advance nighttime clock', () => {
  assert.deepEqual(advanceNighttimeGameplayClock(30, 900, true), { elapsedSeconds: 30, expired: false });
});
check('Six-hour boundary expires exactly at six hours', () => {
  assert.deepEqual(advanceNighttimeGameplayClock(NIGHTTIME_DURATION_SECONDS - 1, 1, false), { elapsedSeconds: NIGHTTIME_DURATION_SECONDS, expired: true });
});
check('Invalid timer delta is ignored', () => {
  assert.deepEqual(advanceNighttimeGameplayClock(30, Number.NaN, false), { elapsedSeconds: 30, expired: false });
});

check('Marker-derived clusters follow authored transforms, aim down, and avoid duplicates', () => {
  const terrain = new THREE.Group(); terrain.name = 'Terrain';
  const panel = new THREE.Group(); panel.name = 'Light_Panel'; terrain.add(panel);
  const marker = new THREE.Group(); marker.name = 'reallight01'; marker.position.set(2, 20, 3); panel.add(marker);
  const habitat = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 10), new THREE.MeshBasicMaterial());
  habitat.name = 'Habitat_Zone'; habitat.position.set(0, 2, 0); terrain.add(habitat);
  terrain.updateWorldMatrix(true, true);
  const owner = new THREE.Group(); terrain.add(owner); owner.updateWorldMatrix(true, false);
  const first = createMasterTerrainLightClusters(terrain, owner);
  assert.equal(first.lights.length, 1);
  const sourcePosition = marker.getWorldPosition(new THREE.Vector3());
  const aimPosition = first.lights[0].target.getWorldPosition(new THREE.Vector3());
  assert.ok(aimPosition.y < sourcePosition.y);
  assert.ok(first.lights[0].getWorldPosition(new THREE.Vector3()).distanceTo(sourcePosition) < 1e-6);
  assert.equal(first.lights[0].visible, false);
  assert.equal(first.group.children.some(child => child.isMesh), false);
  setTerrainNightLightsEnabled(first, true);
  assert.equal(first.lights[0].visible, true);
  const second = createMasterTerrainLightClusters(terrain, owner);
  let nightSpotCount = 0; terrain.traverse(node => { if (node.name.endsWith('_NightSpot')) nightSpotCount += 1; });
  assert.equal(nightSpotCount, 1);
  assert.equal(second.lights.length, 1);
  habitat.geometry.dispose(); habitat.material.dispose();
});

check('Loaded Master Terrain GLB exposes the actual panel and marker discrepancies', () => {
  const bytes = fs.readFileSync('public/assets/models/mars_Terrain.glb');
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  const nodes = gltf.nodes;
  const panelNames = nodes.map(node => node.name).filter(name => /^Light_Panel/.test(name)).sort();
  const markerNodes = nodes.filter(node => /^reallight\d{2}$/.test(node.name ?? ''));
  assert.equal(nodes.some(node => node.name === 'LightsPanel'), false);
  assert.deepEqual(panelNames, ['Light_Panel', 'Light_Panel_02', 'Light_Panel_04', 'Light_Panel_05', 'Light_Panel_06', 'Light_Panel_07', 'Light_Panel_08']);
  assert.equal(markerNodes.length, 7);
  assert.equal(markerNodes.every(node => Number.isInteger(node.mesh)), true);

  const objects = nodes.map(node => {
    const object = new THREE.Object3D();
    object.name = node.name ?? '';
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    if (node.scale) object.scale.fromArray(node.scale);
    return object;
  });
  for (let index = 0; index < nodes.length; index += 1) {
    for (const childIndex of nodes[index].children ?? []) objects[index].add(objects[childIndex]);
  }
  const terrain = new THREE.Group();
  for (const rootIndex of gltf.scenes[gltf.scene ?? 0].nodes) terrain.add(objects[rootIndex]);
  const habitat = objects.find(object => object.name === 'Habitat_Zone');
  const habitatGeometry = new THREE.BoxGeometry(8.8, 4.2, 15.7);
  const habitatMaterial = new THREE.MeshBasicMaterial();
  habitat.add(new THREE.Mesh(habitatGeometry, habitatMaterial));
  const owner = new THREE.Group(); terrain.add(owner);
  terrain.updateWorldMatrix(true, true);
  const clusters = createMasterTerrainLightClusters(terrain, owner);
  assert.equal(clusters.lights.length, 7);
  assert.equal(clusters.shadowLightNames.length, 2);
  assert.equal(clusters.lights.every(light => !light.visible), true);
  for (const light of clusters.lights) {
    const marker = light.parent;
    assert.match(marker.name, /^reallight\d{2}$/);
    assert.ok(light.getWorldPosition(new THREE.Vector3()).distanceTo(marker.getWorldPosition(new THREE.Vector3())) < 1e-5);
  }
  habitatGeometry.dispose(); habitatMaterial.dispose();
});

console.log(`RESULT ${executed} executed, ${executed} passed, 0 failed`);
