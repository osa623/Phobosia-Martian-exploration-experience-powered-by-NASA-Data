import * as THREE from "three";
import { ModuleName } from "./Discovery";

export type ModuleLightReport = { count: number; names: string[] };

export interface KeySpotlightDef {
  name: string;
  position: [number, number, number];
  target: [number, number, number];
  intensity: number;
  distance: number;
  angle: number;
  penumbra: number;
  color?: number;
  mapSize?: number;
  bias?: number;
  normalBias?: number;
}

/**
 * Key shadow-casting spotlights configured per module.
 * Designed to align with authored ceiling fixtures and illuminate workstations,
 * consoles, tables, and equipment while casting crisp contact shadows onto the floor.
 */
const MODULE_KEY_LIGHTS: Record<Exclude<ModuleName, "Terrain">, KeySpotlightDef[]> = {
  Habitat: [
    {
      name: "Hab_Workstation_Spot",
      position: [-0.64, 3.42, -2.11],
      target: [-0.64, 0.0, -2.11],
      intensity: 14,
      distance: 10,
      angle: Math.PI / 3.0,
      penumbra: 0.45,
      color: 0xeaf4ff,
      mapSize: 1024,
      bias: -0.0004,
      normalBias: 0.03
    },
    {
      name: "Hab_LivingQuarters_Spot",
      position: [2.55, 3.75, 0.0],
      target: [2.55, 0.0, 0.0],
      intensity: 12,
      distance: 10,
      angle: Math.PI / 3.2,
      penumbra: 0.5,
      color: 0xfff2e0,
      mapSize: 1024,
      bias: -0.0004,
      normalBias: 0.03
    },
    {
      name: "Hab_RestAlcove_Spot",
      position: [-1.91, 3.4, -3.34],
      target: [-1.91, 0.0, -3.34],
      intensity: 9,
      distance: 8,
      angle: Math.PI / 3.5,
      penumbra: 0.55,
      color: 0xffeedb,
      mapSize: 1024,
      bias: -0.0004,
      normalBias: 0.03
    }
  ],
  Hub: [
    {
      name: "Hub_CentralDome_Spot",
      position: [0.0, 2.45, 0.0],
      target: [0.0, 0.0, 0.0],
      intensity: 18,
      distance: 12,
      angle: Math.PI / 2.3, // Broad cone across the circular chamber
      penumbra: 0.35,
      color: 0xe6f3ff,
      mapSize: 1024,
      bias: -0.0004,
      normalBias: 0.03
    }
  ],
  MissionControl: [
    {
      name: "MC_CommandDeck_Spot",
      position: [0.0, 4.55, 0.0],
      target: [0.0, 0.0, 0.0],
      intensity: 16,
      distance: 14,
      angle: Math.PI / 3.0,
      penumbra: 0.45,
      color: 0xeaf3ff,
      mapSize: 1024,
      bias: -0.0004,
      normalBias: 0.03
    },
    {
      name: "MC_NavScreen_Spot",
      position: [7.5, 4.55, 0.0],
      target: [7.5, 0.0, 0.0],
      intensity: 14,
      distance: 14,
      angle: Math.PI / 3.2,
      penumbra: 0.5,
      color: 0xe8f4ff,
      mapSize: 1024,
      bias: -0.0004,
      normalBias: 0.03
    },
    {
      name: "MC_RearSystems_Spot",
      position: [-6.5, 4.55, 0.0],
      target: [-6.5, 0.0, 0.0],
      intensity: 14,
      distance: 14,
      angle: Math.PI / 3.2,
      penumbra: 0.5,
      color: 0xe8f4ff,
      mapSize: 1024,
      bias: -0.0004,
      normalBias: 0.03
    }
  ],
  Science: [
    {
      name: "Science_AnalysisBay_Spot",
      position: [-1.2, 3.85, 9.5],
      target: [-1.2, 0.0, 9.5],
      intensity: 15,
      distance: 12,
      angle: Math.PI / 3.0,
      penumbra: 0.45,
      color: 0xebf6ff,
      mapSize: 1024,
      bias: -0.0004,
      normalBias: 0.03
    },
    {
      name: "Science_SeedVault_Spot",
      position: [0.5, 3.85, 2.5],
      target: [0.5, 0.0, 2.5],
      intensity: 14,
      distance: 12,
      angle: Math.PI / 3.2,
      penumbra: 0.45,
      color: 0xeaf2ff,
      mapSize: 1024,
      bias: -0.0004,
      normalBias: 0.03
    },
    {
      name: "Science_Cultivation_Spot",
      position: [-0.8, 3.85, -9.0],
      target: [-0.8, 0.0, -9.0],
      intensity: 15,
      distance: 12,
      angle: Math.PI / 3.0,
      penumbra: 0.45,
      color: 0xe8ffe8,
      mapSize: 1024,
      bias: -0.0004,
      normalBias: 0.03
    }
  ],
  Engineering: [
    {
      name: "Eng_DiagnosticsTerminal_Spot",
      position: [-2.5, 3.8, -8.8],
      target: [-2.5, 0.0, -8.8],
      intensity: 15,
      distance: 12,
      angle: Math.PI / 2.8,
      penumbra: 0.45,
      color: 0xe8f4ff,
      mapSize: 1024,
      bias: -0.0004,
      normalBias: 0.03
    },
    {
      name: "Eng_MainAisle_Spot",
      position: [1.8, 4.0, -3.0],
      target: [1.8, 0.0, -3.0],
      intensity: 16,
      distance: 14,
      angle: Math.PI / 2.5,
      penumbra: 0.45,
      color: 0xeaf2ff,
      mapSize: 1024,
      bias: -0.0004,
      normalBias: 0.03
    },
    {
      name: "Eng_PowerReactor_Spot",
      position: [-1.5, 3.8, 4.0],
      target: [-1.5, 0.0, 4.0],
      intensity: 15,
      distance: 14,
      angle: Math.PI / 2.8,
      penumbra: 0.45,
      color: 0xffe8c2,
      mapSize: 1024,
      bias: -0.0004,
      normalBias: 0.03
    },
    {
      name: "Eng_WelcomeEntrance_Spot",
      position: [1.0, 3.85, -12.5],
      target: [1.0, 0.0, -12.5],
      intensity: 14,
      distance: 10,
      angle: Math.PI / 2.8,
      penumbra: 0.45,
      color: 0xeaf0ff,
      mapSize: 1024,
      bias: -0.0004,
      normalBias: 0.03
    }
  ],
  Airlock: [
    {
      name: "Airlock_OuterChamber_Spot",
      position: [2.05, 3.0, 0.0],
      target: [2.05, 0.0, 0.0],
      intensity: 14,
      distance: 10,
      angle: Math.PI / 3.0,
      penumbra: 0.45,
      color: 0xe8f4ff,
      mapSize: 1024,
      bias: -0.0004,
      normalBias: 0.03
    },
    {
      name: "Airlock_SuitStaging_Spot",
      position: [-3.5, 3.0, 0.0],
      target: [-3.5, 0.0, 0.0],
      intensity: 12,
      distance: 10,
      angle: Math.PI / 3.2,
      penumbra: 0.5,
      color: 0xfff0db,
      mapSize: 1024,
      bias: -0.0004,
      normalBias: 0.03
    }
  ]
};

