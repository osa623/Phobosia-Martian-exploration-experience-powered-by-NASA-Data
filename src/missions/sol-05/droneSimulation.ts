import * as THREE from "three";

export const SOL5_LIMITS = {
  maxAltitudeAglM: 10,
  minAltitudeAglM: 0.45,
  operationalBoundaryM: 1500,
  minimumImages: 5,
  maxSpeedMps: 5,
  accelerationMps2: 3.5,
  configuredBatteryPercent: 100,
  simulatedBatteryDrainPercentPerMinute: 1.2,
  landingRadiusM: 1.25,
  landingMaxAglM: 1.25,
  landingMaxSpeedMps: 0.4
} as const;

export type DroneCameraView = "front" | "rear" | "left" | "right" | "down";
export type DroneCameraRig = Record<DroneCameraView, THREE.PerspectiveCamera>;
export interface DroneControls { forward: number; lateral: number; vertical: number; bodyYaw?: number }
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
    bodyYaw
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
  desired.multiplyScalar(SOL5_LIMITS.maxSpeedMps);
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

export function canLand(state: DroneFlightState, groundY: number, validImageCount: number): { ok: boolean; reason: string } {
  const horizontalDistance = Math.hypot(state.position.x - state.takeoff.x, state.position.z - state.takeoff.z);
  const agl = altitudeAgl(state.position, groundY);
  if (validImageCount < SOL5_LIMITS.minimumImages) return { ok: false, reason: `Capture at least ${SOL5_LIMITS.minimumImages} valid images before landing.` };
  if (horizontalDistance > SOL5_LIMITS.landingRadiusM) return { ok: false, reason: "Return directly above the designated Drone_TakeoffPoint." };
  if (agl > SOL5_LIMITS.landingMaxAglM) return { ok: false, reason: "Descend to the landing surface before initiating landing." };
  if (state.velocity.length() > SOL5_LIMITS.landingMaxSpeedMps) return { ok: false, reason: "Stabilize the drone before initiating landing." };
  state.position.y = groundY;
  state.velocity.set(0, 0, 0);
  state.landed = true;
  return { ok: true, reason: "Landing validated at Drone_TakeoffPoint." };
}

