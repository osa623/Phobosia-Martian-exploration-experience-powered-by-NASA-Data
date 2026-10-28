/**
 * PHOBOSIA — Mission Control Physical Screen Rendering System
 *
 * Dedicated modular screen renderer for the 8 physical 3D displays in Mission Control:
 * 1. MissionControl_ObjectivesScreen       -> MC_OBJECTIVES (SECTION_01)
 * 2. MissionControl_OutpostStatusScreen     -> MC_OUTPOST_STATUS (SECTION_01)
 * 3. MissionControl_OverviewScreen          -> MC_OVERVIEW (SECTION_01)
 * 4. MissionControl_CommunicationsScreen    -> MC_COMMUNICATIONS (SECTION_02)
 * 5. MissionControl_SystemsScreen           -> MC_SYSTEMS (SECTION_02)
 * 6. MissionControl_DroneOperationScreen    -> MC_DRONE_OPERATIONS (SECTION_03)
 * 7. MissionControl_ObservationSitesScreen  -> MC_OBSERVATION_SITES (SECTION_03)
 * 8. MissionControl_TerrainMapScreen        -> MC_TERRAIN_MAP (SECTION_03)
 *
 * Driven by `src/jsons/Screens/mission-control-screens.json`.
 * Implements 12 specialized panel types:
 * OBJECTIVE_CARD, CHECKLIST, SCHEDULE_LIST, COMPONENT_STATUS, RESOURCE_BARS,
 * ALERT_LIST, TIMELINE, STATUS_MATRIX, STATUS_CARD, DATA_TABLE, EVENT_FEED,
 * TERRAIN_MINIMAP.
 *
 * All numeric and mission values are simulated demonstrations for PHOBOSIA.
 * Displays mandatory disclaimer: "SIMULATED MISSION DATA - NOT LIVE NASA TELEMETRY".
 */

import * as THREE from "three";
import { reprojectPlanarUVs } from "./Collision";

export interface MissionControlScreenPanel {
  id?: string;
  title?: string;
  type: string;
  [key: string]: any;
}

export interface MissionControlScreenItem {
  screenId: string;
  meshName: string;
  sectionId?: string;
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
    panels?: MissionControlScreenPanel[];
    footer?: {
      left?: string;
      right?: string;
    };
    [key: string]: any;
  };
  [key: string]: any;
}

export interface MissionControlScreenDataRoot {
  project?: string;
  zone?: string;
  configVersion?: string;
  dataPolicy?: any;
  rendering?: any;
  visualTheme?: any;
  globalLayout?: any;
  orientationDefaults?: any;
  missionContext?: any;
  sections?: any[];
  screens: MissionControlScreenItem[];
  [key: string]: any;
}

export interface MissionControlScreenBinding {
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

// Verified mapping for planar projection for the 8 Mission Control screens
const VERIFIED_MC_MAPPINGS: Record<
  string,
  { uAxis: "x" | "y" | "z"; vAxis: "x" | "y" | "z"; flipU: boolean; flipV: boolean; aspect: number }
> = {
  MissionControl_ObjectivesScreen: { uAxis: "z", vAxis: "y", flipU: true, flipV: false, aspect: 1.69 },
  MissionControl_OutpostStatusScreen: { uAxis: "z", vAxis: "y", flipU: true, flipV: false, aspect: 1.69 },
  MissionControl_OverviewScreen: { uAxis: "z", vAxis: "y", flipU: true, flipV: false, aspect: 1.69 },
  MissionControl_CommunicationsScreen: { uAxis: "x", vAxis: "y", flipU: true, flipV: false, aspect: 1.9 },
  MissionControl_SystemsScreen: { uAxis: "x", vAxis: "y", flipU: true, flipV: false, aspect: 1.9 },
  MissionControl_DroneOperationScreen: { uAxis: "x", vAxis: "y", flipU: false, flipV: false, aspect: 1.0 },
  MissionControl_ObservationSitesScreen: { uAxis: "x", vAxis: "y", flipU: false, flipV: false, aspect: 1.0 },
  MissionControl_TerrainMapScreen: { uAxis: "x", vAxis: "y", flipU: false, flipV: false, aspect: 1.0 }
};

// Dynamic resolver for Node CommonJS tests vs Next.js Webpack bundler
function loadMissionControlScreenData(): MissionControlScreenDataRoot {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("../jsons/Screens/mission-control-screens.json");
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return eval("require")("../src/jsons/Screens/mission-control-screens.json");
    } catch {
      return {
        project: "PHOBOSIA",
        zone: "MISSION_CONTROL",
        screens: []
      };
    }
  }
}

