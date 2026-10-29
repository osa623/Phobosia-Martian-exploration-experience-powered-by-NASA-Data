"use client";

import React, { useState, useEffect } from "react";
import type { Game } from "@/core/Game";
import type { GameState } from "@/core/EventBus";
import {
  DAYS_CONFIG,
  MASTER_TERRAIN_TARGETS,
  PREDEFINED_INTERPRETATIONS,
  type MissionDayNumber,
  type TerrainRouteTarget
} from "@/core/MissionManager";

export type OSViewTab =
  | "dashboard"     // Exact 1:1 match of Reference Image 1
  | "cartography"   // Extended Surface Map & Route Planning
  | "drone"         // Scout Drone 01 FPV Operations
  | "subsystems"    // ECLSS Life Support & Power Grid
  | "timeline"      // Expedition Sols (Sol 1–9) Campaign Log
  | "diagnostics";  // Subsystem Diagnostics & Hardware Bus Log

interface PhobosiaOSProps {
  game: Game | null;
  state: GameState;
  onClose: () => void;
  initialApp?: string;
}

export function PhobosiaOS({ game, state, onClose, initialApp }: PhobosiaOSProps) {
  // Map initial app to active tab
  const getInitialTab = (): OSViewTab => {
    if (!initialApp) return "dashboard";
    if (initialApp === "navigation" || initialApp === "cartography") return "cartography";
    if (initialApp === "drone") return "drone";
    if (initialApp === "habitat" || initialApp === "engineering" || initialApp === "subsystems") return "subsystems";
    if (initialApp === "timeline") return "timeline";
    if (initialApp === "diagnostics") return "diagnostics";
    return "dashboard";
  };

  const [activeTab, setActiveTab] = useState<OSViewTab>(getInitialTab());
  const [selectedMapTarget, setSelectedMapTarget] = useState<string>(
    state.selectedRouteTargetId || "TARGET_ALPHA_CRATER_RIM"
  );
  const [timelineDay, setTimelineDay] = useState<number>(state.missionDay);
  const [isMaximized, setIsMaximized] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [currentTime, setCurrentTime] = useState("");
  const [diagRun, setDiagRun] = useState(false);
  const [diagStatus, setDiagStatus] = useState("ALL SUBSYSTEMS NOMINAL · IDLE");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toUTCString().slice(17, 25));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const runDiagnostics = () => {
    setDiagRun(true);
    setDiagStatus("DIAGNOSTIC TEST RUNNING: VERIFYING 14 SENSORS...");
    setTimeout(() => {
      setDiagStatus("ALL 14 SENSOR MATRICES VALIDATED · STATUS: 100% NOMINAL");
      setDiagRun(false);
    }, 1200);
  };

  const currentMission = DAYS_CONFIG[state.missionDay as MissionDayNumber] || DAYS_CONFIG[1];

  return (
    <div className={`[position:fixed] [inset:0] [z-index:60] [background:rgba(14,_18,_24,_0.96)] [backdrop-filter:blur(14px)] [display:flex] [align-items:center] [justify-content:center] [pointer-events:auto] [user-select:none] [animation:osFrameFadeIn_0.35s_cubic-bezier(0.16,_1,_0.3,_1)] [font-family:-apple-system,_BlinkMacSystemFont,_"Segoe_UI",_Roboto,_"Helvetica_Neue",_Arial,_sans-serif] [color:#dce7ec] ${isMinimized ? "minimized" : ""}`}>
      {/* MINIMIZED RESTORE PILL */}
      {isMinimized && (
        <button
          className="[position:fixed] [bottom:24px] [right:28px] [background:#0f1c28] [border:1px_solid_#55cde8] [color:#55cde8] text-[12px] font-bold font-mono [letter-spacing:0.1em] [padding:10px_18px] [border-radius:20px] [cursor:pointer] [display:flex] [align-items:center] [gap:8px] [box-shadow:0_8px_30px_rgba(0,_0,_0,_0.8),_0_0_16px_rgba(85,_205,_232,_0.3)] [transition:all_0.15s_ease] hover:[background:#182e42] hover:[transform:translateY(-2px)] hover:[box-shadow:0_12px_36px_rgba(0,_0,_0,_0.9),_0_0_24px_rgba(85,_205,_232,_0.5)] hover:[background:#182e42] hover:[transform:translateY(-2px)] hover:[box-shadow:0_12px_36px_rgba(0,_0,_0,_0.9),_0_0_24px_rgba(85,_205,_232,_0.5)]"
          onClick={() => setIsMinimized(false)}
          title="Restore PHOBOSIA OS"
        >
          <span className="[color:#e88747] [font-size:14px]">✦</span>
          <span>PHOBOSIA OS · RESTORE</span>
        </button>
      )}

      {/* MAIN TABLET FRAME (EXACT REFERENCE 1 CONTAINER) */}
      {!isMinimized && (
        <div className={`[width:1180px] [max-width:96vw] [height:750px] [max-height:94vh] [background:#090e15] [border-radius:28px] [border:1px_solid_rgba(85,_205,_232,_0.22)] [box-shadow:0_30px_90px_rgba(0,_0,_0,_0.95),_0_0_40px_rgba(10,_25,_38,_0.4),_inset_0_1px_0_rgba(255,_255,_255,_0.1)] [display:flex] [flex-direction:column] [padding:12px_18px_18px_14px] [overflow:hidden] [position:relative] [transition:all_0.25s_ease] ${isMaximized ? "[width:calc(100vw_-_32px)] [max-width:none] [height:calc(100vh_-_32px)] [max-height:none] [border-radius:16px]" : "standard"}`}>
          {/* WINDOW TOP-BAR CONTROLS */}
          <div className="[height:26px] [display:flex] [justify-content:space-between] [align-items:center] [margin-bottom:8px] [padding:0_6px_0_12px] [flex-shrink:0]">
            <div className="[display:flex] [align-items:center] [gap:8px] text-[11px] font-mono [letter-spacing:0.1em]">
              <span className="[color:#e88747] [font-weight:bold]">PHOBOSIA OS</span>
              <span className="[color:#3b5a6c]">/</span>
              <span className="[color:#7d9eaf]">
                {activeTab === "dashboard" && "STATION OPERATIONS"}
                {activeTab === "cartography" && "SURFACE CARTOGRAPHY"}
                {activeTab === "drone" && "SCOUT DRONE 01 FPV"}
                {activeTab === "subsystems" && "ECLSS & POWER GRID"}
                {activeTab === "timeline" && "EXPEDITION TIMELINE"}
                {activeTab === "diagnostics" && "SYSTEM DIAGNOSTICS"}
              </span>
            </div>
            <div className="[display:flex] [align-items:center] [gap:6px]">
              <button
                className="[width:22px] [height:20px] [background:#111e29] [border:1px_solid_#233e50] [color:#7b9caf] [font-size:11px] [cursor:pointer] [display:flex] [align-items:center] [justify-content:center] [border-radius:4px] [padding:0] [transition:all_0.12s_ease] hover:[background:#1b3346] hover:[color:#ffffff] min hover:[background:#1b3346] hover:[color:#ffffff]"
                onClick={() => setIsMinimized(true)}
                title="Minimize window"
              >
                ─
              </button>
              <button
                className="[width:22px] [height:20px] [background:#111e29] [border:1px_solid_#233e50] [color:#7b9caf] [font-size:11px] [cursor:pointer] [display:flex] [align-items:center] [justify-content:center] [border-radius:4px] [padding:0] [transition:all_0.12s_ease] hover:[background:#1b3346] hover:[color:#ffffff] max hover:[background:#1b3346] hover:[color:#ffffff]"
                onClick={() => setIsMaximized(!isMaximized)}
                title={isMaximized ? "Restore standard size" : "Maximize window"}
              >
                {isMaximized ? "❐" : "□"}
              </button>
              <button
                className="[width:22px] [height:20px] [background:#111e29] [border:1px_solid_#233e50] [color:#7b9caf] [font-size:11px] [cursor:pointer] [display:flex] [align-items:center] [justify-content:center] [border-radius:4px] [padding:0] [transition:all_0.12s_ease] hover:[background:#1b3346] hover:[color:#ffffff] hover:[background:#6a2424] hover:[border-color:#ff6666] hover:[color:#ffffff] hover:[background:#1b3346] hover:[color:#ffffff] hover:[background:#6a2424] hover:[border-color:#ff6666]"
                onClick={onClose}
                title="Logout & Return to First-Person View [ESC]"
              >
                ✕
              </button>
            </div>
          </div>

          {/* MAIN TWO-COLUMN + RAIL WORKSPACE */}
          <div className="[display:flex] [flex:1] [gap:14px] [overflow:hidden]">
            {/* 1. LEFT NAVIGATION RAIL */}
            <nav className="[width:64px] [display:flex] [flex-direction:column] [justify-content:space-between] [align-items:center] [padding:8px_0_10px] [border-right:1px_solid_rgba(255,_255,_255,_0.04)] [flex-shrink:0]" aria-label="System Navigation">
              {/* Logo / Brand Mark */}
              <div className="[display:flex] [flex-direction:column] [align-items:center] [gap:2px]" title="PHOBOSIA Expedition Operating System">
                <div className="[font-size:22px] [color:#38bdf8] [filter:drop-shadow(0_0_6px_rgba(56,_189,_248,_0.8))] [line-height:1]">✦</div>
                <span className="[font-size:9px] [color:#7b9cad] [letter-spacing:0.1em] [font-weight:500]">Weathry</span>
              </div>

              {/* Vertical Navigation Icons */}
              <div className="[display:flex] [flex-direction:column] [align-items:center] [gap:16px]">
                {/* 1. Dashboard / Grid (Active by default) */}
                <button
                  className={(`[position:relative] [width:44px] [height:44px] [background:transparent] [border:none] [color:#5f7d8e] [cursor:pointer] [display:flex] [align-items:center] [justify-content:center] [border-radius:12px] [transition:all_0.15s_ease] hover:[color:#b8d6e5] hover:[background:rgba(255,_255,_255,_0.04)] ${activeTab === "dashboard" ? "text-white bg-[rgba(85,205,232,0.08)]" : ""}`) + "hover:[color:#b8d6e5] hover:[background:rgba(255,_255,_255,_0.04)]"}
                  onClick={() => setActiveTab("dashboard")}
                  title="Station Dashboard (Overview & Atmosphere)"
                >
                  {activeTab === "dashboard" && <span className="[position:absolute] [left:-10px] [top:50%] [transform:translateY(-50%)] [width:3.5px] [height:20px] [background:#38bdf8] [border-radius:2px] [box-shadow:0_0_8px_#38bdf8]" />}
                  <svg className="[width:20px] [height:20px]" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="3" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="3" width="7" height="7" rx="1.5" />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" />
                    <rect x="14" y="14" width="7" height="7" rx="1.5" />
                  </svg>
                </button>

                {/* 2. Folded Map */}
                <button
                  className={(`[position:relative] [width:44px] [height:44px] [background:transparent] [border:none] [color:#5f7d8e] [cursor:pointer] [display:flex] [align-items:center] [justify-content:center] [border-radius:12px] [transition:all_0.15s_ease] hover:[color:#b8d6e5] hover:[background:rgba(255,_255,_255,_0.04)] ${activeTab === "cartography" ? "text-white bg-[rgba(85,205,232,0.08)]" : ""}`) + "hover:[color:#b8d6e5] hover:[background:rgba(255,_255,_255,_0.04)]"}
                  onClick={() => setActiveTab("cartography")}
                  title="Master Terrain Cartography & Route Planning"
                >
                  {activeTab === "cartography" && <span className="[position:absolute] [left:-10px] [top:50%] [transform:translateY(-50%)] [width:3.5px] [height:20px] [background:#38bdf8] [border-radius:2px] [box-shadow:0_0_8px_#38bdf8]" />}
                  <svg className="[width:20px] [height:20px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                    <line x1="8" y1="2" x2="8" y2="18" />
                    <line x1="16" y1="6" x2="16" y2="22" />
                  </svg>
                </button>

                {/* 3. Target / Crosshairs */}
                <button
                  className={(`[position:relative] [width:44px] [height:44px] [background:transparent] [border:none] [color:#5f7d8e] [cursor:pointer] [display:flex] [align-items:center] [justify-content:center] [border-radius:12px] [transition:all_0.15s_ease] hover:[color:#b8d6e5] hover:[background:rgba(255,_255,_255,_0.04)] ${activeTab === "drone" ? "text-white bg-[rgba(85,205,232,0.08)]" : ""}`) + "hover:[color:#b8d6e5] hover:[background:rgba(255,_255,_255,_0.04)]"}
                  onClick={() => setActiveTab("drone")}
                  title="Scout Drone 01 & Remote Reconnaissance"
                >
                  {activeTab === "drone" && <span className="[position:absolute] [left:-10px] [top:50%] [transform:translateY(-50%)] [width:3.5px] [height:20px] [background:#38bdf8] [border-radius:2px] [box-shadow:0_0_8px_#38bdf8]" />}
                  <svg className="[width:20px] [height:20px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" />
                    <circle cx="12" cy="12" r="3" />
                    <line x1="12" y1="1" x2="12" y2="5" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="1" y1="12" x2="5" y2="12" />
                    <line x1="19" y1="12" x2="23" y2="12" />
                  </svg>
                </button>

                {/* 4. Moon / Orbit */}
                <button
                  className={(`[position:relative] [width:44px] [height:44px] [background:transparent] [border:none] [color:#5f7d8e] [cursor:pointer] [display:flex] [align-items:center] [justify-content:center] [border-radius:12px] [transition:all_0.15s_ease] hover:[color:#b8d6e5] hover:[background:rgba(255,_255,_255,_0.04)] ${activeTab === "subsystems" ? "text-white bg-[rgba(85,205,232,0.08)]" : ""}`) + "hover:[color:#b8d6e5] hover:[background:rgba(255,_255,_255,_0.04)]"}
                  onClick={() => setActiveTab("subsystems")}
                  title="Habitat ECLSS Life Support & Power Microgrid"
                >
                  {activeTab === "subsystems" && <span className="[position:absolute] [left:-10px] [top:50%] [transform:translateY(-50%)] [width:3.5px] [height:20px] [background:#38bdf8] [border-radius:2px] [box-shadow:0_0_8px_#38bdf8]" />}
                  <svg className="[width:20px] [height:20px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                </button>

                {/* 5. Calendar / Timeline */}
                <button
                  className={(`[position:relative] [width:44px] [height:44px] [background:transparent] [border:none] [color:#5f7d8e] [cursor:pointer] [display:flex] [align-items:center] [justify-content:center] [border-radius:12px] [transition:all_0.15s_ease] hover:[color:#b8d6e5] hover:[background:rgba(255,_255,_255,_0.04)] ${activeTab === "timeline" ? "text-white bg-[rgba(85,205,232,0.08)]" : ""}`) + "hover:[color:#b8d6e5] hover:[background:rgba(255,_255,_255,_0.04)]"}
                  onClick={() => setActiveTab("timeline")}
                  title="Expedition Timeline (Sol 1 to 9)"
                >
                  {activeTab === "timeline" && <span className="[position:absolute] [left:-10px] [top:50%] [transform:translateY(-50%)] [width:3.5px] [height:20px] [background:#38bdf8] [border-radius:2px] [box-shadow:0_0_8px_#38bdf8]" />}
                  <svg className="[width:20px] [height:20px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </button>

                {/* 6. Settings / Diagnostics */}
                <button
                  className={(`[position:relative] [width:44px] [height:44px] [background:transparent] [border:none] [color:#5f7d8e] [cursor:pointer] [display:flex] [align-items:center] [justify-content:center] [border-radius:12px] [transition:all_0.15s_ease] hover:[color:#b8d6e5] hover:[background:rgba(255,_255,_255,_0.04)] ${activeTab === "diagnostics" ? "text-white bg-[rgba(85,205,232,0.08)]" : ""}`) + "hover:[color:#b8d6e5] hover:[background:rgba(255,_255,_255,_0.04)]"}
                  onClick={() => setActiveTab("diagnostics")}
                  title="Subsystem Diagnostics & Event Log"
                >
                  {activeTab === "diagnostics" && <span className="[position:absolute] [left:-10px] [top:50%] [transform:translateY(-50%)] [width:3.5px] [height:20px] [background:#38bdf8] [border-radius:2px] [box-shadow:0_0_8px_#38bdf8]" />}
                  <svg className="[width:20px] [height:20px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>
              </div>

              {/* Bottom Notification & User Profile */}
              <div className="[display:flex] [flex-direction:column] [align-items:center] [gap:12px]">
                <button className="[position:relative] [width:44px] [height:44px] [background:transparent] [border:none] [color:#5f7d8e] [cursor:pointer] [display:flex] [align-items:center] [justify-content:center] [border-radius:12px] [transition:all_0.15s_ease] hover:[color:#b8d6e5] hover:[background:rgba(255,_255,_255,_0.04)] [width:38px] [height:38px] hover:[color:#b8d6e5] hover:[background:rgba(255,_255,_255,_0.04)]" title="Unread Mission Notifications">
                  <span className="[position:absolute] [top:8px] [right:8px] [width:6px] [height:6px] [border-radius:50%] [background:#e88747] [box-shadow:0_0_6px_#e88747]" />
                  <svg className="[width:20px] [height:20px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </button>
                <div className="[width:32px] [height:32px] [border-radius:50%] [border:1.5px_solid_#e88747] [box-shadow:0_0_8px_rgba(232,_135,_71,_0.4)] [padding:1px]" title="Astronaut / Mission Specialist">
                  <div className="[width:100%] [height:100%] [border-radius:50%] [background:radial-gradient(circle_at_35%_35%,_#e88747_0%,_#301a10_70%,_#000_100%)]" />
                </div>
              </div>
            </nav>

            {/* 2. MAIN CONTENT REGION */}
            <main className="[flex:1] [display:flex] [overflow:hidden]">
              {/* VIEW A: EXACT MATCH TO REFERENCE IMAGE 1 (DASHBOARD) */}
              {activeTab === "dashboard" && (
                <div className="[display:flex] [flex:1] [gap:14px] [overflow:hidden]">
                  {/* LEFT COLUMN (SOL OVERVIEW + 7-SOL FORECAST) */}
                  <div className="[width:295px] [display:flex] [flex-direction:column] [gap:12px] [flex-shrink:0]">
                    {/* TOP CARD: Sol Weather & Environmental Overview */}
                    <div className="[height:280px] [border-radius:20px] [padding:16px_18px] [background:linear-gradient(155deg,_#172d3f_0%,_#0c1622_100%)] [border:1px_solid_rgba(85,_205,_232,_0.16)] [box-shadow:0_10px_30px_rgba(0,_0,_0,_0.35)] [display:flex] [flex-direction:column] [justify-content:space-between]">
                      <div className="[display:flex] [justify-content:space-between] [align-items:flex-start]">
                        <div>
                          {/* Weather Feature Graphic (Sun + Storm Cloud + Lightning) */}
                          <svg className="[width:46px] [height:46px]" viewBox="0 0 64 64">
                            <circle cx="28" cy="24" r="12" fill="#f59e0b" filter="drop-shadow(0 0 8px #f59e0b)" />
                            <path
                              d="M16 44 C 16 38, 22 34, 28 34 C 30 28, 38 28, 42 32 C 48 30, 54 36, 52 42 C 55 45, 54 50, 48 52 L 20 52 C 16 52, 14 48, 16 44 Z"
                              fill="#607286"
                              filter="drop-shadow(0 4px 10px rgba(0,0,0,0.5))"
                            />
                            {/* Lightning bolt */}
                            <polygon
                              points="32,46 28,54 34,54 30,62 42,50 36,50"
                              fill="#facc15"
                              filter="drop-shadow(0 0 6px #facc15)"
                            />
                          </svg>
                        </div>
                        <button className="[width:30px] [height:30px] [border-radius:50%] [background:rgba(255,_255,_255,_0.05)] [border:1px_solid_rgba(255,_255,_255,_0.08)] [color:#7b9cac] [display:flex] [align-items:center] [justify-content:center] [cursor:pointer] [transition:all_0.15s_ease] hover:[background:rgba(85,_205,_232,_0.15)] hover:[border-color:#55cde8] hover:[color:#ffffff] hover:[background:rgba(85,_205,_232,_0.15)] hover:[border-color:#55cde8] hover:[color:#ffffff]" title="Search Telemetry Archives">
                          <svg className="[width:13px] [height:13px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </svg>
                        </button>
                      </div>

                      {/* Large Metric Display */}
                      <div className="[display:flex] [align-items:flex-start] [line-height:0.9] [margin:2px_0_1px]">
                        <span className="[font-size:48px] [font-weight:600] [color:#ffffff] [letter-spacing:-0.03em]">28</span>
                        <span className="[font-size:22px] [font-weight:400] [color:#ffffff] [margin-left:2px] [margin-top:3px]">°c</span>
                      </div>

                      {/* Condition Text */}
                      <div className="[display:flex] [align-items:center] [gap:6px] [font-size:12.5px] [color:#d8e6eb] [font-weight:500]">
                        <svg className="[width:14px] [height:14px] [color:#8daab9]" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
                        </svg>
                        <span>Rainy Storm Clouds</span>
                      </div>

                      <div className="[width:100%] [height:1px] [background:rgba(255,_255,_255,_0.07)] [margin:4px_0]" />

                      {/* Location & Time Info */}
                      <div className="[display:flex] [flex-direction:column] [gap:5px]">
                        <div className="[display:flex] [align-items:center] [gap:7px] [font-size:11px] [color:#8daab9]">
                          <svg className="[width:12px] [height:12px] [color:#6a8c9e] [flex-shrink:0]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          <span>Florida, US</span>
                        </div>
                        <div className="[display:flex] [align-items:center] [gap:7px] [font-size:11px] [color:#8daab9]">
                          <svg className="[width:12px] [height:12px] [color:#6a8c9e] [flex-shrink:0]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          <span>24 July, 2022 5:01 AM</span>
                        </div>
                      </div>
                    </div>

                    {/* BOTTOM CARD: 7 Days Forecast */}
                    <div className="[flex:1] [border-radius:20px] [padding:12px_16px] [background:#0c1620] [border:1px_solid_rgba(85,_205,_232,_0.12)] [display:flex] [flex-direction:column] [justify-content:space-between] [gap:6px]">
                      <div className="[display:flex] [justify-content:space-between] [align-items:center] [margin-bottom:2px]">
                        <h3 className="[margin:0] [font-size:14px] [font-weight:600] [color:#ffffff]">7 days Forecast</h3>
                        <div className="[display:flex] [align-items:center] [gap:6px] [background:#13222d] [border:1px_solid_#1f3647] [padding:2px_8px] [border-radius:12px] [font-size:10px] [color:#8daab9] [cursor:pointer]">
                          <span>7 day</span>
                          <span className="[font-size:8px] [color:#6c8a99]">▾</span>
                        </div>
                      </div>

                      {/* Forecast Rows */}
                      <div className="[display:flex] [flex-direction:column] [gap:4px]">
                        <div className="[display:flex] [align-items:center] [justify-content:space-between] [font-size:11px] [padding:1px_0]">
                          <span className="[font-size:14px] [width:20px] sun-cloud">⛅</span>
                          <span className="[font-weight:600] [color:#ffffff] [width:58px]">+29°<span className="[color:#6a8b9c] [font-weight:400] [font-size:10px]">/+18</span></span>
                          <span className="[color:#7b9bad] [width:50px] [font-size:10px]">25 July</span>
                          <span className="[color:#a4c2d1] [text-align:right] [width:68px]">Tuesday</span>
                        </div>
                        <div className="[display:flex] [align-items:center] [justify-content:space-between] [font-size:11px] [padding:1px_0]">
                          <span className="[font-size:14px] [width:20px] storm">⛈️</span>
                          <span className="[font-weight:600] [color:#ffffff] [width:58px]">+21°<span className="[color:#6a8b9c] [font-weight:400] [font-size:10px]">/+16</span></span>
                          <span className="[color:#7b9bad] [width:50px] [font-size:10px]">26 July</span>
                          <span className="[color:#a4c2d1] [text-align:right] [width:68px]">Wednesday</span>
                        </div>
                        <div className="[display:flex] [align-items:center] [justify-content:space-between] [font-size:11px] [padding:1px_0]">
                          <span className="[font-size:14px] [width:20px] rain">🌧️</span>
                          <span className="[font-weight:600] [color:#ffffff] [width:58px]">+24°<span className="[color:#6a8b9c] [font-weight:400] [font-size:10px]">/+20</span></span>
                          <span className="[color:#7b9bad] [width:50px] [font-size:10px]">27 July</span>
                          <span className="[color:#a4c2d1] [text-align:right] [width:68px]">Thursday</span>
                        </div>
                        <div className="[display:flex] [align-items:center] [justify-content:space-between] [font-size:11px] [padding:1px_0]">
                          <span className="[font-size:14px] [width:20px] sun-cloud">🌤️</span>
                          <span className="[font-weight:600] [color:#ffffff] [width:58px]">+30°<span className="[color:#6a8b9c] [font-weight:400] [font-size:10px]">/+17</span></span>
                          <span className="[color:#7b9bad] [width:50px] [font-size:10px]">28 July</span>
                          <span className="[color:#a4c2d1] [text-align:right] [width:68px]">Friday</span>
                        </div>
                      </div>

                      {/* Bottom Mini Highlight Sub-Card ("Tomorrow") */}
                      <div className="[background:#11202b] [border:1px_solid_#1a3243] [border-radius:10px] [padding:6px_10px] [display:flex] [justify-content:space-between] [align-items:center] [margin-top:2px]">
                        <div className="[display:flex] [align-items:center] [gap:10px]">
                          <div className="[font-size:20px]">⛈️</div>
                          <div className="[display:flex] [flex-direction:column] [line-height:1.25]">
                            <span className="[font-size:10px] [color:#7a9bad]">Tomorrow</span>
                            <div className="[font-size:16px] [font-weight:600] [color:#ffffff]">23°</div>
                            <span className="[font-size:9px] [color:#628292]">Thunder Storm day</span>
                          </div>
                        </div>
                        {/* Sparkline Trend Graph */}
                        <div className="[width:80px] [height:32px]">
                          <svg viewBox="0 0 100 40" className="[width:100%] [height:100%]">
                            <polyline
                              fill="none"
                              stroke="#c084fc"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              points="5,28 25,24 45,32 65,14 85,22 95,10"
                            />
                            <circle cx="5" cy="28" r="2.5" fill="#c084fc" />
                            <circle cx="45" cy="32" r="2.5" fill="#c084fc" />
                            <circle cx="65" cy="14" r="3" fill="#ffffff" stroke="#c084fc" strokeWidth="2" />
                            <circle cx="95" cy="10" r="2.5" fill="#c084fc" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT AREA (TODAY'S HIGHLIGHT + WEATHER CONDITION MAP) */}
                  <div className="[flex:1] [display:flex] [flex-direction:column] [gap:12px] [overflow:hidden]">
                    {/* TOP SECTION: Today's Highlight */}
                    <div className="[display:flex] [flex-direction:column] [gap:8px]">
                      <div className="[font-size:15px] [font-weight:600] [color:#ffffff] [margin-bottom:8px]">Today's Highlight</div>

                      {/* Row 1: 3 Main Highlight Cards */}
                      <div className="[display:grid] [grid-template-columns:repeat(3,_1fr)] [gap:10px]">
                        {/* 1. Wind Status */}
                        <div className="[background:#0c1620] [border:1px_solid_rgba(85,_205,_232,_0.12)] [border-radius:18px] [padding:12px_14px] [height:142px] [display:flex] [flex-direction:column] [justify-content:space-between]">
                          <div className="[font-size:12px] [color:#7d9eaf]">Wind Status</div>
                          {/* Waveform / Bar Chart SVG */}
                          <div className="[height:52px] [margin:2px_0]">
                            <svg viewBox="0 0 200 60" className="[width:100%] [height:100%]">
                              {/* Background vertical bar grid */}
                              {Array.from({ length: 28 }, (_, i) => {
                                const x = 8 + i * 6.8;
                                const h = 10 + Math.sin(i * 0.4) * 8 + (i % 3 === 0 ? 8 : 2);
                                return (
                                  <line
                                    key={i}
                                    x1={x}
                                    y1={55}
                                    x2={x}
                                    y2={55 - h}
                                    stroke="rgba(85, 205, 232, 0.35)"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                  />
                                );
                              })}
                              {/* Foreground smooth curved wave */}
                              <path
                                d="M 8,36 Q 35,18 60,34 T 110,22 T 160,38 T 192,20"
                                fill="none"
                                stroke="#38bdf8"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                              />
                            </svg>
                          </div>
                          <div className="[display:flex] [justify-content:space-between] [align-items:baseline]">
                            <span className="[font-size:24px] [font-weight:600] [color:#ffffff] [letter-spacing:-0.02em]">7.90 <span className="[font-size:12px] [font-weight:400] [color:#7d9eaf]">km/h</span></span>
                            <span className="[font-size:11px] [color:#6a8c9e]">5:01 AM</span>
                          </div>
                        </div>

                        {/* 2. UV Index */}
                        <div className="[background:#0c1620] [border:1px_solid_rgba(85,_205,_232,_0.12)] [border-radius:18px] [padding:12px_14px] [height:142px] [display:flex] [flex-direction:column] [justify-content:space-between]">
                          <div className="[font-size:12px] [color:#7d9eaf]">UV Index</div>
                          {/* Half-Donut Radial Arc Gauge */}
                          <div className="[position:relative] [height:72px] [display:flex] [align-items:center] [justify-content:center]">
                            <svg viewBox="0 0 160 90" className="[width:130px] [height:72px]">
                              {/* Background Arc */}
                              <path
                                d="M 20,80 A 60,60 0 0,1 140,80"
                                fill="none"
                                stroke="rgba(255, 255, 255, 0.08)"
                                strokeWidth="12"
                                strokeLinecap="round"
                              />
                              {/* Foreground Progress Arc (Cyan-to-Blue) */}
                              <path
                                d="M 20,80 A 60,60 0 0,1 92,23"
                                fill="none"
                                stroke="url(#cyanBlueGrad)"
                                strokeWidth="14"
                                strokeLinecap="round"
                                filter="drop-shadow(0 0 8px rgba(56, 189, 248, 0.6))"
                              />
                              <defs>
                                <linearGradient id="cyanBlueGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                  <stop offset="0%" stopColor="#0284c7" />
                                  <stop offset="100%" stopColor="#38bdf8" />
                                </linearGradient>
                              </defs>
                            </svg>
                            <div className="[position:absolute] [bottom:0] [left:50%] [transform:translateX(-50%)] [text-align:center]">
                              <span className="[font-size:24px] [font-weight:600] [color:#ffffff] [letter-spacing:-0.02em]">5.50 <span className="[font-size:12px] [font-weight:400] [color:#7d9eaf]">uv</span></span>
                            </div>
                          </div>
                        </div>

                        {/* 3. Sunrise & Sunset */}
                        <div className="[background:#0c1620] [border:1px_solid_rgba(85,_205,_232,_0.12)] [border-radius:18px] [padding:12px_14px] [height:142px] [display:flex] [flex-direction:column] [justify-content:space-between]">
                          <div className="[font-size:12px] [color:#7d9eaf]">Sunrise &amp; Sunset</div>
                          {/* Parabolic Solar Arc */}
                          <div className="[height:60px]">
                            <svg viewBox="0 0 180 80" className="[width:100%] [height:100%]">
                              {/* Shaded Area Under Curve */}
                              <path
                                d="M 20,70 Q 90,5 160,70 Z"
                                fill="url(#sunAreaGrad)"
                                opacity="0.4"
                              />
                              {/* Dotted Trajectory Line */}
                              <path
                                d="M 20,70 Q 90,5 160,70"
                                fill="none"
                                stroke="#f59e0b"
                                strokeWidth="1.5"
                                strokeDasharray="3 3"
                              />
                              {/* Glowing Sun Icon At Apex */}
                              <circle cx="90" cy="22" r="6" fill="#f59e0b" filter="drop-shadow(0 0 8px #f59e0b)" />
                              <defs>
                                <linearGradient id="sunAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.5" />
                                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                                </linearGradient>
                              </defs>
                            </svg>
                          </div>
                          <div className="[display:flex] [justify-content:space-between] [font-size:10px] [line-height:1.3]">
                            <div className="[display:flex] [flex-direction:column]">
                              <span className="[font-size:12px] [color:#f59e0b]">☼</span>
                              <span className="[color:#6a8b9c]">Sunrise</span>
                              <span className="[color:#ffffff] [font-weight:600]">5:50 AM</span>
                            </div>
                            <div className="[display:flex] [flex-direction:column] [text-align:right]">
                              <span className="[font-size:12px] [color:#f59e0b]">☾</span>
                              <span className="[color:#6a8b9c]">Sunset</span>
                              <span className="[color:#ffffff] [font-weight:600]">6:30 PM</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Row 2: 3 Small Stat Cards */}
                      <div className="[display:grid] [grid-template-columns:repeat(3,_1fr)] [gap:10px]">
                        {/* Humidity */}
                        <div className="[background:#0c1620] [border:1px_solid_rgba(85,_205,_232,_0.1)] [border-radius:16px] [padding:10px_14px] [height:82px] [display:flex] [flex-direction:column] [justify-content:space-between]">
                          <div className="[font-size:11px] [color:#7b9cad]">Humidity</div>
                          <div className="[display:flex] [align-items:baseline] [gap:6px]">
                            <span className="[font-size:22px] [font-weight:600] [color:#ffffff]">84 <span className="[font-size:12px] [font-weight:400] [color:#7b9cad]">%</span></span>
                          </div>
                          <div className="[font-size:10px] [color:#5c7b8c] [white-space:nowrap] [overflow:hidden] [text-overflow:ellipsis]">The dew point is 27° right now</div>
                        </div>

                        {/* Visibility */}
                        <div className="[background:#0c1620] [border:1px_solid_rgba(85,_205,_232,_0.1)] [border-radius:16px] [padding:10px_14px] [height:82px] [display:flex] [flex-direction:column] [justify-content:space-between]">
                          <div className="[font-size:11px] [color:#7b9cad]">Visibility</div>
                          <div className="[display:flex] [align-items:baseline] [gap:6px]">
                            <span className="[font-size:22px] [font-weight:600] [color:#ffffff]">03 <span className="[font-size:12px] [font-weight:400] [color:#7b9cad]">km</span></span>
                          </div>
                          <div className="[font-size:10px] [color:#5c7b8c] [white-space:nowrap] [overflow:hidden] [text-overflow:ellipsis]">Haze is affecting visibility</div>
                        </div>

                        {/* Feels Like */}
                        <div className="[background:#0c1620] [border:1px_solid_rgba(85,_205,_232,_0.1)] [border-radius:16px] [padding:10px_14px] [height:82px] [display:flex] [flex-direction:column] [justify-content:space-between]">
                          <div className="[font-size:11px] [color:#7b9cad]">Feels Like</div>
                          <div className="[display:flex] [align-items:baseline] [gap:6px]">
                            <span className="[font-size:16px] [color:#e88747]">🌡</span>
                            <span className="[font-size:22px] [font-weight:600] [color:#ffffff]">42°</span>
                          </div>
                          <div className="[font-size:10px] [color:#5c7b8c] [white-space:nowrap] [overflow:hidden] [text-overflow:ellipsis]">Humidity is making it feel hotter</div>
                        </div>
                      </div>
                    </div>

                    {/* BOTTOM SECTION: Weather Condition Map */}
                    <div className="[flex:1] [display:flex] [flex-direction:column] [gap:6px] [overflow:hidden]">
                      <div className="[display:flex] [justify-content:space-between] [align-items:center] [margin-bottom:2px]">
                        <div className="[font-size:15px] [font-weight:600] [color:#ffffff] [margin-bottom:8px]">Weather condition map</div>
                        <div className="[display:flex] [align-items:center] [gap:6px] [background:#13222d] [border:1px_solid_#1f3647] [padding:2px_8px] [border-radius:12px] [font-size:10px] [color:#8daab9] [cursor:pointer]">
                          <span>24 hr</span>
                          <span className="[font-size:8px] [color:#6c8a99]">▾</span>
                        </div>
                      </div>

                      {/* Large Interactive Map Container */}
                      <div className="[flex:1] [min-height:250px] [height:250px] [border-radius:20px] [border:1px_solid_rgba(85,_205,_232,_0.14)] [background:#081119] [position:relative] [overflow:hidden]">
                        {/* Top-Left Legend Overlay */}
                        <div className="[position:absolute] [top:14px] [left:16px] [z-index:5] [display:flex] [flex-direction:column] [gap:4px]">
                          <span className="[font-size:10px] [color:#8daab9] [font-weight:500]">Precipitation</span>
                          <div className="[display:flex] [flex-direction:column] [gap:3px]">
                            <div className="[width:140px] [height:5px] [border-radius:3px] [background:linear-gradient(90deg,_#38bdf8_0%,_#0284c7_35%,_#a855f7_70%,_#f97316_100%)]" />
                            <div className="[display:flex] [justify-content:space-between] [width:140px] [font-size:8px] [color:#5a7b8c]">
                              <span>Extreme</span>
                              <span>Heavy</span>
                              <span>Moderate</span>
                              <span>Light</span>
                            </div>
                          </div>
                        </div>

                        {/* Vector Topographic Map Elements */}
                        <svg className="[width:100%] [height:100%] [position:absolute] [inset:0] [object-fit:cover]" viewBox="0 0 600 240">
                          {/* Base dark terrain landmasses */}
                          <path
                            d="M 50,40 Q 120,20 220,50 T 400,30 T 560,90 L 580,220 L 20,220 Z"
                            fill="#0c1822"
                          />
                          {/* Inner coastal swales & lakes */}
                          <path
                            d="M 180,80 Q 230,60 280,100 T 360,110 T 320,190 T 210,180 Z"
                            fill="#081017"
                            stroke="rgba(85, 205, 232, 0.25)"
                            strokeWidth="1.5"
                          />
                          <path
                            d="M 380,110 Q 440,90 490,130 T 470,210 T 390,180 Z"
                            fill="#08131c"
                            stroke="rgba(85, 205, 232, 0.2)"
                            strokeWidth="1.5"
                          />
                          {/* Glowing weather / elevation radar blurs */}
                          <ellipse cx="280" cy="130" rx="36" ry="24" fill="#0284c7" opacity="0.3" filter="blur(10px)" />
                          <ellipse cx="440" cy="145" rx="55" ry="32" fill="#38bdf8" opacity="0.35" filter="blur(14px)" />
                        </svg>

                        {/* Floating Location Marker Pins */}
                        <div className="[position:absolute] [z-index:6] [background:rgba(12,_24,_34,_0.9)] [border:1px_solid_rgba(85,_205,_232,_0.4)] [border-radius:12px] [padding:3px_8px] [display:flex] [align-items:center] [gap:4px] [font-size:11px] [font-weight:600] [color:#ffffff] [box-shadow:0_4px_14px_rgba(0,_0,_0,_0.6)] [top:85px] [left:230px]">
                          <span>23°</span>
                          <span>🌧</span>
                        </div>

                        <div className="[position:absolute] [z-index:6] [background:rgba(12,_24,_34,_0.9)] [border:1px_solid_rgba(85,_205,_232,_0.4)] [border-radius:12px] [padding:3px_8px] [display:flex] [align-items:center] [gap:4px] [font-size:11px] [font-weight:600] [color:#ffffff] [box-shadow:0_4px_14px_rgba(0,_0,_0,_0.6)] [top:100px] [left:360px] [padding:6px_12px] [border-color:#38bdf8] [box-shadow:0_0_20px_rgba(56,_189,_248,_0.4)]">
                          <div className="[position:absolute] [inset:-6px] [border-radius:16px] [border:1.5px_solid_rgba(56,_189,_248,_0.6)] [animation:mapPulse_2s_infinite_ease-out] [pointer-events:none]" />
                          <div className="[display:flex] [flex-direction:column] [align-items:center] [line-height:1.2]">
                            <span className="[font-size:9px] [color:#8daab9]">California</span>
                            <div className="[display:flex] [align-items:center] [gap:4px]">
                              <span>⛅</span>
                              <span className="[font-size:16px] [color:#ffffff]">21°</span>
                            </div>
                            <span className="[font-size:8px] [color:#6a8c9e]">18 / 90%</span>
                          </div>
                        </div>

                        <div className="[position:absolute] [z-index:6] [background:rgba(12,_24,_34,_0.9)] [border:1px_solid_rgba(85,_205,_232,_0.4)] [border-radius:12px] [padding:3px_8px] [display:flex] [align-items:center] [gap:4px] [font-size:11px] [font-weight:600] [color:#ffffff] [box-shadow:0_4px_14px_rgba(0,_0,_0,_0.6)] [bottom:50px] [left:290px]">
                          <span>30°</span>
                          <span>🌤</span>
                        </div>

                        {/* Bottom-Left Location Selection Chips */}
                        <div className="[position:absolute] [bottom:12px] [left:14px] [z-index:12] [display:flex] [gap:8px]">
                          <button className="[background:rgba(12,_24,_34,_0.85)] [border:1px_solid_rgba(85,_205,_232,_0.2)] [border-radius:8px] [padding:5px_10px] [font-size:10px] [color:#8daab9] [cursor:pointer] [display:flex] [align-items:center] [gap:4px] [backdrop-filter:blur(4px)] [transition:all_0.12s_ease] hover:[border-color:#38bdf8] hover:[color:#ffffff] text-white bg-[rgba(18,42,58,0.95)] border-[#38bdf8] shadow-[0_0_10px_rgba(56,189,248,0.3)] hover:[border-color:#38bdf8] hover:[color:#ffffff]">
                            <span className="[font-size:10px]">📍</span>
                            <span>California, US</span>
                          </button>
                          <button className="[background:rgba(12,_24,_34,_0.85)] [border:1px_solid_rgba(85,_205,_232,_0.2)] [border-radius:8px] [padding:5px_10px] [font-size:10px] [color:#8daab9] [cursor:pointer] [display:flex] [align-items:center] [gap:4px] [backdrop-filter:blur(4px)] [transition:all_0.12s_ease] hover:[border-color:#38bdf8] hover:[color:#ffffff] hover:[border-color:#38bdf8] hover:[color:#ffffff]">
                            <span className="[font-size:10px]">📍</span>
                            <span>Texas, US</span>
                          </button>
                          <button className="[background:rgba(12,_24,_34,_0.85)] [border:1px_solid_rgba(85,_205,_232,_0.2)] [border-radius:8px] [padding:5px_10px] [font-size:10px] [color:#8daab9] [cursor:pointer] [display:flex] [align-items:center] [gap:4px] [backdrop-filter:blur(4px)] [transition:all_0.12s_ease] hover:[border-color:#38bdf8] hover:[color:#ffffff] hover:[border-color:#38bdf8] hover:[color:#ffffff]">
                            <span className="[font-size:10px]">📍</span>
                            <span>Florida, US</span>
                          </button>
                        </div>

                        {/* Right-Side Floating Map Zoom & Layer Toolbar */}
                        <div className="[position:absolute] [top:50%] [right:14px] [transform:translateY(-50%)] [z-index:5] [display:flex] [flex-direction:column] [gap:3px] [background:rgba(12,_24,_34,_0.9)] [border:1px_solid_rgba(85,_205,_232,_0.2)] [border-radius:10px] [padding:4px] [backdrop-filter:blur(4px)]">
                          <button className="[width:26px] [height:26px] [background:transparent] [border:none] [color:#8daab9] [font-size:14px] [cursor:pointer] [display:flex] [align-items:center] [justify-content:center] [border-radius:6px] [transition:all_0.1s_ease] hover:[background:rgba(85,_205,_232,_0.15)] hover:[color:#ffffff] hover:[background:rgba(85,_205,_232,_0.15)] hover:[color:#ffffff]" title="Zoom in">+</button>
                          <button className="[width:26px] [height:26px] [background:transparent] [border:none] [color:#8daab9] [font-size:14px] [cursor:pointer] [display:flex] [align-items:center] [justify-content:center] [border-radius:6px] [transition:all_0.1s_ease] hover:[background:rgba(85,_205,_232,_0.15)] hover:[color:#ffffff] hover:[background:rgba(85,_205,_232,_0.15)] hover:[color:#ffffff]" title="Zoom out">−</button>
                          <button className="[width:26px] [height:26px] [background:transparent] [border:none] [color:#8daab9] [font-size:14px] [cursor:pointer] [display:flex] [align-items:center] [justify-content:center] [border-radius:6px] [transition:all_0.1s_ease] hover:[background:rgba(85,_205,_232,_0.15)] hover:[color:#ffffff] hover:[background:rgba(85,_205,_232,_0.15)] hover:[color:#ffffff]" title="Recenter location">⌖</button>
                          <button className="[width:26px] [height:26px] [background:transparent] [border:none] [color:#8daab9] [font-size:14px] [cursor:pointer] [display:flex] [align-items:center] [justify-content:center] [border-radius:6px] [transition:all_0.1s_ease] hover:[background:rgba(85,_205,_232,_0.15)] hover:[color:#ffffff] hover:[background:rgba(85,_205,_232,_0.15)] hover:[color:#ffffff]" title="Layer options">☰</button>
                          <button className="[width:26px] [height:26px] [background:transparent] [border:none] [color:#8daab9] [font-size:14px] [cursor:pointer] [display:flex] [align-items:center] [justify-content:center] [border-radius:6px] [transition:all_0.1s_ease] hover:[background:rgba(85,_205,_232,_0.15)] hover:[color:#ffffff] hover:[background:rgba(85,_205,_232,_0.15)] hover:[color:#ffffff]" title="Map satellite mode">⬡</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* VIEW B: EXTENDED CARTOGRAPHY & ROUTE PLANNING */}
              {activeTab === "cartography" && (
                <div className="[flex:1] [display:flex] [flex-direction:column] [gap:14px] [overflow-y:auto] [padding:6px_10px]">
                  <div>
                    <h2 className="[margin:0_0_4px_0] [font-size:18px] [color:#ffffff] [letter-spacing:0.04em]">MASTER TERRAIN 2KM TOPOGRAPHIC CARTOGRAPHY</h2>
                    <p className="[margin:0] [font-size:12px] [color:#7b9bad]">Tactical satellite elevation and candidate observation waypoint management.</p>
                  </div>
                  <div className="[display:grid] [grid-template-columns:repeat(auto-fill,_minmax(320px,_1fr))] [gap:12px]">
                    {MASTER_TERRAIN_TARGETS.map(t => {
                      const isSelected = selectedMapTarget === t.id;
                      return (
                        <div
                          key={t.id}
                          className={(`[background:#0c1620] [border:1px_solid_rgba(85,_205,_232,_0.15)] [border-radius:16px] [padding:16px] [cursor:pointer] [transition:all_0.15s_ease] hover:[border-color:#38bdf8] hover:[background:#11202e] ${isSelected ? "border border-[#44d788] bg-[rgba(16,46,38,0.5)] shadow-[0_0_16px_rgba(68,215,136,0.25)]" : ""}`) + "hover:[border-color:#38bdf8] hover:[background:#11202e]"}
                          onClick={() => {
                            setSelectedMapTarget(t.id);
                            game?.selectRouteTarget(t.id);
                          }}
                        >
                          <div className="[display:flex] [justify-content:space-between] [align-items:center] [margin-bottom:6px]">
                            <span className="[font-weight:600] [color:#ffffff] [font-size:14px]">{t.name}</span>
                            <span className={`text-[9px] font-bold font-mono px-[6px] py-[2px] rounded-[2px] ${t.hazardRating.toLowerCase() === "low" ? "border border-[#44d788] bg-[rgba(68,215,136,0.2)] text-[#44d788]" : t.hazardRating.toLowerCase() === "moderate" ? "border border-[#f1b344] bg-[rgba(241,179,68,0.2)] text-[#f1b344]" : "border border-[#e88747] bg-[rgba(232,135,71,0.2)] text-[#e88747]"}`}>
                              {t.hazardRating} Hazard
                            </span>
                          </div>
                          <p className="[font-size:12px] [color:#9cbccc] [margin:0_0_8px_0] [line-height:1.4]">{t.description}</p>
                          <div className="[display:flex] [gap:14px] text-[11px] font-mono [color:#6a8c9e] [align-items:center]">
                            <span>Coords: [{t.coordinates.x}, {t.coordinates.z}]</span>
                            <span>Est: {t.distanceEstimate}</span>
                            {state.selectedRouteTargetId === t.id && (
                              <span className="[color:#44d788] [font-weight:bold] [margin-left:auto]">✓ CONFIRMED ROUTE</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* VIEW C: SCOUT DRONE 01 FPV CONSOLE */}
              {activeTab === "drone" && (
                <div className="[flex:1] [display:flex] [flex-direction:column] [gap:14px] [overflow-y:auto] [padding:6px_10px]">
                  <div>
                    <h2 className="[margin:0_0_4px_0] [font-size:18px] [color:#ffffff] [letter-spacing:0.04em]">SCOUT DRONE 01 — REMOTE RECONNAISSANCE OPERATIONS</h2>
                    <p className="[margin:0] [font-size:12px] [color:#7b9bad]">8.4 GHz X-band encrypted uplink to Martian terrain reconnaissance drone.</p>
                  </div>
                  <div className="[display:grid] [grid-template-columns:repeat(auto-fit,_minmax(320px,_1fr))] [gap:14px]">
                    <div className="[background:#0c1620] [border:1px_solid_rgba(85,_205,_232,_0.15)] [border-radius:16px] [padding:18px]">
                      <h3 className="[margin:0_0_12px_0] [font-size:13px] [color:#38bdf8] [letter-spacing:0.06em]">TELEMETRY STATUS</h3>
                      <div className="[display:flex] [justify-content:space-between] text-[12px] font-mono [padding:6px_0] [border-bottom:1px_solid_rgba(255,_255,_255,_0.05)]"><span>BATTERY</span><span className="[color:#e88747]">88% (42 MIN)</span></div>
                      <div className="[display:flex] [justify-content:space-between] text-[12px] font-mono [padding:6px_0] [border-bottom:1px_solid_rgba(255,_255,_255,_0.05)]"><span>SIGNAL QUALITY</span><span className="[border-color:#44d788] [color:#44d788]">96% (-68 dBm)</span></div>
                      <div className="[display:flex] [justify-content:space-between] text-[12px] font-mono [padding:6px_0] [border-bottom:1px_solid_rgba(255,_255,_255,_0.05)]"><span>LAUNCH POSITION</span><span>[470.0, 1.0, -58.7]</span></div>
                      <div className="[display:flex] [justify-content:space-between] text-[12px] font-mono [padding:6px_0] [border-bottom:1px_solid_rgba(255,_255,_255,_0.05)]"><span>SURVEY SECTOR</span><span>SITE GAMMA ESCARPMENT</span></div>
                      <div className="[display:flex] [justify-content:space-between] text-[12px] font-mono [padding:6px_0] [border-bottom:1px_solid_rgba(255,_255,_255,_0.05)]">
                        <span>MISSION RECORD</span>
                        <span className={state.droneSurvey ? "[border-color:#44d788] [color:#44d788]" : "[color:#f1b344]"}>
                          {state.droneSurvey ? "CAPTURED & ARCHIVED" : "PENDING SORTIE"}
                        </span>
                      </div>
                    </div>

                    <div className="[background:#0c1620] [border:1px_solid_rgba(85,_205,_232,_0.15)] [border-radius:16px] [padding:18px]">
                      <h3 className="[margin:0_0_12px_0] [font-size:13px] [color:#38bdf8] [letter-spacing:0.06em]">REMOTE FPV SORTIE LAUNCH</h3>
                      <p>
                        Deploy the scout drone from its landing dock to conduct high-resolution aerial scans of the canyon fault line and south escarpment.
                      </p>
                      {state.missionDay === 9 ? (
                        <button
                          className="[background:#e88747] [color:#071016] [border:none] text-[12px] font-bold font-mono [padding:10px_18px] [border-radius:4px] [cursor:pointer] [letter-spacing:0.06em] [margin-top:10px] [transition:all_0.15s_ease] hover:[background:#ff9b57] hover:[box-shadow:0_0_14px_rgba(232,_135,_71,_0.5)] hover:[background:#ff9b57] hover:[box-shadow:0_0_14px_rgba(232,_135,_71,_0.5)]"
                          onClick={() => {
                            onClose();
                            void game?.startDroneFPV();
                          }}
                        >
                          🛸 ENGAGE REMOTE DRONE FPV FLIGHT
                        </button>
                      ) : (
                        <div className="[font-size:12px] [color:#7a9bad] [font-style:italic] [margin-top:10px]">
                          Scout Drone sorties are scheduled for Sol 09. Current Sol: 0{state.missionDay}.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* VIEW D: ECLSS & POWER MICROGRID */}
              {activeTab === "subsystems" && (
                <div className="[flex:1] [display:flex] [flex-direction:column] [gap:14px] [overflow-y:auto] [padding:6px_10px]">
                  <div>
                    <h2 className="[margin:0_0_4px_0] [font-size:18px] [color:#ffffff] [letter-spacing:0.04em]">ECLSS LIFE SUPPORT &amp; ENGINEERING POWER MICROGRID</h2>
                    <p className="[margin:0] [font-size:12px] [color:#7b9bad]">Integrated base life support loop, Sabatier reactor, and photovoltaic array capture.</p>
                  </div>
                  <div className="[display:grid] [grid-template-columns:repeat(auto-fit,_minmax(320px,_1fr))] [gap:14px]">
                    <div className="[background:#0c1620] [border:1px_solid_rgba(85,_205,_232,_0.15)] [border-radius:16px] [padding:18px]">
                      <h3 className="[margin:0_0_12px_0] [font-size:13px] [color:#38bdf8] [letter-spacing:0.06em]">CABIN ATMOSPHERE</h3>
                      <div className="[display:flex] [justify-content:space-between] text-[12px] font-mono [padding:6px_0] [border-bottom:1px_solid_rgba(255,_255,_255,_0.05)]"><span>OXYGEN (O₂)</span><span className="[border-color:#44d788] [color:#44d788]">21.0% (NOMINAL)</span></div>
                      <div className="[display:flex] [justify-content:space-between] text-[12px] font-mono [padding:6px_0] [border-bottom:1px_solid_rgba(255,_255,_255,_0.05)]"><span>NITROGEN (N₂)</span><span>78.2% (BALANCE)</span></div>
                      <div className="[display:flex] [justify-content:space-between] text-[12px] font-mono [padding:6px_0] [border-bottom:1px_solid_rgba(255,_255,_255,_0.05)]"><span>CARBON DIOXIDE</span><span className="[border-color:#44d788] [color:#44d788]">0.04% (SCRUBBED)</span></div>
                      <div className="[display:flex] [justify-content:space-between] text-[12px] font-mono [padding:6px_0] [border-bottom:1px_solid_rgba(255,_255,_255,_0.05)]"><span>CABIN PRESSURE</span><span className="[border-color:#44d788] [color:#44d788]">101.3 kPa</span></div>
                      <div className="[display:flex] [justify-content:space-between] text-[12px] font-mono [padding:6px_0] [border-bottom:1px_solid_rgba(255,_255,_255,_0.05)]"><span>TEMPERATURE</span><span>21.4 °C</span></div>
                    </div>

                    <div className="[background:#0c1620] [border:1px_solid_rgba(85,_205,_232,_0.15)] [border-radius:16px] [padding:18px]">
                      <h3 className="[margin:0_0_12px_0] [font-size:13px] [color:#38bdf8] [letter-spacing:0.06em]">POWER GENERATION</h3>
                      <div className="[display:flex] [justify-content:space-between] text-[12px] font-mono [padding:6px_0] [border-bottom:1px_solid_rgba(255,_255,_255,_0.05)]"><span>SOLAR ARRAY A</span><span className="[color:#e88747]">16.4 kW</span></div>
                      <div className="[display:flex] [justify-content:space-between] text-[12px] font-mono [padding:6px_0] [border-bottom:1px_solid_rgba(255,_255,_255,_0.05)]"><span>SOLAR ARRAY B</span><span className="[color:#e88747]">16.1 kW</span></div>
                      <div className="[display:flex] [justify-content:space-between] text-[12px] font-mono [padding:6px_0] [border-bottom:1px_solid_rgba(255,_255,_255,_0.05)]"><span>SOLAR ARRAY C</span><span className="[color:#e88747]">16.1 kW</span></div>
                      <div className="[display:flex] [justify-content:space-between] text-[12px] font-mono [padding:6px_0] [border-bottom:1px_solid_rgba(255,_255,_255,_0.05)]"><span>CAPACITOR BANK</span><span className="[border-color:#44d788] [color:#44d788]">96.2%</span></div>
                      <div className="[display:flex] [justify-content:space-between] text-[12px] font-mono [padding:6px_0] [border-bottom:1px_solid_rgba(255,_255,_255,_0.05)]"><span>NET SURPLUS</span><span className="[border-color:#44d788] [color:#44d788]">+22.0 kW</span></div>
                    </div>
                  </div>
                </div>
              )}

              {/* VIEW E: EXPEDITION TIMELINE */}
              {activeTab === "timeline" && (
                <div className="[flex:1] [display:flex] [flex-direction:column] [gap:14px] [overflow-y:auto] [padding:6px_10px]">
                  <div>
                    <h2 className="[margin:0_0_4px_0] [font-size:18px] [color:#ffffff] [letter-spacing:0.04em]">PHOBOSIA EXPEDITION CAMPAIGN SCHEDULE (DAYS 1–9)</h2>
                    <p className="[margin:0] [font-size:12px] [color:#7b9bad]">Review objectives, verified milestones, and prerequisites for each Sol.</p>
                  </div>
                  <div className="[display:flex] [gap:8px] [overflow-x:auto] [padding-bottom:4px]">
                    {Array.from({ length: 9 }, (_, i) => i + 1).map(d => (
                      <button
                        key={d}
                        className={`[background:#0c1620] [border:1px_solid_#1a3243] [padding:8px_14px] [border-radius:12px] [cursor:pointer] [display:flex] [flex-direction:column] [gap:2px] [text-align:center] [min-width:80px] ${d === timelineDay ? "border-[#38bdf8] bg-[#152b3d]" : ""}`}
                        onClick={() => setTimelineDay(d)}
                      >
                        <span>SOL 0{d}</span>
                        <span className={`text-[9px] font-mono ${d < state.missionDay ? "text-[#44d788]" : d === state.missionDay ? "text-[#f1b344]" : "text-[#6a8c9e]"}`}>
                          {d < state.missionDay ? "ARCHIVED" : d === state.missionDay ? "ACTIVE" : "PENDING"}
                        </span>
                      </button>
                    ))}
                  </div>

                  {(() => {
                    const m = DAYS_CONFIG[timelineDay as MissionDayNumber];
                    return (
                      <div className="[background:#0c1620] [border:1px_solid_rgba(85,_205,_232,_0.15)] [border-radius:16px] [padding:18px]">
                        <h3>SOL 0{timelineDay} — {m.title.toUpperCase()}</h3>
                        <p className="[color:#b0cddb] [font-size:13px] [line-height:1.5] [margin:6px_0_12px_0]">{m.briefing}</p>
                        <div className="[display:flex] [justify-content:space-between] text-[12px] font-mono [padding:6px_0] [border-bottom:1px_solid_rgba(255,_255,_255,_0.05)]"><span>PRIMARY OBJECTIVE</span><span className="[color:#e88747]">{m.primaryObjective}</span></div>
                        <div className="[display:flex] [justify-content:space-between] text-[12px] font-mono [padding:6px_0] [border-bottom:1px_solid_rgba(255,_255,_255,_0.05)]"><span>AUTHORIZED MODULES</span><span>{m.allowedModules.join(", ")}</span></div>
                        <div className="[margin-top:14px]">
                          <h4 className="text-[11px] font-bold font-mono [color:#e88747] [margin:0_0_8px_0]">OPERATIONAL CHECKLIST STEPS</h4>
                          {m.steps.map((s, idx) => (
                            <div key={s.stepId} className="[display:flex] [gap:8px] [font-size:12px] [padding:4px_0] [color:#9cbccc]">
                              <span className="[font-weight:bold] [color:#38bdf8]">{idx + 1}.</span>
                              <span className="[font-weight:600] [color:#ffffff]">{s.label}</span>
                              <span className="desc">{s.description}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* VIEW F: SYSTEM DIAGNOSTICS */}
              {activeTab === "diagnostics" && (
                <div className="[flex:1] [display:flex] [flex-direction:column] [gap:14px] [overflow-y:auto] [padding:6px_10px]">
                  <div>
                    <h2 className="[margin:0_0_4px_0] [font-size:18px] [color:#ffffff] [letter-spacing:0.04em]">HARDWARE BUS DIAGNOSTICS &amp; LOG</h2>
                    <p className="[margin:0] [font-size:12px] [color:#7b9bad]">System parity checking, real-time sensor verification, and kernel event stream.</p>
                  </div>
                  <div className="[display:flex] [align-items:center] [gap:14px] [margin-bottom:12px]">
                    <button className="[background:#e88747] [color:#071016] [border:none] text-[12px] font-bold font-mono [padding:10px_18px] [border-radius:4px] [cursor:pointer] [letter-spacing:0.06em] [margin-top:10px] [transition:all_0.15s_ease] hover:[background:#ff9b57] hover:[box-shadow:0_0_14px_rgba(232,_135,_71,_0.5)] hover:[background:#ff9b57] hover:[box-shadow:0_0_14px_rgba(232,_135,_71,_0.5)]" disabled={diagRun} onClick={runDiagnostics}>
                      {diagRun ? "SCANNING SENSOR BUS..." : "RUN FULL SYSTEM DIAGNOSTIC"}
                    </button>
                    <span className="text-[11px] font-mono [color:#44d788]">{diagStatus}</span>
                  </div>
                  <div className="[background:#070d13] [border:1px_solid_#182f40] [border-radius:12px] [padding:14px] [display:flex] [flex-direction:column] [gap:6px] text-[11px] font-mono [max-height:320px] [overflow-y:auto]">
                    <div className="[color:#7b9cad]">[00:01:14] Station boot sequence verified. Kernel 4.19.0-phobos.</div>
                    <div className="[color:#7b9cad]">[00:01:28] Habitat ECLSS pressure balance calibrated at 101.3 kPa.</div>
                    <div className="[color:#7b9cad]">[00:02:05] Central Hub transit corridors sealed and pressurized.</div>
                    <div className="[color:#44d788]">[00:04:19] UV planar reprojection active across all physical monitors.</div>
                    <div className="[color:#44d788]">[00:05:01] Segmented wall colliders validated for Central Hub &amp; Science Lab.</div>
                    <div className="[color:#7b9cad]">[00:06:12] Outdoor EXR equirectangular skybox synchronized with Master Terrain.</div>
                    <div className="[color:#44d788]">[00:07:33] Sol 0{state.missionDay} mission manager state verified.</div>
                  </div>
                </div>
              )}
            </main>
          </div>
        </div>
      )}
    </div>
  );
}
