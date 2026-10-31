"use client";

import { useMemo, useState } from "react";
import type { Game } from "@/core/Game";
import type { GameState } from "@/core/EventBus";
import { MASTER_TERRAIN_TARGETS } from "@/core/MissionManager";

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
  const images = state.sol5Images ?? saved?.images ?? [];
  const flight = state.sol5Flight ?? saved?.flight ?? null;
  const report = saved?.report ?? null;
  const readyForReport = Boolean(saved?.imagesReviewed && flight?.landed && images.length >= 5 && targetId);
  const orderedImages = useMemo(() => [...images].sort((a, b) => a.sequence - b.sequence), [images]);

  return <div className="space-y-4 font-poppins">
    <header className="rounded-2xl border border-[#385361] bg-[linear-gradient(115deg,#142a36,#101d27_56%,#17251f)] p-5">
      <div className="font-mono text-[9px] tracking-[.12em] text-[#d39a68]">SOL 05 / TARGET-DEPENDENT FLIGHT OPERATIONS</div>
      <h2 className="mt-2 font-kdam-thmor-pro text-2xl text-white">Aerial Reconnaissance</h2>
      <p className="mt-2 text-sm leading-6 text-[#b1c1c8]">The official Sol 3 target is the only mission destination. This is a PHOBOSIA control simulation; telemetry values are gameplay calculations.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-[#2c4450] bg-[#0a1720]/80 p-3"><div className="font-mono text-[8px] text-[#78929e]">OFFICIAL TARGET</div><div className="mt-1 text-sm text-[#edf3f5]">{target ? target.name : "UNRESOLVED — Sol 3 submission required"}</div><div className="mt-1 break-all font-mono text-[9px] text-[#91a6b2]">{targetId ?? "No target reference"}</div></div>
        <div className="rounded-lg border border-[#2c4450] bg-[#0a1720]/80 p-3"><div className="font-mono text-[8px] text-[#78929e]">SOL 4 PREPARATION</div><div className="mt-1 text-sm text-[#edf3f5]">{manager?.isStepComplete("SOL04_SUBMIT_PREPARATION_REPORT") && saved?.briefingConfirmed ? "VALIDATED FOR SOL 5" : "UNRESOLVED / REVIEW PREREQUISITES"}</div><div className="mt-1 text-[10px] leading-4 text-[#91a6b2]">No target substitution is permitted.</div></div>
      </div>
    </header>

    {!saved?.briefingConfirmed && <section className={panel}>
      <div className="font-mono text-[9px] tracking-[.12em] text-[#c88855]">PREFLIGHT / REQUIRED CONFIRMATION</div>
      <h3 className="mt-1 text-lg text-[#ecf2f4]">Complete Drone Flight Operations Briefing</h3>
      <ul className="mt-3 grid gap-2 text-xs leading-5 text-[#a9bbc2] sm:grid-cols-2">
        <li>• Selected target: {target?.name ?? "Unavailable"}; Sol 4 investigation and report must match.</li>
        <li>• Planned objective: capture at least five live camera images of the selected target approach.</li>
        <li>• Gameplay boundary: 1.5 km × 1.5 km, derived from the takeoff and selected target references.</li>
        <li>• Altitude ceiling: 10 m above the terrain surface below the drone (AGL).</li>
        <li>• Takeoff and landing: existing Drone_TakeoffPoint scene reference.</li>
        <li>• Camera views: 1–5; W/A/S/D flight; E/Q altitude; C capture; L request landing.</li>
        <li>• Flight altitude is constrained against the terrain mesh. Indoor props and storage geometry do not block aerial controls.</li>
        <li>• Battery and signal are deterministic simulated values, not physical-drone telemetry.</li>
      </ul>
      <p className="mt-3 text-[11px] text-[#899fa9]">Optional Drone Section physical inspection: {saved?.optionalDroneInspection ? "recorded" : "not recorded (does not block this mission)"}. Actual battery, camera, propulsion, and communication condition remain unavailable.</p>
      <button disabled={!target || !manager?.isStepComplete("SOL04_SUBMIT_PREPARATION_REPORT")} onClick={() => game?.confirmSol5Briefing()} className="mt-4 rounded-lg border border-[#638394] bg-[#18323d] px-4 py-2 text-xs text-[#dbedf1] enabled:hover:bg-[#204451] disabled:cursor-not-allowed disabled:opacity-45">Confirm preflight briefing</button>
    </section>}

    {saved?.briefingConfirmed && !flight?.landed && <section className={panel}>
      <div className="font-mono text-[9px] tracking-[.12em] text-[#c88855]">SIMULATION GATE</div>
      <h3 className="mt-1 text-lg text-[#ecf2f4]">{saved.simulationActivated ? "Drone simulation authorized" : "Briefing confirmed"}</h3>
      <p className="mt-2 text-xs leading-5 text-[#96aab3]">Activation validates the existing Drone_Object anchor, Drone_TakeoffPoint, target registry entry, matching target scene node, and Sol 4 preparation record. If any reference is unavailable the simulation remains blocked.</p>
      <button disabled={!saved.simulationActivated && !saved.briefingConfirmed} onClick={() => void game?.startSol5DroneSimulation()} className="mt-4 rounded-lg border border-[#ba8453] bg-[#312519] px-4 py-2 text-xs text-[#f1d4b7] hover:bg-[#422d1c]">{saved.simulationActivated ? "Resume drone simulation" : "Activate drone simulation"}</button>
      {state.sol5Message && <p className="mt-3 text-xs text-[#d5b181]" role="status">{state.sol5Message}</p>}
      {flight && <div className="mt-3 font-mono text-[9px] text-[#78929e]">Saved flight state: {flight.status.toUpperCase()} · {images.length} images · {flight.targetId}</div>}
    </section>}

    {flight?.landed && <>
      <section className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="font-mono text-[9px] tracking-[.12em] text-[#c88855]">POST-FLIGHT / IMAGE ARCHIVE</div><h3 className="mt-1 text-lg text-[#ecf2f4]">Review Aerial Observation Records</h3></div><span className="rounded border border-[#42624c] bg-[#12231a] px-2 py-1 font-mono text-[9px] text-[#9dd1b3]">{images.length} / 5 MINIMUM · {flight.status.toUpperCase()}</span></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{orderedImages.map(image => <article key={image.id} className="overflow-hidden rounded-lg border border-[#263c47] bg-[#08141c]">
          <img src={image.imageDataUrl} alt={`Captured drone image ${image.sequence}`} className="aspect-video w-full bg-black object-contain" />
          <div className="space-y-1 p-3 text-[10px] text-[#a9bbc2]"><div className="font-mono text-[#d7e6eb]">IMAGE {String(image.sequence).padStart(2, "0")} · {image.cameraView.toUpperCase()}</div><div>Target: {image.targetId}</div><div>Position: {image.position.x.toFixed(1)}, {image.position.y.toFixed(1)}, {image.position.z.toFixed(1)}</div><div>AGL: {image.altitudeAglM.toFixed(1)} m · Heading: {image.headingDegrees.toFixed(0)}°</div><div>Flight time: {image.elapsedSeconds.toFixed(1)} s · {new Date(image.capturedAt).toLocaleTimeString()}</div></div>
        </article>)}</div>
        {!saved?.imagesReviewed && <button disabled={images.length < 5 || images.some(image => image.targetId !== targetId)} onClick={() => game?.confirmSol5ImageReview()} className="mt-4 rounded-lg border border-[#638394] bg-[#18323d] px-4 py-2 text-xs text-[#dbedf1] enabled:hover:bg-[#204451] disabled:opacity-45">Confirm image review</button>}
        {saved?.imagesReviewed && <p className="mt-3 text-xs text-[#9dd1b3]">Image review validated for the official target.</p>}
      </section>

      <section className={panel}>
        <div className="font-mono text-[9px] tracking-[.12em] text-[#c88855]">REPORT / PLAYER-ENTERED ANALYSIS</div>
        <h3 className="mt-1 text-lg text-[#ecf2f4]">Submit Sol 5 Aerial Reconnaissance Report</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-[11px] text-[#98acb5]">Directly visible image features<textarea className={`${field} mt-1 min-h-24`} value={observedFeatures} onChange={e => setObservedFeatures(e.target.value)} placeholder="Describe only what you can see in the saved images." /></label>
          <label className="text-[11px] text-[#98acb5]">Player interpretation<textarea className={`${field} mt-1 min-h-24`} value={interpretation} onChange={e => setInterpretation(e.target.value)} placeholder="Mark interpretation as tentative; no automated detection is claimed." /></label>
          <label className="text-[11px] text-[#98acb5]">Uncertainties and data limitations<textarea className={`${field} mt-1 min-h-24`} value={uncertainties} onChange={e => setUncertainties(e.target.value)} placeholder="State what the imagery does not establish." /></label>
          <label className="text-[11px] text-[#98acb5]">Areas requiring ground verification<textarea className={`${field} mt-1 min-h-24`} value={groundFollowUp} onChange={e => setGroundFollowUp(e.target.value)} placeholder="List areas or features for later ground investigation." /></label>
        </div>
        {flight && <div className="mt-3 grid gap-2 text-[10px] text-[#a9bbc2] sm:grid-cols-3"><div>Flight: {flight.elapsedSeconds.toFixed(1)} s</div><div>Distance: {flight.totalDistanceM.toFixed(1)} m</div><div>Maximum AGL: {flight.maxAltitudeAglM.toFixed(1)} m</div><div>Battery remaining: {flight.batteryPercent.toFixed(1)}% (simulated)</div><div>Signal: {flight.signalPercent}% (distance rule)</div><div>Takeoff and landing: validated / {flight.landed ? "same scene reference" : "unavailable"}</div></div>}
        {report ? <div className="mt-4 rounded-lg border border-[#42624c] bg-[#12231a] p-3 text-xs text-[#a7d4b4]">Report {report.id} saved for {report.targetId}. Return to Habitat Rest Area when ready.</div> : <button disabled={!readyForReport || !observedFeatures.trim() || !interpretation.trim() || !uncertainties.trim() || !groundFollowUp.trim()} onClick={() => game?.submitSol5Report({ observedFeatures, playerInterpretation: interpretation, uncertainties, groundFollowUp })} className="mt-4 rounded-lg border border-[#638394] bg-[#18323d] px-4 py-2 text-xs text-[#dbedf1] enabled:hover:bg-[#204451] disabled:opacity-45">Submit target-linked report</button>}
        {state.sol5Message && <p className="mt-3 text-xs text-[#d5b181]" role="status">{state.sol5Message}</p>}
      </section>
    </>}

    {!target && <div className="rounded-lg border border-[#704337] bg-[#271b16] p-3 text-xs text-[#e6b99c]">No official Sol 3 target is available. Sol 5 will not substitute Target A or another target.</div>}
  </div>;
}
