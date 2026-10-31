const assert = require('assert');
const fs = require('fs');
const THREE = require('three');
const { SOL5_LIMITS, attachDroneCamera, detachDroneCamera, createDroneCameraRig, detachDroneCameraRig, orientDroneCameraRig, createDroneFlightState, droneControlsFromKeys, stepDroneFlight, altitudeAgl, canLand } = require('../dist/missions/sol-05/droneSimulation.js');
const { resolveSol5Target, SOL5_SCENE_TARGETS } = require('../dist/missions/sol-05/targetMapping.js');
const registry = [
  { id: 'TARGET_ALPHA_CRATER_RIM', name: 'Target A' },
  { id: 'TARGET_BETA_DUNE_BASIN', name: 'Target B' },
  { id: 'TARGET_GAMMA_SOUTH_ESCARPMENT', name: 'Target C' }
];

test('Production mars_Terrain GLB contains the Sol 5 anchor, takeoff reference, and all three targets', () => {
  const file = 'public/assets/models/mars_Terrain.glb';
  const fd = fs.openSync(file, 'r');
  try {
    const header = Buffer.alloc(20);
    fs.readSync(fd, header, 0, header.length, 0);
    assert.strictEqual(header.readUInt32LE(0), 0x46546c67, 'Expected a GLB asset');
    const jsonLength = header.readUInt32LE(12);
    assert.strictEqual(header.readUInt32LE(16), 0x4e4f534a, 'Expected the GLB JSON chunk first');
    const jsonChunk = Buffer.alloc(jsonLength);
    fs.readSync(fd, jsonChunk, 0, jsonLength, 20);
    const gltf = JSON.parse(jsonChunk.toString('utf8'));
    const nodeNames = new Set(gltf.nodes.map(node => node.name));
    for (const name of ['Drone_Object', 'Drone_TakeoffPoint', 'target_01', 'target_02', 'target_03']) assert(nodeNames.has(name), `Missing ${name} in mars_Terrain.glb`);
    const anchor = gltf.nodes.find(node => node.name === 'Drone_Object');
    if (anchor.mesh === undefined && !anchor.children?.length) console.log('  ! NOTE: Drone_Object is a transform-only scene anchor; no drone mesh is authored beneath it.');
  } finally { fs.closeSync(fd); }
});

function test(name, fn) {
  try { fn(); console.log(`  ✓ PASS: ${name}`); }
  catch (error) { console.error(`  ✗ FAIL: ${name}`); console.error(error); process.exitCode = 1; }
}

test('Scene target mapping resolves the three existing named nodes and has no fallback', () => {
  const scene = new THREE.Group();
  for (const [id, name] of Object.entries(SOL5_SCENE_TARGETS)) {
    const node = new THREE.Object3D(); node.name = name; node.position.set(Object.keys(SOL5_SCENE_TARGETS).indexOf(id) * 100, 0, 20); scene.add(node);
  }
  for (const target of registry) {
    const resolved = resolveSol5Target(scene, target.id, registry);
    assert(resolved); assert.strictEqual(resolved.definition.id, target.id);
    assert.strictEqual(resolved.object.name, SOL5_SCENE_TARGETS[target.id]);
  }
  assert.strictEqual(resolveSol5Target(scene, null, registry), null);
  assert.strictEqual(resolveSol5Target(scene, 'INVALID_TARGET', registry), null);
});

test('W/A/S/D/E/Q produce the required drone axes and released keys produce zero input', () => {
  const expected = {
    KeyW: { forward: 1, lateral: 0, vertical: 0 }, KeyS: { forward: -1, lateral: 0, vertical: 0 },
    KeyA: { forward: 0, lateral: -1, vertical: 0 }, KeyD: { forward: 0, lateral: 1, vertical: 0 },
    KeyE: { forward: 0, lateral: 0, vertical: 1 }, KeyQ: { forward: 0, lateral: 0, vertical: -1 }
  };
  for (const [key, axes] of Object.entries(expected)) assert.deepStrictEqual(droneControlsFromKeys(new Set([key]), 0), { ...axes, bodyYaw: 0 });
  assert.deepStrictEqual(droneControlsFromKeys(new Set(), 0), { forward: 0, lateral: 0, vertical: 0, bodyYaw: 0 });
});

