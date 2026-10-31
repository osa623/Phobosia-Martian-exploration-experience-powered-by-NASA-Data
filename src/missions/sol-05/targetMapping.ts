import * as THREE from "three";

/** Mapping is defined by the catalogue's stable 01/02/03 targetNumber, not guessed coordinates. */
export const SOL5_SCENE_TARGETS: Record<string, string> = {
  TARGET_ALPHA_CRATER_RIM: "target_01",
  TARGET_BETA_DUNE_BASIN: "target_02",
  TARGET_GAMMA_SOUTH_ESCARPMENT: "target_03"
};

export function resolveSol5Target(scene: THREE.Object3D, targetId: string | null | undefined, registry: readonly { id: string; name: string }[]) {
  if (!targetId) return null;
  const definition = registry.find(target => target.id === targetId);
  const objectName = SOL5_SCENE_TARGETS[targetId];
  const object = objectName ? scene.getObjectByName(objectName) : null;
  if (!definition || !object) return null;
  scene.updateWorldMatrix(true, true);
  const position = object.getWorldPosition(new THREE.Vector3());
  return { definition, object, position };
}
