"use client";

import { useEffect, useRef, useState } from "react";
import { Game } from "@/core/Game";
import type { GameState } from "@/core/EventBus";
import { PhobosiaOS } from "./PhobosiaOS";
import { SpeedTravelBar } from "./SpeedTravelBar";
import {
  MASTER_TERRAIN_TARGETS,
  PREDEFINED_INTERPRETATIONS,
  type TerrainRouteTarget
} from "@/core/MissionManager";
import { Sol6FieldCapture } from "@/missions/SOL_06/components/Sol6FieldCapture";
import { PersonalLaptopOS } from "@/systems/personal-laptop/PersonalLaptopOS";
import { LaptopAudioController, type LaptopAudioSnapshot } from "@/systems/personal-laptop/LaptopAudioController";
import { areRequiredAssetsReady, getPreparedAssetUrl } from "@/core/AssetLoading";

const initialState: GameState = {
  ready: false,
  module: "Habitat",
  prompt: "",
  panel: "",
  error: "",
  fps: 0,
  transition: "",
  transitionLabel: "",
  transitionProgress: null,

  missionDay: 1,
  missionTitle: "Outpost Orientation",
  objectiveTitle: "Complete base orientation checklist",
  objectiveState: "in_progress",
  completedStepCount: 0,
  totalStepCount: 19,
  dayBriefingSeen: false,
  showBriefingModal: true,
  briefingText:
    "Welcome to Mars Outpost PHOBOSIA. Before commencing scientific field observations, explore the base, inspect each operational zone and system console, and complete the Day 1 orientation checklist.",
  primaryObjective: "Explore the outpost, inspect the required systems and consoles across all modules, and complete the 19-task orientation checklist.",
  controlHint: "W A S D move · Shift jog · Space jump · E interact · Esc unlock",
  isOutdoorTerrain: false,
  evaSuitActive: false,
  evaMovementState: "IDLE",
  evaOxygenPercent: 100,
  evaBatteryPercent: 100,
  evaHeadingDegrees: 0,
  evaTerrainElevation: null,
  showRoutePlanning: false,
  selectedRouteTargetId: null,
  notification: null,
  navigationInstruction: null,
  restFeedback: null,
  restTransition: null,

  geologicalSurvey: null,
  surfaceObservation: null,
  scienceAnalysis: null,
  droneSurvey: null,

  showGeologicalForm: false,
  showSurfaceObservationForm: false,
  showScienceAnalysisModal: false,
  showDroneConsoleModal: false,

  droneModeActive: false,
  roverActive: false,
  roverSpeed: 0,
  roverView: "FIRST PERSON",
  droneTelemetry: { battery: 88, signal: 96, altitude: 15, x: 470, z: -58.7 },
  sol5DroneActive: false,
  sol5LandingPromptActive: false,
  sol5Telemetry: null,
  sol5Images: [],
  sol5Flight: null,
  sol5Message: null,
  finalDepartureVideo: false,

  showCinematicOverlay: false,
  showOSDesktop: false,
  showPersonalLaptop: false,
  osInitialApp: undefined,
  cameraPresentation: null
};

type GameViewportProps = {
  onReturnToMenu?: () => void;
  onReady?: () => void;
};

