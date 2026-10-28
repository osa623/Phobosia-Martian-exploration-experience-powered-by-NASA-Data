"use client";

import React, { useState } from "react";
import type { ModuleName } from "@/core/Game";

/**
 * ============================================================================
 * SPEED TRAVEL / FAST TELEPORT DEV COMPONENT (SEPARATE REMOVABLE MODULE)
 * ============================================================================
 * 
 * To remove this after your modifications:
 * 1. Delete this file: src/components/game/SpeedTravelBar.tsx
 * 2. In src/components/game/GameViewport.tsx: remove the <SpeedTravelBar /> line and import
 * 3. In src/core/Game.ts: remove the speedTravel() method (optional)
 * ============================================================================
 */

export interface SpeedTravelBarProps {
  activeModule?: string;
  onTravel: (module: ModuleName) => void;
}

interface TargetModule {
  id: ModuleName;
  name: string;
  code: string;
  icon: string;
  description: string;
}

const MODULE_TARGETS: TargetModule[] = [
  { id: "Habitat", name: "Habitat", code: "HAB", icon: "🏠", description: "Living quarters & life support" },
  { id: "Hub", name: "Central Hub", code: "HUB", icon: "🌐", description: "Central transit & Kaleidos dome" },
  { id: "Airlock", name: "Airlock", code: "AIR", icon: "🚪", description: "Depressurization console & EVA hatch" },
  { id: "Engineering", name: "Engineering", code: "ENG", icon: "⚙️", description: "Power grid & diagnostic workbench" },
  { id: "Science", name: "Research Lab", code: "SCI", icon: "🔬", description: "Science benches & sample storage" },
  { id: "MissionControl", name: "Mission Control", code: "MC", icon: "🛰️", description: "Flight directors & drone ops" },
  { id: "Terrain", name: "Mars Terrain", code: "SURF", icon: "🪐", description: "Martian surface & crater survey" }
];

export function SpeedTravelBar({ activeModule, onTravel }: SpeedTravelBarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const isCurrent = (target: TargetModule) => {
    if (!activeModule) return false;
    const norm = activeModule.toLowerCase();
    return norm.includes(target.name.toLowerCase()) || norm.includes(target.id.toLowerCase());
  };

  return (
    <aside
      aria-label="Speed Travel Controls"
      style={{
        position: "fixed",
        top: 14,
        right: 16,
        zIndex: 9999,
        pointerEvents: "auto",
        fontFamily: "var(--font-mono, monospace, sans-serif)",
        userSelect: "none"
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Open Speed Travel Teleporter"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(8, 17, 27, 0.92)",
            color: "#E5A04B",
            border: "1px solid #E5A04B",
            borderRadius: "6px",
            padding: "8px 14px",
            fontSize: "11px",
            fontWeight: "bold",
            letterSpacing: "0.08em",
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(6px)"
          }}
        >
          <span>⚡ SPEED TRAVEL</span>
          <span style={{ fontSize: "9px", opacity: 0.8 }}>[SHOW ▼]</span>
        </button>
      ) : (
        <div
          style={{
            background: "rgba(8, 17, 27, 0.95)",
            border: "1px solid #24394B",
            borderRadius: "8px",
            padding: "12px",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(10px)",
            width: "290px",
            color: "#E7F0F7"
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "10px",
              paddingBottom: "8px",
              borderBottom: "1px solid #1B2B3A"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ color: "#E5A04B", fontSize: "14px" }}>⚡</span>
              <strong style={{ fontSize: "11px", letterSpacing: "0.1em", color: "#E5A04B" }}>
                SPEED TRAVEL
              </strong>
              <span
                style={{
                  fontSize: "9px",
                  background: "#1E3042",
                  color: "#92A9BC",
                  padding: "1px 5px",
                  borderRadius: "3px"
                }}
              >
                DEV
              </span>
            </div>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              title="Minimize panel"
              style={{
                background: "transparent",
                border: "none",
                color: "#92A9BC",
                fontSize: "11px",
                cursor: "pointer",
                padding: "2px 6px"
              }}
            >
              ▲ Hide
            </button>
          </div>

          {/* Buttons List */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {MODULE_TARGETS.map((t) => {
              const current = isCurrent(t);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onTravel(t.id)}
                  title={`Teleport directly to ${t.name}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "7px 10px",
                    background: current ? "rgba(91, 198, 154, 0.15)" : "#111F2C",
                    border: current ? "1px solid #5BC69A" : "1px solid #24394B",
                    borderRadius: "5px",
                    color: current ? "#5BC69A" : "#E7F0F7",
                    fontSize: "11px",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                    outline: "none"
                  }}
                  onMouseEnter={(e) => {
                    if (!current) {
                      e.currentTarget.style.background = "#182C3E";
                      e.currentTarget.style.borderColor = "#E5A04B";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!current) {
                      e.currentTarget.style.background = "#111F2C";
                      e.currentTarget.style.borderColor = "#24394B";
                    }
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "13px" }}>{t.icon}</span>
                    <div>
                      <div style={{ fontWeight: current ? "bold" : "normal" }}>{t.name}</div>
                      <div style={{ fontSize: "9px", color: current ? "#87E3BC" : "#92A9BC" }}>
                        {t.description}
                      </div>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: "9px",
                      fontWeight: "bold",
                      padding: "2px 6px",
                      borderRadius: "3px",
                      background: current ? "#5BC69A" : "#1B2B3A",
                      color: current ? "#08111B" : "#92A9BC"
                    }}
                  >
                    {current ? "CURRENT" : "WARP"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Footer note */}
          <div
            style={{
              marginTop: "10px",
              paddingTop: "6px",
              borderTop: "1px solid #1B2B3A",
              fontSize: "9px",
              color: "#92A9BC",
              textAlign: "center"
            }}
          >
            Direct teleport • Bypass video transitions
          </div>
        </div>
      )}
    </aside>
  );
}
