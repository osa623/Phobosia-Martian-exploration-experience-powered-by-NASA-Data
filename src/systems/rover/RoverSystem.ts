import * as THREE from "three";

const ROVER_NAME = "TerrainRover";
const TRIGGER_NAME = "terrainRover_trigger";
const WHEEL_NAMES = ["Rover_Front_Wheels", "Rover_Midde_Wheels", "Rover_Rear_Wheels"] as const;
const AXLE_STEERING_FACTORS = [1, 0.35, 0.2] as const;

export type RoverView = "FIRST PERSON" | "THIRD PERSON";
export interface RoverSnapshot { active: boolean; speed: number; view: RoverView; }

/** Standalone surface vehicle controller. It owns no mission state or input listeners. */
export class RoverSystem {
  readonly rover: THREE.Object3D;
  readonly trigger: THREE.Object3D;
  private wheels: THREE.Object3D[];
  private wheelBaseQuaternion: THREE.Quaternion[];
  private localCenter = new THREE.Vector3();
  private dimensions = new THREE.Vector3();
  private centerOffset = new THREE.Vector3();
  private bottomOffset = 0;
  private velocity = 0;
  private wheelRollAngle = 0;
  private steering = 0;
  private yaw = 0;
  private baseYaw = 0;
  private baseWorldQuaternion = new THREE.Quaternion();
  private pitch = 0;
  private view: RoverView = "FIRST PERSON";
  private active = false;
  private distanceTravelledMeters = 0;
  private cameraPosition = new THREE.Vector3();
  private cameraLook = new THREE.Vector3();
  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();
  private worldPosition = new THREE.Vector3();
  private testPosition = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private bounds = new THREE.Box3();
  private readonly maxSpeed = 16.5;
  private readonly wheelRadius = 0.43;
  private readonly maxSteer = 0.42;

  constructor(private root: THREE.Object3D, private camera: THREE.PerspectiveCamera) {
    this.rover = root.getObjectByName(ROVER_NAME)!;
    this.trigger = root.getObjectByName(TRIGGER_NAME)!;
    const missing: string[] = [];
    if (!this.rover) missing.push(ROVER_NAME);
    if (!this.trigger) missing.push(TRIGGER_NAME);
    this.wheels = WHEEL_NAMES.map(name => root.getObjectByName(name)!).filter(Boolean);
    const missingWheels = WHEEL_NAMES.filter(name => !root.getObjectByName(name));
    if (missingWheels.length) missing.push(...missingWheels);
    if (missing.length) throw new Error(`Mars Rover scene mapping missing: ${missing.join(", ")}`);
    this.wheelBaseQuaternion = this.wheels.map(wheel => wheel.quaternion.clone());
    this.rover.updateWorldMatrix(true, true);
    this.bounds.setFromObject(this.rover);
    this.dimensions.copy(this.bounds.getSize(new THREE.Vector3()));
    this.bounds.getCenter(this.localCenter);
    this.rover.getWorldPosition(this.worldPosition);
    this.centerOffset.copy(this.localCenter).sub(this.worldPosition);
    this.bottomOffset = this.bounds.min.y - this.worldPosition.y;
    this.baseWorldQuaternion.copy(this.rover.getWorldQuaternion(new THREE.Quaternion()));
    const initialForward = new THREE.Vector3(0, -1, 0).applyQuaternion(this.baseWorldQuaternion);
    this.baseYaw = Math.atan2(-initialForward.x, -initialForward.z);
    this.yaw = this.baseYaw;
    this.pitch = 0;
  }

  get snapshot(): RoverSnapshot { return { active: this.active, speed: this.velocity, view: this.view }; }
  get isActive(): boolean { return this.active; }
  get distanceTravelled(): number { return this.distanceTravelledMeters; }
  get interactionCenter(): THREE.Vector3 { return this.trigger.getWorldPosition(new THREE.Vector3()); }
  get interactionRange(): number {
    return Math.max(6, Math.min(9, this.dimensions.length() * 0.45));
  }
  canEnterFrom(position: THREE.Vector3): boolean {
    const nearTrigger = position.distanceTo(this.interactionCenter) <= this.interactionRange;
    const nearVehicle = position.distanceTo(this.rover.getWorldPosition(new THREE.Vector3())) <= Math.max(this.exitOffset + 1.5, Math.min(6, this.dimensions.length() * 0.55));
    return nearTrigger || nearVehicle;
  }
  get exitOffset(): number { return Math.max(1.1, this.dimensions.x * 0.62); }

