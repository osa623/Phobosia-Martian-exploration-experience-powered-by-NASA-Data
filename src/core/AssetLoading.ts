import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { assetPaths, type ModuleName } from "./Discovery";
import { DAYTIME_EXR_URL, NIGHTTIME_EXR_URL } from "./MasterTerrainEnvironment";
import { SOL5_EVIDENCE_ASSETS } from "../missions/sol-05/targetMapping";
import sol3 from "../jsons/Missions/sol-03.json";
import laptopManifest from "../systems/personal-laptop/assets.generated.json";

interface LaptopManifestFile {
  id: string;
  url: string;
  title: string;
}

const laptopAssets = laptopManifest as unknown as {
  songs: LaptopManifestFile[];
  images: LaptopManifestFile[];
  wallpapers: LaptopManifestFile[];
  documents: LaptopManifestFile[];
};

export type AssetKind = "gltf" | "exr" | "image" | "audio" | "video" | "document";
export type AssetCategory = "Branding" | "Habitat" | "Mission Control" | "Research Laboratory" | "Engineering Unit" | "Central Hub" | "Airlock" | "Mars Terrain" | "Drone Area" | "Gameplay Audio" | "Mission Imagery" | "Transition Video" | "Personal Laptop Media";
export type AssetStatus = "pending" | "downloading" | "processing" | "ready" | "failed";
export type AssetPhase = "idle" | "loading" | "processing" | "verifying" | "ready" | "error";

export interface AssetDefinition {
  id: string;
  path: string;
  name: string;
  category: AssetCategory;
  kind: AssetKind;
  required: boolean;
}

export interface AssetProgress extends AssetDefinition {
  status: AssetStatus;
  loadedBytes: number;
  totalBytes: number | null;
  error?: string;
}

export interface AssetLoadingSnapshot {
  phase: AssetPhase;
  currentAssetId: string | null;
  assets: AssetProgress[];
  completed: number;
  pending: number;
  total: number;
  failed: number;
  bytesLoaded: number;
  bytesExpected: number | null;
  percent: number;
  message: string;
}

const moduleCategories: Record<ModuleName, AssetCategory> = {
  Habitat: "Habitat",
  MissionControl: "Mission Control",
  Science: "Research Laboratory",
  Engineering: "Engineering Unit",
  Hub: "Central Hub",
  Airlock: "Airlock",
  Terrain: "Mars Terrain",
  Drone: "Drone Area"
};

function modelName(module: ModuleName): string {
  return module === "Hub" ? "Central Hub" : module === "Science" ? "Research Laboratory" : module === "Terrain" ? "Mars Terrain" : module === "Drone" ? "Drone Area" : module === "Airlock" ? "Airlock Environment" : module === "Engineering" ? "Engineering Unit" : module === "MissionControl" ? "Mission Control" : "Habitat Environment";
}

function asset(id: string, path: string, name: string, category: AssetCategory, kind: AssetKind, required = true): AssetDefinition {
  return { id, path, name, category, kind, required };
}

const moduleAssets = (Object.entries(assetPaths) as [ModuleName, string][]).map(([module, path]) =>
  asset(`model.${module}`, path, modelName(module), moduleCategories[module], "gltf")
);

const sol3Images = sol3.targetCatalogue.flatMap((target, targetIndex) =>
  Object.entries(target.images).map(([view, path]) => asset(
    `sol3.${target.targetId}.${view}`,
    path,
    `Sol 3 Site ${String(targetIndex + 1).padStart(2, "0")} ${view}`,
    "Mission Imagery",
    "image"
  ))
);

const sol5Images = Object.values(SOL5_EVIDENCE_ASSETS).flatMap(items => items.map(item =>
  asset(`sol5.${item.id}`, item.assetPath, `Sol 5 ${item.targetId.replace("TARGET_", "").replaceAll("_", " ")} ${item.fileName}`, "Mission Imagery", "image")
));

