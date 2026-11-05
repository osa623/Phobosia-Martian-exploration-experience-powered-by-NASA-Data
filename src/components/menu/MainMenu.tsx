"use client";

import * as THREE from "three";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { GameViewport } from "@/components/game/GameViewport";
import { DAYS_CONFIG, type MissionDayNumber, type MissionProgressState } from "@/core/MissionManager";
import "../../components/menu/MainMenu.css";

const SAVE_KEYS = ["phobosia_mission_progress_v4", "phobosia_mission_progress_v3", "phobosia_mission_progress_v2"];
const SOL_SAVE_PREFIX = "phobosia_mission_progress_v4_sol_";
type SaveInfo = { key: string; state: MissionProgressState };
type Page = "home" | "archive" | "credits" | "confirm-new" | "exit" | "briefing";
const options = ["INITIATE OBSERVATION", "CONTINUE MISSION", "EXPEDITION LOG", "MISSION BRIEFING", "PROJECT ACKNOWLEDGEMENTS", "DISCONNECT"] as const;

function createMarsTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024; canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#a95432"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  let seed = 19;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 14000; i++) {
    const x = random() * canvas.width, y = random() * canvas.height;
    const radius = 1 + random() * random() * 18;
    const shade = random();
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = shade > .55 ? `rgba(229,139,87,${.08 + random() * .2})` : `rgba(72,31,24,${.08 + random() * .24})`;
    ctx.fill();
  }
  for (let i = 0; i < 130; i++) {
    const x = random() * canvas.width, y = random() * canvas.height, radius = 2 + random() * 22;
    const crater = ctx.createRadialGradient(x - radius * .2, y - radius * .25, radius * .08, x, y, radius);
    crater.addColorStop(0, "rgba(70,35,27,.48)"); crater.addColorStop(.65, "rgba(82,39,27,.20)"); crater.addColorStop(1, "rgba(232,144,91,.32)");
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = crater; ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.proceduralMars = true;
  return texture;
}

function readSave(): { save: SaveInfo | null; error: string } {
  try {
    for (const key of SAVE_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const value = JSON.parse(raw) as Partial<MissionProgressState>;
      if (!Number.isInteger(value.currentDay) || (value.currentDay ?? 0) < 1 || (value.currentDay ?? 10) > 9 || !Array.isArray(value.completedStepIds))
        return { save: null, error: "An existing mission record is invalid and cannot be resumed." };
      return { save: { key, state: value as MissionProgressState }, error: "" };
    }
    return { save: null, error: "" };
  } catch {
    return { save: null, error: "Mission data could not be read. The existing record has been left untouched." };
  }
}

