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
export function buildCentralHubColliders(root: THREE.Object3D): THREE.Box3[] {
  root.updateWorldMatrix(true, true);
  const colliders: THREE.Box3[] = [];

  // Doorway locations in Central Hub (radius ~5.2 - 5.4m)
  const doorwayClearances: { x: number; z: number; radius: number }[] = [
    { x: 2.27, z: -4.79, radius: 1.5 }, // Engineering
    { x: -1.30, z: -5.12, radius: 1.5 }, // Habitat
    { x: -4.87, z: 1.69, radius: 1.5 }, // Airlock (Main)
    { x: 5.09, z: 1.56, radius: 1.5 }, // Mission Control
    { x: 4.93, z: -2.25, radius: 1.5 } // Science Lab
  ];

  const sectionNames = ["Collider_Section01", "Collider_Section02"];

  for (const name of sectionNames) {
    const mesh = root.getObjectByName(name) as THREE.Mesh | undefined;
    if (!mesh || !mesh.geometry) continue;

    mesh.visible = false;
    const pos = mesh.geometry.attributes.position;
    const ind = mesh.geometry.index;
    if (!pos) continue;

    const verts: THREE.Vector3[] = [];
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      verts.push(v);
    }

    const step = ind ? 6 : 6;
    const maxIdx = ind ? ind.count : pos.count;

    for (let i = 0; i < maxIdx; i += step) {
      const box = new THREE.Box3();
      for (let j = 0; j < 6 && i + j < maxIdx; j++) {
        const vIdx = ind ? ind.getX(i + j) : i + j;
        if (vIdx < verts.length) {
          box.expandByPoint(verts[vIdx]);
        }
      }

      if (box.isEmpty()) continue;

      // Expand thickness slightly to prevent diagonal clipping
      box.expandByVector(new THREE.Vector3(0.08, 0, 0.08));
      box.min.y = Math.min(box.min.y, -0.6);
      box.max.y = Math.max(box.max.y, 2.8);

      // If outer wall, check if this segment intersects an open doorway
      if (name === "Collider_Section01") {
        const center = box.getCenter(new THREE.Vector3());
        const isDoor = doorwayClearances.some(
          d => Math.hypot(center.x - d.x, center.z - d.z) < d.radius
        );
        if (isDoor) continue; // Keep doorway corridor clear
      }

      colliders.push(box);
    }
  }

  return colliders;
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
