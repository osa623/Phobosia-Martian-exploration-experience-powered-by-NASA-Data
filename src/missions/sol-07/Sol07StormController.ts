import * as THREE from "three";
import type { ModuleName } from "../../core/Discovery";
import { getPreparedAssetUrl, getPreparedAudioElement } from "../../core/AssetLoading";

export const SOL07_AUDIO = {
  warning: "/assets/sounds/sol7Sounds/warningBeepTone.MP3",
  ambience: "/assets/sounds/sol7Sounds/sandStormSound.MP3"
} as const;

export const SOL07_EMERGENCY_LIGHTS: Record<ModuleName, readonly string[]> = {
  Airlock: ["Light02", "Light08"],
  Hub: ["Light_12", "Light_15", "Light_16", "Light_17", "Light_18"],
  Habitat: ["LightStrip08", "LightStrip09", "LightStrip10", "LightStrip12", "LightStrip13", "LightStrip14"],
  MissionControl: ["LightStrip02", "LightStrip03", "LightStrip04", "LightStrip05", "LightStrip06", "LightStrip07", "LightStrip08", "LightStrip09", "LightStrip10"],
  Science: ["Light.007", "Light.010", "Light.012"],
  Engineering: ["Walking_Path_Light_0", "Walking_Path_Light_01", "Walking_Path_Light_02"],
  Terrain: [], Drone: []
};

type MaterialSnapshot = { material: THREE.Material; color?: THREE.Color; emissive?: THREE.Color; emissiveIntensity?: number; opacity?: number; transparent?: boolean };
type LightSnapshot = { object: THREE.Object3D; intensity?: number; color?: THREE.Color; material: MaterialSnapshot[] };
type FadeAudio = { audio: HTMLAudioElement; target: number };

// Morse SOS: three short, three long, three short, with readable gaps.
const SOS_PATTERN: readonly [boolean, number][] = [
  [true, 0.28], [false, 0.22], [true, 0.28], [false, 0.22], [true, 0.28], [false, 0.62],
  [true, 0.78], [false, 0.22], [true, 0.78], [false, 0.22], [true, 0.78], [false, 0.62],
  [true, 0.28], [false, 0.22], [true, 0.28], [false, 0.22], [true, 0.28], [false, 1.1]
];
const SOS_CYCLE_SECONDS = SOS_PATTERN.reduce((sum, [, duration]) => sum + duration, 0);

/** Sol 7-only emergency effects. Captures authored values once and restores them verbatim. */
export class Sol07StormController {
  private active = false;
  private ending = false;
  private elapsed = 0;
  private pulseOn: boolean | null = null;
  private lights = new Map<string, LightSnapshot>();
  private audio: FadeAudio[] = [];

  start(createAudio: (src: string) => HTMLAudioElement = src => getPreparedAudioElement(src) ?? new Audio(getPreparedAssetUrl(src))): void {
    if (this.active) return;
    this.active = true;
    this.ending = false;
    this.elapsed = 0;
    this.pulseOn = null;
    const warning = createAudio(SOL07_AUDIO.warning);
    warning.loop = true;
    warning.volume = 0.12;
    const ambience = createAudio(SOL07_AUDIO.ambience);
    ambience.loop = true;
    ambience.volume = 0.2;
    this.audio = [{ audio: warning, target: 0.12 }, { audio: ambience, target: 0.2 }];
    for (const item of this.audio) {
      void item.audio.play().catch(() => undefined);
    }
  }

  applyToModule(model: THREE.Object3D, module: ModuleName): { found: string[]; missing: string[] } {
    if (!this.active || this.ending) return { found: [], missing: [] };
    const expected = SOL07_EMERGENCY_LIGHTS[module];
    const byName = new Map<string, THREE.Object3D>();
    model.traverse(object => { if (expected.includes(object.name)) byName.set(object.name, object); });
    const found: string[] = [];
    for (const name of expected) {
      const object = byName.get(name);
      if (!object) continue;
      found.push(name);
      const targets: THREE.Object3D[] = [object];
      object.traverse(child => {
        if (child === object) return;
        const candidate = child as THREE.Object3D & { isLight?: boolean; isMesh?: boolean };
        if (candidate.isLight || candidate.isMesh) targets.push(child);
      });
      for (const target of targets) {
        const light = target as THREE.Light;
        const mesh = target as THREE.Mesh;
        const materialObjects: THREE.Material[] = mesh.isMesh ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
        if (this.lights.has(target.uuid) || (!materialObjects.length && !("intensity" in light))) continue;
        this.lights.set(target.uuid, {
          object: target,
          intensity: "intensity" in light ? light.intensity : undefined,
          color: "color" in light && (light as THREE.Light).color instanceof THREE.Color ? (light as THREE.Light).color.clone() : undefined,
          material: materialObjects.map(material => {
            const m = material as THREE.Material & { color?: THREE.Color; emissive?: THREE.Color; emissiveIntensity?: number };
            return { material, color: m.color?.clone(), emissive: m.emissive?.clone(), emissiveIntensity: m.emissiveIntensity, opacity: m.opacity, transparent: m.transparent };
          })
        });
      }
    }
    const missing = expected.filter(name => !byName.has(name));
    if (missing.length) console.warn(`[Sol 7] Emergency-light mappings not found in ${module}: ${missing.join(", ")}`);
    this.applyFlicker(this.currentPulseState());
    return { found, missing };
  }

