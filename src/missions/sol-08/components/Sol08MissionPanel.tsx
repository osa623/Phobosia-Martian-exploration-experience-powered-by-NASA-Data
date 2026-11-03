"use client";

import React, { useState } from "react";
import type { Game } from "@/core/Game";
import sol08Mission from "@/jsons/Missions/sol-08.json";
import { Sol08CircuitPuzzle } from "./Sol08CircuitPuzzle";
import type { Sol08PuzzleId } from "../taskDefinitions";

const PUZZLES: Record<string, Sol08PuzzleId> = {
  PowerUnit_A: "SOL08_PANEL_A_CIRCUIT_REPAIR",
  PowerUnit_B: "SOL08_PANEL_B_CIRCUIT_REPAIR",
  PowerUnit_AB_Main: "SOL08_MAIN_POWER_ROUTING_REPAIR"
};

const REPAIR_TASK: Record<Sol08PuzzleId, string> = {
  SOL08_PANEL_A_CIRCUIT_REPAIR: "SOL08_REPAIR_SOLAR_PANEL_A",
  SOL08_PANEL_B_CIRCUIT_REPAIR: "SOL08_REPAIR_SOLAR_PANEL_B",
  SOL08_MAIN_POWER_ROUTING_REPAIR: "SOL08_REPAIR_MAIN_SOLAR_CONNECTION"
};

