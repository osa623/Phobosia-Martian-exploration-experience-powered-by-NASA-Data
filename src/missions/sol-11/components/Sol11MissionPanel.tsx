"use client";

import { useState } from "react";
import type { Game } from "@/core/Game";

const card = "[margin-top:12px] [border:1px_solid_rgba(85,_205,_232,_0.2)] [border-radius:8px] [background:#0c1822] [padding:14px]";
const button = "[border:1px_solid_#4c7586] [border-radius:5px] [background:#14303c] [padding:8px_12px] [color:#e4f5f8] [cursor:pointer] disabled:[opacity:0.45]";

export function Sol11MissionPanel({ game }: { game: Game | null }) {
  const manager = game?.missionManager;
  const state = manager?.getState();
  const [draft, setDraft] = useState(state?.sol11.finalLog ?? "");
  const [feedback, setFeedback] = useState("");
  if (!manager || !state) return null;
  const acknowledged = state.sol11.selinaAcknowledged;
  const submitted = Boolean(state.sol11.finalLog);
  return <section className={card} aria-label="Sol 11 Mission Control farewell">
    <div className="font-mono [color:#55cde8] [font-size:10px] [letter-spacing:.08em]">SOL 11 · MISSION CONTROL</div>
    <article className="[margin-top:12px] [border-left:2px_solid_#d8955b] [padding:10px_12px] [background:#101d27]">
      <h3 className="[color:#f0f3f4] [font-size:14px]">Incoming message · Selina</h3>
      <p className="[margin-top:7px] [color:#c5d3d9] [font-size:12px] [line-height:1.7]">Hello, PHOBOSIA Outpost. This is Selina. I have departed from Deimosian Outpost and I am currently travelling towards your outpost. My journey will take several hours. I wanted to send you this message before I arrive. I hope everything is going well at PHOBOSIA. I will contact you again when I get closer.</p>
      <p className="[margin-top:7px] [color:#d4ad72] [font-size:11px]">STATUS: IN TRANSIT · DESTINATION: PHOBOSIA OUTPOST</p>
      <button className={button} disabled={acknowledged} onClick={() => setFeedback(manager.acknowledgeSol11SelinaMessage() ? "Message acknowledged." : "Message could not be acknowledged.")}>{acknowledged ? "Message acknowledged" : "Acknowledge message"}</button>
    </article>
    <article className="[margin-top:14px] [border-top:1px_solid_rgba(85,_205,_232,_0.14)] [padding-top:12px]">
      <h3 className="[color:#f0f3f4] [font-size:14px]">Final Expedition Log</h3>
      <p className="[margin:5px_0_9px] [color:#9db1bb] [font-size:12px]">Write a personal reflection on your observations, discoveries, experiences and records from SOL 1 through SOL 10.</p>
      <textarea aria-label="Final Expedition Log" placeholder="Write your final expedition log..." value={draft} disabled={!acknowledged || submitted} onChange={event => setDraft(event.target.value)} rows={7} className="[box-border] [w-full] [resize-y] [rounded-md] [border:1px_solid_#344d59] [bg:#08131b] [p:10px] [text-sm] [leading-6] [text:#e4edf0] placeholder:[color:#718792] disabled:[opacity:.7]" />
      <div className="[margin-top:8px] [display:flex] [align-items:center] [gap:10px]"><button className={button} disabled={!acknowledged || submitted} onClick={() => { const result = manager.submitSol11FinalLog(draft); setFeedback(result.message); }}>{submitted ? "Log submitted" : "Submit final log"}</button>{submitted && <span className="[color:#9dd1b3] [font-size:11px]">Saved to mission records</span>}</div>
    </article>
    {feedback && <p role="status" className="[margin-top:10px] [color:#a8dfba] [font-size:12px]">{feedback}</p>}
  </section>;
}
