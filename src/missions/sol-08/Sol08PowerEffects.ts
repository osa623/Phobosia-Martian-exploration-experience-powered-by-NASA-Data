import * as THREE from "three";
import type { ModuleName } from "../../core/Discovery";

export const SOL08_POWER_WARNING_AUDIO = "/assets/sounds/sol7Sounds/warningBeepTone.MP3";
export const SOL08_EMERGENCY_LIGHTS: Partial<Record<ModuleName, readonly string[]>> = {
  Airlock: ["Light02", "Light08"],
  Hub: ["Light12", "Light15", "Light16", "Light17", "Light18"],
  Habitat: ["LightStrip08", "LightStrip09", "LightStrip10", "LightStrip12", "LightStrip13", "LightStrip14"],
  MissionControl: ["LightStrip02", "LightStrip03", "LightStrip04", "LightStrip05", "LightStrip06", "LightStrip07", "LightStrip08", "LightStrip09", "LightStrip10"],
  Science: ["Light007", "Light010", "Light012"],
  Engineering: ["Walking_Path_Light_0", "Walking_Path_Light_01", "Walking_Path_Light_02"]
};

export type Sol08Audio = { loop: boolean; volume: number; currentTime: number; paused: boolean; play(): Promise<void> | void; pause(): void };

/** Sol 8 Power Failure effects. Only named objects are changed; visibility is restored exactly. */
export class Sol08PowerEffects {
  private audio?: Sol08Audio;
  private fading = false;
  private active = false;
  private snapshots = new Map<string, { object: THREE.Object3D; visible: boolean }>();

  constructor(private readonly createAudio: (src: string) => Sol08Audio = src => new Audio(src)) {}

  start(): void {
    if (this.active) return;
    this.active = true;
    this.fading = false;
    const audio = this.createAudio(SOL08_POWER_WARNING_AUDIO);
    audio.loop = true;
    audio.volume = 0.18;
    this.audio = audio;
    try { void Promise.resolve(audio.play()).catch(error => console.warn("[Sol 8] Power warning audio could not start yet.", error)); } catch (error) { console.warn("[Sol 8] Power warning audio could not start yet.", error); }
  }

  disableModuleLights(model: THREE.Object3D, module: ModuleName): { found: string[]; missing: string[] } {
    if (!this.active) return { found: [], missing: [] };
    const expected = SOL08_EMERGENCY_LIGHTS[module] ?? [];
    const named = new Map<string, THREE.Object3D>();
    model.traverse(object => { if (expected.includes(object.name)) named.set(object.name, object); });
    const found: string[] = [];
    for (const name of expected) {
      const object = named.get(name);
      if (!object) continue;
      found.push(name);
      if (!this.snapshots.has(object.uuid)) this.snapshots.set(object.uuid, { object, visible: object.visible });
      object.visible = false;
    }
    const missing = expected.filter(name => !named.has(name));
    if (missing.length) console.warn(`[Sol 8] Emergency-light objects not found in ${module}: ${missing.join(", ")}`);
    return { found, missing };
  }

  restoreLights(): void {
    for (const { object, visible } of this.snapshots.values()) object.visible = visible;
    this.snapshots.clear();
  }

  fadeOut(): void { if (this.audio) this.fading = true; }
  isActive(): boolean { return this.active; }

  unlock(): void {
    if (this.audio && this.active && !this.fading && this.audio.paused) {
      try { void Promise.resolve(this.audio.play()).catch(error => console.warn("[Sol 8] Power warning audio remains unavailable.", error)); } catch (error) { console.warn("[Sol 8] Power warning audio remains unavailable.", error); }
    }
  }

  update(dt: number): void {
    if (!this.audio || !this.fading) return;
    this.audio.volume = Math.max(0, this.audio.volume - Math.max(0, dt) * 0.6);
    if (this.audio.volume <= 0.001) {
      this.audio.volume = 0;
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio = undefined;
      this.active = false;
      this.fading = false;
    }
  }

  dispose(): void {
    if (this.audio) {
      this.audio.volume = 0;
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio = undefined;
    }
    this.restoreLights();
    this.active = false;
    this.fading = false;
  }
}
