"use client";

import { getPreparedAssetUrl, ON_DEMAND_ASSETS, type AssetCategory, type AssetLoadingSnapshot } from "@/core/AssetLoading";
import styles from "./LoadingScreen.module.css";

const categories: readonly AssetCategory[] = [
  "Branding", "Habitat", "Mission Control", "Research Laboratory", "Engineering Unit", "Central Hub",
  "Airlock", "Mars Terrain", "Drone Area", "Gameplay Audio", "Mission Imagery"
];

function assetState(status: string): string {
  if (status === "ready") return "READY";
  if (status === "downloading") return "DOWNLOADING";
  if (status === "processing") return "PROCESSING";
  if (status === "failed") return "FAILED";
  return "PENDING";
}

export function LoadingScreen({ snapshot, onRetry }: { snapshot: AssetLoadingSnapshot; onRetry: () => void }) {
  const logo = snapshot.assets.find(asset => asset.id === "branding.loading-logo");
  const current = snapshot.assets.find(asset => asset.id === snapshot.currentAssetId);
  const groups = categories.map(category => ({ category, assets: snapshot.assets.filter(asset => asset.category === category) })).filter(group => group.assets.length);
  return <main className={styles.screen} aria-live="polite">
    <section className={styles.progressPanel} aria-label="Mission asset preparation progress">
      <div className={styles.coordinates}>MISSION INITIALIZATION <span>PHB · 01</span></div>
      <div className={styles.progressNumber} aria-label={snapshot.percent === null ? "Progress percentage unavailable" : `${snapshot.percent} percent`}>
        <span>{snapshot.percent === null ? "—" : snapshot.percent}</span><small>{snapshot.percent === null ? "" : "%"}</small>
      </div>
      <p className={styles.progressCaption}>{snapshot.percent === null ? "TRANSFER SIZE UNAVAILABLE" : "REQUIRED ASSET READINESS"}</p>
      <div className={styles.metrics}>
        <span>{snapshot.completed.toString().padStart(2, "0")} / {snapshot.total.toString().padStart(2, "0")} READY</span>
        <span>{snapshot.pending.toString().padStart(2, "0")} PENDING</span>
        <span>{snapshot.failed.toString().padStart(2, "0")} FAILED</span>
      </div>
      <div className={styles.bar} role="progressbar" aria-label="Asset preparation" aria-valuemin={0} aria-valuemax={100} aria-valuenow={snapshot.percent ?? undefined}>
        {snapshot.percent !== null && <i style={{ width: `${snapshot.percent}%` }} />}
      </div>
      <p className={styles.method}>{snapshot.percent === null ? "Progress remains indeterminate until every required transfer reports a reliable size." : "Measured transfer bytes and successfully processed assets."}</p>
      <div className={styles.readout}><span>TRANSFERRED</span><b>{snapshot.bytesLoaded.toLocaleString()} B{snapshot.bytesExpected ? ` / ${snapshot.bytesExpected.toLocaleString()} B` : ""}</b></div>
      <div className={styles.readout}><span>PIPELINE</span><b>{snapshot.phase.toUpperCase()}</b></div>
    </section>

    <section className={styles.details} aria-label="PHOBOSIA mission assets">
      <div className={styles.brandSlot}>
        {logo?.status === "ready" && <img className={styles.logo} src={getPreparedAssetUrl(logo.path)} alt="PHOBOSIA" />}
        {logo?.status !== "ready" && <span className={styles.logoPending}>MISSION SYSTEMS · LOADING BRAND MARK</span>}
      </div>
      <p className={styles.eyebrow}>PRE-LAUNCH CHECK</p>
      <h1>INITIALIZING MISSION ENVIRONMENT</h1>
      <p className={styles.status}>
        <span className={styles.statusLight} data-phase={snapshot.phase} />
        {snapshot.message}
      </p>
      <div className={styles.current}>
        <span>{snapshot.phase === "ready" ? "SYSTEM STATUS" : current?.status === "processing" ? "PROCESSING NOW" : "CURRENT ASSET"}</span>
        <strong>{snapshot.phase === "ready" ? "MISSION ENVIRONMENT READY" : current ? `${current.category} · ${current.name} · ${assetState(current.status)}` : "VERIFYING REQUIRED RESOURCES"}</strong>
      </div>
      {snapshot.phase === "error" && <div className={styles.errorPanel} role="alert">
        <strong>REQUIRED PREPARATION FAILED</strong>
        {snapshot.failed > 0 ? <ul>{snapshot.assets.filter(asset => asset.status === "failed").map(asset => <li key={asset.id}><b>{asset.name}</b><span>{asset.error}</span></li>)}</ul> : <p>{snapshot.message}</p>}
        <button type="button" onClick={onRetry}>RETRY PREPARATION</button>
      </div>}
      <div className={styles.assetList}>
        {groups.map(group => <section className={styles.assetGroup} key={group.category}>
          <h2>{group.category}<span>{group.assets.filter(asset => asset.status === "ready").length}/{group.assets.length}</span></h2>
          {group.assets.map(asset => <div className={styles.assetRow} key={asset.id} data-state={asset.status}>
            <i aria-hidden="true" />
            <span>{asset.name}</span>
            <small>{assetState(asset.status)}</small>
          </div>)}
        </section>)}
        {ON_DEMAND_ASSETS.length > 0 && <section className={styles.assetGroup}>
          <h2>ON-DEMAND MEDIA<span>LOADS WHEN OPENED</span></h2>
          {ON_DEMAND_ASSETS.map(asset => <div className={styles.assetRow} data-state="pending" key={asset.id}>
            <i aria-hidden="true" />
            <span>{asset.name}</span>
            <small>DEFERRED</small>
          </div>)}
        </section>}
      </div>
      <footer className={styles.footer}><span>PHOBOSIA · FIELD OBSERVATION PROGRAM</span><span>GAMEPLAY REMAINS LOCKED UNTIL VERIFICATION</span></footer>
    </section>
  </main>;
}
