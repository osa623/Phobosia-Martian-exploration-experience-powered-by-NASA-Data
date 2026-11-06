"use client";

import React, { useState } from "react";
import type { Game } from "@/core/Game";
import { DAYS_CONFIG } from "@/core/MissionManager";
import sol10Mission from "@/jsons/Missions/sol-10.json";
import { SOL10_TRIGGER_CHECKS, type Sol10VerificationStatus } from "../taskDefinitions";

const TASKS_BY_TRIGGER: Record<string, string[]> = {
  MC_MAIN_01: ["SOL10_TASK_01", "SOL10_TASK_07", "SOL10_TASK_08", "SOL10_TASK_09", "SOL10_TASK_10", "SOL10_TASK_11"],
  LAB_RESEARCH_ANALYSIS_01: ["SOL10_TASK_04"],
  LAB_CULTIVATION_01: ["SOL10_TASK_05"],
  Engineering_LifeSupport_Trigger: ["SOL10_TASK_06"]
};

const panel = "[margin-top:12px] [border:1px_solid_rgba(85,_205,_232,_0.2)] [border-radius:8px] [background:#0c1822] [padding:14px]";
const action = "[border:1px_solid_#4c7586] [border-radius:5px] [background:#14303c] [padding:8px_12px] [color:#e4f5f8] [cursor:pointer] disabled:[opacity:0.45]";
const humanize = (key: string) => key.replaceAll("_", " ").toLowerCase();

function getSavedSolSummary(state: ReturnType<Game["missionManager"]["getState"]>, sol: number): { title: string; status: string; lines: string[] } {
  const mission = DAYS_CONFIG[sol as keyof typeof DAYS_CONFIG];
  if (sol === 1) {
    const records = state.observationRecords.filter(record => record.day === 1);
    const steps = mission.steps.map(step => `${state.completedStepIds.includes(step.stepId) ? "Recorded" : "Pending"}: ${step.label}`);
    return {
      title: mission.title,
      status: records.length ? `${records.length} saved observation record${records.length === 1 ? "" : "s"}` : "No observation records found",
      lines: [...records.map(record => `${record.id} · ${record.type}: ${record.summary}`), ...(!records.length ? ["No Sol 1 observation record is persisted in the current browser save."] : []), ...steps]
    };
  }
  if (sol <= 4) {
    const records = state.investigationRecords.filter(record => record.sol === sol);
    const steps = mission.steps.map(step => `${state.completedStepIds.includes(step.stepId) ? "Recorded" : "Pending"}: ${step.label}`);
    return {
      title: mission.title,
      status: records.length ? `${records.length} saved investigation record${records.length === 1 ? "" : "s"}` : "No investigation report record found",
      lines: [...records.map(record => `${record.taskId} · ${record.systemId}: ${record.playerConclusion}. ${record.rationale}`), ...(!records.length ? ["No investigation record is persisted for this Sol in the current browser save."] : []), ...steps]
    };
  }
  if (sol === 5) {
    const report = state.sol5.report;
    return { title: mission.title, status: report ? "Reconnaissance report saved" : "No reconnaissance report found", lines: report ? [`Record: ${report.id}`, `Target: ${report.targetId}`, `Submitted: ${report.submittedAt}`, `Images reviewed: ${report.imageIds.length}`, `Observed features: ${report.observedFeatures}`, `Interpretation: ${report.playerInterpretation}`, `Uncertainties: ${report.uncertainties}`, `Follow-up: ${report.groundFollowUp}`] : ["No Sol 5 report is persisted in the current browser save."] };
  }
  if (sol === 6) {
    const report = state.sol6.report;
    return { title: mission.title, status: report ? "Field report saved" : "No field report found", lines: [report ? `Report: ${report.id} · target ${report.targetId} · sample ${report.sampleId}` : "No Sol 6 report is persisted in the current browser save.", state.sol6.sample ? `Soil sample: ${state.sol6.sample.sampleId} · target ${state.sol6.sample.targetId} · ${state.sol6.sample.collectionStatus}` : "Soil sample: not recorded.", state.sol6.analysis ? `Analysis: ${state.sol6.analysis.id} · sample ${state.sol6.analysis.sampleId}` : "Analysis: not recorded.", state.sol6.cultivation ? `Cultivation: ${state.sol6.cultivation.id} · sample ${state.sol6.cultivation.sampleId} · ${state.sol6.cultivation.status}` : "Cultivation: not recorded."] };
  }
  if (sol === 7) {
    const report = state.sol7.report;
    return { title: mission.title, status: report ? "Storm assessment report saved" : "No storm report found", lines: [report ? `Submitted: ${report.submittedAt} · validated: ${report.validated}` : "No Sol 7 report is persisted in the current browser save.", `Reviewed interaction points: ${state.sol7.reviewedScreens.join(", ") || "none recorded"}`, ...Object.entries(state.sol7.screenReviewNotes).map(([trigger, notes]) => `${trigger}: ${notes}`)] };
  }
  if (sol === 8) {
    const report = state.sol8.report;
    return { title: mission.title, status: report ? "Power and communication report saved" : "No recovery report found", lines: [report ? `Submitted: ${report.submittedAt} · validated: ${report.validated}` : "No Sol 8 report is persisted in the current browser save.", `Panel A: ${state.sol8.repairs.SOL08_PANEL_A_CIRCUIT_REPAIR ? "repair recorded" : "not recorded"}`, `Panel B: ${state.sol8.repairs.SOL08_PANEL_B_CIRCUIT_REPAIR ? "repair recorded" : "not recorded"}`, `Main power connection: ${state.sol8.repairs.SOL08_MAIN_POWER_ROUTING_REPAIR ? "repair recorded" : "not recorded"}`, `Power restored: ${state.sol8.mainPowerRestored ? "yes" : "no"} · communication online: ${state.sol8.communicationOnline ? "yes" : "no"}`] };
  }
  const report = state.sol9.report;
  return { title: mission.title, status: report ? "Cultivation and water assessment saved" : "No Sol 9 report found", lines: [report ? `Submitted: ${report.submittedAt} · validated: ${report.validated}` : "No Sol 9 report is persisted in the current browser save.", ...Object.values(state.sol9.evidence).filter(Boolean).map(item => `${item!.taskId} · ${item!.triggerId}: ${item!.finding}`), `Main water status: ${state.sol9.water.mainSupplyStatus}`, `Rack 01 irrigation: ${state.sol9.racks.rack01.irrigationResult}`, `Rack 02 irrigation: ${state.sol9.racks.rack02.irrigationResult}`] };
}

