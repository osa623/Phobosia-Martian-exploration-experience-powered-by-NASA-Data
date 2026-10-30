import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
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
      intensity: 28,
      distance: 14,
      angle: Math.PI / 2.0, // Broad cone across the circular chamber
      penumbra: 0.35,
      color: 0xfff4eb,
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
  Drone: [],
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

  // Habitat-specific: Convert Light_06 and Light_07 into Three.js Area Lighting
  if (module === "Habitat") {
    configureHabitatAreaLights(moduleRoot, additions);
  }

  // Central Hub-specific: Configure doorway portal lights and ceiling fixtures
  if (module === "Hub") {
    configureHubLights(moduleRoot, additions);
  }
}

export interface HabitatAreaLightOptions {
  intensity?: number;
  color?: number;
  fillIntensity?: number;
}

export const HABITAT_AREA_LIGHT_CONFIG: HabitatAreaLightOptions = {
  intensity: 5.5,
  color: 0xffffff,
  fillIntensity: 2.2
};

let rectAreaLightUniformsInitialized = false;

/**
 * Initializes RectAreaLightUniformsLib once for WebGLRenderer.
 */
export function initRectAreaLightUniforms(): void {
  if (rectAreaLightUniformsInitialized) return;
  try {
    RectAreaLightUniformsLib.init();
    rectAreaLightUniformsInitialized = true;
  } catch {
    // In headless Node test environments without WebGL
  }
}

/**
 * Configures Three.js Area Lighting for Habitat ceiling panels Light_06 and Light_07.
 * Preserves the original plane meshes and creates corresponding THREE.RectAreaLight instances
 * oriented according to the plane's world-space normal, supplemented by soft downward fill
 * to ensure balanced illumination across nearby cabinets, counters, and floor surfaces.
 */
export function configureHabitatAreaLights(
  moduleRoot: THREE.Object3D,
  owner: THREE.Group,
  config: HabitatAreaLightOptions = HABITAT_AREA_LIGHT_CONFIG
): string[] {
  initRectAreaLightUniforms();

  const configuredLights: string[] = [];
  moduleRoot.updateWorldMatrix(true, true);
  owner.updateWorldMatrix(true, false);

  moduleRoot.traverse(object => {
    if (object === owner || object.parent === owner) return;

    // Target Light_06 and Light_07 (authored as Light06 and Light07 in Habitat GLB)
    if (!/^(Light_?0[67])$/i.test(object.name)) return;

    // Prevent duplicate light creation if re-run on same owner
    const areaLightName = `AreaLight:${object.name}`;
    if (owner.getObjectByName(areaLightName)) return;

    // Derive world dimensions and position from plane mesh
    const bounds = new THREE.Box3().setFromObject(object);
    if (bounds.isEmpty()) return;

    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());

    // In world coordinates, determine the two planar dimensions of the light rectangle
    const dims = [size.x, size.y, size.z].sort((a, b) => b - a);
    const width = Math.max(dims[0], 0.5);
    const height = Math.max(dims[1], 0.5);

    // Ceiling plane normal pointing downward into the room (-Y)
    const normalDown = new THREE.Vector3(0, -1, 0);

    // Position light slightly below ceiling mesh to prevent self-shadowing/co-planar clipping
    const worldLightPos = center.clone().addScaledVector(normalDown, 0.02);
    const localPos = owner.worldToLocal(worldLightPos);

    // Extract color from mesh material if available, otherwise use config
    let lightColor = config.color ?? 0xffffff;
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.material) {
      const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
      if (mat.emissive && mat.emissive.getHex() > 0) {
        lightColor = mat.emissive.getHex();
      }
    }

    // 1. Create THREE.RectAreaLight
    const rectLight = new THREE.RectAreaLight(
      lightColor,
      config.intensity ?? 5.5,
      width,
      height
    );
    rectLight.name = areaLightName;
    rectLight.position.copy(localPos);

    // Orient RectAreaLight (+Z emission) along the downward normal into the room
    rectLight.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normalDown);
    owner.add(rectLight);

    // 2. Add companion downward soft fill to ensure visible, balanced illumination
    // on nearby Habitat cabinets, counters, and surrounding surfaces across all materials
    const fillLight = new THREE.PointLight(
      lightColor,
      config.fillIntensity ?? 2.2,
      Math.max(width, height) * 2.5 + 4,
      1.8
    );
    fillLight.name = `AreaFill:${object.name}`;
    fillLight.position.copy(localPos);
    fillLight.castShadow = false; // Never cast shadows to preserve performance budget
    owner.add(fillLight);

    configuredLights.push(object.name);
  });

  return configuredLights;
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

    // In Habitat module, Light_06 and Light_07 are converted to dedicated RectAreaLight setup
    if (module === "Habitat" && /^(Light_?0[67])$/i.test(object.name)) {
      return;
    }

    // In Hub module, Light_01 through Light_14 are handled by configureHubLights
    if (module === "Hub" && /^Light_?\d+$/i.test(object.name)) {
      return;
    }

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
    const intensity = module === "Drone" ? 1.2 : isTopFixture ? 3.5 : 1.8;
    const light = new THREE.PointLight(module === "Drone" ? 0xc9e9f2 : 0xe8f2ff, intensity, distance, 1.8);
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
      mesh.visible = false;
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

  if (module === "Hub") {
    return {
      skyColor: 0x58728a,
      groundColor: 0x222e3a,
      intensity: 0.65
    };
  }

  // Indoor modules: cool sci-fi base ambient fill with grounded dark contrast
  return {
    skyColor: 0x405568,
    groundColor: 0x182028,
    intensity: 0.45
  };
}