function readSolSaves(): SaveInfo[] {
  const entries: SaveInfo[] = [];
  for (let sol = 1; sol <= 9; sol++) {
    const key = `${SOL_SAVE_PREFIX}${sol}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const state = JSON.parse(raw) as MissionProgressState;
      if (state.currentDay === sol && Array.isArray(state.completedStepIds)) entries.push({ key, state });
    } catch { /* Ignore one damaged slot without hiding the other sols. */ }
  }
  if (!entries.length) {
    const legacy = readSave().save;
    if (legacy) entries.push(legacy);
  }
  return entries;
}

export function MainMenu() {
  const host = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<Page>("home");
  const [save, setSave] = useState<SaveInfo | null>(null);
  const [solSaves, setSolSaves] = useState<SaveInfo[]>([]);
  const [saveError, setSaveError] = useState("");
  const [gameMode, setGameMode] = useState<"new" | "continue" | null>(null);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState("Calibrating orbital display");
  const [assetError, setAssetError] = useState("");
  const musicRef = useRef<HTMLAudioElement>(null);
  const pageRef = useRef(page);
  pageRef.current = page;
  const refresh = useCallback(() => { const result = readSave(); setSave(result.save); setSaveError(result.error); setSolSaves(readSolSaves()); }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const audio = musicRef.current;
    if (!audio) return;
    audio.volume = 0.32;
    const start = () => { void audio.play().catch(() => {}); };
    start();
    window.addEventListener("pointerdown", start);
    window.addEventListener("keydown", start);
    return () => { window.removeEventListener("pointerdown", start); window.removeEventListener("keydown", start); audio.pause(); };
  }, [gameMode]);
  useEffect(() => {
    if (gameMode || !host.current) return;
    const root = host.current;
    let disposed = false;
    let frame = 0;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0, 8.2);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.72;
    root.appendChild(renderer.domElement);
    const globePivot = new THREE.Group();
    // Tilt Mars's north axis before rotating around its local spin axis.
    globePivot.rotation.z = THREE.MathUtils.degToRad(25);
    scene.add(globePivot);
    const ambient = new THREE.HemisphereLight(0x9babc7, 0x21150f, 0.62);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffd0a0, 3.6);
    key.name = "MarsSunLight";
    key.position.set(-2, 4, 6);
    key.target.name = "MarsSunTarget";
    scene.add(key, key.target);
    let globe: THREE.Object3D | null = null;
    let envTarget: THREE.WebGLRenderTarget | null = null;
    let envTexture: THREE.DataTexture | null = null;
    const clock = new THREE.Clock();
    const resize = () => {
      const w = root.clientWidth || window.innerWidth, h = root.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
      if (globe) {
        const scale = w / h < 1.35 ? 0.78 : Math.min(1.08, Math.max(0.92, h / 860));
        globePivot.scale.setScalar(scale);
        globePivot.position.set(w / h < 1.35 ? 0.2 : 2.45, w / h < 1.35 ? -0.55 : -1.65, 1);
        key.position.set(globePivot.position.x - 3.5, globePivot.position.y + 4, 6);
        key.target.position.copy(globePivot.position);
      }
    };
    const observer = new ResizeObserver(resize); observer.observe(root); resize();
    let loaded = 0;
    const finishAsset = () => { loaded++; if (loaded >= 3 && !disposed) setLoading(""); };
    new EXRLoader().load("/assets/exr/NightSkyHDRI008_4K_HDR_1.exr", texture => {
      if (disposed) { texture.dispose(); return; }
      envTexture = texture; texture.mapping = THREE.EquirectangularReflectionMapping; scene.background = texture;
      const pmrem = new THREE.PMREMGenerator(renderer); envTarget = pmrem.fromEquirectangular(texture); pmrem.dispose();
      scene.environment = envTarget.texture; scene.environmentIntensity = 0.35; finishAsset();
    }, undefined, () => { if (!disposed) setAssetError("The orbital environment could not be loaded."); finishAsset(); });
    new GLTFLoader().load("/assets/models/mars.glb", gltf => {
      if (disposed) return;
      globe = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(globe);
      const size = bounds.getSize(new THREE.Vector3()); const center = bounds.getCenter(new THREE.Vector3());
      globe.position.sub(center);
      const max = Math.max(size.x, size.y, size.z);
      if (!Number.isFinite(max) || max <= 0) { setAssetError("The Mars model has invalid dimensions."); finishAsset(); return; }
      globe.scale.setScalar(7.1 / max);
      const proceduralMap = createMarsTexture();
      globe.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          const standard = material as THREE.MeshStandardMaterial;
          if (!standard.map) {
            standard.map = proceduralMap;
            standard.color.set(0xffffff);
            standard.roughness = 0.92;
            standard.needsUpdate = true;
          }
        }
      });
      globePivot.add(globe); resize(); finishAsset();
    }, undefined, () => { if (!disposed) setAssetError("The Mars globe model could not be loaded."); finishAsset(); });
    const artworkProbe = new Image();
    artworkProbe.onload = finishAsset;
    artworkProbe.onerror = () => { if (!disposed) setAssetError("The main menu artwork could not be loaded."); finishAsset(); };
    artworkProbe.src = "/assets/images/mainMenuImage.png";
    const render = () => {
      if (disposed) return;
      if (pageRef.current === "exit") return;
      frame = requestAnimationFrame(render);
      if (globe) globePivot.rotation.y += Math.min(clock.getDelta(), 0.05) * 0.022;
      else clock.getDelta();
      renderer.render(scene, camera);
    };
    render();
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect();
      scene.environment = null; scene.background = null;
      envTarget?.dispose(); envTexture?.dispose(); artworkProbe.onload = null; artworkProbe.onerror = null;
      globe?.traverse(obj => { const mesh = obj as THREE.Mesh; mesh.geometry?.dispose(); for (const mat of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) { const standard = mat as THREE.MeshStandardMaterial; if (standard.map?.userData.proceduralMars) standard.map.dispose(); mat.dispose(); } });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, [gameMode]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (gameMode) return;
      if (event.key === "ArrowDown") { event.preventDefault(); setSelected(value => (value + 1) % options.length); }
      else if (event.key === "ArrowUp") { event.preventDefault(); setSelected(value => (value + options.length - 1) % options.length); }
      else if (event.key === "Escape" && page !== "home") setPage("home");
      else if ((event.key === "Enter" || event.key === " ") && page === "home") activate(selected);
    };
    window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown);
  });

  const begin = (mode: "new" | "continue") => { setGameMode(mode); };
  function activate(index: number) {
    if (index === 0) { refresh(); setPage(save ? "confirm-new" : "confirm-new"); }
    if (index === 1) { refresh(); if (readSave().save || readSolSaves().length) setPage("archive"); else setSaveError("No saved observation is available to continue."); }
    if (index === 2) { refresh(); setPage("archive"); }
    if (index === 3) setPage("briefing");
    if (index === 4) setPage("credits");
    if (index === 5) setPage("exit");
  }

  const confirmNew = () => {
    if (save || solSaves.length) { for (const key of SAVE_KEYS) localStorage.removeItem(key); for (let sol = 1; sol <= 9; sol++) localStorage.removeItem(`${SOL_SAVE_PREFIX}${sol}`); }
    setGameMode("new");
  };
  if (gameMode) return <GameViewport key={gameMode} />;

  const currentDay = save?.state.currentDay;
  const day = currentDay ? DAYS_CONFIG[currentDay as MissionDayNumber] : null;
  const task = day?.steps.find(step => !save?.state.completedStepIds.includes(step.stepId));
  return <div className="ph-menu" ref={host}>
    <audio ref={musicRef} src="/assets/sounds/PHOBOSIA.mp3" loop preload="auto" aria-hidden="true" />
    <div className="ph-menu-art" aria-hidden="true" />
    <div className="ph-menu-vignette" aria-hidden="true" />
    <div className="ph-menu-grain" aria-hidden="true" />
    <header className="ph-menu-header"><div className="ph-wordmark">PHOBOSIA<span>FIELD OBSERVATION PROGRAM</span></div><div className="ph-header-status"><i /> DEEP SPACE LINK <b>ACTIVE</b></div></header>
    <div className="ph-menu-content">
      <section className="ph-menu-title"><div className="ph-kicker">MARS Â· SCIENTIFIC EXPEDITION</div><img className="ph-menu-logo" src="/assets/images/PHOBOSIA_Metallic_Logo_4K.png" alt="PHOBOSIA"/><p>Observe carefully. Record honestly.<br/>Advance human understanding.</p><div className="ph-menu-rule"><span>MISSION CONTROL</span><i /></div></section>
      <nav className="ph-options" aria-label="Mission menu">{options.map((label, index) => {
        const disabled = index === 1 && !save && !solSaves.length;
        return <button key={label} className={`ph-option ${selected === index ? "is-selected" : ""} ${disabled ? "is-disabled" : ""}`} onMouseEnter={() => setSelected(index)} onClick={() => activate(index)} aria-disabled={disabled}>
          <span className="ph-option-index">0{index + 1}</span><span>{label}</span><i />
        </button>;
      })}</nav>
    </div>
    <footer className="ph-menu-footer"><span>PHOBOSIA EXPEDITION SYSTEMS <b>Â·</b> SOL {currentDay ? String(currentDay).padStart(2,"0") : "01"}</span><span>â†‘ â†“ SELECT <b>Â·</b> ENTER CONFIRM</span><span>BUILD 01.09 <b>Â·</b> MARS ORBIT</span></footer>
    {(loading || assetError) && <div className="ph-load"><span className="ph-spinner" />{assetError || loading}</div>}
    {saveError && <button className="ph-toast" onClick={() => setSaveError("")}>{saveError}<span>Ã—</span></button>}
    {page !== "home" && <div className="ph-modal-backdrop"><section className="ph-modal">
      <button className="ph-back" onClick={() => setPage("home")}>â† RETURN TO MENU</button>
      {page === "confirm-new" && <><div className="ph-kicker">CAMPAIGN INITIALIZATION</div><h2>INITIATE OBSERVATION</h2><p>{save ? "This single campaign record will be replaced. This action clears the saved expedition record." : "A new scientific campaign will begin at the configured SOL1 starting state."}</p><div className="ph-modal-actions"><button className="ph-primary" onClick={confirmNew}>CONFIRM INITIALIZATION</button><button onClick={() => setPage("home")}>CANCEL</button></div></>}
      {page === "archive" && <><div className="ph-kicker">PERSISTED CAMPAIGN RECORDS</div><h2>LOAD OBSERVATION</h2><div className="ph-sol-list">{solSaves.length ? solSaves.sort((a,b) => a.state.currentDay-b.state.currentDay).map(slot => { const slotDay = DAYS_CONFIG[slot.state.currentDay as MissionDayNumber]; const nextTask = slotDay?.steps.find(step => !slot.state.completedStepIds.includes(step.stepId)); return <article className="ph-sol-card" key={slot.key}><div className="ph-record-sol">SOL {String(slot.state.currentDay).padStart(2,"0")}<small>{slot.state.currentDay === save?.state.currentDay ? "LATEST RECORD" : "SAVED RECORD"}</small></div><div><h3>{slotDay?.title || `Sol ${slot.state.currentDay}`}</h3><p>{nextTask ? `Current objective · ${nextTask.label}` : "All configured objectives complete"}</p><p>Progress · {slot.state.completedStepIds.length} recorded task completions</p></div><div className="ph-sol-actions"><button className="ph-primary" onClick={() => { if (slot.key !== save?.key) localStorage.setItem(SAVE_KEYS[0], JSON.stringify(slot.state)); begin("continue"); }}>CONTINUE</button><button onClick={() => { if (window.confirm(`Delete the Sol ${slot.state.currentDay} save?`)) { localStorage.removeItem(slot.key); if (slot.state.currentDay === save?.state.currentDay) for (const key of SAVE_KEYS) localStorage.removeItem(key); refresh(); } }}>DELETE</button></div></article>; }) : <p>{saveError || "No persisted campaign records are available."}</p>}</div></>}
      {page === "credits" && <><div className="ph-kicker">PHOBOSIA Â· PROJECT RECORD</div><h2>PROJECT ACKNOWLEDGEMENTS</h2><div className="ph-credit"><span>PROJECT</span><strong>PHOBOSIA</strong><small>Mars scientific observation expedition Â· first playable prototype</small></div><p className="ph-muted">No contributor or partner credits are identified in the repository documentation.</p></>}
      {page === "briefing" && <><div className="ph-kicker">MISSION BRIEFING</div><h2>CINEMATIC UNAVAILABLE</h2><p>The repository contains module transition videos, but no introductory campaign cinematic is identified. No video has been substituted.</p></>}
      {page === "exit" && <><div className="ph-kicker">COMMUNICATIONS LINK CLOSED</div><h2>EXPEDITION SUSPENDED</h2><p>PHOBOSIA has disconnected. Your persisted campaign record remains available. You may close this browser tab or window.</p></>}
    </section></div>}
  </div>;
}


