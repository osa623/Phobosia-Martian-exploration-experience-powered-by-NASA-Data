"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Game } from "@/core/Game";
import type { GameState } from "@/core/EventBus";
import { DAYS_CONFIG, type MissionDayNumber, type MissionProgressState } from "@/core/MissionManager";
import { getPreparedAssetUrl } from "@/core/AssetLoading";
import { getScreenConfigForSol } from "@/core/ScreenConfigRegistry";
import { MissionInvestigationPanel } from "@/systems/investigation/InvestigationForm";
import habitatLegacy from "@/jsons/Screens/habitatScreenData.json";
import engineeringLegacy from "@/jsons/Screens/engineeringScreenData.json";
import researchLegacy from "@/jsons/Screens/research-zone-screens.json";
import missionControlLegacy from "@/jsons/Screens/mission-control-screens.json";
import centralHubLegacy from "@/jsons/Screens/central-hub-screens.json";
import airlockLegacy from "@/jsons/Screens/airlock-screen-data.json";
import sol03Mission from "@/jsons/Missions/sol-03.json";
import { Sol5MissionPanel } from "@/missions/sol-05/components/Sol5MissionPanel";
import { Sol6MissionPanel } from "@/missions/SOL_06/components/Sol6MissionPanel";
import { Sol7MissionPanel } from "@/missions/sol-07/components/Sol7MissionPanel";
import { Sol08MissionPanel } from "@/missions/sol-08/components/Sol08MissionPanel";
import { Sol09MissionPanel } from "@/missions/sol-09/components/Sol09MissionPanel";
import { Sol10MissionPanel } from "@/missions/sol-10/components/Sol10MissionPanel";
import { Sol11MissionPanel } from "@/missions/sol-11/components/Sol11MissionPanel";
import { resolveTriggerScreens } from "./triggerAccess";
import { TRIGGERS, type ScreenRecord, type Section } from "./triggerRegistry";

const SECTION_CONFIG: Record<Section, { legacy: any; screenKey: string }> = {
  habitat: { legacy: habitatLegacy, screenKey: "screens" }, engineering: { legacy: engineeringLegacy, screenKey: "screens" },
  research: { legacy: researchLegacy, screenKey: "screens" }, missionControl: { legacy: missionControlLegacy, screenKey: "screens" },
  centralHub: { legacy: centralHubLegacy, screenKey: "screens" }, airlock: { legacy: airlockLegacy, screenKey: "screens" }
};

const DISPLAY_NAMES: Record<string, string> = {
  overallStatus: "Overall status", powerSystem: "Power system status", environmentalSystem: "Environmental system status", communications: "Communications", habitatIntegrity: "Habitat integrity", activeAlerts: "Active alerts", missionDay: "Mission Sol", oxygen: "Oxygen", cabinPressure: "Cabin pressure", temperature: "Temperature", humidity: "Humidity", carbonDioxide: "Carbon dioxide", airFiltration: "Air filtration", waterReserve: "Water reserve", dailyWaterConsumption: "Daily water consumption", waterRecycling: "Water recycling", foodInventory: "Food inventory", nutritionSupplies: "Nutrition supplies", indicators: "Subsystem indicators", systemState: "System state", subsystemLoad: "Subsystem load", thermalState: "Thermal state", coolingEfficiency: "Cooling efficiency", trendHistory: "Trend history", activeProcesses: "Active processes", networkNodes: "Network nodes", packetsPerSec: "Packets per second", busLoad: "Bus load", reactorOutput: "Reactor output", solarGeneration: "Solar generation", totalConsumption: "Total consumption", batteryStorage: "Battery storage", gridEfficiency: "Grid efficiency", busVoltage: "Bus voltage", voltageA: "Bus voltage A", voltageB: "Bus voltage B", currentA: "Bus current", frequency: "Grid frequency", chargePct: "Battery charge", chargeRateKw: "Charge rate", cellTemp: "Cell temperature", cycles: "Charge cycles", status: "Recorded status", testStatus: "Test status", componentHealthPct: "Component health", items: "Inventory items", totalUnits: "Total units", bayCapacityPct: "Bay capacity"
};

