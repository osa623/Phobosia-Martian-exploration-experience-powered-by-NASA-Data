"use client";

import React, { useState } from "react";

export function Sol6FieldCapture({ targetName, observationDone, onObservation, onSample, onCancel }: { targetName: string | null; observationDone: boolean; onObservation: (data: { category: string; observation: string; interpretation: string; uncertainty: string }) => void; onSample: (containerReference: string) => void; onCancel: () => void }) {
  const [values, setValues] = useState({ category: "", observation: "", interpretation: "", uncertainty: "", container: "" });
  const field = "[width:100%] [border:1px_solid_#35586a] [background:#07131c] [padding:9px] [color:#e5f0f3]";
  const set = (key: keyof typeof values, value: string) => setValues(current => ({ ...current, [key]: value }));
  const entry = (key: keyof typeof values, label: string, rows = 2) => <label className="[display:grid] [gap:5px] [color:#9fb4c0] [font-size:11px]">{label}<textarea className={field} rows={rows} value={values[key]} onChange={event => set(key, event.target.value)} /></label>;
  return <div className="[display:grid] [gap:12px]">
    <p className="[margin:0] [color:#a8c2cc] [font-size:12px]">Official Sol 3 target: <strong className="[color:#55cde8]">{targetName ?? "Unresolved"}</strong>. Record what is visible; all authored notes are simulated gameplay data.</p>
    {!observationDone ? <>
      {entry("category", "Observation category", 1)}{entry("observation", "Visible ground-level observation")}{entry("interpretation", "Your interpretation — separate from the observation")}{entry("uncertainty", "Uncertainty or unavailable evidence")}
      <button className="[border:1px_solid_#4c879d] [background:#102b39] [padding:9px_12px] [color:#cbeaf2] [cursor:pointer]" onClick={() => onObservation({ category: values.category, observation: values.observation, interpretation: values.interpretation, uncertainty: values.uncertainty })}>Save Field Observation</button>
    </> : <>
      <p className="[margin:0] [color:#a8c2cc] [font-size:12px]">The saved observation is linked to this target. Register one simulated soil/regolith sample and its container reference.</p>
      <label className="[display:grid] [gap:5px] [color:#9fb4c0] [font-size:11px]">Available container reference<textarea className={field} rows={1} value={values.container} onChange={event => set("container", event.target.value)} /></label>
      <button className="[border:1px_solid_#4c879d] [background:#102b39] [padding:9px_12px] [color:#cbeaf2] [cursor:pointer]" onClick={() => onSample(values.container)}>Register and Secure Sample</button>
    </>}
    <button className="[justify-self:end] [border:1px_solid_#4a6d7f] [background:transparent] [padding:8px_12px] [color:#b0c9d3] [cursor:pointer]" onClick={onCancel}>Cancel</button>
  </div>;
}
