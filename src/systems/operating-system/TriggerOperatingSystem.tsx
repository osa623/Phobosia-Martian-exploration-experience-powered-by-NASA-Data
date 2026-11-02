"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Game } from "@/core/Game";
import type { GameState } from "@/core/EventBus";
import { DAYS_CONFIG, type MissionDayNumber } from "@/core/MissionManager";
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
import { resolveTriggerScreens } from "./triggerAccess";

type Section = "habitat" | "engineering" | "research" | "missionControl" | "centralHub" | "airlock";
interface ScreenRecord { id: string; mesh: string; title: string; purpose?: string; data?: unknown; content?: any }
interface TriggerSpec { title: string; location: string; section?: Section; screens: string[]; tasks?: string[]; workstation?: boolean }

const TRIGGERS: Record<string, TriggerSpec> = {
  HAB_MONITOR_01: { title: "Habitat Main Monitor", location: "Habitat — Main Status Console", section: "habitat", screens: ["Habitat_Main_Status_Display", "Habitat_LifeSupport_Display", "Habitat_Emergency_Status_Display"], tasks: ["SOL02_HABITAT_STATUS"] },
  HAB_WATER_NUTRITION_01: { title: "Water and Nutrition", location: "Habitat — Water and Nutrition Station", section: "habitat", screens: ["Habitat_WaterNutrition_Display"], tasks: ["SOL02_WATER_NUTRITION"] },
  HAB_WORKSTATION_01: { title: "Habitat Workstation", location: "Habitat — Crew Workstation", screens: ["Habitat_Workstation_Display"], workstation: true },
  Engineering_Monitoring_Trigger: { title: "Engineering Monitoring", location: "Engineering Unit — Monitoring Console", section: "engineering", screens: ["MonitoringSection_Indicator_Screen", "MonitoringSection_Operational_Screen", "MonitoringSection_Screen"], tasks: ["SOL02_ENGINEERING_MONITORING", "SOL02_READINESS_ASSESSMENT"] },
  Engineering_PowerUnit_Trigger: { title: "Power Unit", location: "Engineering Unit — Power Distribution Console", section: "engineering", screens: ["PowerUnitScreenMain", "PowerUnitScreenMain02", "PowerUnitScreen000", "PowerUnitScreen000.001"], tasks: ["SOL02_POWER_REVIEW"] },
  Engineering_LifeSupport_Trigger: { title: "Engineering Life Support", location: "Engineering Unit — Life Support Console", section: "engineering", screens: ["LifeSupportUnitScreenMain04", "LifeSupportUnitScreenMain02.001", "LifeSupportUnitScreenMain03"], tasks: ["SOL02_ENGINEERING_LIFESUPPORT"] },
  Engineering_Diagnostics_Trigger: { title: "Diagnostics Workbench", location: "Engineering Unit — Diagnostics Workbench", section: "engineering", screens: ["DiagnosticsWorkbenchScreen_01"], tasks: ["SOL02_DIAGNOSTICS"] },
  Engineering_InfoDisplay_Trigger: { title: "Storage and Inventory", location: "Engineering Unit — Storage Display", section: "engineering", screens: ["Storage_Screen"] },
  LAB_RESEARCH_MONITORING_01: { title: "Research Monitoring", location: "Research Lab — Monitoring Station", section: "research", screens: ["ResearchMonitoring_MainScreen"] },
  LAB_RESEARCH_ANALYSIS_01: { title: "Scientific Analysis", location: "Research Lab — Scientific Analysis Station", section: "research", screens: ["ResearchMonitoring_SystemScreen"], tasks: ["SOL03_SELECT_DATASET", "SOL04_TERRAIN_DATA_REVIEW"] },
  LAB_SEED_STORAGE_01: { title: "Seed Storage", location: "Research Lab — Seed Storage", section: "research", screens: ["SeedStorage_InventoryScreen"] },
  LAB_WATER_NUTRITION_01: { title: "Water and Nutrition Mixing", location: "Research Lab — Nutrient Preparation Station", section: "research", screens: ["WaterNutrition_MixingScreen"] },
  LAB_WATER_SERVICE_01: { title: "Water Quality and Service", location: "Research Lab — Water Quality Station", section: "research", screens: ["WaterNutrition_QualityScreen"] },
  LAB_CULTIVATION_01: { title: "Cultivation Environment", location: "Research Lab — Cultivation Bay Console", section: "research", screens: ["Cultivation_EnvironmentScreen"] },
  MC_MAIN_01: { title: "Mission Control Main Section", location: "Mission Control — Main Operations Console", section: "missionControl", screens: ["MissionControl_ObjectivesScreen", "MissionControl_OutpostStatusScreen", "MissionControl_OverviewScreen"], tasks: ["SOL03_MISSION_CONTEXT", "SOL03_SUBMIT_TARGET_RECORD", "SOL04_MISSION_CONTEXT", "SOL04_SUBMIT_PREPARATION_REPORT"] },
  MC_SYSTEMS_01: { title: "Communications and Systems", location: "Mission Control — Systems Console", section: "missionControl", screens: ["MissionControl_CommunicationsScreen", "MissionControl_SystemsScreen"], tasks: ["SOL03_SYSTEM_CONSTRAINTS"] },
  MC_NAVIGATION_01: { title: "Navigation and Observation Sites", location: "Mission Control — Observation Planning Console", section: "missionControl", screens: ["MissionControl_DroneOperationScreen", "MissionControl_ObservationSitesScreen", "MissionControl_TerrainMapScreen"], tasks: ["SOL03_OBSERVATION_SITE_REVIEW", "SOL03_SELECT_TARGET", "SOL04_SELECTED_TARGET_INVESTIGATION", "SOL04_DRONE_MISSION_PLAN"] },
  Env_Status_Display: { title: "Environment Status", location: "Central Connector — Environment Display", section: "centralHub", screens: ["Env_Status_Display"] },
  Internal_Communication_Display: { title: "Internal Communications", location: "Central Connector — Communications Display", section: "centralHub", screens: ["Internal_Communication_Display"] },
  Module_Status_Display: { title: "Module Status", location: "Central Connector — Module Status Display", section: "centralHub", screens: ["Module_Status_Display"] },
  Airlock_Control_Console_Trigger: { title: "Airlock Control Console", location: "Airlock — Egress Control Console", section: "airlock", screens: ["Airlock_Control_Console"] }
};

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
  if (value === null || value === undefined || value === "") return "Unavailable in this record";
  if (Array.isArray(value)) return value.map(item => print(item)).join(" · ");
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>).map(([key, child]) => `${humanize(key)}: ${print(child, key)}`).join("; ");
  if (typeof value === "boolean") return value ? "Active" : "Inactive";
  return typeof value === "number" && FIELD_UNITS[field] ? `${value} ${FIELD_UNITS[field]}` : String(value);
}