export interface HubLightsReport {
  emissiveMeshes: string[];
  portalLights: string[];
  walkwayMarkers: string[];
  allDiscovered: string[];
  lightsCreated: string[];
}

/**
 * Discovers and classifies all Light_XX objects in the Central Hub scene:
 * - Light_01, Light_02: Ceiling dome and inner ring emissive luminaire meshes
 * - Light_03 to Light_08: Perimeter portal/doorway markers (Airlock, Habitat, Engineering, Science, MC, Connector)
 * - Light_09 to Light_14: Inner circular walkway perimeter markers
 */
export function discoverHubLights(moduleRoot: THREE.Object3D): HubLightsReport {
  const emissiveMeshes: string[] = [];
  const portalLights: string[] = [];
  const walkwayMarkers: string[] = [];
  const allDiscovered: string[] = [];

  moduleRoot.traverse((object) => {
    const match = object.name.match(/^Light_?(\d+)$/i);
    if (!match) return;
    const num = parseInt(match[1], 10);
    allDiscovered.push(object.name);

    if (num === 1 || num === 2) {
      emissiveMeshes.push(object.name);
    } else if (num >= 3 && num <= 8) {
      portalLights.push(object.name);
    } else if (num >= 9 && num <= 14) {
      walkwayMarkers.push(object.name);
    }
  });

  return { emissiveMeshes, portalLights, walkwayMarkers, allDiscovered, lightsCreated: [] };
}

/**
 * Configures Central Hub runtime lighting:
 * - Keeps Light_01 & Light_02 emissive ceiling meshes unshadowed
 * - Adds a shadow-casting light under EVERY object named Light_03 to Light_14 (all 12 objects)
 * - Sets high intensity (8.5) and shadow maps so shadows appear cleanly on floors, walls, and consoles
 * - Prevents duplicate light creation on module reload
 */
export function configureHubLights(
  moduleRoot: THREE.Object3D,
  owner?: THREE.Group
): HubLightsReport {
  moduleRoot.updateWorldMatrix(true, true);
  if (owner) {
    owner.updateWorldMatrix(true, false);
  }

  const report = discoverHubLights(moduleRoot);
  const lightsCreated: string[] = [];

  moduleRoot.traverse((object) => {
    const match = object.name.match(/^Light_?(\d+)$/i);
    if (!match) return;
    const num = parseInt(match[1], 10);

    if (num === 1 || num === 2) {
      // Preserve emissive material on dome luminaire and inner ceiling ring
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    } else if (num >= 3 && num <= 14) {
      // Add a shadow-casting light object under EVERY object named Light_03 to Light_14
      const lightName = `HubLight:${object.name}`;

      let light = object.getObjectByName(lightName) as THREE.PointLight | undefined;
      if (!light) {
        light = new THREE.PointLight(0xfff2e0, 8.5, 14, 1.4);
        light.name = lightName;
        light.position.set(0, 0, 0);
        light.castShadow = true;
        light.shadow.mapSize.width = 512;
        light.shadow.mapSize.height = 512;
        light.shadow.bias = -0.0008;
        light.shadow.normalBias = 0.04;
        light.shadow.camera.near = 0.2;
        light.shadow.camera.far = 14;

        object.add(light);
      } else {
        light.intensity = 8.5;
        light.castShadow = true;
      }

      lightsCreated.push(object.name);
    }
  });

  report.lightsCreated = lightsCreated;
  return report;
}