function humanize(key: string): string { return DISPLAY_NAMES[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, c => c.toUpperCase()); }
const FIELD_UNITS: Record<string, string> = { reactorOutput: "kW", solarGeneration: "kW", totalConsumption: "kW", batteryStorage: "%", gridEfficiency: "%", busVoltage: "V", voltageA: "V", voltageB: "V", currentA: "A", frequency: "Hz", chargePct: "%", chargeRateKw: "kW", cellTemp: "°C", impedanceOhms: "Ω", signalToNoiseDb: "dB", componentHealthPct: "%", oxygen: "%", cabinPressure: "kPa", temperature: "°C", humidity: "%", carbonDioxide: "%", waterReserve: "%", dailyWaterConsumption: "L/sol" };
function print(value: unknown, field = ""): string {
  if (value === null || value === undefined || value === "") return "No value recorded";
  if (typeof value === "string" && /\bunavailable\b/i.test(value)) return value.replace(/\bunavailable\b/gi, "not supplied by this screen record");
  if (typeof value === "string" && /^(not available|not recorded|n\/a|--|unknown)$/i.test(value.trim())) return `${humanize(field || "This field")} has no recorded value`;
  if (Array.isArray(value)) return value.map(item => print(item)).join(" · ");
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>).map(([key, child]) => `${humanize(key)}: ${print(child, key)}`).join("; ");
  if (typeof value === "boolean") return value ? "Active" : "Inactive";
  return typeof value === "number" && FIELD_UNITS[field] ? `${value} ${FIELD_UNITS[field]}` : String(value);
}

function StructuredRecordValue({ value, field = "", sol, missionTitle, missionObjective }: { value: unknown; field?: string; sol: number; missionTitle: string; missionObjective: string }) {
  if (value === null || value === undefined || value === "") return <span>{humanize(field)} is not recorded on this screen. SOL {sol} mission focus: {missionObjective}</span>;
  if (typeof value === "string" && /\bunavailable\b/i.test(value)) return <span>{value.replace(/\bunavailable\b/gi, "not supplied by this screen record")} SOL {sol} mission context: {missionTitle} — {missionObjective}</span>;
  if (typeof value === "string" && /^(not available|not recorded|n\/a|--|unknown)$/i.test(value.trim())) return <span>{humanize(field)} is not recorded on this screen for SOL {sol}. Mission focus: {missionObjective}</span>;
  if (Array.isArray(value)) {
    if (!value.length) {
      const emptyValue = field === "data" || field === "series"
        ? "No measurement values are supplied in this record."
        : field === "rows"
          ? "No dataset records are listed in this panel."
          : field === "events"
            ? "No provenance events are recorded."
            : "No entries are recorded in this field.";
      return <span>{emptyValue}</span>;
    }
    return <ul className="[margin:5px_0_0] [padding-left:18px] [display:grid] [gap:5px]">{value.map((item, index) => <li key={index}><StructuredRecordValue value={item} field={field} sol={sol} missionTitle={missionTitle} missionObjective={missionObjective} /></li>)}</ul>;
  }
  if (typeof value === "object") {
    return <dl className="[margin:5px_0_0] [display:grid] [gap:5px]">{Object.entries(value as Record<string, unknown>).map(([key, child]) => <div key={key} className="[display:grid] [grid-template-columns:minmax(90px,_0.35fr)_1fr] [gap:8px]"><dt className="[color:#8ca8b5]">{humanize(key)}</dt><dd className="[margin:0]"><StructuredRecordValue value={child} field={key} sol={sol} missionTitle={missionTitle} missionObjective={missionObjective} /></dd></div>)}</dl>;
  }
  return <span>{print(value, field)}</span>;
}

