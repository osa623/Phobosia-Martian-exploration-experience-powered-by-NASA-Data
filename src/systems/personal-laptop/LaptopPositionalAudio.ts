import * as THREE from "three";

const SCREEN_NAME = "Habitat_Workstation_Display";
const HABITAT_FLOOR_NAME = "Floor";
const HABITAT_GATE_FADE_SECONDS = 0.22;

/** Routes the laptop's existing media element through an invisible source at the physical screen. */
export class LaptopPositionalAudio {
  private listener: THREE.AudioListener | null = null;
  private sound: THREE.PositionalAudio | null = null;
  private screen: THREE.Object3D | null = null;

  public attach(model: THREE.Group, camera: THREE.Camera, mediaElement: HTMLMediaElement, playerEyeHeight: number): { context: AudioContext; gate: AudioParam } {
    if (this.sound && this.listener) {
      if (this.sound.parent !== this.screen && this.screen) this.screen.add(this.sound);
      return { context: this.listener.context, gate: this.sound.gain.gain };
    }

    model.updateWorldMatrix(true, true);
    const screen = model.getObjectByName(SCREEN_NAME);
    if (!screen) throw new Error(`${SCREEN_NAME} is required for laptop positional audio.`);

    // Use the existing Habitat floor's world bounds for the authored room footprint.
    const floor = model.getObjectByName(HABITAT_FLOOR_NAME);
    if (!floor) throw new Error(`${HABITAT_FLOOR_NAME} is required to size laptop audio attenuation.`);
    const roomBounds = new THREE.Box3().setFromObject(floor);
    const roomSize = roomBounds.getSize(new THREE.Vector3());
    const maxDistance = Math.max(2, Math.hypot(roomSize.x, roomSize.z) * 0.5);
    // Listener is at the player's eye; use the project's configured eye height as the close-range reference.
    const refDistance = Math.max(0.25, Math.min(playerEyeHeight, maxDistance * 0.25));

    const listener = new THREE.AudioListener();
    camera.add(listener);
    const sound = new THREE.PositionalAudio(listener);
    sound.setRefDistance(refDistance);
    sound.setMaxDistance(maxDistance);
    sound.setRolloffFactor(1);
    sound.setDistanceModel("linear");
    sound.setVolume(0);

    // Reuse the one HTMLAudioElement owned by the OS controller; no second player is created.
    sound.setMediaElementSource(mediaElement);
    screen.add(sound);

    this.listener = listener;
    this.sound = sound;
    this.screen = screen;
    return { context: listener.context, gate: sound.gain.gain };
  }

  public setHabitatAudible(audible: boolean) {
    if (!this.sound) return;
    const gain = this.sound.gain.gain;
    const now = this.sound.context.currentTime;
    gain.cancelScheduledValues(now);
    gain.setTargetAtTime(audible ? 1 : 0, now, HABITAT_GATE_FADE_SECONDS / 3);
  }

  public dispose() {
    if (this.sound) {
      this.screen?.remove(this.sound);
      this.sound.disconnect();
    }
    if (this.listener) this.listener.parent?.remove(this.listener);
    this.listener = null;
    this.sound = null;
    this.screen = null;
  }
}
