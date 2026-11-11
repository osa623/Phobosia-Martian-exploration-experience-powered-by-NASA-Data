import * as THREE from "three";
import type { CollisionProfile } from "./CollisionProfiles";

export type CollisionKind =
  | "environment-solid"
  | "floor"
  | "walking-path"
  | "trigger"
  | "interactive"
  | "master-terrain"
  | "terrain-rock"
  | "decorative-nonblocking";

const excluded =
  /floor|walking[ _-]?path|walkway|trigger|spawn|entrance|screen|display|monitor|console|laptop|tv|light|lamp|photo|plant|pillow|book|notebook|penna|satellite|solar|inner_wall|drone|rover|panorama|sky/i;
const terrain = /PHOBOSIA_MarsTerrain_2km/i;
const rocks = /rock/i;

export function classifyCollision(
  object: THREE.Object3D,
  interactive: Set<THREE.Object3D>,
  terrainModule: boolean
): CollisionKind {
  const name = object.name;
  if (terrain.test(name)) return "master-terrain";
  if (terrainModule && rocks.test(name)) return "terrain-rock";
  if (interactive.has(object) || /trigger|spawn|entrance/i.test(name)) return "trigger";
  if (/floor/i.test(name)) return "floor";
  if (/walking[ _-]?path|walkway/i.test(name)) return "walking-path";
  if (/screen|display|monitor|console|laptop|tv/i.test(name)) return "interactive";
  if (excluded.test(name)) return "decorative-nonblocking";
  return "environment-solid";
}

export function buildInteriorColliders(
  root: THREE.Object3D,
  interactive: Set<THREE.Object3D>,
  profile: CollisionProfile
): THREE.Box3[] {
  const colliders: THREE.Box3[] = [];
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (object.parent?.name === "Runtime interaction indicators and lighting") return;
    if (!mesh.isMesh || !mesh.geometry || classifyCollision(mesh, interactive, false) !== "environment-solid") return;
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    if (size.x < 0.04 || size.y < 0.04 || size.z < 0.04) return;
    if (
      profile.roomShells.includes(mesh.name) ||
      (size.x > 7 && size.z > 7) ||
      (size.x * size.z > profile.maxRoomFootprint && size.y > 2.5)
    )
      return;
    box.expandByVector(new THREE.Vector3(0.28, 0, 0.28));
    colliders.push(box);
  });
  return colliders;
}

/** Static coarse AABBs for solid mesh objects across mars_Terrain, including buildings, vehicles and rocks. */
export function buildTerrainBuildingColliders(root: THREE.Object3D, excludeRocks = false, excludeSolarStructures = false, excludeSatelliteCommunication = false, excludeRoverStructures = false): THREE.Box3[] {
  const skipped = excludeRocks
    ? /floor|walkway|screen|display|monitor|console|light|lamp|trigger|spawn|entrance|drone_object|takeoffpoint|target_|panorama|sky|rock/i
    : /floor|walkway|screen|display|monitor|console|light|lamp|trigger|spawn|entrance|drone_object|takeoffpoint|target_|panorama|sky/i;
  const colliders: THREE.Box3[] = [];
  root.updateWorldMatrix(true, true);
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    let vehicleAncestor: THREE.Object3D | null = object;
    while (vehicleAncestor && vehicleAncestor !== root) {
      if (vehicleAncestor.name === "TerrainRover") return;
      vehicleAncestor = vehicleAncestor.parent;
    }
    let ancestor: THREE.Object3D | null = object;
    let belongsToSolarStructure = false;
    let belongsToSatelliteCommunication = false;
    while (ancestor && ancestor !== root) {
      if (/solar|solor|solarpanel/i.test(ancestor.name)) {
        belongsToSolarStructure = true;
      }
      if (/satellite|satelite|communication|commuication/i.test(ancestor.name)) belongsToSatelliteCommunication = true;
      ancestor = ancestor.parent;
    }
    if (excludeSolarStructures && belongsToSolarStructure) return;
    if (excludeSatelliteCommunication && belongsToSatelliteCommunication) return;
    if (excludeRoverStructures) {
      let roverAncestor: THREE.Object3D | null = object;
      while (roverAncestor && roverAncestor !== root) {
        if (/rover/i.test(roverAncestor.name)) return;
        roverAncestor = roverAncestor.parent;
      }
    }
    ancestor = object;
    let authoredColliderAncestor = false;
    while (ancestor && ancestor !== root && ancestor.name !== "Drone_Zone") {
      if (/^Collider_(?:[1-9]|1[0-8])$/i.test(ancestor.name)) authoredColliderAncestor = true;
      ancestor = ancestor.parent;
    }
    if (ancestor?.name === "Drone_Zone") return;
    if (excludeRocks && authoredColliderAncestor) return;
    if (!mesh.isMesh || !mesh.geometry || skipped.test(mesh.name) || terrain.test(mesh.name)) return;
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    if (size.x < 0.12 || size.y < 0.12 || size.z < 0.12 || !Number.isFinite(size.length()) || size.length() > 160) return;
    box.expandByVector(new THREE.Vector3(0.63, 0.53, 0.63));
    colliders.push(box);
  });
  return colliders;
}

