/**
 * PHOBOSIA — Research / Science Lab Physical Screen Rendering System
 *
 * Dedicated modular screen renderer for the 6 physical 3D displays in the Research / Science Lab:
 * 1. ResearchMonitoring_MainScreen      -> ResearchMonitoringMainRenderer
 * 2. ResearchMonitoring_SystemScreen    -> ResearchMonitoringSystemRenderer
 * 3. SeedStorage_InventoryScreen        -> SeedStorageInventoryRenderer
 * 4. WaterNutrition_MixingScreen        -> WaterNutritionMixingRenderer
 * 5. WaterNutrition_QualityScreen       -> WaterNutritionQualityRenderer
 * 6. Cultivation_EnvironmentScreen      -> CultivationEnvironmentRenderer
 *
 * Driven by `src/jsons/Screens/research-zone-screens.json`.
 * Implements 18 specialized scientific panel types:
 * STATUS_MATRIX, DATA_TABLE, LINE_CHART, MULTI_LINE_CHART, BAR_CHART,
 * COMPONENT_STATUS, EVENT_FEED, HEALTH_GRID, WORKFLOW_GRAPH, RACK_HEATMAP,
 * SCHEDULE_LIST, ALERT_LIST, PROCESS_STEPS, RESOURCE_BARS, METRIC_GRID,
 * CHECKLIST, CHAMBER_GRID, TIMELINE.
 *
 * All numeric and scientific values are simulated demonstrations for PHOBOSIA.
 * Displays mandatory disclaimer: "SIMULATED RESEARCH DATA - NOT LIVE NASA TELEMETRY".
 */

import * as THREE from "three";
import { reprojectPlanarUVs } from "./Collision";

export interface ResearchScreenPanel {
  id?: string;
  title?: string;
  type: string;
  [key: string]: any;
}

export interface ResearchScreenItem {
  screenId: string;
  meshName: string;
  rendererId: string;
  subsystem?: string;
  dimensionsMeters?: {
    x?: number | null;
    y?: number | null;
    z?: number | null;
    dimensionStatus?: string;
  };
  orientation?: {
    mirrorHorizontal?: boolean;
    mirrorVertical?: boolean;
    rotationDegrees?: number;
    uAxis?: "x" | "y" | "z";
    vAxis?: "x" | "y" | "z";
  };
  purpose?: string;
  layout?: {
    type?: string;
    columns?: number;
    rows?: number;
    primaryPanel?: string;
    density?: string;
  };
  content: {
    header?: {
      title?: string;
      subtitle?: string;
      zone?: string;
      dataMode?: string;
    };
    primaryMetrics?: Array<{
      id?: string;
      label?: string;
      value?: string | number;
      unit?: string;
      status?: string;
    }>;
    panels?: ResearchScreenPanel[];
    footer?: {
      leftText?: string;
      centerText?: string;
      rightText?: string;
      lastCalibrationSol?: number;
      telemetryQuality?: string;
    };
    [key: string]: any;
  };
  [key: string]: any;
}

export interface ResearchScreenDataRoot {
  project?: string;
  zone?: string;
  configVersion?: string;
  description?: string;
  dataPolicy?: any;
  rendering?: any;
  visualTheme?: any;
  globalLayout?: any;
  orientationDefaults?: any;
  screens: ResearchScreenItem[];
  [key: string]: any;
}

export interface ResearchScreenBinding {
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

// Verified mapping for planar projection for the 6 Research screens
const VERIFIED_RESEARCH_MAPPINGS: Record<
  string,
  { uAxis: "x" | "y" | "z"; vAxis: "x" | "y" | "z"; flipU: boolean; flipV: boolean; aspect: number }
> = {
  ResearchMonitoring_MainScreen: { uAxis: "z", vAxis: "x", flipU: true, flipV: false, aspect: 1.97 },
  ResearchMonitoring_SystemScreen: { uAxis: "z", vAxis: "x", flipU: true, flipV: false, aspect: 1.97 },
  SeedStorage_InventoryScreen: { uAxis: "z", vAxis: "x", flipU: false, flipV: false, aspect: 0.44 },
  WaterNutrition_MixingScreen: { uAxis: "z", vAxis: "x", flipU: true, flipV: false, aspect: 1.69 },
  WaterNutrition_QualityScreen: { uAxis: "x", vAxis: "y", flipU: false, flipV: false, aspect: 1.44 },
  Cultivation_EnvironmentScreen: { uAxis: "z", vAxis: "y", flipU: true, flipV: false, aspect: 0.48 }
};

// Dynamic resolver for Node CommonJS tests vs Next.js Webpack bundler
function loadResearchScreenData(): ResearchScreenDataRoot {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("../jsons/Screens/research-zone-screens.json");
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return eval("require")("../src/jsons/Screens/research-zone-screens.json");
    } catch {
      return {
        project: "PHOBOSIA",
        zone: "RESEARCH_SCIENCE_LAB",
        screens: []
      };
    }
  }
}

const rawResearchDataJson = loadResearchScreenData();

export class ResearchScreenRenderer {
  private rawConfig: ResearchScreenDataRoot;
  private screensMap = new Map<string, ResearchScreenItem>();
  private activeBindings: ResearchScreenBinding[] = [];
  private missionDay: number = 1;

