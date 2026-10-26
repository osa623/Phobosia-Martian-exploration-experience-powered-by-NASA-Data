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
    <div className={`os-viewport-overlay ${isMinimized ? "minimized" : ""}`}>
      {/* MINIMIZED RESTORE PILL */}
      {isMinimized && (
        <button
          className="os-minimized-pill"
          onClick={() => setIsMinimized(false)}
          title="Restore PHOBOSIA OS"
        >
          <span className="os-starburst">✦</span>
          <span>PHOBOSIA OS · RESTORE</span>
        </button>
      )}

      {/* MAIN TABLET FRAME (EXACT REFERENCE 1 CONTAINER) */}
      {!isMinimized && (
        <div className={`os-tablet-frame ${isMaximized ? "maximized" : "standard"}`}>
          {/* WINDOW TOP-BAR CONTROLS */}
          <div className="os-window-header-actions">
            <div className="os-header-breadcrumbs">
              <span className="os-header-tag">PHOBOSIA OS</span>
              <span className="os-header-sep">/</span>
              <span className="os-header-sub">
                {activeTab === "dashboard" && "STATION OPERATIONS"}
                {activeTab === "cartography" && "SURFACE CARTOGRAPHY"}
                {activeTab === "drone" && "SCOUT DRONE 01 FPV"}
                {activeTab === "subsystems" && "ECLSS & POWER GRID"}
                {activeTab === "timeline" && "EXPEDITION TIMELINE"}
                {activeTab === "diagnostics" && "SYSTEM DIAGNOSTICS"}
              </span>
            </div>
            <div className="os-win-btn-group">
              <button
                className="os-win-btn min"
                onClick={() => setIsMinimized(true)}
                title="Minimize window"
              >
                ─
              </button>
              <button
                className="os-win-btn max"
                onClick={() => setIsMaximized(!isMaximized)}
                title={isMaximized ? "Restore standard size" : "Maximize window"}
              >
                {isMaximized ? "❐" : "□"}
              </button>
              <button
                className="os-win-btn close"
                onClick={onClose}
                title="Logout & Return to First-Person View [ESC]"
              >
                ✕
              </button>
            </div>
          </div>

          {/* MAIN TWO-COLUMN + RAIL WORKSPACE */}
          <div className="os-frame-body">
            {/* 1. LEFT NAVIGATION RAIL */}
            <nav className="os-nav-rail" aria-label="System Navigation">
              {/* Logo / Brand Mark */}
              <div className="os-rail-logo" title="PHOBOSIA Expedition Operating System">
                <div className="os-starburst-icon">✦</div>
                <span className="os-logo-text">Weathry</span>
              </div>

              {/* Vertical Navigation Icons */}
              <div className="os-rail-menu">
                {/* 1. Dashboard / Grid (Active by default) */}
                <button
                  className={`os-rail-btn ${activeTab === "dashboard" ? "active" : ""}`}
                  onClick={() => setActiveTab("dashboard")}
                  title="Station Dashboard (Overview & Atmosphere)"
                >
                  {activeTab === "dashboard" && <span className="os-rail-active-indicator" />}
                  <svg className="os-svg-icon" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="3" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="3" width="7" height="7" rx="1.5" />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" />
                    <rect x="14" y="14" width="7" height="7" rx="1.5" />
                  </svg>
                </button>

                {/* 2. Folded Map */}
                <button
                  className={`os-rail-btn ${activeTab === "cartography" ? "active" : ""}`}
                  onClick={() => setActiveTab("cartography")}
                  title="Master Terrain Cartography & Route Planning"
                >
                  {activeTab === "cartography" && <span className="os-rail-active-indicator" />}
                  <svg className="os-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                    <line x1="8" y1="2" x2="8" y2="18" />
                    <line x1="16" y1="6" x2="16" y2="22" />
                  </svg>
                </button>

                {/* 3. Target / Crosshairs */}
                <button
                  className={`os-rail-btn ${activeTab === "drone" ? "active" : ""}`}
                  onClick={() => setActiveTab("drone")}
                  title="Scout Drone 01 & Remote Reconnaissance"
                >
                  {activeTab === "drone" && <span className="os-rail-active-indicator" />}
                  <svg className="os-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                  className={`os-rail-btn ${activeTab === "subsystems" ? "active" : ""}`}
                  onClick={() => setActiveTab("subsystems")}
                  title="Habitat ECLSS Life Support & Power Microgrid"
                >
                  {activeTab === "subsystems" && <span className="os-rail-active-indicator" />}
                  <svg className="os-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                </button>

                {/* 5. Calendar / Timeline */}
                <button
                  className={`os-rail-btn ${activeTab === "timeline" ? "active" : ""}`}
                  onClick={() => setActiveTab("timeline")}
                  title="Expedition Timeline (Sol 1 to 9)"
                >
                  {activeTab === "timeline" && <span className="os-rail-active-indicator" />}
                  <svg className="os-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </button>

                {/* 6. Settings / Diagnostics */}
                <button
                  className={`os-rail-btn ${activeTab === "diagnostics" ? "active" : ""}`}
                  onClick={() => setActiveTab("diagnostics")}
                  title="Subsystem Diagnostics & Event Log"
                >
                  {activeTab === "diagnostics" && <span className="os-rail-active-indicator" />}
                  <svg className="os-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>
              </div>

              {/* Bottom Notification & User Profile */}
              <div className="os-rail-bottom">
                <button className="os-rail-btn notif-btn" title="Unread Mission Notifications">
                  <span className="os-notif-dot" />
                  <svg className="os-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </button>
                <div className="os-user-avatar" title="Astronaut / Mission Specialist">
                  <div className="os-avatar-img" />
                </div>
              </div>
            </nav>

            {/* 2. MAIN CONTENT REGION */}
            <main className="os-main-region">
              {/* VIEW A: EXACT MATCH TO REFERENCE IMAGE 1 (DASHBOARD) */}
              {activeTab === "dashboard" && (
                <div className="os-dashboard-layout">
                  {/* LEFT COLUMN (SOL OVERVIEW + 7-SOL FORECAST) */}
                  <div className="os-left-column">
                    {/* TOP CARD: Sol Weather & Environmental Overview */}
                    <div className="os-weather-card">
                      <div className="os-weather-card-top">
                        <div className="os-weather-icon-wrap">
                          {/* Weather Feature Graphic (Sun + Storm Cloud + Lightning) */}
                          <svg className="os-weather-hero-svg" viewBox="0 0 64 64">
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
                        <button className="os-search-icon-btn" title="Search Telemetry Archives">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </svg>
                        </button>
                      </div>

                      {/* Large Metric Display */}
                      <div className="os-temp-display">
                        <span className="os-temp-number">28</span>
                        <span className="os-temp-degree">°c</span>
                      </div>

                      {/* Condition Text */}
                      <div className="os-weather-condition">
                        <svg className="os-condition-glyph" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
                        </svg>
                        <span>Rainy Storm Clouds</span>
                      </div>

                      <div className="os-weather-divider" />

                      {/* Location & Time Info */}
                      <div className="os-weather-meta">
                        <div className="os-meta-row">
                          <svg className="os-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          <span>Florida, US</span>
                        </div>
                        <div className="os-meta-row">
                          <svg className="os-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          <span>24 July, 2022 5:01 AM</span>
                        </div>
                      </div>
                    </div>

                    {/* BOTTOM CARD: 7 Days Forecast */}
                    <div className="os-forecast-card">
                      <div className="os-card-header-row">
                        <h3 className="os-card-title">7 days Forecast</h3>
                        <div className="os-dropdown-pill">
                          <span>7 day</span>
                          <span className="os-arrow">▾</span>
                        </div>
                      </div>

                      {/* Forecast Rows */}
                      <div className="os-forecast-list">
                        <div className="os-forecast-row">
                          <span className="os-row-icon sun-cloud">⛅</span>
                          <span className="os-row-temp">+29°<span className="sub">/+18</span></span>
                          <span className="os-row-date">25 July</span>
                          <span className="os-row-day">Tuesday</span>
                        </div>
                        <div className="os-forecast-row">
                          <span className="os-row-icon storm">⛈️</span>
                          <span className="os-row-temp">+21°<span className="sub">/+16</span></span>
                          <span className="os-row-date">26 July</span>
                          <span className="os-row-day">Wednesday</span>
                        </div>
                        <div className="os-forecast-row">
                          <span className="os-row-icon rain">🌧️</span>
                          <span className="os-row-temp">+24°<span className="sub">/+20</span></span>
                          <span className="os-row-date">27 July</span>
                          <span className="os-row-day">Thursday</span>
                        </div>
                        <div className="os-forecast-row">
                          <span className="os-row-icon sun-cloud">🌤️</span>
                          <span className="os-row-temp">+30°<span className="sub">/+17</span></span>
                          <span className="os-row-date">28 July</span>
                          <span className="os-row-day">Friday</span>
                        </div>
                      </div>

                      {/* Bottom Mini Highlight Sub-Card ("Tomorrow") */}
                      <div className="os-tomorrow-preview">
                        <div className="os-tomorrow-left">
                          <div className="os-tomorrow-icon">⛈️</div>
                          <div className="os-tomorrow-info">
                            <span className="os-tomorrow-label">Tomorrow</span>
                            <div className="os-tomorrow-temp">23°</div>
                            <span className="os-tomorrow-desc">Thunder Storm day</span>
                          </div>
                        </div>
                        {/* Sparkline Trend Graph */}
                        <div className="os-tomorrow-sparkline">
                          <svg viewBox="0 0 100 40" className="os-sparkline-svg">
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
                  <div className="os-right-column">
                    {/* TOP SECTION: Today's Highlight */}
                    <div className="os-highlight-section">
                      <div className="os-section-title">Today's Highlight</div>

                      {/* Row 1: 3 Main Highlight Cards */}
                      <div className="os-highlight-grid-top">
                        {/* 1. Wind Status */}
                        <div className="os-highlight-card">
                          <div className="os-hl-title">Wind Status</div>
                          {/* Waveform / Bar Chart SVG */}
                          <div className="os-wave-chart-container">
                            <svg viewBox="0 0 200 60" className="os-wave-svg">
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
                          <div className="os-hl-bottom">
                            <span className="os-hl-big">7.90 <span className="os-hl-unit">km/h</span></span>
                            <span className="os-hl-sub">5:01 AM</span>
                          </div>
                        </div>

                        {/* 2. UV Index */}
                        <div className="os-highlight-card">
                          <div className="os-hl-title">UV Index</div>
                          {/* Half-Donut Radial Arc Gauge */}
                          <div className="os-radial-gauge-container">
                            <svg viewBox="0 0 160 90" className="os-radial-svg">
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
                            <div className="os-gauge-center-value">
                              <span className="os-hl-big">5.50 <span className="os-hl-unit">uv</span></span>
                            </div>
                          </div>
                        </div>

                        {/* 3. Sunrise & Sunset */}
                        <div className="os-highlight-card">
                          <div className="os-hl-title">Sunrise &amp; Sunset</div>
                          {/* Parabolic Solar Arc */}
                          <div className="os-sun-trajectory-container">
                            <svg viewBox="0 0 180 80" className="os-trajectory-svg">
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
                          <div className="os-sun-time-row">
                            <div className="os-sun-col">
                              <span className="os-sun-icon">☼</span>
                              <span className="os-sun-lbl">Sunrise</span>
                              <span className="os-sun-val">5:50 AM</span>
                            </div>
                            <div className="os-sun-col right">
                              <span className="os-sun-icon">☾</span>
                              <span className="os-sun-lbl">Sunset</span>
                              <span className="os-sun-val">6:30 PM</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Row 2: 3 Small Stat Cards */}
                      <div className="os-highlight-grid-bottom">
                        {/* Humidity */}
                        <div className="os-stat-mini-card">
                          <div className="os-mini-title">Humidity</div>
                          <div className="os-mini-val-row">
                            <span className="os-mini-big">84 <span className="os-mini-unit">%</span></span>
                          </div>
                          <div className="os-mini-sub">The dew point is 27° right now</div>
                        </div>

                        {/* Visibility */}
                        <div className="os-stat-mini-card">
                          <div className="os-mini-title">Visibility</div>
                          <div className="os-mini-val-row">
                            <span className="os-mini-big">03 <span className="os-mini-unit">km</span></span>
                          </div>
                          <div className="os-mini-sub">Haze is affecting visibility</div>
                        </div>

                        {/* Feels Like */}
                        <div className="os-stat-mini-card">
                          <div className="os-mini-title">Feels Like</div>
                          <div className="os-mini-val-row">
                            <span className="os-thermometer-glyph">🌡</span>
                            <span className="os-mini-big">42°</span>
                          </div>
                          <div className="os-mini-sub">Humidity is making it feel hotter</div>
                        </div>
                      </div>
                    </div>

                    {/* BOTTOM SECTION: Weather Condition Map */}
                    <div className="os-map-section">
                      <div className="os-card-header-row">
                        <div className="os-section-title">Weather condition map</div>
                        <div className="os-dropdown-pill">
                          <span>24 hr</span>
                          <span className="os-arrow">▾</span>
                        </div>
                      </div>

                      {/* Large Interactive Map Container */}
                      <div className="os-map-canvas-wrap">
                        {/* Top-Left Legend Overlay */}
                        <div className="os-map-legend">
                          <span className="os-legend-title">Precipitation</span>
                          <div className="os-legend-bar-wrap">
                            <div className="os-legend-bar" />
                            <div className="os-legend-labels">
                              <span>Extreme</span>
                              <span>Heavy</span>
                              <span>Moderate</span>
                              <span>Light</span>
                            </div>
                          </div>
                        </div>

                        {/* Vector Topographic Map Elements */}
                        <svg className="os-map-vector-svg" viewBox="0 0 600 240">
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
                        <div className="os-map-pin pin-1">
                          <span className="pin-temp">23°</span>
                          <span className="pin-icon">🌧</span>
                        </div>

                        <div className="os-map-pin pin-primary">
                          <div className="pin-pulse" />
                          <div className="pin-card">
                            <span className="pin-city">California</span>
                            <div className="pin-row">
                              <span className="pin-icon">⛅</span>
                              <span className="pin-temp-big">21°</span>
                            </div>
                            <span className="pin-sub">18 / 90%</span>
                          </div>
                        </div>

                        <div className="os-map-pin pin-3">
                          <span className="pin-temp">30°</span>
                          <span className="pin-icon">🌤</span>
                        </div>

                        {/* Bottom-Left Location Selection Chips */}
                        <div className="os-map-location-chips">
                          <button className="os-loc-chip active">
                            <span className="os-loc-icon">📍</span>
                            <span>California, US</span>
                          </button>
                          <button className="os-loc-chip">
                            <span className="os-loc-icon">📍</span>
                            <span>Texas, US</span>
                          </button>
                          <button className="os-loc-chip">
                            <span className="os-loc-icon">📍</span>
                            <span>Florida, US</span>
                          </button>
                        </div>

                        {/* Right-Side Floating Map Zoom & Layer Toolbar */}
                        <div className="os-map-toolbar">
                          <button className="os-map-tool-btn" title="Zoom in">+</button>
                          <button className="os-map-tool-btn" title="Zoom out">−</button>
                          <button className="os-map-tool-btn" title="Recenter location">⌖</button>
                          <button className="os-map-tool-btn" title="Layer options">☰</button>
                          <button className="os-map-tool-btn" title="Map satellite mode">⬡</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* VIEW B: EXTENDED CARTOGRAPHY & ROUTE PLANNING */}
              {activeTab === "cartography" && (
                <div className="os-alt-workspace">
                  <div className="os-workspace-header">
                    <h2>MASTER TERRAIN 2KM TOPOGRAPHIC CARTOGRAPHY</h2>
                    <p>Tactical satellite elevation and candidate observation waypoint management.</p>
                  </div>
                  <div className="os-targets-grid">
                    {MASTER_TERRAIN_TARGETS.map(t => {
                      const isSelected = selectedMapTarget === t.id;
                      return (
                        <div
                          key={t.id}
                          className={`os-target-card ${isSelected ? "selected" : ""}`}
                          onClick={() => {
                            setSelectedMapTarget(t.id);
                            game?.selectRouteTarget(t.id);
                          }}
                        >
                          <div className="os-tc-header">
                            <span className="os-tc-name">{t.name}</span>
                            <span className={`os-tc-hazard ${t.hazardRating.toLowerCase()}`}>
                              {t.hazardRating} Hazard
                            </span>
                          </div>
                          <p className="os-tc-desc">{t.description}</p>
                          <div className="os-tc-meta">
                            <span>Coords: [{t.coordinates.x}, {t.coordinates.z}]</span>
                            <span>Est: {t.distanceEstimate}</span>
                            {state.selectedRouteTargetId === t.id && (
                              <span className="os-tc-confirmed">✓ CONFIRMED ROUTE</span>
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
                <div className="os-alt-workspace">
                  <div className="os-workspace-header">
                    <h2>SCOUT DRONE 01 — REMOTE RECONNAISSANCE OPERATIONS</h2>
                    <p>8.4 GHz X-band encrypted uplink to Martian terrain reconnaissance drone.</p>
                  </div>
                  <div className="os-drone-dashboard">
                    <div className="os-drone-card">
                      <h3>TELEMETRY STATUS</h3>
                      <div className="os-kv-line"><span>BATTERY</span><span className="accent">88% (42 MIN)</span></div>
                      <div className="os-kv-line"><span>SIGNAL QUALITY</span><span className="success">96% (-68 dBm)</span></div>
                      <div className="os-kv-line"><span>LAUNCH POSITION</span><span>[470.0, 1.0, -58.7]</span></div>
                      <div className="os-kv-line"><span>SURVEY SECTOR</span><span>SITE GAMMA ESCARPMENT</span></div>
                      <div className="os-kv-line">
                        <span>MISSION RECORD</span>
                        <span className={state.droneSurvey ? "success" : "warn"}>
                          {state.droneSurvey ? "CAPTURED & ARCHIVED" : "PENDING SORTIE"}
                        </span>
                      </div>
                    </div>

                    <div className="os-drone-card">
                      <h3>REMOTE FPV SORTIE LAUNCH</h3>
                      <p>
                        Deploy the scout drone from its landing dock to conduct high-resolution aerial scans of the canyon fault line and south escarpment.
                      </p>
                      {state.missionDay === 9 ? (
                        <button
                          className="os-primary-action-btn"
                          onClick={() => {
                            onClose();
                            void game?.startDroneFPV();
                          }}
                        >
                          🛸 ENGAGE REMOTE DRONE FPV FLIGHT
                        </button>
                      ) : (
                        <div className="os-standby-notice">
                          Scout Drone sorties are scheduled for Sol 09. Current Sol: 0{state.missionDay}.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* VIEW D: ECLSS & POWER MICROGRID */}
              {activeTab === "subsystems" && (
                <div className="os-alt-workspace">
                  <div className="os-workspace-header">
                    <h2>ECLSS LIFE SUPPORT &amp; ENGINEERING POWER MICROGRID</h2>
                    <p>Integrated base life support loop, Sabatier reactor, and photovoltaic array capture.</p>
                  </div>
                  <div className="os-subsystems-grid">
                    <div className="os-subsys-card">
                      <h3>CABIN ATMOSPHERE</h3>
                      <div className="os-kv-line"><span>OXYGEN (O₂)</span><span className="success">21.0% (NOMINAL)</span></div>
                      <div className="os-kv-line"><span>NITROGEN (N₂)</span><span>78.2% (BALANCE)</span></div>
                      <div className="os-kv-line"><span>CARBON DIOXIDE</span><span className="success">0.04% (SCRUBBED)</span></div>
                      <div className="os-kv-line"><span>CABIN PRESSURE</span><span className="success">101.3 kPa</span></div>
                      <div className="os-kv-line"><span>TEMPERATURE</span><span>21.4 °C</span></div>
                    </div>

                    <div className="os-subsys-card">
                      <h3>POWER GENERATION</h3>
                      <div className="os-kv-line"><span>SOLAR ARRAY A</span><span className="accent">16.4 kW</span></div>
                      <div className="os-kv-line"><span>SOLAR ARRAY B</span><span className="accent">16.1 kW</span></div>
                      <div className="os-kv-line"><span>SOLAR ARRAY C</span><span className="accent">16.1 kW</span></div>
                      <div className="os-kv-line"><span>CAPACITOR BANK</span><span className="success">96.2%</span></div>
                      <div className="os-kv-line"><span>NET SURPLUS</span><span className="success">+22.0 kW</span></div>
                    </div>
                  </div>
                </div>
              )}

              {/* VIEW E: EXPEDITION TIMELINE */}
              {activeTab === "timeline" && (
                <div className="os-alt-workspace">
                  <div className="os-workspace-header">
                    <h2>PHOBOSIA EXPEDITION CAMPAIGN SCHEDULE (DAYS 1–9)</h2>
                    <p>Review objectives, verified milestones, and prerequisites for each Sol.</p>
                  </div>
                  <div className="os-timeline-pills-row">
                    {Array.from({ length: 9 }, (_, i) => i + 1).map(d => (
                      <button
                        key={d}
                        className={`os-time-pill ${d === timelineDay ? "active" : ""} ${d < state.missionDay ? "past" : d === state.missionDay ? "current" : "future"}`}
                        onClick={() => setTimelineDay(d)}
                      >
                        <span>SOL 0{d}</span>
                        <span className="status">
                          {d < state.missionDay ? "ARCHIVED" : d === state.missionDay ? "ACTIVE" : "PENDING"}
                        </span>
                      </button>
                    ))}
                  </div>

                  {(() => {
                    const m = DAYS_CONFIG[timelineDay as MissionDayNumber];
                    return (
                      <div className="os-timeline-detail-box">
                        <h3>SOL 0{timelineDay} — {m.title.toUpperCase()}</h3>
                        <p className="os-briefing-p">{m.briefing}</p>
                        <div className="os-kv-line"><span>PRIMARY OBJECTIVE</span><span className="accent">{m.primaryObjective}</span></div>
                        <div className="os-kv-line"><span>AUTHORIZED MODULES</span><span>{m.allowedModules.join(", ")}</span></div>
                        <div className="os-steps-container">
                          <h4>OPERATIONAL CHECKLIST STEPS</h4>
                          {m.steps.map((s, idx) => (
                            <div key={s.stepId} className="os-step-entry">
                              <span className="idx">{idx + 1}.</span>
                              <span className="lbl">{s.label}</span>
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
                <div className="os-alt-workspace">
                  <div className="os-workspace-header">
                    <h2>HARDWARE BUS DIAGNOSTICS &amp; LOG</h2>
                    <p>System parity checking, real-time sensor verification, and kernel event stream.</p>
                  </div>
                  <div className="os-diag-controls">
                    <button className="os-primary-action-btn" disabled={diagRun} onClick={runDiagnostics}>
                      {diagRun ? "SCANNING SENSOR BUS..." : "RUN FULL SYSTEM DIAGNOSTIC"}
                    </button>
                    <span className="os-diag-status-text">{diagStatus}</span>
                  </div>
                  <div className="os-diag-log-view">
                    <div className="log-line info">[00:01:14] Station boot sequence verified. Kernel 4.19.0-phobos.</div>
                    <div className="log-line info">[00:01:28] Habitat ECLSS pressure balance calibrated at 101.3 kPa.</div>
                    <div className="log-line info">[00:02:05] Central Hub transit corridors sealed and pressurized.</div>
                    <div className="log-line success">[00:04:19] UV planar reprojection active across all physical monitors.</div>
                    <div className="log-line success">[00:05:01] Segmented wall colliders validated for Central Hub &amp; Science Lab.</div>
                    <div className="log-line info">[00:06:12] Outdoor EXR equirectangular skybox synchronized with Master Terrain.</div>
                    <div className="log-line success">[00:07:33] Sol 0{state.missionDay} mission manager state verified.</div>
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