export interface NamedSceneColliderResult {
  colliders: THREE.Box3[];
  foundNames: string[];
  missingNames: string[];
  invalidNames: string[];
}

/** Build exact world-space bounds from authored collider objects, without creating substitute geometry. */
export function buildNamedSceneColliders(root: THREE.Object3D, names: readonly string[]): NamedSceneColliderResult {
  root.updateWorldMatrix(true, true);
  const objects = new Map<string, THREE.Object3D>();
  root.traverse(object => { if (names.includes(object.name)) objects.set(object.name, object); });
  const result: NamedSceneColliderResult = { colliders: [], foundNames: [], missingNames: [], invalidNames: [] };
  for (const name of names) {
    const object = objects.get(name);
    if (!object) { result.missingNames.push(name); continue; }
    result.foundNames.push(name);
    object.visible = false;
    const bounds = new THREE.Box3().setFromObject(object, true);
    const size = bounds.getSize(new THREE.Vector3());
    if (bounds.isEmpty() || ![size.x, size.y, size.z].every(Number.isFinite) || size.lengthSq() <= 1e-8) {
      result.invalidNames.push(name);
      continue;
    }
    result.colliders.push(bounds);
  }
  return result;
}

/** Swept drone-point test so a fast/boosted frame cannot step through a building AABB. */
export function segmentHitsAnyBox(from: THREE.Vector3, to: THREE.Vector3, colliders: readonly THREE.Box3[]): boolean {
  const delta = to.clone().sub(from);
  const length = delta.length();
  if (length <= 1e-8) return colliders.some(box => box.containsPoint(to));
  const direction = delta.multiplyScalar(1 / length);
  const ray = new THREE.Ray(from, direction);
  const hitPoint = new THREE.Vector3();
  for (const source of colliders) {
    const fromInside = source.containsPoint(from);
    const toInside = source.containsPoint(to);
    if (toInside && !fromInside) return true;
    if (fromInside && toInside) {
      const depthFrom = Math.min(from.x - source.min.x, source.max.x - from.x, from.y - source.min.y, source.max.y - from.y, from.z - source.min.z, source.max.z - from.z);
      const depthTo = Math.min(to.x - source.min.x, source.max.x - to.x, to.y - source.min.y, source.max.y - to.y, to.z - source.min.z, source.max.z - to.z);
      if (depthTo > depthFrom + 1e-4) return true;
      continue;
    }
    if (fromInside) continue;
    const hit = ray.intersectBox(source, hitPoint);
    if (hit && hit.distanceTo(from) <= length) return true;
  }
  return false;
}