function getMissionBinding(path: string | undefined, sol: number, mission: typeof DAYS_CONFIG[1], missionState?: Readonly<MissionProgressState>): unknown {
  if (!path?.startsWith("missionState.")) return undefined;
  const steps = mission.steps;
  const completedIds = new Set(missionState?.completedStepIds ?? []);
  const completed = steps.filter(step => completedIds.has(step.stepId)).length;
  const progressPercent = steps.length ? Math.round(completed / steps.length * 100) : 0;
  const nextIndex = steps.findIndex(step => !completedIds.has(step.stepId));
  const active = nextIndex >= 0 ? steps[nextIndex] : undefined;
  const checklist = steps.map(step => ({ label: step.label, description: step.description, completed: completedIds.has(step.stepId), status: completedIds.has(step.stepId) ? "COMPLETE" : step === active ? "ACTIVE" : "PENDING" }));
  const bindings: Record<string, unknown> = {
    "missionState.currentSol": sol,
    "missionState.currentDay": sol,
    "missionState.objectives.completedCount": completed,
    "missionState.objectives.currentProgressPercent": progressPercent,
    "missionState.objectives.active": active ? { name: active.label, description: active.description, status: missionState?.objectiveState === "completed" ? "COMPLETE" : "IN_PROGRESS", progressPercent, zone: active.targetModule ?? active.targetTrigger ?? "Mission-wide", checklist } : { name: `${mission.title} complete`, description: mission.completionFeedback, status: "COMPLETE", progressPercent: 100, zone: "Mission-wide", checklist },
    "missionState.objectives.active.checklist": checklist,
    "missionState.objectives.upcoming": (nextIndex < 0 ? [] : steps.slice(nextIndex + 1)).map(step => ({ title: step.label, description: step.description, status: "QUEUED", zone: step.targetModule ?? step.targetTrigger ?? "Mission-wide" }))
  };
  return Object.prototype.hasOwnProperty.call(bindings, path) ? bindings[path] : undefined;
}

function TriggerPanelDetails({ panel, sol, mission, missionState }: { panel: any; sol: number; mission: typeof DAYS_CONFIG[1]; missionState?: Readonly<MissionProgressState> }) {
  const liveValue = getMissionBinding(panel.dataSource, sol, mission, missionState);
  const value = liveValue !== undefined ? liveValue : panel.fallback ?? Object.fromEntries(Object.entries(panel).filter(([key]) => !["id", "type", "title", "dataSource"].includes(key)));
  return <div className="font-dm-sans [display:grid] [gap:8px] [color:#bdcbd1] [font-size:12px] [line-height:1.5]"><StructuredRecordValue value={value} sol={sol} missionTitle={mission.title} missionObjective={mission.primaryObjective} /></div>;
}

function getScreens(section: Section, sol: number): ScreenRecord[] {
  const source = SECTION_CONFIG[section];
  const config: any = getScreenConfigForSol(section, sol, source.legacy);
  const screens: any = config.screens;
  if (Array.isArray(screens)) return screens.map(screen => ({ id: screen.screenId ?? screen.meshName, mesh: screen.meshName ?? screen.screenId, title: screen.content?.header?.title ?? screen.screenId, purpose: screen.purpose, content: screen.content }));
  return Object.entries(screens ?? {}).map(([mesh, screen]: [string, any]) => ({ id: mesh, mesh: screen.physicalMesh ?? mesh, title: screen.displayName ?? mesh, purpose: screen.purpose, data: screen.data }));
}

