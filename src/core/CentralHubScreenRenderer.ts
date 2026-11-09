/**
 * PHOBOSIA — Central Hub Physical Screen Rendering System
 *
 * Dedicated modular screen renderer for the 3 physical 3D displays in Central Hub:
 * 1. Env_Status_Display              -> CH_ENV_STATUS (Environmental snapshot)
 * 2. Internal_Communication_Display   -> CH_INTERNAL_COMMUNICATION (Tall portrait vertical comms terminal)
 * 3. Module_Status_Display           -> CH_MODULE_STATUS (Outpost-wide module readiness)
 *
 * Driven by `src/jsons/Screens/central-hub-screens.json`.
 * Implements specialized panel types:
 * STATUS_MATRIX, METRIC_GRID, ALERT_LIST, COMPONENT_STATUS, EVENT_FEED, STATUS_CARD.
 * Includes dedicated portrait vertical stack renderer for Internal_Communication_Display.
 *
 * All numeric and environmental values are simulated demonstrations for PHOBOSIA.
 * Displays mandatory disclaimer: "SIMULATED OUTPOST DATA - NOT LIVE NASA TELEMETRY".
 */

import * as THREE from "three";
import { isTriggerMesh } from "./ScreenRenderer";
import { reprojectPlanarUVs } from "./Collision";
import { getScreenConfigForSol, type ScreenMissionSnapshot } from "./ScreenConfigRegistry";
import { drawSol07Banner, isSol07StormPresentationActive } from "../missions/sol-07/Sol07ScreenRenderer";
import { drawSol08Warnings } from "../missions/sol-08/Sol08ScreenRenderer";

export interface CentralHubScreenPanel {
  id?: string;
  title?: string;
  type: string;
  [key: string]: any;
}

export interface CentralHubScreenItem {
  screenId: string;
  meshName: string;
  rendererId: string;
  subsystem?: string;
  dimensionsMeters?: {
    x?: number | null;
    y?: number | null;
    z?: number | null;
  };
  orientation?: {
    mirrorHorizontal?: boolean;
    mirrorVertical?: boolean;
    rotationDegrees?: number;
    uAxis?: "x" | "y" | "z";
    vAxis?: "x" | "y" | "z";
  };
  displayProfile?: {
    shape?: string;
    preferVerticalStacking?: boolean;
    compactHeader?: boolean;
    showMessageQueue?: boolean;
    showModuleRecipients?: boolean;
    avoidWideTables?: boolean;
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
    panels?: CentralHubScreenPanel[];
    footer?: {
      left?: string;
      right?: string;
    };
    [key: string]: any;
  };
  [key: string]: any;
}

export interface CentralHubScreenDataRoot {
  project?: string;
  zone?: string;
  configVersion?: string;
  dataPolicy?: any;
  rendering?: any;
  visualTheme?: any;
  globalLayout?: any;
  orientationDefaults?: any;
  missionContext?: any;
  screens: CentralHubScreenItem[];
  [key: string]: any;
}

export interface CentralHubScreenBinding {
  screenId: string;
  meshName: string;
  rendererId: string;
  mesh: THREE.Mesh;
  originalMaterial: THREE.Material | THREE.Material[];
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  material: THREE.MeshBasicMaterial;
  width: number;
  height: number;
  refreshIntervalMs: number;
  lastRenderTime: number;
}

// Verified mapping for planar projection for the 3 Central Hub screens
const VERIFIED_HUB_MAPPINGS: Record<
  string,
  { uAxis: "x" | "y" | "z"; vAxis: "x" | "y" | "z"; flipU: boolean; flipV: boolean; isPortrait: boolean }
> = {
  Env_Status_Display: { uAxis: "z", vAxis: "y", flipU: false, flipV: false, isPortrait: false },
  Internal_Communication_Display: { uAxis: "x", vAxis: "y", flipU: true, flipV: false, isPortrait: true },
  Module_Status_Display: { uAxis: "z", vAxis: "y", flipU: true, flipV: false, isPortrait: false }
};