export const REQUIRED_ASSETS: readonly AssetDefinition[] = [
  asset("branding.loading-logo", "/assets/images/PHOBOSIA_Martian_Modern_Logo_4K.png", "PHOBOSIA Logo", "Branding", "image"),
  asset("branding.menu-logo", "/assets/images/PHOBOSIA_Metallic_Logo_4K.png", "Main Menu Logo", "Branding", "image"),
  asset("branding.menu-artwork", "/assets/images/mainMenuImage.png", "Main Menu Artwork", "Branding", "image"),
  asset("menu.mars-globe", "/assets/models/mars.glb", "Orbital Mars Display", "Branding", "gltf"),
  asset("environment.menu-night-sky", "/assets/exr/NightSkyHDRI008_4K_HDR_1.exr", "Menu Environment Map", "Branding", "exr"),
  asset("environment.day", DAYTIME_EXR_URL, "Daytime Environment Map", "Mars Terrain", "exr"),
  asset("environment.night", NIGHTTIME_EXR_URL, "Nighttime Environment Map", "Mars Terrain", "exr"),
  ...moduleAssets,
  asset("audio.menu-music", "/assets/sounds/PHOBOSIA.mp3", "PHOBOSIA Menu Music", "Gameplay Audio", "audio"),
  asset("audio.walk", "/assets/sounds/walkSound.MP3", "Indoor Walking Audio", "Gameplay Audio", "audio"),
  asset("audio.run", "/assets/sounds/runningSound.MP3", "Indoor Running Audio", "Gameplay Audio", "audio"),
  asset("audio.terrain-walk", "/assets/sounds/terrainWalkSound.MP3", "Terrain Walking Audio", "Gameplay Audio", "audio"),
  asset("audio.terrain-run", "/assets/sounds/terrainRunningSound.MP3", "Terrain Running Audio", "Gameplay Audio", "audio"),
  asset("audio.drone", "/assets/sounds/droneSound.MP3", "Drone Audio", "Gameplay Audio", "audio"),
  asset("audio.mars", "/assets/sounds/marsSound.MP3", "Mars Ambient Audio", "Gameplay Audio", "audio"),
  asset("audio.sol7-warning", "/assets/sounds/sol7Sounds/warningBeepTone.MP3", "Sol 7 Warning Tone", "Gameplay Audio", "audio"),
  asset("audio.sol7-storm", "/assets/sounds/sol7Sounds/sandStormSound.MP3", "Sol 7 Storm Audio", "Gameplay Audio", "audio"),
  ...sol3Images,
  ...sol5Images
];

const transitionVideos = [
  ["video.trailer", "/assets/videos/trailer_phobosia.mp4", "New Exploration Trailer"],
  ["video.habitat", "/assets/videos/Habitat_Entrance.mp4", "Habitat Transition"],
  ["video.airlock", "/assets/videos/AirLock.mp4", "Airlock Transition"],
  ["video.engineering", "/assets/videos/Engineering_Entrance.mp4", "Engineering Transition"],
  ["video.science", "/assets/videos/ReserachLab_Entrance.mp4", "Research Lab Transition"],
  ["video.mission-control", "/assets/videos/MissionControl_Entrance.mp4", "Mission Control Transition"]
] as const;

export const ON_DEMAND_ASSETS: readonly AssetDefinition[] = [
  ...transitionVideos.map(([id, path, name]) => asset(id, path, name, "Transition Video", "video", false)),
  ...laptopAssets.songs.map(item => asset(`laptop.${item.id}`, item.url, item.title, "Personal Laptop Media", "audio", false)),
  ...laptopAssets.images.map(item => asset(`laptop.${item.id}`, item.url, item.title, "Personal Laptop Media", "image", false)),
  ...laptopAssets.wallpapers.map(item => asset(`laptop.${item.id}`, item.url, item.title, "Personal Laptop Media", "image", false)),
  ...laptopAssets.documents.map(item => asset(`laptop.${item.id}`, item.url, item.title, "Personal Laptop Media", "document", false))
];

type PreparedResource = GLTF | THREE.DataTexture | string;
const prepared = new Map<string, PreparedResource>();
const blobUrls = new Map<string, string>();
const audioElements = new Map<string, HTMLAudioElement>();
const assetByPath = new Map<string, AssetDefinition>(REQUIRED_ASSETS.map(item => [item.path, item] as [string, AssetDefinition]));
for (const item of REQUIRED_ASSETS) assetByPath.set(encodeURI(item.path), item);
const listeners = new Set<(snapshot: AssetLoadingSnapshot) => void>();
let activeRun: Promise<void> | null = null;
let currentId: string | null = null;
let phase: AssetPhase = "idle";
let message = "Awaiting mission initialization";
let runtime = new Map<string, AssetProgress>(REQUIRED_ASSETS.map(item => [item.id, {
  ...item, status: "pending", loadedBytes: 0, totalBytes: null
}] as [string, AssetProgress]));
let lastSnapshot = makeSnapshot();