function TriggerScreenView({ record, location, dataMode, sol, mission, missionState, showSol3TargetGallery = false, selectedTargetId = null }: { record?: ScreenRecord; location: string; dataMode: string; sol: number; mission: typeof DAYS_CONFIG[1]; missionState?: Readonly<MissionProgressState>; showSol3TargetGallery?: boolean; selectedTargetId?: string | null }) {
  const [expandedImage, setExpandedImage] = useState<{ target: string; label: string; src: string } | null>(null);
  if (!record) return <div className="[padding:18px] [color:#d4ad72]">No screen record is configured for this view in SOL {sol}. Mission focus: {mission.primaryObjective}</div>;
  const metricRows = Array.isArray(record.content?.primaryMetrics) ? record.content.primaryMetrics : [];
  const fields = record.data && typeof record.data === "object" ? Object.entries(record.data as Record<string, unknown>) : [];
  const panels = Array.isArray(record.content?.panels) ? record.content.panels : [];
  return <article className="[display:flex] [flex-direction:column] [gap:12px] [overflow-y:auto] [padding:12px]">
    <header className="[border-bottom:1px_solid_rgba(85,_205,_232,_0.18)] [padding-bottom:12px]"><div className="[color:#55cde8] [font-size:10px] [letter-spacing:0.14em]">SOL {String(sol).padStart(2, "0")} · {mission.title} · {dataMode}</div><h2 className="font-kdam-thmor-pro [margin:5px_0] [color:#f2f7f9] [font-size:20px]">{record.title}</h2><p className="font-dm-sans [margin:0] [color:#9fb4c0] [font-size:13px]">{record.purpose ?? `Operational display for ${mission.title}.`}</p><span className="[color:#758e9c] [font-size:11px]">{location} · Screen record {record.id}</span></header>
    {fields.length > 0 && <section className="[display:grid] [grid-template-columns:repeat(auto-fit,_minmax(190px,_1fr))] [gap:8px]">{fields.map(([key, value]) => <div key={key} className="[border:1px_solid_rgba(132,_172,_194,_0.12)] [border-radius:8px] [background:#101d28] [padding:10px]"><div className="[color:#7795a4] [font-size:10px] [text-transform:uppercase]">{humanize(key)}</div><div className="font-dm-sans [margin-top:4px] [color:#e1edf1] [font-size:13px]"><StructuredRecordValue value={value} field={key} sol={sol} missionTitle={mission.title} missionObjective={mission.primaryObjective} /></div></div>)}</section>}
    {metricRows.length > 0 && <section className="[display:grid] [grid-template-columns:repeat(auto-fit,_minmax(170px,_1fr))] [gap:8px]">{metricRows.map((metric: any) => { const liveValue = getMissionBinding(metric.source, sol, mission, missionState); const value = liveValue ?? metric.value ?? metric.fallback ?? `This SOL's screen record tracks ${mission.primaryObjective.toLowerCase()}.`; const isLive = liveValue !== undefined; return <div key={metric.id ?? metric.label} className="[border:1px_solid_rgba(132,_172,_194,_0.12)] [border-radius:8px] [background:#101d28] [padding:10px]"><div className="[color:#7795a4] [font-size:10px]">{metric.label ?? humanize(metric.id ?? "Metric")}</div><strong className="font-dm-sans [display:block] [margin-top:4px] [color:#e1edf1]"><StructuredRecordValue value={value} field={metric.id ?? metric.label ?? "metric"} sol={sol} missionTitle={mission.title} missionObjective={mission.primaryObjective} /></strong>{metric.unit && typeof value === "number" && <span className="[color:#88a9b7] [font-size:10px]">{metric.unit}</span>}{metric.status && <span className="[color:#88a9b7] [font-size:10px]">{print(metric.status)}</span>}{!isLive && metric.fallback !== undefined && <span className="[display:block] [color:#d2b47e] [font-size:10px]">Configured display reference</span>}</div>; })}</section>}
    {panels.filter((panel: any) => !(showSol3TargetGallery && panel.type === "IMAGE_GALLERY")).map((panel: any, index: number) => <section key={panel.id ?? index} className="[border-left:2px_solid_#376478] [background:#0d1923] [padding:10px_12px]"><h3 className="[margin:0_0_6px] [color:#9bd9ea] [font-size:12px]">{panel.title ?? humanize(panel.id ?? `Record ${index + 1}`)}</h3><TriggerPanelDetails panel={panel} sol={sol} mission={mission} missionState={missionState} /></section>)}
    {showSol3TargetGallery && <section className="[border-top:1px_solid_rgba(85,_205,_232,_0.2)] [padding-top:12px]">
      <header className="[margin-bottom:12px]"><div className="[color:#55cde8] [font-size:10px] [letter-spacing:0.14em]">SOL 3 · TARGET IMAGE CATALOGUE</div><p className="[margin:4px_0_0] [color:#9fb4c0] [font-size:11px]">Project imagery for comparison. The source does not include acquisition, instrument, or georeferencing metadata; these are not verified NASA observations.</p></header>
      <div className="[display:flex] [flex-direction:column] [gap:14px]">
        {sol03Mission.targetCatalogue.map((target, index) => {
          const targetLabel = `Target ${String.fromCharCode(65 + index)} · ${target.targetNumber}`;
          const imageTypes: Array<{ key: "grayscale" | "color" | "thermal"; label: string }> = [
            { key: "grayscale", label: "Black-and-white satellite image" },
            { key: "color", label: "Colour image" },
            { key: "thermal", label: "Thermal image" }
          ];
          return <article key={target.targetId} className="[border:1px_solid_rgba(85,_205,_232,_0.16)] [border-radius:9px] [background:#0a151e] [padding:12px]">
            <div className="[display:flex] [flex-wrap:wrap] [align-items:flex-start] [justify-content:space-between] [gap:8px]">
              <div><div className="[color:#55cde8] [font-size:10px] [letter-spacing:0.1em]">{targetLabel}</div><h3 className="font-kdam-thmor-pro [margin:4px_0] [color:#f1f6f8] [font-size:17px]">{target.name}</h3><p className="[margin:0] [color:#a8bbc4] [font-size:11px]">{target.geographicName}</p></div>
              <span className="[border:1px_solid_rgba(85,_205,_232,_0.2)] [border-radius:4px] [padding:4px_7px] [color:#9fb4c0] [font-size:9px]">{target.targetId === selectedTargetId ? "CURRENT PROPOSAL TARGET" : "AVAILABLE FOR REVIEW"}</span>
            </div>
            <p className="[margin:9px_0] [color:#c1cfd5] [font-size:12px] [line-height:1.5]">{target.scientificDescription}</p>
            <p className="[margin:0_0_10px] [color:#d2b47e] [font-size:11px]">Mars coordinates: {target.marsCoordinates ? JSON.stringify(target.marsCoordinates) : "No georeferenced coordinates are recorded for this target."} · Outpost distance: {target.outpostDistance ?? "No in-game distance is recorded for this target."}<br/><StructuredRecordValue value={target.observationStatus} field="target observation status" sol={sol} missionTitle={mission.title} missionObjective={mission.primaryObjective} /></p>
            <div className="[display:grid] [grid-template-columns:repeat(auto-fit,_minmax(190px,_1fr))] [gap:9px]">
              {imageTypes.map(({ key, label }) => <TargetImagePreview key={key} targetLabel={targetLabel} label={label} src={target.images[key]} onInspect={setExpandedImage} />)}
            </div>
          </article>;
        })}
      </div>
    </section>}
    {expandedImage && <div role="dialog" aria-modal="true" aria-label={`${expandedImage.target}: ${expandedImage.label}`} className="[position:fixed] [inset:0] [z-index:90] [display:grid] [place-items:center] [background:rgba(0,_0,_0,_0.94)] [padding:20px]" onClick={() => setExpandedImage(null)}>
      <div className="[width:min(1200px,_96vw)] [max-height:94vh] [overflow:auto] [border:1px_solid_#456272] [border-radius:10px] [background:#07111b] [padding:14px]" onClick={event => event.stopPropagation()}>
        <div className="[display:flex] [justify-content:space-between] [align-items:center] [gap:12px] [padding-bottom:10px]"><div><div className="[color:#55cde8] [font-size:10px] [letter-spacing:0.12em]">{expandedImage.target}</div><h3 className="[margin:3px_0_0] [color:#f1f6f8] [font-size:16px]">{expandedImage.label}</h3></div><button type="button" className="[border:1px_solid_#456272] [border-radius:5px] [background:#101d28] [padding:7px_11px] [color:#d9e7eb]" onClick={() => setExpandedImage(null)}>Close</button></div>
        <img src={getPreparedAssetUrl(encodeURI(expandedImage.src))} alt={`${expandedImage.target} — ${expandedImage.label}`} className="[display:block] [max-width:100%] [max-height:78vh] [margin:auto] [object-contain]" />
      </div>
    </div>}
    <details className="[border-top:1px_solid_rgba(85,_205,_232,_0.12)] [padding-top:9px]"><summary className="[cursor:pointer] [color:#55cde8] [font-size:12px]">Record details and limitations</summary><dl className="[display:grid] [grid-template-columns:150px_1fr] [gap:6px] [font-size:11px]"><dt>Mission</dt><dd>SOL {String(sol).padStart(2, "0")} · {mission.title}</dd><dt>Physical screen</dt><dd>{record.mesh}</dd><dt>Source record</dt><dd>{record.id}</dd><dt>Data provenance</dt><dd>{dataMode}; values are from the configured PHOBOSIA display record.</dd><dt>Timestamp</dt><dd>This source configuration does not timestamp the displayed record.</dd><dt>Interpretation</dt><dd>Values are presented as recorded; no diagnosis is inferred from this display.</dd></dl></details>
  </article>;
}