export function GameViewport({ onReturnToMenu, onReady }: GameViewportProps = {}) {
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<Game | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<GameState>(initialState);
  const [laptopAudio, setLaptopAudio] = useState<LaptopAudioController | null>(null);
  const [laptopAudioSnapshot, setLaptopAudioSnapshot] = useState<Readonly<LaptopAudioSnapshot> | null>(null);
  const [finalVideoError, setFinalVideoError] = useState(false);

  useEffect(() => { if (state.ready) onReady?.(); }, [state.ready, onReady]);

  // Sol 05 Route Planning
  const [selectedTarget, setSelectedTarget] = useState<string>("TARGET_ALPHA_CRATER_RIM");

  // Sol 06 Geological Observation Form
  const [geoTexture, setGeoTexture] = useState("Vesicular Basalt & Fractured Regolith");
  const [geoDistribution, setGeoDistribution] = useState("Scattered Angular Clasts (< 5 cm)");
  const [geoShape, setGeoShape] = useState("Low-Angle Talus Incline (8–12°)");
  const [geoDust, setGeoDust] = useState("Thin Mantle (< 2 mm) with High Rock Exposure");
  const [geoInterest, setGeoInterest] = useState("Stratified ejecta layer near ridge crest");

  // Sol 07 Surface Observation Form
  const [surfPattern, setSurfPattern] = useState("Laminated Bedding & Cross-Stratification");
  const [surfAppearance, setSurfAppearance] = useState("Dark Iron-Magnesium Silicate Matrix");
  const [surfProfile, setSurfProfile] = useState("Undulating Dune Swale Transition");
  const [surfArea, setSurfArea] = useState("High-reflectance mineralized vein");
  const [surfQuestion, setSurfQuestion] = useState("Does the sulfate veneer indicate transient aqueous deposition?");

  // Sol 08 Science Analysis
  const [selectedInterpretation, setSelectedInterpretation] = useState("INTERPRETATION_SURFACE_PATTERN_REVIEW");

  useEffect(() => {
    if (!areRequiredAssetsReady() || !host.current) return;
    const instance = new Game(host.current, setState);
    game.current = instance;
    void instance.start();
    return () => instance.dispose();
  }, []);

  useEffect(() => {
    const controller = new LaptopAudioController();
    setLaptopAudio(controller);
    const unsubscribe = controller.subscribe(setLaptopAudioSnapshot);
    game.current?.connectLaptopAudio(controller);
    return () => {
      unsubscribe();
      controller.dispose();
    };
  }, []);

  useEffect(() => {
    laptopAudio?.setHabitatAudible(state.module === "Habitat");
  }, [laptopAudio, state.module]);

  useEffect(() => {
    if (state.transition !== "video" || !video.current) return;
    const element = video.current;
    element.currentTime = 0;
    void element.play().catch(() =>
      game.current?.videoFailed("The transition video could not start. You can continue to the destination.")
    );
  }, [state.transition]);

  useEffect(() => {
    if (!state.finalDepartureVideo || !video.current) return;
    const element = video.current;
    void element.play().then(() => setFinalVideoError(false)).catch(() => setFinalVideoError(true));
  }, [state.finalDepartureVideo]);

  const canClickToLock =
    !state.panel &&
    !state.transition &&
    !state.showBriefingModal &&
    !state.showRoutePlanning &&
    !state.showGeologicalForm &&
    !state.showSurfaceObservationForm &&
    !state.showScienceAnalysisModal &&
    !state.showDroneConsoleModal &&
    !state.droneModeActive && !state.sol5DroneActive &&
    !state.restFeedback &&
    !state.showCinematicOverlay &&
    !state.showOSDesktop &&
    !state.showPersonalLaptop &&
    !state.cameraPresentation;
  const compassPoints = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const compassIndex = Math.round(state.evaHeadingDegrees / 45) % compassPoints.length;
  const compassDirection = compassPoints[compassIndex];

  return (
    <div id="game" className="relative h-screen w-screen bg-black" ref={host} onClick={() => canClickToLock && game.current?.lock()}>
      {state.finalDepartureVideo && <div role="dialog" aria-label="Final departure cinematic" onKeyDown={event => event.preventDefault()} style={{ position: "fixed", inset: 0, width: "100vw", height: "100dvh", zIndex: 10000, background: "#000", overflow: "hidden" }}>
        <video ref={video} src="/assets/videos/finalVideo/finalVideo.mp4" autoPlay playsInline preload="auto" disablePictureInPicture onCanPlay={() => setFinalVideoError(false)} onError={() => setFinalVideoError(true)} onEnded={() => game.current?.finishSol11FinalVideo()} aria-label="Final PHOBOSIA departure" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", background: "#000" }} />
        {finalVideoError && <div style={{ position: "absolute", inset: 0, display: "grid", placeContent: "center", gap: 12, color: "#fff", background: "rgba(0,0,0,.88)", fontFamily: "monospace", textAlign: "center" }}><p>Final cinematic could not start. The campaign remains incomplete.</p><button onClick={() => { setFinalVideoError(false); void video.current?.play().catch(() => setFinalVideoError(true)); }} style={{ justifySelf: "center", padding: "10px 16px", border: "1px solid #7ca9b5", background: "#14242b", color: "white", cursor: "pointer" }}>RETRY PLAYBACK</button></div>}
      </div>}
      {onReturnToMenu && <button
        type="button"
        className="[position:fixed] [top:16px] [left:16px] [z-index:60] [border:1px_solid_rgba(85,205,232,0.45)] [background:rgba(5,14,20,0.88)] [padding:8px_12px] [color:#c9e3e9] [font:10px_var(--font-mono,monospace)] [letter-spacing:0.1em] hover:[background:rgba(20,42,52,0.96)]"
        onClick={event => { event.stopPropagation(); document.exitPointerLock(); onReturnToMenu(); }}
      >RETURN TO MENU</button>}
      {/* SEPARATE REMOVABLE DEV SPEED TRAVEL SYSTEM (Delete component & this tag to remove)
      <SpeedTravelBar
        activeModule={state.module}
        onTravel={(targetModule) => void game.current?.speedTravel(targetModule)}
      />  */}
      {/* EVA visor frame and edge-positioned telemetry, based on the supplied Mars helmet reference. */}
      {state.evaSuitActive && !state.transition && !state.droneModeActive && !state.sol5DroneActive && !state.panel && !state.showOSDesktop && !state.showPersonalLaptop && !state.showCinematicOverlay && (
        <div className="[position:fixed] [inset:0] [pointer-events:none] [z-index:20] [overflow:hidden]" aria-label="EVA helmet visor and suit HUD">
          <div className="[position:absolute] [inset:0] [background:radial-gradient(ellipse_at_center,_transparent_59%,_rgba(4,_7,_10,_0.12)_76%,_rgba(2,_4,_6,_0.48)_100%)]" />
          {state.isOutdoorTerrain && <div className="[position:absolute] [inset:0] [background:radial-gradient(ellipse_at_center,_rgba(151,_78,_42,_0.035)_22%,_rgba(129,_69,_42,_0.08)_72%,_rgba(93,_48,_30,_0.17)_100%)] [mix-blend-mode:soft-light]" />}
          {state.isOutdoorTerrain && <svg className="[position:absolute] [inset:0] [height:100%] [width:100%] [opacity:0.2]" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true"><g fill="#d79a70">{Array.from({ length: 42 }, (_, i) => <circle key={i} cx={(i * 193 + 71) % 1000} cy={(i * 137 + 43) % 600} r={i % 7 === 0 ? 1.4 : 0.7} opacity={i % 4 === 0 ? 0.24 : 0.12} />)}</g></svg>}
          <svg className="[position:absolute] [inset:0] [h-full] [w-full]" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="eva-helmet-metal" x1="0" y1="0" x2="0.8" y2="1"><stop offset="0" stopColor="#090d11"/><stop offset="0.34" stopColor="#37434a"/><stop offset="0.62" stopColor="#101519"/><stop offset="1" stopColor="#080b0e"/></linearGradient>
              <linearGradient id="eva-visor-cyan" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#52cfff" stopOpacity="0.45"/><stop offset="0.5" stopColor="#9cefff" stopOpacity="0.96"/><stop offset="1" stopColor="#52cfff" stopOpacity="0.45"/></linearGradient>
            </defs>
            <path fill="url(#eva-helmet-metal)" fillRule="evenodd" d="M0 0H1000V600H0Z M30 106 C42 54 92 18 167 28 C300 45 374 65 500 61 C626 65 700 45 833 28 C908 18 958 54 970 106 L995 477 C1000 536 971 568 916 577 C855 588 794 557 738 552 C652 568 591 572 500 568 C409 572 348 568 262 552 C206 557 145 588 84 577 C29 568 0 536 5 477 Z" />
            <path d="M30 106 C42 54 92 18 167 28 C300 45 374 65 500 61 C626 65 700 45 833 28 C908 18 958 54 970 106 L995 477 C1000 536 971 568 916 577 C855 588 794 557 738 552 C652 568 591 572 500 568 C409 572 348 568 262 552 C206 557 145 588 84 577 C29 568 0 536 5 477 Z" fill="none" stroke="url(#eva-visor-cyan)" strokeWidth="2.2" opacity="0.88" />
            <path d="M45 112 C58 68 101 39 170 47 C304 62 384 80 500 77 C616 80 696 62 830 47 C899 39 942 68 955 112 L978 474 C981 514 956 540 911 547 C854 557 795 533 739 528 C650 544 589 548 500 545 C411 548 350 544 261 528 C205 533 146 557 89 547 C44 540 19 514 22 474 Z" fill="none" stroke="#b9eaf3" strokeWidth="1" opacity="0.24" />
            <path d="M195 31 C292 45 380 59 500 55 C620 59 708 45 805 31 M265 563 Q500 582 735 563" fill="none" stroke="#6adfff" strokeWidth="2" opacity="0.58" />
            <path d="M0 0H1000V26 Q780 45 500 40 Q220 45 0 26Z M0 574 Q150 594 265 573 L300 600 H0Z M1000 574 Q850 594 735 573 L700 600 H1000Z" fill="#080b0e" opacity="0.72" />
          </svg>

          <section className="[position:absolute] [top:6%] [left:5%] [width:220px] [clip-path:polygon(8%_0,100%_0,100%_76%,86%_100%,0_82%,0_18%)] [border:1px_solid_rgba(85,_205,_232,_0.72)] [background:linear-gradient(115deg,_rgba(8,_25,_36,_0.84),_rgba(14,_27,_36,_0.63))] [padding:12px_20px_14px_18px] [color:#d9f5fa] font-mono [text-shadow:0_1px_4px_#000]">
            <div className="[display:flex] [align-items:center] [gap:12px]"><div className="[display:grid] [height:40px] [width:40px] [place-items:center] [border-radius:9999px] [border:2px_solid_#71ddfa] [color:#81e7ff] [font-size:17px] [font-weight:bold]">O₂</div><div><div className="[font-size:10px] [letter-spacing:0.12em] [color:#aee7f1]">OXYGEN · SIM</div><div className="[font-size:22px] [font-weight:bold]">{state.evaOxygenPercent.toFixed(1)}%</div></div></div>
            <div className="[margin-top:8px] [height:6px] [overflow:hidden] [border-radius:9999px] [background-color:#1e293b]"><div className="[height:100%] [background-color:#8ceaff]" style={{ width: `${state.evaOxygenPercent}%` }} /></div>
            {state.evaOxygenPercent <= 20 && <div className="[margin-top:5px] [font-size:9px] [font-weight:bold] [color:#ffb16d]">{state.evaOxygenPercent <= 0 ? "OXYGEN DEPLETED" : "LOW OXYGEN RESERVE"}</div>}
          </section>

          <section className="[position:absolute] [top:6%] [right:5%] [width:220px] [clip-path:polygon(0_0,92%_0,100%_18%,100%_82%,14%_100%,0_76%)] [border:1px_solid_rgba(85,_205,_232,_0.72)] [background:linear-gradient(245deg,_rgba(8,_25,_36,_0.84),_rgba(14,_27,_36,_0.63))] [padding:12px_18px_14px_20px] [color:#d9f5fa] font-mono [text-shadow:0_1px_4px_#000]">
            <div className="[display:flex] [align-items:center] [justify-content:flex-end] [gap:12px]"><div className="[text-align:right]"><div className="[font-size:10px] [letter-spacing:0.12em] [color:#aee7f1]">SUIT POWER · SIM</div><div className="[font-size:22px] [font-weight:bold]">{state.evaBatteryPercent.toFixed(1)}%</div></div><div className="[display:grid] [height:40px] [width:40px] [place-items:center] [font-size:30px] [color:#82e8ff]">ϟ</div></div>
            <div className="[margin-top:8px] [height:6px] [overflow:hidden] [border-radius:9999px] [background-color:#1e293b]"><div className="[height:100%] [background-color:#8ceaff]" style={{ width: `${state.evaBatteryPercent}%` }} /></div>
            {state.evaBatteryPercent <= 20 && <div className="[margin-top:5px] [text-align:right] [font-size:9px] [font-weight:bold] [color:#ffb16d]">{state.evaBatteryPercent <= 0 ? "SUIT POWER DEPLETED" : "LOW SUIT POWER"}</div>}
          </section>

          <div className="[position:absolute] [top:7%] [left:50%] [width:min(440px,36vw)] [transform:translateX(-50%)] [border-bottom:1px_solid_rgba(116,_216,_239,_0.48)] [background:linear-gradient(180deg,_rgba(6,_18,_24,_0.58),_transparent)] [padding:5px_14px_12px] [color:#bdeef8] text-[10px] font-mono [text-shadow:0_1px_4px_#000]">
            <div className="[display:flex] [justify-content:space-between] [gap:12px]">{compassPoints.map((point, index) => <span key={point} className={index === compassIndex ? "[color:#ffffff] [font-weight:bold] [text-shadow:0_0_8px_#67dfff]" : "[color:#8abac8]"}>{point}</span>)}</div>
            <div className="[margin-top:4px] [text-align:center] [color:#73e2ff]">▲ {compassDirection} · {String(state.evaHeadingDegrees).padStart(3, "0")}°</div>
          </div>

          <section className="[position:absolute] [top:29%] [right:5%] [min-width:150px] [border:1px_solid_rgba(92,_211,_239,_0.62)] [border-radius:10px_2px_10px_2px] [background:rgba(7,_21,_29,_0.68)] [padding:10px_12px] [color:#d4f2f7] text-[10px] font-mono [text-shadow:0_1px_4px_#000]">
            <div className="[margin-bottom:8px] [font-weight:bold] [letter-spacing:0.12em] [color:#81e7ff]">ENVIRONMENT</div>
            <div className="[display:flex] [justify-content:space-between] [gap:20px]"><span>TEMP</span><span>NO FEED</span></div>
            <div className="[margin-top:4px] [display:flex] [justify-content:space-between] [gap:20px]"><span>TERRAIN Y</span><span>{state.evaTerrainElevation === null ? "—" : `${state.evaTerrainElevation.toFixed(1)} m`}</span></div>
            <div className="[margin-top:4px] [display:flex] [justify-content:space-between] [gap:20px]"><span>WIND</span><span>NO FEED</span></div>
            <div className="[margin-top:8px] [text-align:right] [font-size:8px] [color:#e1ae7d]">SCENE DATA ONLY</div>
          </section>

          <section className="[position:absolute] [top:47%] [left:5%] [border:1px_solid_rgba(92,_211,_239,_0.58)] [border-radius:2px_14px_2px_14px] [background:rgba(7,_21,_29,_0.68)] [padding:10px_14px] [color:#d4f2f7] font-mono [text-shadow:0_1px_4px_#000]">
            <div className="[display:flex] [align-items:center] [gap:12px]"><span className="[font-size:30px] [color:#8cef91]">⬡</span><div><div className="[font-size:9px] [letter-spacing:0.1em]">SUIT STATUS</div><div className="[font-size:14px] [font-weight:bold] [color:#8cef91]">OPERATIONAL</div><div className="[font-size:8px] [color:#9fbcc4]">PREPARATION CONFIRMED</div></div></div>
          </section>

          <section className="[position:absolute] [bottom:9%] [left:5%] [min-width:190px] [border:1px_solid_rgba(92,_211,_239,_0.58)] [border-radius:16px_2px_2px_16px] [background:rgba(7,_21,_29,_0.66)] [padding:8px_14px] [color:#d4f2f7] font-mono [text-shadow:0_1px_4px_#000]">
            <div className="[display:flex] [align-items:center] [gap:12px]"><svg viewBox="0 0 32 32" className="[height:36px] [width:36px] [color:#82e8ff]" aria-hidden="true"><path d="M18 2 7 18h8l-1 12 11-17h-8z" fill="currentColor"/></svg><div><div className="[font-size:9px] [letter-spacing:0.1em]">MOVEMENT</div><div className="[font-size:15px] [font-weight:bold] [color:#8cef91]">{state.evaMovementState === "IDLE" ? "STATIONARY" : state.evaMovementState}</div></div></div>
          </section>

          <section className="[position:absolute] [right:5%] [bottom:7%] [display:grid] [height:128px] [width:128px] [place-items:center] [border:1px_solid_rgba(69,_207,_242,_0.78)] [border-radius:50%] [background:radial-gradient(circle,_rgba(17,_57,_70,_0.35),_rgba(4,_15,_20,_0.72))] [color:#a9edfa] [box-shadow:0_0_18px_rgba(59,_198,_235,_0.22)]" aria-label={`Local orientation display, heading ${compassDirection}`}>
            <div className="[position:absolute] [height:96px] [width:96px] [border-radius:9999px] [border:1px_solid_rgba(73,_197,_227,_0.42)]"/><div className="[position:absolute] [height:64px] [width:64px] [border-radius:9999px] [border:1px_solid_rgba(73,_197,_227,_0.3)]"/>
            <span className="[position:absolute] [top:8px] [font-size:8px]">N</span><span className="[font-size:9px] [color:#72e6ff]">▲</span><div className="[position:absolute] [bottom:-18px] [font-size:8px] [letter-spacing:0.12em]">LOCAL ORIENTATION</div>
          </section>

          <div className="[position:absolute] [bottom:1.8%] [left:50%] [transform:translateX(-50%)] [text-align:center] [text-shadow:0_1px_5px_#000]">
            <div className="font-kdam-thmor-pro [font-size:16px] [font-weight:bold] [letter-spacing:0.14em] [color:#9deeff]">PHOBOSIA</div>
            <div className="[font-size:8px] [letter-spacing:0.24em] [color:#b9eaf3]">MARS EXPLORATION</div>
          </div>
        </div>
      )}

      {/* 2. PERSISTENT IN-GAME HUD */}
      <div className="[position:fixed] [inset:0] [pointer-events:none] [color:#dce8ec] [font-size:13px] [text-shadow:0_1px_3px_rgba(0,_0,_0,_0.9)] [z-index:30]">
        {!state.droneModeActive && !state.sol5DroneActive && !state.evaSuitActive && <div className="[position:absolute] [top:0px] [left:10px] [letter-spacing:0.22em] [font-size:14px] [font-weight:bold] [color:#e88747]">  <img className="[width:min(200px,_74vw)] top-0 [height:auto] [object-fit:contain]" src={getPreparedAssetUrl("/assets/images/PHOBOSIA_Martian_Modern_Logo_4K.png")} alt="PHOBOSIA" /></div>}
        {!state.droneModeActive && !state.sol5DroneActive && !state.evaSuitActive && <div className="[position:absolute] [top:42px] [left:24px] [font-size:12px] [letter-spacing:0.1em] [color:#8da6b2]">ACTIVE MODULE · {state.module}</div>}

        {/* Mission Status Badge */}
        {!state.droneModeActive && !state.sol5DroneActive && !state.evaSuitActive && (
          <div className="[position:absolute] rounded-2xl [top:72px] [left:24px] [width:min(500px,_86vw)] bg-gradient-to-r from-[rgba(0,10,50,0.85)] via-[rgba(4,79,129,0.85)] to-[rgba(0,10,50,0.85)] [border:1px_solid_rgba(63,_105,_123,_0.6)] [border-left:3px_solid_#e88747] [padding:10px_14px] [backdrop-filter:blur(4px)]">
            <div className="[display:flex] [align-items:center] [gap:6px] text-[15px] font-kdam-thmor-pro font-bold [letter-spacing:0.12em] [color:#e88747]">
              <span className="[width:6px] [height:6px] [border-radius:50%] [background:#55cde8] [box-shadow:0_0_6px_#55cde8] [animation:pulse_2s_infinite_ease-in-out]" />
              SOL {state.missionDay} · {state.missionTitle.toUpperCase()}
            </div>
            <div className="[margin:6px_0_8px] [font-size:16px] [line-height:1.35] font-dm-sans font-light [color:#eaf3f5]">{state.objectiveTitle}</div>
            <div className="[width:100%] [height:4px] [background:rgba(255,_255,_255,_0.1)] [border-radius:2px] [overflow:hidden]">
              <div
                className="[height:100%] [background:linear-gradient(90deg,_#e88747,_#55cde8)] [transition:width_0.3s_ease]"
                style={{
                  width: `${Math.round((state.completedStepCount / Math.max(state.totalStepCount, 1)) * 100)}%`
                }}
              />
            </div>
            <div className="[margin-top:6px] text-[11px] font-mono [color:#87a4af]">
              {state.completedStepCount} / {state.totalStepCount} {"TASKS COMPLETED"}
              {state.objectiveState === "completed" && state.totalStepCount > 0 && state.completedStepCount >= state.totalStepCount && (
                <span className="[color:#44d788] [font-weight:bold]"> — OBJECTIVE VALIDATED (REST IN HABITAT)</span>
              )}
            </div>
          </div>
        )}

        {state.navigationInstruction && !state.droneModeActive && !state.sol5DroneActive && (!state.evaSuitActive || state.missionDay === 8 || state.missionDay === 9 || state.missionDay === 10 || state.missionDay === 11) && (
          <section className="[position:absolute] [top:72px] [right:24px] [z-index:30] [width:min(500px,_86vw)] [max-height:calc(100vh_-_310px)] [overflow-y:auto] rounded-2xl [background:linear-gradient(110deg,_rgba(0,_10,_50,_0.88),_rgba(4,_79,_129,_0.88),_rgba(0,_10,_50,_0.88))] [border:1px_solid_rgba(63,_105,_123,_0.7)] [border-left:3px_solid_#e88747] [padding:12px_14px] [box-shadow:0_8px_24px_rgba(0,_0,_0,_0.35)]" aria-live="polite">
            <div className="[display:flex] [align-items:center] [gap:7px] text-[10px] font-dm-sans [font-weight:bold] [letter-spacing:0.13em] [color:#55cde8]">
              <span className="[width:5px] [height:5px] [border-radius:50%] [background:#55cde8] [box-shadow:0_0_6px_#55cde8]" />
              {state.navigationInstruction.isCompletion ? "SOL OBJECTIVE COMPLETE" : "NEXT MISSION ACTIVITY"}
            </div>
            <div className="[margin-top:6px] font-kdam-thmor-pro font-bold [font-size:20px] [font-weight:600] [line-height:1.3] [color:#f0f6f7]">{state.navigationInstruction.title}</div>
            {state.navigationInstruction.destinationName && <div className="[margin-top:5px] [font-size:12px] font-bricolage-grotesque [font-weight:600] [color:#e6a36e]">{state.navigationInstruction.destinationName}</div>}
            {state.navigationInstruction.message && <div className="[margin-top:4px] [font-size:12px] [line-height:1.4] [color:#d7e6eb]">{state.navigationInstruction.message}</div>}
            {state.navigationInstruction.guidance && <div className="[margin-top:4px] [font-size:11px] [line-height:1.45] [color:#a9c0ca]">{state.navigationInstruction.guidance}</div>}
            {state.navigationInstruction.activity && <div className="[margin-top:6px] [font-size:11px] [line-height:1.4] [color:#eaf3f5]"><span className="[color:#55cde8]">ACTION</span> · {state.navigationInstruction.activity}</div>}
          </section>
        )}

        {/* Standard Reticle (only when not in drone mode) */}
        {!state.droneModeActive && !state.sol5DroneActive && <div className="[position:absolute] [left:50%] [top:50%] [transform:translate(-50%,_-50%)] [font-size:22px] [color:rgba(220,_235,_240,_0.6)]">+</div>}

        {/* Contextual Interaction Prompt */}
        {state.prompt && <div className="[position:absolute] [bottom:68px] [left:50%] [transform:translateX(-50%)] [background:rgba(14,_29,_39,_0.92)] [border:1px_solid_#55cde8] [box-shadow:0_4px_20px_rgba(0,_0,_0,_0.6)] [padding:10px_18px] [font-weight:500] [letter-spacing:0.05em] [color:#f1f7f9] [border-radius:2px]">{state.prompt}</div>}

        {/* Event Notification Toast */}
        {state.notification && state.notification !== state.navigationInstruction?.notification && (
          <div className="[position:absolute] [top:24px] [left:50%] [z-index:30] [transform:translateX(-50%)] [background:rgba(16,_35,_48,_0.92)] [border:1px_solid_#44d788] [padding:8px_16px] [display:flex] [align-items:center] [gap:10px] [box-shadow:0_4px_24px_rgba(0,_0,_0,_0.7)] [animation:slideDown_0.3s_ease]">
            <div className="text-[10px] font-bold font-mono [color:#44d788] [letter-spacing:0.14em]">MISSION EVENT</div>
            <div className="[font-size:13px] [color:#eaf2f4]">{state.notification}</div>
          </div>
        )}

        {!state.droneModeActive && !state.sol5DroneActive && !state.roverActive && !state.evaSuitActive && <div className="[position:absolute] [bottom:22px] [left:24px] [color:#8aa0a8] [font-size:12px] [letter-spacing:0.04em]">{state.controlHint}</div>}
        {state.roverActive && <section aria-label="Terrain Rover controls" className="[position:fixed] [left:24px] [bottom:24px] [z-index:22] [min-width:230px] [border:1px_solid_rgba(85,_205,_232,_0.35)] [background:rgba(5,_13,_20,_0.88)] [padding:12px_15px] [color:#d8e8ee] font-mono [box-shadow:0_8px_28px_rgba(0,_0,_0,_0.35)]"><div className="[color:#55cde8] [font-size:10px] [letter-spacing:0.2em]">TERRAIN ROVER</div><div className="[margin-top:6px] [font-size:18px]">{Math.abs(state.roverSpeed).toFixed(1)} <span className="[font-size:10px] [color:#91aab4]">M/S</span></div><div className="[margin-top:3px] [font-size:10px] [color:#c99a66]">{state.roverView} VIEW</div><div className="[margin-top:8px] [font-size:10px] [color:#91aab4]">W/S DRIVE · A/D STEER · SPACE BRAKE<br/>C CAMERA · R EXIT · E EXIT WHEN STOPPED</div></section>}

        {state.error && !state.transition && <div className="[position:absolute] [top:70px] [left:24px] [color:#ffb08b] [max-width:480px]">{state.error}</div>}

        {!state.ready && (
          <div className="[position:absolute] [inset:0] [display:grid] [place-items:center] [background:rgba(5,_9,_13,_0.75)] [pointer-events:auto]">
            <button className="[background:#d8763b] [border:0] [padding:14px_26px] [color:#071016] [font-weight:bold] [font-size:14px] [letter-spacing:0.1em] [cursor:pointer]"
              onClick={e => {
                e.stopPropagation();
                game.current?.lock();
              }}
            >
              ENTER HABITAT
            </button>
          </div>
        )}

        {/* 2B. DAY 1 CAMERA PRESENTATION OVERLAY BANNER */}
        {state.cameraPresentation && (
          <div className="[position:fixed] [inset:0] [z-index:50] [pointer-events:none] [display:flex] [flex-direction:column] [justify-content:space-between] [animation:presentationFadeIn_0.4s_ease-out_forwards]" aria-live="polite">
            <div className="[width:100%] [height:60px] [background:rgba(0,_0,_0,_0.75)] [backdrop-filter:blur(4px)] top" />
            <div className="[margin:auto_auto_40px_auto] [max-width:680px] [width:90%]  bg-gradient-to-r from-[rgba(0,10,50,0.85)] via-[rgba(1,50,83,0.85)] to-[rgba(0,10,50,0.85)] [border:1px_solid_rgba(85,_205,_232,_0.4)] [border-radius:12px] [padding:20px_24px] [box-shadow:0_16px_36px_rgba(0,_0,_0,_0.6),_0_0_24px_rgba(85,_205,_232,_0.15)] [backdrop-filter:blur(12px)] [display:flex] [flex-direction:column] [gap:10px] [pointer-events:auto]">
              <div className="[display:flex] [flex-direction:column] [gap:4px]">
                <span className="[font-size:10px] [letter-spacing:0.08em] [font-weight:700] [color:#55cde8] [text-transform:uppercase]">DAY 1 · OUTPOST ORIENTATION</span>
                <h2 className="[margin:0] font-kdam-thmor-pro font-bold [font-size:24px] font- [font-weight:600] [letter-spacing:0.04em] [color:#ffffff]">{state.cameraPresentation.title}</h2>
              </div>
              <p className="[margin:0] [font-size:14px] font-dm-sans [line-height:1.5] [color:#c0d2dc]">{state.cameraPresentation.description}</p>
              <div className="[display:flex] [align-items:center] [gap:8px] [margin-top:4px] [font-size:12px] [color:#8da4b4] [letter-spacing:0.05em] [text-transform:uppercase]">
                <span className="[display:inline-block] [padding:2px_7px] [background:rgba(85,_205,_232,_0.15)] [border:1px_solid_rgba(85,_205,_232,_0.5)] [border-radius:4px] [color:#55cde8] [font-weight:700] [font-size:11px]">ENTER</span> Skip Presentation
              </div>
            </div>
            <div className="[width:100%] [height:60px] [background:rgba(0,_0,_0,_0.75)] [backdrop-filter:blur(4px)] bottom" />
          </div>
        )}

        {/* 3. CINEMATIC CAMERA APPROACH OVERLAY */}
        {state.showCinematicOverlay && (
          <div className="[position:fixed] [inset:0] [z-index:55] [pointer-events:auto] [display:flex] [align-items:center] [justify-content:center]" aria-hidden="true">
            <div className="[position:absolute] [inset:0] [background:#000] [animation:cinematicFadeIn_0.55s_cubic-bezier(0.4,_0,_0.2,_1)_forwards]" />
            <div className="[position:relative] [z-index:2] [width:260px] [height:140px] [display:flex] [align-items:center] [justify-content:center]">
              <span className="[position:absolute] [width:16px] [height:16px] [border:2px_solid_#55cde8] [top:0] [left:0] [border-right:none] [border-bottom:none]" />
              <span className="[position:absolute] [width:16px] [height:16px] [border:2px_solid_#55cde8] [top:0] [right:0] [border-left:none] [border-bottom:none]" />
              <span className="[position:absolute] [width:16px] [height:16px] [border:2px_solid_#55cde8] [bottom:0] [left:0] [border-right:none] [border-top:none]" />
              <span className="[position:absolute] [width:16px] [height:16px] [border:2px_solid_#55cde8] [bottom:0] [right:0] [border-left:none] [border-top:none]" />
              <div className="text-[12px] font-bold font-mono [color:#55cde8] [letter-spacing:0.16em] [text-shadow:0_0_10px_rgba(85,_205,_232,_0.8)] [animation:cinematicPulse_0.4s_infinite_alternate_ease-in-out]">ALIGNING DISPLAY TERMINAL...</div>
            </div>
          </div>
        )}

        {/* 3B. PHOBOSIA OS FULLSCREEN DESKTOP */}
        {state.showOSDesktop && (
          <PhobosiaOS
            game={game.current}
            state={state}
            onClose={() => game.current?.closeOSDesktop()}
            initialApp={state.osInitialApp}
          />
        )}

        {laptopAudio && laptopAudioSnapshot && (
          <PersonalLaptopOS
            open={state.showPersonalLaptop}
            onClose={() => game.current?.closePersonalLaptop()}
            audio={laptopAudio}
            audioSnapshot={laptopAudioSnapshot}
          />
        )}

        {/* Legacy 2D Panel Fallback */}
        {state.panel && (
          <section className="[pointer-events:auto] [position:absolute] [right:5vw] [top:14vh] [width:min(440px,_90vw)] [background:rgba(9,_19,_26,_0.95)] [border:1px_solid_#3f697b] [padding:24px] [box-shadow:0_8px_40px_rgba(0,_0,_0,_0.85)] [backdrop-filter:blur(8px)]">
            <div className="[color:#e88747] text-[11px] font-bold font-mono [letter-spacing:0.12em]">SIMULATED DATA</div>
            <h2 className="[margin:4px_0_10px] [color:#e88747] [font-size:18px] [font-weight:600]">{state.panel}</h2>
            <p className="[line-height:1.5] [color:#c7d5d8] [font-size:13px]">
              Local observational telemetry is operational. Subsystem sensor values reflect simulated scientific
              readings for Outpost evaluation.
            </p>
            <div className="[margin-top:18px]">
              <button className="[background:#d8763b] [color:#071016] [border:0] [padding:10px_18px] [font-weight:bold] [letter-spacing:0.06em] [cursor:pointer] [border-radius:2px] [transition:background_0.15s_ease] hover:[background:#e88747]" onClick={() => game.current?.closePanel()}>Close interface [ESC]</button>
            </div>
          </section>
        )}

        {/* 4. SHARED MISSION BRIEFING MODAL */}
        {state.showBriefingModal && (
          <div className="[position:fixed] [inset:0] [background:rgba(4,_8,_12,_0.78)] [backdrop-filter:blur(6px)] [display:grid] [place-items:center] [pointer-events:auto] [z-index:30]">
            <section className="[background:#091722] [border:1px_solid_#477287] [box-shadow:0_16px_60px_rgba(0,_0,_0,_0.95)] [padding:28px_32px] [max-width:min(600px,_92vw)] [width:100%] briefing-modal">
              <div>
                <span className="[color:#e88747] text-[11px] font-bold font-mono [letter-spacing:0.12em]">NASA SPACE APPS 2026 · EXPEDITION BRIEFING</span>
                <h2 className="[margin:6px_0_16px] [color:#eaf4f7] [font-size:20px] [font-weight:600] [letter-spacing:0.03em]">SOL 0{state.missionDay} — {state.missionTitle}</h2>
              </div>
              <div className="[color:#c0d3db] [font-size:14px] [line-height:1.55]">
                <p className="[margin:0_0_18px] [color:#d8e6eb]">{state.briefingText}</p>
                <div className="[background:rgba(16,_36,_48,_0.9)] [border-left:3px_solid_#e88747] [padding:12px_16px] [margin-bottom:16px]">
                  <span className="[display:block] text-[10px] font-bold font-mono [letter-spacing:0.12em] [color:#e88747] [margin-bottom:4px]">PRIMARY SCIENTIFIC OBJECTIVE</span>
                  <div className="[color:#ffffff] [font-weight:500]">{state.primaryObjective}</div>
                </div>
                <div className="[background:rgba(10,_22,_30,_0.6)] [padding:10px_14px] [border:1px_dashed_#304e5e] [font-size:12px] [color:#92abb6]">
                  <span className="[display:block] text-[10px] font-bold font-mono [color:#55cde8] [margin-bottom:2px]">CONTROLS REFERENCE</span>
                  <span>W, A, S, D walk · Shift jog · Space jump · E inspect/travel · Esc unlock</span>
                </div>
              </div>
              <div className="[margin-top:24px] [display:flex] [justify-content:flex-end] [gap:12px]">
                <button
                  className="[background:#d8763b] [color:#071016] [border:0] [padding:10px_18px] [font-weight:bold] [letter-spacing:0.06em] [cursor:pointer] [border-radius:2px] [transition:background_0.15s_ease] hover:[background:#e88747] hover:[background:#e88747]"
                  onClick={e => {
                    e.stopPropagation();
                    game.current?.dismissBriefing();
                  }}
                >
                  BEGIN SOL 0{state.missionDay} MISSION [ENTER]
                </button>
              </div>
            </section>
          </div>
        )}

        {/* 5. DAY 5 MASTER TERRAIN ROUTE PLANNING MODAL */}
        {state.showRoutePlanning && (
          <div className="[position:fixed] [inset:0] [background:rgba(4,_8,_12,_0.78)] [backdrop-filter:blur(6px)] [display:grid] [place-items:center] [pointer-events:auto] [z-index:30]">
            <section className="[background:#091722] [border:1px_solid_#477287] [box-shadow:0_16px_60px_rgba(0,_0,_0,_0.95)] [padding:28px_32px] [max-width:min(600px,_92vw)] [width:100%] [max-width:min(780px,_94vw)]">
              <div>
                <span className="[color:#e88747] text-[11px] font-bold font-mono [letter-spacing:0.12em]">MISSION CONTROL TACTICAL CARTOGRAPHY</span>
                <h2 className="[margin:6px_0_16px] [color:#eaf4f7] [font-size:20px] [font-weight:600] [letter-spacing:0.03em]">SOL 05 — Master Terrain Survey Route Planning</h2>
              </div>
              <div className="[color:#c0d3db] [font-size:14px] [line-height:1.55] route-body">
                <p>
                  Review the Master Terrain observation candidates below. Select your survey site to confirm the route
                  plan for upcoming surface sorties.
                </p>
                <div className="[display:flex] [flex-direction:column] [gap:10px] [margin-top:14px]">
                  {MASTER_TERRAIN_TARGETS.map(t => {
                    const isSelected = selectedTarget === t.id;
                    return (
                      <div
                        key={t.id}
                        className={`[background:rgba(13,_29,_39,_0.8)] [border:1px_solid_#335467] [padding:12px_16px] [cursor:pointer] [transition:all_0.15s_ease] ${isSelected ? "border border-[#44d788] bg-[rgba(16,46,38,0.7)] shadow-[inset_0_0_12px_rgba(68,215,136,0.2)]" : ""} hover:[border-color:#55cde8] hover:[background:rgba(18,_40,_54,_0.9)]`}
                        onClick={() => setSelectedTarget(t.id)}
                      >
                        <div className="[display:flex] [justify-content:space-between] [align-items:center] [margin-bottom:4px]">
                          <span className="[font-weight:600] [color:#ffffff] [font-size:14px]">{t.name}</span>
                          <span className={`text-[10px] font-bold font-mono px-[6px] py-[2px] rounded-[2px] tracking-[0.08em] ${t.hazardRating.toLowerCase() === "low" ? "border border-[#44d788] bg-[rgba(68,215,136,0.2)] text-[#44d788]" : t.hazardRating.toLowerCase() === "moderate" ? "border border-[#f1b344] bg-[rgba(241,179,68,0.2)] text-[#f1b344]" : "border border-[#e88747] bg-[rgba(232,135,71,0.2)] text-[#e88747]"}`}>
                            {t.hazardRating} Hazard
                          </span>
                        </div>
                        <div className="[font-size:12px] [color:#a4c0cb] [margin-bottom:6px]">{t.description}</div>
                        <div className="[display:flex] [gap:16px] text-[11px] font-mono [color:#6d8e9d]">
                          <span>Est. Distance: {t.distanceEstimate}</span>
                          <span>Coords: [{t.coordinates.x}, {t.coordinates.z}]</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="[margin-top:24px] [display:flex] [justify-content:flex-end] [gap:12px]">
                <button
                  className="[background:transparent] [color:#b0c9d3] [border:1px_solid_#4a6d7f] [padding:10px_18px] [font-weight:bold] [letter-spacing:0.06em] [cursor:pointer] [border-radius:2px] hover:[border-color:#8db5c8] hover:[color:#ffffff] hover:[border-color:#8db5c8] hover:[color:#ffffff]"
                  onClick={e => {
                    e.stopPropagation();
                    game.current?.closeRoutePlanning();
                  }}
                >
                  Cancel [ESC]
                </button>
                <button
                  className="[background:#d8763b] [color:#071016] [border:0] [padding:10px_18px] [font-weight:bold] [letter-spacing:0.06em] [cursor:pointer] [border-radius:2px] [transition:background_0.15s_ease] hover:[background:#e88747] hover:[background:#e88747]"
                  onClick={e => {
                    e.stopPropagation();
                    game.current?.selectRouteTarget(selectedTarget);
                  }}
                >
                  Confirm & Save Route Plan
                </button>
              </div>
            </section>
          </div>
        )}

        {/* 6. DAY 6 GEOLOGICAL FIELD OBSERVATION MODAL */}
        {state.showGeologicalForm && (
          <div className="[position:fixed] [inset:0] [background:rgba(4,_8,_12,_0.78)] [backdrop-filter:blur(6px)] [display:grid] [place-items:center] [pointer-events:auto] [z-index:30]">
            <section className="[background:#091722] [border:1px_solid_#477287] [box-shadow:0_16px_60px_rgba(0,_0,_0,_0.95)] [padding:28px_32px] [max-width:min(600px,_92vw)] [width:100%] [max-width:min(840px,_94vw)]">
              {state.missionDay === 6 ? <Sol6FieldCapture
                targetName={MASTER_TERRAIN_TARGETS.find(target => target.id === game.current?.missionManager.getSelectedSiteId())?.name ?? null}
                observationDone={game.current?.missionManager.isStepComplete("SOL06_COMPLETE_FIELD_OBSERVATIONS") ?? false}
                onObservation={data => game.current?.submitSol6FieldObservation(data)}
                onSample={container => game.current?.collectSol6Sample(container)}
                onCancel={() => game.current?.closeGeologicalForm()}
              /> : <>
              <div>
                <span className="[color:#e88747] text-[11px] font-bold font-mono [letter-spacing:0.12em]">OUTDOOR SURFACE SCIENCE · SOL 06</span>
                <h2 className="[margin:6px_0_16px] [color:#eaf4f7] [font-size:20px] [font-weight:600] [letter-spacing:0.03em]">Geological Field Observation</h2>
              </div>
              <div className="[color:#c0d3db] [font-size:14px] [line-height:1.55]">
                <div className="[background:rgba(14,_34,_48,_0.85)] [border:1px_solid_#32586e] [padding:10px_14px] [margin-bottom:16px] [font-size:13px] [display:flex] [align-items:center] [gap:8px] [flex-wrap:wrap]">
                  <span>RECORDING TARGET:</span>{" "}
                  <strong className="[color:#55cde8]">{state.selectedRouteTargetId ? "Confirmed Route Target" : "Site Alpha — Crater Rim Ridge"}</strong>
                  <span className="text-[10px] font-bold font-mono [color:#e88747] [margin-left:auto]">[SIMULATED OBSERVATION DATA]</span>
                </div>

                <div className="[display:grid] [grid-template-columns:1fr_1fr] [gap:14px]">
                  <div className="[display:flex] [flex-direction:column] [gap:6px]">
                    <label className="text-[11px] font-mono [color:#8daab8] [letter-spacing:0.05em] [text-transform:uppercase]">Surface Texture</label>
                    <select className="[background:#08151f] [border:1px_solid_#2d4c5e] [color:#e8f2f5] [padding:9px_12px] [font-size:13px] [outline:none] [transition:border-color_0.15s_ease] focus:[border-color:#55cde8]" value={geoTexture} onChange={e => setGeoTexture(e.target.value)}>
                      <option value="Vesicular Basalt & Fractured Regolith">Vesicular Basalt & Fractured Regolith</option>
                      <option value="Fine-Grained Aeolian Silt Layer">Fine-Grained Aeolian Silt Layer</option>
                      <option value="Indurated Sulfate-Bearing Crust">Indurated Sulfate-Bearing Crust</option>
                      <option value="Polygonal Desiccation Pattern">Polygonal Desiccation Pattern</option>
                    </select>
                  </div>

                  <div className="[display:flex] [flex-direction:column] [gap:6px]">
                    <label className="text-[11px] font-mono [color:#8daab8] [letter-spacing:0.05em] [text-transform:uppercase]">Rock & Fragment Distribution</label>
                    <select className="[background:#08151f] [border:1px_solid_#2d4c5e] [color:#e8f2f5] [padding:9px_12px] [font-size:13px] [outline:none] [transition:border-color_0.15s_ease] focus:[border-color:#55cde8]" value={geoDistribution} onChange={e => setGeoDistribution(e.target.value)}>
                      <option value="Scattered Angular Clasts (< 5 cm)">Scattered Angular Clasts (&lt; 5 cm)</option>
                      <option value="Dense Boulder Field with Impact Ejecta">Dense Boulder Field with Impact Ejecta</option>
                      <option value="Uniform Fine Pebble Dispersion">Uniform Fine Pebble Dispersion</option>
                      <option value="Isolated Perched Mega-Blocks">Isolated Perched Mega-Blocks</option>
                    </select>
                  </div>

                  <div className="[display:flex] [flex-direction:column] [gap:6px]">
                    <label className="text-[11px] font-mono [color:#8daab8] [letter-spacing:0.05em] [text-transform:uppercase]">Terrain Shape or Slope</label>
                    <select className="[background:#08151f] [border:1px_solid_#2d4c5e] [color:#e8f2f5] [padding:9px_12px] [font-size:13px] [outline:none] [transition:border-color_0.15s_ease] focus:[border-color:#55cde8]" value={geoShape} onChange={e => setGeoShape(e.target.value)}>
                      <option value="Low-Angle Talus Incline (8–12°)">Low-Angle Talus Incline (8–12°)</option>
                      <option value="Steep Escarpment Rim Flank">Steep Escarpment Rim Flank</option>
                      <option value="Depression Basin with Sinuous Rilles">Depression Basin with Sinuous Rilles</option>
                      <option value="Planar Bedrock Pavement">Planar Bedrock Pavement</option>
                    </select>
                  </div>

                  <div className="[display:flex] [flex-direction:column] [gap:6px]">
                    <label className="text-[11px] font-mono [color:#8daab8] [letter-spacing:0.05em] [text-transform:uppercase]">Dust Coverage</label>
                    <select className="[background:#08151f] [border:1px_solid_#2d4c5e] [color:#e8f2f5] [padding:9px_12px] [font-size:13px] [outline:none] [transition:border-color_0.15s_ease] focus:[border-color:#55cde8]" value={geoDust} onChange={e => setGeoDust(e.target.value)}>
                      <option value="Thin Mantle (< 2 mm) with High Rock Exposure">Thin Mantle (&lt; 2 mm) with High Rock Exposure</option>
                      <option value="Moderate Dust Drift with Saltation Ripples">Moderate Dust Drift with Saltation Ripples</option>
                      <option value="Thick Atmospheric Fallout Layer">Thick Atmospheric Fallout Layer</option>
                      <option value="Wind-Scoured Dust-Free Outcrop">Wind-Scoured Dust-Free Outcrop</option>
                    </select>
                  </div>

                  <div className="[display:flex] [flex-direction:column] [gap:6px] [grid-column:1_/_-1]">
                    <label className="text-[11px] font-mono [color:#8daab8] [letter-spacing:0.05em] [text-transform:uppercase]">Potential Follow-Up Area of Interest</label>
                    <input className="[background:#08151f] [border:1px_solid_#2d4c5e] [color:#e8f2f5] [padding:9px_12px] [font-size:13px] [outline:none] [transition:border-color_0.15s_ease] focus:[border-color:#55cde8]"
                      type="text"
                      value={geoInterest}
                      onChange={e => setGeoInterest(e.target.value)}
                      placeholder="e.g. Stratified ejecta layer near ridge crest"
                    />
                  </div>
                </div>
              </div>
              <div className="[margin-top:24px] [display:flex] [justify-content:flex-end] [gap:12px]">
                <button
                  className="[background:transparent] [color:#b0c9d3] [border:1px_solid_#4a6d7f] [padding:10px_18px] [font-weight:bold] [letter-spacing:0.06em] [cursor:pointer] [border-radius:2px] hover:[border-color:#8db5c8] hover:[color:#ffffff] hover:[border-color:#8db5c8] hover:[color:#ffffff]"
                  onClick={e => {
                    e.stopPropagation();
                    game.current?.closeGeologicalForm();
                  }}
                >
                  Cancel [ESC]
                </button>
                <button
                  className="[background:#d8763b] [color:#071016] [border:0] [padding:10px_18px] [font-weight:bold] [letter-spacing:0.06em] [cursor:pointer] [border-radius:2px] [transition:background_0.15s_ease] hover:[background:#e88747] hover:[background:#e88747]"
                  onClick={e => {
                    e.stopPropagation();
                    game.current?.submitGeologicalForm({
                      targetId: state.selectedRouteTargetId || "TARGET_ALPHA_CRATER_RIM",
                      observedCategories: {
                        surfaceTexture: geoTexture,
                        fragmentDistribution: geoDistribution,
                        terrainShape: geoShape,
                        dustCoverage: geoDust,
                        followUpInterest: geoInterest
                      },
                      summary: `Sol 06 Survey: ${geoTexture}; ${geoDistribution}; ${geoDust}.`
                    });
                  }}
                >
                  Confirm & Save Geological Record
                </button>
              </div>
              </>}
            </section>
          </div>
        )}

        {/* 7. DAY 7 SURFACE OBSERVATION MODAL */}
        {state.showSurfaceObservationForm && (
          <div className="[position:fixed] [inset:0] [background:rgba(4,_8,_12,_0.78)] [backdrop-filter:blur(6px)] [display:grid] [place-items:center] [pointer-events:auto] [z-index:30]">
            <section className="[background:#091722] [border:1px_solid_#477287] [box-shadow:0_16px_60px_rgba(0,_0,_0,_0.95)] [padding:28px_32px] [max-width:min(600px,_92vw)] [width:100%] [max-width:min(840px,_94vw)]">
              <div>
                <span className="[color:#e88747] text-[11px] font-bold font-mono [letter-spacing:0.12em]">SURFACE FEATURE OBSERVATION · SOL 07</span>
                <h2 className="[margin:6px_0_16px] [color:#eaf4f7] [font-size:20px] [font-weight:600] [letter-spacing:0.03em]">Mars Surface Observation Scan</h2>
              </div>
              <div className="[color:#c0d3db] [font-size:14px] [line-height:1.55]">
                <div className="[background:rgba(14,_34,_48,_0.85)] [border:1px_solid_#32586e] [padding:10px_14px] [margin-bottom:16px] [font-size:13px] [display:flex] [align-items:center] [gap:8px] [flex-wrap:wrap]">
                  <span>OBSERVATION TARGET:</span> <strong className="[color:#55cde8]">Site Beta — Dune Basin Depression</strong>
                  <span className="text-[10px] font-bold font-mono [color:#e88747] [margin-left:auto]">[DATA STORED FOR SOL 08 LAB ANALYSIS]</span>
                </div>

                <div className="[display:grid] [grid-template-columns:1fr_1fr] [gap:14px]">
                  <div className="[display:flex] [flex-direction:column] [gap:6px]">
                    <label className="text-[11px] font-mono [color:#8daab8] [letter-spacing:0.05em] [text-transform:uppercase]">Visible Surface Pattern</label>
                    <select className="[background:#08151f] [border:1px_solid_#2d4c5e] [color:#e8f2f5] [padding:9px_12px] [font-size:13px] [outline:none] [transition:border-color_0.15s_ease] focus:[border-color:#55cde8]" value={surfPattern} onChange={e => setSurfPattern(e.target.value)}>
                      <option value="Laminated Bedding & Cross-Stratification">Laminated Bedding & Cross-Stratification</option>
                      <option value="Concentric Impact Deformation Rings">Concentric Impact Deformation Rings</option>
                      <option value="Aeolian Megaripples with Coarse Crests">Aeolian Megaripples with Coarse Crests</option>
                      <option value="Columnar Jointing in Basalt Flow">Columnar Jointing in Basalt Flow</option>
                    </select>
                  </div>

                  <div className="[display:flex] [flex-direction:column] [gap:6px]">
                    <label className="text-[11px] font-mono [color:#8daab8] [letter-spacing:0.05em] [text-transform:uppercase]">Surface & Fragment Appearance</label>
                    <select className="[background:#08151f] [border:1px_solid_#2d4c5e] [color:#e8f2f5] [padding:9px_12px] [font-size:13px] [outline:none] [transition:border-color_0.15s_ease] focus:[border-color:#55cde8]" value={surfAppearance} onChange={e => setSurfAppearance(e.target.value)}>
                      <option value="Dark Iron-Magnesium Silicate Matrix">Dark Iron-Magnesium Silicate Matrix</option>
                      <option value="Oxidized Hematite Spherule Encrustation">Oxidized Hematite Spherule Encrustation</option>
                      <option value="Hydrated Sulfate Intergranular Cement">Hydrated Sulfate Intergranular Cement</option>
                      <option value="Glassy Impactite Vitrification Veneer">Glassy Impactite Vitrification Veneer</option>
                    </select>
                  </div>

                  <div className="[display:flex] [flex-direction:column] [gap:6px]">
                    <label className="text-[11px] font-mono [color:#8daab8] [letter-spacing:0.05em] [text-transform:uppercase]">Local Terrain Profile</label>
                    <select className="[background:#08151f] [border:1px_solid_#2d4c5e] [color:#e8f2f5] [padding:9px_12px] [font-size:13px] [outline:none] [transition:border-color_0.15s_ease] focus:[border-color:#55cde8]" value={surfProfile} onChange={e => setSurfProfile(e.target.value)}>
                      <option value="Undulating Dune Swale Transition">Undulating Dune Swale Transition</option>
                      <option value="Sub-horizontal Bedrock Platform">Sub-horizontal Bedrock Platform</option>
                      <option value="Micro-graben Depression Valley">Micro-graben Depression Valley</option>
                      <option value="Radial Ejecta Apron Margin">Radial Ejecta Apron Margin</option>
                    </select>
                  </div>

                  <div className="[display:flex] [flex-direction:column] [gap:6px]">
                    <label className="text-[11px] font-mono [color:#8daab8] [letter-spacing:0.05em] [text-transform:uppercase]">Feature Worth Revisiting</label>
                    <select className="[background:#08151f] [border:1px_solid_#2d4c5e] [color:#e8f2f5] [padding:9px_12px] [font-size:13px] [outline:none] [transition:border-color_0.15s_ease] focus:[border-color:#55cde8]" value={surfArea} onChange={e => setSurfArea(e.target.value)}>
                      <option value="High-reflectance mineralized vein">High-reflectance mineralized vein</option>
                      <option value="Aeolian sediment trap boundary">Aeolian sediment trap boundary</option>
                      <option value="Eroded crater terrace contact">Eroded crater terrace contact</option>
                      <option value="Desiccation fissure junction">Desiccation fissure junction</option>
                    </select>
                  </div>

                  <div className="[display:flex] [flex-direction:column] [gap:6px] [grid-column:1_/_-1]">
                    <label className="text-[11px] font-mono [color:#8daab8] [letter-spacing:0.05em] [text-transform:uppercase]">Question for Laboratory Analysis</label>
                    <select className="[background:#08151f] [border:1px_solid_#2d4c5e] [color:#e8f2f5] [padding:9px_12px] [font-size:13px] [outline:none] [transition:border-color_0.15s_ease] focus:[border-color:#55cde8]" value={surfQuestion} onChange={e => setSurfQuestion(e.target.value)}>
                      <option value="Does the sulfate veneer indicate transient aqueous deposition?">
                        Does the sulfate veneer indicate transient aqueous deposition?
                      </option>
                      <option value="Is cross-stratification driven by prevailing wind or impact surge?">
                        Is cross-stratification driven by prevailing wind or impact surge?
                      </option>
                      <option value="Do hematite spherules correlate with sub-surface brine migration?">
                        Do hematite spherules correlate with sub-surface brine migration?
                      </option>
                      <option value="What is the relative age of the cross-cutting fracture network?">
                        What is the relative age of the cross-cutting fracture network?
                      </option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="[margin-top:24px] [display:flex] [justify-content:flex-end] [gap:12px]">
                <button
                  className="[background:transparent] [color:#b0c9d3] [border:1px_solid_#4a6d7f] [padding:10px_18px] [font-weight:bold] [letter-spacing:0.06em] [cursor:pointer] [border-radius:2px] hover:[border-color:#8db5c8] hover:[color:#ffffff] hover:[border-color:#8db5c8] hover:[color:#ffffff]"
                  onClick={e => {
                    e.stopPropagation();
                    game.current?.closeSurfaceObservationForm();
                  }}
                >
                  Cancel [ESC]
                </button>
                <button
                  className="[background:#d8763b] [color:#071016] [border:0] [padding:10px_18px] [font-weight:bold] [letter-spacing:0.06em] [cursor:pointer] [border-radius:2px] [transition:background_0.15s_ease] hover:[background:#e88747] hover:[background:#e88747]"
                  onClick={e => {
                    e.stopPropagation();
                    game.current?.submitSurfaceObservationForm({
                      targetId: "TARGET_BETA_DUNE_BASIN",
                      observedCategories: {
                        surfacePattern: surfPattern,
                        surfaceMaterialAppearance: surfAppearance,
                        terrainProfile: surfProfile,
                        areaOfInterest: surfArea
                      },
                      followUpQuestion: surfQuestion,
                      summary: `Sol 07 Surface Observation: ${surfPattern}; ${surfAppearance}; ${surfArea}.`
                    });
                  }}
                >
                  Save Surface Observation Record
                </button>
              </div>
            </section>
          </div>
        )}

        {/* 8. DAY 8 RESEARCH LAB ANALYSIS MODAL */}
        {state.showScienceAnalysisModal && (
          <div className="[position:fixed] [inset:0] [background:rgba(4,_8,_12,_0.78)] [backdrop-filter:blur(6px)] [display:grid] [place-items:center] [pointer-events:auto] [z-index:30]">
            <section className="[background:#091722] [border:1px_solid_#477287] [box-shadow:0_16px_60px_rgba(0,_0,_0,_0.95)] [padding:28px_32px] [max-width:min(600px,_92vw)] [width:100%] [max-width:min(840px,_94vw)] [max-width:min(920px,_96vw)]">
              <div>
                <span className="[color:#e88747] text-[11px] font-bold font-mono [letter-spacing:0.12em]">RESEARCH LAB ANALYSIS CONSOLE · SOL 08</span>
                <h2 className="[margin:6px_0_16px] [color:#eaf4f7] [font-size:20px] [font-weight:600] [letter-spacing:0.03em]">Scientific Observation Analysis & Synthesis</h2>
              </div>
              <div className="[color:#c0d3db] [font-size:14px] [line-height:1.55]">
                <div className="[display:grid] [grid-template-columns:1fr_1fr] [gap:16px] [margin-bottom:18px]">
                  {/* Source Day 7 Record Panel */}
                  <div className="[background:rgba(10,_24,_34,_0.85)] [border:1px_solid_#284758] [padding:14px]">
                    <h3 className="text-[12px] font-bold font-mono [color:#55cde8] [margin:0_0_10px_0] [letter-spacing:0.08em]">1. SOURCE OBSERVATION (SOL 07)</h3>
                    {state.surfaceObservation ? (
                      <div className="[display:flex] [flex-direction:column] [gap:8px]">
                        <div className="[display:flex] [justify-content:space-between] [font-size:12px] [border-bottom:1px_solid_rgba(40,_71,_88,_0.4)] [padding-bottom:4px]">
                          <span className="[color:#799ba9] [font-family:monospace]">Record ID:</span>
                          <span className="[color:#e8f1f4] [text-align:right] [max-width:65%] [font-family:monospace] [font-size:11px] [color:#55cde8]">{state.surfaceObservation.id}</span>
                        </div>
                        <div className="[display:flex] [justify-content:space-between] [font-size:12px] [border-bottom:1px_solid_rgba(40,_71,_88,_0.4)] [padding-bottom:4px]">
                          <span className="[color:#799ba9] [font-family:monospace]">Pattern:</span>
                          <span className="[color:#e8f1f4] [text-align:right] [max-width:65%]">{state.surfaceObservation.observedCategories.surfacePattern}</span>
                        </div>
                        <div className="[display:flex] [justify-content:space-between] [font-size:12px] [border-bottom:1px_solid_rgba(40,_71,_88,_0.4)] [padding-bottom:4px]">
                          <span className="[color:#799ba9] [font-family:monospace]">Matrix:</span>
                          <span className="[color:#e8f1f4] [text-align:right] [max-width:65%]">{state.surfaceObservation.observedCategories.surfaceMaterialAppearance}</span>
                        </div>
                        <div className="[display:flex] [justify-content:space-between] [font-size:12px] [border-bottom:1px_solid_rgba(40,_71,_88,_0.4)] [padding-bottom:4px]">
                          <span className="[color:#799ba9] [font-family:monospace]">Profile:</span>
                          <span className="[color:#e8f1f4] [text-align:right] [max-width:65%]">{state.surfaceObservation.observedCategories.terrainProfile}</span>
                        </div>
                        <div className="[display:flex] [justify-content:space-between] [font-size:12px] [border-bottom:1px_solid_rgba(40,_71,_88,_0.4)] [padding-bottom:4px]">
                          <span className="[color:#799ba9] [font-family:monospace]">Focus:</span>
                          <span className="[color:#e8f1f4] [text-align:right] [max-width:65%]">{state.surfaceObservation.observedCategories.areaOfInterest}</span>
                        </div>
                        <div className="[display:flex] [justify-content:space-between] [font-size:12px] [border-bottom:1px_solid_rgba(40,_71,_88,_0.4)] [padding-bottom:4px]">
                          <span className="[color:#799ba9] [font-family:monospace]">Question:</span>
                          <span className="[color:#e8f1f4] [text-align:right] [max-width:65%] [color:#f1b344] [font-style:italic]">{state.surfaceObservation.followUpQuestion}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="[padding:12px] [background:rgba(232,_135,_71,_0.15)] [border:1px_solid_#e88747] [color:#e88747] [font-size:12px]">No saved Day 7 surface observation found.</div>
                    )}
                  </div>

                  {/* Day 6 Geological Comparison Panel */}
                  <div className="[background:rgba(10,_24,_34,_0.85)] [border:1px_solid_#284758] [padding:14px]">
                    <h3 className="text-[12px] font-bold font-mono [color:#55cde8] [margin:0_0_10px_0] [letter-spacing:0.08em]">2. GEOLOGICAL COMPARISON (SOL 06)</h3>
                    {state.geologicalSurvey ? (
                      <div className="[display:flex] [flex-direction:column] [gap:8px]">
                        <div className="[display:flex] [justify-content:space-between] [font-size:12px] [border-bottom:1px_solid_rgba(40,_71,_88,_0.4)] [padding-bottom:4px]">
                          <span className="[color:#799ba9] [font-family:monospace]">Survey ID:</span>
                          <span className="[color:#e8f1f4] [text-align:right] [max-width:65%] [font-family:monospace] [font-size:11px] [color:#55cde8]">{state.geologicalSurvey.id}</span>
                        </div>
                        <div className="[display:flex] [justify-content:space-between] [font-size:12px] [border-bottom:1px_solid_rgba(40,_71,_88,_0.4)] [padding-bottom:4px]">
                          <span className="[color:#799ba9] [font-family:monospace]">Texture:</span>
                          <span className="[color:#e8f1f4] [text-align:right] [max-width:65%]">{state.geologicalSurvey.observedCategories.surfaceTexture}</span>
                        </div>
                        <div className="[display:flex] [justify-content:space-between] [font-size:12px] [border-bottom:1px_solid_rgba(40,_71,_88,_0.4)] [padding-bottom:4px]">
                          <span className="[color:#799ba9] [font-family:monospace]">Fragments:</span>
                          <span className="[color:#e8f1f4] [text-align:right] [max-width:65%]">{state.geologicalSurvey.observedCategories.fragmentDistribution}</span>
                        </div>
                        <div className="[display:flex] [justify-content:space-between] [font-size:12px] [border-bottom:1px_solid_rgba(40,_71,_88,_0.4)] [padding-bottom:4px]">
                          <span className="[color:#799ba9] [font-family:monospace]">Dust:</span>
                          <span className="[color:#e8f1f4] [text-align:right] [max-width:65%]">{state.geologicalSurvey.observedCategories.dustCoverage}</span>
                        </div>
                        <div className="[display:flex] [justify-content:space-between] [font-size:12px] [border-bottom:1px_solid_rgba(40,_71,_88,_0.4)] [padding-bottom:4px]">
                          <span className="[color:#799ba9] [font-family:monospace]">Correlation:</span>
                          <span className="[color:#e8f1f4] [text-align:right] [max-width:65%] [border-color:#44d788] [color:#44d788]">Compatible basaltic aeolian deflation sequence</span>
                        </div>
                      </div>
                    ) : (
                      <div className="[padding:12px] [background:rgba(85,_205,_232,_0.1)] [border:1px_solid_#336177] [color:#9ac2d2] [font-size:12px]">Sol 06 geological survey record unavailable. Proceeding with single-source observation analysis.</div>
                    )}
                  </div>
                </div>

                {/* Predefined Cautious Interpretations */}
                <div>
                  <h3 className="text-[12px] font-bold font-mono [color:#e88747] [margin:0_0_10px_0] [letter-spacing:0.08em]">3. SELECT SCIENTIFIC INTERPRETATION</h3>
                  <div className="[display:flex] [flex-direction:column] [gap:8px]">
                    {PREDEFINED_INTERPRETATIONS.map(i => {
                      const isSelected = selectedInterpretation === i.id;
                      return (
                        <div
                          key={i.id}
                          className={`[background:rgba(13,_29,_39,_0.85)] [border:1px_solid_#2d4e61] [padding:10px_14px] [cursor:pointer] [transition:all_0.15s_ease] ${isSelected ? "border border-[#44d788] bg-[rgba(16,46,38,0.7)] shadow-[inset_0_0_10px_rgba(68,215,136,0.2)]" : ""} hover:[border-color:#55cde8] hover:[background:rgba(18,_40,_54,0.95)]`}
                          onClick={() => setSelectedInterpretation(i.id)}
                        >
                          <div className="[display:flex] [justify-content:space-between] [align-items:center] [margin-bottom:4px]">
                            <span className="[font-weight:600] [color:#ffffff] [font-size:13px]">{i.label}</span>
                            <span className="text-[10px] font-bold font-mono [padding:2px_6px] [background:rgba(85,_205,_232,_0.2)] [color:#55cde8] [border:1px_solid_#55cde8]">{i.claimStrength} Interpretation</span>
                          </div>
                          <div className="[font-size:12px] [color:#9cb9c6]">{i.description}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="[margin-top:24px] [display:flex] [justify-content:flex-end] [gap:12px]">
                <button
                  className="[background:transparent] [color:#b0c9d3] [border:1px_solid_#4a6d7f] [padding:10px_18px] [font-weight:bold] [letter-spacing:0.06em] [cursor:pointer] [border-radius:2px] hover:[border-color:#8db5c8] hover:[color:#ffffff] hover:[border-color:#8db5c8] hover:[color:#ffffff]"
                  onClick={e => {
                    e.stopPropagation();
                    game.current?.closeScienceAnalysisModal();
                  }}
                >
                  Cancel [ESC]
                </button>
                <button
                  className="[background:#d8763b] [color:#071016] [border:0] [padding:10px_18px] [font-weight:bold] [letter-spacing:0.06em] [cursor:pointer] [border-radius:2px] [transition:background_0.15s_ease] hover:[background:#e88747] hover:[background:#e88747]"
                  disabled={!state.surfaceObservation}
                  onClick={e => {
                    e.stopPropagation();
                    const interp = PREDEFINED_INTERPRETATIONS.find(i => i.id === selectedInterpretation);
                    game.current?.submitScienceAnalysis(
                      selectedInterpretation,
                      `Analysis of ${state.surfaceObservation?.id}: ${interp?.label}. (${interp?.claimStrength} simulated interpretation).`
                    );
                  }}
                >
                  Confirm & Save Scientific Analysis
                </button>
              </div>
            </section>
          </div>
        )}

        {/* 9. DAY 9 REMOTE DRONE SURVEY CONSOLE MODAL */}
        {state.showDroneConsoleModal && (
          <div className="[position:fixed] [inset:0] [background:rgba(4,_8,_12,_0.78)] [backdrop-filter:blur(6px)] [display:grid] [place-items:center] [pointer-events:auto] [z-index:30]">
            <section className="[background:#091722] [border:1px_solid_#477287] [box-shadow:0_16px_60px_rgba(0,_0,_0,_0.95)] [padding:28px_32px] [max-width:min(600px,_92vw)] [width:100%] [max-width:min(720px,_92vw)]">
              <div>
                <span className="[color:#e88747] text-[11px] font-bold font-mono [letter-spacing:0.12em]">MISSION CONTROL DRONE OPERATIONS · SOL 09</span>
                <h2 className="[margin:6px_0_16px] [color:#eaf4f7] [font-size:20px] [font-weight:600] [letter-spacing:0.03em]">Scout Drone 01 Remote Operations Terminal</h2>
              </div>
              <div className="[color:#c0d3db] [font-size:14px] [line-height:1.55]">
                <div className="[background:rgba(12,_28,_38,_0.9)] [border:1px_solid_#33596f] [padding:14px] [margin-bottom:16px]">
                  <div className="[display:flex] [align-items:center] [gap:8px] [font-size:13px] [color:#55cde8] [margin-bottom:12px]">
                    <span className="h-[6px] w-[6px] rounded-full bg-[#44d788] shadow-[0_0_8px_#44d788]" />
                    <strong>DRONE TELEMETRY UPLINK: CONNECTED (8.4 GHz X-BAND)</strong>
                  </div>
                  <div className="[display:grid] [grid-template-columns:1fr_1fr] [gap:8px] text-[12px] font-mono [color:#8daab8]">
                    <div>Status: <strong className="[color:#e8f1f4]">STANDBY AT LAUNCH ANCHOR</strong></div>
                    <div>Battery: <strong className="[color:#e8f1f4]">88% NOMINAL</strong></div>
                    <div>Signal: <strong className="[color:#e8f1f4]">96% (12 ms LATENCY)</strong></div>
                    <div>Target Sector: <strong className="[color:#e8f1f4]">SITE GAMMA CANYON ESCARPMENT</strong></div>
                  </div>
                </div>

                <div>
                  <h3 className="text-[11px] font-bold font-mono [color:#e88747] [letter-spacing:0.08em] [margin:0_0_8px_0]">REMOTE FPV FLIGHT CONTROLS</h3>
                  <div className="[display:grid] [grid-template-columns:1fr_1fr] [gap:6px] [font-size:12px] [color:#c4dce6] [background:rgba(8,_18,_26,_0.7)] [padding:10px] [border:1px_solid_#1f3b4c]">
                    <span><strong className="[color:#55cde8]">W / S:</strong> Pitch forward / backward</span>
                    <span><strong className="[color:#55cde8]">A / D:</strong> Yaw left / right</span>
                    <span><strong className="[color:#55cde8]">Space:</strong> Ascend altitude</span>
                    <span><strong className="[color:#55cde8]">Left Shift:</strong> Descend altitude</span>
                    <span><strong className="[color:#55cde8]">C Key:</strong> Capture survey telemetry</span>
                    <span><strong className="[color:#55cde8]">Escape:</strong> Disengage FPV and return</span>
                  </div>
                </div>
              </div>
              <div className="[margin-top:24px] [display:flex] [justify-content:flex-end] [gap:12px]">
                <button
                  className="[background:transparent] [color:#b0c9d3] [border:1px_solid_#4a6d7f] [padding:10px_18px] [font-weight:bold] [letter-spacing:0.06em] [cursor:pointer] [border-radius:2px] hover:[border-color:#8db5c8] hover:[color:#ffffff] hover:[border-color:#8db5c8] hover:[color:#ffffff]"
                  onClick={e => {
                    e.stopPropagation();
                    game.current?.closeDroneConsoleModal();
                  }}
                >
                  Cancel [ESC]
                </button>
                <button
                  className="[background:#d8763b] [color:#071016] [border:0] [padding:10px_18px] [font-weight:bold] [letter-spacing:0.06em] [cursor:pointer] [border-radius:2px] [transition:background_0.15s_ease] hover:[background:#e88747] [background:#e88747] [color:#071016] [font-weight:bold] hover:[background:#e88747]"
                  onClick={e => {
                    e.stopPropagation();
                    void game.current?.startDroneFPV();
                  }}
                >
                  Engage Remote Drone FPV View
                </button>
              </div>
            </section>
          </div>
        )}

        {/* 10. DAY 9 DRONE FPV HUD OVERLAY */}
        {state.droneModeActive && (
          <div className="[position:absolute] [inset:0] [pointer-events:none] [display:flex] [flex-direction:column] [justify-content:space-between] [padding:24px_32px] [z-index:25]">
            {/* Top Telemetry Bar */}
            <div className="[display:flex] [justify-content:space-between] [align-items:center] [background:rgba(5,_14,_20,_0.85)] [border:1px_solid_#32596f] [padding:10px_18px] [pointer-events:auto]">
              <div className="[display:flex] [align-items:center] [gap:10px]">
                <span className="[width:10px] [height:10px] [border-radius:50%] [background:#e84747] [box-shadow:0_0_8px_#e84747] [animation:pulse-dot_1s_infinite_alternate]" />
                <span className="text-[14px] font-bold font-mono [color:#e8f1f4] [letter-spacing:0.08em]">DRONE FPV — REMOTE CONTROL [SCOUT 01]</span>
              </div>
              <div className="[display:flex] [gap:20px] text-[12px] font-mono [color:#55cde8]">
                <span>BATTERY: {state.droneTelemetry.battery}%</span>
                <span>SIGNAL: {state.droneTelemetry.signal}%</span>
                <span>ALTITUDE: {state.droneTelemetry.altitude} m</span>
                <span>COORDS: [{state.droneTelemetry.x}, {state.droneTelemetry.z}]</span>
              </div>
                <div>SIMULATED DRONE TELEMETRY</div>
            </div>

            {/* Flight Crosshair / Artificial Horizon */}
            <div className="[align-self:center] [position:relative] [width:200px] [height:160px] [pointer-events:none]">
              <div className="[position:absolute] [top:50%] [left:0] [right:0] [height:1px] [background:rgba(85,_205,_232,_0.4)]" />
              <div className="[position:absolute] [left:50%] [top:0] [bottom:0] [width:1px] [background:rgba(85,_205,_232,_0.4)]" />
              <div className="[position:absolute] [bottom:-40px] [left:50%] [transform:translateX(-50%)] [text-align:center] [white-space:nowrap]">
                <div />
                <span className="text-[11px] font-bold font-mono [color:#f1b344] [letter-spacing:0.08em] [background:rgba(0,_0,_0,_0.7)] [padding:3px_8px] [border:1px_solid_rgba(241,_179,_68,_0.4)]">TARGET SECTOR: SITE GAMMA ESCARPMENT</span>
              </div>
            </div>

            {/* Bottom Controls & Capture Bar */}
            <div className="[display:flex] [justify-content:space-between] [align-items:center] [background:rgba(5,_14,_20,_0.85)] [border:1px_solid_#32596f] [padding:10px_18px] [pointer-events:auto]">
              <div className="text-[12px] font-mono [color:#8ba8b5]">
                <span>W/A/S/D to fly · Space ascend · Shift descend</span>
              </div>
              <div className="[display:flex] [gap:12px]">
                <button
                  className="[background:#e88747] [border:1px_solid_#e88747] [color:#071016] text-[12px] font-bold font-mono [padding:8px_16px] [cursor:pointer] [letter-spacing:0.05em] [transition:all_0.15s_ease] hover:[background:#ff9b57] hover:[background:#ff9b57]"
                  onClick={e => {
                    e.stopPropagation();
                    game.current?.captureDroneSurvey();
                  }}
                >
                  {state.droneSurvey ? "Update Survey Record [C]" : "Capture Remote Survey [C]"}
                </button>
                <button
                  className="[background:transparent] [border:1px_solid_#3d687f] [color:#e8f1f4] text-[12px] font-mono [padding:8px_16px] [cursor:pointer] [letter-spacing:0.05em] [transition:all_0.15s_ease] hover:[border-color:#55cde8] hover:[color:#55cde8] hover:[border-color:#55cde8] hover:[color:#55cde8]"
                  onClick={e => {
                    e.stopPropagation();
                    game.current?.exitDroneFPV();
                  }}
                >
                  Exit Drone FPV [ESC]
                </button>
              </div>
            </div>
          </div>
        )}

        {state.sol5DroneActive && state.sol5Telemetry && (
          <div className="[position:fixed] [inset:0] [z-index:25] [display:flex] [flex-direction:column] [justify-content:space-between] [padding:12px] [pointer-events:none] text-[11px] font-mono text-[#d9eef2] sm:[padding:22px]" aria-label="Sol 5 simulated drone flight HUD">
            <div className="[display:flex] [flex-wrap:wrap] [justify-content:space-between] [gap:12px] [border:1px_solid_#32596f] [background:rgba(5,_14,_20,_0.88)] [padding:10px_14px] [pointer-events:auto]">
              <div><div className="[color:#55cde8] [font-weight:bold] [letter-spacing:0.1em]">SOL 05 · MANUAL AERIAL RECONNAISSANCE · SIMULATED</div><div className="[margin-top:4px] [color:#e8f1f4]">{state.sol5Telemetry.targetName} · {state.sol5Telemetry.targetId}</div><div className="[margin-top:4px] [color:#89d9e7]">{state.sol5Telemetry.status}</div></div>
              <div className="[display:grid] [grid-template-columns:repeat(4,_auto)] [gap:6px_14px] [color:#a9c6d0]">
                <span>BAT {state.sol5Telemetry.batteryPercent}%</span><span>LINK {state.sol5Telemetry.signalPercent}%*</span><span>AGL {state.sol5Telemetry.altitudeAglM.toFixed(1)} / 10 m</span><span>SPD {state.sol5Telemetry.speedMps.toFixed(1)} m/s</span>
                <span>TRAVEL {state.sol5Telemetry.distanceTravelledM.toFixed(1)} m</span><span>HOME {state.sol5Telemetry.distanceFromTakeoffM.toFixed(1)} m</span><span>TARGET {state.sol5Telemetry.distanceToTargetM.toFixed(1)} m</span><span>TIME {Math.floor(state.sol5Telemetry.elapsedSeconds / 60)}:{String(Math.floor(state.sol5Telemetry.elapsedSeconds % 60)).padStart(2, "0")}</span>
              </div>
            </div>
            <div className="[align-self:center] [display:grid] [place-items:center] [width:180px] [height:140px] [border:1px_solid_rgba(85,_205,_232,_0.26)] [background:rgba(4,_12,_18,_0.24)] [pointer-events:none]">
              <div className="[font-size:28px] [color:#61d3e7]" style={{ transform: `rotate(${state.sol5Telemetry.targetBearingDegrees - state.sol5Telemetry.headingDegrees}deg)` }}>↑</div>
              <div className="[font-size:9px] [color:#c1d8df]">TARGET BEARING {state.sol5Telemetry.targetBearingDegrees.toFixed(0)}°</div>
            </div>
            <div className="[display:flex] [flex-wrap:wrap] [align-items:center] [justify-content:space-between] [gap:12px] [border:1px_solid_#32596f] [background:rgba(5,_14,_20,_0.91)] [padding:10px_14px] [pointer-events:auto]">
              <div className="[max-width:650px] [line-height:1.65] [color:#9cb8c2]">{state.sol5Telemetry.status === "LANDED" ? "LANDING VALIDATED · Mission complete; returning to Mission Control." : <>W/S forward/back · A/D lateral · E ascend · Q descend · Shift boost · mouse look · 1 front · 2 rear · 3 left · 4 right · 5 down · Esc abort<br/>VIEW {state.sol5Telemetry.cameraView.toUpperCase()} · PREPARED EVIDENCE {state.sol5Telemetry.evidenceCount} · BOUNDARY {state.sol5Telemetry.boundaryStatus} · *SIMULATED LINK</>}</div>
              <div className="[display:flex] [flex-wrap:wrap] [gap:6px]">
                {state.sol5Telemetry.status === "LANDED" ? <button onClick={() => game.current?.abortSol5Flight()} className="rounded border border-[#704337] px-3 py-1 text-[9px] text-[#e6b99c] hover:bg-[#271b16]">ABORT · ESC</button> : <>{(["front", "rear", "left", "right", "down"] as const).map((view, index) => <button key={view} onClick={() => game.current?.setSol5Camera(view)} className="rounded border border-[#355766] px-2 py-1 text-[9px] text-[#bde1e8] hover:bg-[#142a34]">{index + 1} {view.toUpperCase()}</button>)}<button onClick={() => game.current?.abortSol5Flight()} className="rounded border border-[#704337] px-3 py-1 text-[9px] text-[#e6b99c] hover:bg-[#271b16]">ABORT · ESC</button></>}
              </div>
              <div className="w-full text-right text-[10px] text-[#e6b27e]">{state.sol5Telemetry.warning ?? state.sol5Message ?? "Mission systems nominal within simulated limits."}</div>
            </div>
          </div>
        )}

        {state.sol5LandingPromptActive && <div className="[position:fixed] [left:50%] [bottom:115px] [z-index:30] [transform:translateX(-50%)] [border:1px_solid_#55cde8] [background:rgba(5,_14,_20,_0.96)] [padding:12px_22px] [text-align:center] [box-shadow:0_4px_20px_rgba(0,_0,_0,_0.6)] [pointer-events:none]" role="status" aria-live="polite"><div className="font-kdam-thmor-pro [font-size:16px] [font-weight:bold] [letter-spacing:0.12em] [color:#55cde8]">LAND DRONE</div><div className="font-dm-sans [margin-top:4px] [font-size:13px] [color:#f1f7f9]">Press L key to land</div></div>}

        {/* 11. REST / DAY ADVANCE FEEDBACK MODAL */}
        {state.restFeedback && (
          <div className="[position:fixed] [inset:0] [background:rgba(4,_8,_12,_0.78)] [backdrop-filter:blur(6px)] [display:grid] [place-items:center] [pointer-events:auto] [z-index:30]">
            <section className={`bg-[#091722] border shadow-[0_16px_60px_rgba(0,0,0,0.95)] p-[28px_32px] max-w-[min(600px,92vw)] max-h-[86vh] overflow-y-auto w-full ${state.restFeedback.type === "blocked" ? "border-[#e88747]" : "border-[#44d788]"}`}>
              <div>
                <span className="[color:#e88747] text-[11px] font-bold font-mono [letter-spacing:0.12em]">
                  {state.missionDay === 10 && state.restFeedback.type === "success" ? "MISSION CONTROL · SOL 10 BEGUN" : state.missionDay === 9 && state.restFeedback.type === "success" ? "MISSION CONTROL · SOL 9 COMPLETE" : state.restFeedback.type === "blocked" ? "REST PROTOCOL RESTRICTED" : "HABITAT REST CYCLE"}
                </span>
                <h2 className="[margin:6px_0_16px] [color:#eaf4f7] [font-size:20px] [font-weight:600] [letter-spacing:0.03em]">{state.missionDay === 10 && state.restFeedback.type === "success" ? "Sol 10 Final Verification Started" : state.missionDay === 9 && state.restFeedback.type === "success" ? "Sol 9 Mission Complete" : state.restFeedback.type === "blocked" ? "Objective Incomplete" : "Rest Period Verified"}</h2>
              </div>
              <div className="[color:#c0d3db] [font-size:14px] [line-height:1.55]">
                <p>{state.restFeedback.message}</p>
                {!!state.restFeedback.missingTasks?.length && (
                  <ul className="[margin:14px_0_0] [padding-left:20px] [display:flex] [flex-direction:column] [gap:7px]">
                    {state.restFeedback.missingTasks.map(task => (
                      <li key={`${task.zone}-${task.title}`}>
                        {task.title}{task.zone ? ` — ${task.zone}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="[margin-top:24px] [display:flex] [justify-content:flex-end] [gap:12px]">
                <button
                  className="[background:#d8763b] [color:#071016] [border:0] [padding:10px_18px] [font-weight:bold] [letter-spacing:0.06em] [cursor:pointer] [border-radius:2px] [transition:background_0.15s_ease] hover:[background:#e88747] hover:[background:#e88747]"
                  onClick={e => {
                    e.stopPropagation();
                    game.current?.dismissRestFeedback();
                  }}
                >
                  Acknowledge [ENTER]
                </button>
              </div>
            </section>
          </div>
        )}

        {state.restTransition && (
          <div aria-hidden="true" className="[position:fixed] [inset:0] [z-index:80] [pointer-events:all] [display:grid] [place-items:center] [background:#000] [transition:opacity_900ms_ease-in-out]" style={{ opacity: state.restTransition === "out" ? 1 : 0 }}>
            <span className="font-kdam-thmor-pro [color:#a6bdc8] [font-size:12px] [letter-spacing:0.22em]">CREW REST CYCLE · HABITAT</span>
          </div>
        )}

        {/* 12. LOADING SCREEN */}
        {state.transition === "loading" && (
          <section className="[position:fixed] [z-index:50] [inset:0] [pointer-events:auto] [background:#000] [color:#eaf2f4] [display:flex] [align-items:center] [justify-content:center] [flex-direction:column] [text-align:center] [text-shadow:none] loading">
            <img className="[width:min(440px,_74vw)] [height:auto] [object-fit:contain]" src={getPreparedAssetUrl("/assets/images/PHOBOSIA_Martian_Modern_Logo_4K.png")} alt="PHOBOSIA" />
            <p className="[margin:20px_0_8px] [letter-spacing:0.08em] [font-size:14px]">Loading {state.transitionLabel}...</p>
            <strong className="[font-size:28px] [font-weight:500] [color:#e88747]">{state.transitionProgress === null ? "Preparing…" : `${state.transitionProgress}%`}</strong>
          </section>
        )}

        {/* 13. DESTINATION TRANSITION VIDEO */}
        {state.transition === "video" && (
          <section className="[position:fixed] [z-index:50] [inset:0] [pointer-events:auto] [background:#000] [color:#eaf2f4] [display:flex] [align-items:center] [justify-content:center] [flex-direction:column] [text-align:center] [text-shadow:none] video">
            <video className="[width:100%] [height:100%] [object-fit:contain] [background:#000]"
              ref={video}
              src={game.current?.transitionVideo()}
              muted
              playsInline
              onEnded={() => game.current?.videoFinished()}
              onError={() =>
                game.current?.videoFailed("The transition video could not be loaded. You can continue to the destination.")
              }
            />
            <p className="[margin:20px_0_8px] [letter-spacing:0.08em] [font-size:14px] [position:absolute] [bottom:28px] [left:50%] [transform:translateX(-50%)] [margin:0] [padding:7px_12px] [background:rgba(0,_0,_0,_0.8)] [border:1px_solid_rgba(85,_205,_232,_0.3)] [color:#e7f1f4] text-[12px] font-mono">Press ENTER to skip</p>
          </section>
        )}

        {/* 14. TRANSITION ERROR */}
        {state.transition === "error" && (
          <section className="[position:fixed] [z-index:50] [inset:0] [pointer-events:auto] [background:#000] [color:#eaf2f4] [display:flex] [align-items:center] [justify-content:center] [flex-direction:column] [text-align:center] [text-shadow:none] failure">
            <img className="[width:min(440px,_74vw)] [height:auto] [object-fit:contain]" src={getPreparedAssetUrl("/assets/images/PHOBOSIA_Martian_Modern_Logo_4K.png")} alt="PHOBOSIA" />
            <p className="[margin:20px_0_8px] [letter-spacing:0.08em] [font-size:14px] [max-width:min(520px,_85vw)] [line-height:1.5]">{state.error}</p>
            <div className="[display:flex] [gap:10px] [margin-top:14px]">
              <button className="[border:1px_solid_#d8763b] [background:#d8763b] [color:#071016] [padding:9px_16px] [font-weight:bold] [cursor:pointer]" onClick={() => game.current?.retryTransition()}>Retry</button>
              <button className="[border:1px_solid_#d8763b] [background:transparent] [color:#e8f1f4] [padding:9px_16px] [font-weight:bold] [cursor:pointer]" onClick={() => game.current?.continueWithoutVideo()}>Continue</button>
            </div>
          </section>
        )}

        <div className="[position:absolute] [right:16px] [bottom:16px] [color:#829aa2] text-[11px] font-mono [text-align:right]">
          WebGL {state.ready ? "ready" : "loading"} · {state.fps} fps · Sol {state.missionDay}
        </div>
      </div>
    </div>
  );
}
