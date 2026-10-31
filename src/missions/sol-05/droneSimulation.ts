import * as THREE from "three";

export const SOL5_LIMITS = {
  maxAltitudeAglM: 10,
  minAltitudeAglM: 0.45,
  operationalBoundaryM: 1500,
  targetInspectionRadiusM: 12,
  landingInteractionRadiusM: 4,
  maxSpeedMps: 5,
  speedBoostMultiplier: 1.6,
  accelerationMps2: 3.5,
  configuredBatteryPercent: 100,
  simulatedBatteryDrainPercentPerMinute: 1.2,
  landingRadiusM: 1.25,
  landingMaxAglM: 1.25,
  landingMaxSpeedMps: 0.4
} as const;

export type DroneCameraView = "front" | "rear" | "left" | "right" | "down";
export type DroneCameraRig = Record<DroneCameraView, THREE.PerspectiveCamera>;
export interface DroneControls { forward: number; lateral: number; vertical: number; bodyYaw?: number; speedBoost?: boolean }
export interface DroneFlightState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  takeoff: THREE.Vector3;
  target: THREE.Vector3;
  boundaryCenter: THREE.Vector3;
  cameraView: DroneCameraView;
  elapsedSeconds: number;
  totalDistanceM: number;
  maxAltitudeAglM: number;
  batteryPercent: number;
  landed: boolean;
  warning: string | null;
}

/** Read the held Sol 5 keys once per simulation frame; camera look is deliberately excluded. */
export function droneControlsFromKeys(keys: ReadonlySet<string>, bodyYaw: number): DroneControls {
  return {
    forward: Number(keys.has("KeyW")) - Number(keys.has("KeyS")),
    lateral: Number(keys.has("KeyD")) - Number(keys.has("KeyA")),
    vertical: Number(keys.has("KeyE")) - Number(keys.has("KeyQ")),
    bodyYaw,
    speedBoost: keys.has("ShiftLeft") || keys.has("ShiftRight")
  };
}

/** Place the first-person camera at the controlled object's origin so it inherits its world transform. */
export function attachDroneCamera(anchor: THREE.Object3D, camera: THREE.Camera): void {
  anchor.add(camera);
  camera.position.set(0, 0, 0);
  camera.rotation.set(0, 0, 0);
  camera.updateMatrix();
}

/** Create the five Sol 5 viewpoints as actual cameras mounted at the Drone_Object origin. */
export function createDroneCameraRig(anchor: THREE.Object3D, primary: THREE.PerspectiveCamera): DroneCameraRig {
  const makeCamera = (view: DroneCameraView) => {
    const camera = view === "front" ? primary : new THREE.PerspectiveCamera(primary.fov, primary.aspect, primary.near, primary.far);
    camera.name = `Drone_Object_Camera_${view.toUpperCase()}`;
    camera.zoom = primary.zoom;
    camera.filmGauge = primary.filmGauge;
    camera.filmOffset = primary.filmOffset;
    attachDroneCamera(anchor, camera);
    return camera;
  };
  return { front: makeCamera("front"), rear: makeCamera("rear"), left: makeCamera("left"), right: makeCamera("right"), down: makeCamera("down") };
}

/** Orient each mounted view independently; none of these camera changes translate the drone. */
export function orientDroneCameraRig(rig: DroneCameraRig, lookYaw: number, lookPitch: number): void {
  const offsets: Record<DroneCameraView, { yaw: number; pitch: number }> = {
    front: { yaw: 0, pitch: 0 }, rear: { yaw: Math.PI, pitch: 0 }, left: { yaw: -Math.PI / 2, pitch: 0 },
    right: { yaw: Math.PI / 2, pitch: 0 }, down: { yaw: 0, pitch: -Math.PI / 2 }
  };
  for (const view of Object.keys(offsets) as DroneCameraView[]) {
    const offset = offsets[view];
    const pitch = view === "down"
      ? Math.max(-Math.PI / 2, offset.pitch + lookPitch)
      : THREE.MathUtils.clamp(offset.pitch + lookPitch, -1.45, 1.45);
    rig[view].position.set(0, 0, 0);
    rig[view].rotation.set(pitch, offset.yaw + lookYaw, 0, "YXZ");
    rig[view].updateMatrix();
  }
}

/** Return the camera to the scene while preserving its world pose. */
export function detachDroneCamera(scene: THREE.Object3D, camera: THREE.Camera): void {
  scene.attach(camera);
}

