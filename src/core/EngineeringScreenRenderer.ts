/**
 * PHOBOSIA — Engineering Unit Physical Screen Sticker Rendering System
 *
 * Dedicated modular screen renderer for the 12 physical 3D displays in the Engineering Unit:
 * 1. MonitoringSection_Indicator_Screen
 * 2. MonitoringSection_Operational_Screen
 * 3. MonitoringSection_Screen
 * 4. PowerUnitScreenMain
 * 5. PowerUnitScreenMain02
 * 6. PowerUnitScreen000
 * 7. PowerUnitScreen000.001
 * 8. LifeSupportUnitScreenMain04
 * 9. LifeSupportUnitScreenMain02.001
 * 10. LifeSupportUnitScreenMain03
 * 11. DiagnosticsWorkbenchScreen_01
 * 12. Storage_Screen
 *
 * Driven by `src/jsons/Screens/engineeringScreenData.json`.
 * Features per-screen planar UV reprojection, aspect-ratio-matched offscreen canvases,
 * procedural graph and icon telemetry, dynamic data updates, and strict VRAM disposal.
 */

import * as THREE from "three";
import { reprojectPlanarUVs } from "./Collision";
import { getScreenConfigForSol, type ScreenMissionSnapshot } from "./ScreenConfigRegistry";
import { drawSol07Banner, isSol07StormPresentationActive } from "../missions/sol-07/Sol07ScreenRenderer";

export interface EngineeringScreenData {
  moduleId: string;
  moduleName: string;
  dataMode: string;
  version: number;
  rendering: {
    renderingSystem: string;
    renderingTarget: string;
    useFullscreenOS: boolean;
    useIndependentScreenRendering: boolean;
    preservePhysicalScreenMeshes: boolean;
    preserveExistingMaterials: boolean;
    preserveExistingTransforms: boolean;
    allowPerScreenOrientation: boolean;
    allowPerScreenLayout: boolean;
    allowPerScreenData: boolean;
    defaultBackground: string;
    defaultTextColor: string;
    defaultAccentColor: string;
    defaultFontFamily: string;
    defaultRefreshIntervalMs: number;
  };
  screens: Record<string, any>;
}

export interface EngineeringScreenBinding {
  screenKey: string;
  nodeName: string;
  mesh: THREE.Mesh;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  material: THREE.MeshBasicMaterial;
  width: number;
  height: number;
  rendererFunction: string;
  refreshIntervalMs: number;
  lastRenderTime: number;
}

// Dynamic resolver for Node CommonJS tests vs Next.js Webpack bundler
function loadEngineeringScreenData(): EngineeringScreenData {
  try {
    // In Next.js / Webpack bundling from src/core
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("../jsons/Screens/engineeringScreenData.json");
  } catch {
    try {
      // In dist/ during Node test execution
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return eval("require")("../src/jsons/Screens/engineeringScreenData.json");
    } catch {
      return {
        moduleId: "Engineering",
        moduleName: "Engineering Unit",
        dataMode: "SIMULATED",
        version: 1,
        rendering: {
          renderingSystem: "EngineeringScreenRenderer",
          renderingTarget: "PHYSICAL_3D_SCREEN",
          useFullscreenOS: false,
          useIndependentScreenRendering: true,
          preservePhysicalScreenMeshes: true,
          preserveExistingMaterials: true,
          preserveExistingTransforms: true,
          allowPerScreenOrientation: true,
          allowPerScreenLayout: true,
          allowPerScreenData: true,
          defaultBackground: "#07111F",
          defaultTextColor: "#E8F1FA",
          defaultAccentColor: "#45B8E8",
          defaultFontFamily: "monospace",
          defaultRefreshIntervalMs: 1000
        },
        screens: {}
      };
    }
  }
}

const engineeringDataJson = loadEngineeringScreenData();

export class EngineeringScreenRenderer {
  private configData: EngineeringScreenData;
  private activeBindings: EngineeringScreenBinding[] = [];
  private missionDay: number = 1;
  private configSol = 4;
  private completedStepIds: string[] = [];
  private customConfig: boolean;

  constructor(customConfig?: EngineeringScreenData) {
    this.customConfig = Boolean(customConfig);
    this.configData = customConfig ? JSON.parse(JSON.stringify(customConfig)) : JSON.parse(JSON.stringify(engineeringDataJson));
  }

  private selectSolConfig(sol: number) {
    if (this.customConfig || this.configSol === sol) return;
    this.configData = JSON.parse(JSON.stringify(getScreenConfigForSol("engineering", sol, engineeringDataJson)));
    this.configSol = sol;
  }

  /**
   * Primary Entry Point: Scans Engineering Unit model and binds planar canvas textures to the 12 screens.
   */
  public renderEngineeringUnitScreens(model: THREE.Group, missionState?: ScreenMissionSnapshot): void {
    this.attachToEngineering(model, missionState);
  }