function getTriggerSnapshot(state: ReturnType<Game["missionManager"]["getState"]>, triggerId: string): string[] {
  const investigation = state.investigationRecords.filter(record => record.triggerId === triggerId);
  const sol9Evidence = Object.values(state.sol9.evidence).filter(record => record?.triggerId === triggerId);
  const sol7Note = state.sol7.screenReviewNotes[triggerId];
  const rows = [
    ...investigation.map(record => `SOL ${String(record.sol).padStart(2, "0")} · ${record.taskId}: ${record.systemValidation}`),
    ...sol9Evidence.map(record => `SOL 09 · ${record!.taskId}: ${record!.finding}`),
    ...(sol7Note ? [`SOL 07 review note: ${sol7Note}`] : [])
  ];
  if (triggerId === "PowerUnit_A") rows.push(`SOL 08 panel A repair: ${state.sol8.repairs.SOL08_PANEL_A_CIRCUIT_REPAIR ? "validated repair persisted" : "no validated repair record"}`);
  if (triggerId === "PowerUnit_B") rows.push(`SOL 08 panel B repair: ${state.sol8.repairs.SOL08_PANEL_B_CIRCUIT_REPAIR ? "validated repair persisted" : "no validated repair record"}`);
  if (triggerId === "PowerUnit_AB_Main") rows.push(`SOL 08 main connection repair: ${state.sol8.repairs.SOL08_MAIN_POWER_ROUTING_REPAIR ? "validated repair persisted" : "no validated repair record"}`);
  if (triggerId === "Commuication_fix_Trigger") rows.push(`SOL 08 external communication: ${state.sol8.communicationOnline ? "online in saved mission state" : "not restored in saved mission state"}`);
  if (triggerId === "LAB_CULTIVATION_01") rows.push(`SOL 06 cultivation record: ${state.sol6.cultivation ? `${state.sol6.cultivation.id} · sample ${state.sol6.cultivation.sampleId}` : "not recorded"}`);
  if (rows.length === 0) rows.push("No SOL 1–9 record is directly keyed to this trigger in the current browser save. Review the current interaction and mark the result incomplete or flagged if evidence is absent.");
  return rows;
}

