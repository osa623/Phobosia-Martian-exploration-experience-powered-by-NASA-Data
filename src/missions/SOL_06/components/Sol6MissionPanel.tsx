"use client";

import React, { useState } from "react";
import type { MissionManager } from "@/core/MissionManager";
import { MASTER_TERRAIN_TARGETS } from "@/core/MissionManager";

export function Sol6MissionPanel({ manager, triggerId }: { manager?: MissionManager; triggerId: string }) {
  const [, refresh] = useState(0);
  const [fields, setFields] = useState({ visualAppearance: "", grainSizeOrTexture: "", colourDescription: "", supportedIndicators: "Unavailable: no supported laboratory indicator is configured.", limitationsAndUncertainty: "", playerInterpretation: "", reportUncertainty: "" });
  if (!manager) return null;
  const progress = manager.getSol6Progress();
  const done = (id: string) => manager.isStepComplete(id);
  const run = (action: () => unknown) => { action(); refresh(value => value + 1); };
  const button = "[border:1px_solid_#4c879d] [background:#102b39] [padding:9px_12px] [color:#cbeaf2] [cursor:pointer] hover:[background:#173b4b]";
  const field = "[width:100%] [border:1px_solid_#35586a] [background:#07131c] [padding:9px] [color:#e5f0f3]";
  const targetId = manager.getSelectedSiteId();
  const targetName = MASTER_TERRAIN_TARGETS.find(target => target.id === targetId)?.name ?? null;

  return <section className="[margin:12px] [border:1px_solid_rgba(85,_205,_232,_0.22)] [background:rgba(7,_18,_28,_0.88)] [padding:14px]">
    <div className="font-mono [color:#55cde8] [font-size:10px] [letter-spacing:0.12em]">SOL 6 · FIELD INVESTIGATION WORKFLOW</div>
    <p className="[margin:5px_0_12px] [color:#b7cbd3] [font-size:12px]">Official Sol 3 target: <strong className="[color:#eaf4f7]">{targetName ?? "Unresolved — a validated Sol 3 submission is required"}</strong></p>
    {triggerId === "MC_NAVIGATION_01" && !done("SOL06_REVIEW_MISSION_BRIEFING") && <div><p className="[color:#c3d2d8] [font-size:12px]">Review the matching Sol 4 investigation and Sol 5 evidence before confirming the field briefing.</p><button className={button} onClick={() => run(() => manager.confirmSol6Briefing())}>Confirm briefing</button></div>}
    {triggerId === "LAB_RESEARCH_ANALYSIS_01" && !done("SOL06_PREPARE_FIELD_EQUIPMENT") && <div><p className="[color:#c3d2d8] [font-size:12px]">Review the existing sample-handling workflow. No unverified collection hardware is represented.</p><button className={button} onClick={() => run(() => manager.prepareSol6Equipment())}>Confirm available equipment review</button></div>}
    {triggerId === "LAB_RESEARCH_ANALYSIS_01" && done("SOL06_REMOVE_EVA_SUIT") && !done("SOL06_TRANSFER_SAMPLE") && <div><p className="[color:#c3d2d8] [font-size:12px]">Sample: {progress.sample?.sampleId ?? "Unavailable"} · {progress.sample?.collectionStatus ?? "Not collected"}</p><button className={button} onClick={() => run(() => manager.transferSol6Sample())}>Register sample receipt</button></div>}
    {triggerId === "LAB_RESEARCH_ANALYSIS_01" && done("SOL06_TRANSFER_SAMPLE") && !done("SOL06_ANALYSE_SAMPLE") && <div className="[display:grid] [gap:8px]">
      {(["visualAppearance", "grainSizeOrTexture", "colourDescription", "supportedIndicators", "limitationsAndUncertainty", "playerInterpretation"] as const).map(key => <label key={key} className="[color:#9fb4c0] [font-size:11px]">{key.replace(/[A-Z]/g, letter => ` ${letter.toLowerCase()}`)}<textarea className={field} rows={2} value={fields[key]} onChange={event => setFields({ ...fields, [key]: event.target.value })} /></label>)}
      <p className="[margin:0] [color:#d5b87e] [font-size:10px]">Player-entered gameplay notes are stored as simulated. No chemical, biological, or water findings are inferred.</p>
      <button className={button} onClick={() => run(() => manager.saveSol6Analysis(fields))}>Save preliminary simulated analysis</button>
    </div>}
    {triggerId === "LAB_CULTIVATION_01" && done("SOL06_ANALYSE_SAMPLE") && !done("SOL06_START_CULTIVATION_EXPERIMENT") && <div><p className="[color:#c3d2d8] [font-size:12px]">Register sample {progress.sample?.sampleId ?? "unavailable"}. Experiment result remains pending until Sol 8.</p><button className={button} onClick={() => run(() => manager.startSol6Cultivation())}>Start experiment</button></div>}
    {triggerId === "MC_NAVIGATION_01" && done("SOL06_START_CULTIVATION_EXPERIMENT") && !done("SOL06_SUBMIT_INVESTIGATION_REPORT") && <div className="[display:grid] [gap:8px]"><label className="[color:#9fb4c0] [font-size:11px]">Uncertainty and unavailable evidence<textarea className={field} rows={3} value={fields.reportUncertainty} onChange={event => setFields({ ...fields, reportUncertainty: event.target.value })} /></label><div className="[color:#9fb4c0] [font-size:11px]">Target: {targetName ?? "Unavailable"} · Sample: {progress.sample?.sampleId ?? "Unavailable"} · Cultivation: {progress.cultivation?.status ?? "Not started"} (result pending Sol 8)</div><button className={button} onClick={() => run(() => manager.submitSol6Report(fields.reportUncertainty))}>Submit Sol 6 report</button></div>}
    <div className="[margin-top:12px] [border-top:1px_solid_rgba(85,_205,_232,_0.14)] [padding-top:8px] [color:#7f9aa7] [font-size:11px]">{manager.getMissionTaskProgress().completed} / {manager.getMissionTaskProgress().total} required tasks complete</div>
  </section>;
}