function TargetImagePreview({ targetLabel, label, src, onInspect }: { targetLabel: string; label: string; src: string; onInspect: (image: { target: string; label: string; src: string }) => void }) {
  const [failed, setFailed] = useState(false);
  return <button type="button" className="[display:block] [overflow:hidden] [border:1px_solid_rgba(85,_205,_232,_0.18)] [border-radius:7px] [background:#101d28] [text-align:left] [cursor:zoom-in]" onClick={() => onInspect({ target: targetLabel, label, src })} aria-label={`Expand ${targetLabel}, ${label}`}>
    {failed ? <div className="[display:grid] [min-height:160px] [place-items:center] [padding:10px] [color:#d2b47e] [font-size:11px]">This project image could not be loaded from its configured path.</div> : <img src={getPreparedAssetUrl(encodeURI(src))} alt={`${targetLabel} — ${label}`} loading="lazy" onError={() => setFailed(true)} className="[display:block] [width:100%] [height:190px] [background:#050a0e] [object-contain]" />}
    <span className="[display:block] [padding:8px] [color:#d8e5ea] [font-size:11px]">{label}</span>
  </button>;
}

export function TriggerOperatingSystem({ game, state, triggerId, onClose }: { game: Game | null; state: GameState; triggerId: string; onClose: () => void }) {
  const spec = TRIGGERS[triggerId];
  const [selected, setSelected] = useState(0);
  const missionState = game?.missionManager.getState();
  const activeSol = missionState?.currentDay ?? state.missionDay;
  const selectedTargetId = game?.missionManager.getSelectedSiteId() ?? game?.missionManager.getProposedSiteId() ?? null;
  const mission = DAYS_CONFIG[activeSol as MissionDayNumber] ?? DAYS_CONFIG[1];
  const records = useMemo(() => spec?.section ? getScreens(spec.section, activeSol) : [], [spec, activeSol]);
  const relevant = resolveTriggerScreens(records, spec?.screens ?? []);
  useEffect(() => setSelected(0), [triggerId]);
  const selectedRecord = relevant[selected] ?? relevant[0];
  const dataMode = spec?.section === "habitat" || spec?.section === "engineering" ? "SIMULATED OUTPOST TELEMETRY" : "SIMULATED PHOBOSIA DISPLAY DATA";
  if (!spec) return <div className="[position:fixed] [inset:0] [z-index:70] [background:#07111b] [color:white] [padding:30px]">No interface is configured for this trigger.<button onClick={onClose}>Close</button></div>;
  const allowedTasks = mission.steps.filter(step => step.targetTrigger === triggerId || step.triggerId === triggerId || step.interfaceId === triggerId || spec.tasks?.includes(step.stepId));
  return <div onClick={event => event.stopPropagation()} style={{ pointerEvents: "auto", zIndex: 70 }} className="[pointer-events:auto] [position:fixed] [inset:0] [z-index:70] [display:flex] [align-items:center] [justify-content:center] [background:rgba(3,_8,_13,_0.96)] [backdrop-filter:blur(12px)] [padding:16px]">
    <div className="[width:min(1120px,_98vw)] [height:min(790px,_94vh)] [display:flex] [flex-direction:column] [overflow:hidden] [border:1px_solid_rgba(85,_205,_232,_0.3)] [border-radius:14px] [background:#080f17] [box-shadow:0_24px_90px_rgba(0,_0,_0,_0.7)] [color:#dce8ed]">
      <header className="[display:flex] [justify-content:space-between] [align-items:center] [gap:12px] [border-bottom:1px_solid_rgba(85,_205,_232,_0.18)] [padding:14px_20px]"><div><div className="font-russo-one [color:#e88747] [font-size:10px] [letter-spacing:0.16em]">PHOBOSIA · SOL {activeSol} · ACCESS CONTROLLED</div><h1 className="font-kdam-thmor-pro [margin:4px_0] [color:white] [font-size:20px]">{spec.title}</h1><span className="font-dm-sans [color:#8faab8] [font-size:12px]">{spec.location}</span></div><button className="[border:1px_solid_#456272] [border-radius:5px] [background:#101d28] [padding:8px_12px] [color:#d9e7eb] [cursor:pointer]" onClick={onClose}>Close · Esc</button></header>
      <div className="[display:flex] [min-height:0] [flex:1]">
        <nav aria-label={`${spec.title} views`} className="[width:220px] [flex-shrink:0] [overflow-y:auto] [border-right:1px_solid_rgba(85,_205,_232,_0.14)] [background:#0a141e] [padding:10px]">
          {spec.screens.map((screenName, index) => { const screen = relevant.find(item => item.mesh === screenName || item.id === screenName); return <button key={screenName} className={`font-dm-sans [display:block] [width:100%] [margin-bottom:6px] [border:1px_solid_transparent] [border-radius:7px] [padding:10px] [text-align:left] [cursor:pointer] ${selected === index ? "[border-color:rgba(85,205,232,0.4)] [background:#122735] [color:#dff8ff]" : "[background:transparent] [color:#91aab7]"}`} onClick={() => setSelected(index)}>{screen?.title ?? screenName}</button>; })}
          {spec.workstation && <div className="[margin-top:12px] [border-top:1px_solid_rgba(85,_205,_232,_0.12)] [padding-top:12px] [color:#8da5b0] [font-size:12px]">Personal workstation interface. No additional systems are exposed from this terminal.</div>}
          {allowedTasks.length > 0 && <div className="[margin-top:18px] [border-top:1px_solid_rgba(85,_205,_232,_0.12)] [padding-top:12px]"><div className="font-mono [color:#e88747] [font-size:10px] [letter-spacing:0.1em]">MISSION TASKS HERE</div>{allowedTasks.map(task => { const id = task.stepId; return <p key={id} className="[margin:8px_0] [color:#c6d6dc] [font-size:11px]">{game?.missionManager.isStepComplete(id) ? "✓ " : "○ "}{task?.label}</p>; })}</div>}
        </nav>
        <main className="[min-width:0] [flex:1] [overflow-y:auto] [padding:14px]">
          {spec.section ? <TriggerScreenView record={selectedRecord} location={spec.location} dataMode={dataMode} sol={activeSol} mission={mission} missionState={missionState} showSol3TargetGallery={activeSol === 3 && spec.section === "missionControl" && selectedRecord?.id === "MC_OBSERVATION_SITES"} selectedTargetId={selectedTargetId} /> : <div className="[padding:18px]"><div className="font-mono [color:#e88747] [font-size:10px]">PERSONAL MISSION WORKSPACE · SOL {activeSol}</div><h2 className="font-kdam-thmor-pro [color:white]">{mission.title}</h2><p className="font-dm-sans [color:#c6d5db]">{mission.primaryObjective}</p><div className="[margin-top:14px] [border-radius:8px] [background:#101d28] [padding:14px]"><div className="[color:#55cde8] [font-size:11px]">CHECKLIST PROGRESS</div><p>{state.completedStepCount} of {state.totalStepCount} mission tasks complete</p><p className="[color:#9db1bb] [font-size:12px]">This personal workspace does not provide remote system controls or live subsystem telemetry.</p></div></div>}
          {activeSol === 5 && triggerId === "MC_NAVIGATION_01" && <section className="[margin-top:18px] [border-top:1px_solid_rgba(85,_205,_232,_0.18)] [padding-top:16px]"><Sol5MissionPanel game={game} state={state} /></section>}
          {activeSol === 6 && ["MC_NAVIGATION_01", "MC_MAIN_01", "LAB_RESEARCH_ANALYSIS_01", "LAB_RESEARCH_MONITORING_01", "LAB_CULTIVATION_01"].includes(triggerId) && <Sol6MissionPanel manager={game?.missionManager} triggerId={triggerId} />}
          {activeSol === 7 && <Sol7MissionPanel manager={game?.missionManager} game={game ?? undefined} triggerId={triggerId} />}
          {activeSol === 8 && <Sol08MissionPanel game={game} triggerId={triggerId} />}
          {activeSol === 9 && ["HAB_WATER_NUTRITION_01", "LAB_CULTIVATION_01", "Engineering_LifeSupport_Trigger", "MC_MAIN_01"].includes(triggerId) && <Sol09MissionPanel game={game} triggerId={triggerId} />}
          {activeSol === 10 && <Sol10MissionPanel game={game} triggerId={triggerId} />}
          {activeSol === 11 && triggerId === "MC_MAIN_01" && <Sol11MissionPanel game={game} />}
          {allowedTasks.length > 0 && <section className="[border-top:1px_solid_rgba(85,_205,_232,_0.18)] [margin-top:10px] [padding-top:10px]"><MissionInvestigationPanel game={game} initialTaskId={allowedTasks[0].stepId} availableTaskIds={allowedTasks.map(task => task.stepId)} showSavedRecords={allowedTasks.some(task => task.stepId === "SOL02_READINESS_ASSESSMENT" || task.stepId === "SOL03_SUBMIT_TARGET_RECORD")} /></section>}
          {triggerId === "HAB_MONITOR_01" && <section className="[margin:8px_12px] [border-top:1px_solid_rgba(85,_205,_232,_0.15)] [padding:12px]"><div className="font-mono [color:#55cde8] [font-size:10px]">OUTPOST OVERVIEW</div><p className="[color:#dce8ed]">Sol {activeSol} · {mission.title} · {missionState?.objectiveState ?? state.objectiveState}</p><p className="[color:#9fb4c0] [font-size:12px]">{mission.primaryObjective}</p><p className="[color:#d4ad72] [font-size:12px]">{game?.missionManager.getMissionTaskProgress().remaining ?? 0} required mission tasks remain. System-specific records stay in their own consoles.</p>{state.notification && <p role="status" className="[border-left:2px_solid_#e88747] [padding-left:8px] [color:#e8c18d] [font-size:12px]">Mission notification: {state.notification}</p>}</section>}
        </main>
      </div>
    </div>
  </div>;
}