function getScreens(section: Section, sol: number): ScreenRecord[] {
  const source = SECTION_CONFIG[section];
  const config: any = getScreenConfigForSol(section, sol, source.legacy);
  const screens: any = config.screens;
  if (Array.isArray(screens)) return screens.map(screen => ({ id: screen.screenId ?? screen.meshName, mesh: screen.meshName ?? screen.screenId, title: screen.content?.header?.title ?? screen.screenId, purpose: screen.purpose, content: screen.content }));
  return Object.entries(screens ?? {}).map(([mesh, screen]: [string, any]) => ({ id: mesh, mesh: screen.physicalMesh ?? mesh, title: screen.displayName ?? mesh, purpose: screen.purpose, data: screen.data }));
}

function TriggerScreenView({ record, location, dataMode, showSol3TargetGallery = false, selectedTargetId = null }: { record?: ScreenRecord; location: string; dataMode: string; showSol3TargetGallery?: boolean; selectedTargetId?: string | null }) {
  const [expandedImage, setExpandedImage] = useState<{ target: string; label: string; src: string } | null>(null);
  if (!record) return <div className="[padding:18px] [color:#d4ad72]">The configured display record is unavailable.</div>;
  const metricRows = Array.isArray(record.content?.primaryMetrics) ? record.content.primaryMetrics : [];
  const fields = record.data && typeof record.data === "object" ? Object.entries(record.data as Record<string, unknown>) : [];
  const panels = Array.isArray(record.content?.panels) ? record.content.panels : [];
  return <article className="[display:flex] [flex-direction:column] [gap:12px] [overflow-y:auto] [padding:12px]">
    <header className="[border-bottom:1px_solid_rgba(85,_205,_232,_0.18)] [padding-bottom:12px]"><div className="[color:#55cde8] [font-size:10px] [letter-spacing:0.14em]">{dataMode}</div><h2 className="font-kdam-thmor-pro [margin:5px_0] [color:#f2f7f9] [font-size:20px]">{record.title}</h2><p className="font-dm-sans [margin:0] [color:#9fb4c0] [font-size:13px]">{record.purpose ?? "Existing operational display record."}</p><span className="[color:#758e9c] [font-size:11px]">{location} · Time not recorded in source</span></header>
    {fields.length > 0 && <section className="[display:grid] [grid-template-columns:repeat(auto-fit,_minmax(190px,_1fr))] [gap:8px]">{fields.map(([key, value]) => <div key={key} className="[border:1px_solid_rgba(132,_172,_194,_0.12)] [border-radius:8px] [background:#101d28] [padding:10px]"><div className="[color:#7795a4] [font-size:10px] [text-transform:uppercase]">{humanize(key)}</div><div className="font-dm-sans [margin-top:4px] [color:#e1edf1] [font-size:13px]">{print(value, key)}</div></div>)}</section>}
    {metricRows.length > 0 && <section className="[display:grid] [grid-template-columns:repeat(auto-fit,_minmax(170px,_1fr))] [gap:8px]">{metricRows.map((metric: any) => { const supplied = metric.value !== undefined && metric.value !== null; return <div key={metric.id ?? metric.label} className="[border:1px_solid_rgba(132,_172,_194,_0.12)] [border-radius:8px] [background:#101d28] [padding:10px]"><div className="[color:#7795a4] [font-size:10px]">{metric.label ?? humanize(metric.id ?? "Metric")}</div><strong className="font-dm-sans [display:block] [margin-top:4px] [color:#e1edf1]">{supplied ? `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}` : "Unavailable"}</strong>{metric.status && <span className="[color:#88a9b7] [font-size:10px]">{print(metric.status)}</span>}{!supplied && metric.fallback !== undefined && <span className="[display:block] [color:#d2b47e] [font-size:10px]">Display fallback exists; not treated as live telemetry.</span>}</div>; })}</section>}
    {panels.filter((panel: any) => !(showSol3TargetGallery && panel.type === "IMAGE_GALLERY")).map((panel: any, index: number) => <section key={panel.id ?? index} className="[border-left:2px_solid_#376478] [background:#0d1923] [padding:10px_12px]"><h3 className="[margin:0_0_6px] [color:#9bd9ea] [font-size:12px]">{panel.title ?? humanize(panel.id ?? `Record ${index + 1}`)}</h3><p className="font-dm-sans [margin:0] [color:#bdcbd1] [font-size:12px] [line-height:1.5]">{print(panel.description ?? panel.body ?? panel.status ?? panel.content ?? panel.items ?? "No additional detail supplied by this record.")}</p></section>)}
    {showSol3TargetGallery && <section className="[border-top:1px_solid_rgba(85,_205,_232,_0.2)] [padding-top:12px]">
      <header className="[margin-bottom:12px]"><div className="[color:#55cde8] [font-size:10px] [letter-spacing:0.14em]">SOL 3 · TARGET IMAGE CATALOGUE</div><p className="[margin:4px_0_0] [color:#9fb4c0] [font-size:11px]">Project imagery for comparison. Acquisition, instrument, and georeferencing metadata are unavailable; these images are not verified NASA observations.</p></header>
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
            <p className="[margin:0_0_10px] [color:#d2b47e] [font-size:11px]">Mars coordinates: {target.marsCoordinates ? JSON.stringify(target.marsCoordinates) : "Unavailable"} · Outpost distance: {target.outpostDistance ?? "Unavailable"}<br/>{target.observationStatus}</p>
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
        <img src={encodeURI(expandedImage.src)} alt={`${expandedImage.target} — ${expandedImage.label}`} className="[display:block] [max-width:100%] [max-height:78vh] [margin:auto] [object-contain]" />
      </div>
    </div>}
    <details className="[border-top:1px_solid_rgba(85,_205,_232,_0.12)] [padding-top:9px]"><summary className="[cursor:pointer] [color:#55cde8] [font-size:12px]">Record details and limitations</summary><dl className="[display:grid] [grid-template-columns:150px_1fr] [gap:6px] [font-size:11px]"><dt>Source log ID</dt><dd>Not provided by this display configuration</dd><dt>Source</dt><dd>PHOBOSIA display configuration</dd><dt>Data provenance</dt><dd>{dataMode}</dd><dt>Observed at</dt><dd>Timestamp unavailable in source configuration</dd><dt>Reference limits</dt><dd>Unavailable unless shown in the measurement record</dd><dt>Technical interpretation</dt><dd>No diagnosis is inferred from a display snapshot</dd><dt>Follow-up</dt><dd>Use the section-specific inspection workflow if one is available</dd></dl></details>
  </article>;
}

