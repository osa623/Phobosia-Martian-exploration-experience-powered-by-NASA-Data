import { getPreparedAssetUrl, getPreparedAudioElement } from "./AssetLoading";

export type AudioLoop = {
  loop: boolean;
  volume: number;
  preload: string;
  play: () => Promise<void> | void;
  pause: () => void;
  currentTime: number;
  addEventListener?: (type: string, listener: () => void) => void;
};

export type IndoorMovementAudioState = "idle" | "walking" | "running";

export function resolveIndoorMovementAudioState(input: {
  indoor: boolean;
  playerControlled: boolean;
  grounded: boolean;
  horizontalSpeed: number;
  running: boolean;
}): IndoorMovementAudioState {
  if (!input.indoor || !input.playerControlled || !input.grounded || input.horizontalSpeed <= 0.15) return "idle";
  return input.running ? "running" : "walking";
}

export class GameAudioManager {
  private readonly loops: Record<AudioKey, AudioLoop>;
  private desired: Record<AudioKey, number> = {
    walking: 0, running: 0, terrainWalking: 0, terrainRunning: 0, drone: 0, mars: 0
  };
  private current: Record<AudioKey, number> = {
    walking: 0, running: 0, terrainWalking: 0, terrainRunning: 0, drone: 0, mars: 0
  };
  private playing = new Set<AudioKey>();
  private blocked = new Set<AudioKey>();
  private movementState: IndoorMovementAudioState = "idle";
  private marsMovementState: IndoorMovementAudioState = "idle";
  private droneActive = false;
  private marsTerrainActive = false;

  constructor(createAudio: (src: string) => AudioLoop = src => getPreparedAudioElement(src) ?? new Audio(getPreparedAssetUrl(src))) {
    const makeLoop = (key: AudioKey, filename: string, volume: number) => {
      const audio = createAudio(`/assets/sounds/${filename}`);
      audio.loop = true;
      audio.volume = volume;
      audio.preload = "none";
      audio.addEventListener?.("error", () => this.blocked.add(key));
      return audio;
    };
    this.loops = {
      walking: makeLoop("walking", "walkSound.MP3", 0.2),
      running: makeLoop("running", "runningSound.MP3", 0.23),
      drone: makeLoop("drone", "droneSound.MP3", 0.25),
      mars: makeLoop("mars", "marsSound.MP3", 0.14),
      terrainWalking: makeLoop("terrainWalking", "terrainWalkSound.MP3", 0.16),
      terrainRunning: makeLoop("terrainRunning", "terrainRunningSound.MP3", 0.18)
    };
  }

  setIndoorMovement(state: IndoorMovementAudioState): void {
    this.movementState = state;
    this.desired.walking = state === "walking" ? 0.2 : 0;
    this.desired.running = state === "running" ? 0.23 : 0;
    if (state !== "idle") {
      this.marsMovementState = "idle";
      this.desired.terrainWalking = 0;
      this.desired.terrainRunning = 0;
    }
  }

  /** Mars movement uses its own sources; the environmental loop remains on while stationary. */
  setMarsTerrain(active: boolean, state: IndoorMovementAudioState = "idle"): void {
    this.marsTerrainActive = active;
    this.marsMovementState = active ? state : "idle";
    this.desired.terrainWalking = active && state === "walking" ? 0.16 : 0;
    this.desired.terrainRunning = active && state === "running" ? 0.18 : 0;
    if (active) {
      this.movementState = "idle";
      this.desired.walking = 0;
      this.desired.running = 0;
    }
    this.syncMarsAmbient();
  }

  setSol5DroneActive(active: boolean): void {
    this.droneActive = active;
    this.desired.drone = active ? 0.25 : 0;
    if (active) {
      this.marsTerrainActive = false;
      this.marsMovementState = "idle";
      this.desired.terrainWalking = 0;
      this.desired.terrainRunning = 0;
      this.setIndoorMovement("idle");
    }
    this.syncMarsAmbient();
  }

  /** Called from real keyboard input to retry audio after browser autoplay blocks. */
  unlock(): void {
    this.blocked.clear();
    for (const key of Object.keys(this.loops) as Array<keyof typeof this.loops>) {
      if (this.desired[key] > 0) this.start(key);
    }
  }

  update(dt: number): void {
    // Approach target volume over a short fade while keeping each source singular.
    const blend = Math.min(1, Math.max(0, dt) * 8);
    for (const key of Object.keys(this.loops) as AudioKey[]) {
      const audio = this.loops[key];
      const requested = this.desired[key];
      const competingMovement = MOVEMENT_AUDIO_KEYS.some(other => other !== key && this.current[other] > 0.005);
      const target = MOVEMENT_AUDIO_KEYS.includes(key) && competingMovement ? 0 : requested;
      if (target > 0) this.start(key);
      this.current[key] += (target - this.current[key]) * blend;
      if (Math.abs(target - this.current[key]) < 0.005) this.current[key] = target;
      audio.volume = this.current[key];
      if (this.current[key] === 0 && (target === 0 || requested === 0)) this.stop(key);
    }
  }

  dispose(): void {
    for (const key of Object.keys(this.loops) as AudioKey[]) {
      this.desired[key] = 0;
      this.current[key] = 0;
      this.stop(key);
    }
  }

  private syncMarsAmbient() {
    this.desired.mars = this.marsTerrainActive || this.droneActive ? 0.14 : 0;
  }

  private start(key: AudioKey): void {
    if (this.playing.has(key) || this.blocked.has(key)) return;
    this.playing.add(key);
    try {
      const result = this.loops[key].play();
      if (result && typeof result.then === "function") {
        void result.catch(() => {
          this.playing.delete(key);
          this.blocked.add(key);
        });
      }
    } catch {
      this.playing.delete(key);
      this.blocked.add(key);
    }
  }

  private stop(key: AudioKey): void {
    if (!this.playing.has(key)) return;
    this.loops[key].pause();
    this.loops[key].currentTime = 0;
    this.playing.delete(key);
  }
}

type AudioKey = "walking" | "running" | "terrainWalking" | "terrainRunning" | "drone" | "mars";
const MOVEMENT_AUDIO_KEYS: readonly AudioKey[] = ["walking", "running", "terrainWalking", "terrainRunning"];
