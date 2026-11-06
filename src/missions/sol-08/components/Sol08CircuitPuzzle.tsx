"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { SOL08_PUZZLE_CONNECTIONS, type Sol08Connection, type Sol08PuzzleId } from "../taskDefinitions";

const PUZZLE_TITLES: Record<Sol08PuzzleId, string> = {
  SOL08_PANEL_A_CIRCUIT_REPAIR: "Solar Panel A · Regulator Circuit",
  SOL08_PANEL_B_CIRCUIT_REPAIR: "Solar Panel B · Regulator Circuit",
  SOL08_MAIN_POWER_ROUTING_REPAIR: "Main Solar Connection · Distribution Routing"
};
type Port = { id: string; label: string; source: boolean; positive: boolean; x: number; y: number; side: "left" | "right" };

function buildPorts(puzzleId: Sol08PuzzleId): Port[] {
  const expected = SOL08_PUZZLE_CONNECTIONS[puzzleId];
  const ids = [...expected.map(edge => edge.source), ...expected.map(edge => edge.destination)];
  return ids.map((id, index) => {
    const source = index < expected.length;
    const label = id.replaceAll("_", " ");
    const group = source ? 0 : 1;
    const row = source ? index : index - expected.length;
    return { id, label, source, positive: /POS$/.test(id), x: group === 0 ? -4.8 : 4.8, y: 2.3 - row * (4.6 / Math.max(1, expected.length - 1)), side: source ? "left" : "right" };
  });
}

