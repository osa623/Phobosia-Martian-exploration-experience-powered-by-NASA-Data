import * as THREE from "three";

export type ModuleLightReport = { count: number; names: string[] };

/** Creates exactly one inexpensive, module-owned runtime light per exported fixture marker. */
export function createModuleLights(moduleRoot: THREE.Object3D, owner: THREE.Group): ModuleLightReport {
  const names: string[] = [];
  moduleRoot.updateWorldMatrix(true, true);
  owner.updateWorldMatrix(true, false);
  moduleRoot.traverse(object => {
    if (object === owner || object.parent === owner || !/light/i.test(object.name)) return;
    const bounds = new THREE.Box3().setFromObject(object);
    if (bounds.isEmpty()) return;
    const size = bounds.getSize(new THREE.Vector3());
    const fixturePosition = bounds.getCenter(new THREE.Vector3());
    // Fixture mesh vertices often carry the authored placement while their node
    // origin stays at the module root, so use the measured world-space center.
    const localPosition = owner.worldToLocal(fixturePosition);
    const isTopFixture = fixturePosition.y >= 2.2;
    // The authored ceiling fixtures sit several scene units above the player.
    // Give those fixtures the range/power needed to reach the room; lower
    // indicator fixtures remain deliberately softer to avoid washed-out walls.
    const distance = isTopFixture
      ? THREE.MathUtils.clamp(Math.max(size.x, size.z) * 1.6 + 5, 9, 14)
      : THREE.MathUtils.clamp(Math.max(size.x, size.z) * 1.25 + 3, 5, 8);
    const intensity = isTopFixture ? 7 : 2.5;
    const light = new THREE.PointLight(0xe8f2ff, intensity, distance, 1.5);
    light.name = `RuntimeLight:${object.name}`;
    light.position.copy(localPosition);
    light.castShadow = false;
    owner.add(light);
    names.push(object.name);
  });
  return { count: names.length, names };
}