// Dynamic resolver for Node CommonJS tests vs Next.js Webpack bundler
function loadCentralHubScreenData(): CentralHubScreenDataRoot {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("../jsons/Screens/central-hub-screens.json");
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return eval("require")("../src/jsons/Screens/central-hub-screens.json");
    } catch {
      try {
        return eval("require")("../../src/jsons/Screens/central-hub-screens.json");
      } catch {
        return { project: "PHOBOSIA", zone: "CENTRAL_HUB", screens: [] };
      }
    }
  }
}

const rawCentralHubDataJson = loadCentralHubScreenData();

export class CentralHubScreenRenderer {
  private rawConfig: CentralHubScreenDataRoot;
  private screensMap = new Map<string, CentralHubScreenItem>();
  private activeBindings: CentralHubScreenBinding[] = [];
  private missionSol: number = 4;
  private configSol = 4;
  private customConfig: boolean;
  private completedStepIds: string[] = [];

  constructor(customConfig?: CentralHubScreenDataRoot) {
    this.customConfig = Boolean(customConfig);
    this.rawConfig = customConfig
      ? JSON.parse(JSON.stringify(customConfig))
      : JSON.parse(JSON.stringify(rawCentralHubDataJson));
    this.initScreensMap();
  }

  private selectSolConfig(sol: number): void {
    if (this.customConfig || this.configSol === sol) return;
    this.rawConfig = JSON.parse(JSON.stringify(getScreenConfigForSol("centralHub", sol, rawCentralHubDataJson)));
    this.configSol = sol;
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
   * Primary entry point: Scans the Central Hub GLB scene and binds canvas textures to the 3 screens.
   */
  public renderCentralHubScreens(model: THREE.Group, missionState?: ScreenMissionSnapshot): void {
    this.attachToHub(model, missionState);
  }

  /**
   * Outpost standard alias (attachToHabitat, attachToEngineering, attachToScience, attachToMissionControl, attachToHub).
   */
  public attachToHub(model: THREE.Group, missionState?: ScreenMissionSnapshot): void {
    this.dispose();

    if (missionState?.currentSol) {
      this.missionSol = missionState.currentSol;
    } else if (missionState?.currentDay) {
      this.missionSol = missionState.currentDay;
    }
    if (missionState?.completedStepIds) this.completedStepIds = missionState.completedStepIds;
    this.selectSolConfig(this.missionSol);

    const targetScreens = this.rawConfig.screens || [];

    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry || isTriggerMesh(mesh)) return;

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

    this.renderAll(missionState);
  }

