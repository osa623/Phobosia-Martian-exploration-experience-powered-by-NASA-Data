const assert = require('assert');
const fs = require('fs');
const THREE = require('three');
const { SOL5_LIMITS, attachDroneCamera, detachDroneCamera, createDroneCameraRig, detachDroneCameraRig, orientDroneCameraRig, createDroneFlightState, getSol5TakeoffPosition, isInsideSol5LandingTrigger, droneControlsFromKeys, stepDroneFlight, altitudeAgl, canLand, resolveSol5EAction, createSol5Guidance, updateSol5Guidance, disposeSol5Guidance, createSol5TargetBeacon, updateSol5TargetBeacon, disposeSol5TargetBeacon, createSol5LandingBeacon, setSol5LandingBeaconVisible, disposeSol5LandingBeacon } = require('../dist/missions/sol-05/droneSimulation.js');
const { resolveSol5Target, SOL5_SCENE_TARGETS, SOL5_EVIDENCE_ASSETS } = require('../dist/missions/sol-05/targetMapping.js');
const { buildTerrainBuildingColliders, segmentHitsAnyBox } = require('../dist/core/Collision.js');
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
    assert(nodeNames.has('Drone_Zone'), 'The authored Drone_Zone root exists');
    const anchor = gltf.nodes.find(node => node.name === 'Drone_Object');
    if (anchor.mesh === undefined && !anchor.children?.length) console.log('  ! NOTE: Drone_Object is a transform-only scene anchor; no drone mesh is authored beneath it.');
  } finally { fs.closeSync(fd); }
});

test('Sol 5 flight starts at the transformed helipad surface bounds rather than its offset mesh origin', () => {
  const scene = new THREE.Group(); scene.position.set(40, 7, -12);
  const padParent = new THREE.Group(); padParent.position.set(5, 3, 9); scene.add(padParent);
  const geometry = new THREE.BoxGeometry(10, 0.2, 8); geometry.translate(3, 0, -2);
  const pad = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); pad.name = 'Drone_TakeoffPoint'; pad.position.set(2, 4, -1); padParent.add(pad);
  const takeoff = getSol5TakeoffPosition(pad);
  scene.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(pad);
  const expected = new THREE.Vector3((bounds.min.x + bounds.max.x) / 2, bounds.max.y, (bounds.min.z + bounds.max.z) / 2);
  assert(takeoff.distanceTo(expected) < 1e-8, 'takeoff resolves from the transformed helipad surface bounds');
  assert.notDeepStrictEqual(takeoff.toArray(), pad.getWorldPosition(new THREE.Vector3()).toArray(), 'offset mesh origins do not place the drone off the visible pad');
  const flight = createDroneFlightState(takeoff, new THREE.Vector3(100, 0, 100));
  assert.strictEqual(flight.position.y, takeoff.y + 1, 'drone starts immediately above the pad for clearance');
  assert.strictEqual(flight.takeoff.y, takeoff.y, 'landing reference remains the authored pad elevation');
});