/** Restore the primary game camera and remove auxiliary Sol 5 views from the drone. */
export function detachDroneCameraRig(anchor: THREE.Object3D, scene: THREE.Object3D, rig: DroneCameraRig, primary: THREE.Camera): void {
  for (const camera of Object.values(rig)) {
    if (camera.parent !== anchor) continue;
    if (camera === primary) detachDroneCamera(scene, camera);
    else camera.removeFromParent();
  }
}

/** The 1.5 km square is centered on the midpoint of the verified takeoff and target scene references. */
export function createDroneFlightState(takeoff: THREE.Vector3, target: THREE.Vector3): DroneFlightState {
  const center = new THREE.Vector3((takeoff.x + target.x) / 2, 0, (takeoff.z + target.z) / 2);
  return {
    position: takeoff.clone().add(new THREE.Vector3(0, 1, 0)), velocity: new THREE.Vector3(),
    takeoff: takeoff.clone(), target: target.clone(), boundaryCenter: center, cameraView: "front",
    elapsedSeconds: 0, totalDistanceM: 0, maxAltitudeAglM: 1, batteryPercent: SOL5_LIMITS.configuredBatteryPercent,
    landed: false, warning: null
  };
}

/** Resolve the existing landing pad transform without snapping it to a terrain raycast. */
export function getSol5TakeoffPosition(takeoffPoint: THREE.Object3D): THREE.Vector3 {
  takeoffPoint.updateWorldMatrix(true, false);
  const bounds = new THREE.Box3().setFromObject(takeoffPoint);
  if (!bounds.isEmpty() && [bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z].every(Number.isFinite)) {
    // Authored GLB mesh origins can be offset from the visible pad; use its transformed surface bounds.
    return new THREE.Vector3((bounds.min.x + bounds.max.x) / 2, bounds.max.y, (bounds.min.z + bounds.max.z) / 2);
  }
  return takeoffPoint.getWorldPosition(new THREE.Vector3());
}

export function altitudeAgl(position: THREE.Vector3, groundY: number): number { return Math.max(0, position.y - groundY); }

export function stepDroneFlight(
  state: DroneFlightState,
  controls: DroneControls,
  dtSeconds: number,
  groundYAt: (x: number, z: number) => number | null,
  isBlocked: (from: THREE.Vector3, to: THREE.Vector3) => boolean = () => false
): DroneFlightState {
  if (state.landed) return state;
  const dt = Math.max(0, Math.min(0.05, dtSeconds));
  const before = state.position.clone();
  state.elapsedSeconds += dt;
  state.batteryPercent = Math.max(0, state.batteryPercent - dt * SOL5_LIMITS.simulatedBatteryDrainPercentPerMinute / 60);
  const yaw = controls.bodyYaw ?? 0;
  const desired = new THREE.Vector3(
    -Math.sin(yaw) * controls.forward + Math.cos(yaw) * controls.lateral,
    controls.vertical,
    -Math.cos(yaw) * controls.forward - Math.sin(yaw) * controls.lateral
  );
  if (desired.lengthSq() > 1) desired.normalize();
  desired.multiplyScalar(SOL5_LIMITS.maxSpeedMps * (controls.speedBoost ? SOL5_LIMITS.speedBoostMultiplier : 1));
  state.velocity.lerp(desired, Math.min(1, SOL5_LIMITS.accelerationMps2 * dt));
  if (desired.lengthSq() === 0 && state.velocity.length() < 0.08) state.velocity.set(0, 0, 0);
  const next = state.position.clone().addScaledVector(state.velocity, dt);

  const half = SOL5_LIMITS.operationalBoundaryM / 2;
  const minX = state.boundaryCenter.x - half, maxX = state.boundaryCenter.x + half;
  const minZ = state.boundaryCenter.z - half, maxZ = state.boundaryCenter.z + half;
  let boundaryHit = false;
  if (next.x < minX || next.x > maxX) { next.x = THREE.MathUtils.clamp(next.x, minX, maxX); state.velocity.x = 0; boundaryHit = true; }
  if (next.z < minZ || next.z > maxZ) { next.z = THREE.MathUtils.clamp(next.z, minZ, maxZ); state.velocity.z = 0; boundaryHit = true; }

  const groundY = groundYAt(next.x, next.z);
  if (groundY === null || !Number.isFinite(groundY)) {
    state.velocity.set(0, 0, 0);
    state.warning = "Terrain height unavailable; movement paused for safety.";
    return state;
  }
  next.y = Math.max(groundY + SOL5_LIMITS.minAltitudeAglM, Math.min(groundY + SOL5_LIMITS.maxAltitudeAglM, next.y));
  const blocked = isBlocked(state.position, next);
  if (blocked) {
    state.velocity.set(0, 0, 0);
    state.warning = "Obstacle proximity: movement blocked.";
  } else {
    state.position.copy(next);
    state.totalDistanceM += state.position.distanceTo(before);
    state.warning = boundaryHit ? "Operational boundary reached; turn back." : state.batteryPercent <= 15 ? "Critical simulated battery; return to takeoff point." : state.batteryPercent <= 30 ? "Low simulated battery." : null;
  }
  const agl = altitudeAgl(state.position, groundY);
  state.maxAltitudeAglM = Math.max(state.maxAltitudeAglM, agl);
  return state;
}