/**
 * Configure complete lighting and shadow system for the active module.
 * Instantiates directional sunlight for Mars Terrain or primary spotlights + ambient fill for interiors.
 */
export function configureModuleLighting(
  moduleRoot: THREE.Object3D,
  additions: THREE.Group,
  module: ModuleName
): void {
  moduleRoot.updateWorldMatrix(true, true);
  additions.updateWorldMatrix(true, false);

  if (module === "Terrain") {
    // Mars Terrain: Directional Sun positioned to cast shadows across the entire base complex
    const outpostCenter = new THREE.Vector3(495.0, 0.0, -65.0);
    const sunOffset = new THREE.Vector3(160.0, 225.0, 110.0);
    const sunPos = outpostCenter.clone().add(sunOffset);

    const sun = new THREE.DirectionalLight(0xffe2c2, 2.6);
    sun.name = "MarsSun_DirectionalLight";
    sun.position.copy(sunPos);

    const targetObj = new THREE.Object3D();
    targetObj.name = "MarsSun_Target";
    targetObj.position.copy(outpostCenter);
    additions.add(targetObj);
    sun.target = targetObj;

    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 460;
    sun.shadow.camera.left = -115;
    sun.shadow.camera.right = 115;
    sun.shadow.camera.top = 115;
    sun.shadow.camera.bottom = -115;
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.02;

    additions.add(sun);
    return;
  }

  // Indoor Modules: Add key shadow-casting spotlights
  const keyDefs = MODULE_KEY_LIGHTS[module] ?? [];
  for (const def of keyDefs) {
    const spot = new THREE.SpotLight(
      def.color ?? 0xe8f4ff,
      def.intensity,
      def.distance,
      def.angle,
      def.penumbra,
      1.2
    );
    spot.name = def.name;
    spot.position.set(...def.position);

    const targetObj = new THREE.Object3D();
    targetObj.name = `${def.name}_Target`;
    targetObj.position.set(...def.target);
    additions.add(targetObj);
    spot.target = targetObj;

    spot.castShadow = true;
    spot.shadow.mapSize.width = def.mapSize ?? 1024;
    spot.shadow.mapSize.height = def.mapSize ?? 1024;
    spot.shadow.camera.near = 0.5;
    spot.shadow.camera.far = def.distance + 2;
    spot.shadow.bias = def.bias ?? -0.0004;
    spot.shadow.normalBias = def.normalBias ?? 0.03;

    additions.add(spot);
  }

  // Indoor Modules: Add secondary soft ambient fill lights from fixture markers
  // (strictly castShadow = false to preserve performance and avoid shadow acne)
  createModuleLights(moduleRoot, additions, module);
}

