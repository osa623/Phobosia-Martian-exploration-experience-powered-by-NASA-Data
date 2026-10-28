/**
 * PHOBOSIA — Airlock Physical Screen Rendering System
 *
 * Dedicated modular screen renderer for the single physical 3D display in the Airlock module:
 * 1. Airlock_Control_Console -> AL_CONTROL_CONSOLE (Depressurization & EVA Operations)
 *
 * Driven by `src/jsons/Screens/airlock-screen-data.json`.
 * Implements panel types: STATUS_CARD, COMPONENT_STATUS, METRIC_GRID.
 *
 * All numeric and environmental values are simulated demonstrations for PHOBOSIA.
 * Displays mandatory disclaimer: "SIMULATED AIRLOCK DATA - NOT LIVE NASA TELEMETRY".
 */

import * as THREE from "three";
import { reprojectPlanarUVs } from "./Collision";

export interface AirlockScreenPanel {
  id?: string;
  title?: string;
  type: string;
  [key: string]: any;
}

export interface AirlockScreenItem {
  screenId: string;
  meshName: string;
  rendererId: string;
  subsystem?: string;
  orientation?: {
    mirrorHorizontal?: boolean;
    mirrorVertical?: boolean;
    rotationDegrees?: number;
    uAxis?: "x" | "y" | "z";
    vAxis?: "x" | "y" | "z";
  };
  purpose?: string;
  refreshPolicy?: {
    mode?: string;
    minimumIntervalMs?: number;
  };
  content: {
    header?: {
      title?: string;
      subtitle?: string;
      status?: string;
    };
    primaryMetrics?: Array<{
      id?: string;
      label?: string;
      source?: string;
      fallback?: string | number;
      value?: string | number;
      unit?: string;
    }>;
    panels?: AirlockScreenPanel[];
    footer?: {
      left?: string;
      right?: string;
    };
    [key: string]: any;
  };
  [key: string]: any;
}

export interface AirlockScreenDataRoot {
  project?: string;
  zone?: string;
  configVersion?: string;
  dataPolicy?: any;
  rendering?: any;
  visualTheme?: any;
  orientationDefaults?: any;
  screens: AirlockScreenItem[];
  [key: string]: any;
}

export interface AirlockScreenBinding {
  screenId: string;
  meshName: string;
  rendererId: string;
  mesh: THREE.Mesh;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  material: THREE.MeshBasicMaterial;
  width: number;
  height: number;
  refreshIntervalMs: number;
  lastRenderTime: number;
}

// Verified UV mapping for the Airlock_Control_Console (Z-constant flat plane, uAxis=x, vAxis=y)
const VERIFIED_AIRLOCK_MAPPINGS: Record<
  string,
  { uAxis: "x" | "y" | "z"; vAxis: "x" | "y" | "z"; flipU: boolean; flipV: boolean }
> = {
  Airlock_Control_Console: { uAxis: "x", vAxis: "y", flipU: false, flipV: false }
};

// Dynamic resolver for Node CommonJS tests vs Next.js Webpack bundler
function loadAirlockScreenData(): AirlockScreenDataRoot {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("../jsons/Screens/airlock-screen-data.json");
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return eval("require")("../src/jsons/Screens/airlock-screen-data.json");
    } catch {
      return {
        project: "PHOBOSIA",
        zone: "AIRLOCK",
        screens: []
      };
    }
  }
}

const rawAirlockDataJson = loadAirlockScreenData();

export class AirlockScreenRenderer {
  private rawConfig: AirlockScreenDataRoot;
  private screensMap = new Map<string, AirlockScreenItem>();
  private activeBindings: AirlockScreenBinding[] = [];
  private missionSol: number = 4;

  constructor(customConfig?: AirlockScreenDataRoot) {
    this.rawConfig = customConfig
      ? JSON.parse(JSON.stringify(customConfig))
      : JSON.parse(JSON.stringify(rawAirlockDataJson));
    this.initScreensMap();
  }

  private initScreensMap(): void {
    this.screensMap.clear();
    const screens = this.rawConfig.screens || [];
    for (const item of screens) {
      if (!item || !item.meshName) continue;
      this.screensMap.set(item.meshName.trim(), item);
      if (item.screenId) {
        this.screensMap.set(item.screenId.trim(), item);
      }
    }
  }