test('Selected target red beacon follows only the canonical A, B, or C object and cleans up', () => {
  const ids = Object.keys(SOL5_SCENE_TARGETS);
  for (let selectedIndex = 0; selectedIndex < ids.length; selectedIndex++) {
    const scene = new THREE.Group();
    const parent = new THREE.Group(); parent.position.set(30, 4, -20); parent.rotation.y = 0.3; scene.add(parent);
    const targetObjects = ids.map((id, index) => {
      const target = new THREE.Mesh(new THREE.BoxGeometry(4, 6 + index, 8), new THREE.MeshBasicMaterial());
      target.name = SOL5_SCENE_TARGETS[id]; target.position.set(index * 30, index * 3, -index * 14); parent.add(target); return target;
    });
    scene.updateWorldMatrix(true, true);
    const selected = targetObjects[selectedIndex];
    const targetPosition = selected.getWorldPosition(new THREE.Vector3());
    const selectedBounds = new THREE.Box3().setFromObject(selected);
    const beacon = createSol5TargetBeacon(scene, selected);
    assert.strictEqual(scene.children.filter(node => node.name === 'SOL5_Runtime_Selected_Target_Red_Beacon').length, 1, 'one marker is created for the selected target');
    assert(Math.hypot(beacon.group.position.x - targetPosition.x, beacon.group.position.z - targetPosition.z) < 1e-6, 'beacon stays over selected target world X/Z');
    assert(beacon.group.position.y > selectedBounds.max.y, 'beacon begins above the selected target world bounds');
    assert.strictEqual(beacon.beam.material.color.getHex(), 0xff1028, 'beam is bright red and visible without relying on lighting');
    for (let i = 0; i < targetObjects.length; i++) if (i !== selectedIndex) assert.notStrictEqual(targetObjects[i], beacon.group, 'non-selected targets receive no beacon');
    parent.position.x += 9; scene.updateWorldMatrix(true, true);
    updateSol5TargetBeacon(beacon, selected, false);
    assert(Math.abs(beacon.group.position.x - selected.getWorldPosition(new THREE.Vector3()).x) < 1e-6, 'beacon follows selected target parent transforms');
    assert.strictEqual(beacon.group.visible, false, 'beacon can be hidden after target inspection');
    disposeSol5TargetBeacon(beacon);
    assert.strictEqual(beacon.group.parent, null, 'beacon is removed at mission cleanup');
  }
});

function test(name, fn) {
  try { fn(); console.log(`  ✓ PASS: ${name}`); }
  catch (error) { console.error(`  ✗ FAIL: ${name}`); console.error(error); process.exitCode = 1; }
}

test('Revised Sol 5 mission and instructions use manual inspection, contextual E, prepared evidence, and no capture-count workflow', () => {
  const mission = JSON.parse(fs.readFileSync('src/jsons/Missions/sol-05.json', 'utf8'));
  const instructions = JSON.parse(fs.readFileSync('src/jsons/Instructions/sol-05-navigation.json', 'utf8'));
  assert.deepStrictEqual(instructions.instructions.map(task => task.taskId), mission.missionCompletion.requiredTasks);
  assert(mission.tasks.some(task => task.taskId === 'SOL05_AERIAL_RECONNAISSANCE' && /inspect/i.test(task.title)));
  const landingObjective = mission.objectives.find(objective => objective.id === 'SOL05_OBJ_06');
  assert(landingObjective, 'The existing Sol 5 landing objective ID remains registered');
  assert.strictEqual(landingObjective.landingPoint, 'Drone_TakeoffPoint');
  assert(/presses? L/i.test(landingObjective.completionCondition), 'The existing landing objective now requires L at the validated landing point');
  assert(mission.droneConfiguration.controls.Shift);
  assert.strictEqual(mission.droneConfiguration.evidenceReview.presentAsLiveDroneCapture, false);
  const instructionText = JSON.stringify(instructions);
  assert(/close|refresh/i.test(instructionText) && /abort/i.test(instructionText) && /launch pad/i.test(instructionText), 'Instructions explain that leaving before landing aborts and a retry starts at the pad');
  assert(/Press L key to land/i.test(instructionText), 'Landing instructions explain the L-key landing interaction');
  assert(!instructionText.includes('Drone_Object') && !instructionText.includes('Drone_TakeoffPoint'), 'Player-facing instructions do not expose internal scene object names');
  const copy = JSON.stringify([mission, instructions]).toLowerCase();
  assert(!copy.includes('capture at least five'));
  assert(copy.includes('press l key to land'), 'The player-facing landing confirmation uses L at the landing point');
  assert(!copy.includes('press g to complete the mission'), 'The superseded G-key completion instruction is absent');
  const gameSource = fs.readFileSync('src/core/Game.ts', 'utf8');
  const viewportSource = fs.readFileSync('src/components/game/GameViewport.tsx', 'utf8');
  assert(gameSource.includes('e.code === "KeyL"') && gameSource.includes('this.requestSol5Landing()) this.finishSol5LandingAndReturn()'), 'L at the ready pad validates landing, completes the objective, and returns to Mission Control');
  assert(gameSource.includes('this.isSol5LandingApproachReady()') && gameSource.includes('isInsideSol5LandingTrigger(flight.position, this.sol5TakeoffNode)'), 'The on-screen landing prompt is gated to the actual landing pad and existing safety checks');
  assert(viewportSource.includes('Press L key to land'), 'The contextual prompt displays the requested L-key instruction');
  assert(copy.includes('pre-prepared') || copy.includes('pre_prepared'));
});

