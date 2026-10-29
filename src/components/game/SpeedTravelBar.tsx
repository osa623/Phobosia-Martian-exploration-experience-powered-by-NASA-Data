"use client";

import { useState } from "react";
import type { ModuleName } from "@/core/Game";

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
      className="fixed right-4 top-[14px] z-[9999] pointer-events-auto select-none font-mono"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Open Speed Travel Teleporter"
          className="flex items-center gap-2 rounded-md border border-[#E5A04B] bg-[rgba(8,17,27,0.92)] px-[14px] py-2 text-[11px] font-bold tracking-[0.08em] text-[#E5A04B] shadow-[0_4px_16px_rgba(0,0,0,0.6)] backdrop-blur-md transition-colors hover:bg-[rgba(15,30,44,0.96)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A04B]"
        >
          <span>⚡ SPEED TRAVEL</span>
          <span className="text-[9px] opacity-80">[SHOW ▼]</span>
        </button>
      ) : (
        <div className="w-[290px] rounded-lg border border-[#24394B] bg-[rgba(8,17,27,0.95)] p-3 text-[#E7F0F7] shadow-[0_8px_32px_rgba(0,0,0,0.75)] backdrop-blur-lg">
          <div className="mb-[10px] flex items-center justify-between border-b border-[#1B2B3A] pb-2">
            <div className="flex items-center gap-[6px]">
              <span className="text-[14px] text-[#E5A04B]">⚡</span>
              <strong className="text-[11px] tracking-[0.1em] text-[#E5A04B]">SPEED TRAVEL</strong>
              <span className="rounded-[3px] bg-[#1E3042] px-[5px] py-px text-[9px] text-[#92A9BC]">DEV</span>
            </div>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              title="Minimize panel"
              className="cursor-pointer border-0 bg-transparent px-[6px] py-[2px] text-[11px] text-[#92A9BC] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A04B]"
            >
              ▲ Hide
            </button>
          </div>
          <div className="flex flex-col gap-[6px]">
            {MODULE_TARGETS.map((target) => {
              const current = isCurrent(target);
              return (
                <button
                  key={target.id}
                  type="button"
                  onClick={() => onTravel(target.id)}
                  title={`Teleport directly to ${target.name}`}
                  className={`flex items-center justify-between rounded-[5px] border px-[10px] py-[7px] text-left text-[11px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#E5A04B] ${current ? "border-[#5BC69A] bg-[rgba(91,198,154,0.15)] text-[#5BC69A]" : "border-[#24394B] bg-[#111F2C] text-[#E7F0F7] hover:border-[#E5A04B] hover:bg-[#182C3E]"}`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-[13px]">{target.icon}</span>
                    <span>
                      <span className={current ? "block font-bold" : "block font-normal"}>{target.name}</span>
                      <span className={`block text-[9px] ${current ? "text-[#87E3BC]" : "text-[#92A9BC]"}`}>
                        {target.description}
                      </span>
                    </span>
                  </span>
                  <span className={`rounded-[3px] px-[6px] py-[2px] text-[9px] font-bold ${current ? "bg-[#5BC69A] text-[#08111B]" : "bg-[#1B2B3A] text-[#92A9BC]"}`}>
                    {current ? "CURRENT" : "WARP"}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-[10px] border-t border-[#1B2B3A] pt-[6px] text-center text-[9px] text-[#92A9BC]">
            Direct teleport • Bypass video transitions
          </div>
        </div>
      )}
    </aside>
  );
}