export function removeSpawnOverlaps(
  colliders: THREE.Box3[],
  spawn: THREE.Vector3,
  eyeHeight = 1.65
): THREE.Box3[] {
  const bodyMinY = spawn.y - eyeHeight;
  return colliders.filter(box => {
    const overlapsHorizontal =
      spawn.x >= box.min.x && spawn.x <= box.max.x && spawn.z >= box.min.z && spawn.z <= box.max.z;
    const overlapsVertical = box.max.y >= bodyMinY && box.min.y <= spawn.y;
    return !(overlapsHorizontal && overlapsVertical);
  });
}

/**
 * Builds segmented, robust wall collision for Central Hub Collision Section 1
 * (outer perimeter wall) and Collision Section 2 (inner central pillar).
 * Ensures walls are impassable while leaving module entrance doorways open.
 */
/**
 * Builds colliders for Central Hub module.
 * Targets authored Collider_Section01 (and Collider_Section02) using standard custom collider sections,
 * setting visibility to false and generating bounding collision hulls around the geometry.
 */
export function buildCentralHubColliders(root: THREE.Object3D): THREE.Box3[] {
  root.updateWorldMatrix(true, true);

  const candidateNames = ["Collider_Section01", "Collider_Section"];
  const presentNames: string[] = [];

  root.traverse(child => {
    if (candidateNames.some(c => new RegExp(`^${c}$`, "i").test(child.name))) {
      child.visible = false;
      if (!presentNames.includes(child.name)) {
        presentNames.push(child.name);
      }
    }
  });

  return buildCustomColliderSections(root, presentNames.length > 0 ? presentNames : ["Collider_Section01"]);
}

export interface OrientedBoxCollider {
  sourceName: string;
  center: THREE.Vector3;
  halfExtents: THREE.Vector3;
  orientation: THREE.Quaternion;
  bounds: THREE.Box3;
}

/**
 * Reads any explicitly authored Central Hub primitive collider meshes outside the
 * complex section meshes. The current GLB has no root-level primitive proxy nodes;
 * if such nodes are added later, their authored rotations are retained.
 */
export function buildCentralHubOrientedColliders(root: THREE.Object3D): OrientedBoxCollider[] {
  root.updateWorldMatrix(true, true);
  const colliders: OrientedBoxCollider[] = [];
  root.traverse(object => {
    if (!/collider/i.test(object.name) || /^Collider_Section/i.test(object.name)) return;
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
    mesh.visible = false;
    mesh.geometry.computeBoundingBox();
    const localBounds = mesh.geometry.boundingBox;
    if (!localBounds || localBounds.isEmpty()) return;

    const localCenter = localBounds.getCenter(new THREE.Vector3());
    const localSize = localBounds.getSize(new THREE.Vector3());
    const worldScale = mesh.getWorldScale(new THREE.Vector3());
    const center = localCenter.applyMatrix4(mesh.matrixWorld);
    const halfExtents = localSize.multiply(worldScale).multiplyScalar(0.5);
    halfExtents.set(Math.abs(halfExtents.x), Math.abs(halfExtents.y), Math.abs(halfExtents.z));
    const orientation = mesh.getWorldQuaternion(new THREE.Quaternion());
    const bounds = new THREE.Box3();
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      bounds.expandByPoint(new THREE.Vector3(x * halfExtents.x, y * halfExtents.y, z * halfExtents.z).applyQuaternion(orientation).add(center));
    }
    colliders.push({ sourceName: mesh.name, center, halfExtents, orientation, bounds });
  });
  return colliders;
}

export function orientedBoxContainsPoint(point: THREE.Vector3, collider: OrientedBoxCollider): boolean {
  const local = point.clone().sub(collider.center).applyQuaternion(collider.orientation.clone().invert());
  return Math.abs(local.x) <= collider.halfExtents.x && Math.abs(local.y) <= collider.halfExtents.y && Math.abs(local.z) <= collider.halfExtents.z;
}

