"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import { useEffect, useRef } from "react";
import { clonePreparedModel } from "@/core/AssetLoading";
import styles from "./TransitionLoadingScreen.module.css";

type Props = {
  source: string;
  destination: string;
  progress: number | null;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
};

export function TransitionLoadingScreen({ source, destination, progress, onPointerMove }: Props) {
  const globeHost = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const hasMeasuredProgress = typeof progress === "number" && Number.isFinite(progress);
  const percent = hasMeasuredProgress ? Math.max(0, Math.min(100, Math.round(progress))) : null;

  useEffect(() => {
    const host = globeHost.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer | null = null;
    let frame = 0;
    let disposed = false;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0, 8.2);
    try {
      const activeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      renderer = activeRenderer;
      activeRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      activeRenderer.outputColorSpace = THREE.SRGBColorSpace;
      activeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      activeRenderer.toneMappingExposure = 0.85;
      activeRenderer.setClearColor(0x000000, 0);
      host.appendChild(activeRenderer.domElement);

      const pivot = new THREE.Group();
      pivot.rotation.z = THREE.MathUtils.degToRad(25);
      scene.add(pivot);
      scene.add(new THREE.HemisphereLight(0xa9bacf, 0x20150f, 0.8));
      const sun = new THREE.DirectionalLight(0xffd0a0, 3.2);
      sun.position.set(-3, 4, 6);
      scene.add(sun);
      const model = clonePreparedModel("/assets/models/mars.glb");
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const max = Math.max(size.x, size.y, size.z);
      if (!Number.isFinite(max) || max <= 0) throw new Error("Mars model has invalid dimensions.");
      model.position.sub(center);
      model.scale.setScalar(7.1 / max);
      pivot.add(model);

      const resize = () => {
        const width = host.clientWidth || window.innerWidth;
        const height = host.clientHeight || window.innerHeight;
        activeRenderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        pivot.position.set(width / height < 1.35 ? 0.2 : 2.45, width / height < 1.35 ? -0.55 : -1.65, 1);
        const scale = width / height < 1.35 ? 0.78 : Math.min(1.08, Math.max(0.92, height / 860));
        pivot.scale.setScalar(scale);
      };
      const observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();
      const clock = new THREE.Clock();
      const render = () => {
        if (disposed) return;
        frame = requestAnimationFrame(render);
        const delta = Math.min(clock.getDelta(), 0.05);
        pivot.rotation.y += delta * 0.022;
        pivot.rotation.x = THREE.MathUtils.lerp(pivot.rotation.x, pointer.current.y * 0.025, 0.035);
        pivot.position.x += ((host.clientWidth / (host.clientHeight || 1) < 1.35 ? 0.2 : 2.45) - pointer.current.x * 0.12 - pivot.position.x) * 0.025;
        activeRenderer.render(scene, camera);
      };
      render();
      return () => {
        disposed = true;
        cancelAnimationFrame(frame);
        observer.disconnect();
        const materials = new Set<THREE.Material>();
        model.traverse(object => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh || !mesh.material) return;
          const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of meshMaterials) {
            if (!material) continue;
            if (!materials.has(material)) { materials.add(material); material.dispose(); }
          }
        });
        activeRenderer.dispose();
        activeRenderer.domElement.remove();
      };
    } catch {
      renderer?.dispose();
      renderer?.domElement.remove();
    }
  }, []);

  return <main className={styles.screen} onPointerMove={event => {
    const bounds = event.currentTarget.getBoundingClientRect();
    pointer.current.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.current.y = ((event.clientY - bounds.top) / bounds.height) * 2 - 1;
    onPointerMove(event);
  }} aria-live="polite" aria-label="Destination module loading">
    <div ref={globeHost} className={styles.globe} aria-hidden="true" />
    <div className={styles.readout}>
      <div className={styles.kicker}>PHOBOSIA · MODULE TRANSIT</div>
      <div className={styles.percentage} aria-label={percent === null ? "Loading progress unavailable" : `${percent}%`}>
        <span>{percent === null ? "—" : percent}</span>{percent !== null && <small>%</small>}
      </div>
      <div className={styles.status}>{percent === null ? "DESTINATION INITIALIZING" : percent === 0 ? "PREPARING TRANSITION" : percent <= 25 ? "DESTINATION MODEL READY" : percent <= 50 ? "DESTINATION SCENE CONFIGURED" : percent <= 75 ? "SPAWN & COLLISION STATE READY" : "DESTINATION READY"}</div>
      <div className={styles.route}>{source.toUpperCase()} <i aria-hidden="true">→</i> {destination.toUpperCase()}</div>
      {percent !== null && <div className={styles.progressTrack} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{ width: `${percent}%` }} /></div>}
    </div>
    <div className={styles.globeHint}>MOVE POINTER · MARS</div>
  </main>;
}