  /**
   * Binds an individual screen mesh with planar UV projection and offscreen CanvasTexture.
   */
  private bindScreen(mesh: THREE.Mesh, screenConf: CentralHubScreenItem): void {
    const meshKey = screenConf.meshName.trim();
    const fallback = VERIFIED_HUB_MAPPINGS[meshKey] || {
      uAxis: "z" as const,
      vAxis: "y" as const,
      flipU: false,
      flipV: false,
      isPortrait: false
    };

    const orientation = screenConf.orientation || {};
    const flipU = orientation.mirrorHorizontal !== undefined ? Boolean(orientation.mirrorHorizontal) : fallback.flipU;
    const flipV = orientation.mirrorVertical !== undefined ? Boolean(orientation.mirrorVertical) : fallback.flipV;
    const rotation = (orientation.rotationDegrees || 0) as 0 | 90 | 180 | 270;
    const uAxis = orientation.uAxis || fallback.uAxis;
    const vAxis = orientation.vAxis || fallback.vAxis;

    reprojectPlanarUVs(mesh.geometry, { uAxis, vAxis, flipU, flipV, rotation });

    let canvasWidth = 1024;
    let canvasHeight = 640;

    if (fallback.isPortrait || screenConf.displayProfile?.shape === "TALL_PORTRAIT") {
      canvasWidth = 512;
      canvasHeight = 1024;
    }

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

    const originalMaterial = mesh.material;
    mesh.material = material;
    mesh.visible = true;

    this.activeBindings.push({
      screenId: screenConf.screenId,
      meshName: screenConf.meshName,
      rendererId: screenConf.rendererId,
      mesh,
      originalMaterial,
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
  public renderAll(missionState?: ScreenMissionSnapshot): void {
    if (missionState?.currentSol) {
      this.missionSol = missionState.currentSol;
    } else if (missionState?.currentDay) {
      this.missionSol = missionState.currentDay;
    }
    if (missionState?.completedStepIds) this.completedStepIds = missionState.completedStepIds;
    this.selectSolConfig(this.missionSol);

    for (const binding of this.activeBindings) {
      this.renderBinding(binding);
      drawSol08Warnings(binding.ctx, binding.width, binding.height, missionState?.currentDay === 8 ? missionState.sol8 : undefined);
      binding.texture.needsUpdate = true;
    }
  }

  /**
   * Dispatches rendering according to screen profile (portrait vs landscape).
   */
  private renderBinding(binding: CentralHubScreenBinding): void {
    const { ctx, width, height, meshName } = binding;
    const screenConf = this.screensMap.get(meshName.trim()) || this.screensMap.get(binding.screenId);
    if (!screenConf) return;

    if (screenConf.displayProfile?.shape === "TALL_PORTRAIT" || screenConf.meshName === "Internal_Communication_Display") {
      this.renderPortraitCommsScreen(ctx, screenConf, width, height);
    } else {
      this.renderLandscapeHubScreen(ctx, screenConf, width, height);
    }
    if (isSol07StormPresentationActive({ currentDay: this.missionSol, completedStepIds: this.completedStepIds })) drawSol07Banner(ctx, width, height, "SOL 7 · OUTPOST STATUS REVIEW", "Record visible section status; assess distribution without changing it.");
  }

  // =========================================================================
  // PORTRAIT VERTICAL STACK RENDERER (Internal_Communication_Display)
  // =========================================================================

  private renderPortraitCommsScreen(
    ctx: CanvasRenderingContext2D,
    screenConf: CentralHubScreenItem,
    width: number,
    height: number
  ): void {
    const content = screenConf.content || {};

    // Background & HUD Grid
    ctx.fillStyle = "#08111B";
    ctx.fillRect(0, 0, width, height);
    this.drawGrid(ctx, width, height);

    // Compact Header
    ctx.fillStyle = "#111F2C";
    ctx.fillRect(0, 0, width, 48);
    ctx.fillStyle = "#E5A04B";
    ctx.fillRect(0, 46, width, 2);

    ctx.fillStyle = "#E7F0F7";
    ctx.font = "bold 14px monospace";
    ctx.fillText(content.header?.title || "INTERNAL COMMS", 16, 24);

    ctx.fillStyle = "#92A9BC";
    ctx.font = "9px monospace";
    ctx.fillText(content.header?.subtitle || "OUTPOST NETWORK", 16, 38);

    ctx.fillStyle = "#5BC69A";
    ctx.font = "bold 10px monospace";
    ctx.fillText("● ONLINE", width - 85, 24);

    ctx.fillStyle = "#E5A04B";
    ctx.font = "bold 9px monospace";
    ctx.fillText(`SOL ${this.missionSol}`, width - 75, 38);

    // Primary metrics row (stacked or 2 small cards)
    let curY = 56;
    if (content.primaryMetrics && content.primaryMetrics.length > 0) {
      const cardW = Math.floor((width - 32 - (content.primaryMetrics.length - 1) * 8) / content.primaryMetrics.length);
      content.primaryMetrics.forEach((m, idx) => {
        const cx = 16 + idx * (cardW + 8);
        ctx.fillStyle = "#111F2C";
        ctx.fillRect(cx, curY, cardW, 40);
        ctx.strokeStyle = "#24394B";
        ctx.strokeRect(cx, curY, cardW, 40);

        ctx.fillStyle = "#92A9BC";
        ctx.font = "8px monospace";
        ctx.fillText((m.label || "").slice(0, 16), cx + 6, curY + 14);

        const val = m.value !== undefined ? m.value : m.fallback !== undefined ? m.fallback : "--";
        ctx.fillStyle = "#5BC69A";
        ctx.font = "bold 12px monospace";
        ctx.fillText(`${val} ${m.unit || ""}`, cx + 6, curY + 30);
      });
      curY += 48;
    }

    const panels = content.panels || [];
    const availableH = height - curY - 32;
    const panelH = Math.floor((availableH - (panels.length - 1) * 10) / Math.max(panels.length, 1));

    panels.forEach((p) => {
      this.dispatchHubPanel(ctx, 16, curY, width - 32, panelH, p);
      curY += panelH + 10;
    });

    // Footer
    ctx.fillStyle = "#111F2C";
    ctx.fillRect(0, height - 26, width, 26);
    ctx.fillStyle = "#24394B";
    ctx.fillRect(0, height - 26, width, 1);

    ctx.fillStyle = "#92A9BC";
    ctx.font = "8px monospace";
    ctx.fillText(content.footer?.left || "Internal network", 14, height - 10);

    ctx.fillStyle = "#F0BD55";
    ctx.font = "bold 8px monospace";
    ctx.fillText("SIMULATED OUTPOST DATA", width - 150, height - 10);

    // Brackets
    this.drawBrackets(ctx, width, height, "#E5A04B");
  }

  // =========================================================================
  // LANDSCAPE RENDERER (Env_Status_Display & Module_Status_Display)
  // =========================================================================

  private renderLandscapeHubScreen(
    ctx: CanvasRenderingContext2D,
    screenConf: CentralHubScreenItem,
    width: number,
    height: number
  ): void {
    const content = screenConf.content || {};

    // Background & HUD Grid
    ctx.fillStyle = "#08111B";
    ctx.fillRect(0, 0, width, height);
    this.drawGrid(ctx, width, height);

    // Header
    const headerTitle = content.header?.title || screenConf.subsystem || "CENTRAL HUB";
    const headerSub = content.header?.subtitle || "SHARED OUTPOST CONDITIONS";
    const headerStatus = content.header?.status || "MONITORING";

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

    ctx.fillStyle = "#5BC69A";
    ctx.font = "bold 10px monospace";
    ctx.fillText(`● ${headerStatus}`, width - 90, 26);

    ctx.fillStyle = "#F0BD55";
    ctx.font = "8px monospace";
    ctx.fillText("SIMULATED OUTPOST DATA - NOT LIVE NASA TELEMETRY", width - 310, 42);

    // Primary metrics row
    let contentY = 64;
    if (content.primaryMetrics && content.primaryMetrics.length > 0) {
      this.drawPrimaryMetrics(ctx, 20, contentY, width - 40, 44, content.primaryMetrics);
      contentY += 56;
    }

    const availableHeight = height - contentY - 36;
    const panels = content.panels || [];

    if (panels.length === 3) {
      // 2 columns: left column has main matrix/status, right column has 2 stacked panels
      const colW = Math.floor((width - 40 - 16) / 2);
      const rowH = Math.floor((availableHeight - 12) / 2);

      this.dispatchHubPanel(ctx, 20, contentY, colW, availableHeight, panels[0]);
      this.dispatchHubPanel(ctx, 20 + colW + 16, contentY, colW, rowH, panels[1]);
      this.dispatchHubPanel(ctx, 20 + colW + 16, contentY + rowH + 12, colW, rowH, panels[2]);
    } else {
      const colW = Math.floor((width - 40 - (panels.length - 1) * 16) / Math.max(panels.length, 1));
      panels.forEach((p, idx) => {
        this.dispatchHubPanel(ctx, 20 + idx * (colW + 16), contentY, colW, availableHeight, p);
      });
    }

    // Footer
    ctx.fillStyle = "#111F2C";
    ctx.fillRect(0, height - 26, width, 26);
    ctx.fillStyle = "#24394B";
    ctx.fillRect(0, height - 26, width, 1);

    ctx.fillStyle = "#92A9BC";
    ctx.font = "9px monospace";
    ctx.fillText(content.footer?.left || "Simulated habitat conditions", 20, height - 10);

    ctx.fillStyle = "#F0BD55";
    ctx.font = "bold 9px monospace";
    ctx.fillText("SIMULATED DEMO ONLY", width - 160, height - 10);

    // Brackets
    this.drawBrackets(ctx, width, height, "#E5A04B");
  }

  /**
   * Dispatches panel rendering according to panel type.
   */
  private dispatchHubPanel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    p: CentralHubScreenPanel
  ): void {
    switch (p.type) {
      case "STATUS_MATRIX":
        this.drawStatusMatrix(ctx, x, y, w, h, p);
        break;
      case "METRIC_GRID":
        this.drawMetricGrid(ctx, x, y, w, h, p);
        break;
      case "ALERT_LIST":
        this.drawAlertList(ctx, x, y, w, h, p);
        break;
      case "COMPONENT_STATUS":
        this.drawComponentStatus(ctx, x, y, w, h, p);
        break;
      case "EVENT_FEED":
        this.drawEventFeed(ctx, x, y, w, h, p);
        break;
      case "STATUS_CARD":
        this.drawStatusCard(ctx, x, y, w, h, p);
        break;
      default:
        this.drawFallbackPanel(ctx, x, y, w, h, p);
        break;
    }
  }

  // =========================================================================
  // CENTRAL HUB PANEL RENDERERS
  // =========================================================================

  private drawStatusMatrix(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "ZONE CONDITIONS");
    const zones: Array<{ name?: string; status?: string; summary?: string }> = Array.isArray(p.fallback)
      ? p.fallback
      : p.items || [];
    let zy = y + 34;

    zones.slice(0, 4).forEach((zone) => {
      ctx.fillStyle = "#111F2C";
      ctx.fillRect(x + 8, zy, w - 16, 26);
      ctx.strokeStyle = "#24394B";
      ctx.strokeRect(x + 8, zy, w - 16, 26);

      const isNom = (zone.status || "NOMINAL").toUpperCase() === "NOMINAL";
      ctx.fillStyle = isNom ? "#5BC69A" : "#F0BD55";
      ctx.beginPath();
      ctx.arc(x + 18, zy + 13, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#E7F0F7";
      ctx.font = "10px monospace";
      ctx.fillText((zone.name || "ZONE").slice(0, 14), x + 28, zy + 17);

      ctx.fillStyle = "#92A9BC";
      ctx.font = "9px monospace";
      ctx.fillText((zone.summary || "").slice(0, 18), x + 120, zy + 17);

      ctx.fillStyle = isNom ? "#5BC69A" : "#F0BD55";
      ctx.font = "bold 9px monospace";
      ctx.fillText(zone.status || "NOMINAL", x + w - 65, zy + 17);

      zy += 30;
    });
  }

  private drawMetricGrid(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "ENVIRONMENTAL READINGS");
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

  private drawAlertList(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "ENVIRONMENT ALERTS");
    const alerts: Array<{ severity?: string; message?: string; status?: string }> = Array.isArray(p.fallback)
      ? p.fallback
      : p.alerts || [];
    let ay = y + 34;

    if (alerts.length === 0) {
      ctx.fillStyle = "#5BC69A";
      ctx.font = "10px monospace";
      ctx.fillText("● ALL READINGS NOMINAL", x + 16, ay + 16);
      return;
    }

    alerts.slice(0, 3).forEach((alt) => {
      const sev = (alt.severity || "INFO").toUpperCase();
      const color = sev === "CRITICAL" ? "#F16B66" : sev === "WARNING" ? "#F0BD55" : "#5BC69A";

      ctx.fillStyle = color + "22";
      ctx.fillRect(x + 8, ay, w - 16, 26);
      ctx.strokeStyle = color;
      ctx.strokeRect(x + 8, ay, w - 16, 26);

      ctx.fillStyle = color;
      ctx.font = "bold 9px monospace";
      ctx.fillText(`▲ ${sev}`, x + 14, ay + 17);

      ctx.fillStyle = "#E7F0F7";
      ctx.font = "10px monospace";
      ctx.fillText((alt.message || "").slice(0, 28), x + 82, ay + 17);

      ay += 30;
    });
  }

  private drawComponentStatus(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "MODULE CHANNELS");
    const channels: Array<{ name?: string; status?: string }> = Array.isArray(p.fallback)
      ? p.fallback
      : p.items || [];
    let cy = y + 32;

    channels.slice(0, 5).forEach((ch) => {
      ctx.fillStyle = "#111F2C";
      ctx.fillRect(x + 8, cy, w - 16, 24);
      ctx.strokeStyle = "#24394B";
      ctx.strokeRect(x + 8, cy, w - 16, 24);

      const isNom = (ch.status || "ONLINE").toUpperCase() === "ONLINE" || (ch.status || "ONLINE").toUpperCase() === "NOMINAL";
      ctx.fillStyle = isNom ? "#5BC69A" : "#F0BD55";
      ctx.beginPath();
      ctx.arc(x + 16, cy + 12, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#E7F0F7";
      ctx.font = "10px monospace";
      ctx.fillText((ch.name || "CHANNEL").slice(0, 18), x + 26, cy + 16);

      ctx.fillStyle = isNom ? "#5BC69A" : "#F0BD55";
      ctx.font = "bold 9px monospace";
      ctx.fillText(ch.status || "ONLINE", x + w - 60, cy + 16);

      cy += 28;
    });
  }

  private drawEventFeed(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "LATEST MESSAGES");
    const events: Array<{ time?: string; severity?: string; source?: string; message?: string }> = Array.isArray(p.fallback)
      ? p.fallback
      : p.events || [];
    let ey = y + 32;

    events.slice(0, 4).forEach((ev) => {
      ctx.fillStyle = "#92A9BC";
      ctx.font = "8px monospace";
      ctx.fillText(ev.time || "00:00", x + 8, ey + 10);

      const sev = (ev.severity || "INFO").toUpperCase();
      const color = sev === "CRITICAL" ? "#F16B66" : sev === "WARNING" ? "#F0BD55" : "#5BC69A";
      ctx.fillStyle = color;
      ctx.font = "bold 8px monospace";
      ctx.fillText(`[${sev}]`, x + 75, ey + 10);

      ctx.fillStyle = "#E7F0F7";
      ctx.font = "9px monospace";
      const msg = ev.source ? `${ev.source}: ${ev.message || ""}` : ev.message || "";
      ctx.fillText(msg.slice(0, 24), x + 8, ey + 22);

      ey += 26;
    });
  }

