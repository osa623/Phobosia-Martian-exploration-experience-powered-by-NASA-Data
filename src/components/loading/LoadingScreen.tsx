"use client";

import { getPreparedAssetUrl, ON_DEMAND_ASSETS, type AssetProgress, type AssetLoadingSnapshot } from "@/core/AssetLoading";
import styles from "./LoadingScreen.module.css";

type DisplayGroup = { key: string; label: string; assets: AssetProgress[]; deferred?: boolean };

function fileName(path: string): string {
  const encodedName = path.split("/").pop() ?? path;
  try { return decodeURIComponent(encodedName); } catch { return encodedName; }
}

function displayLabel(asset: AssetProgress): string {
  if (asset.kind === "gltf") return fileName(asset.path);
  if (asset.kind === "exr") return "Environment Maps";
  if (asset.kind === "audio") return asset.required ? "Sounds" : "Songs";
  if (asset.kind === "video") return "Videos";
  return asset.path.toLowerCase().includes("wallpaper") ? "Wallpapers" : "Images";
}

function stateLabel(assets: AssetProgress[], deferred = false): string {
  if (deferred) return "DEFERRED";
  if (assets.some(asset => asset.status === "failed")) return "FAILED";
  if (assets.some(asset => asset.status === "downloading")) return "DOWNLOADING";
  if (assets.some(asset => asset.status === "processing")) return "PROCESSING";
  if (assets.every(asset => asset.status === "ready")) return "READY";
  return "PENDING";
}

function displayGroups(snapshot: AssetLoadingSnapshot): DisplayGroup[] {
  const required = snapshot.assets;
  const optional: AssetProgress[] = ON_DEMAND_ASSETS.map(asset => ({
    ...asset,
    status: "pending" as const,
    loadedBytes: 0,
    totalBytes: null
  }));
  const groups: DisplayGroup[] = [];
  const models = required.filter(asset => asset.kind === "gltf");
  if (models.length) groups.push({ key: "models", label: "3D MODELS", assets: models });
  const definitions: Array<{ key: string; label: string; assets: AssetProgress[]; deferred?: boolean }> = [
    { key: "environment", label: "ENVIRONMENT MAPS", assets: required.filter(asset => asset.kind === "exr") },
    { key: "images", label: "IMAGES", assets: required.filter(asset => asset.kind === "image") },
    { key: "sounds", label: "SOUNDS", assets: required.filter(asset => asset.kind === "audio") },
    { key: "songs", label: "LAPTOP SONGS", assets: optional.filter(asset => asset.kind === "audio"), deferred: true },
    { key: "laptop-images", label: "LAPTOP IMAGES", assets: optional.filter(asset => asset.kind === "image" && !asset.path.toLowerCase().includes("wallpaper")), deferred: true },
    { key: "wallpapers", label: "WALLPAPERS", assets: optional.filter(asset => asset.path.toLowerCase().includes("wallpaper")), deferred: true },
    { key: "videos", label: "VIDEOS", assets: optional.filter(asset => asset.kind === "video"), deferred: true }
  ];
  for (const group of definitions) if (group.assets.length) groups.push(group);
  return groups;
}