export function canLand(state: DroneFlightState, groundY: number, targetInspected: boolean): { ok: boolean; reason: string } {
  const horizontalDistance = Math.hypot(state.position.x - state.takeoff.x, state.position.z - state.takeoff.z);
  const agl = altitudeAgl(state.position, groundY);
  if (!targetInspected) return { ok: false, reason: "Inspect the selected target before returning to the landing point." };
  if (horizontalDistance > SOL5_LIMITS.landingRadiusM) return { ok: false, reason: "Return directly above the designated Drone_TakeoffPoint." };
  if (agl > SOL5_LIMITS.landingMaxAglM) return { ok: false, reason: "Descend to the landing surface before initiating landing." };
  if (state.velocity.length() > SOL5_LIMITS.landingMaxSpeedMps) return { ok: false, reason: "Stabilize the drone before initiating landing." };
  state.position.y = groundY;
  state.velocity.set(0, 0, 0);
  state.landed = true;
  return { ok: true, reason: "Landing validated at Drone_TakeoffPoint." };
}

export type Sol5EAction = "ascend" | "inspect_target" | "confirm_landing";
export function resolveSol5EAction(position: THREE.Vector3, target: THREE.Vector3, takeoff: THREE.Vector3, targetInspected: boolean): Sol5EAction {
  if (!targetInspected && position.distanceTo(target) <= SOL5_LIMITS.targetInspectionRadiusM) return "inspect_target";
  if (targetInspected && Math.hypot(position.x - takeoff.x, position.z - takeoff.z) <= SOL5_LIMITS.landingInteractionRadiusM) return "confirm_landing";
  return "ascend";
}

export interface Sol5GuidanceRig {
  group: THREE.Group;
  path: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  targetMarker: THREE.Group;
  pathPositions: Float32Array;
  dronePosition: THREE.Vector3;
  targetPosition: THREE.Vector3;
  takeoffPosition: THREE.Vector3;
}

export interface Sol5TargetBeacon {
  group: THREE.Group;
  beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  crown: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  light: THREE.PointLight;
}

/** A lightweight, non-colliding visual beacon positioned from the selected scene object's world bounds. */
export function createSol5TargetBeacon(scene: THREE.Object3D, target: THREE.Object3D): Sol5TargetBeacon {
  const height = 48;
  const group = new THREE.Group();
  group.name = "SOL5_Runtime_Selected_Target_Red_Beacon";
  updateSol5TargetBeaconPosition(group, target);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 1.05, height, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff1028, transparent: true, opacity: 0.78, depthTest: false, depthWrite: false, side: THREE.DoubleSide })
  );
  beam.name = "SOL5_Selected_Target_Red_Beam";
  beam.position.y = height / 2;
  beam.renderOrder = 1000;
  group.add(beam);

  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(1.65, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xff3447, depthTest: false, depthWrite: false })
  );
  crown.name = "SOL5_Selected_Target_Red_Beacon_Crown";
  crown.position.y = height;
  crown.renderOrder = 1001;
  group.add(crown);

  const light = new THREE.PointLight(0xff172c, 60, 180, 1.5);
  light.position.copy(crown.position);
  light.name = "SOL5_Selected_Target_Red_Beacon_Light";
  group.add(light);
  scene.add(group);
  return { group, beam, crown, light };
}

