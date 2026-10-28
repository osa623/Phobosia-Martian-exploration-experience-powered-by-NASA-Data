import * as THREE from "three";

export interface PresentationDescriptor {
  id: string;
  title: string;
  description: string;
  durationSeconds: number;
  skipKey?: string;
  targetObjectNames?: string[];
  targetMesh?: THREE.Object3D | null;
  targetWorldPosition?: THREE.Vector3 | null;
}

export class CameraPresentationManager {
  private active = false;
  private elapsed = 0;
  private duration = 5;
  private originalPos = new THREE.Vector3();
  private originalQuat = new THREE.Quaternion();
  private targetPos = new THREE.Vector3();
  private targetLookAt = new THREE.Vector3();
  private hasCameraMotion = false;
  private currentDescriptor: PresentationDescriptor | null = null;
  private onCompleteCallback: (() => void) | null = null;

  constructor(private camera: THREE.PerspectiveCamera) {}

  public isPresentationActive(): boolean {
    return this.active;
  }

  public getCurrentDescriptor(): PresentationDescriptor | null {
    return this.currentDescriptor;
  }

  /**
   * Starts a presentation. Pure horizontal plane motion (constant eye height Y,
   * zero pitch change, zero roll, slow smooth translation/rotation).
   */
  public startPresentation(
    descriptor: PresentationDescriptor,
    onComplete?: () => void
  ): boolean {
    if (this.active) {
      // Duplicate presentation guard: prevent overlapping camera presentations
      return false;
    }

    this.active = true;
    this.elapsed = 0;
    this.duration = Math.max(1, descriptor.durationSeconds || 4);
    this.currentDescriptor = descriptor;
    this.onCompleteCallback = onComplete || null;

    // Cache initial first-person camera transform
    this.originalPos.copy(this.camera.position);
    this.originalQuat.copy(this.camera.quaternion);

    // Resolve target location
    let targetWorldPos: THREE.Vector3 | null = descriptor.targetWorldPosition?.clone() ?? null;
    if (!targetWorldPos && descriptor.targetMesh) {
      targetWorldPos = new THREE.Vector3();
      descriptor.targetMesh.getWorldPosition(targetWorldPos);
    }

    if (targetWorldPos) {
      this.hasCameraMotion = true;
      // Target lookAt at the player's eye level (horizontal plane only, zero vertical tilt)
      this.targetLookAt.set(targetWorldPos.x, this.originalPos.y, targetWorldPos.z);

      // Compute gentle horizontal pan vector perpendicular to target direction
      const toTarget = new THREE.Vector3()
        .subVectors(this.targetLookAt, this.originalPos);
      toTarget.y = 0;

      if (toTarget.lengthSq() > 0.01) {
        toTarget.normalize();
        // Sideways perpendicular vector for a gentle slow arc/pan (0.4m max horizontal displacement)
        const sideways = new THREE.Vector3(-toTarget.z, 0, toTarget.x).multiplyScalar(0.4);
        this.targetPos.copy(this.originalPos).add(sideways);
      } else {
        this.targetPos.copy(this.originalPos);
      }
    } else {
      // Safe fallback when target object is missing: show introduction without camera motion
      this.hasCameraMotion = false;
      this.targetPos.copy(this.originalPos);
      this.targetLookAt.copy(this.originalPos);
    }

    return true;
  }

  /**
   * Update step invoked inside the game loop.
   */
  public update(dt: number): void {
    if (!this.active) return;

    this.elapsed += dt;
    const progress = Math.min(1, this.elapsed / this.duration);

    if (this.hasCameraMotion) {
      // Sinusoidal smooth interpolation: travels outwards and gently returns to original pose
      // sin(progress * PI) peaks at halfway and returns to 0 at completion
      const arc = Math.sin(progress * Math.PI);

      this.camera.position.x = THREE.MathUtils.lerp(this.originalPos.x, this.targetPos.x, arc);
      // STRICT: world height unchanged on horizontal plane
      this.camera.position.y = this.originalPos.y;
      this.camera.position.z = THREE.MathUtils.lerp(this.originalPos.z, this.targetPos.z, arc);

      // Smooth horizontal rotation towards target
      const lookPos = new THREE.Vector3(this.targetLookAt.x, this.originalPos.y, this.targetLookAt.z);
      const lookMatrix = new THREE.Matrix4().lookAt(this.camera.position, lookPos, new THREE.Vector3(0, 1, 0));
      const targetQuat = new THREE.Quaternion().setFromRotationMatrix(lookMatrix);

      // Extract only yaw (zero pitch and roll)
      const euler = new THREE.Euler().setFromQuaternion(targetQuat, "YXZ");
      euler.x = 0; // zero pitch
      euler.z = 0; // zero roll
      targetQuat.setFromEuler(euler);

      this.camera.quaternion.slerpQuaternions(this.originalQuat, targetQuat, arc * 0.5);
    }

    if (progress >= 1) {
      this.endPresentation(false);
    }
  }

  /**
   * Immediately skips presentation and restores first-person camera and controls.
   */
  public skip(): void {
    if (!this.active) return;
    this.endPresentation(true);
  }

  private endPresentation(skipped: boolean): void {
    if (!this.active) return;
    this.active = false;

    // Restore exact starting camera transform
    this.camera.position.copy(this.originalPos);
    this.camera.quaternion.copy(this.originalQuat);

    const cb = this.onCompleteCallback;
    this.onCompleteCallback = null;
    this.currentDescriptor = null;

    if (cb) {
      try {
        cb();
      } catch (err) {
        console.error("Error in presentation completion callback:", err);
      }
    }
  }
}