test('Production mars_Terrain GLB has named outpost building hierarchies with mesh descendants for Sol 5 collider generation', () => {
  const b = fs.readFileSync('public/assets/models/mars_Terrain.glb');
  const length = b.readUInt32LE(12);
  const gltf = JSON.parse(b.toString('utf8', 20, 20 + length));
  const names = ['Central_Hub','Mission_Control','AirLock_System','Engineering','Habitat_Zone','ScienceZone','DroneandRoverSection','Connector-HabitatToHub','Connector-ScienceToHub','Connector-EngineeringToHub','Connector-MissionControlToHub'];
  const nodes = gltf.nodes;
  for (const name of names) {
    const root = nodes.find(node => node.name === name);
    assert(root, `Missing authored structure ${name}`);
    let hasMesh = false;
    const visit = node => { if (node.mesh !== undefined) hasMesh = true; for (const child of node.children || []) visit(nodes[child]); };
    visit(root);
    assert(hasMesh, `${name} has no mesh descendant for collider generation`);
  }
});

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

test('Selected-target evidence paths exactly match existing per-target assets without cross-target fallback', () => {
  for (const target of registry) {
    const assets = SOL5_EVIDENCE_ASSETS[target.id];
    assert(assets && assets.length > 0, `Missing assets for ${target.id}`);
    for (const asset of assets) {
      assert.strictEqual(asset.targetId, target.id);
      assert(asset.assetPath.includes(target.id.endsWith('CRATER_RIM') ? '/target_01/' : target.id.endsWith('DUNE_BASIN') ? '/target_02/' : '/target_03/'));
      const diskPath = decodeURIComponent(`public${asset.assetPath}`);
      assert(fs.existsSync(diskPath), `Missing evidence asset: ${diskPath}`);
    }
  }
});

test('W/A/S/D/E/Q produce the required drone axes and released keys produce zero input', () => {
  const expected = {
    KeyW: { forward: 1, lateral: 0, vertical: 0 }, KeyS: { forward: -1, lateral: 0, vertical: 0 },
    KeyA: { forward: 0, lateral: -1, vertical: 0 }, KeyD: { forward: 0, lateral: 1, vertical: 0 },
    KeyE: { forward: 0, lateral: 0, vertical: 1 }, KeyQ: { forward: 0, lateral: 0, vertical: -1 }
  };
  for (const [key, axes] of Object.entries(expected)) assert.deepStrictEqual(droneControlsFromKeys(new Set([key]), 0), { ...axes, bodyYaw: 0, speedBoost: false });
  assert.deepStrictEqual(droneControlsFromKeys(new Set(), 0), { forward: 0, lateral: 0, vertical: 0, bodyYaw: 0, speedBoost: false });
  assert.strictEqual(droneControlsFromKeys(new Set(['KeyW', 'ShiftLeft']), 0).speedBoost, true);
});