function makeSnapshot(): AssetLoadingSnapshot {
  const assets = REQUIRED_ASSETS.map(item => runtime.get(item.id)!).map(item => ({ ...item }));
  const completed = assets.filter(item => item.status === "ready").length;
  const failed = assets.filter(item => item.status === "failed").length;
  const pending = assets.length - completed - failed;
  const bytesLoaded = assets.reduce((sum, item) => sum + item.loadedBytes, 0);
  const sizesKnown = assets.every(item => item.totalBytes !== null && item.totalBytes > 0);
  const bytesExpected = sizesKnown ? assets.reduce((sum, item) => sum + (item.totalBytes ?? 0), 0) : null;
  let percent: number;
  if (bytesExpected && bytesExpected > 0) {
    const processedBytes = assets.reduce((sum, item) => sum + (item.status === "ready" ? item.totalBytes ?? 0 : 0), 0);
    percent = phase === "ready" ? 100 : Math.min(99, Math.floor(((bytesLoaded + processedBytes) / (bytesExpected * 2)) * 100));
  } else {
    // Unknown response sizes still have a truthful measurable unit: required
    // assets only count after download, parsing, and validation all succeed.
    percent = phase === "ready" ? 100 : Math.min(99, Math.floor((completed / assets.length) * 100));
  }
  return { phase, currentAssetId: currentId, assets, completed, pending, total: assets.length, failed, bytesLoaded, bytesExpected, percent, message };
}

function publish(nextMessage = message) {
  message = nextMessage;
  lastSnapshot = makeSnapshot();
  for (const listener of listeners) listener(lastSnapshot);
}

export function getAssetLoadingSnapshot(): AssetLoadingSnapshot {
  return lastSnapshot;
}

export function subscribeToAssetLoading(listener: (snapshot: AssetLoadingSnapshot) => void): () => void {
  listeners.add(listener);
  listener(lastSnapshot);
  return () => listeners.delete(listener);
}

function updateAsset(id: string, patch: Partial<AssetProgress>) {
  const current = runtime.get(id);
  if (!current) return;
  const next = { ...current, ...patch };
  runtime.set(id, next);
  if (patch.status === "downloading") {
    phase = "loading";
    publish(`Downloading ${next.name}`);
  } else if (patch.status === "processing") {
    phase = "processing";
    publish(`Parsing and preparing ${next.name}`);
  } else if (patch.status === "ready") {
    publish(`Prepared ${next.name}`);
  } else if (patch.status === "failed") {
    publish(`Could not prepare ${next.name}`);
  } else publish();
}

let progressFrame = 0;
function publishTransferProgress(id: string, loadedBytes: number) {
  const current = runtime.get(id);
  if (!current) return;
  runtime.set(id, { ...current, loadedBytes });
  if (progressFrame) return;
  progressFrame = window.setTimeout(() => {
    progressFrame = 0;
    publish();
  }, 100);
}

async function readResponse(response: Response, id: string): Promise<{ bytes: ArrayBuffer; totalBytes: number | null }> {
  const contentLength = Number(response.headers.get("content-length"));
  const contentEncoding = response.headers.get("content-encoding");
  const totalBytes = !contentEncoding && Number.isFinite(contentLength) && contentLength > 0 ? contentLength : null;
  updateAsset(id, { totalBytes });
  if (!response.body) {
    const bytes = await response.arrayBuffer();
    updateAsset(id, { loadedBytes: bytes.byteLength, totalBytes });
    return { bytes, totalBytes };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  const exactBuffer = totalBytes === null ? null : new Uint8Array(totalBytes);
  let loadedBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      if (exactBuffer && loadedBytes + value.byteLength <= exactBuffer.byteLength) exactBuffer.set(value, loadedBytes);
      else chunks.push(value);
      loadedBytes += value.byteLength;
      publishTransferProgress(id, loadedBytes);
    }
  }
  let bytes: Uint8Array;
  if (!chunks.length && exactBuffer && exactBuffer.byteLength === loadedBytes) bytes = exactBuffer;
  else {
    bytes = new Uint8Array(loadedBytes);
    let offset = 0;
    if (exactBuffer) {
      const copied = Math.min(exactBuffer.byteLength, loadedBytes);
      bytes.set(exactBuffer.subarray(0, copied), offset);
      offset += copied;
    }
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  }
  updateAsset(id, { loadedBytes, totalBytes });
  // These byte views are allocated above with `new Uint8Array(...)`, so their
  // backing store is an ArrayBuffer even though newer TS libs type it broadly.
  return { bytes: bytes.buffer as ArrayBuffer, totalBytes };
}

function validateImage(blobUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => image.naturalWidth > 0 && image.naturalHeight > 0 ? resolve() : reject(new Error("Image has invalid dimensions."));
    image.onerror = () => reject(new Error("Image could not be decoded."));
    image.src = blobUrl;
    if (typeof image.decode === "function") void image.decode().then(() => resolve()).catch(() => undefined);
  });
}