export interface VerticalCylinderCollider {
  sourceName: string;
  center: THREE.Vector3;
  radiusX: number;
  radiusZ: number;
  minY: number;
  maxY: number;
}

/** Retains the authored circular footprint of Central Hub Collider_Section02. */
export function buildCentralHubCylinderColliders(root: THREE.Object3D): VerticalCylinderCollider[] {
  root.updateWorldMatrix(true, true);
  const mesh = root.getObjectByName("Collider_Section02") as THREE.Mesh | undefined;
  if (!mesh?.isMesh || !mesh.geometry?.attributes.position) return [];
  mesh.visible = false;
  mesh.geometry.computeBoundingBox();
  const localBounds = mesh.geometry.boundingBox;
  if (!localBounds || localBounds.isEmpty()) return [];
  const worldBounds = new THREE.Box3().setFromObject(mesh);
  const localCenter = localBounds.getCenter(new THREE.Vector3());
  const center = localCenter.applyMatrix4(mesh.matrixWorld);
  const scale = mesh.getWorldScale(new THREE.Vector3());
  const localSize = localBounds.getSize(new THREE.Vector3());
  const radiusX = localSize.x * Math.abs(scale.x) / 2;
  const radiusZ = localSize.z * Math.abs(scale.z) / 2;
  if (!(radiusX > 0) || !(radiusZ > 0) || worldBounds.isEmpty()) return [];
  return [{ sourceName: mesh.name, center, radiusX, radiusZ, minY: worldBounds.min.y, maxY: worldBounds.min.y + 2.1 }];
}

export function verticalCylinderContainsPoint(point: THREE.Vector3, collider: VerticalCylinderCollider): boolean {
  if (point.y < collider.minY || point.y > collider.maxY) return false;
  const x = (point.x - collider.center.x) / collider.radiusX;
  const z = (point.z - collider.center.z) / collider.radiusZ;
  return x * x + z * z <= 1;
}

/**
 * Builds colliders for Science / Research Lab module.
 * Loads authored colliders while safely clearing the entrance spawn area.
 */
export function buildScienceLabColliders(root: THREE.Object3D): THREE.Box3[] {
  root.updateWorldMatrix(true, true);

  // If Collider_Section01 exists in Science_Zone, use the standard indoor custom collider builder and ensure it is hidden
  const section01 = root.getObjectByName("Collider_Section01") as THREE.Mesh | undefined;
  if (section01 && section01.isMesh) {
    section01.visible = false;
    return buildCustomColliderSections(root, ["Collider_Section01"]);
  }

  const colliders: THREE.Box3[] = [];

  root.traverse(child => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const name = mesh.name;

    // Use authored Collider objects in Science_Zone
    if (/^Collider(\.\d+)?$/i.test(name)) {
      // Collider.010 and Collider.011 span z=12.6 to 17.6 across entrance corridor
      // Skip them so player can enter and exit freely
      if (/Collider\.010|Collider\.011/i.test(name)) {
        mesh.visible = false;
        return;
      }

      const box = new THREE.Box3().setFromObject(mesh);
      box.min.y = Math.min(box.min.y, -0.5);
      box.max.y = Math.max(box.max.y, 2.5);
      mesh.visible = false;
      colliders.push(box);
    }
  });

  return colliders;
}