function TargetImagePreview({ targetLabel, label, src, onInspect }: { targetLabel: string; label: string; src: string; onInspect: (image: { target: string; label: string; src: string }) => void }) {
  const [failed, setFailed] = useState(false);
  return <button type="button" className="[display:block] [overflow:hidden] [border:1px_solid_rgba(85,_205,_232,_0.18)] [border-radius:7px] [background:#101d28] [text-align:left] [cursor:zoom-in]" onClick={() => onInspect({ target: targetLabel, label, src })} aria-label={`Expand ${targetLabel}, ${label}`}>
    {failed ? <div className="[display:grid] [min-height:160px] [place-items:center] [padding:10px] [color:#d2b47e] [font-size:11px]">Image unavailable at its configured project path.</div> : <img src={encodeURI(src)} alt={`${targetLabel} — ${label}`} loading="lazy" onError={() => setFailed(true)} className="[display:block] [width:100%] [height:190px] [background:#050a0e] [object-contain]" />}
    <span className="[display:block] [padding:8px] [color:#d8e5ea] [font-size:11px]">{label}</span>
  </button>;
}

export function TriggerOperatingSystem({ game, state, triggerId, onClose }: { game: Game | null; state: GameState; triggerId: string; onClose: () => void }) {
  const spec = TRIGGERS[triggerId];
  const [selected, setSelected] = useState(0);
  const missionState = game?.missionManager.getState();
  const selectedTargetId = game?.missionManager.getSelectedSiteId() ?? game?.missionManager.getProposedSiteId() ?? null;
  const mission = DAYS_CONFIG[state.missionDay as MissionDayNumber] ?? DAYS_CONFIG[1];
  const records = useMemo(() => spec?.section ? getScreens(spec.section, state.missionDay) : [], [spec, state.missionDay]);
  const relevant = resolveTriggerScreens(records, spec?.screens ?? []);
  useEffect(() => setSelected(0), [triggerId]);
  const selectedRecord = relevant[selected] ?? relevant[0];
  const dataMode = spec?.section === "habitat" || spec?.section === "engineering" ? "SIMULATED OUTPOST TELEMETRY" : "SIMULATED PHOBOSIA DISPLAY DATA";
  if (!spec) return <div className="[position:fixed] [inset:0] [z-index:70] [background:#07111b] [color:white] [padding:30px]">No interface is configured for this trigger.<button onClick={onClose}>Close</button></div>;
  const allowedTasks = spec.tasks?.filter(id => mission.steps.some(step => step.stepId === id)) ?? [];
  return <div onClick={event => event.stopPropagation()} style={{ pointerEvents: "auto", zIndex: 70 }} className="[pointer-events:auto] [position:fixed] [inset:0] [z-index:70] [display:flex] [align-items:center] [justify-content:center] [background:rgba(3,_8,_13,_0.96)] [backdrop-filter:blur(12px)] [padding:16px]">
    <div className="[width:min(1120px,_98vw)] [height:min(790px,_94vh)] [display:flex] [flex-direction:column] [overflow:hidden] [border:1px_solid_rgba(85,_205,_232,_0.3)] [border-radius:14px] [background:#080f17] [box-shadow:0_24px_90px_rgba(0,_0,_0,_0.7)] [color:#dce8ed]">
      <header className="[display:flex] [justify-content:space-between] [align-items:center] [gap:12px] [border-bottom:1px_solid_rgba(85,_205,_232,_0.18)] [padding:14px_20px]"><div><div className="font-russo-one [color:#e88747] [font-size:10px] [letter-spacing:0.16em]">PHOBOSIA · SOL {state.missionDay} · ACCESS CONTROLLED</div><h1 className="font-kdam-thmor-pro [margin:4px_0] [color:white] [font-size:20px]">{spec.title}</h1><span className="font-dm-sans [color:#8faab8] [font-size:12px]">{spec.location}</span></div><button className="[border:1px_solid_#456272] [border-radius:5px] [background:#101d28] [padding:8px_12px] [color:#d9e7eb] [cursor:pointer]" onClick={onClose}>Close · Esc</button></header>
      <div className="[display:flex] [min-height:0] [flex:1]">
        <nav aria-label={`${spec.title} views`} className="[width:220px] [flex-shrink:0] [overflow-y:auto] [border-right:1px_solid_rgba(85,_205,_232,_0.14)] [background:#0a141e] [padding:10px]">
          {spec.screens.map((screenName, index) => { const screen = relevant.find(item => item.mesh === screenName || item.id === screenName); return <button key={screenName} className={`font-dm-sans [display:block] [width:100%] [margin-bottom:6px] [border:1px_solid_transparent] [border-radius:7px] [padding:10px] [text-align:left] [cursor:pointer] ${selected === index ? "[border-color:rgba(85,205,232,0.4)] [background:#122735] [color:#dff8ff]" : "[background:transparent] [color:#91aab7]"}`} onClick={() => setSelected(index)}>{screen?.title ?? screenName}</button>; })}
          {spec.workstation && <div className="[margin-top:12px] [border-top:1px_solid_rgba(85,_205,_232,_0.12)] [padding-top:12px] [color:#8da5b0] [font-size:12px]">Personal workstation interface. No additional systems are exposed from this terminal.</div>}
          {allowedTasks.length > 0 && <div className="[margin-top:18px] [border-top:1px_solid_rgba(85,_205,_232,_0.12)] [padding-top:12px]"><div className="font-mono [color:#e88747] [font-size:10px] [letter-spacing:0.1em]">MISSION TASKS HERE</div>{allowedTasks.map(id => { const task = mission.steps.find(step => step.stepId === id); return <p key={id} className="[margin:8px_0] [color:#c6d6dc] [font-size:11px]">{game?.missionManager.isStepComplete(id) ? "✓ " : "○ "}{task?.label}</p>; })}</div>}
        </nav>
        <main className="[min-width:0] [flex:1] [overflow-y:auto] [padding:14px]">
          {spec.section ? <TriggerScreenView record={selectedRecord} location={spec.location} dataMode={dataMode} showSol3TargetGallery={state.missionDay === 3 && spec.section === "missionControl" && selectedRecord?.id === "MC_OBSERVATION_SITES"} selectedTargetId={selectedTargetId} /> : <div className="[padding:18px]"><div className="font-mono [color:#e88747] [font-size:10px]">PERSONAL MISSION WORKSPACE · SOL {state.missionDay}</div><h2 className="font-kdam-thmor-pro [color:white]">{mission.title}</h2><p className="font-dm-sans [color:#c6d5db]">{mission.primaryObjective}</p><div className="[margin-top:14px] [border-radius:8px] [background:#101d28] [padding:14px]"><div className="[color:#55cde8] [font-size:11px]">CHECKLIST PROGRESS</div><p>{state.completedStepCount} of {state.totalStepCount} mission tasks complete</p><p className="[color:#9db1bb] [font-size:12px]">This personal workspace does not provide remote system controls or live subsystem telemetry.</p></div></div>}
          {state.missionDay === 5 && triggerId === "MC_NAVIGATION_01" && <section className="[margin-top:18px] [border-top:1px_solid_rgba(85,_205,_232,_0.18)] [padding-top:16px]"><Sol5MissionPanel game={game} state={state} /></section>}
          {state.missionDay === 6 && ["MC_NAVIGATION_01", "MC_MAIN_01", "LAB_RESEARCH_ANALYSIS_01", "LAB_RESEARCH_MONITORING_01", "LAB_CULTIVATION_01"].includes(triggerId) && <Sol6MissionPanel manager={game?.missionManager} triggerId={triggerId} />}
          {state.missionDay === 7 && <Sol7MissionPanel manager={game?.missionManager} game={game ?? undefined} triggerId={triggerId} />}
          {allowedTasks.length > 0 && <section className="[border-top:1px_solid_rgba(85,_205,_232,_0.18)] [margin-top:10px] [padding-top:10px]"><MissionInvestigationPanel game={game} initialTaskId={allowedTasks[0]} availableTaskIds={allowedTasks} showSavedRecords={allowedTasks.includes("SOL02_READINESS_ASSESSMENT") || allowedTasks.includes("SOL03_SUBMIT_TARGET_RECORD")} /></section>}
          {triggerId === "HAB_MONITOR_01" && <section className="[margin:8px_12px] [border-top:1px_solid_rgba(85,_205,_232,_0.15)] [padding:12px]"><div className="font-mono [color:#55cde8] [font-size:10px]">OUTPOST OVERVIEW</div><p className="[color:#dce8ed]">Sol {state.missionDay} · {mission.title} · {missionState?.objectiveState ?? state.objectiveState}</p><p className="[color:#9fb4c0] [font-size:12px]">{mission.primaryObjective}</p><p className="[color:#d4ad72] [font-size:12px]">{game?.missionManager.getMissionTaskProgress().remaining ?? 0} required mission tasks remain. System-specific records stay in their own consoles.</p>{state.notification && <p role="status" className="[border-left:2px_solid_#e88747] [padding-left:8px] [color:#e8c18d] [font-size:12px]">Mission notification: {state.notification}</p>}</section>}
        </main>
      </div>
    </div>
  </div>;
}