test('Shift increases manual speed while preserving frame-step and direction controls', () => {
  for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyQ']) {
    const normal = createDroneFlightState(new THREE.Vector3(), new THREE.Vector3(20, 0, 0));
    const boosted = createDroneFlightState(new THREE.Vector3(), new THREE.Vector3(20, 0, 0));
    stepDroneFlight(normal, droneControlsFromKeys(new Set([key]), 0), 0.05, () => 0);
    stepDroneFlight(boosted, droneControlsFromKeys(new Set([key, 'ShiftLeft']), 0), 0.05, () => 0);
    assert(boosted.velocity.length() > normal.velocity.length(), `${key} should be boosted`);
    assert(boosted.velocity.length() <= SOL5_LIMITS.maxSpeedMps * SOL5_LIMITS.speedBoostMultiplier);
  }
  const diagonal = createDroneFlightState(new THREE.Vector3(), new THREE.Vector3(20, 0, 0));
  stepDroneFlight(diagonal, droneControlsFromKeys(new Set(['KeyW','KeyA','ShiftRight']), 0), 0.05, () => 0);
  assert(diagonal.velocity.length() <= SOL5_LIMITS.maxSpeedMps * SOL5_LIMITS.speedBoostMultiplier, 'Diagonal boost remains capped');
  assert.strictEqual(droneControlsFromKeys(new Set(['KeyW']), 0).speedBoost, false, 'Releasing Shift restores normal speed');
});

