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
  totalStepCount: 22,
  dayBriefingSeen: false,
  showBriefingModal: true,
  briefingText:
    "Welcome to Mars Outpost PHOBOSIA. Before commencing scientific field observations, explore the base, inspect each operational zone and system console, and complete the Day 1 orientation checklist.",
  primaryObjective: "Explore the outpost, inspect all 22 operational displays and consoles across all modules, and complete the orientation checklist.",
  controlHint: "W A S D move · Shift jog · Space jump · E interact · Esc unlock",
  isOutdoorTerrain: false,
  showRoutePlanning: false,
  selectedRouteTargetId: null,
  notification: null,
  restFeedback: null,

  geologicalSurvey: null,
  surfaceObservation: null,
  scienceAnalysis: null,
  droneSurvey: null,

  showGeologicalForm: false,
  showSurfaceObservationForm: false,
  showScienceAnalysisModal: false,
  showDroneConsoleModal: false,

  droneModeActive: false,
  droneTelemetry: { battery: 88, signal: 96, altitude: 15, x: 470, z: -58.7 },

  showCinematicOverlay: false,
  showOSDesktop: false,
  osInitialApp: undefined,
  cameraPresentation: null
};

export function GameViewport() {
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<Game | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<GameState>(initialState);

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
    if (!host.current) return;
    const instance = new Game(host.current, setState);
    game.current = instance;
    void instance.start();
    return () => instance.dispose();
  }, []);

  useEffect(() => {
    if (state.transition !== "video" || !video.current) return;
    const element = video.current;
    element.currentTime = 0;
    void element.play().catch(() =>
      game.current?.videoFailed("The transition video could not start. You can continue to the destination.")
    );
  }, [state.transition]);

  const canClickToLock =
    !state.panel &&
    !state.transition &&
    !state.showBriefingModal &&
    !state.showRoutePlanning &&
    !state.showGeologicalForm &&
    !state.showSurfaceObservationForm &&
    !state.showScienceAnalysisModal &&
    !state.showDroneConsoleModal &&
    !state.droneModeActive &&
    !state.restFeedback &&
    !state.showCinematicOverlay &&
    !state.showOSDesktop &&
    !state.cameraPresentation;

  return (
    <div id="game" ref={host} onClick={() => canClickToLock && game.current?.lock()}>
      {/* SEPARATE REMOVABLE DEV SPEED TRAVEL SYSTEM (Delete component & this tag to remove) */}
      <SpeedTravelBar
        activeModule={state.module}
        onTravel={(targetModule) => void game.current?.speedTravel(targetModule)}
      />
      {/* 1. OUTDOOR FIRST-PERSON ASTRONAUT HELMET HUD (Outdoor only, hidden in FPV & modals) */}
      {state.isOutdoorTerrain && !state.transition && !state.droneModeActive && (
        <div className="helmet-visor" aria-hidden="true">
          <div className="visor-frame" />
          <div className="visor-reflection" />
          <div className="visor-telemetry-top">
            <div className="telemetry-item">
              <span className="dot online" />
              <span>HELMET COMM: UHF-HUB1 ONLINE</span>
            </div>
            <div className="telemetry-item">
              <span>SUIT: 0.38 bar · 21.0% O2 · NOMINAL</span>
            </div>
            <div className="telemetry-item">
              <span>CORE TEMP: 21.4 °C · BATTERY: 94%</span>
            </div>
            <div className="telemetry-badge">SIMULATED SUIT TELEMETRY</div>
          </div>
          <div className="visor-compass">
            <span>285° WNW · MARS TERRAIN SURVEY SECTOR</span>
          </div>
        </div>
      )}

      {/* 2. PERSISTENT IN-GAME HUD */}
      <div className="hud">
        {!state.droneModeActive && <div className="title">PHOBOSIA</div>}
        {!state.droneModeActive && <div className="module">ACTIVE MODULE · {state.module}</div>}

        {/* Mission Status Badge */}
        {!state.droneModeActive && (
          <div className="mission-hud-badge">
            <div className="mission-day-tag">
              <span className="pulsing-indicator" />
              SOL {state.missionDay} · {state.missionTitle.toUpperCase()}
            </div>
            <div className="mission-objective-text">{state.objectiveTitle}</div>
            <div className="mission-progress-bar-wrap">
              <div
                className="mission-progress-bar-fill"
                style={{
                  width: `${Math.round((state.completedStepCount / Math.max(state.totalStepCount, 1)) * 100)}%`
                }}
              />
            </div>
            <div className="mission-step-count">
              {state.completedStepCount} / {state.totalStepCount} STEPS
              {state.objectiveState === "completed" && (
                <span className="completed-tag"> — OBJECTIVE VALIDATED (REST IN HABITAT)</span>
              )}
            </div>
          </div>
        )}

        {/* Standard Reticle (only when not in drone mode) */}
        {!state.droneModeActive && <div className="reticle">+</div>}

        {/* Contextual Interaction Prompt */}
        {state.prompt && <div className="prompt">{state.prompt}</div>}

        {/* Event Notification Toast */}
        {state.notification && (
          <div className="notification-toast">
            <div className="notif-badge">MISSION EVENT</div>
            <div className="notif-text">{state.notification}</div>
          </div>
        )}

        {!state.droneModeActive && <div className="hint">{state.controlHint}</div>}

        {state.error && !state.transition && <div className="error">{state.error}</div>}

        {!state.ready && (
          <div className="start">
            <button
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
          <div className="camera-presentation-overlay" aria-live="polite">
            <div className="presentation-letterbox-bar top" />
            <div className="presentation-banner">
              <div className="presentation-header">
                <span className="presentation-badge">DAY 1 · OUTPOST ORIENTATION</span>
                <h2 className="presentation-title">{state.cameraPresentation.title}</h2>
              </div>
              <p className="presentation-desc">{state.cameraPresentation.description}</p>
              <div className="presentation-skip-hint">
                <span className="key-badge">ENTER</span> Skip Presentation
              </div>
            </div>
            <div className="presentation-letterbox-bar bottom" />
          </div>
        )}

        {/* 3. CINEMATIC CAMERA APPROACH OVERLAY */}
        {state.showCinematicOverlay && (
          <div className="cinematic-overlay" aria-hidden="true">
            <div className="cinematic-fade" />
            <div className="cinematic-scan-reticle">
              <span className="cinematic-bracket tl" />
              <span className="cinematic-bracket tr" />
              <span className="cinematic-bracket bl" />
              <span className="cinematic-bracket br" />
              <div className="cinematic-label">ALIGNING DISPLAY TERMINAL...</div>
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

        {/* Legacy 2D Panel Fallback */}
        {state.panel && (
          <section className="panel">
            <div className="badge">SIMULATED DATA</div>
            <h2>{state.panel}</h2>
            <p>
              Local observational telemetry is operational. Subsystem sensor values reflect simulated scientific
              readings for Outpost evaluation.
            </p>
            <div className="panel-actions">
              <button onClick={() => game.current?.closePanel()}>Close interface [ESC]</button>
            </div>
          </section>
        )}

        {/* 4. SHARED MISSION BRIEFING MODAL */}
        {state.showBriefingModal && (
          <div className="modal-backdrop">
            <section className="modal-dialog briefing-modal">
              <div className="modal-header">
                <span className="badge">NASA SPACE APPS 2026 · EXPEDITION BRIEFING</span>
                <h2>SOL 0{state.missionDay} — {state.missionTitle}</h2>
              </div>
              <div className="modal-body">
                <p className="briefing-narrative">{state.briefingText}</p>
                <div className="objective-callout">
                  <span className="callout-label">PRIMARY SCIENTIFIC OBJECTIVE</span>
                  <div className="callout-value">{state.primaryObjective}</div>
                </div>
                <div className="briefing-hint-box">
                  <span className="hint-label">CONTROLS REFERENCE</span>
                  <span>W, A, S, D walk · Shift jog · Space jump · E inspect/travel · Esc unlock</span>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  className="primary-btn"
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
          <div className="modal-backdrop">
            <section className="modal-dialog route-modal">
              <div className="modal-header">
                <span className="badge">MISSION CONTROL TACTICAL CARTOGRAPHY</span>
                <h2>SOL 05 — Master Terrain Survey Route Planning</h2>
              </div>
              <div className="modal-body route-body">
                <p>
                  Review the Master Terrain observation candidates below. Select your survey site to confirm the route
                  plan for upcoming surface sorties.
                </p>
                <div className="targets-grid">
                  {MASTER_TERRAIN_TARGETS.map(t => {
                    const isSelected = selectedTarget === t.id;
                    return (
                      <div
                        key={t.id}
                        className={`target-card ${isSelected ? "selected" : ""}`}
                        onClick={() => setSelectedTarget(t.id)}
                      >
                        <div className="target-card-header">
                          <span className="target-name">{t.name}</span>
                          <span className={`hazard-badge ${t.hazardRating.toLowerCase()}`}>
                            {t.hazardRating} Hazard
                          </span>
                        </div>
                        <div className="target-desc">{t.description}</div>
                        <div className="target-meta">
                          <span>Est. Distance: {t.distanceEstimate}</span>
                          <span>Coords: [{t.coordinates.x}, {t.coordinates.z}]</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="modal-footer">
                <button
                  className="secondary-btn"
                  onClick={e => {
                    e.stopPropagation();
                    game.current?.closeRoutePlanning();
                  }}
                >
                  Cancel [ESC]
                </button>
                <button
                  className="primary-btn"
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
          <div className="modal-backdrop">
            <section className="modal-dialog science-modal">
              <div className="modal-header">
                <span className="badge">OUTDOOR SURFACE SCIENCE · SOL 06</span>
                <h2>Geological Field Observation</h2>
              </div>
              <div className="modal-body">
                <div className="notice-banner">
                  <span>RECORDING TARGET:</span>{" "}
                  <strong>{state.selectedRouteTargetId ? "Confirmed Route Target" : "Site Alpha — Crater Rim Ridge"}</strong>
                  <span className="sim-tag">[SIMULATED OBSERVATION DATA]</span>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label>Surface Texture</label>
                    <select value={geoTexture} onChange={e => setGeoTexture(e.target.value)}>
                      <option value="Vesicular Basalt & Fractured Regolith">Vesicular Basalt & Fractured Regolith</option>
                      <option value="Fine-Grained Aeolian Silt Layer">Fine-Grained Aeolian Silt Layer</option>
                      <option value="Indurated Sulfate-Bearing Crust">Indurated Sulfate-Bearing Crust</option>
                      <option value="Polygonal Desiccation Pattern">Polygonal Desiccation Pattern</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Rock & Fragment Distribution</label>
                    <select value={geoDistribution} onChange={e => setGeoDistribution(e.target.value)}>
                      <option value="Scattered Angular Clasts (< 5 cm)">Scattered Angular Clasts (&lt; 5 cm)</option>
                      <option value="Dense Boulder Field with Impact Ejecta">Dense Boulder Field with Impact Ejecta</option>
                      <option value="Uniform Fine Pebble Dispersion">Uniform Fine Pebble Dispersion</option>
                      <option value="Isolated Perched Mega-Blocks">Isolated Perched Mega-Blocks</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Terrain Shape or Slope</label>
                    <select value={geoShape} onChange={e => setGeoShape(e.target.value)}>
                      <option value="Low-Angle Talus Incline (8–12°)">Low-Angle Talus Incline (8–12°)</option>
                      <option value="Steep Escarpment Rim Flank">Steep Escarpment Rim Flank</option>
                      <option value="Depression Basin with Sinuous Rilles">Depression Basin with Sinuous Rilles</option>
                      <option value="Planar Bedrock Pavement">Planar Bedrock Pavement</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Dust Coverage</label>
                    <select value={geoDust} onChange={e => setGeoDust(e.target.value)}>
                      <option value="Thin Mantle (< 2 mm) with High Rock Exposure">Thin Mantle (&lt; 2 mm) with High Rock Exposure</option>
                      <option value="Moderate Dust Drift with Saltation Ripples">Moderate Dust Drift with Saltation Ripples</option>
                      <option value="Thick Atmospheric Fallout Layer">Thick Atmospheric Fallout Layer</option>
                      <option value="Wind-Scoured Dust-Free Outcrop">Wind-Scoured Dust-Free Outcrop</option>
                    </select>
                  </div>

                  <div className="form-group full-width">
                    <label>Potential Follow-Up Area of Interest</label>
                    <input
                      type="text"
                      value={geoInterest}
                      onChange={e => setGeoInterest(e.target.value)}
                      placeholder="e.g. Stratified ejecta layer near ridge crest"
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  className="secondary-btn"
                  onClick={e => {
                    e.stopPropagation();
                    game.current?.closeGeologicalForm();
                  }}
                >
                  Cancel [ESC]
                </button>
                <button
                  className="primary-btn"
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
            </section>
          </div>
        )}

        {/* 7. DAY 7 SURFACE OBSERVATION MODAL */}
        {state.showSurfaceObservationForm && (
          <div className="modal-backdrop">
            <section className="modal-dialog science-modal">
              <div className="modal-header">
                <span className="badge">SURFACE FEATURE OBSERVATION · SOL 07</span>
                <h2>Mars Surface Observation Scan</h2>
              </div>
              <div className="modal-body">
                <div className="notice-banner">
                  <span>OBSERVATION TARGET:</span> <strong>Site Beta — Dune Basin Depression</strong>
                  <span className="sim-tag">[DATA STORED FOR SOL 08 LAB ANALYSIS]</span>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label>Visible Surface Pattern</label>
                    <select value={surfPattern} onChange={e => setSurfPattern(e.target.value)}>
                      <option value="Laminated Bedding & Cross-Stratification">Laminated Bedding & Cross-Stratification</option>
                      <option value="Concentric Impact Deformation Rings">Concentric Impact Deformation Rings</option>
                      <option value="Aeolian Megaripples with Coarse Crests">Aeolian Megaripples with Coarse Crests</option>
                      <option value="Columnar Jointing in Basalt Flow">Columnar Jointing in Basalt Flow</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Surface & Fragment Appearance</label>
                    <select value={surfAppearance} onChange={e => setSurfAppearance(e.target.value)}>
                      <option value="Dark Iron-Magnesium Silicate Matrix">Dark Iron-Magnesium Silicate Matrix</option>
                      <option value="Oxidized Hematite Spherule Encrustation">Oxidized Hematite Spherule Encrustation</option>
                      <option value="Hydrated Sulfate Intergranular Cement">Hydrated Sulfate Intergranular Cement</option>
                      <option value="Glassy Impactite Vitrification Veneer">Glassy Impactite Vitrification Veneer</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Local Terrain Profile</label>
                    <select value={surfProfile} onChange={e => setSurfProfile(e.target.value)}>
                      <option value="Undulating Dune Swale Transition">Undulating Dune Swale Transition</option>
                      <option value="Sub-horizontal Bedrock Platform">Sub-horizontal Bedrock Platform</option>
                      <option value="Micro-graben Depression Valley">Micro-graben Depression Valley</option>
                      <option value="Radial Ejecta Apron Margin">Radial Ejecta Apron Margin</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Feature Worth Revisiting</label>
                    <select value={surfArea} onChange={e => setSurfArea(e.target.value)}>
                      <option value="High-reflectance mineralized vein">High-reflectance mineralized vein</option>
                      <option value="Aeolian sediment trap boundary">Aeolian sediment trap boundary</option>
                      <option value="Eroded crater terrace contact">Eroded crater terrace contact</option>
                      <option value="Desiccation fissure junction">Desiccation fissure junction</option>
                    </select>
                  </div>

                  <div className="form-group full-width">
                    <label>Question for Laboratory Analysis</label>
                    <select value={surfQuestion} onChange={e => setSurfQuestion(e.target.value)}>
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
              <div className="modal-footer">
                <button
                  className="secondary-btn"
                  onClick={e => {
                    e.stopPropagation();
                    game.current?.closeSurfaceObservationForm();
                  }}
                >
                  Cancel [ESC]
                </button>
                <button
                  className="primary-btn"
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
          <div className="modal-backdrop">
            <section className="modal-dialog science-modal analysis-modal">
              <div className="modal-header">
                <span className="badge">RESEARCH LAB ANALYSIS CONSOLE · SOL 08</span>
                <h2>Scientific Observation Analysis & Synthesis</h2>
              </div>
              <div className="modal-body">
                <div className="analysis-columns">
                  {/* Source Day 7 Record Panel */}
                  <div className="analysis-panel">
                    <h3>1. SOURCE OBSERVATION (SOL 07)</h3>
                    {state.surfaceObservation ? (
                      <div className="record-details">
                        <div className="detail-row">
                          <span className="detail-key">Record ID:</span>
                          <span className="detail-val mono">{state.surfaceObservation.id}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-key">Pattern:</span>
                          <span className="detail-val">{state.surfaceObservation.observedCategories.surfacePattern}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-key">Matrix:</span>
                          <span className="detail-val">{state.surfaceObservation.observedCategories.surfaceMaterialAppearance}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-key">Profile:</span>
                          <span className="detail-val">{state.surfaceObservation.observedCategories.terrainProfile}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-key">Focus:</span>
                          <span className="detail-val">{state.surfaceObservation.observedCategories.areaOfInterest}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-key">Question:</span>
                          <span className="detail-val highlight">{state.surfaceObservation.followUpQuestion}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="warning-box">No saved Day 7 surface observation found.</div>
                    )}
                  </div>

                  {/* Day 6 Geological Comparison Panel */}
                  <div className="analysis-panel">
                    <h3>2. GEOLOGICAL COMPARISON (SOL 06)</h3>
                    {state.geologicalSurvey ? (
                      <div className="record-details">
                        <div className="detail-row">
                          <span className="detail-key">Survey ID:</span>
                          <span className="detail-val mono">{state.geologicalSurvey.id}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-key">Texture:</span>
                          <span className="detail-val">{state.geologicalSurvey.observedCategories.surfaceTexture}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-key">Fragments:</span>
                          <span className="detail-val">{state.geologicalSurvey.observedCategories.fragmentDistribution}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-key">Dust:</span>
                          <span className="detail-val">{state.geologicalSurvey.observedCategories.dustCoverage}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-key">Correlation:</span>
                          <span className="detail-val success">Compatible basaltic aeolian deflation sequence</span>
                        </div>
                      </div>
                    ) : (
                      <div className="info-box">Sol 06 geological survey record unavailable. Proceeding with single-source observation analysis.</div>
                    )}
                  </div>
                </div>

                {/* Predefined Cautious Interpretations */}
                <div className="interpretations-wrap">
                  <h3>3. SELECT SCIENTIFIC INTERPRETATION</h3>
                  <div className="interp-grid">
                    {PREDEFINED_INTERPRETATIONS.map(i => {
                      const isSelected = selectedInterpretation === i.id;
                      return (
                        <div
                          key={i.id}
                          className={`interp-card ${isSelected ? "selected" : ""}`}
                          onClick={() => setSelectedInterpretation(i.id)}
                        >
                          <div className="interp-header">
                            <span className="interp-label">{i.label}</span>
                            <span className="interp-badge">{i.claimStrength} Interpretation</span>
                          </div>
                          <div className="interp-desc">{i.description}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  className="secondary-btn"
                  onClick={e => {
                    e.stopPropagation();
                    game.current?.closeScienceAnalysisModal();
                  }}
                >
                  Cancel [ESC]
                </button>
                <button
                  className="primary-btn"
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
          <div className="modal-backdrop">
            <section className="modal-dialog drone-modal">
              <div className="modal-header">
                <span className="badge">MISSION CONTROL DRONE OPERATIONS · SOL 09</span>
                <h2>Scout Drone 01 Remote Operations Terminal</h2>
              </div>
              <div className="modal-body">
                <div className="drone-briefing-box">
                  <div className="drone-status-line">
                    <span className="dot online" />
                    <strong>DRONE TELEMETRY UPLINK: CONNECTED (8.4 GHz X-BAND)</strong>
                  </div>
                  <div className="drone-specs-grid">
                    <div>Status: <strong>STANDBY AT LAUNCH ANCHOR</strong></div>
                    <div>Battery: <strong>88% NOMINAL</strong></div>
                    <div>Signal: <strong>96% (12 ms LATENCY)</strong></div>
                    <div>Target Sector: <strong>SITE GAMMA CANYON ESCARPMENT</strong></div>
                  </div>
                </div>

                <div className="drone-controls-guide">
                  <h3>REMOTE FPV FLIGHT CONTROLS</h3>
                  <div className="controls-list">
                    <span><strong>W / S:</strong> Pitch forward / backward</span>
                    <span><strong>A / D:</strong> Yaw left / right</span>
                    <span><strong>Space:</strong> Ascend altitude</span>
                    <span><strong>Left Shift:</strong> Descend altitude</span>
                    <span><strong>C Key:</strong> Capture survey telemetry</span>
                    <span><strong>Escape:</strong> Disengage FPV and return</span>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  className="secondary-btn"
                  onClick={e => {
                    e.stopPropagation();
                    game.current?.closeDroneConsoleModal();
                  }}
                >
                  Cancel [ESC]
                </button>
                <button
                  className="primary-btn drone-launch-btn"
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
          <div className="drone-fpv-overlay">
            {/* Top Telemetry Bar */}
            <div className="drone-top-bar">
              <div className="drone-top-left">
                <span className="rec-dot" />
                <span className="drone-title">DRONE FPV — REMOTE CONTROL [SCOUT 01]</span>
              </div>
              <div className="drone-telemetry-readouts">
                <span>BATTERY: {state.droneTelemetry.battery}%</span>
                <span>SIGNAL: {state.droneTelemetry.signal}%</span>
                <span>ALTITUDE: {state.droneTelemetry.altitude} m</span>
                <span>COORDS: [{state.droneTelemetry.x}, {state.droneTelemetry.z}]</span>
              </div>
              <div className="sim-badge">SIMULATED DRONE TELEMETRY</div>
            </div>

            {/* Flight Crosshair / Artificial Horizon */}
            <div className="drone-viewfinder">
              <div className="drone-crosshair-h" />
              <div className="drone-crosshair-v" />
              <div className="drone-horizon-box">
                <div className="horizon-line" />
                <span className="target-heading">TARGET SECTOR: SITE GAMMA ESCARPMENT</span>
              </div>
            </div>

            {/* Bottom Controls & Capture Bar */}
            <div className="drone-bottom-bar">
              <div className="drone-control-hints">
                <span>W/A/S/D to fly · Space ascend · Shift descend</span>
              </div>
              <div className="drone-actions">
                <button
                  className="drone-capture-btn"
                  onClick={e => {
                    e.stopPropagation();
                    game.current?.captureDroneSurvey();
                  }}
                >
                  {state.droneSurvey ? "Update Survey Record [C]" : "Capture Remote Survey [C]"}
                </button>
                <button
                  className="drone-exit-btn"
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

        {/* 11. REST / DAY ADVANCE FEEDBACK MODAL */}
        {state.restFeedback && (
          <div className="modal-backdrop">
            <section className={`modal-dialog feedback-modal ${state.restFeedback.type}`}>
              <div className="modal-header">
                <span className="badge">
                  {state.restFeedback.type === "blocked" ? "REST PROTOCOL RESTRICTED" : "HABITAT REST CYCLE"}
                </span>
                <h2>{state.restFeedback.type === "blocked" ? "Objective Incomplete" : "Rest Period Verified"}</h2>
              </div>
              <div className="modal-body">
                <p>{state.restFeedback.message}</p>
              </div>
              <div className="modal-footer">
                <button
                  className="primary-btn"
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

        {/* 12. LOADING SCREEN */}
        {state.transition === "loading" && (
          <section className="transition loading">
            <img src="/assets/images/PHOBOSIA_Martian_Modern_Logo_4K.png" alt="PHOBOSIA" />
            <p>Loading {state.transitionLabel}...</p>
            <strong>{state.transitionProgress === null ? "Preparing…" : `${state.transitionProgress}%`}</strong>
          </section>
        )}

        {/* 13. DESTINATION TRANSITION VIDEO */}
        {state.transition === "video" && (
          <section className="transition video">
            <video
              ref={video}
              src={game.current?.transitionVideo()}
              muted
              playsInline
              onEnded={() => game.current?.videoFinished()}
              onError={() =>
                game.current?.videoFailed("The transition video could not be loaded. You can continue to the destination.")
              }
            />
            <p>Press ENTER to skip</p>
          </section>
        )}

        {/* 14. TRANSITION ERROR */}
        {state.transition === "error" && (
          <section className="transition failure">
            <img src="/assets/images/PHOBOSIA_Martian_Modern_Logo_4K.png" alt="PHOBOSIA" />
            <p>{state.error}</p>
            <div>
              <button onClick={() => game.current?.retryTransition()}>Retry</button>
              <button onClick={() => game.current?.continueWithoutVideo()}>Continue</button>
            </div>
          </section>
        )}

        <div className="diag">
          WebGL {state.ready ? "ready" : "loading"} · {state.fps} fps · Sol {state.missionDay}
        </div>
      </div>
    </div>
  );
}
