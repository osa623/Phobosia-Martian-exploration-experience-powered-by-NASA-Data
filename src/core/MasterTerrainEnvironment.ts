import * as THREE from "three";
import { DAY1_TASKS } from "./Day1Config";
import { DAYS_CONFIG, type MissionProgressState } from "./MissionManager";

export const DAYTIME_EXR_URL = "/assets/exr/mars-dunes-day-light_2K_fc2ff73b-6eed-4836-92ed-f94e0d2d649f.exr";
export const NIGHTTIME_EXR_URL = "/assets/exr/NightSkyHDRI008_4K_HDR.exr";
export const NIGHTTIME_DURATION_SECONDS = 6 * 60 * 60;
export const NIGHTTIME_SPOT_INTENSITY = 800;
export const NIGHTTIME_FILL_INTENSITY = 65;
export const NIGHTTIME_SHADOW_MAP_SIZE = 1024;
// User-selected faster apparent night-sky rotation: one revolution per 18 active hours.
export const NIGHTTIME_SKY_ROTATION_RADIANS_PER_SECOND = (Math.PI * 2) / (18 * 60 * 60);

export function advanceNighttimeGameplayClock(elapsedSeconds: number, deltaSeconds: number, paused: boolean): { elapsedSeconds: number; expired: boolean } {
  if (paused || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return { elapsedSeconds, expired: false };
  const next = elapsedSeconds + deltaSeconds;
  return next >= NIGHTTIME_DURATION_SECONDS
    ? { elapsedSeconds: NIGHTTIME_DURATION_SECONDS, expired: true }
    : { elapsedSeconds: next, expired: false };
}

export type MasterTerrainEnvironmentMode = "daytime" | "nighttime_eligible" | "nighttime" | "mission_override";

/** Independent per-SOL gate backed by the same required steps used by MissionManager. */
export function isMasterTerrainNighttimeEligible(
  state: Readonly<MissionProgressState>,
  missionTransitioning: boolean
): boolean {
  if (missionTransitioning || !["completed", "waiting_for_rest"].includes(state.objectiveState) || state.sol5.attemptStatus === "active") return false;
  const requiredIds = state.currentDay === 1
    ? DAY1_TASKS.filter(task => task.required).map(task => task.taskId)
    : DAYS_CONFIG[state.currentDay]?.steps.map(step => step.stepId);
  if (!requiredIds?.length) return false;
  const completed = new Set(state.completedStepIds);
  if (!requiredIds.every(id => completed.has(id))) return false;

  // These days also have authoritative records/state beyond the task checklist.
  if (state.currentDay === 2 && !state.investigationRecords.some(record => record.taskId === "SOL02_READINESS_ASSESSMENT")) return false;
  if (state.currentDay === 3 && !state.investigationRecords.some(record => record.taskId === "SOL03_SUBMIT_TARGET_RECORD")) return false;
  if (state.currentDay === 4 && !state.investigationRecords.some(record => record.taskId === "SOL04_SUBMIT_PREPARATION_REPORT")) return false;
  if (state.currentDay === 7 && (!state.sol7.report?.validated || !state.sol7.stormEnded)) return false;
  if (state.currentDay === 8 && !state.sol8.report?.validated) return false;
  if (state.currentDay === 9 && !state.sol9.report?.validated) return false;
  return true;
}

export interface TerrainLightAudit {
  panelNames: string[];
  missingPanels: string[];
  markerNames: string[];
  duplicateMarkers: string[];
  missingMarkers: string[];
  extraPanels: string[];
  hasLightsPanelParent: boolean;
  markerWorldTransforms: Array<{ name: string; position: [number, number, number]; rotation: [number, number, number] }>;
}

export interface TerrainLightClusters {
  group: THREE.Group;
  lights: THREE.SpotLight[];
  audit: TerrainLightAudit;
  shadowLightNames: string[];
}

/** Creates actual spotlights from authored markers and aims them at the loaded Habitat bounds. */
export function createMasterTerrainLightClusters(terrain: THREE.Object3D, owner: THREE.Group): TerrainLightClusters {
  const previous = owner.getObjectByName("Master Terrain nighttime light clusters");
  if (previous) {
    owner.remove(previous);
    previous.traverse(object => {
      const light = object as THREE.SpotLight;
      if (light.isSpotLight) light.shadow.map?.dispose();
    });
  }
  terrain.traverse(object => {
    for (const child of [...object.children]) {
      if (child.name.endsWith("_NightSpot") && (child as THREE.SpotLight).isSpotLight) {
        object.remove(child);
        (child as THREE.SpotLight).shadow.map?.dispose();
      }
    }
  });
  terrain.updateWorldMatrix(true, true);
  owner.updateWorldMatrix(true, false);

  const panels: THREE.Object3D[] = [];
  const markers = new Map<string, THREE.Object3D>();
  const duplicateMarkers = new Set<string>();
  let hasLightsPanelParent = false;
  terrain.traverse(object => {
    if (/^Light_Panel(?:_\d{2})?$/.test(object.name)) panels.push(object);
    if (object.name === "LightsPanel") hasLightsPanelParent = true;
    const markerMatch = /^reallight(\d{2})$/i.exec(object.name);
    if (markerMatch) {
      const name = `reallight${markerMatch[1]}`;
      if (markers.has(name)) duplicateMarkers.add(name);
      else markers.set(name, object);
    }
  });
  const markerNames = [...markers.keys()].sort();
  const transforms = markerNames.map(name => {
    const object = markers.get(name)!;
    const position = object.getWorldPosition(new THREE.Vector3());
    const rotation = new THREE.Euler().setFromQuaternion(object.getWorldQuaternion(new THREE.Quaternion()));
    return { name, position: position.toArray() as [number, number, number], rotation: [rotation.x, rotation.y, rotation.z] as [number, number, number] };
  });
  const expectedMarkers = Array.from({ length: 8 }, (_, index) => `reallight${String(index + 1).padStart(2, "0")}`);
  const extraPanels = panels.map(panel => panel.name).filter(name => !["Light_Panel", ...Array.from({ length: 6 }, (_, i) => `Light_Panel_${String(i + 2).padStart(2, "0")}`)].includes(name));
  const expectedPanels = ["Light_Panel", ...Array.from({ length: 6 }, (_, i) => `Light_Panel_${String(i + 2).padStart(2, "0")}`)];
  const panelNames = panels.map(panel => panel.name).sort();
  const audit: TerrainLightAudit = {
    panelNames, missingPanels: expectedPanels.filter(name => !panelNames.includes(name)), markerNames,
    duplicateMarkers: [...duplicateMarkers], missingMarkers: expectedMarkers.filter(name => !markers.has(name)),
    extraPanels, hasLightsPanelParent, markerWorldTransforms: transforms
  };

  const group = new THREE.Group();
  group.name = "Master Terrain nighttime light clusters";
  group.visible = false;
  owner.add(group);
  const habitat = terrain.getObjectByName("Habitat_Zone") ?? terrain.getObjectByName("Habitat");
  if (!habitat || !markers.size) return { group, lights: [], audit, shadowLightNames: [] };
  const bounds = new THREE.Box3().setFromObject(habitat);
  if (bounds.isEmpty()) return { group, lights: [], audit, shadowLightNames: [] };
  const targetWorld = bounds.getCenter(new THREE.Vector3());
  targetWorld.y = Math.min(targetWorld.y, bounds.max.y - bounds.getSize(new THREE.Vector3()).y * 0.15);
  const markerRows = [...markers.entries()].map(([name, marker]) => ({ name, marker, position: marker.getWorldPosition(new THREE.Vector3()) }));
  const shadowNames = new Set([...markerRows].sort((a, b) => a.position.distanceTo(targetWorld) - b.position.distanceTo(targetWorld)).slice(0, 2).map(row => row.name));
  const shadowLightNames: string[] = [];
  const lights: THREE.SpotLight[] = [];
  for (const { name, marker, position } of markerRows) {
    const target = new THREE.Object3D();
    target.name = `${name}_HabitatAim`;
    const markerTarget = targetWorld.clone();
    markerTarget.y = Math.min(markerTarget.y, position.y - 1);
    target.position.copy(owner.worldToLocal(markerTarget));
    group.add(target);
    const aimDirection = markerTarget.clone().sub(position).normalize();
    const downAngle = Math.acos(THREE.MathUtils.clamp(-aimDirection.y, -1, 1));
    const coneAngle = Math.min(Math.PI / 2 - 0.015, downAngle + 0.04);
    const spot = new THREE.SpotLight(0xffc98f, shadowNames.has(name) ? NIGHTTIME_SPOT_INTENSITY : NIGHTTIME_FILL_INTENSITY, Math.max(18, position.distanceTo(markerTarget) * 1.55), coneAngle, 0.65, 1.4);
    spot.name = `${name}_NightSpot`;
    spot.position.set(0, 0, 0);
    spot.target = target;
    spot.visible = false;
    spot.castShadow = shadowNames.has(name);
    if (spot.castShadow) {
      shadowLightNames.push(spot.name);
      spot.shadow.mapSize.set(NIGHTTIME_SHADOW_MAP_SIZE, NIGHTTIME_SHADOW_MAP_SIZE);
      spot.shadow.camera.near = 0.5;
      spot.shadow.camera.far = Math.max(20, position.distanceTo(targetWorld) * 1.7);
      spot.shadow.camera.fov = Math.min(95, THREE.MathUtils.radToDeg(spot.angle * 2));
      spot.shadow.camera.updateProjectionMatrix();
      spot.shadow.bias = -0.00035;
      spot.shadow.normalBias = 0.01;
    }
    marker.add(spot);
    lights.push(spot);
  }
  return { group, lights, audit, shadowLightNames };
}

export function setTerrainNightLightsEnabled(clusters: TerrainLightClusters | undefined, enabled: boolean): void {
  if (!clusters) return;
  clusters.group.visible = true;
  for (const light of clusters.lights) light.visible = enabled;
}