/**
 * Creates soft ambient runtime pointlights from fixture markers (non-shadow casting).
 */
export function createModuleLights(
  moduleRoot: THREE.Object3D,
  owner: THREE.Group,
  module?: ModuleName
): ModuleLightReport {
  const names: string[] = [];
  moduleRoot.updateWorldMatrix(true, true);
  owner.updateWorldMatrix(true, false);

  moduleRoot.traverse(object => {
    if (object === owner || object.parent === owner || !/light/i.test(object.name)) return;
    const bounds = new THREE.Box3().setFromObject(object);
    if (bounds.isEmpty()) return;
    const size = bounds.getSize(new THREE.Vector3());
    const fixturePosition = bounds.getCenter(new THREE.Vector3());

    const localPosition = owner.worldToLocal(fixturePosition);
    const isTopFixture = fixturePosition.y >= 2.2;

    // Soft ambient fill from secondary ceiling fixtures
    const distance = isTopFixture
      ? THREE.MathUtils.clamp(Math.max(size.x, size.z) * 1.5 + 4, 8, 12)
      : THREE.MathUtils.clamp(Math.max(size.x, size.z) * 1.1 + 2, 4, 7);

    // Balanced soft fill intensity
    const intensity = isTopFixture ? 3.5 : 1.8;
    const light = new THREE.PointLight(0xe8f2ff, intensity, distance, 1.8);
    light.name = `RuntimeLight:${object.name}`;
    light.position.copy(localPosition);
    light.castShadow = false; // Secondary fill lights never cast shadows
    owner.add(light);
    names.push(object.name);
  });

  return { count: names.length, names };
}

/**
 * Sets castShadow and receiveShadow on loaded meshes based on module type and geometry role.
 */
export function configureMeshShadows(moduleRoot: THREE.Object3D, module: ModuleName): void {
  moduleRoot.traverse(node => {
    if (!(node as THREE.Mesh).isMesh) return;
    const mesh = node as THREE.Mesh;

    // Never cast/receive shadows on invisible collision hulls
    if (/collider/i.test(mesh.name) || (mesh.parent && /collider/i.test(mesh.parent.name))) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      return;
    }

    // Interactive screen planes: receive subtle shadow, never cast unnatural box shadows
    const isScreenDisplay =
      /screen|display|monitor/i.test(mesh.name) ||
      (mesh.parent && /screen|display|monitor/i.test(mesh.parent.name));

    if (isScreenDisplay) {
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      return;
    }

    // Light fixture emissive strips/glow meshes: do not shadow themselves
    if (/light|strip|lamp|emission/i.test(mesh.name)) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      return;
    }

    if (module === "Terrain") {
      // The 2km ground terrain receives all shadows from base structures and rover
      if (mesh.name === "PHOBOSIA_MarsTerrain_2km") {
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        return;
      }

      // Exterior structures (Rovers, solar panels, satellite dish, connectors, pods, rocks)
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return;
    }

    // Indoor Modules (Habitat, Hub, Engineering, Science, MissionControl, Airlock)
    // High ceiling outer shells above lights: do not cast shadow downward
    if (mesh.name.toLowerCase().includes("ceiling") || mesh.name.toLowerCase().includes("roof")) {
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      return;
    }

    // All furniture, consoles, computers, chairs, instruments, racks, equipment, floors, walls
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

/**
 * Provides module-appropriate ambient hemisphere lighting configuration.
 */
export function getModuleHemisphereConfig(module: ModuleName): {
  skyColor: number;
  groundColor: number;
  intensity: number;
} {
  if (module === "Terrain") {
    // Mars outdoor: warm ochre/salmon sky with deep umber ground bounce
    return {
      skyColor: 0xd48858,
      groundColor: 0x3a2215,
      intensity: 0.75
    };
  }

  // Indoor modules: cool sci-fi base ambient fill with grounded dark contrast
  return {
    skyColor: 0x405568,
    groundColor: 0x182028,
    intensity: 0.45
  };
}
