import * as THREE from "three";
import { type MovementConfig, DEFAULT_MOVEMENT_CONFIG } from "./MovementConfig";

export class Player {
  public keys = new Set<string>();
  public velocity = new THREE.Vector3();
  public yaw = 0;
  public pitch = 0;
  public grounded = true;
  public eyeHeight = 1.65;

  // Authoritative physical reference position (unaffected by head bob / breathing)
  public basePosition = new THREE.Vector3();

  // Head bobbing and breathing motion state
  private bobTimer = 0;
  private breathTimer = 0;
  private currentCameraOffset = 0;
  private config: MovementConfig;

  constructor(private camera: THREE.PerspectiveCamera, config: MovementConfig = DEFAULT_MOVEMENT_CONFIG) {
    this.config = config;
    this.camera.rotation.order = "YXZ";
    this.basePosition.copy(this.camera.position);
  }

  public setConfig(newConfig: Partial<MovementConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): Readonly<MovementConfig> {
    return this.config;
  }

  public setEyeHeight(height: number): void {
    this.eyeHeight = height;
  }

  public look(dx: number, dy: number): void {
    this.yaw -= dx * 0.002;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.002, -1.45, 1.45);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  public face(quaternion: THREE.Quaternion): void {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
    this.yaw = Math.atan2(-forward.x, -forward.z);
    this.pitch = 0;
    this.camera.rotation.set(0, this.yaw, 0);
    this.syncBasePosition();
  }

  /**
   * Resets or teleports the player's physical reference position to the camera position,
   * clearing any active bobbing offset and residual velocities.
   */
  public syncBasePosition(): void {
    this.basePosition.copy(this.camera.position);
    this.currentCameraOffset = 0;
  }

  public resetVelocity(): void {
    this.velocity.set(0, 0, 0);
    this.syncBasePosition();
  }

  public update(
    dt: number,
    canOccupy: (position: THREE.Vector3) => boolean,
    groundHeight: (position: THREE.Vector3) => number
  ): void {
    // If basePosition is uninitialized or camera was externally teleported, sync from camera
    if ((this.basePosition.lengthSq() === 0 && this.camera.position.lengthSq() > 0) ||
        this.basePosition.distanceTo(this.camera.position) > 2.0) {
      this.syncBasePosition();
    }

    const isRunning = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const targetSpeed = isRunning ? this.config.runSpeed : this.config.walkSpeed;

    // 1. Compute normalized planar movement input
    const inputX = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
    const inputZ = (this.keys.has("KeyS") ? 1 : 0) - (this.keys.has("KeyW") ? 1 : 0);
    const inputDir = new THREE.Vector3(inputX, 0, inputZ);

    let targetVelX = 0;
    let targetVelZ = 0;

    if (inputDir.lengthSq() > 0) {
      inputDir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      targetVelX = inputDir.x * targetSpeed;
      targetVelZ = inputDir.z * targetSpeed;
    }

    // 2. Smooth horizontal acceleration / deceleration
    const accelRate = inputDir.lengthSq() > 0 ? this.config.acceleration : this.config.deceleration;
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, targetVelX, accelRate, dt);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, targetVelZ, accelRate, dt);

    // Threshold near-zero velocity to eliminate tiny micro-drifts
    if (Math.abs(this.velocity.x) < 0.001) this.velocity.x = 0;
    if (Math.abs(this.velocity.z) < 0.001) this.velocity.z = 0;

    // 3. Horizontal collision integration with axis-independent sliding
    const moveX = this.velocity.x * dt;
    const moveZ = this.velocity.z * dt;

    if (moveX !== 0) {
      const testX = new THREE.Vector3(this.basePosition.x + moveX, this.basePosition.y, this.basePosition.z);
      if (canOccupy(testX)) {
        this.basePosition.x = testX.x;
      } else {
        this.velocity.x = 0;
      }
    }

    if (moveZ !== 0) {
      const testZ = new THREE.Vector3(this.basePosition.x, this.basePosition.y, this.basePosition.z + moveZ);
      if (canOccupy(testZ)) {
        this.basePosition.z = testZ.z;
      } else {
        this.velocity.z = 0;
      }
    }

    // 4. Vertical movement & ground detection
    const ground = groundHeight(this.basePosition);

    if (this.keys.has("Space") && this.grounded) {
      this.velocity.y = this.config.jumpVelocity;
      this.grounded = false;
    }

    this.velocity.y -= this.config.gravity * dt;
    this.basePosition.y += this.velocity.y * dt;

    if (this.basePosition.y < ground + this.eyeHeight) {
      this.basePosition.y = ground + this.eyeHeight;
      this.velocity.y = 0;
      this.grounded = true;
    }

    // 5. Camera head-bob and breathing calculation
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const isMoving = this.grounded && horizontalSpeed > 0.15;

    let targetBob = 0;
    if (this.config.bobEnabled && isMoving) {
      const freq = isRunning ? this.config.bobRunFrequency : this.config.bobWalkFrequency;
      const amp = isRunning ? this.config.bobRunAmplitude : this.config.bobWalkAmplitude;
      this.bobTimer += dt * freq;
      targetBob = Math.sin(this.bobTimer) * amp;
    } else {
      // Gently reset phase when stationary
      this.bobTimer = 0;
    }

    let targetBreath = 0;
    if (this.config.idleBreathingEnabled && !isMoving && this.grounded) {
      this.breathTimer += dt * this.config.idleBreathingFrequency;
      targetBreath = Math.sin(this.breathTimer) * this.config.idleBreathingAmplitude;
    }

    // Smoothly blend camera vertical offset toward target
    const targetOffset = targetBob + targetBreath;
    this.currentCameraOffset = THREE.MathUtils.lerp(
      this.currentCameraOffset,
      targetOffset,
      Math.min(1, dt * this.config.bobBlendSpeed)
    );

    // 6. Update actual camera position from basePosition + offset
    this.camera.position.set(
      this.basePosition.x,
      this.basePosition.y + this.currentCameraOffset,
      this.basePosition.z
    );
  }
}
