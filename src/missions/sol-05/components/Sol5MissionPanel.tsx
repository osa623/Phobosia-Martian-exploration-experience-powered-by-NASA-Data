"use client";

import { useMemo, useState } from "react";
import type { Game } from "@/core/Game";
import type { GameState } from "@/core/EventBus";
import { MASTER_TERRAIN_TARGETS } from "@/core/MissionManager";
import { getPreparedAssetUrl } from "@/core/AssetLoading";

const panel = "rounded-xl border border-[#293f4a] bg-[#0b1721] p-4";
const field = "w-full rounded-lg border border-[#314a56] bg-[#08131b] px-3 py-2 font-dm-sans text-sm text-[#dce8ec] outline-none focus:border-[#62a9b8]";

export function Sol5MissionPanel({ game, state }: { game: Game | null; state: GameState }) {
  const manager = game?.missionManager;
  const saved = manager?.getSol5Progress();
  const targetId = manager?.getSelectedSiteId() ?? null;
  const target = MASTER_TERRAIN_TARGETS.find(item => item.id === targetId);
  const [observedFeatures, setObservedFeatures] = useState("");
  const [interpretation, setInterpretation] = useState("");
  const [uncertainties, setUncertainties] = useState("");
  const [groundFollowUp, setGroundFollowUp] = useState("");
  const [unavailableAssets, setUnavailableAssets] = useState<Set<string>>(() => new Set());
  const images = state.sol5Images ?? saved?.images ?? [];
  const flight = state.sol5Flight ?? saved?.flight ?? null;
  const report = saved?.report ?? null;
  const readyForReport = Boolean(saved?.imagesReviewed && flight?.landed && images.length > 0 && !unavailableAssets.size && targetId);
  const orderedImages = useMemo(() => [...images].sort((a, b) => a.sequence - b.sequence), [images]);

  return <div className="space-y-4 font-poppins">
    <header className="rounded-2xl border border-[#385361] bg-[linear-gradient(115deg,#142a36,#101d27_56%,#17251f)] p-5">
      <div className="font-mono text-[9px] tracking-[.12em] text-[#d39a68]">SOL 05 / TARGET-DEPENDENT FLIGHT OPERATIONS</div>
      <h2 className="mt-2 font-kdam-thmor-pro text-2xl text-white">Manual Aerial Reconnaissance</h2>
      <p className="mt-2 text-sm leading-6 text-[#b1c1c8]">Fly the existing drone from the takeoff reference to the official Sol 3 target, inspect it in range, and return. The visual line is direct guidance only. Images are pre-prepared mission evidence, not live drone photographs.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-[#2c4450] bg-[#0a1720]/80 p-3"><div className="font-mono text-[8px] text-[#78929e]">OFFICIAL TARGET</div><div className="mt-1 text-sm text-[#edf3f5]">{target ? target.name : "UNRESOLVED — Sol 3 submission required"}</div><div className="mt-1 text-[9px] text-[#91a6b2]">Inherited from the Sol 3 submission</div></div>
        <div className="rounded-lg border border-[#2c4450] bg-[#0a1720]/80 p-3"><div className="font-mono text-[8px] text-[#78929e]">MISSION STAGE</div><div className="mt-1 text-sm text-[#edf3f5]">{saved?.attemptStatus === "aborted" ? "ABORTED · REACTIVATE IN MISSION CONTROL" : flight?.landed ? "LANDED · EVIDENCE REVIEW" : saved?.targetInspected ? "RETURN TO LAUNCH PAD" : saved?.targetReached ? "TARGET REACHED · PRESS E TO INSPECT" : saved?.simulationActivated ? "FLY TO SELECTED TARGET" : "PREFLIGHT"}</div><div className="mt-1 text-[10px] leading-4 text-[#91a6b2]">The Sol 3 target remains authoritative; Sol 5 cannot replace it.</div></div>
      </div>
    </header>

    {!saved?.briefingConfirmed && <section className={panel}>
      <div className="font-mono text-[9px] tracking-[.12em] text-[#c88855]">PREFLIGHT / REQUIRED CONFIRMATION</div>
      <h3 className="mt-1 text-lg text-[#ecf2f4]">Complete Drone Flight Operations Briefing</h3>
      <ul className="mt-3 grid gap-2 text-xs leading-5 text-[#a9bbc2] sm:grid-cols-2">
        <li>• Target inherited from Sol 3: {target?.name ?? "Unavailable"}; matching Sol 4 preparation is required.</li>
        <li>• Launch and landing reference: the designated drone pad.</li>
        <li>• Fly manually; selected-target outline and direct path provide visual guidance, not a safe corridor.</li>
        <li>• Controls: W/A/S/D move, E ascend or interact in range, Q descend, Shift boost, mouse look.</li>
        <li>• Landing: follow the large return beacon. At the stable landing point, press L when the landing prompt appears to complete the objective and return to Mission Control.</li>
        <li>• Views: 1 front, 2 rear, 3 left, 4 right, 5 downward.</li>
        <li>• Target inspection loads existing mission-provided images. No capture button or live photo metadata is used.</li>
      </ul>
      <p className="mt-3 text-[11px] text-[#899fa9]">Optional Drone Section physical inspection: {saved?.optionalDroneInspection ? "recorded" : "not recorded (does not block this mission)"}. Actual hardware condition is unavailable.</p>
      <button disabled={!target || !manager?.isStepComplete("SOL04_SUBMIT_PREPARATION_REPORT")} onClick={() => game?.confirmSol5Briefing()} className="mt-4 rounded-lg border border-[#638394] bg-[#18323d] px-4 py-2 text-xs text-[#dbedf1] enabled:hover:bg-[#204451] disabled:cursor-not-allowed disabled:opacity-45">Confirm preflight briefing</button>
    </section>}

    {saved?.briefingConfirmed && !flight?.landed && <section className={panel}>
      <div className="font-mono text-[9px] tracking-[.12em] text-[#c88855]">SIMULATION GATE</div>
      <h3 className="mt-1 text-lg text-[#ecf2f4]">{saved.simulationActivated ? "Drone simulation authorized" : "Briefing confirmed"}</h3>
      <p className="mt-2 text-xs leading-5 text-[#96aab3]">Activation checks the drone pad, official target, target-specific evidence, and Sol 4 preparation record.</p>
      <button disabled={!saved.simulationActivated && !saved.briefingConfirmed} onClick={() => void game?.startSol5DroneSimulation()} className="mt-4 rounded-lg border border-[#ba8453] bg-[#312519] px-4 py-2 text-xs text-[#f1d4b7] hover:bg-[#422d1c]">{saved.simulationActivated ? "Resume drone simulation" : "Activate drone simulation"}</button>
      {state.sol5Message && <p className="mt-3 text-xs text-[#d5b181]" role="status">{state.sol5Message}</p>}
      {flight && <div className="mt-3 font-mono text-[9px] text-[#78929e]">Saved simulated flight state: {flight.status.toUpperCase()} · {target?.name ?? "Target unresolved"}</div>}
    </section>}

    {saved?.evidenceLoaded && <section className={panel}>
      <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="font-mono text-[9px] tracking-[.12em] text-[#c88855]">TARGET-DEPENDENT / MISSION-PROVIDED EVIDENCE</div><h3 className="mt-1 text-lg text-[#ecf2f4]">{target?.name ?? targetId} Image Review</h3></div><span className="rounded border border-[#42624c] bg-[#12231a] px-2 py-1 font-mono text-[9px] text-[#9dd1b3]">{orderedImages.length} FILES · {saved.targetInspected ? "INSPECTION VERIFIED" : "UNRESOLVED"}</span></div>
      <p className="mt-2 text-[11px] leading-5 text-[#96aab3]">These supplied assets are associated with the submitted target. They are not represented as images captured by the drone, and no capture timestamps or sensor metadata are assigned.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{orderedImages.map(image => <article key={image.id} className="overflow-hidden rounded-lg border border-[#263c47] bg-[#08141c]">{unavailableAssets.has(image.id) ? <div className="grid aspect-video place-items-center bg-[#211713] p-4 text-center text-xs text-[#e6b99c]">This selected-target file is unavailable. No other target's image was substituted.</div> : <img src={getPreparedAssetUrl(image.assetPath)} alt={`${target?.name ?? "Selected target"} mission-provided evidence`} className="aspect-video w-full bg-black object-contain" loading="lazy" onError={() => setUnavailableAssets(previous => new Set(previous).add(image.id))} />}<div className="space-y-1 p-3 text-[10px] text-[#a9bbc2]"><div className="font-mono text-[#d7e6eb]">EVIDENCE {String(image.sequence).padStart(2, "0")}</div><div>Target: {image.targetId}</div><div className="break-all">Source asset: {image.fileName}</div></div></article>)}</div>
      {unavailableAssets.size > 0 && <p className="mt-2 text-xs text-[#e6b99c]">Evidence review is blocked until the listed files are available. No fallback target imagery will be used.</p>}
      {flight?.landed && !saved.imagesReviewed && <button disabled={!orderedImages.length || unavailableAssets.size > 0 || orderedImages.some(image => image.targetId !== targetId)} onClick={() => game?.confirmSol5ImageReview()} className="mt-4 rounded-lg border border-[#638394] bg-[#18323d] px-4 py-2 text-xs text-[#dbedf1] enabled:hover:bg-[#204451] disabled:opacity-45">Confirm evidence review</button>}
      {saved.imagesReviewed && <p className="mt-3 text-xs text-[#9dd1b3]">Evidence review validated for the official target.</p>}
      {state.sol5Message && <p className="mt-3 text-xs text-[#d5b181]" role="status">{state.sol5Message}</p>}
    </section>}

    {flight?.landed && saved?.imagesReviewed && <section className={panel}>
      <div className="font-mono text-[9px] tracking-[.12em] text-[#c88855]">REPORT / PLAYER-ENTERED ANALYSIS</div>
      <h3 className="mt-1 text-lg text-[#ecf2f4]">Submit Sol 5 Aerial Reconnaissance Report</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-[11px] text-[#98acb5]">Directly visible features<textarea className={`${field} mt-1 min-h-24`} value={observedFeatures} onChange={e => setObservedFeatures(e.target.value)} placeholder="Describe only what is visible in the supplied target imagery." /></label>
        <label className="text-[11px] text-[#98acb5]">Player interpretation<textarea className={`${field} mt-1 min-h-24`} value={interpretation} onChange={e => setInterpretation(e.target.value)} placeholder="Mark interpretation as tentative; no automated finding is claimed." /></label>
        <label className="text-[11px] text-[#98acb5]">Uncertainties and data limitations<textarea className={`${field} mt-1 min-h-24`} value={uncertainties} onChange={e => setUncertainties(e.target.value)} placeholder="State what the available imagery does not establish." /></label>
        <label className="text-[11px] text-[#98acb5]">Areas requiring ground verification<textarea className={`${field} mt-1 min-h-24`} value={groundFollowUp} onChange={e => setGroundFollowUp(e.target.value)} placeholder="List areas or features for later Sol 6 investigation." /></label>
      </div>
      {flight && <div className="mt-3 grid gap-2 text-[10px] text-[#a9bbc2] sm:grid-cols-3"><div>Simulated flight: {flight.elapsedSeconds.toFixed(1)} s</div><div>Simulated travel: {flight.totalDistanceM.toFixed(1)} m</div><div>Maximum terrain-relative AGL: {flight.maxAltitudeAglM.toFixed(1)} m</div><div>Battery: {flight.batteryPercent.toFixed(1)}% (simulated)</div><div>Link: {flight.signalPercent}% (simulated rule)</div><div>Landing: validated at the takeoff reference</div></div>}
      {report ? <div className="mt-4 rounded-lg border border-[#42624c] bg-[#12231a] p-3 text-xs text-[#a7d4b4]">Report {report.id} saved for {report.targetId}. Return to Habitat Rest Area when ready.</div> : <button disabled={!readyForReport || !observedFeatures.trim() || !interpretation.trim() || !uncertainties.trim() || !groundFollowUp.trim()} onClick={() => game?.submitSol5Report({ observedFeatures, playerInterpretation: interpretation, uncertainties, groundFollowUp })} className="mt-4 rounded-lg border border-[#638394] bg-[#18323d] px-4 py-2 text-xs text-[#dbedf1] enabled:hover:bg-[#204451] disabled:opacity-45">Submit target-linked report</button>}
      {state.sol5Message && <p className="mt-3 text-xs text-[#d5b181]" role="status">{state.sol5Message}</p>}
    </section>}

    {!target && <div className="rounded-lg border border-[#704337] bg-[#271b16] p-3 text-xs text-[#e6b99c]">No official Sol 3 target is available. Sol 5 will not substitute Target A or another target.</div>}
  </div>;
}
