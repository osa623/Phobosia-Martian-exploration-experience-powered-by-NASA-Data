"use client";

import { useEffect, useRef } from "react";
import styles from "./MobileControls.module.css";

type ControlMode = "walk" | "rover" | "drone" | "sol5";
type Props = { mode: ControlMode; prompt: string; canInteract: boolean; canLand: boolean; onKey: (code: string, down: boolean) => void; onLook: (dx: number, dy: number) => void; onInteract: () => void; onRoverView: () => void; onExitMode: () => void; onInspect: () => void; onLand: () => void };

export function MobileControls({ mode, prompt, canInteract, canLand, onKey, onLook, onInteract, onRoverView, onExitMode, onInspect, onLand }: Props) {
  const held = useRef(new Map<number, string[]>());
  const active = useRef(new Set<string>());
  const lookPoints = useRef(new Map<number, { x: number; y: number }>());

  const setPointerKeys = (id: number, codes: string[]) => {
    held.current.set(id, codes);
    const next = new Set(Array.from(held.current.values()).flat());
    for (const code of active.current) if (!next.has(code)) onKey(code, false);
    for (const code of next) if (!active.current.has(code)) onKey(code, true);
    active.current = next;
  };
  const releaseAll = () => {
    for (const code of active.current) onKey(code, false);
    active.current.clear(); held.current.clear(); lookPoints.current.clear();
  };

  useEffect(() => {
    window.addEventListener("blur", releaseAll);
    window.addEventListener("pagehide", releaseAll);
    document.addEventListener("visibilitychange", releaseAll);
    return () => { window.removeEventListener("blur", releaseAll); window.removeEventListener("pagehide", releaseAll); document.removeEventListener("visibilitychange", releaseAll); releaseAll(); };
    // Release keys when the authoritative gameplay mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const joystickKeys = (dx: number, dy: number) => {
    const codes: string[] = [];
    if (Math.abs(dx) > 0.22) codes.push(dx < 0 ? "KeyA" : "KeyD");
    if (Math.abs(dy) > 0.22) codes.push(dy < 0 ? "KeyW" : "KeyS");
    return codes;
  };
  const startStick = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    (event.currentTarget as HTMLDivElement).dataset.origin = `${rect.left + rect.width / 2},${rect.top + rect.height / 2}`;
    moveStick(event);
  };
  const moveStick = (event: React.PointerEvent<HTMLDivElement>) => {
    const origin = event.currentTarget.dataset.origin?.split(",").map(Number);
    if (!origin) return;
    const radius = Math.min(event.currentTarget.clientWidth, event.currentTarget.clientHeight) * 0.34;
    const dx = Math.max(-1, Math.min(1, (event.clientX - origin[0]) / radius));
    const dy = Math.max(-1, Math.min(1, (event.clientY - origin[1]) / radius));
    setPointerKeys(event.pointerId, joystickKeys(dx, dy));
    const knob = event.currentTarget.querySelector<HTMLElement>("." + styles.knob);
    if (knob) { knob.style.transform = `translate(${dx * radius * 0.55}px, ${dy * radius * 0.55}px)`; }
  };
  const endStick = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setPointerKeys(event.pointerId, []);
    const knob = event.currentTarget.querySelector<HTMLElement>("." + styles.knob);
    if (knob) knob.style.transform = "translate(0, 0)";
  };

  const lookDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    lookPoints.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };
  const lookMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = lookPoints.current.get(event.pointerId);
    if (!point) return;
    onLook(event.clientX - point.x, event.clientY - point.y);
    point.x = event.clientX; point.y = event.clientY;
  };

  const isWalk = mode === "walk";
  const isRover = mode === "rover";
  const isDrone = mode === "drone" || mode === "sol5";
  const promptAction = prompt.includes("ENTER TERRAIN ROVER") ? "ENTER ROVER" : prompt.toUpperCase().includes("PREPARE EVA SUIT") ? "PREPARE EVA" : "INTERACT";
  const press = (code: string) => (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setPointerKeys(event.pointerId, [code]);
  };
  const unpress = (event: React.PointerEvent<HTMLButtonElement>) => { event.stopPropagation(); setPointerKeys(event.pointerId, []); };

  return <div className={styles.controls} aria-label="Mobile game controls" onContextMenu={event => event.preventDefault()} onClick={event => event.stopPropagation()}>
    <div className={styles.stick} role="application" aria-label={isRover ? "Rover steering" : isDrone ? "Drone flight" : "Move"} onPointerDown={startStick} onPointerMove={moveStick} onPointerUp={endStick} onPointerCancel={endStick}>
      <span className={styles.stickLabel}>{isRover ? "STEER" : isDrone ? "FLIGHT" : "MOVE"}</span><i className={styles.knob} />
    </div>
    {!isRover && <div className={styles.look} aria-label="Camera look" onPointerDown={lookDown} onPointerMove={lookMove} onPointerUp={event => { lookPoints.current.delete(event.pointerId); }} onPointerCancel={event => { lookPoints.current.delete(event.pointerId); }} />}
    <div className={styles.actions}>
      {isWalk && <>
        <button className={styles.button} onPointerDown={press("ShiftLeft")} onPointerUp={unpress} onPointerCancel={unpress}>SPRINT</button>
        <button className={styles.button} onPointerDown={press("Space")} onPointerUp={unpress} onPointerCancel={unpress}>JUMP</button>
        {canInteract && <button className={`${styles.button} ${styles.primary}`} onPointerUp={event => { event.preventDefault(); event.stopPropagation(); onInteract(); }}>{promptAction}</button>}
      </>}
      {isRover && <>
        <button className={`${styles.button} ${styles.primary}`} onPointerDown={press("KeyW")} onPointerUp={unpress} onPointerCancel={unpress}>ACCELERATE</button>
        <button className={styles.button} onPointerDown={press("Space")} onPointerUp={unpress} onPointerCancel={unpress}>BRAKE</button>
        <button className={styles.button} onPointerUp={event => { event.preventDefault(); event.stopPropagation(); onExitMode(); }}>EXIT</button>
        <button className={styles.button} onClick={event => { event.stopPropagation(); onRoverView(); }}>CAMERA</button>
      </>}
      {isDrone && <>
        <button className={`${styles.button} ${styles.primary}`} onPointerDown={press(mode === "sol5" ? "KeyE" : "Space")} onPointerUp={unpress} onPointerCancel={unpress}>ASCEND</button>
        <button className={styles.button} onPointerDown={press(mode === "sol5" ? "KeyQ" : "ShiftLeft")} onPointerUp={unpress} onPointerCancel={unpress}>DESCEND</button>
        <button className={styles.button} onClick={event => { event.stopPropagation(); onInspect(); }}>INSPECT</button>
        {canLand && <button className={`${styles.button} ${styles.primary}`} onClick={event => { event.stopPropagation(); onLand(); }}>LAND / CONFIRM</button>}
        <button className={styles.button} onClick={event => { event.stopPropagation(); onExitMode(); }}>EXIT DRONE</button>
      </>}
    </div>
  </div>;
}