export function LoadingScreen({ snapshot, onRetry }: { snapshot: AssetLoadingSnapshot; onRetry: () => void }) {
  const logo = snapshot.assets.find(asset => asset.id === "branding.loading-logo");
  const current = snapshot.assets.find(asset => asset.id === snapshot.currentAssetId);
  const groups = displayGroups(snapshot);
  const progressCaption = snapshot.bytesExpected === null ? "ASSETS FULLY PREPARED" : "TRANSFER + PROCESSING";
  const progressMethod = snapshot.bytesExpected === null
    ? "Percentage counts required assets only after each is downloaded, parsed, and verified."
    : "Percentage uses measured transfer bytes and completed asset processing.";

  return <main className={styles.screen} aria-live="polite">
    <section className={styles.progressPanel} aria-label="Mission asset preparation progress">
      <div className={styles.coordinates}>MISSION INITIALIZATION <span>PHB · 01</span></div>
      <div className={styles.progressNumber} aria-label={`${snapshot.percent}%`}>
        <span>{snapshot.percent}</span><small>%</small>
      </div>
      <p className={styles.progressCaption}>{progressCaption}</p>
      <div className={styles.metrics}>
        <span>{snapshot.completed.toString().padStart(2, "0")} / {snapshot.total.toString().padStart(2, "0")} READY</span>
        <span>{snapshot.pending.toString().padStart(2, "0")} PENDING</span>
        <span>{snapshot.failed.toString().padStart(2, "0")} FAILED</span>
      </div>
      <div className={styles.bar} role="progressbar" aria-label="Asset preparation" aria-valuemin={0} aria-valuemax={100} aria-valuenow={snapshot.percent}>
        <i style={{ width: `${snapshot.percent}%` }} />
      </div>
      <p className={styles.method}>{progressMethod}</p>
      <div className={styles.readout}><span>TRANSFERRED</span><b>{snapshot.bytesLoaded.toLocaleString()} B{snapshot.bytesExpected ? ` / ${snapshot.bytesExpected.toLocaleString()} B` : ""}</b></div>
      <div className={styles.readout}><span>PIPELINE</span><b>{snapshot.phase.toUpperCase()}</b></div>
    </section>

    <section className={styles.details} aria-label="PHOBOSIA mission assets">
      <div className={styles.brandSlot}>
        {logo?.status === "ready" && <img className={styles.logo} src={getPreparedAssetUrl(logo.path)} alt="PHOBOSIA" />}
        {logo?.status !== "ready" && <span className={styles.logoPending}>PHOBOSIA SYSTEMS INITIALIZING</span>}
      </div>
      <p className={styles.eyebrow}>PRE-LAUNCH CHECK</p>
      <h1>INITIALIZING MISSION ENVIRONMENT</h1>
      <p className={styles.status}>
        <span className={styles.statusLight} data-phase={snapshot.phase} />
        {current ? `Preparing ${displayLabel(current).toLowerCase()}` : snapshot.message}
      </p>
      <div className={styles.current}>
        <span>{snapshot.phase === "ready" ? "SYSTEM STATUS" : current?.status === "processing" ? "PROCESSING NOW" : "CURRENT ASSET GROUP"}</span>
        <strong>{snapshot.phase === "ready" ? "MISSION ENVIRONMENT READY" : current ? `${displayLabel(current)} · ${current.status.toUpperCase()}` : "VERIFYING REQUIRED RESOURCES"}</strong>
      </div>
      {snapshot.phase === "error" && <div className={styles.errorPanel} role="alert">
        <strong>REQUIRED PREPARATION FAILED</strong>
        {snapshot.failed > 0 ? <ul>{snapshot.assets.filter(asset => asset.status === "failed").map(asset => <li key={asset.id}><b>{displayLabel(asset)}</b><span>{asset.error}</span></li>)}</ul> : <p>{snapshot.message}</p>}
        <button type="button" onClick={onRetry}>RETRY PREPARATION</button>
      </div>}
      <div className={styles.assetList}>
        {groups.map(group => <section className={styles.assetGroup} key={group.key}>
          <h2>{group.label}<span>{group.deferred ? "ON DEMAND" : `${group.assets.filter(asset => asset.status === "ready").length}/${group.assets.length}`}</span></h2>
          {group.assets.length > 1 && group.key !== "models" ? <div className={styles.assetRow} data-state={stateLabel(group.assets, group.deferred)}>
            <i aria-hidden="true" />
            <span>{group.label === "IMAGES" ? "Required mission and interface images" : group.label === "ENVIRONMENT MAPS" ? "Surface and sky textures" : group.label}</span>
            <small>{group.deferred ? "DEFERRED" : stateLabel(group.assets)}</small>
          </div> : group.assets.map(asset => <div className={styles.assetRow} key={asset.id} data-state={stateLabel([asset], group.deferred)}>
            <i aria-hidden="true" />
            <span>{group.key === "models" ? fileName(asset.path) : group.label}</span>
            <small>{group.deferred ? "DEFERRED" : stateLabel([asset])}</small>
          </div>)}
        </section>)}
      </div>
      <footer className={styles.footer}><span>PHOBOSIA · FIELD OBSERVATION PROGRAM</span><span>GAMEPLAY REMAINS LOCKED UNTIL VERIFICATION</span></footer>
    </section>
  </main>;
}
