"use client";

import type { Game } from "@/core/Game";
import type { GameState } from "@/core/EventBus";
import { MissionOperatingSystem } from "./MissionOperatingSystem";
import { TriggerOperatingSystem } from "@/systems/operating-system/TriggerOperatingSystem";

export interface PhobosiaOSProps {
  game: Game | null;
  state: GameState;
  onClose: () => void;
  initialApp?: string;
}

/** The in-game OS shell; trigger sessions are routed to their access-limited UI. */
export function PhobosiaOS({ game, state, onClose, initialApp }: PhobosiaOSProps) {
  if (initialApp?.startsWith("trigger:")) {
    return <TriggerOperatingSystem game={game} state={state} triggerId={initialApp.slice("trigger:".length)} onClose={onClose} />;
  }
  return <MissionOperatingSystem game={game} state={state} onClose={onClose} initialApp={initialApp} />;
}