  enter(groundHeight: (x: number, z: number) => number): void {
    if (this.active) return;
    this.rover.getWorldPosition(this.worldPosition);
    const height = groundHeight(this.worldPosition.x + this.centerOffset.x, this.worldPosition.z + this.centerOffset.z);
    if (Number.isFinite(height)) this.worldPosition.y = height - this.bottomOffset;
    this.setWorldPosition(this.worldPosition);
    this.velocity = 0; this.steering = 0; this.active = true; this.distanceTravelledMeters = 0;
    const initialForward = new THREE.Vector3(0, -1, 0).applyQuaternion(this.baseWorldQuaternion);
    this.yaw = Math.atan2(-initialForward.x, -initialForward.z);
    this.followCamera(0, groundHeight);
  }

  exit(): void { this.velocity = 0; this.steering = 0; this.active = false; this.animateWheels(this.wheelRollAngle, 0); }
  switchView(): void { this.view = this.view === "FIRST PERSON" ? "THIRD PERSON" : "FIRST PERSON"; }

  /** Returns true when the proposed rover footprint is clear. */
  update(dt: number, keys: ReadonlySet<string>, groundHeight: (x: number, z: number) => number,
    canOccupy: (position: THREE.Vector3, radius: number, height: number) => boolean): void {
    if (!this.active) return;
    const drive = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
    const braking = keys.has("Space");
    const accel = braking ? 5 : drive ? 1.15 : 1.8;
    const target = braking ? 0 : drive * this.maxSpeed;
    this.velocity = THREE.MathUtils.damp(this.velocity, target, accel, dt);
    if (Math.abs(this.velocity) < 0.015) this.velocity = 0;
    const steerInput = (keys.has("KeyA") ? 1 : 0) - (keys.has("KeyD") ? 1 : 0);
    this.steering = THREE.MathUtils.damp(this.steering, steerInput * this.maxSteer, 4, dt);
    if (Math.abs(this.velocity) > 0.04) this.yaw += Math.tan(this.steering) * this.velocity / 3.35 * dt;

    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.rover.getWorldPosition(this.worldPosition);
    const previousX = this.worldPosition.x, previousZ = this.worldPosition.z;
    this.testPosition.copy(this.worldPosition).addScaledVector(this.forward, this.velocity * dt);
    if (canOccupy(this.testPosition, this.dimensions.x * 0.34, this.dimensions.y * 0.5)) {
      this.worldPosition.x = this.testPosition.x; this.worldPosition.z = this.testPosition.z;
      this.distanceTravelledMeters += Math.hypot(this.worldPosition.x - previousX, this.worldPosition.z - previousZ);
    } else this.velocity = 0;

    // Three terrain samples approximate a compliant six-wheel suspension without physics overhead.
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const halfLength = this.dimensions.z * 0.31;
    const halfWidth = this.dimensions.x * 0.27;
    const hf = groundHeight(this.worldPosition.x + this.forward.x * halfLength, this.worldPosition.z + this.forward.z * halfLength);
    const hm = groundHeight(this.worldPosition.x, this.worldPosition.z);
    const hr = groundHeight(this.worldPosition.x - this.forward.x * halfLength, this.worldPosition.z - this.forward.z * halfLength);
    const hl = groundHeight(this.worldPosition.x - this.right.x * halfWidth, this.worldPosition.z - this.right.z * halfWidth);
    const hright = groundHeight(this.worldPosition.x + this.right.x * halfWidth, this.worldPosition.z + this.right.z * halfWidth);
    if ([hf, hm, hr, hl, hright].every(Number.isFinite)) {
      this.worldPosition.y = THREE.MathUtils.damp(this.worldPosition.y, (hf + 2 * hm + hr) / 4 - this.bottomOffset, 7, dt);
      const targetPitch = THREE.MathUtils.clamp(Math.atan2(hf - hr, halfLength * 2), -0.24, 0.24);
      const targetRoll = THREE.MathUtils.clamp(Math.atan2(hright - hl, halfWidth * 2), -0.18, 0.18);
      this.pitch = THREE.MathUtils.damp(this.pitch, targetPitch, 5, dt);
      this.rover.rotation.set(this.rover.rotation.x, this.rover.rotation.y, this.rover.rotation.z);
      const yawQ = new THREE.Quaternion().setFromAxisAngle(this.up, this.yaw - this.baseYaw);
      const pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch);
      const rollQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), targetRoll);
      const worldQ = rollQ.multiply(pitchQ).multiply(yawQ).multiply(this.baseWorldQuaternion);
      const parentQ = this.rover.parent?.getWorldQuaternion(new THREE.Quaternion());
      if (parentQ) worldQ.premultiply(parentQ.invert());
      this.rover.quaternion.copy(worldQ);
    }
    this.setWorldPosition(this.worldPosition);
    this.wheelRollAngle += this.velocity * dt / this.wheelRadius;
    this.animateWheels(this.wheelRollAngle, this.steering);
    this.followCamera(dt, groundHeight, canOccupy);
  }

  private animateWheels(roll: number, steer: number): void {
    this.wheels.forEach((wheel, index) => {
      const parentWorld = wheel.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
      const steeringWorld = new THREE.Quaternion().setFromAxisAngle(this.up, steer * AXLE_STEERING_FACTORS[index]);
      const steeringLocal = parentWorld.clone().invert().multiply(steeringWorld).multiply(parentWorld);
      // The exported axle assemblies span local X; their wheel rolling axle is X.
      const rollingLocal = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), roll);
      wheel.quaternion.copy(steeringLocal.multiply(this.wheelBaseQuaternion[index]).multiply(rollingLocal));
    });
  }
  private setWorldPosition(position: THREE.Vector3): void {
    this.rover.position.copy(position);
    if (this.rover.parent) this.rover.parent.worldToLocal(this.rover.position);
  }
  private followCamera(dt: number, groundHeight: (x: number, z: number) => number,
    canOccupy?: (position: THREE.Vector3, radius: number, height: number) => boolean): void {
    this.rover.updateWorldMatrix(true, false);
    const center = this.rover.getWorldPosition(new THREE.Vector3()).add(this.centerOffset);
    const q = this.rover.getWorldQuaternion(new THREE.Quaternion());
    const fwd = new THREE.Vector3(0, -1, 0).applyQuaternion(q).setY(0).normalize();
    if (this.view === "FIRST PERSON") {
      // Move the first-person camera to the rover's nose so it looks over the
      // terrain instead of from inside the cabin. Leave the chase camera intact.
      this.cameraPosition.copy(center).addScaledVector(fwd, this.dimensions.z * 0.56);
      this.cameraPosition.y += this.dimensions.y * 0.2;
      this.cameraLook.copy(this.cameraPosition).addScaledVector(fwd, 18);
    } else {
      this.cameraPosition.copy(center).addScaledVector(fwd, -this.dimensions.z * 1.45);
      this.cameraPosition.y += this.dimensions.y * 1.5;
      this.cameraLook.copy(center).addScaledVector(fwd, 2);
      this.cameraLook.y += this.dimensions.y * 0.35;
    }
    const cameraGround = groundHeight(this.cameraPosition.x, this.cameraPosition.z);
    if (Number.isFinite(cameraGround)) this.cameraPosition.y = Math.max(this.cameraPosition.y, cameraGround + 0.32);
    if (canOccupy && !canOccupy(this.cameraPosition, 0.16, 0.34)) {
      this.cameraPosition.lerp(center, 0.55);
      const adjustedGround = groundHeight(this.cameraPosition.x, this.cameraPosition.z);
      if (Number.isFinite(adjustedGround)) this.cameraPosition.y = Math.max(this.cameraPosition.y, adjustedGround + 0.32);
    }
    const blend = dt <= 0 ? 1 : 1 - Math.exp(-dt * 5);
    this.camera.position.lerp(this.cameraPosition, blend);
    this.camera.lookAt(this.cameraLook);
  }
}
