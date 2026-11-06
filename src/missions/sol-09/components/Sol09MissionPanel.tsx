"use client";

import React, { useEffect, useState } from "react";
import type { Game } from "@/core/Game";
import sol09Mission from "@/jsons/Missions/sol-09.json";
import habitatScreens from "@/jsons/Screens/habitatScreenData.json";
import engineeringScreens from "@/jsons/Screens/engineeringScreenData.json";
import researchScreens from "@/jsons/Screens/research-zone-screens.json";
import { SOL09_TASKS, type Sol09RackId, type Sol09TaskId } from "../taskDefinitions";

const card = "[margin-top:12px] [border:1px_solid_rgba(85,_205,_232,_0.2)] [border-radius:8px] [background:#0c1822] [padding:14px]";
const button = "[border:1px_solid_#4c7586] [border-radius:5px] [background:#14303c] [padding:8px_12px] [color:#e4f5f8] [cursor:pointer] disabled:[opacity:0.45]";
const jsonScreen = (data: any, name: string) => Array.isArray(data?.screens)
  ? data.screens.find((entry: any) => entry.meshName === name || entry.screenId === name)
  : data?.screens?.[name];
const legacyScreen = (data: any, name: string) => data?.screens?.[name];
const text = (value: unknown) => value === null || value === undefined ? "Unavailable / not recorded" : typeof value === "object" ? JSON.stringify(value) : String(value);

const CULTIVATION_VIEWS = ["history", "rack01", "rack02", "irrigation", "nutrients", "evidence"];
const TASKS_BY_TRIGGER: Record<string, Sol09TaskId[]> = {
  HAB_WATER_NUTRITION_01: ["SOL09_TASK_01"],
  LAB_CULTIVATION_01: ["SOL09_TASK_02", "SOL09_TASK_03", "SOL09_TASK_04", "SOL09_TASK_07", "SOL09_TASK_08", "SOL09_TASK_09"],
  Engineering_LifeSupport_Trigger: ["SOL09_TASK_05", "SOL09_TASK_06"],
  MC_MAIN_01: ["SOL09_TASK_10"]
};