function validateAudio(blobUrl: string): Promise<HTMLAudioElement> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.preload = "auto";
    const cleanup = () => { audio.removeEventListener("loadedmetadata", onReady); audio.removeEventListener("error", onError); };
    const onReady = () => { cleanup(); resolve(audio); };
    const onError = () => { cleanup(); reject(new Error("Audio metadata could not be read.")); };
    audio.addEventListener("loadedmetadata", onReady, { once: true });
    audio.addEventListener("error", onError, { once: true });
    audio.src = blobUrl;
    audio.load();
  });
}

async function processAsset(definition: AssetDefinition, bytes: ArrayBuffer): Promise<void> {
  if (definition.kind === "gltf") {
    const basePath = new URL(definition.path, window.location.href).href.replace(/[^/]*$/, "");
    const gltf = await new GLTFLoader().parseAsync(bytes, basePath);
    let meshes = 0;
    gltf.scene.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshes++;
      if (!mesh.geometry?.getAttribute("position")) throw new Error("Model contains a mesh without vertex data.");
    });
    if (!meshes) throw new Error("Model did not contain any renderable meshes.");
    prepared.set(definition.path, gltf);
    return;
  }
  if (definition.kind === "exr") {
    const decoded = new EXRLoader().parse(bytes);
    if (!decoded.width || !decoded.height || !decoded.data?.byteLength) throw new Error("Environment map decoded without image data.");
    const texture = new THREE.DataTexture(decoded.data, decoded.width, decoded.height, decoded.format, decoded.type);
    texture.colorSpace = decoded.colorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.needsUpdate = true;
    prepared.set(definition.path, texture);
    return;
  }
  const extension = definition.path.split("?")[0].split(".").pop()?.toLowerCase();
  const mimeType = extension === "mp3" ? "audio/mpeg" : extension === "png" ? "image/png" : extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "webp" ? "image/webp" : "application/octet-stream";
  const blob = new Blob([bytes], { type: mimeType });
  let objectUrl: string | undefined;
  objectUrl = URL.createObjectURL(blob);
  blobUrls.set(definition.path, objectUrl);
  if (definition.kind === "image") {
    try { await validateImage(objectUrl); }
    catch (error) { URL.revokeObjectURL(objectUrl); blobUrls.delete(definition.path); throw error; }
    prepared.set(definition.path, objectUrl);
    return;
  }
  try {
    const audio = await validateAudio(objectUrl);
    audioElements.set(definition.path, audio);
    prepared.set(definition.path, objectUrl);
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    blobUrls.delete(definition.path);
    throw error;
  }
}

async function prepareOne(definition: AssetDefinition): Promise<void> {
  currentId = definition.id;
  const current = runtime.get(definition.id)!;
  if (prepared.has(definition.path)) {
    updateAsset(definition.id, { status: "ready", loadedBytes: current.totalBytes ?? current.loadedBytes, error: undefined });
    return;
  }
  updateAsset(definition.id, { status: "downloading", loadedBytes: 0, error: undefined });
  try {
    const response = await fetch(definition.path, { cache: "default" });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    const { bytes, totalBytes } = await readResponse(response, definition.id);
    if (!bytes.byteLength) throw new Error("The server returned an empty file.");
    updateAsset(definition.id, { status: "processing", totalBytes, loadedBytes: bytes.byteLength });
    await processAsset(definition, bytes);
    updateAsset(definition.id, { status: "ready", totalBytes, loadedBytes: bytes.byteLength, error: undefined });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown asset loading failure.";
    updateAsset(definition.id, { status: "failed", error: detail });
  }
}

async function discoverExpectedSize(definition: AssetDefinition): Promise<boolean> {
  const current = runtime.get(definition.id)!;
  if (prepared.has(definition.path)) return false;
  currentId = definition.id;
  publish(`Checking asset size and availability · ${definition.name}`);
  try {
    const response = await fetch(definition.path, { method: "HEAD", cache: "default" });
    if (response.status === 404 || response.status === 410) {
      updateAsset(definition.id, { status: "failed", error: `HTTP ${response.status} · required file not found` });
      return true;
    }
    const length = Number(response.headers.get("content-length"));
    const encoded = response.headers.get("content-encoding");
    if (response.ok && !encoded && Number.isFinite(length) && length > 0) {
      updateAsset(definition.id, { totalBytes: length });
    }
  } catch {
    // HEAD is an optimization for accurate aggregate progress. The GET below remains authoritative.
  }
  return false;
}