  private drawStatusCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "PRIORITY NOTICE");
    const data = p.fallback || p.data || {};
    const prio = data.priority || "NORMAL";
    const msg = data.message || "No critical internal communication issues.";
    const status = data.status || "INFORMATIONAL";

    ctx.fillStyle = "#111F2C";
    ctx.fillRect(x + 8, y + 30, w - 16, h - 38);
    ctx.strokeStyle = "#24394B";
    ctx.strokeRect(x + 8, y + 30, w - 16, h - 38);

    ctx.fillStyle = "#E5A04B";
    ctx.font = "bold 9px monospace";
    ctx.fillText(`PRIORITY: ${prio}`, x + 14, y + 46);

    ctx.fillStyle = "#5BC69A";
    ctx.font = "bold 9px monospace";
    ctx.fillText(`STATUS: ${status}`, x + 14, y + 62);

    ctx.fillStyle = "#E7F0F7";
    ctx.font = "10px monospace";
    this.drawWrappedText(ctx, msg, x + 14, y + 82, w - 28, 14, 3);
  }

  private drawFallbackPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "DIAGNOSTIC PANEL");
    ctx.fillStyle = "#92A9BC";
    ctx.font = "10px monospace";
    ctx.fillText(`TYPE: ${p.type}`, x + 14, y + 40);
    ctx.fillText("Outpost telemetry standby", x + 14, y + 58);
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

  public getActiveBindings(): ReadonlyArray<CentralHubScreenBinding> {
    return this.activeBindings;
  }

  public getBindings(): ReadonlyArray<CentralHubScreenBinding> {
    return this.activeBindings;
  }

  public getScreenConfig(screenIdOrMeshName: string): CentralHubScreenItem | undefined {
    return this.screensMap.get(screenIdOrMeshName.trim());
  }

  public dispose(): void {
    for (const binding of this.activeBindings) {
      binding.mesh.material = binding.originalMaterial;
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