export function buildCustomColliderSections(root: THREE.Object3D, names: readonly string[]): THREE.Box3[] {
  const meshes: THREE.Mesh[] = [];

  for (const name of names) {
    const obj = root.getObjectByName(name);
    if (obj) {
      obj.visible = false;
      if ((obj as THREE.Mesh).isMesh && (obj as THREE.Mesh).geometry?.attributes.position) {
        meshes.push(obj as THREE.Mesh);
      }
      obj.traverse(child => {
        if (/collider/i.test(child.name)) {
          child.visible = false;
        }
        if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).geometry?.attributes.position) {
          meshes.push(child as THREE.Mesh);
        }
      });
    }
  }

  // Case-insensitive / prefix fallback if names were not matched directly
  if (meshes.length === 0) {
    root.traverse(child => {
      if (names.some(n => new RegExp(`^${n}$`, "i").test(child.name))) {
        child.visible = false;
        if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).geometry?.attributes.position) {
          meshes.push(child as THREE.Mesh);
        }
        child.traverse(sub => {
          if (/collider/i.test(sub.name)) {
            sub.visible = false;
          }
          if ((sub as THREE.Mesh).isMesh && (sub as THREE.Mesh).geometry?.attributes.position) {
            meshes.push(sub as THREE.Mesh);
          }
        });
      }
    });
  }

  const uniqueMeshes = [...new Set(meshes)];
  if (uniqueMeshes.length === 0) return [];

  root.updateWorldMatrix(true, true);
  return uniqueMeshes.flatMap(mesh => {
    mesh.visible = false;
    const position = mesh.geometry.attributes.position;
    const index = mesh.geometry.index;
    const triangles: THREE.Vector3[][] = [];
    const vertex = (item: number) =>
      new THREE.Vector3().fromBufferAttribute(position, item).applyMatrix4(mesh.matrixWorld);
    for (let i = 0; i < (index?.count ?? position.count); i += 3) {
      triangles.push([
        vertex(index ? index.getX(i) : i),
        vertex(index ? index.getX(i + 1) : i + 1),
        vertex(index ? index.getX(i + 2) : i + 2)
      ]);
    }

    const parent = triangles.map((_, item) => item);
    const find = (item: number): number => (parent[item] === item ? item : (parent[item] = find(parent[item])));
    const join = (left: number, right: number) => {
      left = find(left);
      right = find(right);
      if (left !== right) parent[left] = right;
    };
    const vertices = new Map<string, number[]>();
    const key = (point: THREE.Vector3) =>
      `${Math.round(point.x * 10000)},${Math.round(point.y * 10000)},${Math.round(point.z * 10000)}`;
    triangles.forEach((triangle, triangleIndex) =>
      triangle.forEach(point => {
        const matches = vertices.get(key(point)) ?? [];
        matches.forEach(match => join(triangleIndex, match));
        matches.push(triangleIndex);
        vertices.set(key(point), matches);
      })
    );
    const groups = new Map<number, THREE.Vector3[][]>();
    triangles.forEach((triangle, indexValue) => {
      const group = find(indexValue);
      groups.set(group, [...(groups.get(group) ?? []), triangle]);
    });

    const playerBlockingHeight = 2.1;
    const colliders = [...groups.values()]
      .map(group => {
        const bounds = new THREE.Box3();
        group.flat().forEach(point => bounds.expandByPoint(point));
        bounds.max.y = Math.max(bounds.max.y, bounds.min.y + playerBlockingHeight);
        return bounds;
      })
      .filter(bounds => !bounds.isEmpty());
    mesh.visible = false;
    return colliders;
  });
}

/**
 * Keeps the authored Drone Section wall colliders while clearing the passage
 * between its existing entrance marker and the existing drone object.
 */
export function buildDroneSectionColliders(root: THREE.Object3D): THREE.Box3[] {
  const colliders = buildCustomColliderSections(root, ["Collider_Section02"]);
  const entrance = root.getObjectByName("DroneZone_Entrance_Trigger");
  const drone = root.getObjectByName("Drone");
  if (!entrance || !drone || colliders.length === 0) return colliders;

  root.updateWorldMatrix(true, true);
  const start = entrance.getWorldPosition(new THREE.Vector3());
  const end = drone.getWorldPosition(new THREE.Vector3());
  const clearance = 0.9;
  const minX = Math.min(start.x, end.x) - clearance;
  const maxX = Math.max(start.x, end.x) + clearance;
  const minZ = Math.min(start.z, end.z) - clearance;
  const maxZ = Math.max(start.z, end.z) + clearance;

  return colliders.filter(box =>
    box.max.x < minX || box.min.x > maxX || box.max.z < minZ || box.min.z > maxZ
  );
}