export async function prepareRequiredAssets(): Promise<void> {
  if (activeRun) return activeRun;
  if (typeof window === "undefined") throw new Error("Required assets can only be prepared in the browser.");
  activeRun = (async () => {
    for (const item of runtime.values()) {
      if (!prepared.has(item.path) && item.status === "failed") runtime.set(item.id, { ...item, status: "pending", loadedBytes: 0, error: undefined });
    }
    phase = "verifying";
    currentId = null;
    publish("Checking required assets and transfer sizes");
    const missing = REQUIRED_ASSETS.filter(definition => !prepared.has(definition.path));
    const failedByPreflight = new Set<string>();
    let probeIndex = 0;
    const probeWorker = async () => {
      while (probeIndex < missing.length) {
        const definition = missing[probeIndex++];
        if (await discoverExpectedSize(definition)) failedByPreflight.add(definition.id);
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, missing.length) }, probeWorker));
    phase = "loading";
    currentId = null;
    publish("Downloading and preparing required mission assets");
    const pending = missing.filter(definition => !failedByPreflight.has(definition.id));
    let index = 0;
    const worker = async () => {
      while (index < pending.length) {
        const definition = pending[index++];
        await prepareOne(definition);
      }
    };
    await Promise.all(Array.from({ length: Math.min(1, pending.length) }, worker));
    const fontChecks = [
      document.fonts.load('700 48px "Kdam Thmor Pro"'),
      document.fonts.load('500 16px "DM Sans"'),
      document.fonts.load('700 16px "Kanit"')
    ];
    phase = "verifying";
    currentId = null;
    publish("Verifying downloaded assets and PHOBOSIA typography");
    const fonts = await Promise.allSettled(fontChecks);
    const failedFonts = fonts.some(result => result.status === "rejected");
    const failed = [...runtime.values()].filter(item => item.status === "failed");
    if (failed.length || failedFonts) {
      phase = "error";
      publish(failed.length ? `${failed.length} required asset${failed.length === 1 ? "" : "s"} failed. Retry to continue.` : "Required typography could not be prepared. Check the network and retry.");
    } else {
      phase = "ready";
      currentId = null;
      publish("All required assets are parsed, decoded, and ready");
    }
  })().finally(() => { activeRun = null; });
  return activeRun;
}

export function areRequiredAssetsReady(): boolean {
  return phase !== "error" && REQUIRED_ASSETS.every(item => prepared.has(item.path));
}

export function beginGameplayInitialization(): void {
  phase = "processing";
  currentId = null;
  publish("Initializing the existing gameplay renderer and mission environment");
}

export function completeGameplayInitialization(): void {
  if (!REQUIRED_ASSETS.every(item => prepared.has(item.path))) return;
  phase = "ready";
  currentId = null;
  publish("Gameplay environment initialized and ready");
}

export function getPreparedAssetUrl(path: string): string {
  const direct = blobUrls.get(path);
  if (direct) return direct;
  try { return blobUrls.get(decodeURI(path)) ?? path; }
  catch { return path; }
}

export function getPreparedAudioElement(path: string): HTMLAudioElement | undefined {
  const direct = audioElements.get(path);
  if (direct) return direct;
  try { return audioElements.get(decodeURI(path)); }
  catch { return undefined; }
}

export function getPreparedGLTF(path: string): GLTF {
  const value = prepared.get(path);
  if (!value || typeof value === "string" || value instanceof THREE.DataTexture) throw new Error(`Required model is not prepared: ${path}`);
  return value;
}

export function clonePreparedModel(path: string): THREE.Group {
  const source = getPreparedGLTF(path).scene;
  const clone = cloneSkeleton(source) as THREE.Group;
  const materials = new Map<THREE.Material, THREE.Material>();
  clone.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const copyMaterial = (material: THREE.Material) => {
      let copy = materials.get(material);
      if (!copy) { copy = material.clone(); materials.set(material, copy); }
      return copy;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(copyMaterial) : copyMaterial(mesh.material);
  });
  return clone;
}

export function getPreparedEXR(path: string): THREE.DataTexture {
  const value = prepared.get(path);
  if (!(value instanceof THREE.DataTexture)) throw new Error(`Required environment map is not prepared: ${path}`);
  return value;
}

export function isPreparedAsset(path: string): boolean {
  const direct = assetByPath.get(path);
  if (direct) return prepared.has(direct.path);
  try {
    const decoded = assetByPath.get(decodeURI(path));
    return Boolean(decoded && prepared.has(decoded.path));
  } catch { return false; }
}
