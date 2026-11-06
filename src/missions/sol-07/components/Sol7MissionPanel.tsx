"use client";

import React, { useState } from "react";
import type { MissionManager } from "@/core/MissionManager";
import type { Game } from "@/core/Game";
import type { Sol7PowerAssessment, Sol7TaskId } from "../taskDefinitions";

const TASK_FOR_TRIGGER: Record<string, Sol7TaskId> = {
  HAB_MONITOR_01: "SOL07_HABITAT_STORM_ALERT",
  MC_SYSTEMS_01: "SOL07_MISSION_CONTROL_SYSTEMS",
  MC_NAVIGATION_01: "SOL07_MISSION_CONTROL_SYSTEMS",
  Module_Status_Display: "SOL07_CENTRAL_HUB_STATUS",
  Airlock_Control_Console_Trigger: "SOL07_VERIFY_EVA_LOCKDOWN",
  LAB_RESEARCH_MONITORING_01: "SOL07_RESEARCH_POWER",
  LAB_CULTIVATION_01: "SOL07_RESEARCH_POWER",
  Engineering_PowerUnit_Trigger: "SOL07_ENGINEERING_POWER",
  MC_MAIN_01: "SOL07_SUBMIT_STORM_REPORT"
};
const POWER_FIELDS: Array<[keyof Sol7PowerAssessment, string]> = [
  ["solarGeneration", "Solar generation output"], ["availableReserve", "Available power reserve"], ["estimatedReserveDuration", "Estimated reserve duration"],
  ["solarPanelA", "Solar panel A status"], ["solarPanelB", "Solar panel B status"], ["mainSolarLine", "Outdoor main solar power line status"],
  ["distribution", "Power distribution status"], ["lifeSupport", "Life-support power status"], ["scienceCultivation", "Science/cultivation power availability"]
];
const initialPower = Object.fromEntries(POWER_FIELDS.map(([key]) => [key, "Unavailable: no verified source value configured."])) as Sol7PowerAssessment;
const button = "[border:1px_solid_#4c879d] [background:#102b39] [padding:9px_12px] [color:#cbeaf2] [cursor:pointer] hover:[background:#173b4b]";