  constructor(customConfig?: ResearchScreenDataRoot) {
    this.rawConfig = customConfig
      ? JSON.parse(JSON.stringify(customConfig))
      : JSON.parse(JSON.stringify(rawResearchDataJson));
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
   * Primary entry point: Scans the Science Lab GLB scene and binds canvas textures to the 6 screens.
   */
  public renderResearchLabScreens(model: THREE.Group, missionState?: { currentDay?: number }): void {
    this.attachToScience(model, missionState);
  }

  /**
   * Alias conforming to outpost convention (attachToHabitat, attachToEngineering, attachToScience).
   */
  public attachToScience(model: THREE.Group, missionState?: { currentDay?: number }): void {
    this.dispose();

    if (missionState?.currentDay) {
      this.missionDay = missionState.currentDay;
    }

    const targetScreens = this.rawConfig.screens || [];

    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;

      const rawName = mesh.name || "";
      const trimmedName = rawName.trim();
      const cleanName = trimmedName.replace(/\./g, "");

      // Match against configured screen mesh names (tolerant of leading spaces e.g. " Cultivation_EnvironmentScreen")
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
  private bindScreen(mesh: THREE.Mesh, screenConf: ResearchScreenItem): void {
    const meshKey = screenConf.meshName.trim();
    const fallback = VERIFIED_RESEARCH_MAPPINGS[meshKey] || {
      uAxis: "x" as const,
      vAxis: "y" as const,
      flipU: false,
      flipV: false,
      aspect: 1.5
    };

    const orientation = screenConf.orientation || {};
    const flipU = orientation.mirrorHorizontal !== undefined ? Boolean(orientation.mirrorHorizontal) : fallback.flipU;
    const flipV = orientation.mirrorVertical !== undefined ? Boolean(orientation.mirrorVertical) : fallback.flipV;
    const rotation = (orientation.rotationDegrees || 0) as 0 | 90 | 180 | 270;
    const uAxis = orientation.uAxis || fallback.uAxis;
    const vAxis = orientation.vAxis || fallback.vAxis;

    // Reproject planar UVs
    reprojectPlanarUVs(mesh.geometry, { uAxis, vAxis, flipU, flipV, rotation });

    const aspect = fallback.aspect;
    let canvasWidth = 1024;
    let canvasHeight = 640;

    if (aspect < 0.6) {
      // Tall portrait (SeedStorage, Cultivation)
      canvasWidth = 512;
      canvasHeight = 1024;
    } else if (aspect > 1.8) {
      // Wide panoramic (ResearchMonitoring)
      canvasWidth = 1024;
      canvasHeight = 512;
    } else {
      // Standard landscape (WaterNutrition)
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
      refreshIntervalMs: 5000,
      lastRenderTime: 0
    });
  }

  /**
   * Renders all active screen bindings.
   */
  public renderAll(missionState?: { currentDay?: number }): void {
    if (missionState?.currentDay) {
      this.missionDay = missionState.currentDay;
    }

    for (const binding of this.activeBindings) {
      this.renderBinding(binding);
      binding.texture.needsUpdate = true;
    }
  }

  /**
   * Dispatches rendering according to screen rendererId.
   */
  private renderBinding(binding: ResearchScreenBinding): void {
    const { ctx, width, height, rendererId, meshName } = binding;
    const screenConf = this.screensMap.get(meshName.trim()) || this.screensMap.get(binding.screenId);
    if (!screenConf) return;

    const content = screenConf.content || {};

    // Background & HUD Grid
    ctx.fillStyle = "#07111F";
    ctx.fillRect(0, 0, width, height);
    this.drawGrid(ctx, width, height);

    // Header & Disclaimer
    const headerTitle = content.header?.title || screenConf.subsystem || "RESEARCH LAB";
    const headerSub = content.header?.subtitle || "MARS SCIENCE OPERATIONS";
    this.drawHeader(ctx, width, headerTitle, headerSub);

    // Primary metrics row (if available)
    let contentY = 64;
    if (content.primaryMetrics && content.primaryMetrics.length > 0) {
      this.drawPrimaryMetrics(ctx, 20, contentY, width - 40, 44, content.primaryMetrics);
      contentY += 56;
    }

    const availableHeight = height - contentY - 36;

    // Render panels based on layout
    switch (rendererId) {
      case "ResearchMonitoringMainRenderer":
        this.renderMonitoringMainPanels(ctx, content, 20, contentY, width - 40, availableHeight);
        break;
      case "ResearchMonitoringSystemRenderer":
        this.renderMonitoringSystemPanels(ctx, content, 20, contentY, width - 40, availableHeight);
        break;
      case "SeedStorageInventoryRenderer":
        this.renderSeedStoragePanels(ctx, content, 20, contentY, width - 40, availableHeight);
        break;
      case "WaterNutritionMixingRenderer":
        this.renderWaterMixingPanels(ctx, content, 20, contentY, width - 40, availableHeight);
        break;
      case "WaterNutritionQualityRenderer":
        this.renderWaterQualityPanels(ctx, content, 20, contentY, width - 40, availableHeight);
        break;
      case "CultivationEnvironmentRenderer":
        this.renderCultivationPanels(ctx, content, 20, contentY, width - 40, availableHeight);
        break;
      default:
        this.renderGenericPanels(ctx, content, 20, contentY, width - 40, availableHeight);
        break;
    }

    // Footer with mandatory disclaimer
    this.drawFooter(ctx, width, height, content.footer?.leftText || "RESEARCH TELEMETRY");

    // Outer cybernetic border brackets
    this.drawBrackets(ctx, width, height, "#36C5E8");
  }

  // =========================================================================
  // DEDICATED SCREEN LAYOUT RENDERERS
  // =========================================================================

  private renderMonitoringMainPanels(
    ctx: CanvasRenderingContext2D,
    content: any,
    x: number,
    y: number,
    w: number,
    h: number
  ): void {
    const panels = content.panels || [];
    const colW = Math.floor((w - 20) / 2);
    const leftX = x;
    const rightX = x + colW + 20;
    const rowH = Math.floor((h - 16) / 2);

    // Top Left: STATUS_MATRIX (Research Status)
    const statusPanel = panels.find((p: any) => p.type === "STATUS_MATRIX") || panels[0];
    if (statusPanel) this.drawStatusMatrix(ctx, leftX, y, colW, rowH, statusPanel);

    // Top Right: LINE_CHART (Research Activity)
    const linePanel = panels.find((p: any) => p.type === "LINE_CHART") || panels[2];
    if (linePanel) this.drawLineChart(ctx, rightX, y, colW, rowH, linePanel, "#36C5E8");

    // Bottom Left: DATA_TABLE (Sample Analysis Queue)
    const tablePanel = panels.find((p: any) => p.type === "DATA_TABLE") || panels[1];
    if (tablePanel) this.drawDataTable(ctx, leftX, y + rowH + 16, colW, rowH, tablePanel);

    // Bottom Right: COMPONENT_STATUS / EVENT_FEED
    const compPanel = panels.find((p: any) => p.type === "COMPONENT_STATUS") || panels[3];
    if (compPanel) this.drawComponentStatus(ctx, rightX, y + rowH + 16, colW, rowH, compPanel);
  }

  private renderMonitoringSystemPanels(
    ctx: CanvasRenderingContext2D,
    content: any,
    x: number,
    y: number,
    w: number,
    h: number
  ): void {
    const panels = content.panels || [];
    const colW = Math.floor((w - 20) / 2);
    const leftX = x;
    const rightX = x + colW + 20;
    const rowH = Math.floor((h - 16) / 2);

    // Top Left: WORKFLOW_GRAPH (Experiment Workflow)
    const workflowPanel = panels.find((p: any) => p.type === "WORKFLOW_GRAPH") || panels[0];
    if (workflowPanel) this.drawWorkflowGraph(ctx, leftX, y, colW, rowH, workflowPanel);

    // Top Right: LINE_CHART (Data Throughput)
    const chartPanel = panels.find((p: any) => p.type === "LINE_CHART") || panels[2];
    if (chartPanel) this.drawLineChart(ctx, rightX, y, colW, rowH, chartPanel, "#5B9DFF");

    // Bottom Left: HEALTH_GRID (Subsystem Health)
    const healthPanel = panels.find((p: any) => p.type === "HEALTH_GRID") || panels[1];
    if (healthPanel) this.drawHealthGrid(ctx, leftX, y + rowH + 16, colW, rowH, healthPanel);

    // Bottom Right: EVENT_FEED (System Events)
    const eventPanel = panels.find((p: any) => p.type === "EVENT_FEED") || panels[4];
    if (eventPanel) this.drawEventFeed(ctx, rightX, y + rowH + 16, colW, rowH, eventPanel);
  }

  private renderSeedStoragePanels(
    ctx: CanvasRenderingContext2D,
    content: any,
    x: number,
    y: number,
    w: number,
    h: number
  ): void {
    // Tall portrait layout (w: 512, h: ~850)
    const panels = content.panels || [];
    const panelH = Math.floor((h - 24) / 4);

    // 1. DATA_TABLE (Seed Lot Inventory)
    const invPanel = panels.find((p: any) => p.type === "DATA_TABLE") || panels[0];
    if (invPanel) this.drawDataTable(ctx, x, y, w, panelH + 15, invPanel);

    // 2. RACK_HEATMAP (Storage Rack Map)
    const heatPanel = panels.find((p: any) => p.type === "RACK_HEATMAP") || panels[1];
    if (heatPanel) this.drawRackHeatmap(ctx, x, y + panelH + 20, w, panelH - 10, heatPanel);

    // 3. SCHEDULE_LIST (Viability Tests)
    const schedPanel = panels.find((p: any) => p.type === "SCHEDULE_LIST") || panels[3];
    if (schedPanel) this.drawScheduleList(ctx, x, y + (panelH + 12) * 2, w, panelH - 10, schedPanel);

    // 4. ALERT_LIST (Preservation Alerts)
    const alertPanel = panels.find((p: any) => p.type === "ALERT_LIST") || panels[4];
    if (alertPanel) this.drawAlertList(ctx, x, y + (panelH + 12) * 3, w, panelH, alertPanel);
  }

  private renderWaterMixingPanels(
    ctx: CanvasRenderingContext2D,
    content: any,
    x: number,
    y: number,
    w: number,
    h: number
  ): void {
    const panels = content.panels || [];
    const colW = Math.floor((w - 20) / 2);
    const leftX = x;
    const rightX = x + colW + 20;
    const rowH = Math.floor((h - 16) / 2);

    // Top Left: PROCESS_STEPS (Mixing Sequence)
    const stepPanel = panels.find((p: any) => p.type === "PROCESS_STEPS") || panels[0];
    if (stepPanel) this.drawProcessSteps(ctx, leftX, y, colW, rowH, stepPanel);

    // Top Right: MULTI_LINE_CHART (Solution Condition Trend)
    const trendPanel = panels.find((p: any) => p.type === "MULTI_LINE_CHART") || panels[2];
    if (trendPanel) this.drawMultiLineChart(ctx, rightX, y, colW, rowH, trendPanel);

    // Bottom Left: RESOURCE_BARS (Resource Balance)
    const resPanel = panels.find((p: any) => p.type === "RESOURCE_BARS") || panels[4];
    if (resPanel) this.drawResourceBars(ctx, leftX, y + rowH + 16, colW, rowH, resPanel);

    // Bottom Right: COMPONENT_STATUS (Mixing Equipment)
    const eqPanel = panels.find((p: any) => p.type === "COMPONENT_STATUS") || panels[3];
    if (eqPanel) this.drawComponentStatus(ctx, rightX, y + rowH + 16, colW, rowH, eqPanel);
  }

  private renderWaterQualityPanels(
    ctx: CanvasRenderingContext2D,
    content: any,
    x: number,
    y: number,
    w: number,
    h: number
  ): void {
    const panels = content.panels || [];
    const colW = Math.floor((w - 20) / 2);
    const leftX = x;
    const rightX = x + colW + 20;
    const rowH = Math.floor((h - 16) / 2);

    // Top Left: METRIC_GRID (Quality Indicators)
    const metricPanel = panels.find((p: any) => p.type === "METRIC_GRID") || panels[0];
    if (metricPanel) this.drawMetricGrid(ctx, leftX, y, colW, rowH, metricPanel);

    // Top Right: LINE_CHART (Quality History)
    const histPanel = panels.find((p: any) => p.type === "LINE_CHART") || panels[2];
    if (histPanel) this.drawLineChart(ctx, rightX, y, colW, rowH, histPanel, "#50BFE8");

    // Bottom Left: PROCESS_STEPS (Filtration Stages)
    const filterPanel = panels.find((p: any) => p.type === "PROCESS_STEPS") || panels[1];
    if (filterPanel) this.drawProcessSteps(ctx, leftX, y + rowH + 16, colW, rowH, filterPanel);

    // Bottom Right: CHECKLIST (Quality Review Checklist)
    const checkPanel = panels.find((p: any) => p.type === "CHECKLIST") || panels[4];
    if (checkPanel) this.drawChecklist(ctx, rightX, y + rowH + 16, colW, rowH, checkPanel);
  }

  private renderCultivationPanels(
    ctx: CanvasRenderingContext2D,
    content: any,
    x: number,
    y: number,
    w: number,
    h: number
  ): void {
    // Tall portrait layout (w: 512, h: ~850)
    const panels = content.panels || [];
    const panelH = Math.floor((h - 30) / 4);

    // 1. CHAMBER_GRID (Growth Chamber Overview)
    const chambPanel = panels.find((p: any) => p.type === "CHAMBER_GRID") || panels[0];
    if (chambPanel) this.drawChamberGrid(ctx, x, y, w, panelH + 20, chambPanel);

    // 2. TIMELINE (Lighting Cycle)
    const timePanel = panels.find((p: any) => p.type === "TIMELINE") || panels[2];
    if (timePanel) this.drawTimeline(ctx, x, y + panelH + 26, w, panelH - 20, timePanel);

    // 3. BAR_CHART (Control vs Experimental Group)
    const barPanel = panels.find((p: any) => p.type === "BAR_CHART") || panels[6];
    if (barPanel) this.drawBarChart(ctx, x, y + (panelH + 14) * 2, w, panelH + 10, barPanel);

    // 4. COMPONENT_STATUS / ALERT_LIST (Irrigation Status & Cultivation Alerts)
    const irrPanel = panels.find((p: any) => p.type === "COMPONENT_STATUS") || panels[4];
    if (irrPanel) this.drawComponentStatus(ctx, x, y + (panelH + 14) * 3 + 10, w, panelH - 10, irrPanel);
  }

  private renderGenericPanels(
    ctx: CanvasRenderingContext2D,
    content: any,
    x: number,
    y: number,
    w: number,
    h: number
  ): void {
    ctx.fillStyle = "#102438";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#29465E";
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = "#E8F1FA";
    ctx.font = "bold 14px monospace";
    ctx.fillText("SCIENTIFIC TELEMETRY SYSTEM", x + 16, y + 30);
  }

  // =========================================================================
  // 18 SCIENTIFIC PANEL IMPLEMENTATIONS
  // =========================================================================

  private drawStatusMatrix(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "STATUS MATRIX");
    const items = p.matrixItems || p.items || [];
    const cols = 2;
    const cardW = Math.floor((w - 28) / cols);
    const cardH = 34;
    let py = y + 36;

    items.slice(0, 6).forEach((item: any, idx: number) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cx = x + 10 + col * (cardW + 8);
      const cy = py + row * (cardH + 6);

      ctx.fillStyle = "#0B1B2B";
      ctx.fillRect(cx, cy, cardW, cardH);
      ctx.strokeStyle = "#1B354B";
      ctx.strokeRect(cx, cy, cardW, cardH);

      const status = (item.status || "NORMAL").toUpperCase();
      const dotColor = status === "NORMAL" || status === "NOMINAL" ? "#53D6A0" : status === "WARNING" ? "#FFB547" : "#FF5353";
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(cx + 10, cy + cardH / 2, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#E8F1FA";
      ctx.font = "11px monospace";
      ctx.fillText(item.label || item.name || "", cx + 20, cy + 21);

      ctx.fillStyle = dotColor;
      ctx.font = "bold 10px monospace";
      ctx.fillText(String(item.value || status), cx + cardW - 65, cy + 21);
    });
  }