test('E is contextual: target inspection and valid-base landing never also issue ascent', () => {
  const target = new THREE.Vector3(20, 0, 20), takeoff = new THREE.Vector3(0, 0, 0);
  assert.strictEqual(resolveSol5EAction(new THREE.Vector3(20, 1, 20), target, takeoff, false), 'inspect_target');
  assert.strictEqual(resolveSol5EAction(new THREE.Vector3(80, 1, 80), target, takeoff, false), 'ascend');
  assert.strictEqual(resolveSol5EAction(new THREE.Vector3(1, 9, 1), target, takeoff, true), 'confirm_landing');
  assert.strictEqual(resolveSol5EAction(new THREE.Vector3(20, 1, 20), target, takeoff, true), 'ascend');
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

test('Landing checks require target inspection, takeoff proximity, low AGL, and low speed', () => {
  const takeoff = new THREE.Vector3(10, 2, 20);
  const state = createDroneFlightState(takeoff, new THREE.Vector3(50, 0, 50));
  state.position.copy(takeoff).add(new THREE.Vector3(0, 0.8, 0));
  assert.strictEqual(canLand(state, 2, false).ok, false);
  assert.strictEqual(canLand(state, 2, true).ok, true);
  assert.strictEqual(state.landed, true);
  assert.strictEqual(state.position.y, 2);
  const high = createDroneFlightState(takeoff, new THREE.Vector3(50, 0, 50)); high.position.copy(takeoff).add(new THREE.Vector3(0, 2, 0));
  assert.strictEqual(canLand(high, 2, true).ok, false, 'High landing attempts are rejected');
  const fast = createDroneFlightState(takeoff, new THREE.Vector3(50, 0, 50)); fast.position.copy(takeoff).add(new THREE.Vector3(0, 0.5, 0)); fast.velocity.set(1, 0, 0);
  assert.strictEqual(canLand(fast, 2, true).ok, false, 'Moving landing attempts are rejected');
  const far = createDroneFlightState(takeoff, new THREE.Vector3(50, 0, 50)); far.position.copy(takeoff).add(new THREE.Vector3(2, 0.5, 0));
  assert.strictEqual(canLand(far, 2, true).ok, false, 'Landing outside the authored pad tolerance is rejected');
});

test('Landing trigger validation uses the exact transformed pad footprint and authored surface height', () => {
  const root = new THREE.Group(); root.position.set(30, 4, -12);
  const parent = new THREE.Group(); parent.position.set(5, 2, 8); root.add(parent);
  const geometry = new THREE.BoxGeometry(10, 0.2, 8); geometry.translate(2, 0, -1);
  const pad = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); pad.name = 'Drone_TakeoffPoint'; pad.position.set(3, 1, 2); parent.add(pad);
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(pad);
  const surface = getSol5TakeoffPosition(pad);
  assert(isInsideSol5LandingTrigger(surface, pad), 'The transformed pad center/top is inside the exact landing footprint');
  assert(isInsideSol5LandingTrigger(new THREE.Vector3(bounds.min.x, surface.y, surface.z), pad), 'The exact authored footprint boundary is accepted');
  assert(!isInsideSol5LandingTrigger(new THREE.Vector3(bounds.min.x - 0.001, surface.y, surface.z), pad), 'Landing beside the pad is rejected');
  assert(!isInsideSol5LandingTrigger(new THREE.Vector3(surface.x, surface.y + SOL5_LIMITS.landingMaxAglM + 0.01, surface.z), pad), 'Hovering above the configured landing height is rejected');
});

test('Landing beacon anchors to the transformed existing pad, stays hidden until return phase, and disposes cleanly', () => {
  const scene = new THREE.Group(); scene.position.set(30, 4, -12);
  const terrain = new THREE.Group(); scene.add(terrain);
  const parent = new THREE.Group(); parent.position.set(5, 2, 8); terrain.add(parent);
  const geometry = new THREE.BoxGeometry(10, 0.2, 8); geometry.translate(2, 0, -1);
  const pad = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); pad.name = 'Drone_TakeoffPoint'; pad.position.set(3, 1, 2); parent.add(pad);
  scene.updateWorldMatrix(true, true);
  const beacon = createSol5LandingBeacon(scene, pad);
  const expected = getSol5TakeoffPosition(pad);
  assert.strictEqual(beacon.group.parent, scene, 'Beacon is a scene visual and is not added to the terrain collision tree');
  assert(beacon.group.position.distanceTo(expected) < 1e-8, 'Beacon origin matches the actual transformed pad surface point');
  assert.strictEqual(beacon.group.visible, false, 'Landing beacon starts hidden before the return phase');
  assert(beacon.beam.visible && beacon.crown.visible && beacon.padRing.visible, 'Beam, crown, and top-down pad ring are rendered');
  assert.strictEqual(beacon.beam.material.depthTest, false, 'Beam remains visible against terrain and structures');
  assert.strictEqual(beacon.padRing.material.depthTest, false, 'Pad marker remains visible from the downward camera view');
  setSol5LandingBeaconVisible(beacon, true);
  assert.strictEqual(beacon.group.visible, true, 'Beacon can be shown for return-to-base');
  setSol5LandingBeaconVisible(beacon, false);
  assert.strictEqual(beacon.group.visible, false, 'Beacon can be hidden after abort or completion');
  disposeSol5LandingBeacon(beacon);
  assert.strictEqual(beacon.group.parent, null, 'Beacon is removed without duplicate lifecycle residue');
});

test('Holographic guidance follows the drone, points to the selected target or return point, and does not move the drone', () => {
  const scene = new THREE.Group();
  const drone = new THREE.Object3D(); drone.position.set(1, 2, 3); scene.add(drone);
  const target = new THREE.Object3D(); target.position.set(40, 0, 20); scene.add(target);
  const takeoff = new THREE.Object3D(); takeoff.position.set(-10, 0, 2); scene.add(takeoff);
  const before = drone.position.clone();
  const guide = createSol5Guidance(scene);
  updateSol5Guidance(guide, drone, target, takeoff, false);
  let p = guide.path.geometry.getAttribute('position');
  assert.deepStrictEqual([p.getX(0), p.getY(0), p.getZ(0)], [1, 2, 3]);
  assert.deepStrictEqual([p.getX(1), p.getY(1), p.getZ(1)], [40, 0, 20]);
  drone.position.x += 5; updateSol5Guidance(guide, drone, target, takeoff, false);
  p = guide.path.geometry.getAttribute('position');
  assert.strictEqual(p.getX(0), 6, 'Path starts at the updated drone transform');
  updateSol5Guidance(guide, drone, target, takeoff, true);
  p = guide.path.geometry.getAttribute('position');
  assert.deepStrictEqual([p.getX(1), p.getY(1), p.getZ(1)], [-10, 0, 2]);
  assert.strictEqual(guide.targetMarker.visible, true, 'Selected-target marker remains visible while the guide switches to return');
  assert.deepStrictEqual(before.toArray(), [1, 2, 3], 'Guidance does not modify drone position');
  disposeSol5Guidance(guide);
  assert.strictEqual(guide.group.parent, null);
});

