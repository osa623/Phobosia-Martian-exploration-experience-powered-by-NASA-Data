export type Sol08WarningState = { started: boolean; powerFailureActive: boolean; communicationFailureActive: boolean; reservePowerPercent: number };

/** Draws independent Sol 8 alerts over a bound physical display canvas. */
export function drawSol08Warnings(ctx: CanvasRenderingContext2D, width: number, height: number, state?: Sol08WarningState): boolean {
  if (!state?.started) return false;
  const warnings = [
    state.powerFailureActive ? { color: "#ff633e", title: "CRITICAL POWER FAILURE", body: `RESERVE POWER ${state.reservePowerPercent}% · GAMEPLAY SIMULATION` } : null,
    state.communicationFailureActive ? { color: "#e7aa45", title: "COMMUNICATION SYSTEM OFFLINE", body: "EXTERNAL COMMUNICATION UNAVAILABLE" } : null
  ].filter((warning): warning is { color: string; title: string; body: string } => Boolean(warning));
  const bannerHeight = Math.min(70, (height - 20) / Math.max(1, warnings.length));
  warnings.forEach((warning, index) => {
    const y = height - 10 - bannerHeight * (warnings.length - index);
    ctx.fillStyle = "rgba(12, 16, 21, 0.96)"; ctx.fillRect(12, y, width - 24, bannerHeight - 4);
    ctx.strokeStyle = warning.color; ctx.lineWidth = 2; ctx.strokeRect(12, y, width - 24, bannerHeight - 4);
    ctx.fillStyle = warning.color; ctx.font = "bold 15px monospace"; ctx.fillText(warning.title, 24, y + 24);
    ctx.fillStyle = "#d4e0e5"; ctx.font = "12px monospace"; ctx.fillText(warning.body, 24, y + 45);
  });
  return warnings.length > 0;
}
