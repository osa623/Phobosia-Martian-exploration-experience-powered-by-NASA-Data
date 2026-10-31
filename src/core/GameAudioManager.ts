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
  private readonly loops: Record<"walking" | "running" | "drone" | "mars", AudioLoop>;
  private desired: Record<"walking" | "running" | "drone" | "mars", number> = {
    walking: 0, running: 0, drone: 0, mars: 0
  };
  private current: Record<"walking" | "running" | "drone" | "mars", number> = {
    walking: 0, running: 0, drone: 0, mars: 0
  };
  private playing = new Set<keyof GameAudioManager["loops"]>();
  private blocked = new Set<keyof GameAudioManager["loops"]>();
  private movementState: IndoorMovementAudioState = "idle";
  private droneActive = false;

  constructor(createAudio: (src: string) => AudioLoop = src => new Audio(src)) {
    const makeLoop = (filename: string, volume: number) => {
      const audio = createAudio(`/assets/sounds/${filename}`);
      audio.loop = true;
      audio.volume = volume;
      audio.preload = "none";
      audio.addEventListener?.("error", () => this.blocked.add(filenameToKey[filename]));
      return audio;
    };
    this.loops = {
      walking: makeLoop("walkSound.MP3", 0.2),
      running: makeLoop("runningSound.MP3", 0.23),
      drone: makeLoop("droneSound.MP3", 0.25),
      mars: makeLoop("marsSound.MP3", 0.14)
    };
  }

  setIndoorMovement(state: IndoorMovementAudioState): void {
    this.movementState = state;
    this.desired.walking = state === "walking" ? 0.2 : 0;
    this.desired.running = state === "running" ? 0.23 : 0;
  }

  setSol5DroneActive(active: boolean): void {
    this.droneActive = active;
    this.desired.drone = active ? 0.25 : 0;
    this.desired.mars = active ? 0.14 : 0;
    if (active) this.setIndoorMovement("idle");
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
    for (const key of Object.keys(this.loops) as Array<keyof typeof this.loops>) {
      const audio = this.loops[key];
      const requested = this.desired[key];
      const oppositeFootstep = key === "walking" ? "running" : key === "running" ? "walking" : null;
      const target = oppositeFootstep && this.current[oppositeFootstep] > 0.005 ? 0 : requested;
      if (target > 0) this.start(key);
      this.current[key] += (target - this.current[key]) * blend;
      if (Math.abs(target - this.current[key]) < 0.005) this.current[key] = target;
      audio.volume = this.current[key];
      if (this.current[key] === 0 && (target === 0 || requested === 0)) this.stop(key);
    }
  }

  dispose(): void {
    for (const key of Object.keys(this.loops) as Array<keyof typeof this.loops>) {
      this.desired[key] = 0;
      this.current[key] = 0;
      this.stop(key);
    }
  }

  private start(key: keyof typeof this.loops): void {
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

  private stop(key: keyof typeof this.loops): void {
    if (!this.playing.has(key)) return;
    this.loops[key].pause();
    this.loops[key].currentTime = 0;
    this.playing.delete(key);
  }
}

const filenameToKey: Record<string, "walking" | "running" | "drone" | "mars"> = {
  "walkSound.MP3": "walking",
  "runningSound.MP3": "running",
  "droneSound.MP3": "drone",
  "marsSound.MP3": "mars"
};