  /**
   * Primary entry point: Scans the Airlock GLB scene and binds canvas textures to the control console screen.
   */
  public attachToAirlock(model: THREE.Group, missionState?: { currentDay?: number; currentSol?: number }): void {
    this.dispose();

    if (missionState?.currentSol) {
      this.missionSol = missionState.currentSol;
    } else if (missionState?.currentDay) {
      this.missionSol = missionState.currentDay;
    }

    const targetScreens = this.rawConfig.screens || [];

    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;

      const rawName = mesh.name || "";
      const trimmedName = rawName.trim();
      const cleanName = trimmedName.replace(/\./g, "");

      const matchedConfig = targetScreens.find((sc) => {
        const scMesh = (sc.meshName || "").trim();
        const scClean = scMesh.replace(/\./g, "");
        return (
          trimmedName === scMesh ||
          cleanName === scClean ||
          rawName === sc.meshName ||
          trimmedName.includes(scMesh) ||
          scMesh.includes(trimmedName)
        );
      });

      if (matchedConfig) {
        this.bindScreen(mesh, matchedConfig);
      }
    });

    this.renderAll();
  }

  /**
   * Binds an individual screen mesh with planar UV projection and offscreen CanvasTexture.
   */
  private bindScreen(mesh: THREE.Mesh, screenConf: AirlockScreenItem): void {
    const meshKey = screenConf.meshName.trim();
    const fallback = VERIFIED_AIRLOCK_MAPPINGS[meshKey] || {
      uAxis: "x" as const,
      vAxis: "y" as const,
      flipU: false,
      flipV: false
    };

    const orientation = screenConf.orientation || {};
    const flipU = orientation.mirrorHorizontal !== undefined ? Boolean(orientation.mirrorHorizontal) : fallback.flipU;
    const flipV = orientation.mirrorVertical !== undefined ? Boolean(orientation.mirrorVertical) : fallback.flipV;
    const rotation = (orientation.rotationDegrees || 0) as 0 | 90 | 180 | 270;
    const uAxis = orientation.uAxis || fallback.uAxis;
    const vAxis = orientation.vAxis || fallback.vAxis;

    reprojectPlanarUVs(mesh.geometry, { uAxis, vAxis, flipU, flipV, rotation });

    const canvasWidth = 640;
    const canvasHeight = 512;

    if (typeof document === "undefined") {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      toneMapped: false
    });

    mesh.material = material;
    mesh.visible = true;

    this.activeBindings.push({
      screenId: screenConf.screenId,
      meshName: screenConf.meshName,
      rendererId: screenConf.rendererId,
      mesh,
      canvas,
      ctx,
      texture,
      material,
      width: canvasWidth,
      height: canvasHeight,
      refreshIntervalMs: screenConf.refreshPolicy?.minimumIntervalMs || 2000,
      lastRenderTime: 0
    });
  }

  /**
   * Renders all active screen bindings.
   */
  public renderAll(missionState?: { currentDay?: number; currentSol?: number }): void {
    if (missionState?.currentSol) {
      this.missionSol = missionState.currentSol;
    } else if (missionState?.currentDay) {
      this.missionSol = missionState.currentDay;
    }

    for (const binding of this.activeBindings) {
      this.renderBinding(binding);
      binding.texture.needsUpdate = true;
    }
  }

  /**
   * Renders the airlock control console screen content.
   */
  private renderBinding(binding: AirlockScreenBinding): void {
    const { ctx, width, height, meshName } = binding;
    const screenConf = this.screensMap.get(meshName.trim()) || this.screensMap.get(binding.screenId);
    if (!screenConf) return;

    this.renderAirlockConsole(ctx, screenConf, width, height);
  }

  // =========================================================================
  // AIRLOCK CONTROL CONSOLE RENDERER
  // =========================================================================

  private renderAirlockConsole(
    ctx: CanvasRenderingContext2D,
    screenConf: AirlockScreenItem,
    width: number,
    height: number
  ): void {
    const content = screenConf.content || {};

    // Background & HUD Grid
    ctx.fillStyle = "#08111B";
    ctx.fillRect(0, 0, width, height);
    this.drawGrid(ctx, width, height);

    // Header
    const headerTitle = content.header?.title || "AIRLOCK CONTROL CONSOLE";
    const headerSub = content.header?.subtitle || "DEPRESSURIZATION & EVA OPERATIONS";
    const headerStatus = content.header?.status || "SEALED";

    ctx.fillStyle = "#111F2C";
    ctx.fillRect(0, 0, width, 52);
    ctx.fillStyle = "#E5A04B";
    ctx.fillRect(0, 50, width, 2);

    ctx.fillStyle = "#E7F0F7";
    ctx.font = "bold 15px monospace";
    ctx.fillText(headerTitle.toUpperCase(), 20, 26);

    ctx.fillStyle = "#92A9BC";
    ctx.font = "10px monospace";
    ctx.fillText(headerSub.toUpperCase(), 20, 42);

    ctx.fillStyle = "#E5A04B";
    ctx.font = "bold 11px monospace";
    ctx.fillText(`SOL ${this.missionSol}`, width - 170, 26);

    // Status indicator (color-coded: SEALED=green, CYCLING=warning, OPEN=critical)
    const statusUpper = headerStatus.toUpperCase();
    const statusColor = statusUpper === "SEALED" ? "#5BC69A"
      : statusUpper === "OPEN" ? "#F16B66"
      : "#F0BD55";
    ctx.fillStyle = statusColor;
    ctx.font = "bold 10px monospace";
    ctx.fillText(`● ${statusUpper}`, width - 90, 26);

    ctx.fillStyle = "#F0BD55";
    ctx.font = "8px monospace";
    ctx.fillText("SIMULATED AIRLOCK DATA - NOT LIVE NASA TELEMETRY", width - 310, 42);

    // Primary metrics row
    let contentY = 64;
    if (content.primaryMetrics && content.primaryMetrics.length > 0) {
      this.drawPrimaryMetrics(ctx, 20, contentY, width - 40, 44, content.primaryMetrics);
      contentY += 56;
    }

    const availableHeight = height - contentY - 36;
    const panels = content.panels || [];

    if (panels.length === 3) {
      // Layout: left column = status card, right column = 2 stacked panels
      const colW = Math.floor((width - 40 - 16) / 2);
      const rowH = Math.floor((availableHeight - 12) / 2);

      this.dispatchPanel(ctx, 20, contentY, colW, availableHeight, panels[0]);
      this.dispatchPanel(ctx, 20 + colW + 16, contentY, colW, rowH, panels[1]);
      this.dispatchPanel(ctx, 20 + colW + 16, contentY + rowH + 12, colW, rowH, panels[2]);
    } else {
      const colW = Math.floor((width - 40 - (panels.length - 1) * 16) / Math.max(panels.length, 1));
      panels.forEach((p, idx) => {
        this.dispatchPanel(ctx, 20 + idx * (colW + 16), contentY, colW, availableHeight, p);
      });
    }

    // Footer
    ctx.fillStyle = "#111F2C";
    ctx.fillRect(0, height - 26, width, 26);
    ctx.fillStyle = "#24394B";
    ctx.fillRect(0, height - 26, width, 1);

    ctx.fillStyle = "#92A9BC";
    ctx.font = "9px monospace";
    ctx.fillText(content.footer?.left || "Simulated airlock control data", 20, height - 10);

    ctx.fillStyle = "#F0BD55";
    ctx.font = "bold 9px monospace";
    ctx.fillText("SIMULATED DEMO ONLY", width - 160, height - 10);

    // Brackets
    this.drawBrackets(ctx, width, height, "#E5A04B");
  }

  /**
   * Dispatches panel rendering according to panel type.
   */
  private dispatchPanel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    p: AirlockScreenPanel
  ): void {
    switch (p.type) {
      case "STATUS_CARD":
        this.drawStatusCard(ctx, x, y, w, h, p);
        break;
      case "COMPONENT_STATUS":
        this.drawComponentStatus(ctx, x, y, w, h, p);
        break;
      case "METRIC_GRID":
        this.drawMetricGrid(ctx, x, y, w, h, p);
        break;
      default:
        this.drawFallbackPanel(ctx, x, y, w, h, p);
        break;
    }
  }

  // =========================================================================
  // PANEL RENDERERS
  // =========================================================================

  private drawStatusCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "DEPRESSURIZATION STATUS");
    const data = p.fallback || p.data || {};
    const prio = data.priority || "NORMAL";
    const msg = data.message || "Airlock sealed. Cabin pressure nominal.";
    const status = data.status || "STANDBY";

    ctx.fillStyle = "#111F2C";
    ctx.fillRect(x + 8, y + 30, w - 16, h - 38);
    ctx.strokeStyle = "#24394B";
    ctx.strokeRect(x + 8, y + 30, w - 16, h - 38);

    ctx.fillStyle = "#E5A04B";
    ctx.font = "bold 9px monospace";
    ctx.fillText(`PRIORITY: ${prio}`, x + 14, y + 46);

    const statusColor = status === "STANDBY" ? "#5BC69A" : status === "CYCLING" ? "#F0BD55" : "#5BC69A";
    ctx.fillStyle = statusColor;
    ctx.font = "bold 9px monospace";
    ctx.fillText(`STATUS: ${status}`, x + 14, y + 62);

    ctx.fillStyle = "#E7F0F7";
    ctx.font = "10px monospace";
    this.drawWrappedText(ctx, msg, x + 14, y + 82, w - 28, 14, 4);
  }

  private drawComponentStatus(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "SEAL DIAGNOSTICS");
    const items: Array<{ name?: string; status?: string }> = Array.isArray(p.fallback)
      ? p.fallback
      : p.items || [];
    let cy = y + 32;

    items.slice(0, 5).forEach((ch) => {
      ctx.fillStyle = "#111F2C";
      ctx.fillRect(x + 8, cy, w - 16, 24);
      ctx.strokeStyle = "#24394B";
      ctx.strokeRect(x + 8, cy, w - 16, 24);

      const statusUp = (ch.status || "NOMINAL").toUpperCase();
      const isNom = statusUp === "NOMINAL" || statusUp === "ONLINE" || statusUp === "ARMED" || statusUp === "STANDBY";
      ctx.fillStyle = isNom ? "#5BC69A" : "#F0BD55";
      ctx.beginPath();
      ctx.arc(x + 16, cy + 12, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#E7F0F7";
      ctx.font = "10px monospace";
      ctx.fillText((ch.name || "COMPONENT").slice(0, 18), x + 26, cy + 16);

      ctx.fillStyle = isNom ? "#5BC69A" : "#F0BD55";
      ctx.font = "bold 9px monospace";
      ctx.fillText(ch.status || "NOMINAL", x + w - 65, cy + 16);

      cy += 28;
    });
  }

  private drawMetricGrid(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "ATMOSPHERE READINGS");
    const metrics: Array<{ label?: string; value?: string | number; unit?: string }> = Array.isArray(p.fallback)
      ? p.fallback
      : p.items || [];
    const cols = 2;
    const cardW = Math.floor((w - 24) / cols);
    const cardH = 36;
    let my = y + 32;

    metrics.slice(0, 4).forEach((m, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cx = x + 8 + col * (cardW + 8);
      const cy = my + row * (cardH + 8);

      ctx.fillStyle = "#111F2C";
      ctx.fillRect(cx, cy, cardW, cardH);
      ctx.strokeStyle = "#24394B";
      ctx.strokeRect(cx, cy, cardW, cardH);

      ctx.fillStyle = "#92A9BC";
      ctx.font = "8px monospace";
      ctx.fillText((m.label || "").slice(0, 16), cx + 6, cy + 13);

      ctx.fillStyle = "#5BC69A";
      ctx.font = "bold 12px monospace";
      ctx.fillText(`${m.value} ${m.unit || ""}`, cx + 6, cy + 28);
    });
  }

  private drawFallbackPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "DIAGNOSTIC PANEL");
    ctx.fillStyle = "#92A9BC";
    ctx.font = "10px monospace";
    ctx.fillText(`TYPE: ${p.type}`, x + 14, y + 40);
    ctx.fillText("Airlock telemetry standby", x + 14, y + 58);
  }

  // =========================================================================
  // SHARED UI PRIMITIVES
  // =========================================================================

  private drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.strokeStyle = "#111F2C";
    ctx.lineWidth = 1;
    const step = 32;
    for (let x = 0; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  private drawPrimaryMetrics(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    metrics: any[]
  ): void {
    const count = Math.min(metrics.length, 4);
    const cardW = Math.floor((w - (count - 1) * 12) / count);

    metrics.slice(0, count).forEach((m, idx) => {
      const cx = x + idx * (cardW + 12);
      ctx.fillStyle = "#111F2C";
      ctx.fillRect(cx, y, cardW, h);
      ctx.strokeStyle = "#24394B";
      ctx.strokeRect(cx, y, cardW, h);

      ctx.fillStyle = "#92A9BC";
      ctx.font = "9px monospace";
      ctx.fillText((m.label || "").slice(0, 18), cx + 8, y + 15);

      const val = m.value !== undefined ? m.value : m.fallback !== undefined ? m.fallback : "--";
      ctx.fillStyle = "#5BC69A";
      ctx.font = "bold 14px monospace";
      ctx.fillText(`${val} ${m.unit || ""}`, cx + 8, y + 34);
    });
  }

  private drawPanelFrame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string): void {
    ctx.fillStyle = "#0A1724";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#24394B";
    ctx.strokeRect(x, y, w, h);

    // Panel Header Bar
    ctx.fillStyle = "#111F2C";
    ctx.fillRect(x, y, w, 22);
    ctx.strokeStyle = "#24394B";
    ctx.strokeRect(x, y, w, 22);

    ctx.fillStyle = "#E5A04B";
    ctx.fillRect(x, y, 3, 22);

    ctx.fillStyle = "#E7F0F7";
    ctx.font = "bold 9px monospace";
    ctx.fillText(title.toUpperCase(), x + 10, y + 15);
  }

  private drawBrackets(ctx: CanvasRenderingContext2D, w: number, h: number, color: string): void {
    const len = 14;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(3, 3 + len);
    ctx.lineTo(3, 3);
    ctx.lineTo(3 + len, 3);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(w - 3 - len, 3);
    ctx.lineTo(w - 3, 3);
    ctx.lineTo(w - 3, 3 + len);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(3, h - 3 - len);
    ctx.lineTo(3, h - 3);
    ctx.lineTo(3 + len, h - 3);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(w - 3 - len, h - 3);
    ctx.lineTo(w - 3, h - 3);
    ctx.lineTo(w - 3, h - 3 - len);
    ctx.stroke();
  }

  private drawWrappedText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
    maxLines: number
  ): void {
    const words = text.split(" ");
    let line = "";
    let lineCount = 0;

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + " ";
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && i > 0) {
        ctx.fillText(line, x, y + lineCount * lineHeight);
        line = words[i] + " ";
        lineCount++;
        if (lineCount >= maxLines - 1 && i < words.length - 1) {
          line += "...";
          break;
        }
      } else {
        line = testLine;
      }
    }
    if (lineCount < maxLines) {
      ctx.fillText(line, x, y + lineCount * lineHeight);
    }
  }

  /**
   * Updates partial data in configuration and re-renders bound screen.
   */
  public updateScreenData(screenIdOrMeshName: string, partialContent: any): void {
    const key = screenIdOrMeshName.trim();
    const config = this.screensMap.get(key);
    if (config) {
      if (partialContent.header) {
        config.content.header = { ...config.content.header, ...partialContent.header };
      }
      if (partialContent.primaryMetrics) {
        config.content.primaryMetrics = partialContent.primaryMetrics;
      }
      if (partialContent.panels) {
        config.content.panels = partialContent.panels;
      }
      if (partialContent.footer) {
        config.content.footer = { ...config.content.footer, ...partialContent.footer };
      }

      const binding = this.activeBindings.find(
        (b) => b.screenId === key || b.meshName === key || b.meshName.includes(key)
      );
      if (binding) {
        this.renderBinding(binding);
        binding.texture.needsUpdate = true;
      }
    }
  }

  public getActiveBindings(): ReadonlyArray<AirlockScreenBinding> {
    return this.activeBindings;
  }

  public getBindings(): ReadonlyArray<AirlockScreenBinding> {
    return this.activeBindings;
  }

  public getScreenConfig(screenIdOrMeshName: string): AirlockScreenItem | undefined {
    return this.screensMap.get(screenIdOrMeshName.trim());
  }

  public dispose(): void {
    for (const binding of this.activeBindings) {
      if (binding.texture) {
        binding.texture.dispose();
      }
      if (binding.material) {
        binding.material.dispose();
      }
    }
    this.activeBindings = [];
  }
}