export function Sol7MissionPanel({ manager, game, triggerId }: { manager?: MissionManager; game?: Game; triggerId: string }) {
  const [, refresh] = useState(0);
  const [notes, setNotes] = useState("");
  const [power, setPower] = useState<Sol7PowerAssessment>(initialPower);
  const [message, setMessage] = useState<string | null>(null);
  if (!manager || manager.getState().currentDay !== 7) return null;
  const progress = manager.getSol7Progress();
  const allAssessmentTasksComplete = ["SOL07_HABITAT_STORM_ALERT", "SOL07_MISSION_CONTROL_SYSTEMS", "SOL07_CENTRAL_HUB_STATUS", "SOL07_VERIFY_EVA_LOCKDOWN", "SOL07_RESEARCH_POWER", "SOL07_ENGINEERING_POWER"].every(id => manager.isStepComplete(id));
  const task: Sol7TaskId | undefined = triggerId === "MC_NAVIGATION_01" && allAssessmentTasksComplete ? "SOL07_SUBMIT_STORM_REPORT" : TASK_FOR_TRIGGER[triggerId];
  const done = (id: Sol7TaskId) => manager.isStepComplete(id);
  const run = (action: () => boolean) => { const ok = action(); setMessage(ok ? "Task assessment recorded." : task === "SOL07_CENTRAL_HUB_STATUS" && notes.trim().length < 8 ? "Record the visible operational, degraded or unavailable states before saving." : task === "SOL07_VERIFY_EVA_LOCKDOWN" ? "Lockdown verification is unavailable. Use this Airlock Control Console during the active Sol 7 assessment." : "Task not recorded. Complete the previous required task first."); refresh(n => n + 1); };
  const tasks: Sol7TaskId[] = ["SOL07_HABITAT_STORM_ALERT", "SOL07_MISSION_CONTROL_SYSTEMS", "SOL07_CENTRAL_HUB_STATUS", "SOL07_VERIFY_EVA_LOCKDOWN", "SOL07_RESEARCH_POWER", "SOL07_ENGINEERING_POWER"];
  const taskLabels = ["Habitat alert", "Mission Control", "Central Hub", "EVA lockdown", "Science power", "Engineering power"];
  return <section className="[margin:12px] [border:1px_solid_rgba(239,_111,_101,_0.35)] [background:rgba(25,_13,_17,_0.92)] [padding:14px]">
    <div className="font-mono [color:#ff8a79] [font-size:10px] [letter-spacing:0.12em]">SOL 7 · DUST STORM ASSESSMENT</div>
    <p className="[color:#d6e6ed] [font-size:12px]">Temporary surface restriction is active under the shared EVA access policy. All status values require provenance; gameplay telemetry is simulated.</p>
    <ol className="[grid] [gap:4px] [padding-left:20px] [color:#a9bdc7] [font-size:11px]">{tasks.map((id, index) => <li key={id} className={done(id) ? "[color:#83e2a7]" : ""}>{taskLabels[index]} — {done(id) ? "RECORDED" : "PENDING"}</li>)}</ol>
    {task && !done(task) && task !== "SOL07_ENGINEERING_POWER" && task !== "SOL07_SUBMIT_STORM_REPORT" && <div className="[display:grid] [gap:8px]">
      {task === "SOL07_HABITAT_STORM_ALERT" && <p className="[color:#e7c8bd] [font-size:12px]">Review safety guidance: remain inside while the gameplay-simulated dust storm is active. Outdoor access is temporarily restricted until report validation.</p>}
      {task === "SOL07_VERIFY_EVA_LOCKDOWN" && <p className="[color:#e7c8bd] [font-size:12px]">The storm lock intentionally keeps Terrain closed even when your suit is active. Do not try to enter the surface to validate this task. Verify the existing access block here at the Airlock Control Console; normal EVA suit requirements remain in force.</p>}
      {task === "SOL07_RESEARCH_POWER" && <p className="[color:#e7c8bd] [font-size:12px]">Review both existing screens: Research Monitoring (LAB_RESEARCH_MONITORING_01) and Cultivation Environment (LAB_CULTIVATION_01). After recording one screen, close this interface and interact with the other screen in the Research Lab. Existing Sol 6 experiment: {manager.getState().sol6.cultivation?.status ?? "unavailable"}; sample ID: {manager.getState().sol6.sample?.sampleId ?? "unavailable"}. Its record and provenance are read-only.</p>}
      {(task === "SOL07_MISSION_CONTROL_SYSTEMS" || task === "SOL07_RESEARCH_POWER") && <div className="[grid] [gap-5]">{(task === "SOL07_MISSION_CONTROL_SYSTEMS" ? ["MC_SYSTEMS_01", "MC_NAVIGATION_01"] : ["LAB_RESEARCH_MONITORING_01", "LAB_CULTIVATION_01"]).map(id => <div key={id} className="[color:#a9bdc7] [font-size:11px]">{id.replaceAll("_", " ")}: {progress.reviewedScreens.includes(id) ? "REVIEWED" : "PENDING"}</div>)}<label className="[color:#a9bdc7] [font-size:11px]">Visible status and limitations from this display<textarea className="[mt-1] [w-full] [border:1px_solid_#35586a] [background:#07131c] [p-2] [color:#e5f0f3]" rows={2} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Record only the statuses and provenance shown on this display." /></label><button className={button} onClick={() => {
        const complete = manager.recordSol7ScreenReview(triggerId, notes);
        const saved = manager.getSol7Progress().reviewedScreens.includes(triggerId);
        const pairedScreen = triggerId === "LAB_RESEARCH_MONITORING_01" ? "Cultivation Environment (LAB_CULTIVATION_01)" : triggerId === "LAB_CULTIVATION_01" ? "Research Monitoring (LAB_RESEARCH_MONITORING_01)" : triggerId === "MC_SYSTEMS_01" ? "Navigation (MC_NAVIGATION_01)" : "Systems (MC_SYSTEMS_01)";
        setMessage(complete
          ? "Both displays reviewed; assessment recorded."
          : saved
            ? `This display review is saved. Visit ${pairedScreen} and record its visible status to complete the task.`
            : notes.trim().length < 8
              ? "Enter at least 8 characters describing visible status or limitations, then record this display."
              : "This display was not recorded. Confirm its status and that the previous task is complete.");
        refresh(n => n + 1);
      }}>{progress.reviewedScreens.includes(triggerId) ? "Update this display review" : "Record this display review"}</button></div>}
      {task === "SOL07_CENTRAL_HUB_STATUS" && <label className="[color:#a9bdc7] [font-size:11px]">Visible section and distribution states<textarea className="[mt-1] [w-full] [border:1px_solid_#35586a] [background:#07131c] [p-2] [color:#e5f0f3]" rows={3} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Record operational, degraded or unavailable states visible on the Hub display." /></label>}
      {task !== "SOL07_MISSION_CONTROL_SYSTEMS" && task !== "SOL07_RESEARCH_POWER" && <button className={button} onClick={() => run(() => task === "SOL07_VERIFY_EVA_LOCKDOWN" ? Boolean(game?.verifySol7EVALockdown() && manager.recordSol7Assessment(task, "Verified: the shared EVA access check blocks Terrain entry during the active Sol 7 storm; normal suit rules remain enabled.")) : task === "SOL07_CENTRAL_HUB_STATUS" ? (notes.trim().length >= 8 && manager.recordSol7Assessment(task, notes)) : manager.recordSol7Assessment(task, notes || undefined))}>{task === "SOL07_HABITAT_STORM_ALERT" ? "Acknowledge safety alert" : task === "SOL07_VERIFY_EVA_LOCKDOWN" ? "Verify shared EVA lockdown" : "Record assessment"}</button>}
    </div>}
    {task === "SOL07_ENGINEERING_POWER" && !done(task) && <div className="[grid] [gap-7]">
      <p className="[color:#e7c8bd] [font-size:12px]">Read-only. No Sol 8 repair triggers are enabled here. Keep the default “Unavailable” entries when the existing screens do not provide a verified value.</p>
      {POWER_FIELDS.map(([key, label]) => <label key={key} className="[color:#a9bdc7] [font-size:11px]">{label}<input className="[mt-1] [w-full] [border:1px_solid_#35586a] [background:#07131c] [p-2] [color:#e5f0f3]" value={power[key]} onChange={event => setPower({ ...power, [key]: event.target.value })} /></label>)}
      <div className="[color:#d5b87e] [font-size:10px]">Prefix every entry with “Source-backed:”, “Existing telemetry:”, “Unavailable:” or “Gameplay simulation:”. No NASA measurements are asserted.</div>
      <button className={button} onClick={() => { const ok = manager.recordSol7PowerAssessment(power); setMessage(ok ? "Read-only power assessment recorded." : "Complete Research Power first and classify all nine values with an accepted provenance prefix."); refresh(n => n + 1); }}>Save power assessment</button>
    </div>}
    {task === "SOL07_SUBMIT_STORM_REPORT" && <div className="[grid] [gap-8]">
      <p className="[color:#e7c8bd] [font-size:12px]">Final report contains all six validated task records. On acceptance, Sol 7 sounds fade, captured light properties are restored, storm/EVA lockdown ends and the power assessment is persisted. Sol 8 will not start automatically.</p>
      <button className={button} disabled={Boolean(progress.report)} onClick={() => { const result = manager.submitSol7Report(); setMessage(result.message); if (result.success) game?.onSol7ReportValidated(); refresh(n => n + 1); }}>{progress.report ? "Report validated" : "Submit and validate Sol 7 report"}</button>
    </div>}
    {message && <p role="status" className="[color:#8fd8b3] [font-size:11px]">{message}</p>}
    {progress.report && <p className="[color:#83e2a7] [font-size:12px]">Report validated. Sol 8 remains inactive.</p>}
    <div className="[mt-3] [border-top:1px_solid_rgba(85,_205,_232,_0.14)] [pt-2] [color:#7f9aa7] [font-size:11px]">{manager.getMissionTaskProgress().completed} / 7 required tasks recorded</div>
  </section>;
}