export function Sol09MissionPanel({ game, triggerId }: { game: Game | null; triggerId: string }) {
  const manager = game?.missionManager;
  const progress = manager?.getSol09Progress();
  const missionState = manager?.getState();
  const [view, setView] = useState("history");
  const [message, setMessage] = useState("");
  const [reportSections, setReportSections] = useState<Record<string, string>>({});
  useEffect(() => {
    setView(triggerId === "HAB_WATER_NUTRITION_01" ? "habitat" : triggerId === "Engineering_LifeSupport_Trigger" ? "water" : triggerId === "MC_MAIN_01" ? "report" : "history");
    setMessage("");
  }, [triggerId]);
  if (!manager || !progress || !missionState) return null;

  const habitat = legacyScreen(habitatScreens, "Habitat_WaterNutrition_Display")?.data ?? {};
  const engineering = legacyScreen(engineeringScreens, "LifeSupportUnitScreenMain02.001")?.data ?? {};
  const nutrient = jsonScreen(researchScreens, "WaterNutrition_MixingScreen")?.content ?? {};
  const experiment = missionState.sol6.cultivation;
  const requiredSections = sol09Mission.report.requiredSections;
  const rackText = (rack: Sol09RackId) => progress.racks[rack].inspection?.finding ?? "Rack-specific record unavailable.";
  const waters = progress.water.diagnosis?.finding ?? "No Engineering diagnosis recorded.";
  const tasks = Object.values(progress.evidence).map(item => item?.finding).filter(Boolean).join(" ");
  const summary: Record<string, string> = {
    mission_summary: "Sol 9 reviews cultivation and water-system records using the existing project displays.",
    SOL_7_storm_record_review: "Sol 7 report is preserved. Storm timestamps or water impact are unavailable unless recorded in the Sol 7 state.",
    water_reserve_status: `Habitat display record: ${text(habitat.waterReserve)}. Source is a simulated display configuration.`,
    main_water_supply_diagnostic: waters,
    water_restoration_result: progress.water.restoration?.finding ?? "No verified restoration mapping or result is available.",
    rack_01_inspection: rackText("rack01"),
    rack_02_inspection: rackText("rack02"),
    irrigation_verification: `${progress.racks.rack01.irrigationResult}: ${progress.racks.rack01.irrigationRecord?.finding ?? "Rack 01 not verified."}; ${progress.racks.rack02.irrigationResult}: ${progress.racks.rack02.irrigationRecord?.finding ?? "Rack 02 not verified."}`,
    nutrient_distribution_assessment: progress.nutrientVerification?.finding ?? "No rack-specific nutrient reading or calibration target is mapped.",
    SOL_6_experiment_history: experiment ? `Existing Sol 6 experiment ${experiment.id}: ${experiment.status}.` : "Sol 6 cultivation record unavailable in this save.",
    soil_sample_provenance: experiment ? `Existing sample identity ${experiment.sampleId}; provenance retained from Sol 6.` : "Sample identity/provenance unavailable in this save.",
    plant_condition_assessment: "No plant condition is attributed to either rack because the inspected scene has no named rack-to-chamber mapping.",
    seed_storage_status_if_available: "Seed storage values not retrieved by this assessment.",
    data_limitations: "Existing screen configuration contains simulated metrics. Mars terrain/Research GLB does not expose named rack objects, and the Engineering model has no named water repair control or Board and Supply display mapping.",
    final_conclusion: tasks || "No Sol 9 records have been saved."
  };

  const record = (task: Sol09TaskId, trigger: string, finding: string, provenance: string) => {
    const ok = manager.recordSol09TaskEvidence(task, trigger, finding, provenance);
    setMessage(ok ? `${SOL09_TASKS.find(item => item.stepId === task)?.label} recorded.` : "This activity is not ready or the required existing interaction mapping is unavailable.");
  };
  const source = (display: string) => `Existing PHOBOSIA display configuration: ${display}; values are simulated/configured telemetry, not NASA measurements.`;
  const completed = (taskId: string) => manager.isStepComplete(taskId);
  const sectionInput = (key: string) => <label key={key} className="[display:block] [margin:8px_0] [color:#b8cbd2] [font-size:11px]">{key.replaceAll("_", " ")}<textarea className="[display:block] [width:100%] [min-height:48px] [margin-top:4px] [border:1px_solid_#344c5b] [border-radius:4px] [background:#07111a] [padding:7px] [color:#e2edf1]" value={reportSections[key] ?? summary[key] ?? "Unavailable / not recorded."} onChange={event => setReportSections(previous => ({ ...previous, [key]: event.target.value }))} /></label>;
  const heading = triggerId === "HAB_WATER_NUTRITION_01" ? "Habitat Water and Nutrient Review"
    : triggerId === "Engineering_LifeSupport_Trigger" ? "Water Supply and Distribution Assessment"
      : triggerId === "MC_MAIN_01" ? "Sol 9 Final Report" : "Cultivation Management System";

  return <section className={card}>
    <div className="font-mono [color:#e88747] [font-size:10px] [letter-spacing:0.12em]">PHOBOSIA OS APPLICATION · SOL 9</div>
    <h2 className="font-kdam-thmor-pro [margin:5px_0] [color:#f1f6f8] [font-size:18px]">{heading}</h2>
    <p className="[margin:0] [color:#9eb4be] [font-size:11px]">Existing E-key application · this console shows only its assigned Sol 9 activities.</p>

    {triggerId === "HAB_WATER_NUTRITION_01" && <div className={card}>
      <h3>Habitat water warning</h3>
      <p className="[color:#ffc27d]">Sol 9 water-system fault flagged. Notify Engineering for diagnosis; this Habitat console does not control or repair the water supply.</p>
      <p>Configured reserve display: {text(habitat.waterReserve?.value)} {text(habitat.waterReserve?.unit)} · {text(habitat.waterReserve?.status)}</p>
      <p>Configured recycling display: {text(habitat.waterRecycling?.efficiency)} {text(habitat.waterRecycling?.unit)} · {text(habitat.waterRecycling?.status)}</p>
      <p className="[color:#d8b881] [font-size:11px]">These values are existing simulated display configuration; the Sol 9 fault notice is not a live sensor measurement.</p>
      {!completed("SOL09_TASK_01") && <button className={button} onClick={() => record("SOL09_TASK_01", "HAB_WATER_NUTRITION_01", `Reported the Sol 9 water-system fault to Engineering. Habitat configured display shows reserve ${text(habitat.waterReserve?.value)} ${text(habitat.waterReserve?.unit)} and recycling ${text(habitat.waterRecycling?.efficiency)} ${text(habitat.waterRecycling?.unit)}; values are simulated and do not establish main-supply condition.`, source("Habitat_WaterNutrition_Display."))}>Notify Engineering of water fault</button>}
      {completed("SOL09_TASK_01") && <p role="status" className="[color:#80dfa4]">Water fault notification recorded. Continue to the assigned console when directed.</p>}
    </div>}

    {triggerId === "LAB_CULTIVATION_01" && <>
      <nav className="[display:flex] [flex-wrap:wrap] [gap:6px] [margin-top:12px]" aria-label="Cultivation tasks">
        {CULTIVATION_VIEWS.map(item => <button key={item} className={button} aria-pressed={view === item} onClick={() => { setView(item); setMessage(""); }}>{item === "evidence" ? "EVIDENCE REVIEW" : item.toUpperCase()}</button>)}
      </nav>
      {view === "history" && <div className={card}>
        <h3>Existing Sol 6 experiment history</h3>
        {experiment ? <><p>Experiment: {experiment.id}</p><p>Sample: {experiment.sampleId}</p><p>Status: {experiment.status}</p><p>Start Sol: {experiment.startSol} · Expected result Sol: {experiment.expectedResultSol}</p><p>Unit: {experiment.unitReference}</p></> : <p>Sol 6 cultivation record not found in this saved mission state.</p>}
        {!completed("SOL09_TASK_02") && <button className={button} disabled={!completed("SOL09_TASK_01")} onClick={() => record("SOL09_TASK_02", "LAB_CULTIVATION_01", experiment ? `Reviewed existing Sol 6 experiment ${experiment.id}, sample ${experiment.sampleId}, status ${experiment.status}.` : "Reviewed the available history view; no persisted Sol 6 experiment record exists in this save.", "Persisted Sol 6 cultivation record; original record not modified.")}>Record experiment review</button>}
      </div>}
      {(view === "rack01" || view === "rack02") && (() => {
        const rackId = view as Sol09RackId;
        const taskId: Sol09TaskId = rackId === "rack01" ? "SOL09_TASK_03" : "SOL09_TASK_04";
        const rack = progress.racks[rackId];
        return <div className={card}><h3>{rackId === "rack01" ? "Cultivation Rack 01" : "Cultivation Rack 02"}</h3>
          <p>Physical rack object mapping: unavailable in inspected Research Zone GLB.</p><p>Rack-specific plant, irrigation and automation telemetry: unavailable; configured chamber data is not assigned to this rack.</p>
          {rack.inspection && <p>Saved finding: {rack.inspection.finding}</p>}
          {!completed(taskId) && <button className={button} disabled={!completed(rackId === "rack01" ? "SOL09_TASK_02" : "SOL09_TASK_03")} onClick={() => record(taskId, "LAB_CULTIVATION_01", `${rackId.toUpperCase()} inspection completed; named physical mapping and rack-specific data are unavailable, so no chamber measurements were attributed.`, "Existing Cultivation_EnvironmentScreen reviewed; scene mesh names inspected; rack identity mapping unavailable.")}>Record {rackId === "rack01" ? "Rack 01" : "Rack 02"} inspection and limitations</button>}
        </div>;
      })()}
      {view === "irrigation" && <div className={card}>
        <h3>Rack irrigation verification</h3><p>Review each rack independently. The inspected scene does not map a physical irrigation line or test control to either rack.</p>
        {(["rack01", "rack02"] as const).map(rackId => <div key={rackId} className="[margin-top:10px] [border-top:1px_solid_#263d49] [padding-top:8px]"><p>{rackId.toUpperCase()}: inspection {progress.racks[rackId].inspection ? "recorded" : "pending"} · irrigation {progress.racks[rackId].irrigationResult}</p>{progress.racks[rackId].irrigationRecord && <p>{progress.racks[rackId].irrigationRecord.finding}</p>}{!progress.racks[rackId].irrigationRecord && <button className={button} disabled={!completed("SOL09_TASK_06") || !progress.racks[rackId].inspection} onClick={() => manager.recordSol09IrrigationTest(rackId, "LAB_CULTIVATION_01", "unavailable", `${rackId.toUpperCase()} irrigation test unavailable: no named rack, line or supported test control is mapped.`, "Research Zone GLB and cultivation screen configuration inspection.")}>Record {rackId.toUpperCase()} verification unavailable</button>}</div>)}
        <p className="[color:#d8b881] [font-size:11px]">Unavailable results preserve the limitation and do not count as successful irrigation verification.</p>
      </div>}
      {view === "nutrients" && <div className={card}>
        <h3>Nutrient supply</h3><p>Configured source: WaterNutrition_MixingScreen</p><p>{text(nutrient?.header?.subtitle ?? "Mixing data unavailable")}</p>
        <p>Rack-specific nutrient delivery, pH, EC and calibration targets are unavailable; no values are invented.</p>
        {completed("SOL09_TASK_07") && !completed("SOL09_TASK_08") && <button className={button} onClick={() => record("SOL09_TASK_08", "LAB_CULTIVATION_01", "Nutrient availability reviewed; per-rack delivery mapping, supported calibration targets and rack-specific nutrient measurements are unavailable.", source("Research Zone nutrient preparation configuration; simulated display only."))}>Record nutrient data limitations</button>}
      </div>}
      {view === "evidence" && <div className={card}>
        <h3>Cultivation evidence review</h3><p>Sol 6 experiment: {experiment ? `${experiment.status} · sample ${experiment.sampleId}` : "Unavailable in this save."}</p><p>Rack 01: {progress.racks.rack01.inspection ? "inspection recorded" : "pending"} · irrigation {progress.racks.rack01.irrigationResult}</p><p>Rack 02: {progress.racks.rack02.inspection ? "inspection recorded" : "pending"} · irrigation {progress.racks.rack02.irrigationResult}</p><p>Nutrient review: {progress.nutrientVerification ? "recorded" : "pending"}. Engineering water diagnosis remains at its separate Engineering console.</p>
        {!completed("SOL09_TASK_09") && <button className={button} disabled={!completed("SOL09_TASK_08")} onClick={() => record("SOL09_TASK_09", "LAB_CULTIVATION_01", "Reviewed the preserved Sol 6 experiment and separate Rack 01/Rack 02 findings, irrigation results and nutrient limitations. Engineering water findings remain in their own record.", "Persisted Sol 9 cultivation evidence and read-only Sol 6 cultivation history.")}>Confirm cultivation evidence review</button>}
      </div>}
    </>}

    {triggerId === "Engineering_LifeSupport_Trigger" && <div className={card}>
      <h3>Water supply diagnosis and recovery</h3>
      <p>Existing display: LifeSupportUnitScreenMain02.001.</p>
      <p>Configured readings: potable reserve {text(engineering.potableReservePct)}%; greywater recycling {text(engineering.greywaterRecyclePct)}%; water buffer {text(engineering.waterBufferLitres)} L. These values are simulated telemetry.</p>
      <p>Main supply status: {progress.water.mainSupplyStatus}. Distribution: unknown / unavailable.</p>
      <p className="[color:#d8b881] [font-size:11px]">The requested Board and Supply display and a physical main-water repair control were not present in the inspected Engineering model. This console is the only Sol 9 location for water diagnosis/recovery; no repair is claimed without a supported control and verified result.</p>
      {!completed("SOL09_TASK_05") && <button className={button} disabled={!completed("SOL09_TASK_04")} onClick={() => record("SOL09_TASK_05", "Engineering_LifeSupport_Trigger", `Reviewed resource display values: potable reserve ${text(engineering.potableReservePct)}%; greywater recycling ${text(engineering.greywaterRecyclePct)}%; buffer ${text(engineering.waterBufferLitres)} L. Main supply status remains unknown.`, source("LifeSupportUnitScreenMain02.001 configured simulated telemetry; no live water-supply status."))}>Record water diagnosis</button>}
      {completed("SOL09_TASK_05") && !completed("SOL09_TASK_06") && <button className={`${button} [margin-left:8px]`} onClick={() => manager.recordSol09WaterRecoveryUnavailable("Engineering_LifeSupport_Trigger", "Main water supply restoration could not be verified; no physical repair object or supported control is mapped. No repair is claimed.", "Engineering model and screen configuration inspection; configured water telemetry does not expose main-supply state.")}>Record restoration unavailable</button>}
      {progress.water.restoration && <p className="[margin-top:8px]">Recovery record: {progress.water.restoration.finding}</p>}
    </div>}

    {triggerId === "MC_MAIN_01" && <div className={card}>
      <h3>Sol 9 water and cultivation assessment report</h3><p>Report submission is available here after the preceding system-specific reviews. Required physical recovery verification remains mandatory; unavailable controls cannot validate restoration.</p>
      {requiredSections.map(sectionInput)}
      <button className={button} disabled={Boolean(progress.report)} onClick={() => { const sections = Object.fromEntries(requiredSections.map(key => [key, reportSections[key] ?? summary[key] ?? "Unavailable / not recorded."])); const result = manager.submitSol09Report(sections); setMessage(result.message); }}>{progress.report ? "Report validated" : "Submit Sol 9 report"}</button>
    </div>}

    {message && <p role="status" className="[margin-top:10px] [color:#a8dfba]">{message}</p>}
    <div className="[margin-top:12px] [color:#89a7b4] [font-size:11px]">{(TASKS_BY_TRIGGER[triggerId] ?? []).map(id => `${SOL09_TASKS.find(task => task.stepId === id)?.label}: ${completed(id) ? "recorded" : "pending"}`).join(" · ")}</div>
    <div className="[margin-top:8px] [color:#d4ad72] [font-size:10px]">Mission data is persistent. Prior Sol records remain read-only.</div>
  </section>;
}