  /**
   * Alias for renderEngineeringUnitScreens adhering to project conventions.
   */
  public attachToEngineering(model: THREE.Group, missionState?: ScreenMissionSnapshot): void {
    this.dispose();

    if (missionState?.currentDay) {
      this.missionDay = missionState.currentDay;
    }
    if (missionState?.completedStepIds) this.completedStepIds = missionState.completedStepIds;
    this.selectSolConfig(this.missionDay);

    const targetScreenKeys = Object.keys(this.configData.screens);

    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;

      const name = mesh.name || "";
      const cleanName = name.replace(/\./g, "");

      // Match against configured screen identifiers (exact or dot-normalized)
      const screenKey = targetScreenKeys.find((key) => {
        const cleanKey = key.replace(/\./g, "");
        return key === name || cleanKey === cleanName || name.includes(key) || cleanName.includes(cleanKey);
      });

      if (screenKey) {
        this.bindScreen(mesh, screenKey);
      }
    });

    this.renderAll(missionState);
  }

  /**
   * Binds an individual physical screen mesh with planar UV projection and CanvasTexture.
   */
  private bindScreen(mesh: THREE.Mesh, screenKey: string): void {
    const screenConf = this.configData.screens[screenKey];
    if (!screenConf || !screenConf.enabled) return;

    // 1. Determine orientation options from screen configuration
    const orientation = screenConf.orientation || {};
    const flipU = Boolean(orientation.mirrorHorizontal);
    const flipV = Boolean(orientation.mirrorVertical);
    const rotation = (orientation.contentRotationDegrees || orientation.rotationDegrees || 0) as 0 | 90 | 180 | 270;
    const uAxis = orientation.uAxis;
    const vAxis = orientation.vAxis;

    // 2. Reproject planar UVs across the physical mesh geometry with verified axis mapping
    reprojectPlanarUVs(mesh.geometry, { uAxis, vAxis, flipU, flipV, rotation });

    // 3. Compute optimal canvas dimensions matching screen aspect ratio
    const geom = screenConf.geometry || {};
    const aspect = geom.aspectRatio || (geom.screenWidth && geom.screenHeight ? geom.screenWidth / geom.screenHeight : 1.33);

    let canvasWidth = 1024;
    let canvasHeight = Math.round(1024 / aspect);

    // Bounded resolution for NVIDIA MX350 2GB VRAM budget
    if (aspect < 0.3) {
      // Very tall column (e.g. PowerUnitScreen000)
      canvasWidth = 256;
      canvasHeight = 1024;
    } else if (aspect < 1.0) {
      // Portrait
      canvasHeight = 896;
      canvasWidth = Math.round(896 * aspect);
    } else if (aspect > 2.0) {
      // Wide panoramic
      canvasWidth = 1024;
      canvasHeight = Math.round(1024 / aspect);
    }

    canvasWidth = THREE.MathUtils.clamp(canvasWidth, 256, 1024);
    canvasHeight = THREE.MathUtils.clamp(canvasHeight, 256, 1024);

    if (canvasWidth % 2 !== 0) canvasWidth++;
    if (canvasHeight % 2 !== 0) canvasHeight++;

    // 4. Create offscreen canvas (DOM or mock environment check)
    if (typeof document === "undefined") {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 5. Create CanvasTexture
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
      screenKey,
      nodeName: mesh.name,
      mesh,
      canvas,
      ctx,
      texture,
      material,
      width: canvasWidth,
      height: canvasHeight,
      rendererFunction: screenConf.rendering?.rendererFunction || "renderMonitoringOperationalScreen",
      refreshIntervalMs: screenConf.rendering?.refreshIntervalMs || 1000,
      lastRenderTime: 0
    });
  }

  /**
   * Redraws all active physical screens with current data.
   */
  public renderAll(missionState?: ScreenMissionSnapshot): void {
    if (missionState?.currentDay) {
      this.missionDay = missionState.currentDay;
    }
    if (missionState?.completedStepIds) this.completedStepIds = missionState.completedStepIds;
    this.selectSolConfig(this.missionDay);

    const now = Date.now();
    for (const binding of this.activeBindings) {
      this.renderBinding(binding);
      binding.lastRenderTime = now;
      binding.texture.needsUpdate = true;
    }
  }

  /**
   * Renders a single binding using its specific dedicated rendering function.
   */
  public renderBinding(binding: EngineeringScreenBinding): void {
    const { ctx, width, height, screenKey } = binding;
    const screenConf = this.configData.screens[screenKey];
    if (!screenConf) return;

    const data = screenConf.data || {};
    const app = screenConf.appearance || {};

    // Clear canvas
    ctx.fillStyle = app.background || "#07111F";
    ctx.fillRect(0, 0, width, height);

    // Subtle HUD grid
    this.drawHudGrid(ctx, width, height);

    // Dedicated rendering functions based on screen identity
    switch (screenKey) {
      case "MonitoringSection_Indicator_Screen":
        this.renderMonitoringIndicatorScreen(ctx, data, width, height, this.missionDay, app);
        break;
      case "MonitoringSection_Operational_Screen":
        this.renderMonitoringOperationalScreen(ctx, data, width, height, this.missionDay, app);
        break;
      case "MonitoringSection_Screen":
        this.renderMonitoringMainScreen(ctx, data, width, height, this.missionDay, app);
        break;
      case "PowerUnitScreenMain":
        this.renderPowerMainScreen(ctx, data, width, height, this.missionDay, app);
        break;
      case "PowerUnitScreenMain02":
        this.renderPowerSecondaryMainScreen(ctx, data, width, height, this.missionDay, app);
        break;
      case "PowerUnitScreen000":
        this.renderPowerCompactColumnScreen(ctx, data, width, height, this.missionDay, app);
        break;
      case "PowerUnitScreen000.001":
        this.renderPowerCompactScreen(ctx, data, width, height, this.missionDay, app);
        break;
      case "LifeSupportUnitScreenMain04":
        this.renderLifeSupportMainScreen(ctx, data, width, height, this.missionDay, app);
        break;
      case "LifeSupportUnitScreenMain02.001":
        this.renderLifeSupportResourceScreen(ctx, data, width, height, this.missionDay, app);
        break;
      case "LifeSupportUnitScreenMain03":
        this.renderLifeSupportDiagnosticsScreen(ctx, data, width, height, this.missionDay, app);
        break;
      case "DiagnosticsWorkbenchScreen_01":
        this.renderDiagnosticsWorkbenchScreen(ctx, data, width, height, this.missionDay, app);
        break;
      case "Storage_Screen":
        this.renderStorageScreen(ctx, data, width, height, this.missionDay, app);
        break;
      default:
        this.renderMonitoringOperationalScreen(ctx, data, width, height, this.missionDay, app);
        break;
    }

    if (isSol07StormPresentationActive({ currentDay: this.missionDay, completedStepIds: this.completedStepIds })) drawSol07Banner(ctx, width, height, "SOL 7 · READ-ONLY POWER ASSESSMENT", "Legacy unit telemetry is gameplay simulation; classify any reported value. No repairs.");

    // Outer physical bezel border & corner brackets
    ctx.strokeStyle = app.accent || "#45B8E8";
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, width - 6, height - 6);
    this.drawCornerBrackets(ctx, width, height, app.accent || "#45B8E8");
  }

  // =========================================================================
  // 1. MONITORING SECTION INDICATORS
  // =========================================================================
  public renderMonitoringIndicatorScreen(
    ctx: CanvasRenderingContext2D,
    data: any,
    w: number,
    h: number,
    sol: number = 1,
    app?: any
  ): void {
    const accent = app?.accent || "#45B8E8";
    const normal = app?.normal || "#42D392";
    const textPrimary = app?.primaryText || "#E8F1FA";
    const textSecondary = app?.secondaryText || "#8EA7BF";

    this.drawScreenHeader(ctx, w, data.header || "SUBSYSTEM HEALTH MONITOR", data.systemState || "ALL NOMINAL", normal, sol);

    const startY = 66;
    const footerH = 38;
    const availH = h - startY - footerH;
    const indicators = data.indicators || [];
    const cols = 4;
    const rows = 2;
    const cardGap = 10;
    const cardW = Math.floor((w - 32 - cardGap * (cols - 1)) / cols);
    const cardH = Math.floor((availH - cardGap * (rows - 1)) / rows);

    indicators.forEach((ind: any, i: number) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const x = 16 + c * (cardW + cardGap);
      const y = startY + r * (cardH + cardGap);

      ctx.fillStyle = "rgba(16, 35, 50, 0.85)";
      ctx.fillRect(x, y, cardW, cardH);
      ctx.strokeStyle = "rgba(69, 184, 232, 0.3)";
      ctx.strokeRect(x, y, cardW, cardH);

      // Indicator LED
      const isOnline = ind.status === "NOMINAL" || ind.status === "ONLINE";
      ctx.fillStyle = isOnline ? normal : accent;
      ctx.beginPath();
      ctx.arc(x + 14, y + 16, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Bus code
      ctx.fillStyle = textSecondary;
      ctx.font = "bold 11px monospace";
      ctx.fillText(ind.code || "--", x + 24, y + 20);

      // Label
      ctx.fillStyle = textPrimary;
      ctx.font = "bold 14px monospace";
      ctx.fillText(ind.label, x + 14, y + cardH / 2 + 6);

      // Status Tag
      ctx.fillStyle = isOnline ? "rgba(66, 211, 146, 0.15)" : "rgba(69, 184, 232, 0.15)";
      ctx.fillRect(x + 12, y + cardH - 26, cardW - 24, 18);
      ctx.strokeStyle = isOnline ? normal : accent;
      ctx.strokeRect(x + 12, y + cardH - 26, cardW - 24, 18);

      ctx.fillStyle = isOnline ? normal : accent;
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "center";
      ctx.fillText(ind.status, x + cardW / 2, y + cardH - 13);
      ctx.textAlign = "left";
    });

    this.drawScreenFooter(ctx, w, h, "ENGINEERING BUS MONITOR", "SIMULATED TELEMETRY");
  }

  // =========================================================================
  // 2. MONITORING OPERATIONAL DISPLAY (WITH TREND GRAPH)
  // =========================================================================
  public renderMonitoringOperationalScreen(
    ctx: CanvasRenderingContext2D,
    data: any,
    w: number,
    h: number,
    sol: number = 1,
    app?: any
  ): void {
    const accent = app?.accent || "#45B8E8";
    const normal = app?.normal || "#42D392";
    const textPrimary = app?.primaryText || "#E8F1FA";
    const textSecondary = app?.secondaryText || "#8EA7BF";

    this.drawScreenHeader(ctx, w, data.header || "OPERATIONAL TELEMETRY & TREND", "GRID ONLINE", normal, sol);

    const startY = 66;
    const footerH = 38;
    const availH = h - startY - footerH;

    // Left telemetry column (35% width), Right graph (65% width)
    const leftW = Math.floor((w - 44) * 0.35);
    const rightX = 16 + leftW + 12;
    const rightW = w - 16 - rightX;

    // Left Telemetry Box
    ctx.fillStyle = "rgba(16, 35, 50, 0.85)";
    ctx.fillRect(16, startY, leftW, availH);
    ctx.strokeStyle = "rgba(69, 184, 232, 0.3)";
    ctx.strokeRect(16, startY, leftW, availH);

    ctx.fillStyle = textSecondary;
    ctx.font = "bold 12px monospace";
    ctx.fillText("OVERALL SYSTEM LOAD", 30, startY + 30);

    ctx.fillStyle = accent;
    ctx.font = "bold 34px monospace";
    ctx.fillText(`${data.subsystemLoad ?? 74.2}%`, 30, startY + 70);

    // Load progress bar
    this.drawProgressBar(ctx, 30, startY + 84, leftW - 28, 16, (data.subsystemLoad ?? 74.2) / 100, accent);

    ctx.fillStyle = textSecondary;
    ctx.font = "bold 12px monospace";
    ctx.fillText("COOLING EFFICIENCY", 30, startY + 140);
    ctx.fillStyle = normal;
    ctx.font = "bold 28px monospace";
    ctx.fillText(`${data.coolingEfficiency ?? 96.5}%`, 30, startY + 175);

    ctx.fillStyle = textSecondary;
    ctx.font = "bold 12px monospace";
    ctx.fillText("THERMAL STATE: " + (data.thermalState || "STABLE"), 30, startY + 215);

    // Right Trend Graph
    ctx.fillStyle = "rgba(16, 35, 50, 0.85)";
    ctx.fillRect(rightX, startY, rightW, availH);
    ctx.strokeStyle = "rgba(69, 184, 232, 0.3)";
    ctx.strokeRect(rightX, startY, rightW, availH);

    ctx.fillStyle = accent;
    ctx.font = "bold 12px monospace";
    ctx.fillText("REAL-TIME POWER & THERMAL LOAD PROFILE (HOURLY)", rightX + 16, startY + 26);

    const history = data.trendHistory || [50, 55, 60, 65, 70, 72, 74, 73, 76, 74, 75, 74];
    this.drawTrendGraph(ctx, rightX + 16, startY + 40, rightW - 32, availH - 56, history, accent, "rgba(69, 184, 232, 0.15)", 0, 100);

    this.drawScreenFooter(ctx, w, h, "SECTION 01 // OPERATIONAL OVERVIEW", "SIMULATED TELEMETRY");
  }

  // =========================================================================
  // 3. MONITORING NETWORK OVERVIEW DISPLAY
  // =========================================================================
  public renderMonitoringMainScreen(
    ctx: CanvasRenderingContext2D,
    data: any,
    w: number,
    h: number,
    sol: number = 1,
    app?: any
  ): void {
    const accent = app?.accent || "#45B8E8";
    const normal = app?.normal || "#42D392";
    const textPrimary = app?.primaryText || "#E8F1FA";
    const textSecondary = app?.secondaryText || "#8EA7BF";

    this.drawScreenHeader(ctx, w, data.header || "NETWORK MONITORING OVERVIEW", "NETWORK STABLE", normal, sol);

    const startY = 66;
    const footerH = 38;
    const availH = h - startY - footerH;

    // Node Cards (2 cols)
    const nodes = data.networkNodes || [];
    const cardW = Math.floor((w - 44) / 2);
    const rowH = Math.floor((availH - 20) / Math.max(3, Math.ceil(nodes.length / 2)));

    nodes.forEach((n: any, i: number) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 16 + col * (cardW + 12);
      const y = startY + row * (rowH + 6);

      ctx.fillStyle = "rgba(16, 35, 50, 0.85)";
      ctx.fillRect(x, y, cardW, rowH);
      ctx.strokeStyle = "rgba(69, 184, 232, 0.25)";
      ctx.strokeRect(x, y, cardW, rowH);

      // Icon: Network Node Glyph
      this.drawNetworkGlyph(ctx, x + 16, y + rowH / 2, normal);

      ctx.fillStyle = textPrimary;
      ctx.font = "bold 13px monospace";
      ctx.fillText(n.node, x + 44, y + rowH / 2 - 4);

      ctx.fillStyle = textSecondary;
      ctx.font = "11px monospace";
      ctx.fillText(`LATENCY: ${n.ping}`, x + 44, y + rowH / 2 + 12);

      ctx.fillStyle = normal;
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "right";
      ctx.fillText(n.status, x + cardW - 16, y + rowH / 2 + 4);
      ctx.textAlign = "left";
    });

    this.drawScreenFooter(ctx, w, h, "TELEMETRY NETWORK BUS", `BUS LOAD: ${data.busLoad ?? 38.6}%`);
  }

  // =========================================================================
  // 4. POWER UNIT MAIN DISPLAY
  // =========================================================================
  public renderPowerMainScreen(
    ctx: CanvasRenderingContext2D,
    data: any,
    w: number,
    h: number,
    sol: number = 1,
    app?: any
  ): void {
    const accent = app?.accent || "#45B8E8";
    const normal = app?.normal || "#42D392";
    const textPrimary = app?.primaryText || "#E8F1FA";
    const textSecondary = app?.secondaryText || "#8EA7BF";

    this.drawScreenHeader(ctx, w, data.header || "PRIMARY POWER GENERATION", "REACTOR ACTIVE", normal, sol);

    const startY = 66;
    const footerH = 38;
    const availH = h - startY - footerH;

    // 2x2 grid of main power gauges
    const colW = Math.floor((w - 44) / 2);
    const rowH = Math.floor((availH - 12) / 2);

    const cards = [
      { label: "REACTOR CORE OUTPUT", val: `${data.reactorOutput ?? 98.4} kW`, sub: "THERMAL CORE BALANCED", pct: (data.reactorOutput ?? 98.4) / 120, color: normal },
      { label: "SOLAR AUX GENERATION", val: `${data.solarGeneration ?? 42.1} kW`, sub: "ARRAY TRACKING NOMINAL", pct: (data.solarGeneration ?? 42.1) / 60, color: accent },
      { label: "TOTAL OUTPOST LOAD", val: `${data.totalConsumption ?? 118.6} kW`, sub: "WITHIN GENERATION LIMIT", pct: (data.totalConsumption ?? 118.6) / 150, color: textPrimary },
      { label: "PRIMARY BATTERY STORAGE", val: `${data.batteryStorage ?? 88.5}%`, sub: "RESERVES OPTIMAL", pct: (data.batteryStorage ?? 88.5) / 100, color: normal }
    ];

    cards.forEach((c, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const x = 16 + col * (colW + 12);
      const y = startY + row * (rowH + 12);

      ctx.fillStyle = "rgba(16, 35, 50, 0.85)";
      ctx.fillRect(x, y, colW, rowH);
      ctx.strokeStyle = "rgba(69, 184, 232, 0.3)";
      ctx.strokeRect(x, y, colW, rowH);

      // Icon
      this.drawPowerGlyph(ctx, x + 20, y + 26, c.color);

      ctx.fillStyle = textSecondary;
      ctx.font = "bold 12px monospace";
      ctx.fillText(c.label, x + 44, y + 28);

      ctx.fillStyle = c.color;
      ctx.font = "bold 32px monospace";
      ctx.fillText(c.val, x + 20, y + 74);

      ctx.fillStyle = textSecondary;
      ctx.font = "11px monospace";
      ctx.fillText(c.sub, x + 20, y + 96);

      // Bar
      this.drawProgressBar(ctx, x + 20, y + rowH - 24, colW - 40, 12, c.pct, c.color);
    });

    this.drawScreenFooter(ctx, w, h, "POWER MANAGEMENT // UNIT 01", `GRID VOLTAGE: ${data.busVoltage ?? 400.2}V`);
  }

  // =========================================================================
  // 5. POWER SECONDARY MAIN DISPLAY (LOAD DISTRIBUTION)
  // =========================================================================
  public renderPowerSecondaryMainScreen(
    ctx: CanvasRenderingContext2D,
    data: any,
    w: number,
    h: number,
    sol: number = 1,
    app?: any
  ): void {
    const accent = app?.accent || "#45B8E8";
    const normal = app?.normal || "#42D392";
    const textPrimary = app?.primaryText || "#E8F1FA";
    const textSecondary = app?.secondaryText || "#8EA7BF";

    this.drawScreenHeader(ctx, w, data.header || "LOAD DISTRIBUTION & DIAGNOSTICS", "4 BUSES ACTIVE", normal, sol);

    const startY = 66;
    const footerH = 38;
    const availH = h - startY - footerH;

    const leftW = Math.floor((w - 44) * 0.55);
    const rightX = 16 + leftW + 12;
    const rightW = w - 16 - rightX;

    // Left: Subsystem Modules Load Bars
    ctx.fillStyle = "rgba(16, 35, 50, 0.85)";
    ctx.fillRect(16, startY, leftW, availH);
    ctx.strokeStyle = "rgba(69, 184, 232, 0.3)";
    ctx.strokeRect(16, startY, leftW, availH);

    ctx.fillStyle = accent;
    ctx.font = "bold 13px monospace";
    ctx.fillText("OUTPOST MODULE CONSUMPTION", 28, startY + 26);

    const modules = data.modules || [];
    const itemH = Math.floor((availH - 44) / Math.max(1, modules.length));

    modules.forEach((m: any, idx: number) => {
      const y = startY + 38 + idx * itemH;

      ctx.fillStyle = textPrimary;
      ctx.font = "bold 13px monospace";
      ctx.fillText(m.name, 28, y + 16);

      ctx.fillStyle = textSecondary;
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${m.loadKw} kW (${m.pct}%)`, 16 + leftW - 20, y + 16);
      ctx.textAlign = "left";

      this.drawProgressBar(ctx, 28, y + 24, leftW - 40, 10, m.pct / 50, accent);
    });

    // Right: Load Trend Graph
    ctx.fillStyle = "rgba(16, 35, 50, 0.85)";
    ctx.fillRect(rightX, startY, rightW, availH);
    ctx.strokeStyle = "rgba(69, 184, 232, 0.3)";
    ctx.strokeRect(rightX, startY, rightW, availH);

    ctx.fillStyle = accent;
    ctx.font = "bold 12px monospace";
    ctx.fillText("AGGREGATE LOAD TREND (kW)", rightX + 16, startY + 26);

    const trend = data.loadTrend || [110, 114, 112, 118, 120, 117, 118, 119];
    this.drawTrendGraph(ctx, rightX + 16, startY + 40, rightW - 32, availH - 56, trend, normal, "rgba(66, 211, 146, 0.15)", 80, 140);

    this.drawScreenFooter(ctx, w, h, "POWER DIAGNOSTICS // GRID B", `DISSIPATION: ${data.thermalDissipation ?? 14.8} kW`);
  }

  // =========================================================================
  // 6. POWER COMPACT COLUMN SCREEN (VERY TALL NARROW 0.166 ASPECT)
  // =========================================================================
  public renderPowerCompactColumnScreen(
    ctx: CanvasRenderingContext2D,
    data: any,
    w: number,
    h: number,
    sol: number = 1,
    app?: any
  ): void {
    const accent = app?.accent || "#45B8E8";
    const normal = app?.normal || "#42D392";
    const textPrimary = app?.primaryText || "#E8F1FA";

    ctx.fillStyle = "rgba(16, 35, 48, 0.95)";
    ctx.fillRect(4, 4, w - 8, 40);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(4, 4, w - 8, 40);

    ctx.fillStyle = "#E88747";
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";
    ctx.fillText(data.header || "BUS V", w / 2, 28);
    ctx.textAlign = "left";

    const startY = 56;
    const cards = [
      { label: "V-BUS A", val: `${data.voltageA ?? 401.2}V`, color: normal },
      { label: "V-BUS B", val: `${data.voltageB ?? 399.8}V`, color: normal },
      { label: "CURR A", val: `${data.currentA ?? 148.5}A`, color: accent },
      { label: "FREQ", val: `${data.frequency ?? 60.0}Hz`, color: textPrimary },
      { label: "STATUS", val: data.status || "NOM", color: normal }
    ];

    const cardH = Math.floor((h - startY - 40) / cards.length);
    cards.forEach((c, i) => {
      const y = startY + i * cardH;

      ctx.fillStyle = "rgba(16, 35, 50, 0.85)";
      ctx.fillRect(8, y, w - 16, cardH - 6);
      ctx.strokeStyle = "rgba(69, 184, 232, 0.25)";
      ctx.strokeRect(8, y, w - 16, cardH - 6);

      ctx.fillStyle = "#8EA7BF";
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "center";
      ctx.fillText(c.label, w / 2, y + 22);

      ctx.fillStyle = c.color;
      ctx.font = "bold 18px monospace";
      ctx.fillText(c.val, w / 2, y + cardH / 2 + 10);
      ctx.textAlign = "left";
    });

    const footerY = h - 30;
    ctx.fillStyle = "rgba(10, 24, 36, 0.95)";
    ctx.fillRect(4, footerY, w - 8, 24);
    ctx.fillStyle = normal;
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "center";
    ctx.fillText("GRID OK", w / 2, footerY + 16);
    ctx.textAlign = "left";
  }

  // =========================================================================
  // 7. POWER COMPACT SCREEN (BATTERY SUBSTATION)
  // =========================================================================
  public renderPowerCompactScreen(
    ctx: CanvasRenderingContext2D,
    data: any,
    w: number,
    h: number,
    sol: number = 1,
    app?: any
  ): void {
    const accent = app?.accent || "#45B8E8";
    const normal = app?.normal || "#42D392";
    const textPrimary = app?.primaryText || "#E8F1FA";
    const textSecondary = app?.secondaryText || "#8EA7BF";

    this.drawScreenHeader(ctx, w, data.header || "BATTERY STORAGE BANK", data.status || "CHARGING", normal, sol);

    const startY = 66;
    const footerH = 38;
    const availH = h - startY - footerH;

    // Battery Main Card
    ctx.fillStyle = "rgba(16, 35, 50, 0.85)";
    ctx.fillRect(16, startY, w - 32, availH);
    ctx.strokeStyle = "rgba(69, 184, 232, 0.3)";
    ctx.strokeRect(16, startY, w - 32, availH);

    // Large Battery Icon
    this.drawBatteryGlyph(ctx, 36, startY + 40, (data.chargePct ?? 88.5) / 100, normal);

    ctx.fillStyle = textPrimary;
    ctx.font = "bold 44px monospace";
    ctx.fillText(`${data.chargePct ?? 88.5}%`, 130, startY + 68);

    ctx.fillStyle = textSecondary;
    ctx.font = "bold 12px monospace";
    ctx.fillText("ESTIMATED BACKUP RUNTIME: 42.5 HOURS", 130, startY + 92);

    const statsY = startY + 130;
    const stats = [
      { label: "CHARGE RATE", val: `+${data.chargeRateKw ?? 14.2} kW` },
      { label: "CELL TEMPERATURE", val: `${data.cellTemp ?? 21.8}°C` },
      { label: "TOTAL CYCLES", val: `${data.cycles ?? 412}` }
    ];

    const statW = Math.floor((w - 64) / stats.length);
    stats.forEach((s, idx) => {
      const x = 32 + idx * statW;
      ctx.fillStyle = textSecondary;
      ctx.font = "bold 11px monospace";
      ctx.fillText(s.label, x, statsY);

      ctx.fillStyle = accent;
      ctx.font = "bold 20px monospace";
      ctx.fillText(s.val, x, statsY + 28);
    });

    this.drawScreenFooter(ctx, w, h, "SUBSTATION 02 // BATTERY BANK", "NOMINAL");
  }

  // =========================================================================
  // 8. LIFE SUPPORT MAIN DISPLAY (PORTRAIT 0.606 ASPECT)
  // =========================================================================
  public renderLifeSupportMainScreen(
    ctx: CanvasRenderingContext2D,
    data: any,
    w: number,
    h: number,
    sol: number = 1,
    app?: any
  ): void {
    const accent = app?.accent || "#45B8E8";
    const normal = app?.normal || "#42D392";
    const textPrimary = app?.primaryText || "#E8F1FA";
    const textSecondary = app?.secondaryText || "#8EA7BF";

    this.drawScreenHeader(ctx, w, data.header || "ECLSS PRIMARY GENERATION", data.status || "OPERATIONAL", normal, sol);

    const startY = 66;
    const footerH = 38;
    const availH = h - startY - footerH;

    const cards = [
      { label: "O2 GENERATION RATE", val: `${data.o2Rate ?? 4.8} kg/sol`, sub: "ELECTROLYSIS RUNNING", pct: 0.8, color: normal },
      { label: "CO2 SCRUB EFFICIENCY", val: `${data.co2ScrubEfficiency ?? 99.4}%`, sub: "ZEOLITE BEDS CYCLING", pct: 0.99, color: normal },
      { label: "CABIN CIRCULATION", val: `${data.circulationCfm ?? 850} CFM`, sub: "BLOWER RPM 1820", pct: 0.75, color: accent },
      { label: "CONDENSATION RECOVERY", val: `${data.condensationLPerSol ?? 18.2} L/sol`, sub: "HUMIDITY TRAP ACTIVE", pct: 0.65, color: textPrimary }
    ];

    const cardH = Math.floor((availH - 12 * (cards.length - 1)) / cards.length);
    cards.forEach((c, idx) => {
      const y = startY + idx * (cardH + 12);

      ctx.fillStyle = "rgba(16, 35, 50, 0.85)";
      ctx.fillRect(16, y, w - 32, cardH);
      ctx.strokeStyle = "rgba(69, 184, 232, 0.3)";
      ctx.strokeRect(16, y, w - 32, cardH);

      ctx.fillStyle = textSecondary;
      ctx.font = "bold 12px monospace";
      ctx.fillText(c.label, 28, y + 24);

      ctx.fillStyle = c.color;
      ctx.font = "bold 26px monospace";
      ctx.fillText(c.val, 28, y + 60);

      ctx.fillStyle = textSecondary;
      ctx.font = "11px monospace";
      ctx.fillText(c.sub, 28, y + 80);

      this.drawProgressBar(ctx, 28, y + cardH - 20, w - 56, 10, c.pct, c.color);
    });

    this.drawScreenFooter(ctx, w, h, "ECLSS UNIT 04", "SIMULATED TELEMETRY");
  }

  // =========================================================================
  // 9. LIFE SUPPORT RESOURCE DISPLAY
  // =========================================================================
  public renderLifeSupportResourceScreen(
    ctx: CanvasRenderingContext2D,
    data: any,
    w: number,
    h: number,
    sol: number = 1,
    app?: any
  ): void {
    const accent = app?.accent || "#45B8E8";
    const normal = app?.normal || "#42D392";
    const textPrimary = app?.primaryText || "#E8F1FA";
    const textSecondary = app?.secondaryText || "#8EA7BF";

    this.drawScreenHeader(ctx, w, data.header || "RESOURCE RECYCLING & WATER LOOP", "RECYCLER ACTIVE", normal, sol);

    const startY = 66;
    const footerH = 38;
    const availH = h - startY - footerH;

    const colW = Math.floor((w - 44) / 2);

    // Left Box: Potable & Greywater
    ctx.fillStyle = "rgba(16, 35, 50, 0.85)";
    ctx.fillRect(16, startY, colW, availH);
    ctx.strokeStyle = "rgba(69, 184, 232, 0.3)";
    ctx.strokeRect(16, startY, colW, availH);

    ctx.fillStyle = accent;
    ctx.font = "bold 13px monospace";
    ctx.fillText("POTABLE & BUFFER STORAGE", 32, startY + 28);

    ctx.fillStyle = normal;
    ctx.font = "bold 36px monospace";
    ctx.fillText(`${data.potableReservePct ?? 84.0}%`, 32, startY + 74);
    ctx.fillStyle = textSecondary;
    ctx.font = "11px monospace";
    ctx.fillText(`BUFFER: ${data.waterBufferLitres ?? 3200} LITRES REMAINING`, 32, startY + 94);

    this.drawProgressBar(ctx, 32, startY + 104, colW - 64, 14, (data.potableReservePct ?? 84) / 100, normal);

    ctx.fillStyle = textSecondary;
    ctx.font = "bold 12px monospace";
    ctx.fillText("GREYWATER RECYCLING EFFICIENCY", 32, startY + 154);
    ctx.fillStyle = accent;
    ctx.font = "bold 28px monospace";
    ctx.fillText(`${data.greywaterRecyclePct ?? 92.5}%`, 32, startY + 188);

    // Right Box: Filter Life & Catalytic Systems
    const rightX = 16 + colW + 12;
    ctx.fillStyle = "rgba(16, 35, 50, 0.85)";
    ctx.fillRect(rightX, startY, colW, availH);
    ctx.strokeStyle = "rgba(69, 184, 232, 0.3)";
    ctx.strokeRect(rightX, startY, colW, availH);

    ctx.fillStyle = accent;
    ctx.font = "bold 13px monospace";
    ctx.fillText("FILTER CARTRIDGE LIFESPAN", rightX + 32, startY + 28);

    ctx.fillStyle = textPrimary;
    ctx.font = "bold 36px monospace";
    ctx.fillText(`${data.filterLifeRemainingDays ?? 64} SOLS`, rightX + 32, startY + 74);

    this.drawProgressBar(ctx, rightX + 32, startY + 104, colW - 64, 14, (data.filterLifeRemainingDays ?? 64) / 90, accent);

    ctx.fillStyle = textSecondary;
    ctx.font = "bold 12px monospace";
    ctx.fillText("CATALYTIC OXIDIZER STATUS", rightX + 32, startY + 154);
    ctx.fillStyle = normal;
    ctx.font = "bold 28px monospace";
    ctx.fillText(data.catalyticOxidizer || "ACTIVE", rightX + 32, startY + 188);

    this.drawScreenFooter(ctx, w, h, "RESOURCE SUBSYSTEM", "LOOP PRESSURE NOMINAL");
  }

  // =========================================================================
  // 10. LIFE SUPPORT DIAGNOSTICS DISPLAY
  // =========================================================================
  public renderLifeSupportDiagnosticsScreen(
    ctx: CanvasRenderingContext2D,
    data: any,
    w: number,
    h: number,
    sol: number = 1,
    app?: any
  ): void {
    const accent = app?.accent || "#45B8E8";
    const normal = app?.normal || "#42D392";
    const textPrimary = app?.primaryText || "#E8F1FA";
    const textSecondary = app?.secondaryText || "#8EA7BF";

    this.drawScreenHeader(ctx, w, data.header || "AIRFLOW & DUCT INTEGRITY", data.sealIntegrity || "SEAL INTACT", normal, sol);

    const startY = 66;
    const footerH = 38;
    const availH = h - startY - footerH;

    const boxW = w - 32;
    ctx.fillStyle = "rgba(16, 35, 50, 0.85)";
    ctx.fillRect(16, startY, boxW, availH);
    ctx.strokeStyle = "rgba(69, 184, 232, 0.3)";
    ctx.strokeRect(16, startY, boxW, availH);

    // Diagnostics items
    const rows = [
      { label: "AIRFLOW DUCT VELOCITY", val: `${data.velocityMPerS ?? 3.4} m/s`, sub: "TARGET 3.2 - 3.8 m/s", color: normal },
      { label: "PARTICULATE DENSITY", val: `${data.particulatePpm ?? 0.04} ppm`, sub: "HEPA PURITY 99.98%", color: normal },
      { label: "PRESSURE DIFFERENTIAL", val: `${data.ductDifferentialKPa ?? 0.12} kPa`, sub: "NOMINAL DELTA P", color: accent },
      { label: "HEPA FILTER LOAD", val: `${data.hepaFilterLoadPct ?? 28}%`, sub: "INSPECT IN 45 SOLS", color: textPrimary }
    ];

    const rowH = Math.floor((availH - 20) / rows.length);
    rows.forEach((r, idx) => {
      const y = startY + 10 + idx * rowH;

      ctx.fillStyle = textSecondary;
      ctx.font = "bold 11px monospace";
      ctx.fillText(r.label, 36, y + 20);

      ctx.fillStyle = r.color;
      ctx.font = "bold 22px monospace";
      ctx.fillText(r.val, 36, y + 46);

      ctx.fillStyle = textSecondary;
      ctx.font = "11px monospace";
      ctx.textAlign = "right";
      ctx.fillText(r.sub, w - 36, y + 36);
      ctx.textAlign = "left";

      ctx.strokeStyle = "rgba(69, 184, 232, 0.15)";
      ctx.strokeRect(32, y + rowH - 4, boxW - 32, 1);
    });

    this.drawScreenFooter(ctx, w, h, "ECLSS DIAGNOSTICS", "DUCT BUS B");
  }

  // =========================================================================
  // 11. DIAGNOSTICS WORKBENCH DISPLAY (WITH WAVEFORM GRAPH)
  // =========================================================================
  public renderDiagnosticsWorkbenchScreen(
    ctx: CanvasRenderingContext2D,
    data: any,
    w: number,
    h: number,
    sol: number = 1,
    app?: any
  ): void {
    const accent = app?.accent || "#45B8E8";
    const normal = app?.normal || "#42D392";
    const textPrimary = app?.primaryText || "#E8F1FA";
    const textSecondary = app?.secondaryText || "#8EA7BF";

    this.drawScreenHeader(ctx, w, data.header || "DIAGNOSTICS WORKBENCH HARNESS", data.testStatus || "PASSED", normal, sol);

    const startY = 66;
    const footerH = 38;
    const availH = h - startY - footerH;

    const leftW = Math.floor((w - 44) * 0.45);
    const rightX = 16 + leftW + 12;
    const rightW = w - 16 - rightX;

    // Left Panel: Component Under Test
    ctx.fillStyle = "rgba(16, 35, 50, 0.85)";
    ctx.fillRect(16, startY, leftW, availH);
    ctx.strokeStyle = "rgba(69, 184, 232, 0.3)";
    ctx.strokeRect(16, startY, leftW, availH);

    ctx.fillStyle = accent;
    ctx.font = "bold 13px monospace";
    ctx.fillText("ACTIVE TEST HARNESS", 28, startY + 28);

    ctx.fillStyle = textPrimary;
    ctx.font = "bold 16px monospace";
    ctx.fillText(data.testSlot || "SLOT-03 [PUMP RELAY]", 28, startY + 60);

    ctx.fillStyle = normal;
    ctx.font = "bold 20px monospace";
    ctx.fillText(data.testStatus || "PASSED (NO FAULTS)", 28, startY + 92);

    ctx.fillStyle = textSecondary;
    ctx.font = "12px monospace";
    ctx.fillText(`IMPEDANCE: ${data.impedanceOhms ?? 48.2} Ω`, 28, startY + 130);
    ctx.fillText(`SIGNAL/NOISE: ${data.signalToNoiseDb ?? 92.4} dB`, 28, startY + 155);
    ctx.fillText(`COMPONENT HEALTH: ${data.componentHealthPct ?? 99.1}%`, 28, startY + 180);

    this.drawProgressBar(ctx, 28, startY + 195, leftW - 40, 10, (data.componentHealthPct ?? 99.1) / 100, normal);

    // Right Panel: Waveform History Graph
    ctx.fillStyle = "rgba(16, 35, 50, 0.85)";
    ctx.fillRect(rightX, startY, rightW, availH);
    ctx.strokeStyle = "rgba(69, 184, 232, 0.3)";
    ctx.strokeRect(rightX, startY, rightW, availH);

    ctx.fillStyle = accent;
    ctx.font = "bold 12px monospace";
    ctx.fillText("COMPONENT RESPONSE WAVEFORM (mV)", rightX + 16, startY + 26);

    const waveform = data.waveformHistory || [10, 40, 25, 75, 45, 90, 30, 60, 50, 48];
    this.drawTrendGraph(ctx, rightX + 16, startY + 40, rightW - 32, availH - 56, waveform, accent, "rgba(69, 184, 232, 0.15)", 0, 100);

    this.drawScreenFooter(ctx, w, h, "WORKBENCH HARNESS // BENCH 01", "TEST COMPLETE");
  }

  // =========================================================================
  // 12. STORAGE INVENTORY DISPLAY (PORTRAIT 0.650 ASPECT)
  // =========================================================================
  public renderStorageScreen(
    ctx: CanvasRenderingContext2D,
    data: any,
    w: number,
    h: number,
    sol: number = 1,
    app?: any
  ): void {
    const accent = app?.accent || "#45B8E8";
    const normal = app?.normal || "#42D392";
    const textPrimary = app?.primaryText || "#E8F1FA";
    const textSecondary = app?.secondaryText || "#8EA7BF";

    this.drawScreenHeader(ctx, w, data.header || "EQUIPMENT & SPARES INVENTORY", "BAY 01 SECURE", normal, sol);

    const startY = 66;
    const footerH = 38;
    const availH = h - startY - footerH;

    ctx.fillStyle = "rgba(16, 35, 50, 0.85)";
    ctx.fillRect(16, startY, w - 32, availH);
    ctx.strokeStyle = "rgba(69, 184, 232, 0.3)";
    ctx.strokeRect(16, startY, w - 32, availH);

    // Storage capacity header
    ctx.fillStyle = textSecondary;
    ctx.font = "bold 11px monospace";
    ctx.fillText(`TOTAL UNITS: ${data.totalUnits ?? 57} | BAY CAPACITY: ${data.bayCapacityPct ?? 68}%`, 28, startY + 24);

    this.drawProgressBar(ctx, 28, startY + 32, w - 56, 10, (data.bayCapacityPct ?? 68) / 100, accent);

    // Item List
    const items = data.items || [];
    const listY = startY + 54;
    const rowH = Math.floor((availH - 64) / Math.max(1, items.length));

    items.forEach((item: any, idx: number) => {
      const y = listY + idx * rowH;

      ctx.fillStyle = idx % 2 === 0 ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.15)";
      ctx.fillRect(20, y, w - 40, rowH - 2);

      // Icon: Box glyph
      this.drawInventoryGlyph(ctx, 32, y + rowH / 2, accent);

      ctx.fillStyle = textPrimary;
      ctx.font = "bold 12px monospace";
      ctx.fillText(item.name, 52, y + rowH / 2 - 2);

      ctx.fillStyle = textSecondary;
      ctx.font = "11px monospace";
      ctx.fillText(`QTY: ${item.count}`, 52, y + rowH / 2 + 12);

      const isLow = item.status === "LOW STOCK";
      ctx.fillStyle = isLow ? "#F5B942" : normal;
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "right";
      ctx.fillText(item.status, w - 32, y + rowH / 2 + 5);
      ctx.textAlign = "left";
    });

    this.drawScreenFooter(ctx, w, h, "ENGINEERING STORAGE BAY 01", "INVENTORY VERIFIED");
  }

  // =========================================================================
  // DRAWING PRIMITIVES & PROCEDURAL GRAPHICS
  // =========================================================================

  private drawHudGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.strokeStyle = "rgba(14, 34, 53, 0.4)";
    ctx.lineWidth = 1;

    for (let x = 0; x < w; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    for (let y = 0; y < h; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  private drawScreenHeader(
    ctx: CanvasRenderingContext2D,
    w: number,
    title: string,
    subStatus: string,
    statusColor: string,
    sol: number
  ): void {
    ctx.fillStyle = "rgba(16, 35, 48, 0.95)";
    ctx.fillRect(8, 8, w - 16, 44);
    ctx.strokeStyle = "rgba(69, 184, 232, 0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(8, 8, w - 16, 44);

    ctx.fillStyle = "#E88747";
    ctx.font = "bold 16px monospace";
    ctx.fillText(`PHOBOSIA // ${title}`, 20, 36);

    ctx.fillStyle = statusColor;
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "right";
    ctx.fillText(`[${subStatus}]`, w - 130, 36);

    ctx.fillStyle = "#45B8E8";
    ctx.fillText(`SOL 0${sol}`, w - 20, 36);
    ctx.textAlign = "left";
  }

  private drawScreenFooter(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    leftText: string,
    rightText: string
  ): void {
    const y = h - 34;
    ctx.fillStyle = "rgba(10, 24, 36, 0.95)";
    ctx.fillRect(8, y, w - 16, 26);
    ctx.strokeStyle = "rgba(69, 184, 232, 0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(8, y, w - 16, 26);

    ctx.fillStyle = "#8EA7BF";
    ctx.font = "11px monospace";
    ctx.fillText(leftText, 18, y + 17);

    ctx.textAlign = "right";
    ctx.fillText(rightText, w - 18, y + 17);
    ctx.textAlign = "left";
  }

  private drawCornerBrackets(ctx: CanvasRenderingContext2D, w: number, h: number, color: string): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    const len = 14;

    ctx.beginPath();
    ctx.moveTo(6, 6 + len);
    ctx.lineTo(6, 6);
    ctx.lineTo(6 + len, 6);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(w - 6 - len, 6);
    ctx.lineTo(w - 6, 6);
    ctx.lineTo(w - 6, 6 + len);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(6, h - 6 - len);
    ctx.lineTo(6, h - 6);
    ctx.lineTo(6 + len, h - 6);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(w - 6 - len, h - 6);
    ctx.lineTo(w - 6, h - 6);
    ctx.lineTo(w - 6, h - 6 - len);
    ctx.stroke();
  }

  private drawProgressBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    pct: number,
    color: string
  ): void {
    ctx.fillStyle = "rgba(10, 20, 30, 0.9)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(69, 184, 232, 0.4)";
    ctx.strokeRect(x, y, w, h);

    const clamped = Math.max(0, Math.min(1, pct));
    const fillW = Math.max(2, Math.round((w - 2) * clamped));
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, fillW, h - 2);
  }

  private drawTrendGraph(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    points: number[],
    strokeColor: string,
    fillColor: string,
    minVal: number,
    maxVal: number
  ): void {
    // Grid lines inside graph
    ctx.strokeStyle = "rgba(69, 184, 232, 0.15)";
    ctx.lineWidth = 1;
    for (let gy = y; gy <= y + h; gy += h / 4) {
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.lineTo(x + w, gy);
      ctx.stroke();
    }

    if (!points || points.length < 2) return;

    const range = Math.max(0.001, maxVal - minVal);
    const stepX = w / (points.length - 1);

    // Fill area
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    points.forEach((val, i) => {
      const px = x + i * stepX;
      const norm = Math.max(0, Math.min(1, (val - minVal) / range));
      const py = y + h - norm * h;
      ctx.lineTo(px, py);
    });
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    // Line stroke
    ctx.beginPath();
    points.forEach((val, i) => {
      const px = x + i * stepX;
      const norm = Math.max(0, Math.min(1, (val - minVal) / range));
      const py = y + h - norm * h;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Data points dots
    points.forEach((val, i) => {
      const px = x + i * stepX;
      const norm = Math.max(0, Math.min(1, (val - minVal) / range));
      const py = y + h - norm * h;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Procedural Icons
  private drawBatteryGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, pct: number, color: string): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, 64, 32);
    ctx.fillRect(x + 64, y + 8, 4, 16);

    const fillW = Math.max(2, Math.round(58 * Math.max(0, Math.min(1, pct))));
    ctx.fillStyle = color;
    ctx.fillRect(x + 3, y + 3, fillW, 26);
  }

  private drawPowerGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - 8);
    ctx.lineTo(x - 5, y + 2);
    ctx.lineTo(x, y + 2);
    ctx.lineTo(x - 2, y + 10);
    ctx.lineTo(x + 6, y);
    ctx.lineTo(x + 1, y);
    ctx.closePath();
    ctx.fill();
  }

  private drawNetworkGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawInventoryGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 6, y - 6, 12, 12);
    ctx.beginPath();
    ctx.moveTo(x - 6, y);
    ctx.lineTo(x + 6, y);
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x, y + 6);
    ctx.stroke();
  }

  // =========================================================================
  // DATA MANAGEMENT & CLEANUP
  // =========================================================================

  public updateScreenData(screenKey: string, partialData: any): void {
    if (this.configData.screens[screenKey]) {
      const incoming = partialData && typeof partialData === "object" && "data" in partialData ? partialData.data : partialData;
      this.configData.screens[screenKey].data = {
        ...this.configData.screens[screenKey].data,
        ...incoming
      };
      this.configData.screens[screenKey].content = this.configData.screens[screenKey].data;
      const binding = this.activeBindings.find((b) => b.screenKey === screenKey);
      if (binding) {
        this.renderBinding(binding);
        binding.texture.needsUpdate = true;
      }
    }
  }

  public getActiveBindings(): readonly EngineeringScreenBinding[] {
    return this.activeBindings;
  }

  public getBindings(): readonly EngineeringScreenBinding[] {
    return this.activeBindings;
  }

  public getScreenConfig(screenKey: string): any {
    return this.configData.screens[screenKey] || null;
  }

  public getConfigData(): Readonly<EngineeringScreenData> {
    return this.configData;
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