const rawMissionControlDataJson = loadMissionControlScreenData();

export class MissionControlScreenRenderer {
  private rawConfig: MissionControlScreenDataRoot;
  private screensMap = new Map<string, MissionControlScreenItem>();
  private activeBindings: MissionControlScreenBinding[] = [];
  private missionSol: number = 4;

  constructor(customConfig?: MissionControlScreenDataRoot) {
    this.rawConfig = customConfig
      ? JSON.parse(JSON.stringify(customConfig))
      : JSON.parse(JSON.stringify(rawMissionControlDataJson));
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
   * Primary entry point: Scans the Mission Control GLB scene and binds canvas textures to the 8 screens.
   */
  public renderMissionControlScreens(model: THREE.Group, missionState?: { currentDay?: number; currentSol?: number }): void {
    this.attachToMissionControl(model, missionState);
  }

  /**
   * Outpost standard alias (attachToHabitat, attachToEngineering, attachToScience, attachToMissionControl).
   */
  public attachToMissionControl(model: THREE.Group, missionState?: { currentDay?: number; currentSol?: number }): void {
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
  private bindScreen(mesh: THREE.Mesh, screenConf: MissionControlScreenItem): void {
    const meshKey = screenConf.meshName.trim();
    const fallback = VERIFIED_MC_MAPPINGS[meshKey] || {
      uAxis: "x" as const,
      vAxis: "z" as const,
      flipU: false,
      flipV: false,
      aspect: 1.6
    };

    const orientation = screenConf.orientation || {};
    const flipU = orientation.mirrorHorizontal !== undefined ? Boolean(orientation.mirrorHorizontal) : fallback.flipU;
    const flipV = orientation.mirrorVertical !== undefined ? Boolean(orientation.mirrorVertical) : fallback.flipV;
    const rotation = (orientation.rotationDegrees || 0) as 0 | 90 | 180 | 270;
    const uAxis = orientation.uAxis || fallback.uAxis;
    const vAxis = orientation.vAxis || fallback.vAxis;

    reprojectPlanarUVs(mesh.geometry, { uAxis, vAxis, flipU, flipV, rotation });

    const aspect = fallback.aspect;
    let canvasWidth = 1024;
    let canvasHeight = 640;

    if (Math.abs(aspect - 1.0) < 0.15) {
      // Square console display (Drone, Sites, Terrain)
      canvasWidth = 768;
      canvasHeight = 768;
    } else if (aspect > 1.8) {
      // Wide monitor (Comms, Systems)
      canvasWidth = 1024;
      canvasHeight = 512;
    } else {
      // Slanted overview screens (Objectives, OutpostStatus, Overview)
      canvasWidth = 1024;
      canvasHeight = Math.round(1024 / aspect);
    }

    canvasWidth = THREE.MathUtils.clamp(canvasWidth, 256, 1024);
    canvasHeight = THREE.MathUtils.clamp(canvasHeight, 256, 1024);
    if (canvasWidth % 2 !== 0) canvasWidth++;
    if (canvasHeight % 2 !== 0) canvasHeight++;

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
   * Renders content for a specific binding.
   */
  private renderBinding(binding: MissionControlScreenBinding): void {
    const { ctx, width, height, meshName } = binding;
    const screenConf = this.screensMap.get(meshName.trim()) || this.screensMap.get(binding.screenId);
    if (!screenConf) return;

    const content = screenConf.content || {};

    // Background & HUD Grid
    ctx.fillStyle = "#08111B";
    ctx.fillRect(0, 0, width, height);
    this.drawGrid(ctx, width, height);

    // Header & Disclaimer
    const headerTitle = content.header?.title || screenConf.subsystem || "MISSION CONTROL";
    const headerSub = content.header?.subtitle || "PHOBOSIA MARS OPERATIONS";
    const headerStatus = content.header?.status || "ACTIVE";
    this.drawHeader(ctx, width, headerTitle, headerSub, headerStatus);

    // Primary metrics row (if available)
    let contentY = 64;
    if (content.primaryMetrics && content.primaryMetrics.length > 0) {
      this.drawPrimaryMetrics(ctx, 20, contentY, width - 40, 44, content.primaryMetrics);
      contentY += 56;
    }

    const availableHeight = height - contentY - 36;

    // Render panels based on layout
    const panels = content.panels || [];
    this.renderPanels(ctx, panels, 20, contentY, width - 40, availableHeight, screenConf.screenId);

    // Footer with mandatory disclaimer
    this.drawFooter(ctx, width, height, content.footer?.left || "OPERATIONAL TELEMETRY");

    // Outer cybernetic border brackets
    this.drawBrackets(ctx, width, height, "#E5A04B");
  }

  /**
   * Renders screen panels into responsive column/row regions.
   */
  private renderPanels(
    ctx: CanvasRenderingContext2D,
    panels: MissionControlScreenPanel[],
    x: number,
    y: number,
    w: number,
    h: number,
    screenId: string
  ): void {
    if (!panels || panels.length === 0) return;

    if (panels.length === 1) {
      this.dispatchPanel(ctx, x, y, w, h, panels[0]);
      return;
    }

    if (panels.length === 2) {
      const colW = Math.floor((w - 16) / 2);
      this.dispatchPanel(ctx, x, y, colW, h, panels[0]);
      this.dispatchPanel(ctx, x + colW + 16, y, colW, h, panels[1]);
      return;
    }

    if (panels.length === 3) {
      // 2 columns: left column has 1 tall panel or 2 stacked panels
      const colW = Math.floor((w - 16) / 2);
      const rowH = Math.floor((h - 12) / 2);

      if (screenId === "MC_OBJECTIVES" || screenId === "MC_OUTPOST_STATUS" || screenId === "MC_OVERVIEW") {
        // Left column: main card (full height or top half)
        this.dispatchPanel(ctx, x, y, colW, h, panels[0]);
        // Right column: 2 stacked panels
        this.dispatchPanel(ctx, x + colW + 16, y, colW, rowH, panels[1]);
        this.dispatchPanel(ctx, x + colW + 16, y + rowH + 12, colW, rowH, panels[2]);
      } else {
        // Left column top/bottom, right column full
        this.dispatchPanel(ctx, x, y, colW, rowH, panels[0]);
        this.dispatchPanel(ctx, x, y + rowH + 12, colW, rowH, panels[1]);
        this.dispatchPanel(ctx, x + colW + 16, y, colW, h, panels[2]);
      }
      return;
    }

    // 4 or more panels: 2x2 grid
    const colW = Math.floor((w - 16) / 2);
    const rowH = Math.floor((h - 12) / 2);
    this.dispatchPanel(ctx, x, y, colW, rowH, panels[0]);
    this.dispatchPanel(ctx, x + colW + 16, y, colW, rowH, panels[1]);
    this.dispatchPanel(ctx, x, y + rowH + 12, colW, rowH, panels[2]);
    if (panels[3]) {
      this.dispatchPanel(ctx, x + colW + 16, y + rowH + 12, colW, rowH, panels[3]);
    }
  }

  /**
   * Dispatches a single panel to its specialized renderer.
   */
  private dispatchPanel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    p: MissionControlScreenPanel
  ): void {
    switch (p.type) {
      case "OBJECTIVE_CARD":
        this.drawObjectiveCard(ctx, x, y, w, h, p);
        break;
      case "CHECKLIST":
        this.drawChecklist(ctx, x, y, w, h, p);
        break;
      case "SCHEDULE_LIST":
        this.drawScheduleList(ctx, x, y, w, h, p);
        break;
      case "COMPONENT_STATUS":
        this.drawComponentStatus(ctx, x, y, w, h, p);
        break;
      case "RESOURCE_BARS":
        this.drawResourceBars(ctx, x, y, w, h, p);
        break;
      case "ALERT_LIST":
        this.drawAlertList(ctx, x, y, w, h, p);
        break;
      case "TIMELINE":
        this.drawTimeline(ctx, x, y, w, h, p);
        break;
      case "STATUS_MATRIX":
        this.drawStatusMatrix(ctx, x, y, w, h, p);
        break;
      case "STATUS_CARD":
        this.drawStatusCard(ctx, x, y, w, h, p);
        break;
      case "DATA_TABLE":
        this.drawDataTable(ctx, x, y, w, h, p);
        break;
      case "EVENT_FEED":
        this.drawEventFeed(ctx, x, y, w, h, p);
        break;
      case "TERRAIN_MINIMAP":
        this.drawTerrainMinimap(ctx, x, y, w, h, p);
        break;
      default:
        this.drawFallbackPanel(ctx, x, y, w, h, p);
        break;
    }
  }

  // =========================================================================
  // SPECIALIZED PANEL RENDERERS (12 PANEL TYPES)
  // =========================================================================

  private drawObjectiveCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "ACTIVE OBJECTIVE");
    const data = p.fallback || p.data || {};
    const name = data.name || "Surface Observation Task";
    const desc = data.description || "Inspect the designated terrain area and record observation.";
    const status = data.status || "IN_PROGRESS";
    const progress = typeof data.progressPercent === "number" ? data.progressPercent : 45;

    // Status badge
    const badgeColor = status === "COMPLETED" ? "#5BC69A" : status === "IN_PROGRESS" ? "#E5A04B" : "#8FA8BC";
    ctx.fillStyle = badgeColor + "22";
    ctx.fillRect(x + 12, y + 34, 110, 22);
    ctx.strokeStyle = badgeColor;
    ctx.strokeRect(x + 12, y + 34, 110, 22);
    ctx.fillStyle = badgeColor;
    ctx.font = "bold 10px monospace";
    ctx.fillText(`● ${status}`, x + 20, y + 49);

    // Objective Title
    ctx.fillStyle = "#E7F0F7";
    ctx.font = "bold 13px monospace";
    this.drawWrappedText(ctx, name, x + 12, y + 76, w - 24, 18, 2);

    // Description
    ctx.fillStyle = "#8FA8BC";
    ctx.font = "10px monospace";
    this.drawWrappedText(ctx, desc, x + 12, y + 118, w - 24, 15, 3);

    // Progress Bar
    const barY = Math.min(y + h - 45, y + 175);
    ctx.fillStyle = "#8FA8BC";
    ctx.font = "10px monospace";
    ctx.fillText("OBJECTIVE PROGRESS", x + 12, barY);
    ctx.fillStyle = "#5BC69A";
    ctx.font = "bold 11px monospace";
    ctx.fillText(`${progress}%`, x + w - 45, barY);

    ctx.fillStyle = "#101D2A";
    ctx.fillRect(x + 12, barY + 6, w - 24, 12);
    ctx.strokeStyle = "#24394B";
    ctx.strokeRect(x + 12, barY + 6, w - 24, 12);

    ctx.fillStyle = "#5BC69A";
    ctx.fillRect(x + 13, barY + 7, (w - 26) * (progress / 100), 10);
  }