  update(dt: number): void {
    if (!this.active) return;
    this.elapsed += Math.max(0, dt);
    if (!this.ending) {
      const pulseOn = this.currentPulseState();
      if (pulseOn !== this.pulseOn) this.applyFlicker(pulseOn);
    }
    const blend = Math.min(1, Math.max(0, dt) * 0.8);
    for (const item of this.audio) {
      const target = this.ending ? 0 : item.target;
      item.audio.volume += (target - item.audio.volume) * blend;
      if (this.ending && item.audio.volume < 0.004) {
        item.audio.volume = 0;
        item.audio.pause();
        item.audio.currentTime = 0;
      }
    }
    if (this.ending && this.audio.every(item => item.audio.paused)) {
      this.restoreLights();
      this.active = false;
      this.ending = false;
    }
  }

  unlock(): void {
    if (!this.active || this.ending) return;
    for (const item of this.audio) if (item.audio.paused) void item.audio.play().catch(() => undefined);
  }

  /** Called only after MissionManager validates and persists the final report. */
  endAfterValidatedReport(): void { if (this.active) this.ending = true; }
  isActive(): boolean { return this.active && !this.ending; }
  isEnding(): boolean { return this.ending; }

  /** Interrupted lifecycle cleanup restores captured properties immediately. */
  dispose(): void {
    for (const item of this.audio) { item.audio.pause(); item.audio.currentTime = 0; item.audio.volume = 0; }
    this.audio = [];
    this.restoreLights();
    this.active = false;
    this.ending = false;
    this.elapsed = 0;
  }

  private currentPulseState(): boolean {
    let phase = this.elapsed % SOS_CYCLE_SECONDS;
    for (const [on, duration] of SOS_PATTERN) {
      if (phase < duration) return on;
      phase -= duration;
    }
    return false;
  }

  private applyFlicker(on: boolean): void {
    this.pulseOn = on;
    for (const snapshot of this.lights.values()) {
      const light = snapshot.object as THREE.Light;
      const lightLevel = on ? 2.2 : 0.08;
      if (snapshot.intensity !== undefined) light.intensity = Math.max(snapshot.intensity * lightLevel, on ? 1.5 : 0.04);
      if (snapshot.color && "color" in light) light.color.setRGB(1, on ? 0.025 : 0.006, on ? 0.008 : 0.003);
      for (const item of snapshot.material) {
        const mat = item.material as THREE.Material & { color?: THREE.Color; emissive?: THREE.Color; emissiveIntensity?: number };
        if (item.emissive) {
          mat.emissive?.setRGB(1, on ? 0.012 : 0.002, on ? 0.003 : 0.001);
          mat.emissiveIntensity = Math.max(item.emissiveIntensity ?? 1, on ? 2.8 : 0.18);
        }
        if (item.color) mat.color?.setRGB(on ? 1 : 0.24, on ? 0.035 : 0.008, on ? 0.025 : 0.006);
      }
    }
  }

  private restoreLights(): void {
    for (const snapshot of this.lights.values()) {
      const light = snapshot.object as THREE.Light;
      if (snapshot.intensity !== undefined) light.intensity = snapshot.intensity;
      if (snapshot.color && "color" in light) light.color.copy(snapshot.color);
      for (const item of snapshot.material) {
        const mat = item.material as THREE.Material & { color?: THREE.Color; emissive?: THREE.Color; emissiveIntensity?: number };
        if (item.color) mat.color?.copy(item.color);
        if (item.emissive) mat.emissive?.copy(item.emissive);
        if (item.emissiveIntensity !== undefined) mat.emissiveIntensity = item.emissiveIntensity;
        if (item.opacity !== undefined) mat.opacity = item.opacity;
        if (item.transparent !== undefined) mat.transparent = item.transparent;
        mat.needsUpdate = true;
      }
    }
    this.lights.clear();
  }
}
