const CYAN = "#62d9ef";
const PALE = "#d6e6ed";
const AMBER = "#f2b65f";

export function drawSol07Banner(ctx: CanvasRenderingContext2D, width: number, height: number, title: string, detail: string): void {
  const bannerHeight = Math.max(36, Math.min(58, height * 0.16));
  ctx.save();
  ctx.fillStyle = "rgba(71, 25, 29, 0.94)"; ctx.fillRect(0, 0, width, bannerHeight);
  ctx.strokeStyle = "#ef6f65"; ctx.lineWidth = 2; ctx.strokeRect(2, 2, width - 4, bannerHeight - 4);
  ctx.fillStyle = "#ff9483"; ctx.font = `bold ${Math.max(12, Math.floor(width / 58))}px monospace`;
  ctx.fillText(title, 12, Math.max(17, bannerHeight * 0.43));
  ctx.fillStyle = "#f0d8cf"; ctx.font = `${Math.max(9, Math.floor(width / 86))}px monospace`;
  ctx.fillText(detail, 12, bannerHeight * 0.76);
  ctx.restore();
}

/** The storm presentation ends only when Sol 7 Task 7 is validated. */
export function isSol07StormPresentationActive(state: { currentDay?: number; completedStepIds?: readonly string[]; sol7StormEnded?: boolean }): boolean {
  return state.currentDay === 7 && state.sol7StormEnded !== true && !state.completedStepIds?.includes("SOL07_SUBMIT_STORM_REPORT");
}

/** Shared lightweight canvas renderer used by the existing physical screens during Sol 7 only. */
export function renderSol07UnitScreen(ctx: CanvasRenderingContext2D, width: number, height: number, unit: string, state: { currentDay: number; completedStepIds?: string[]; sol6?: { cultivation?: { sampleId: string; status: string } | null }; sol7StormEnded?: boolean }): boolean {
  if (!isSol07StormPresentationActive(state)) return false;
  const rows: Record<string, string[]> = {
    habitatAlert: ["DUST STORM WARNING — GAMEPLAY SIMULATION", "Remain inside the outpost during the active alert.", "Outdoor EVA access is temporarily restricted.", "Review and acknowledge this safety notice."],
    missionControl: ["SYSTEMS ASSESSMENT", "Power generation / reserve: unavailable unless source value is displayed", "Communications / navigation: review existing console records", "Warnings: record only visible values and their provenance"],
    centralHub: ["OUTPOST SECTION STATUS", "Record each section: operational / degraded / unavailable", "Power distribution: review visible status only", "Do not alter distribution or infer unseen states."],
    airlock: ["EVA ACCESS STATUS", state.sol7StormEnded ? "TEMPORARY STORM LOCKDOWN: ENDED" : "TEMPORARY STORM LOCKDOWN: ACTIVE", "Shared EVA suit rules remain in force.", state.sol7StormEnded ? "Normal EVA authorization remains required." : "Surface access reopens after validated report."],
    research: ["SCIENCE POWER AVAILABILITY", "Cultivation: inspect existing Sol 6 record only", `Experiment: ${state.sol6?.cultivation?.status ?? "UNAVAILABLE"}`, `Sample ID: ${state.sol6?.cultivation?.sampleId ?? "UNAVAILABLE"}`, "Provenance is preserved; no result is supplied."],
    engineering: ["POWER ASSESSMENT — READ ONLY", "Solar generation output: UNAVAILABLE / verify source", "Available reserve: UNAVAILABLE / verify source", "Reserve duration: UNAVAILABLE / verify source", "Panels A / B and outdoor main line: inspect only", "Distribution, life support, science power: record status", "Gameplay simulation values must be labeled."],
    report: ["SOL 7 IMPACT REPORT", "Compile validated Tasks 1–6.", "Submission validation ends storm state.", "Sol 8 does not auto-start."]
  };
  ctx.fillStyle = "#07111f"; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#441e24"; ctx.fillRect(0, 0, width, Math.max(48, height * 0.13));
  ctx.strokeStyle = "#ef6f65"; ctx.lineWidth = 3; ctx.strokeRect(4, 4, width - 8, height - 8);
  ctx.fillStyle = "#ff8a79"; ctx.font = `bold ${Math.max(18, Math.floor(width / 34))}px monospace`;
  ctx.fillText(`SOL 07 · ${unit.toUpperCase()}`, 24, Math.max(34, height * 0.085));
  ctx.fillStyle = CYAN; ctx.font = `bold ${Math.max(15, Math.floor(width / 46))}px monospace`;
  ctx.fillText((rows[unit] ?? rows.missionControl)[0], 24, height * 0.23);
  const content = rows[unit] ?? rows.missionControl;
  const taskByUnit: Record<string, string> = { habitatAlert:"SOL07_HABITAT_STORM_ALERT", habitat:"SOL07_HABITAT_STORM_ALERT", missionControl:"SOL07_MISSION_CONTROL_SYSTEMS", centralHub:"SOL07_CENTRAL_HUB_STATUS", airlock:"SOL07_VERIFY_EVA_LOCKDOWN", research:"SOL07_RESEARCH_POWER", engineering:"SOL07_ENGINEERING_POWER", report:"SOL07_SUBMIT_STORM_REPORT" };
  const complete = (state.completedStepIds ?? []).includes(taskByUnit[unit]);
  const progressKnown = Array.isArray(state.completedStepIds);
  ctx.fillStyle = complete ? "#78e6a5" : AMBER; ctx.font = `bold ${Math.max(13, Math.floor(width / 56))}px monospace`;
  ctx.fillText(unit === "airlock" ? "ACCESS CONTROL: LOCKED" : progressKnown ? (complete ? "ASSESSMENT RECORDED" : "ASSESSMENT REQUIRED") : "REVIEW STATUS IN INTERACTION PANEL", 24, height * 0.34);
  ctx.fillStyle = PALE; ctx.font = `${Math.max(12, Math.floor(width / 68))}px monospace`;
  const startY = height * 0.46; const lineH = Math.max(23, height * 0.075);
  for (let i = 1; i < content.length; i++) {
    const text = content[i];
    const maxChars = Math.max(24, Math.floor((width - 48) / Math.max(8, width / 95)));
    for (let start = 0; start < text.length; start += maxChars) ctx.fillText(text.slice(start, start + maxChars), 24, startY + (i - 1) * lineH + Math.floor(start / maxChars) * lineH * 0.75);
  }
  ctx.fillStyle = "#90a5b2"; ctx.font = `${Math.max(11, Math.floor(width / 90))}px monospace`;
  ctx.fillText("PROVENANCE REQUIRED · NO REPAIRS · NO SOL 8 TRIGGER ACTION", 24, height - 24);
  return true;
}