  private drawChecklist(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "COMPLETION CRITERIA");
    const items: Array<{ label: string; completed: boolean }> = Array.isArray(p.fallback)
      ? p.fallback
      : p.items || [];
    let cy = y + 34;

    items.slice(0, 5).forEach((item) => {
      ctx.fillStyle = "#101D2A";
      ctx.fillRect(x + 8, cy, w - 16, 26);
      ctx.strokeStyle = "#24394B";
      ctx.strokeRect(x + 8, cy, w - 16, 26);

      // Checkbox
      const isDone = Boolean(item.completed);
      ctx.fillStyle = isDone ? "#5BC69A" : "#24394B";
      ctx.fillRect(x + 14, cy + 6, 14, 14);
      ctx.strokeStyle = isDone ? "#5BC69A" : "#8FA8BC";
      ctx.strokeRect(x + 14, cy + 6, 14, 14);

      if (isDone) {
        ctx.fillStyle = "#08111B";
        ctx.font = "bold 11px monospace";
        ctx.fillText("✓", x + 16, cy + 18);
      }

      ctx.fillStyle = isDone ? "#E7F0F7" : "#8FA8BC";
      ctx.font = "10px monospace";
      ctx.fillText(item.label.slice(0, 36), x + 36, cy + 17);

      cy += 30;
    });
  }

  private drawScheduleList(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "UPCOMING SCHEDULE");
    const items: Array<{ title?: string; name?: string; status?: string }> = Array.isArray(p.fallback)
      ? p.fallback
      : p.items || [];
    let sy = y + 34;

    items.slice(0, 4).forEach((item, idx) => {
      ctx.fillStyle = "#101D2A";
      ctx.fillRect(x + 8, sy, w - 16, 26);

      ctx.fillStyle = "#E5A04B";
      ctx.font = "bold 10px monospace";
      ctx.fillText(`0${idx + 1}`, x + 14, sy + 17);

      ctx.fillStyle = "#E7F0F7";
      ctx.font = "10px monospace";
      const title = item.title || item.name || "Task";
      ctx.fillText(title.slice(0, 26), x + 34, sy + 17);

      const status = item.status || "QUEUED";
      ctx.fillStyle = "#8FA8BC";
      ctx.font = "9px monospace";
      ctx.fillText(status, x + w - 65, sy + 17);

      sy += 30;
    });
  }

  private drawComponentStatus(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "SUBSYSTEM HEALTH");
    const components: Array<{ name?: string; status?: string; details?: string; pwr?: string }> = Array.isArray(p.fallback)
      ? p.fallback
      : p.items || [];
    let cy = y + 34;

    components.slice(0, 5).forEach((c) => {
      ctx.fillStyle = "#101D2A";
      ctx.fillRect(x + 8, cy, w - 16, 26);
      ctx.strokeStyle = "#24394B";
      ctx.strokeRect(x + 8, cy, w - 16, 26);

      const status = (c.status || "ONLINE").toUpperCase();
      const isNom = status === "NOMINAL" || status === "ONLINE" || status === "DEPLOYED" || status === "READY";
      const isWarn = status === "STANDBY" || status === "RECHARGING";
      const color = isNom ? "#5BC69A" : isWarn ? "#F0BD55" : "#F16B66";

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + 18, cy + 13, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#E7F0F7";
      ctx.font = "10px monospace";
      ctx.fillText((c.name || "MODULE").slice(0, 20), x + 28, cy + 17);

      ctx.fillStyle = color;
      ctx.font = "bold 9px monospace";
      ctx.fillText(status, x + w - 75, cy + 17);

      cy += 30;
    });
  }

  private drawResourceBars(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "RESOURCE ALLOCATION");
    const resources: Array<{ name?: string; value?: number; percent?: number; unit?: string; status?: string }> =
      Array.isArray(p.fallback) ? p.fallback : p.resources || [];
    let ry = y + 34;

    resources.slice(0, 4).forEach((res) => {
      const val = res.percent !== undefined ? res.percent : res.value !== undefined ? res.value : 50;
      ctx.fillStyle = "#E7F0F7";
      ctx.font = "10px monospace";
      ctx.fillText((res.name || "RESOURCE").slice(0, 22), x + 10, ry + 11);

      ctx.fillStyle = "#5BC69A";
      ctx.font = "bold 10px monospace";
      ctx.fillText(`${val}${res.unit || "%"}`, x + w - 45, ry + 11);

      // Bar
      ctx.fillStyle = "#101D2A";
      ctx.fillRect(x + 10, ry + 15, w - 20, 9);
      ctx.strokeStyle = "#24394B";
      ctx.strokeRect(x + 10, ry + 15, w - 20, 9);

      ctx.fillStyle = val > 75 ? "#5BC69A" : val > 30 ? "#E5A04B" : "#F16B66";
      ctx.fillRect(x + 11, ry + 16, (w - 22) * (val / 100), 7);

      ry += 30;
    });
  }

  private drawAlertList(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "OPERATIONAL ALERTS");
    const alerts: Array<{ severity?: string; message?: string; status?: string }> = Array.isArray(p.fallback)
      ? p.fallback
      : p.alerts || [];
    let ay = y + 34;

    if (alerts.length === 0) {
      ctx.fillStyle = "#5BC69A";
      ctx.font = "10px monospace";
      ctx.fillText("● NO ACTIVE ALERTS", x + 16, ay + 16);
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
      ctx.fillText((alt.message || "").slice(0, 32), x + 82, ay + 17);

      ay += 30;
    });
  }

  private drawTimeline(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "MISSION TIMELINE");
    const events: Array<{ sol?: number; title?: string; status?: string }> = Array.isArray(p.fallback)
      ? p.fallback
      : p.events || [];
    let ty = y + 34;

    events.slice(0, 5).forEach((ev) => {
      ctx.fillStyle = "#101D2A";
      ctx.fillRect(x + 8, ty, w - 16, 24);

      const status = (ev.status || "SCHEDULED").toUpperCase();
      const isDone = status === "COMPLETED";
      const isCurrent = status === "IN_PROGRESS" || status === "ACTIVE";
      const color = isDone ? "#5BC69A" : isCurrent ? "#E5A04B" : "#8FA8BC";

      ctx.fillStyle = color;
      ctx.font = "bold 9px monospace";
      ctx.fillText(`SOL ${ev.sol !== undefined ? ev.sol : "--"}`, x + 14, ty + 16);

      ctx.fillStyle = isCurrent ? "#E7F0F7" : "#8FA8BC";
      ctx.font = "10px monospace";
      ctx.fillText((ev.title || "").slice(0, 24), x + 65, ty + 16);

      ctx.fillStyle = color;
      ctx.font = "bold 8px monospace";
      ctx.fillText(status, x + w - 75, ty + 16);

      ty += 28;
    });
  }

  private drawStatusMatrix(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "MODULE READINESS MATRIX");
    const modules: Array<{ name?: string; status?: string; note?: string; summary?: string }> = Array.isArray(p.fallback)
      ? p.fallback
      : p.modules || [];
    let my = y + 34;

    modules.slice(0, 4).forEach((mod) => {
      ctx.fillStyle = "#101D2A";
      ctx.fillRect(x + 8, my, w - 16, 26);
      ctx.strokeStyle = "#24394B";
      ctx.strokeRect(x + 8, my, w - 16, 26);

      const isNom = (mod.status || "NOMINAL").toUpperCase() === "NOMINAL";
      ctx.fillStyle = isNom ? "#5BC69A" : "#F0BD55";
      ctx.beginPath();
      ctx.arc(x + 18, my + 13, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#E7F0F7";
      ctx.font = "10px monospace";
      ctx.fillText((mod.name || "MODULE").slice(0, 16), x + 28, my + 17);

      ctx.fillStyle = "#8FA8BC";
      ctx.font = "9px monospace";
      ctx.fillText((mod.summary || mod.note || "").slice(0, 20), x + 135, my + 17);

      ctx.fillStyle = isNom ? "#5BC69A" : "#F0BD55";
      ctx.font = "bold 9px monospace";
      ctx.fillText(mod.status || "NOMINAL", x + w - 65, my + 17);

      my += 30;
    });
  }

  private drawStatusCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "STATUS CARD");
    const data = p.fallback || p.data || {};
    const prio = data.priority || "NORMAL";
    const msg = data.message || "All systems operational.";
    const status = data.status || "ACTIVE";

    ctx.fillStyle = "#101D2A";
    ctx.fillRect(x + 10, y + 34, w - 20, h - 44);
    ctx.strokeStyle = "#24394B";
    ctx.strokeRect(x + 10, y + 34, w - 20, h - 44);

    ctx.fillStyle = "#E5A04B";
    ctx.font = "bold 10px monospace";
    ctx.fillText(`PRIORITY: ${prio}`, x + 20, y + 54);

    ctx.fillStyle = "#5BC69A";
    ctx.font = "bold 10px monospace";
    ctx.fillText(`STATUS: ${status}`, x + 20, y + 72);

    ctx.fillStyle = "#E7F0F7";
    ctx.font = "11px monospace";
    this.drawWrappedText(ctx, msg, x + 20, y + 96, w - 40, 16, 4);
  }

  private drawDataTable(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "DATA MATRIX");
    const rows: any[] = Array.isArray(p.fallback) ? p.fallback : p.rows || [];
    let dy = y + 34;

    rows.slice(0, 4).forEach((row) => {
      ctx.fillStyle = "#101D2A";
      ctx.fillRect(x + 8, dy, w - 16, 24);

      const col1 = row.name || row.channel || row.siteId || row.type || "DATA";
      const col2 = row.target || row.state || row.bearing || row.elevation || "";
      const col3 = row.status || row.strength || row.margin || "OK";

      ctx.fillStyle = "#E7F0F7";
      ctx.font = "10px monospace";
      ctx.fillText(String(col1).slice(0, 16), x + 14, dy + 16);

      ctx.fillStyle = "#8FA8BC";
      ctx.font = "9px monospace";
      ctx.fillText(String(col2).slice(0, 14), x + 130, dy + 16);

      const isNom = String(col3).toUpperCase() === "NOMINAL" || String(col3).toUpperCase() === "ACTIVE";
      ctx.fillStyle = isNom ? "#5BC69A" : "#F0BD55";
      ctx.font = "bold 9px monospace";
      ctx.fillText(String(col3).slice(0, 10), x + w - 70, dy + 16);

      dy += 28;
    });
  }

  private drawEventFeed(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "EVENT FEED");
    const events: Array<{ time?: string; severity?: string; source?: string; message?: string }> = Array.isArray(p.fallback)
      ? p.fallback
      : p.events || [];
    let ey = y + 34;

    events.slice(0, 4).forEach((ev) => {
      ctx.fillStyle = "#8FA8BC";
      ctx.font = "9px monospace";
      ctx.fillText(ev.time || "00:00", x + 10, ey + 12);

      const sev = (ev.severity || "INFO").toUpperCase();
      const color = sev === "CRITICAL" ? "#F16B66" : sev === "WARNING" ? "#F0BD55" : "#5BC69A";
      ctx.fillStyle = color;
      ctx.font = "bold 9px monospace";
      ctx.fillText(`[${sev}]`, x + 50, ey + 12);

      ctx.fillStyle = "#E7F0F7";
      ctx.font = "10px monospace";
      const msg = ev.source ? `${ev.source}: ${ev.message || ""}` : ev.message || "";
      ctx.fillText(msg.slice(0, 32), x + 105, ey + 12);

      ey += 24;
    });
  }

  private drawTerrainMinimap(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "SURFACE RADAR & TOPOGRAPHY");
    const mapX = x + 12;
    const mapY = y + 32;
    const mapW = w - 24;
    const mapH = h - 44;

    // Map background
    ctx.fillStyle = "#061019";
    ctx.fillRect(mapX, mapY, mapW, mapH);
    ctx.strokeStyle = "#172A3A";
    ctx.strokeRect(mapX, mapY, mapW, mapH);

    // Grid coordinates
    ctx.strokeStyle = "#102334";
    ctx.lineWidth = 1;
    const step = 28;
    for (let gx = mapX; gx < mapX + mapW; gx += step) {
      ctx.beginPath();
      ctx.moveTo(gx, mapY);
      ctx.lineTo(gx, mapY + mapH);
      ctx.stroke();
    }
    for (let gy = mapY; gy < mapY + mapH; gy += step) {
      ctx.beginPath();
      ctx.moveTo(mapX, gy);
      ctx.lineTo(mapX + mapW, gy);
      ctx.stroke();
    }

    // Topographic contours
    ctx.strokeStyle = "#1C3C56";
    ctx.lineWidth = 1.2;
    const cx = mapX + mapW / 2;
    const cy = mapY + mapH / 2;
    [30, 55, 80].forEach((r) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Rover path
    ctx.strokeStyle = "#E5A04B";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx - 60, cy + 40);
    ctx.lineTo(cx - 20, cy + 10);
    ctx.lineTo(cx + 30, cy - 25);
    ctx.stroke();
    ctx.setLineDash([]);

    // Outpost Base Target
    ctx.fillStyle = "#5BC69A";
    ctx.beginPath();
    ctx.arc(cx - 60, cy + 40, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#E7F0F7";
    ctx.font = "8px monospace";
    ctx.fillText("BASE", cx - 72, cy + 54);

    // Current Drone Position
    ctx.fillStyle = "#E5A04B";
    ctx.beginPath();
    ctx.arc(cx + 30, cy - 25, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText("DRONE-1", cx + 38, cy - 22);

    // Compass
    ctx.fillStyle = "#8FA8BC";
    ctx.font = "bold 9px monospace";
    ctx.fillText("N ▲", mapX + mapW - 24, mapY + 16);
  }

  private drawFallbackPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "DIAGNOSTIC PANEL");
    ctx.fillStyle = "#8FA8BC";
    ctx.font = "10px monospace";
    ctx.fillText(`TYPE: ${p.type}`, x + 16, y + 42);
    ctx.fillText("Simulated telemetry standby", x + 16, y + 62);
  }

  // =========================================================================
  // SHARED UI PRIMITIVES
  // =========================================================================

  private drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.strokeStyle = "#101D2A";
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

  private drawHeader(ctx: CanvasRenderingContext2D, w: number, title: string, subtitle: string, status: string): void {
    ctx.fillStyle = "#101D2A";
    ctx.fillRect(0, 0, w, 52);
    ctx.fillStyle = "#E5A04B";
    ctx.fillRect(0, 50, w, 2);

    ctx.fillStyle = "#E7F0F7";
    ctx.font = "bold 15px monospace";
    ctx.fillText(title.toUpperCase(), 20, 26);

    ctx.fillStyle = "#8FA8BC";
    ctx.font = "10px monospace";
    ctx.fillText(subtitle.toUpperCase(), 20, 42);

    // Sol indicator
    ctx.fillStyle = "#E5A04B";
    ctx.font = "bold 11px monospace";
    ctx.fillText(`SOL ${this.missionSol}`, w - 170, 26);

    ctx.fillStyle = status === "ACTIVE" || status === "MONITORING" ? "#5BC69A" : "#F0BD55";
    ctx.font = "bold 10px monospace";
    ctx.fillText(`● ${status}`, w - 90, 26);

    // Disclaimer in header
    ctx.fillStyle = "#F0BD55";
    ctx.font = "8px monospace";
    ctx.fillText("SIMULATED MISSION DATA - NOT LIVE NASA TELEMETRY", w - 310, 42);
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
      ctx.fillStyle = "#101D2A";
      ctx.fillRect(cx, y, cardW, h);
      ctx.strokeStyle = "#24394B";
      ctx.strokeRect(cx, y, cardW, h);

      ctx.fillStyle = "#8FA8BC";
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
    ctx.fillStyle = "#101D2A";
    ctx.fillRect(x, y, w, 24);
    ctx.strokeStyle = "#24394B";
    ctx.strokeRect(x, y, w, 24);

    ctx.fillStyle = "#E5A04B";
    ctx.fillRect(x, y, 3, 24);

    ctx.fillStyle = "#E7F0F7";
    ctx.font = "bold 10px monospace";
    ctx.fillText(title.toUpperCase(), x + 10, y + 16);
  }

  private drawFooter(ctx: CanvasRenderingContext2D, w: number, h: number, leftText: string): void {
    ctx.fillStyle = "#101D2A";
    ctx.fillRect(0, h - 26, w, 26);
    ctx.fillStyle = "#24394B";
    ctx.fillRect(0, h - 26, w, 1);

    ctx.fillStyle = "#8FA8BC";
    ctx.font = "9px monospace";
    ctx.fillText(leftText, 20, h - 10);

    ctx.fillStyle = "#F0BD55";
    ctx.font = "bold 9px monospace";
    ctx.fillText("SIMULATED DEMO ONLY", w - 160, h - 10);
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

  public getActiveBindings(): ReadonlyArray<MissionControlScreenBinding> {
    return this.activeBindings;
  }

  public getBindings(): ReadonlyArray<MissionControlScreenBinding> {
    return this.activeBindings;
  }

  public getScreenConfig(screenIdOrMeshName: string): MissionControlScreenItem | undefined {
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