/** Temporary low-poly 3D circuit board. Its WebGL context and RAF are released on close. */
export function Sol08CircuitPuzzle({ puzzleId, onCancel, onValidated }: { puzzleId: Sol08PuzzleId; onCancel(): void; onValidated(connections: Sol08Connection[], retries: number): boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [connections, setConnections] = useState<Sol08Connection[]>([]);
  const [message, setMessage] = useState("Drag each positive or negative lead from a source terminal to its matching destination.");
  const [retries, setRetries] = useState(0);
  const dragRef = useRef<{ source: string; target?: string } | null>(null);
  const sceneRef = useRef<{ scene: THREE.Scene; camera: THREE.OrthographicCamera; renderer: THREE.WebGLRenderer; raycaster: THREE.Raycaster; pointer: THREE.Vector2; ports: Map<string, THREE.Mesh>; wires: THREE.Group; frame: number; resize: () => void } | null>(null);
  const ports = buildPorts(puzzleId);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene(); scene.background = new THREE.Color("#08131d");
    const camera = new THREE.OrthographicCamera(-7, 7, 4.2, -4.2, 0.1, 80); camera.position.set(0, 3.8, 13); camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25)); renderer.setSize(host.clientWidth, host.clientHeight); host.appendChild(renderer.domElement);
    const ambient = new THREE.HemisphereLight(0x9dcbe0, 0x101922, 1.25); scene.add(ambient);
    const key = new THREE.DirectionalLight(0x8ce7ff, 1.15); key.position.set(-2, 6, 8); scene.add(key);
    const board = new THREE.Mesh(new THREE.BoxGeometry(11, 6.8, 0.25), new THREE.MeshStandardMaterial({ color: 0x152735, metalness: 0.35, roughness: 0.72 })); board.position.z = -0.8; scene.add(board);
    const centerX = puzzleId === "SOL08_MAIN_POWER_ROUTING_REPAIR" ? 0 : 0;
    const centerLabel = puzzleId === "SOL08_MAIN_POWER_ROUTING_REPAIR" ? "OUTPOST DISTRIBUTION BUS" : "POWER REGULATOR";
    const component = new THREE.Mesh(new THREE.BoxGeometry(2.7, 2.2, 0.55), new THREE.MeshStandardMaterial({ color: 0x293c49, metalness: 0.7, roughness: 0.35 }));
    component.position.set(centerX, 0, 0.1); scene.add(component);
    const textCanvas = document.createElement("canvas"); textCanvas.width = 512; textCanvas.height = 96;
    const context = textCanvas.getContext("2d");
    if (context) { context.fillStyle = "#bdefff"; context.font = "bold 28px monospace"; context.textAlign = "center"; context.fillText(centerLabel, 256, 56); }
    const textTexture = new THREE.CanvasTexture(textCanvas);
    const componentLabel = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.48), new THREE.MeshBasicMaterial({ map: textTexture, transparent: true })); componentLabel.position.set(0, 0, 0.4); scene.add(componentLabel);
    const portsMap = new Map<string, THREE.Mesh>();
    for (const port of ports) {
      const group = new THREE.Group(); group.position.set(port.x, port.y, 0.35); scene.add(group);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.28, 12), new THREE.MeshStandardMaterial({ color: port.positive ? 0x9a4c2d : 0x3f6e82, metalness: 0.72, roughness: 0.3 })); base.rotation.x = Math.PI / 2; base.userData.portId = port.id; group.add(base); portsMap.set(port.id, base);
      const pin = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshStandardMaterial({ color: port.positive ? 0xff995c : 0x68d9f2, emissive: port.positive ? 0x69230c : 0x0d4250, emissiveIntensity: 0.6 })); pin.position.z = 0.18; pin.userData.portId = port.id; group.add(pin); portsMap.set(`${port.id}:pin`, pin);
    }
    const wires = new THREE.Group(); scene.add(wires);
    const raycaster = new THREE.Raycaster(); raycaster.params.Mesh.threshold = 0.1;
    const pointer = new THREE.Vector2();
    const resize = () => { const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight), aspect = width / height, frustum = 4.2; camera.left = -frustum * aspect; camera.right = frustum * aspect; camera.top = frustum; camera.bottom = -frustum; camera.updateProjectionMatrix(); renderer.setSize(width, height); renderer.render(scene, camera); };
    let frame = 0;
    const draw = () => { renderer.render(scene, camera); frame = requestAnimationFrame(draw); };
    resize(); frame = requestAnimationFrame(draw);
    sceneRef.current = { scene, camera, renderer, raycaster, pointer, ports: portsMap, wires, frame, resize };
    const observer = new ResizeObserver(resize); observer.observe(host);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); scene.traverse(object => { const mesh = object as THREE.Mesh; mesh.geometry?.dispose(); if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose(); }); textTexture.dispose(); renderer.dispose(); renderer.domElement.remove(); sceneRef.current = null; };
  }, [puzzleId]);

  useEffect(() => {
    const runtime = sceneRef.current; if (!runtime) return;
    for (const child of [...runtime.wires.children]) { runtime.wires.remove(child); const mesh = child as THREE.Mesh; mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
    for (const edge of connections) {
      const sourcePort = ports.find(port => port.id === edge.source); const targetPort = ports.find(port => port.id === edge.destination);
      if (!sourcePort || !targetPort) continue;
      const start = new THREE.Vector3(sourcePort.x, sourcePort.y, 0.4), end = new THREE.Vector3(targetPort.x, targetPort.y, 0.4);
      const curve = new THREE.CatmullRomCurve3([start, new THREE.Vector3(0, sourcePort.y * 0.6, 0.45), new THREE.Vector3(0, targetPort.y * 0.6, 0.45), end]);
      const validPolarity = sourcePort.positive === targetPort.positive;
      const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.055, 6, false), new THREE.MeshStandardMaterial({ color: validPolarity ? 0x56d8f3 : 0xff664e, emissive: validPolarity ? 0x0a4050 : 0x64170d, emissiveIntensity: 1 })); runtime.wires.add(wire);
    }
  }, [connections]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const runtime = sceneRef.current; if (!runtime) return;
    const rect = event.currentTarget.getBoundingClientRect(); runtime.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); runtime.raycaster.setFromCamera(runtime.pointer, runtime.camera);
    const hits = runtime.raycaster.intersectObjects([...runtime.ports.values()]); const hit = hits.find(item => item.object.userData.portId);
    if (!hit) return;
    const id = hit.object.userData.portId as string; const port = ports.find(item => item.id === id); if (!port) return;
    if (port.source) { dragRef.current = { source: id }; event.currentTarget.setPointerCapture(event.pointerId); setMessage(`Cable selected from ${port.label}. Drop it on a destination terminal.`); }
    else {
      const existing = connections.find(edge => edge.destination === id);
      if (existing) { setConnections(connections.filter(edge => edge !== existing)); setMessage("Connection removed. Drag a source lead to this destination to retry."); }
    }
  };
  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current; const runtime = sceneRef.current; if (!drag || !runtime) return;
    const rect = event.currentTarget.getBoundingClientRect(); runtime.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); runtime.raycaster.setFromCamera(runtime.pointer, runtime.camera);
    const hits = runtime.raycaster.intersectObjects([...runtime.ports.values()]); const hit = hits.find(item => item.object.userData.portId && !String(item.object.userData.portId).endsWith(":pin"));
    const targetId = hit?.object.userData.portId as string | undefined; const target = ports.find(item => item.id === targetId); const source = ports.find(item => item.id === drag.source);
    dragRef.current = null;
    if (!target || target.source || !source) { setMessage("Cable not connected. Drop on a destination port; you can retry."); return; }
    if (connections.some(edge => edge.source === drag.source || edge.destination === target.id)) { setMessage("That connector is already occupied. Remove the existing lead before reconnecting."); return; }
    const next = [...connections, { source: drag.source, destination: target.id }]; setConnections(next);
    setMessage(source.positive === target.positive ? "Lead connected. Check all required terminals, then validate." : "Polarity mismatch: this lead is marked red. Remove and reconnect it to the matching polarity.");
  };
  const validate = () => {
    const success = onValidated(connections, retries);
    if (success) setMessage("Circuit verified. Repair record saved.");
    else { setRetries(count => count + 1); setMessage("Circuit validation failed. Check source, destination, polarity and every required path, then retry."); }
  };

  return <section className="[display:grid] [gap:9px] [border:1px_solid_#355c70] [background:#09131d] [padding:11px]">
    <header><div className="font-mono [font-size:10px] [letter-spacing:0.16em] [color:#68daf1]">FIELD POWER DIAGNOSTICS · SOL 8</div><h2 className="[margin:4px_0] [font-size:18px] [color:#edf7fa]">{PUZZLE_TITLES[puzzleId]}</h2><p className="[margin:0] [font-size:12px] [color:#b4c9d2]">Drag each red (+) or cyan (−) lead to a compatible port. Click a connected destination port to remove a lead. Incorrect routes remain visible in red and fail validation.</p></header>
    <div className="[position:relative]">
      <div ref={hostRef} role="application" aria-label="Interactive three-dimensional electrical circuit board" className="[height:min(42vh,_360px)] [min-height:250px] [width:100%] [overflow:hidden] [border:1px_solid_#263f50]" onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} />
      <div aria-hidden="true" className="[pointer-events:none] [position:absolute] [inset:0]">
        {ports.map(port => <span key={port.id} className={`[position:absolute] [max-width:36%] [overflow:hidden] [color:#b7e6f1] [font:9px_monospace] [text-ellipsis] [whitespace:nowrap] ${port.side === "left" ? "[left:2%] [text-align:left]" : "[right:2%] [text-align:right]"}`} style={{ top: `${50 - (port.y / 8.4) * 100}%` }}>{port.label} {port.positive ? "+" : "−"}</span>)}
      </div>
    </div>
    <div aria-live="polite" className="[min-height:32px] [border-left:2px_solid_#f09253] [background:#111f2a] [padding:7px_10px] [font-size:12px] [color:#d6e4e9]">{message}<div className="[margin-top:3px] [color:#91a8b3] [font-family:monospace] [font-size:10px]">CONNECTIONS {connections.length}/{SOL08_PUZZLE_CONNECTIONS[puzzleId].length} · RETRIES {retries} · VALIDATION {connections.length === SOL08_PUZZLE_CONNECTIONS[puzzleId].length ? "READY" : "INCOMPLETE"}</div></div>
    <div className="[display:flex] [justify-content:flex-end] [gap:8px]"><button className="[border:1px_solid_#526c7b] [background:#14232e] [padding:8px_12px] [color:#d2e0e5]" onClick={() => { setConnections([]); setMessage("Connections cleared. Start again from the source ports."); }}>Reset wiring</button><button className="[border:1px_solid_#4c879d] [background:#102b39] [padding:8px_12px] [color:#cbeaf2] disabled:[opacity:0.4]" disabled={connections.length !== SOL08_PUZZLE_CONNECTIONS[puzzleId].length} onClick={validate}>Validate circuit</button><button className="[border:1px_solid_#526c7b] [background:#14232e] [padding:8px_12px] [color:#d2e0e5]" onClick={onCancel}>Cancel</button></div>
  </section>;
}