test('Named mars_Terrain outpost building meshes receive coarse colliders and swept movement cannot pass through them', () => {
  const terrain = new THREE.Group();
  const building = new THREE.Group(); building.name = 'Mission_Control'; terrain.add(building);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.5), new THREE.MeshBasicMaterial()); wall.position.set(2, 2, 0); building.add(wall);
  const colliders = buildTerrainBuildingColliders(terrain);
  assert.strictEqual(colliders.length, 1);
  assert.strictEqual(segmentHitsAnyBox(new THREE.Vector3(-5, 2, 0), new THREE.Vector3(5, 2, 0), colliders), true);
  assert.strictEqual(segmentHitsAnyBox(new THREE.Vector3(-5, 8, 0), new THREE.Vector3(5, 8, 0), colliders), false);
});

test('Terrain collision generation includes all finite scene objects but excludes terrain floor, markers, and triggers', () => {
  const terrain = new THREE.Group();
  const addMesh = (name, x) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial()); mesh.name = name; mesh.position.x = x; terrain.add(mesh); return mesh; };
  const wall = addMesh('Loose_Structure_Object', 0);
  const rover = addMesh('Rover_Body_Rover_2ver_0', 10);
  const solar = addMesh('Solar_Panel_UpperBase', 20);
  const rock = addMesh('PHOBOSIA_Rock_01', 30);
  addMesh('Floor.001', 40);
  addMesh('Drone_TakeoffPoint', 50);
  addMesh('DroneZone_Entrance_Trigger', 60);
  addMesh('PHOBOSIA_MarsTerrain_2km', 70);
  const droneZone = new THREE.Group(); droneZone.name = 'Drone_Zone'; terrain.add(droneZone);
  const zoneWall = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8), new THREE.MeshBasicMaterial()); zoneWall.name = 'Drone_Zone_Wall'; zoneWall.position.x = 80; droneZone.add(zoneWall);
  const hiddenProxy = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8), new THREE.MeshBasicMaterial()); hiddenProxy.name = 'Collider_Drone_Zone'; hiddenProxy.position.x = 100; droneZone.add(hiddenProxy);
  const boxes = buildTerrainBuildingColliders(terrain);
  assert.strictEqual(boxes.length, 4, 'all four solid world objects receive bounds while non-obstacles are excluded');
  for (const mesh of [wall, rover, solar, rock]) {
    const center = mesh.getWorldPosition(new THREE.Vector3());
    assert(boxes.some(box => box.containsPoint(center)), `${mesh.name} is included in drone collision bounds`);
  }
  assert(!boxes.some(box => box.containsPoint(zoneWall.getWorldPosition(new THREE.Vector3()))), 'Drone_Zone visual meshes do not produce drone collision');
  assert(!boxes.some(box => box.containsPoint(hiddenProxy.getWorldPosition(new THREE.Vector3()))), 'No Drone_Zone child proxy leaves hidden collision behind');
  assert(segmentHitsAnyBox(new THREE.Vector3(-5, 0, 0), new THREE.Vector3(5, 0, 0), boxes), 'swept flight collides with an arbitrary scene structure');
  assert(segmentHitsAnyBox(new THREE.Vector3(5, 0, 0), new THREE.Vector3(15, 0, 0), boxes), 'collisions outside Drone_Zone remain enabled');
});