test('First-person camera is parented to Drone_Object, follows it, and detaches without a pose jump', () => {
  const scene = new THREE.Group();
  const anchor = new THREE.Object3D(); anchor.name = 'Drone_Object'; anchor.position.set(12, 3, -5); scene.add(anchor);
  const camera = new THREE.PerspectiveCamera();
  attachDroneCamera(anchor, camera);
  scene.updateWorldMatrix(true, true);
  assert.strictEqual(camera.parent, anchor);
  assert(camera.getWorldPosition(new THREE.Vector3()).distanceTo(anchor.getWorldPosition(new THREE.Vector3())) < 1e-6);
  anchor.position.x += 8; scene.updateWorldMatrix(true, true);
  assert(camera.getWorldPosition(new THREE.Vector3()).distanceTo(anchor.getWorldPosition(new THREE.Vector3())) < 1e-6);
  const positionBeforeDetach = camera.getWorldPosition(new THREE.Vector3());
  const rotationBeforeDetach = camera.getWorldQuaternion(new THREE.Quaternion());
  detachDroneCamera(scene, camera);
  assert.strictEqual(camera.parent, scene);
  assert(camera.getWorldPosition(new THREE.Vector3()).distanceTo(positionBeforeDetach) < 1e-6);
  assert(1 - Math.abs(camera.getWorldQuaternion(new THREE.Quaternion()).dot(rotationBeforeDetach)) < 1e-6);
});

test('All five Sol 5 view cameras are mounted to Drone_Object and switch orientation without changing its position', () => {
  const scene = new THREE.Group();
  const anchor = new THREE.Object3D(); anchor.name = 'Drone_Object'; anchor.position.set(100, 8, -30); scene.add(anchor);
  const primary = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 2500);
  const rig = createDroneCameraRig(anchor, primary);
  scene.updateWorldMatrix(true, true);
  const initialDronePosition = anchor.getWorldPosition(new THREE.Vector3());
  for (const view of ['front', 'rear', 'left', 'right', 'down']) {
    assert.strictEqual(rig[view].parent, anchor, `${view} camera must be attached to Drone_Object`);
    assert(rig[view].getWorldPosition(new THREE.Vector3()).distanceTo(initialDronePosition) < 1e-6);
  }
  orientDroneCameraRig(rig, 0.15, -0.05);
  const rotations = ['front', 'rear', 'left', 'right', 'down'].map(view => rig[view].getWorldDirection(new THREE.Vector3()).toArray());
  assert.strictEqual(new Set(rotations.map(rotation => rotation.map(value => value.toFixed(3)).join(','))).size, 5);
  assert(anchor.getWorldPosition(new THREE.Vector3()).distanceTo(initialDronePosition) < 1e-6, 'Changing the active view must not move the drone');
  const primaryWorldPosition = primary.getWorldPosition(new THREE.Vector3());
  detachDroneCameraRig(anchor, scene, rig, primary);
  assert.strictEqual(primary.parent, scene);
  assert(primary.getWorldPosition(new THREE.Vector3()).distanceTo(primaryWorldPosition) < 1e-6);
  for (const view of ['rear', 'left', 'right', 'down']) assert.strictEqual(rig[view].parent, null);
});

test('Operational square is derived from the takeoff/target midpoint and capped at 1.5 km', () => {
  const state = createDroneFlightState(new THREE.Vector3(0, 0, 0), new THREE.Vector3(800, 0, 400));
  assert.deepStrictEqual(state.boundaryCenter.toArray(), [400, 0, 200]);
  assert.strictEqual(SOL5_LIMITS.operationalBoundaryM, 1500);
});

test('AGL is terrain-relative and ascent never exceeds 10 metres above changing terrain', () => {
  const state = createDroneFlightState(new THREE.Vector3(0, 2, 0), new THREE.Vector3(20, 0, 0));
  state.position.set(1, 9.9, 0);
  const ground = (x) => x * 0.5;
  stepDroneFlight(state, { forward: 0, lateral: 0, vertical: 1 }, 0.05, ground);
  assert(altitudeAgl(state.position, ground(state.position.x)) <= 10);
  assert(state.position.y >= ground(state.position.x) + SOL5_LIMITS.minAltitudeAglM);
});

test('The operational boundary clamps movement instead of allowing an exit', () => {
  const state = createDroneFlightState(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0));
  state.position.x = state.boundaryCenter.x + SOL5_LIMITS.operationalBoundaryM / 2 - 0.01;
  state.velocity.x = 5;
  stepDroneFlight(state, { forward: 0, lateral: 1, vertical: 0 }, 0.05, () => 0);
  assert(state.position.x <= state.boundaryCenter.x + SOL5_LIMITS.operationalBoundaryM / 2);
});

test('Obstacle proxy blocks translation and reports a warning', () => {
  const state = createDroneFlightState(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0));
  const start = state.position.clone();
  stepDroneFlight(state, { forward: 1, lateral: 0, vertical: 0 }, 0.05, () => 0, () => true);
  assert(state.position.equals(start));
  assert.match(state.warning, /obstacle/i);
});

test('Landing checks require five images, takeoff proximity, low AGL, and low speed', () => {
  const takeoff = new THREE.Vector3(10, 2, 20);
  const state = createDroneFlightState(takeoff, new THREE.Vector3(50, 0, 50));
  state.position.copy(takeoff).add(new THREE.Vector3(0, 0.8, 0));
  assert.strictEqual(canLand(state, 2, 4).ok, false);
  assert.strictEqual(canLand(state, 2, 5).ok, true);
  assert.strictEqual(state.landed, true);
  assert.strictEqual(state.position.y, 2);
});

