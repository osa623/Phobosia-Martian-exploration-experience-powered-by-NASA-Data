import * as THREE from "three";

/** Mapping is defined by the catalogue's stable 01/02/03 targetNumber, not guessed coordinates. */
export const SOL5_SCENE_TARGETS: Record<string, string> = {
  TARGET_ALPHA_CRATER_RIM: "target_01",
  TARGET_BETA_DUNE_BASIN: "target_02",
  TARGET_GAMMA_SOUTH_ESCARPMENT: "target_03"
};

export interface Sol5EvidenceAsset { id: string; targetId: string; fileName: string; assetPath: string }

/** Existing mission-provided files. These are evidence previews, not images captured by the simulated drone. */
export const SOL5_EVIDENCE_ASSETS: Record<string, readonly Sol5EvidenceAsset[]> = {
  TARGET_ALPHA_CRATER_RIM: [
    { id: "SOL5_ALPHA_BW", targetId: "TARGET_ALPHA_CRATER_RIM", fileName: "bandw.png", assetPath: "/assets/images/Selected_Missions/target_01/bandw.png" },
    { id: "SOL5_ALPHA_COLOR", targetId: "TARGET_ALPHA_CRATER_RIM", fileName: "wide_aerial_top_down_satellite_style_image_of_a.png", assetPath: "/assets/images/Selected_Missions/target_01/wide_aerial_top_down_satellite_style_image_of_a.png" },
    { id: "SOL5_ALPHA_THERMAL", targetId: "TARGET_ALPHA_CRATER_RIM", fileName: "a_wide_top_down_high_resolution_false_color_ther.png", assetPath: "/assets/images/Selected_Missions/target_01/a_wide_top_down_high_resolution_false_color_ther.png" }
  ],
  TARGET_BETA_DUNE_BASIN: [
    { id: "SOL5_BETA_BW", targetId: "TARGET_BETA_DUNE_BASIN", fileName: "bandw.png", assetPath: "/assets/images/Selected_Missions/target_02/bandw.png" },
    { id: "SOL5_BETA_COLOR", targetId: "TARGET_BETA_DUNE_BASIN", fileName: "Cratered Martian Rust Plain-1.png", assetPath: "/assets/images/Selected_Missions/target_02/Cratered%20Martian%20Rust%20Plain-1.png" },
    { id: "SOL5_BETA_THERMAL", targetId: "TARGET_BETA_DUNE_BASIN", fileName: "a_wide_top_down_abstract_false_color_thermal_hea.png", assetPath: "/assets/images/Selected_Missions/target_02/a_wide_top_down_abstract_false_color_thermal_hea.png" }
  ],
  TARGET_GAMMA_SOUTH_ESCARPMENT: [
    { id: "SOL5_GAMMA_BW", targetId: "TARGET_GAMMA_SOUTH_ESCARPMENT", fileName: "bandw.png", assetPath: "/assets/images/Selected_Missions/target_03/bandw.png" },
    { id: "SOL5_GAMMA_COLOR", targetId: "TARGET_GAMMA_SOUTH_ESCARPMENT", fileName: "Cratered Rust Plains of Elysium-2.png", assetPath: "/assets/images/Selected_Missions/target_03/Cratered%20Rust%20Plains%20of%20Elysium-2.png" },
    { id: "SOL5_GAMMA_THERMAL", targetId: "TARGET_GAMMA_SOUTH_ESCARPMENT", fileName: "a_wide_high_resolution_false_color_thermal_infrar.png", assetPath: "/assets/images/Selected_Missions/target_03/a_wide_high_resolution_false_color_thermal_infrar.png" }
  ]
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