/** Returns the world-space top of a horizontal walkable surface. */
export function getSurfaceHeight(surface: THREE.Object3D): number | undefined {
  surface.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(surface);
  return bounds.isEmpty() ? undefined : bounds.max.y;
}

export function buildHabitatColliderSection(root: THREE.Object3D): THREE.Box3[] {
  // Collect all Collider_Section variations (Mesh, Group, or Collider_Section_01)
  const candidateNames = ["Collider_Section", "Collider_Section_01", "Collider_Section01"];
  const presentNames = candidateNames.filter(n => root.getObjectByName(n) !== undefined);
  return buildCustomColliderSections(root, presentNames.length > 0 ? presentNames : ["Collider_Section"]);
}

export interface PlanarUVOptions {
  flipU?: boolean;
  flipV?: boolean;
  swapUV?: boolean;
  rotation?: 0 | 90 | 180 | 270;
  uAxis?: "x" | "y" | "z";
  vAxis?: "x" | "y" | "z";
}

/**
 * Re-projects planar UV coordinates across a screen geometry so that CanvasTextures
 * map smoothly from (0,0) to (1,1) across the screen surface, correcting degenerate,
 * collapsed, or atlas UVs.
 */
export function reprojectPlanarUVs(
  geometry: THREE.BufferGeometry,
  options?: PlanarUVOptions
): { uAxis: "x" | "y" | "z"; vAxis: "x" | "y" | "z"; width: number; height: number } {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox || new THREE.Box3();
  const size = box.getSize(new THREE.Vector3());
  const min = box.min;

  const dims: { axis: "x" | "y" | "z"; size: number }[] = [
    { axis: "x" as const, size: Math.max(size.x, 0.001) },
    { axis: "y" as const, size: Math.max(size.y, 0.001) },
    { axis: "z" as const, size: Math.max(size.z, 0.001) }
  ].sort((a, b) => b.size - a.size);

  const uAxis = options?.uAxis || dims[0].axis;
  const vAxis = options?.vAxis || dims[1].axis;

  const uSize = Math.max(size[uAxis], 0.001);
  const vSize = Math.max(size[vAxis], 0.001);

  const posAttr = geometry.attributes.position;
  const uvs = new Float32Array(posAttr.count * 2);

  const uComp = uAxis === "x" ? 0 : uAxis === "y" ? 1 : 2;
  const vComp = vAxis === "x" ? 0 : vAxis === "y" ? 1 : 2;

  for (let i = 0; i < posAttr.count; i++) {
    let uVal = (posAttr.getComponent(i, uComp) - min[uAxis]) / uSize;
    let vVal = (posAttr.getComponent(i, vComp) - min[vAxis]) / vSize;

    if (options?.swapUV) {
      const tmp = uVal;
      uVal = vVal;
      vVal = tmp;
    }

    if (options?.rotation === 90) {
      const nextU = vVal;
      const nextV = 1 - uVal;
      uVal = nextU;
      vVal = nextV;
    } else if (options?.rotation === 180) {
      uVal = 1 - uVal;
      vVal = 1 - vVal;
    } else if (options?.rotation === 270) {
      const nextU = 1 - vVal;
      const nextV = uVal;
      uVal = nextU;
      vVal = nextV;
    }

    if (options?.flipU) {
      uVal = 1 - uVal;
    }
    if (options?.flipV) {
      vVal = 1 - vVal;
    }

    uvs[i * 2] = THREE.MathUtils.clamp(uVal, 0, 1);
    uvs[i * 2 + 1] = THREE.MathUtils.clamp(vVal, 0, 1);
  }

  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.attributes.uv.needsUpdate = true;

  return { uAxis, vAxis, width: uSize, height: vSize };
}