export function updateSol5TargetBeacon(beacon: Sol5TargetBeacon | undefined, target: THREE.Object3D, visible: boolean): void {
  if (!beacon) return;
  updateSol5TargetBeaconPosition(beacon.group, target);
  beacon.group.visible = visible;
}

function updateSol5TargetBeaconPosition(group: THREE.Group, target: THREE.Object3D): void {
  target.updateWorldMatrix(true, true);
  const targetWorld = target.getWorldPosition(new THREE.Vector3());
  const bounds = new THREE.Box3().setFromObject(target);
  const baseY = bounds.isEmpty() ? targetWorld.y : Math.max(targetWorld.y, bounds.max.y) + 2;
  group.position.set(targetWorld.x, baseY, targetWorld.z);
}

export function setSol5TargetBeaconVisible(beacon: Sol5TargetBeacon | undefined, visible: boolean): void {
  if (beacon) beacon.group.visible = visible;
}

export function disposeSol5TargetBeacon(beacon: Sol5TargetBeacon | undefined): void {
  if (!beacon) return;
  beacon.group.removeFromParent();
  beacon.beam.geometry.dispose();
  beacon.beam.material.dispose();
  beacon.crown.geometry.dispose();
  beacon.crown.material.dispose();
}

/** Lightweight visual-only destination marker and two-point direct guidance line. */
export function createSol5Guidance(scene: THREE.Object3D): Sol5GuidanceRig {
  const group = new THREE.Group();
  group.name = "SOL5_Runtime_Target_Guidance";
  const positions = new Float32Array(6);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const path = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x55dff4, transparent: true, opacity: 0.78, depthTest: true }));
  path.name = "SOL5_Runtime_Direct_Guidance_Path";
  path.frustumCulled = false;
  group.add(path);

  const targetMarker = new THREE.Group();
  targetMarker.name = "SOL5_Runtime_Selected_Target_Highlight";
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.12, 6, 36), new THREE.MeshBasicMaterial({ color: 0x42e5ff, transparent: true, opacity: 0.85, depthTest: true }));
  ring.name = "SOL5_Target_Holographic_Perimeter";
  ring.rotation.x = Math.PI / 2;
  targetMarker.add(ring);
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.42, 12, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x35d9fa, transparent: true, opacity: 0.22, depthTest: true, side: THREE.DoubleSide }));
  beacon.name = "SOL5_Target_Holographic_Beacon";
  beacon.position.y = 6;
  targetMarker.add(beacon);
  const endpoint = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: 0xa4f7ff, transparent: true, opacity: 0.9, depthTest: true }));
  endpoint.name = "SOL5_Target_Guidance_Endpoint";
  endpoint.position.y = 12;
  targetMarker.add(endpoint);
  group.add(targetMarker);
  scene.add(group);
  return { group, path, targetMarker, pathPositions: positions, dronePosition: new THREE.Vector3(), targetPosition: new THREE.Vector3(), takeoffPosition: new THREE.Vector3() };
}

/** Updates reusable vertices from live world transforms; the guide never moves the drone. */
export function updateSol5Guidance(rig: Sol5GuidanceRig, drone: THREE.Object3D, target: THREE.Object3D, returnPoint: THREE.Object3D, returning: boolean): void {
  drone.updateWorldMatrix(true, false);
  target.updateWorldMatrix(true, false);
  returnPoint.updateWorldMatrix(true, false);
  const start = drone.getWorldPosition(rig.dronePosition);
  const targetWorld = target.getWorldPosition(rig.targetPosition);
  const destination = (returning ? returnPoint : target).getWorldPosition(rig.takeoffPosition);
  rig.pathPositions[0] = start.x; rig.pathPositions[1] = start.y; rig.pathPositions[2] = start.z;
  rig.pathPositions[3] = destination.x; rig.pathPositions[4] = destination.y; rig.pathPositions[5] = destination.z;
  const attribute = rig.path.geometry.getAttribute("position") as THREE.BufferAttribute;
  attribute.needsUpdate = true;
  rig.targetMarker.position.copy(targetWorld);
  rig.targetMarker.visible = true;
  rig.path.material.color.set(returning ? 0x8decb4 : 0x55dff4);
}

export function disposeSol5Guidance(rig: Sol5GuidanceRig): void {
  rig.group.removeFromParent();
  rig.group.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) mesh.material.forEach(material => material.dispose());
    else if (mesh.material) mesh.material.dispose();
  });
}