export function Sol10MissionPanel({ game, triggerId }: { game: Game | null; triggerId: string }) {
  const manager = game?.missionManager;
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState("");
  if (!manager || manager.getState().currentDay !== 10) return null;

  const state = manager.getState();
  const eligibleTaskIds = TASKS_BY_TRIGGER[triggerId] ?? [];
  const eligibleTasks = sol10Mission.tasks.filter(task => eligibleTaskIds.includes(task.taskId));
  const taskSteps = manager.getCurrentMission().steps;
  const triggerCheck = SOL10_TRIGGER_CHECKS.find(check => check.triggerId === triggerId);
  const triggerVerification = state.sol10.triggerVerifications[triggerId];
  const progress = manager.getMissionTaskProgress();

  return <section className={panel}>
    <div className="font-mono [color:#e88747] [font-size:10px] [letter-spacing:0.12em]">PHOBOSIA OS · SOL 10</div>
    <h2 className="font-kdam-thmor-pro [margin:5px_0] [color:#f1f6f8] [font-size:18px]">Final Expedition Verification</h2>
    <p className="[margin:0] [color:#9eb4be] [font-size:11px]">Tasks are bound to the existing physical E-key interaction point shown above. A task cannot be completed from a different module or display.</p>

    {triggerId === "MC_MAIN_01" && <div className={panel}>
      <h3>Saved Sol Reports · Browser Records</h3>
      <p>These summaries are read from the current persisted MissionManager browser save. Missing report data is shown as missing; reviewing availability does not create a report.</p>
      <div className="[display:grid] [gap:8px]">
        {Array.from({ length: 9 }, (_, index) => index + 1).map(sol => {
          const summary = getSavedSolSummary(state, sol);
          const reviewed = state.sol10.reviewedReportSols.includes(sol);
          return <details key={sol} className="[border:1px_solid_rgba(85,_205,_232,_0.16)] [border-radius:6px] [background:#09151e] [padding:10px]">
            <summary className="[cursor:pointer] [color:#dce8ed]">SOL {String(sol).padStart(2, "0")} · {summary.title} · {summary.status}{reviewed ? " · REVIEWED" : " · PENDING"}</summary>
            <ul className="[margin:8px_0] [padding-left:18px] [color:#aabdc5] [font-size:11px] [line-height:1.55]">{summary.lines.map((line, i) => <li key={i}>{line}</li>)}</ul>
            <button className={action} disabled={reviewed || !manager.isStepComplete("SOL10_TASK_01")} onClick={() => setMessage(manager.recordSol10ReportReviewed(sol) ? `SOL ${String(sol).padStart(2, "0")} availability review recorded.` : "Open the archive first, then review each Sol record.")}>{reviewed ? "Availability reviewed" : "Record this Sol review"}</button>
          </details>;
        })}
      </div>
      <p className="[color:#89a7b4] [font-size:11px]">Report review progress: {state.sol10.reviewedReportSols.length} / 9. Sol 10 Task 02 unlocks after all nine Sols have been reviewed separately.</p>
    </div>}

    {triggerCheck && <article className={panel}>
      <div className="font-mono [color:#55cde8] [font-size:10px]">PHYSICAL MODULE CHECK · {triggerCheck.moduleLabel}</div>
      <h3>{triggerCheck.title}</h3>
      <p>{triggerCheck.objective}</p>
      <p className="[color:#89a7b4] [font-size:11px]">Registered trigger: <code>{triggerCheck.triggerId}</code> · {triggerCheck.location}</p>
      <div className="[border-left:2px_solid_#376478] [background:#09151e] [padding:9px_12px]">
        <strong>Persisted status and provenance</strong>
        <ul className="[margin:6px_0] [padding-left:18px] [color:#aabdc5] [font-size:11px]">{getTriggerSnapshot(state, triggerId).map((row, i) => <li key={i}>{row}</li>)}</ul>
      </div>
      {triggerVerification ? <p role="status" className="[color:#a8dfba]">Saved status: {triggerVerification.status.toUpperCase()} · {triggerVerification.completedAt}{triggerVerification.notes ? ` · ${triggerVerification.notes}` : ""}</p> : <>
        <label className="[display:block] [margin-top:10px] [color:#b8cbd2] [font-size:11px]">Verification note (optional)<textarea className="[display:block] [width:100%] [min-height:48px] [margin-top:4px] [border:1px_solid_#344c5b] [border-radius:4px] [background:#07111a] [padding:7px] [color:#e2edf1]" value={notes} onChange={event => setNotes(event.target.value)} /></label>
        <div className="[display:flex] [flex-wrap:wrap] [gap:7px] [margin-top:8px]">
          {(["verified", "flagged", "incomplete"] as Sol10VerificationStatus[]).map(status => {
            const step = taskSteps.find(item => item.stepId === triggerCheck.taskId);
            const ready = (step?.requiresCompletedTasks ?? []).every(id => manager.isStepComplete(id));
            return <button key={status} className={action} disabled={!ready} onClick={() => setMessage(manager.recordSol10TriggerVerification(triggerId, status, notes) ? `${triggerCheck.title} recorded as ${status}.` : "Complete the preceding Sol 10 task before verifying this trigger.")}>{status === "flagged" ? "Flag for follow-up" : status === "incomplete" ? "Record incomplete" : "Verify current status"}</button>;
          })}
        </div>
      </>}
    </article>}

    {triggerId === "MC_MAIN_01" && <article className={panel}>
      <h3>Module Trigger Verification Summary</h3>
      <p>All {SOL10_TRIGGER_CHECKS.length} physical module interaction points from the existing trigger registry must have an individually saved result before this summary task can complete.</p>
      <p>Recorded: {Object.keys(state.sol10.triggerVerifications).length} / {SOL10_TRIGGER_CHECKS.length} · flagged: {Object.values(state.sol10.triggerVerifications).filter(item => item.status === "flagged").length} · incomplete: {Object.values(state.sol10.triggerVerifications).filter(item => item.status === "incomplete").length}</p>
      <button className={action} disabled={manager.isStepComplete("SOL10_TASK_03") || Object.keys(state.sol10.triggerVerifications).length !== SOL10_TRIGGER_CHECKS.length} onClick={() => setMessage(manager.recordSol10SectionVerification() ? "All registered trigger reviews are recorded." : "Visit each registered trigger and save its current verification status first.")}>{manager.isStepComplete("SOL10_TASK_03") ? "Trigger review complete" : "Complete module verification summary"}</button>
    </article>}

    {eligibleTasks.map(task => {
      const step = taskSteps.find(item => item.stepId === task.taskId);
      const completed = manager.isStepComplete(task.taskId);
      const dependenciesMet = (step?.requiresCompletedTasks ?? []).every(id => manager.isStepComplete(id));
      return <article key={task.taskId} className={panel}>
        <h3>{task.title}</h3>
        <p>{task.objective}</p>
        <button className={action} disabled={completed || !dependenciesMet} onClick={() => {
          const saved = manager.completeStep(task.taskId);
          setMessage(saved ? `${task.title} recorded.` : "Complete the preceding Sol 10 task before recording this review.");
        }}>{completed ? "Review recorded" : dependenciesMet ? "Confirm review at this interaction" : "Previous Sol 10 task required"}</button>
      </article>;
    })}
    {eligibleTasks.length === 0 && !triggerCheck && <p className="[color:#d4ad72] [font-size:11px]">This physical interaction point has no Sol 10 task assignment.</p>}
    {message && <p role="status" className="[margin-top:10px] [color:#a8dfba]">{message}</p>}
    <div className="[margin-top:10px] [color:#89a7b4] [font-size:11px]">Progress: {progress.completed} / {progress.total} tasks recorded.</div>
  </section>;
}