export function Sol08MissionPanel({ game, triggerId }: { game: Game | null; triggerId: string }) {
  const manager = game?.missionManager;
  const progress = manager?.getSol8Progress();
  const [message, setMessage] = useState("");
  const [puzzleOpen, setPuzzleOpen] = useState(false);
  const [reportSections, setReportSections] = useState<Record<string, string>>({});
  if (!manager || !progress) return null;

  const puzzleId = PUZZLES[triggerId];
  const record = (action: () => boolean, success: string) => {
    const ok = action();
    setMessage(ok ? success : "This task is not ready yet. Complete the preceding task shown in the navigation panel.");
    if (ok) window.dispatchEvent(new CustomEvent("phobosia-notification", { detail: success }));
  };
  const panelClass = "[margin-top:12px] [border:1px_solid_rgba(85,_205,_232,_0.2)] [border-radius:8px] [background:#0c1822] [padding:14px]";
  const buttonClass = "[border:1px_solid_#4c7586] [border-radius:5px] [background:#14303c] [padding:8px_12px] [color:#e4f5f8] [cursor:pointer]";
  const assessment = `Reserve ${progress.reservePowerPercent}% gameplay simulation; Panel A offline; Panel B offline; main solar line damaged; outpost distribution on reserve power.`;
  const communicationDiagnosis = "Mission Control communication status reviewed: external communications are offline and require their separate outdoor repair.";
  const powerVerification = "Engineering verifies the restored main supply, power distribution, restored configured lights, and faded power warning; communication remains a separate system.";

  if (puzzleOpen && puzzleId) return <section className={panelClass}>
    <Sol08CircuitPuzzle puzzleId={puzzleId} onCancel={() => setPuzzleOpen(false)} onValidated={(connections, retries) => {
      const ok = manager.recordSol08CircuitRepair(puzzleId, triggerId, connections, retries);
      if (ok) setPuzzleOpen(false);
      return ok;
    }} />
  </section>;

  return <section className={panelClass}>
    <div className="font-mono [color:#e88747] [font-size:10px] [letter-spacing:0.12em]">SOL 8 · POWER AND COMMUNICATION RECOVERY</div>

    {triggerId === "HAB_MONITOR_01" && <>
      <h3>Critical power failure</h3>
      <p>The outpost is operating on approximately {progress.reservePowerPercent}% reserve power. This is gameplay simulation; no verified telemetry was supplied.</p>
      <p>Solar generation is offline. Review this warning before continuing.</p>
      <button className={buttonClass} disabled={progress.powerAlertAcknowledged} onClick={() => record(() => manager.recordSol08PowerAlertReview(), "Power alert reviewed")}>{progress.powerAlertAcknowledged ? "Alert reviewed" : "Acknowledge power alert"}</button>
    </>}

    {triggerId === "Engineering_PowerUnit_Trigger" && <>
      <h3>Engineering Power Unit</h3>
      <p>Reserve: {progress.reservePowerPercent}% ({progress.reservePowerSource})</p>
      <p>Panel A: {progress.repairs.SOL08_PANEL_A_CIRCUIT_REPAIR ? "repaired" : "offline"} · Panel B: {progress.repairs.SOL08_PANEL_B_CIRCUIT_REPAIR ? "repaired" : "offline"} · Main line: {progress.repairs.SOL08_MAIN_POWER_ROUTING_REPAIR ? "repaired" : "damaged"}</p>
      {!progress.powerUnitInspected && <>
        <p>Review the displayed reserve, panel, main-line and distribution status, then record the assessment.</p>
        <button className={buttonClass} disabled={!manager.isStepComplete("SOL08_REVIEW_POWER_FAILURE_ALERT")} onClick={() => record(() => manager.recordSol08PowerUnitInspection(assessment), "Power unit assessment recorded")}>Record assessment</button>
      </>}
      {progress.powerUnitInspected && !progress.mainPowerRestored && <button className={buttonClass} onClick={() => record(() => manager.restoreSol08MainSupply(), "Main power restored")}>Verify repairs and restore main supply</button>}
      {progress.mainPowerRestored && !progress.powerRecoveryVerified && <>
        <p>Main supply restored. Communication failure remains active.</p>
        <button className={buttonClass} onClick={() => record(() => manager.verifySol08PowerRecovery(powerVerification), "Power recovery verified")}>Record power verification</button>
      </>}
    </>}

    {triggerId === "MC_SYSTEMS_01" && <>
      <h3>Communication diagnostics</h3>
      <p>External communication: OFFLINE. This failure is independent from power recovery and has no warning audio.</p>
      {!progress.communicationDiagnosed && <>
        <p>Review and record the displayed offline status and separate repair requirement.</p>
        <button className={buttonClass} disabled={!manager.isStepComplete("SOL08_INSPECT_ENGINEERING_POWER_UNIT")} onClick={() => record(() => manager.recordSol08CommunicationDiagnosis(communicationDiagnosis), "Communication diagnosis recorded")}>Record diagnosis</button>
      </>}
    </>}

    {triggerId === "PowerUnit_A" && <PuzzlePrompt title="Solar Panel A electrical repair" ready={progress.evaPrepared && manager.isStepComplete("SOL08_PREPARE_EVA")} done={Boolean(progress.repairs.SOL08_PANEL_A_CIRCUIT_REPAIR)} onStart={() => setPuzzleOpen(true)} />}
    {triggerId === "PowerUnit_B" && <PuzzlePrompt title="Solar Panel B electrical repair" ready={progress.evaPrepared && Boolean(progress.repairs.SOL08_PANEL_A_CIRCUIT_REPAIR)} done={Boolean(progress.repairs.SOL08_PANEL_B_CIRCUIT_REPAIR)} onStart={() => setPuzzleOpen(true)} />}
    {triggerId === "PowerUnit_AB_Main" && <PuzzlePrompt title="Main solar connection routing" ready={Boolean(progress.repairs.SOL08_PANEL_A_CIRCUIT_REPAIR && progress.repairs.SOL08_PANEL_B_CIRCUIT_REPAIR)} done={Boolean(progress.repairs.SOL08_MAIN_POWER_ROUTING_REPAIR)} onStart={() => setPuzzleOpen(true)} />}

    {triggerId === "Commuication_fix_Trigger" && <>
      <h3>External communication repair</h3>
      <p>Use the existing outdoor repair interaction to confirm the communications link is online.</p>
      <button className={buttonClass} disabled={!progress.mainPowerRestored || !progress.powerRecoveryVerified || progress.communicationOnline} onClick={() => record(() => manager.confirmSol08CommunicationRepair(triggerId), "Communication restored")}>{progress.communicationOnline ? "Communication online" : "Confirm communication recovery"}</button>
    </>}

    {triggerId === "MC_MAIN_01" && <>
      <h3>Recovery report</h3>
      <p>Power failure: {progress.powerFailureActive ? "active" : "resolved"} · Communication failure: {progress.communicationFailureActive ? "active" : "resolved"}</p>
      {sol08Mission.report.requiredSections.map(section => <label key={section} className="[display:block] [margin:8px_0]">{section}<textarea value={reportSections[section] ?? ""} onChange={event => setReportSections(value => ({ ...value, [section]: event.target.value }))} /></label>)}
      <button className={buttonClass} disabled={Boolean(progress.report)} onClick={() => { const result = manager.submitSol08RecoveryReport(reportSections); setMessage(result.message); }}>{progress.report ? "Report validated" : "Validate and submit report"}</button>
    </>}

    {message && <p role="status" className="[margin-top:10px] [color:#a8dfba]">{message}</p>}
    <div className="[margin-top:12px] [color:#89a7b4] [font-size:11px]">{Object.entries(REPAIR_TASK).map(([id, task]) => `${task}: ${progress.repairs[id as Sol08PuzzleId] ? "validated" : "pending"}`).join(" · ")}</div>
  </section>;
}

function PuzzlePrompt({ title, ready, done, onStart }: { title: string; ready: boolean; done: boolean; onStart(): void }) {
  return <>
    <h3>{title}</h3>
    <p>{done ? "Circuit graph validated and repair recorded." : ready ? "Connect each source to its compatible destination with matching polarity." : "This repair is locked until its required mission steps are complete."}</p>
    {!done && <button className="[border:1px_solid_#4c7586] [border-radius:5px] [background:#14303c] [padding:8px_12px] [color:#e4f5f8]" disabled={!ready} onClick={onStart}>Open circuit repair</button>}
  </>;
}