  private drawDataTable(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "DATA TABLE");
    const rows = p.rows || p.items || [];
    const cols = p.columns || ["ID", "ITEM", "VALUE", "STATUS"];
    const colStep = (w - 24) / cols.length;

    // Header row
    ctx.fillStyle = "#152D42";
    ctx.fillRect(x + 8, y + 32, w - 16, 20);
    ctx.fillStyle = "#36C5E8";
    ctx.font = "bold 10px monospace";
    cols.forEach((col: string, idx: number) => {
      ctx.fillText(col.toUpperCase(), x + 12 + idx * colStep, y + 46);
    });

    let rowY = y + 60;
    rows.slice(0, 5).forEach((row: any) => {
      ctx.fillStyle = "#0B1B2B";
      ctx.fillRect(x + 8, rowY, w - 16, 22);

      ctx.fillStyle = "#E8F1FA";
      ctx.font = "10px monospace";

      if (Array.isArray(row)) {
        row.forEach((val, idx) => ctx.fillText(String(val), x + 12 + idx * colStep, rowY + 15));
      } else {
        const vals = Object.values(row);
        vals.slice(0, cols.length).forEach((val, idx) => ctx.fillText(String(val), x + 12 + idx * colStep, rowY + 15));
      }
      rowY += 26;
    });
  }

  private drawLineChart(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    p: any,
    color: string
  ): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "TREND");
    const points: number[] = p.data || p.sampleValues || [20, 25, 23, 28, 30, 29, 32];
    if (points.length < 2) return;

    const graphTop = y + 40;
    const graphH = h - 55;
    const minVal = Math.min(...points) * 0.95;
    const maxVal = Math.max(...points) * 1.05;
    const range = Math.max(maxVal - minVal, 1);
    const stepX = (w - 32) / (points.length - 1);

    // Gradient fill under curve
    ctx.fillStyle = color + "22";
    ctx.beginPath();
    ctx.moveTo(x + 16, graphTop + graphH);
    points.forEach((val, idx) => {
      const px = x + 16 + idx * stepX;
      const py = graphTop + graphH - ((val - minVal) / range) * graphH;
      ctx.lineTo(px, py);
    });
    ctx.lineTo(x + 16 + (points.length - 1) * stepX, graphTop + graphH);
    ctx.closePath();
    ctx.fill();

    // Stroke
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((val, idx) => {
      const px = x + 16 + idx * stepX;
      const py = graphTop + graphH - ((val - minVal) / range) * graphH;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Min & Max indicators
    ctx.fillStyle = "#91A6BC";
    ctx.font = "9px monospace";
    ctx.fillText(`MAX: ${maxVal.toFixed(1)}`, x + 16, graphTop + 10);
    ctx.fillText(`MIN: ${minVal.toFixed(1)}`, x + 16, graphTop + graphH - 4);
  }

  private drawMultiLineChart(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "MULTI-SERIES TREND");
    const series = p.series || [
      { name: "TEMP", color: "#FFB547", data: [20, 21, 22, 21, 23] },
      { name: "pH", color: "#50BFE8", data: [6.8, 6.9, 7.0, 6.9, 7.1] },
      { name: "EC", color: "#53D6A0", data: [1.8, 1.9, 1.8, 2.0, 1.9] }
    ];

    let legX = x + 16;
    series.forEach((s: any) => {
      ctx.fillStyle = s.color || "#36C5E8";
      ctx.fillRect(legX, y + 30, 8, 8);
      ctx.fillStyle = "#E8F1FA";
      ctx.font = "9px monospace";
      ctx.fillText(s.name || "", legX + 12, y + 38);
      legX += 70;
    });

    const graphTop = y + 46;
    const graphH = h - 60;

    series.forEach((s: any) => {
      const pts: number[] = s.data || [];
      if (pts.length < 2) return;
      const minVal = Math.min(...pts) * 0.95;
      const maxVal = Math.max(...pts) * 1.05;
      const range = Math.max(maxVal - minVal, 1);
      const stepX = (w - 32) / (pts.length - 1);

      ctx.strokeStyle = s.color || "#36C5E8";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      pts.forEach((val, idx) => {
        const px = x + 16 + idx * stepX;
        const py = graphTop + graphH - ((val - minVal) / range) * graphH;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    });
  }

  private drawBarChart(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "COMPARISON");
    const groups = p.groups || p.data || [
      { label: "GERMINATION", control: 84, experimental: 92 },
      { label: "BIOMASS", control: 72, experimental: 88 },
      { label: "CANOPY", control: 65, experimental: 78 }
    ];

    const chartTop = y + 36;
    const chartH = h - 60;
    const barStep = (w - 32) / groups.length;

    groups.forEach((g: any, idx: number) => {
      const bx = x + 16 + idx * barStep;
      const bw = Math.floor(barStep * 0.35);

      const ctrlVal = g.control || g.valueA || 50;
      const expVal = g.experimental || g.valueB || 70;

      const ctrlH = (ctrlVal / 100) * chartH;
      const expH = (expVal / 100) * chartH;

      // Control bar
      ctx.fillStyle = "#91A6BC";
      ctx.fillRect(bx, chartTop + chartH - ctrlH, bw, ctrlH);

      // Experimental bar
      ctx.fillStyle = "#53D6A0";
      ctx.fillRect(bx + bw + 4, chartTop + chartH - expH, bw, expH);

      // Label
      ctx.fillStyle = "#E8F1FA";
      ctx.font = "9px monospace";
      ctx.fillText((g.label || "").slice(0, 8), bx, chartTop + chartH + 14);
    });
  }

  private drawComponentStatus(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "EQUIPMENT STATUS");
    const components = p.components || p.items || [];
    let cy = y + 34;

    components.slice(0, 5).forEach((c: any) => {
      ctx.fillStyle = "#0B1B2B";
      ctx.fillRect(x + 10, cy, w - 20, 28);
      ctx.strokeStyle = "#1B354B";
      ctx.strokeRect(x + 10, cy, w - 20, 28);

      const status = (c.status || "NORMAL").toUpperCase();
      const isOk = status === "NORMAL" || status === "READY" || status === "ONLINE";
      ctx.fillStyle = isOk ? "#53D6A0" : "#FFB547";
      ctx.beginPath();
      ctx.arc(x + 22, cy + 14, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#E8F1FA";
      ctx.font = "11px monospace";
      ctx.fillText(c.name || c.label || "COMPONENT", x + 34, cy + 18);

      ctx.fillStyle = isOk ? "#53D6A0" : "#FFB547";
      ctx.font = "bold 10px monospace";
      ctx.fillText(String(c.value || c.health || status), x + w - 75, cy + 18);

      cy += 32;
    });
  }

  private drawEventFeed(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "EVENT FEED");
    const events = p.events || p.log || [];
    let ey = y + 36;

    events.slice(0, 5).forEach((ev: any) => {
      ctx.fillStyle = "#91A6BC";
      ctx.font = "10px monospace";
      ctx.fillText(ev.timestamp || ev.time || "SOL-004", x + 12, ey + 12);

      const level = ev.level || "INFO";
      ctx.fillStyle = level === "WARN" ? "#FFB547" : level === "ERROR" ? "#FF5353" : "#53D6A0";
      ctx.fillText(`[${level}]`, x + 72, ey + 12);

      ctx.fillStyle = "#E8F1FA";
      ctx.fillText(ev.message || ev.text || "", x + 125, ey + 12);

      ey += 24;
    });
  }

  private drawHealthGrid(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "SYSTEM HEALTH GRID");
    const items = p.subsystems || p.items || [];
    let hy = y + 34;

    items.slice(0, 4).forEach((s: any) => {
      ctx.fillStyle = "#0B1B2B";
      ctx.fillRect(x + 10, hy, w - 20, 30);
      ctx.strokeStyle = "#1B354B";
      ctx.strokeRect(x + 10, hy, w - 20, 30);

      ctx.fillStyle = "#E8F1FA";
      ctx.font = "11px monospace";
      ctx.fillText(s.name || s.label || "", x + 20, hy + 20);

      const isNom = (s.status || "NOMINAL").toUpperCase() === "NOMINAL";
      ctx.fillStyle = isNom ? "#53D6A0" : "#FFB547";
      ctx.font = "bold 10px monospace";
      ctx.fillText(s.status || "OK", x + w - 75, hy + 20);

      hy += 36;
    });
  }

  private drawWorkflowGraph(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "EXPERIMENT WORKFLOW");
    const stages = p.stages || ["SAMPLE INTAKE", "MASS SPECTROMETRY", "SPECTRAL ANALYSIS", "ARCHIVE"];
    const stepW = Math.floor((w - 32) / stages.length);
    const boxH = 40;
    const boxY = y + h / 2 - 10;

    stages.forEach((st: any, idx: number) => {
      const bx = x + 16 + idx * stepW;
      const bwidth = stepW - 12;

      ctx.fillStyle = "#152D42";
      ctx.fillRect(bx, boxY, bwidth, boxH);
      ctx.strokeStyle = "#36C5E8";
      ctx.strokeRect(bx, boxY, bwidth, boxH);

      ctx.fillStyle = "#53D6A0";
      ctx.font = "bold 10px monospace";
      ctx.fillText(`0${idx + 1}`, bx + 6, boxY + 16);

      ctx.fillStyle = "#E8F1FA";
      ctx.font = "9px monospace";
      const name = typeof st === "string" ? st : st.name || "";
      ctx.fillText(name.slice(0, 10), bx + 6, boxY + 30);

      if (idx < stages.length - 1) {
        ctx.fillStyle = "#36C5E8";
        ctx.fillText("→", bx + bwidth + 2, boxY + 24);
      }
    });
  }

  private drawRackHeatmap(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "RACK MAP");
    const racks = p.racks || p.slots || [
      [1, 1, 0, 1, 1],
      [1, 0, 1, 1, 0],
      [1, 1, 1, 0, 1],
      [0, 1, 1, 1, 1]
    ];
    const rows = racks.length;
    const cols = racks[0].length;
    const cellW = Math.floor((w - 32) / cols);
    const cellH = Math.floor((h - 50) / rows);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = x + 16 + c * cellW;
        const cy = y + 36 + r * cellH;
        const occ = racks[r][c];

        ctx.fillStyle = occ ? "#53D6A0" : "#102438";
        ctx.fillRect(cx, cy, cellW - 4, cellH - 4);
        ctx.strokeStyle = "#29465E";
        ctx.strokeRect(cx, cy, cellW - 4, cellH - 4);

        ctx.fillStyle = occ ? "#07111F" : "#536B83";
        ctx.font = "9px monospace";
        ctx.fillText(`${r + 1}-${c + 1}`, cx + 4, cy + cellH / 2 + 3);
      }
    }
  }

  private drawScheduleList(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "SCHEDULE");
    const items = p.schedule || p.tests || [];
    let sy = y + 36;

    items.slice(0, 4).forEach((item: any) => {
      ctx.fillStyle = "#0B1B2B";
      ctx.fillRect(x + 10, sy, w - 20, 24);

      ctx.fillStyle = "#36C5E8";
      ctx.font = "10px monospace";
      ctx.fillText(item.date || item.sol || "SOL-005", x + 16, sy + 16);

      ctx.fillStyle = "#E8F1FA";
      ctx.fillText(item.test || item.title || "", x + 85, sy + 16);

      ctx.fillStyle = "#FFB547";
      ctx.fillText(item.status || "PENDING", x + w - 75, sy + 16);

      sy += 28;
    });
  }

  private drawAlertList(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "ALERTS");
    const alerts = p.alerts || p.items || [];
    let ay = y + 36;

    alerts.slice(0, 3).forEach((alt: any) => {
      const sev = (alt.severity || alt.level || "INFO").toUpperCase();
      const color = sev === "CRITICAL" ? "#FF5353" : sev === "WARNING" ? "#FFB547" : "#36C5E8";

      ctx.fillStyle = color + "22";
      ctx.fillRect(x + 10, ay, w - 20, 26);
      ctx.strokeStyle = color;
      ctx.strokeRect(x + 10, ay, w - 20, 26);

      ctx.fillStyle = color;
      ctx.font = "bold 10px monospace";
      ctx.fillText(`▲ ${sev}`, x + 16, ay + 17);

      ctx.fillStyle = "#E8F1FA";
      ctx.font = "10px monospace";
      ctx.fillText(alt.message || alt.text || "", x + 85, ay + 17);

      ay += 32;
    });
  }

  private drawProcessSteps(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "PROCESS STEPS");
    const steps = p.steps || [];
    let py = y + 36;

    steps.slice(0, 5).forEach((step: any, idx: number) => {
      const isDone = (step.state || step.status || "").toUpperCase() === "COMPLETED";
      const isInProgress = (step.state || step.status || "").toUpperCase() === "IN_PROGRESS";

      ctx.fillStyle = "#0B1B2B";
      ctx.fillRect(x + 10, py, w - 20, 28);

      ctx.fillStyle = isDone ? "#53D6A0" : isInProgress ? "#36C5E8" : "#536B83";
      ctx.beginPath();
      ctx.arc(x + 22, py + 14, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#E8F1FA";
      ctx.font = "11px monospace";
      ctx.fillText(`0${idx + 1}. ${step.name || step.title || ""}`, x + 36, py + 18);

      ctx.fillStyle = isDone ? "#53D6A0" : isInProgress ? "#36C5E8" : "#91A6BC";
      ctx.font = "bold 10px monospace";
      ctx.fillText(step.state || step.status || "PENDING", x + w - 85, py + 18);

      py += 32;
    });
  }

  private drawResourceBars(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "RESOURCE BALANCE");
    const resources = p.resources || [
      { name: "PURIFIED H2O", value: 88, unit: "%" },
      { name: "NUTRIENT SOLUTION A", value: 74, unit: "%" },
      { name: "NUTRIENT SOLUTION B", value: 68, unit: "%" },
      { name: "BUFFER TANK C", value: 42, unit: "%" }
    ];
    let ry = y + 36;

    resources.slice(0, 4).forEach((res: any) => {
      ctx.fillStyle = "#E8F1FA";
      ctx.font = "10px monospace";
      ctx.fillText(res.name || "", x + 12, ry + 12);

      const val = res.value || 50;
      ctx.fillStyle = "#53D6A0";
      ctx.fillText(`${val}${res.unit || "%"}`, x + w - 50, ry + 12);

      // Bar
      ctx.fillStyle = "#102438";
      ctx.fillRect(x + 12, ry + 16, w - 24, 10);
      ctx.fillStyle = "#36C5E8";
      ctx.fillRect(x + 12, ry + 16, (w - 24) * (val / 100), 10);

      ry += 32;
    });
  }

  private drawMetricGrid(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "QUALITY METRICS");
    const metrics = p.metrics || p.items || [];
    const cols = 2;
    const cardW = Math.floor((w - 28) / cols);
    const cardH = 46;
    let my = y + 36;

    metrics.slice(0, 4).forEach((m: any, idx: number) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cx = x + 10 + col * (cardW + 8);
      const cy = my + row * (cardH + 8);

      ctx.fillStyle = "#0B1B2B";
      ctx.fillRect(cx, cy, cardW, cardH);
      ctx.strokeStyle = "#1B354B";
      ctx.strokeRect(cx, cy, cardW, cardH);

      ctx.fillStyle = "#91A6BC";
      ctx.font = "9px monospace";
      ctx.fillText(m.label || m.name || "", cx + 10, cy + 14);

      ctx.fillStyle = "#36C5E8";
      ctx.font = "bold 15px monospace";
      ctx.fillText(`${m.value || "0"} ${m.unit || ""}`, cx + 10, cy + 34);
    });
  }

  private drawChecklist(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "VALIDATION CHECKLIST");
    const items = p.items || p.checklist || [];
    let cy = y + 36;

    items.slice(0, 5).forEach((item: any) => {
      const isChecked = item.checked || item.passed || false;
      ctx.fillStyle = isChecked ? "#53D6A0" : "#FF5353";
      ctx.strokeRect(x + 12, cy + 2, 10, 10);
      if (isChecked) ctx.fillRect(x + 14, cy + 4, 6, 6);

      ctx.fillStyle = "#E8F1FA";
      ctx.font = "10px monospace";
      ctx.fillText(item.label || item.text || "", x + 30, cy + 11);

      cy += 24;
    });
  }

  private drawChamberGrid(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "GROWTH CHAMBERS");
    const chambers = p.chambers || [
      { id: "CH-01", crop: "MICROGREEN ARABIDOPSIS", temp: "22.4°C", humidity: "65%", status: "HEALTHY" },
      { id: "CH-02", crop: "DWARF WHEAT LINE-4", temp: "21.8°C", humidity: "62%", status: "HEALTHY" },
      { id: "CH-03", crop: "LEGUME SYMBIOSIS B-2", temp: "23.1°C", humidity: "68%", status: "HEALTHY" }
    ];
    let cy = y + 34;

    chambers.slice(0, 3).forEach((ch: any) => {
      ctx.fillStyle = "#0B1B2B";
      ctx.fillRect(x + 10, cy, w - 20, 42);
      ctx.strokeStyle = "#1B354B";
      ctx.strokeRect(x + 10, cy, w - 20, 42);

      ctx.fillStyle = "#53D6A0";
      ctx.font = "bold 11px monospace";
      ctx.fillText(ch.id || "", x + 16, cy + 16);

      ctx.fillStyle = "#E8F1FA";
      ctx.font = "10px monospace";
      ctx.fillText(ch.crop || "", x + 65, cy + 16);

      ctx.fillStyle = "#91A6BC";
      ctx.font = "9px monospace";
      ctx.fillText(`TEMP: ${ch.temp || ""}  RH: ${ch.humidity || ""}`, x + 16, cy + 32);

      ctx.fillStyle = "#53D6A0";
      ctx.fillText(ch.status || "OK", x + w - 60, cy + 32);

      cy += 48;
    });
  }

  private drawTimeline(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: any): void {
    this.drawPanelFrame(ctx, x, y, w, h, p.title || "LIGHTING CYCLE");
    const totalW = w - 32;
    const barY = y + 36;

    // 16h photoperiod / 8h dark period
    const lightW = totalW * (16 / 24);
    const darkW = totalW * (8 / 24);

    ctx.fillStyle = "#FFB547";
    ctx.fillRect(x + 16, barY, lightW, 20);
    ctx.fillStyle = "#07111F";
    ctx.fillRect(x + 16 + lightW, barY, darkW, 20);
    ctx.strokeStyle = "#29465E";
    ctx.strokeRect(x + 16, barY, totalW, 20);

    ctx.fillStyle = "#07111F";
    ctx.font = "bold 9px monospace";
    ctx.fillText("PHOTOPERIOD (16h)", x + 24, barY + 14);

    ctx.fillStyle = "#E8F1FA";
    ctx.fillText("DARK (8h)", x + 16 + lightW + 10, barY + 14);
  }

  // =========================================================================
  // FRAME & COMMON DRAWING UTILITIES
  // =========================================================================

  private drawPanelFrame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string): void {
    ctx.fillStyle = "#102438";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#29465E";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    // Title bar
    ctx.fillStyle = "#152D42";
    ctx.fillRect(x, y, w, 24);
    ctx.strokeStyle = "#29465E";
    ctx.strokeRect(x, y, w, 24);

    ctx.fillStyle = "#36C5E8";
    ctx.font = "bold 11px monospace";
    ctx.fillText(title, x + 10, y + 16);
  }

  private drawPrimaryMetrics(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    metrics: Array<any>
  ): void {
    if (!metrics || metrics.length === 0) return;
    const cardW = Math.floor((w - (metrics.length - 1) * 8) / metrics.length);

    metrics.forEach((m, idx) => {
      const cx = x + idx * (cardW + 8);
      ctx.fillStyle = "#102438";
      ctx.fillRect(cx, y, cardW, h);
      ctx.strokeStyle = "#29465E";
      ctx.strokeRect(cx, y, cardW, h);

      ctx.fillStyle = "#91A6BC";
      ctx.font = "9px monospace";
      ctx.fillText((m.label || "").slice(0, 16), cx + 8, y + 14);

      ctx.fillStyle = "#E8F1FA";
      ctx.font = "bold 14px monospace";
      ctx.fillText(`${m.value || "0"} ${m.unit || ""}`, cx + 8, y + 34);
    });
  }

  private drawHeader(ctx: CanvasRenderingContext2D, w: number, title: string, subtitle: string): void {
    ctx.fillStyle = "#36C5E8";
    ctx.font = "bold 17px monospace";
    ctx.fillText(title, 20, 28);

    ctx.fillStyle = "#91A6BC";
    ctx.font = "11px monospace";
    ctx.fillText(subtitle, 20, 44);

    ctx.fillStyle = "#FFB547";
    ctx.font = "bold 10px monospace";
    ctx.fillText("SIMULATED RESEARCH DATA - NOT LIVE NASA TELEMETRY", w - 340, 28);

    ctx.strokeStyle = "#1B354B";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, 52);
    ctx.lineTo(w - 20, 52);
    ctx.stroke();
  }

  private drawFooter(ctx: CanvasRenderingContext2D, w: number, h: number, leftText: string): void {
    ctx.strokeStyle = "#1B354B";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, h - 30);
    ctx.lineTo(w - 20, h - 30);
    ctx.stroke();

    ctx.fillStyle = "#91A6BC";
    ctx.font = "10px monospace";
    ctx.fillText(leftText, 20, h - 14);

    ctx.fillStyle = "#FF5353";
    ctx.font = "bold 9px monospace";
    ctx.fillText("SIMULATED DEMO ONLY", w - 160, h - 14);
  }

  private drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.strokeStyle = "#0E1C2B";
    ctx.lineWidth = 1;
    const step = 40;
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

  private drawBrackets(ctx: CanvasRenderingContext2D, w: number, h: number, color: string): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    const len = 14;
    const pad = 4;

    ctx.beginPath();
    ctx.moveTo(pad, pad + len);
    ctx.lineTo(pad, pad);
    ctx.lineTo(pad + len, pad);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(w - pad - len, pad);
    ctx.lineTo(w - pad, pad);
    ctx.lineTo(w - pad, pad + len);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pad, h - pad - len);
    ctx.lineTo(pad, h - pad);
    ctx.lineTo(pad + len, h - pad);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(w - pad - len, h - pad);
    ctx.lineTo(w - pad, h - pad);
    ctx.lineTo(w - pad, h - pad - len);
    ctx.stroke();
  }

  // =========================================================================
  // DATA MANAGEMENT & CLEANUP
  // =========================================================================

  public updateScreenData(screenId: string, partialData: any): void {
    const screenConf = this.screensMap.get(screenId.trim());
    if (screenConf) {
      screenConf.content = {
        ...screenConf.content,
        ...partialData
      };
      const binding = this.activeBindings.find(
        (b) => b.screenId === screenId.trim() || b.meshName.trim() === screenId.trim()
      );
      if (binding) {
        this.renderBinding(binding);
        binding.texture.needsUpdate = true;
      }
    }
  }

  public getActiveBindings(): readonly ResearchScreenBinding[] {
    return this.activeBindings;
  }

  public getBindings(): readonly ResearchScreenBinding[] {
    return this.activeBindings;
  }

  public getScreenConfig(screenId: string): any {
    return this.screensMap.get(screenId.trim()) || null;
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
