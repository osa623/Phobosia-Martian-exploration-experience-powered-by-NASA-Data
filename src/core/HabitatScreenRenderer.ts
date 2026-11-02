/**
 * PHOBOSIA — Habitat-Specific Physical Screen Rendering System
 *
 * Dedicated modular screen renderer for the Habitat module's 4 physical 3D displays:
 * 1. Habitat_LifeSupport_Display
 * 2. Habitat_Main_Status_Display
 * 3. Habitat_Emergency_Status_Display
 * 4. Habitat_WaterNutrition_Display
 *
 * Independently driven by `src/jsons/Screens/habitatScreenData.json`.
 * Features per-screen planar UV reprojection, aspect-ratio-matched offscreen canvases,
 * clean scientific telemetry aesthetics, dynamic live data updates, and thorough resource disposal.
 */

import * as THREE from "three";
import { reprojectPlanarUVs } from "./Collision";
import { getScreenConfigForSol, type ScreenMissionSnapshot } from "./ScreenConfigRegistry";
import { drawSol07Banner, isSol07StormPresentationActive, renderSol07UnitScreen } from "../missions/sol-07/Sol07ScreenRenderer";

// Dynamic resolver for Node CommonJS tests vs Next.js Webpack bundler
function loadHabitatScreenData(): HabitatScreenData {
  try {
    // In Next.js / Webpack bundling from src/core
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("../jsons/Screens/habitatScreenData.json");
  } catch {
    try {
      // In dist/ during Node test execution
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return eval("require")("../src/jsons/Screens/habitatScreenData.json");
    } catch {
      return {
        moduleId: "Habitat",
        moduleName: "Habitat Zone",
        dataMode: "SIMULATED",
        version: 1,
        rendering: {
          renderingSystem: "HabitatScreenRenderer",
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

const habitatDataJson = loadHabitatScreenData();

export interface HabitatScreenData {
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

export interface HabitatScreenBinding {
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

export class HabitatScreenRenderer {
  private configData: HabitatScreenData;
  private activeBindings: HabitatScreenBinding[] = [];
  private missionDay: number = 1;
  private completedStepIds: string[] = [];
  private configSol = 4;
  private customConfig: boolean;
  private readinessRecord: string | null = null;

  constructor(customConfig?: HabitatScreenData) {
    // Clone config to allow independent runtime mutations
    this.customConfig = Boolean(customConfig);
    this.configData = customConfig ? JSON.parse(JSON.stringify(customConfig)) : JSON.parse(JSON.stringify(habitatDataJson));
  }

  private selectSolConfig(sol: number) {
    if (this.customConfig || this.configSol === sol) return;
    this.configData = JSON.parse(JSON.stringify(getScreenConfigForSol("habitat", sol, habitatDataJson)));
    this.configSol = sol;
  }

  /**
   * Scans Habitat module model and binds planar canvas textures to the 4 physical screen meshes.
   */
  public attachToHabitat(model: THREE.Group, missionState?: ScreenMissionSnapshot): void {
    this.dispose();

    if (missionState?.currentDay) {
      this.missionDay = missionState.currentDay;
    }
    this.completedStepIds = missionState?.completedStepIds ?? [];
    this.selectSolConfig(this.missionDay);
    if (missionState?.observationRecords) {
      const record = missionState.observationRecords.find(item => item.day === 2 && item.type === "habitat_readiness");
      this.readinessRecord = record?.summary ?? null;
    }

    const targetScreenKeys = Object.keys(this.configData.screens);

    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;

      const name = mesh.name || "";
      const parentName = mesh.parent?.name || "";

      // Match against configured screen identifiers
      const screenKey = targetScreenKeys.find(
        (key) => key === name || key === parentName || name.includes(key) || parentName.includes(key)
      );

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
    const uAxis = orientation.uAxis;
    const vAxis = orientation.vAxis;

    // 2. Reproject planar UVs across the physical mesh geometry with verified axis mapping
    reprojectPlanarUVs(mesh.geometry, { uAxis, vAxis, flipU, flipV });

    // 3. Compute optimal canvas dimensions matching screen aspect ratio
    const geom = screenConf.geometry || {};
    const aspect = geom.aspectRatio || (geom.screenWidth && geom.screenHeight ? geom.screenWidth / geom.screenHeight : 1.33);

    let canvasWidth = 1024;
    let canvasHeight = Math.round(1024 / aspect);

    // Keep dimensions bounded for performance (2GB VRAM target)
    if (aspect < 1.0) {
      canvasHeight = 896;
      canvasWidth = Math.round(896 * aspect);
    }

    canvasWidth = THREE.MathUtils.clamp(canvasWidth, 512, 1024);
    canvasHeight = THREE.MathUtils.clamp(canvasHeight, 512, 1024);

    // Ensure even dimensions
    if (canvasWidth % 2 !== 0) canvasWidth++;
    if (canvasHeight % 2 !== 0) canvasHeight++;

    // 4. Create offscreen canvas (or fallback if in non-DOM environment)
    if (typeof document === "undefined") {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 5. Create CanvasTexture with crisp filtering
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide
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
      rendererFunction: screenConf.rendering?.rendererFunction || "renderHabitatMainStatusDisplay",
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
    if (missionState?.observationRecords) {
      const record = missionState.observationRecords.find(item => item.day === 2 && item.type === "habitat_readiness");
      this.readinessRecord = record?.summary ?? null;
    }

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
  public renderBinding(binding: HabitatScreenBinding): void {
    const { ctx, width, height, screenKey } = binding;
    if (this.missionDay === 7 && screenKey === "Habitat_Emergency_Status_Display") {
      renderSol07UnitScreen(ctx, width, height, "habitatAlert", { currentDay: this.missionDay, completedStepIds: this.completedStepIds });
      return;
    }
    const screenConf = this.configData.screens[screenKey];
    if (!screenConf) return;

    const data = screenConf.data || {};
    const app = screenConf.appearance || {};

    // Clear canvas
    ctx.fillStyle = app.background || "#07111F";
    ctx.fillRect(0, 0, width, height);

    // Common HUD Grid Background
    this.drawHudGrid(ctx, width, height);

    // Delegate to dedicated screen render functions
    switch (screenKey) {
      case "Habitat_LifeSupport_Display":
        this.renderHabitatLifeSupportDisplay(ctx, data, width, height, this.missionDay, app);
        break;
      case "Habitat_Main_Status_Display":
        this.renderHabitatMainStatusDisplay(ctx, data, width, height, this.missionDay, app, this.readinessRecord);
        break;
      case "Habitat_Emergency_Status_Display":
        this.renderHabitatEmergencyStatusDisplay(ctx, data, width, height, this.missionDay, app);
        break;
      case "Habitat_WaterNutrition_Display":
        this.renderHabitatWaterNutritionDisplay(ctx, data, width, height, this.missionDay, app);
        break;
      default:
        this.renderHabitatMainStatusDisplay(ctx, data, width, height, this.missionDay, app);
        break;
    }

    // Outer physical bezel border
    ctx.strokeStyle = app.accent || "#45B8E8";
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, width - 6, height - 6);

    // Corner brackets
    if (isSol07StormPresentationActive({ currentDay: this.missionDay, completedStepIds: this.completedStepIds })) drawSol07Banner(ctx, width, height, "SOL 7 · DUST STORM ALERT", "Review the emergency notice on this display and acknowledge it before proceeding.");
    this.drawCornerBrackets(ctx, width, height, app.accent || "#45B8E8");
  }

  // =========================================================================
  // 1. LIFE SUPPORT DISPLAY RENDERER
  // =========================================================================
  public renderHabitatLifeSupportDisplay(
    ctx: CanvasRenderingContext2D,
    data: any,
    w: number,
    h: number,
    missionDay: number = 1,
    app?: any
  ): void {
    const accent = app?.accent || "#45B8E8";
    const normal = app?.normal || "#42D392";
    const textPrimary = app?.primaryText || "#E8F1FA";
    const textSecondary = app?.secondaryText || "#8EA7BF";

    // Header Bar
    this.drawScreenHeader(
      ctx,
      w,
      data.header || "LIFE SUPPORT",
      `SYSTEM: ${data.systemStatus?.value || "OPERATIONAL"}`,
      normal,
      missionDay
    );

    // 2x3 Grid for 6 Environmental Parameters
    const startY = 70;
    const footerH = 44;
    const availH = h - startY - footerH;
    const cardGap = 14;
    const cols = 2;
    const rows = 3;
    const cardW = Math.floor((w - 32 - cardGap * (cols - 1)) / cols);
    const cardH = Math.floor((availH - cardGap * (rows - 1)) / rows);

    const metrics = [
      {
        label: data.oxygen?.label || "OXYGEN CONCENTRATION",
        val: `${data.oxygen?.value ?? 21.0}${data.oxygen?.unit || "%"}`,
        sub: "TARGET: 20.9% - 21.5%",
        pct: (data.oxygen?.value ?? 21.0) / 25,
        status: data.oxygen?.status || "NORMAL"
      },
      {
        label: data.cabinPressure?.label || "CABIN PRESSURE",
        val: `${data.cabinPressure?.value ?? 101.3} ${data.cabinPressure?.unit || "kPa"}`,
        sub: "TARGET: 101.3 kPa (1.0 ATM)",
        pct: (data.cabinPressure?.value ?? 101.3) / 120,
        status: data.cabinPressure?.status || "NORMAL"
      },
      {
        label: data.temperature?.label || "CABIN TEMPERATURE",
        val: `${data.temperature?.value ?? 21.5}${data.temperature?.unit || "°C"}`,
        sub: "SETPOINT: 21.0°C ± 1.5°C",
        pct: ((data.temperature?.value ?? 21.5) - 10) / 20,
        status: data.temperature?.status || "NORMAL"
      },
      {
        label: data.humidity?.label || "RELATIVE HUMIDITY",
        val: `${data.humidity?.value ?? 42}${data.humidity?.unit || "%"}`,
        sub: "NOMINAL: 40% - 50%",
        pct: (data.humidity?.value ?? 42) / 100,
        status: data.humidity?.status || "NORMAL"
      },
      {
        label: data.carbonDioxide?.label || "CARBON DIOXIDE",
        val: `${data.carbonDioxide?.value ?? 0.08}${data.carbonDioxide?.unit || "%"}`,
        sub: "SCRUBBER: LOW PCO2",
        pct: (data.carbonDioxide?.value ?? 0.08) / 0.5,
        status: data.carbonDioxide?.status || "NORMAL"
      },
      {
        label: data.airFiltration?.label || "AIR FILTRATION SYSTEM",
        val: `${data.airFiltration?.value || "OPERATIONAL"}`,
        sub: "HEPA + MOLECULAR SIEVE ACTIVE",
        pct: 1.0,
        status: data.airFiltration?.status || "NORMAL"
      }
    ];

    metrics.forEach((m, idx) => {
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      const x = 16 + c * (cardW + cardGap);
      const y = startY + r * (cardH + cardGap);

      // Card Background
      ctx.fillStyle = "rgba(16, 35, 50, 0.75)";
      ctx.fillRect(x, y, cardW, cardH);
      ctx.strokeStyle = "rgba(69, 184, 232, 0.25)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, cardW, cardH);

      // Status indicator light
      ctx.fillStyle = normal;
      ctx.beginPath();
      ctx.arc(x + 14, y + 18, 4, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = textSecondary;
      ctx.font = "bold 13px 'Consolas', monospace";
      ctx.fillText(m.label, x + 26, y + 22);

      // Main Value
      ctx.fillStyle = textPrimary;
      ctx.font = "bold 26px 'Consolas', monospace";
      ctx.fillText(m.val, x + 16, y + cardH - 34);

      // Subtitle / nominal range
      ctx.fillStyle = accent;
      ctx.font = "11px 'Consolas', monospace";
      ctx.fillText(m.sub, x + 16, y + cardH - 14);

      // Mini Telemetry Gauge Bar
      const barX = x + cardW - 110;
      const barY = y + cardH - 36;
      const barW = 94;
      const barH = 14;

      ctx.fillStyle = "rgba(10, 20, 30, 0.9)";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.strokeStyle = "rgba(69, 184, 232, 0.4)";
      ctx.strokeRect(barX, barY, barW, barH);

      const fillW = Math.max(4, Math.min(barW, Math.round(barW * m.pct)));
      ctx.fillStyle = normal;
      ctx.fillRect(barX + 1, barY + 1, fillW - 2, barH - 2);
    });

    // Footer
    this.drawScreenFooter(ctx, w, h, "ENVIRONMENTAL MONITORING", "SIMULATED TELEMETRY · 1000ms");
  }

  // =========================================================================
  // 2. MAIN STATUS DISPLAY RENDERER
  // =========================================================================
  public renderHabitatMainStatusDisplay(
    ctx: CanvasRenderingContext2D,
    data: any,
    w: number,
    h: number,
    missionDay: number = 1,
    app?: any,
    readinessRecord: string | null = null
  ): void {
    const accent = app?.accent || "#45B8E8";
    const normal = app?.normal || "#42D392";
    const textPrimary = app?.primaryText || "#E8F1FA";
    const textSecondary = app?.secondaryText || "#8EA7BF";

    // Header Bar
    this.drawScreenHeader(
      ctx,
      w,
      data.header || "HABITAT STATUS",
      `OVERALL: ${data.overallStatus?.value || "OPERATIONAL"}`,
      normal,
      missionDay
    );

    // Left Column: Key Systems Matrix (60% width)
    // Right Column: Summary & Telemetry Gauges (40% width)
    const startY = 70;
    const footerH = 44;
    const availH = h - startY - footerH;
    const leftW = Math.floor((w - 44) * 0.58);
    const rightW = w - 44 - leftW;
    const rightX = 16 + leftW + 12;

    // --- Left Subsystems Panel ---
    ctx.fillStyle = "rgba(16, 35, 50, 0.75)";
    ctx.fillRect(16, startY, leftW, availH);
    ctx.strokeStyle = "rgba(69, 184, 232, 0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(16, startY, leftW, availH);

    // Panel Header
    ctx.fillStyle = "rgba(20, 48, 70, 0.9)";
    ctx.fillRect(16, startY, leftW, 30);
    ctx.fillStyle = accent;
    ctx.font = "bold 13px 'Consolas', monospace";
    ctx.fillText("CRITICAL SUBSYSTEMS STATUS", 28, startY + 20);

    const systems = [
      { name: "POWER DISTRIBUTION GRID", status: data.powerSystem?.value || "NOMINAL", detail: "Solar Array + Fuel Cell Online", pct: 0.94 },
      { name: "LIFE SUPPORT (ECLSS)", status: data.environmentalSystem?.value || "STABLE", detail: "Pressure & Atmosphere Nominal", pct: 0.98 },
      { name: "SURFACE COMMUNICATIONS", status: data.communications?.value || "CONNECTED", detail: "Direct Link to Mission Control", pct: 1.0 },
      { name: "HABITAT HULL INTEGRITY", status: data.habitatIntegrity?.value || "NOMINAL", detail: "Micrometeorite Shielding Intact", pct: 1.0 },
      { name: "AIRLOCK SYSTEM INTERFACE", status: "READY", detail: "Inner Seal Pressurized (101.3 kPa)", pct: 1.0 },
      { name: "THERMAL CONTROL LOOP", status: "NOMINAL", detail: "Radiator Pump Speed: 78 RPM", pct: 0.88 }
    ];

    const rowH = Math.floor((availH - 34) / systems.length);
    systems.forEach((sys, i) => {
      const y = startY + 32 + i * rowH;

      ctx.fillStyle = i % 2 === 0 ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.15)";
      ctx.fillRect(18, y, leftW - 4, rowH - 2);

      // Status indicator circle
      ctx.fillStyle = normal;
      ctx.beginPath();
      ctx.arc(32, y + rowH / 2, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // System Name
      ctx.fillStyle = textPrimary;
      ctx.font = "bold 13px 'Consolas', monospace";
      ctx.fillText(sys.name, 46, y + rowH / 2 - 4);

      // System Detail
      ctx.fillStyle = textSecondary;
      ctx.font = "11px 'Consolas', monospace";
      ctx.fillText(sys.detail, 46, y + rowH / 2 + 12);

      // Status Pill
      ctx.fillStyle = "rgba(66, 211, 146, 0.15)";
      ctx.fillRect(leftW - 110, y + (rowH - 24) / 2, 94, 24);
      ctx.strokeStyle = normal;
      ctx.strokeRect(leftW - 110, y + (rowH - 24) / 2, 94, 24);

      ctx.fillStyle = normal;
      ctx.font = "bold 11px 'Consolas', monospace";
      ctx.textAlign = "center";
      ctx.fillText(sys.status, leftW - 63, y + (rowH - 24) / 2 + 16);
      ctx.textAlign = "left";
    });

    // --- Right Telemetry Cards ---
    const rightCards = [
      {
        title: "MISSION ACTIVE SOL",
        val: `SOL 0${missionDay}`,
        sub: `PHOBOSIA CAMPAIGN · DAY ${missionDay}`,
        color: accent
      },
      {
        title: "ACTIVE SYSTEM ALERTS",
        val: `${data.activeAlerts?.value ?? 0}`,
        sub: "ALL MONITORED SYSTEMS STABLE",
        color: normal
      },
      {
        title: "HABITAT OCCUPANCY",
        val: "1 ASTRONAUT",
        sub: "RESEARCH EXPEDITION ACTIVE",
        color: textPrimary
      }
    ];
    if (missionDay === 2) {
      rightCards.push({
        title: "HABITAT READINESS RECORD",
        val: readinessRecord ? "RECORDED" : "PENDING",
        sub: readinessRecord ? "SIMULATED RESULT SAVED" : "Complete the readiness check to record a result",
        color: readinessRecord ? normal : accent
      });
    }

    const rightCardH = Math.floor((availH - 16) / rightCards.length);
    rightCards.forEach((rc, i) => {
      const y = startY + i * (rightCardH + 8);

      ctx.fillStyle = "rgba(16, 35, 50, 0.75)";
      ctx.fillRect(rightX, y, rightW, rightCardH);
      ctx.strokeStyle = "rgba(69, 184, 232, 0.3)";
      ctx.strokeRect(rightX, y, rightW, rightCardH);

      ctx.fillStyle = textSecondary;
      ctx.font = "bold 12px 'Consolas', monospace";
      ctx.fillText(rc.title, rightX + 16, y + 24);

      ctx.fillStyle = rc.color;
      ctx.font = "bold 32px 'Consolas', monospace";
      ctx.fillText(rc.val, rightX + 16, y + 62);

      ctx.fillStyle = textSecondary;
      ctx.font = "11px 'Consolas', monospace";
      ctx.fillText(rc.sub, rightX + 16, y + 84);
    });

    // Footer
    this.drawScreenFooter(ctx, w, h, "HABITAT OPERATIONS", "SIMULATED TELEMETRY · 1000ms");
  }

  // =========================================================================
  // 3. EMERGENCY STATUS DISPLAY RENDERER
  // =========================================================================
  public renderHabitatEmergencyStatusDisplay(
    ctx: CanvasRenderingContext2D,
    data: any,
    w: number,
    h: number,
    missionDay: number = 1,
    app?: any
  ): void {
    const normal = app?.normal || "#42D392";
    const textPrimary = app?.primaryText || "#E8F1FA";
    const textSecondary = app?.secondaryText || "#8EA7BF";

    // Header Bar
    this.drawScreenHeader(
      ctx,
      w,
      data.header || "EMERGENCY STATUS",
      "MONITOR: ARMED",
      normal,
      missionDay
    );

    // Large Prominent Status Banner
    const startY = 70;
    const bannerH = 92;
    ctx.fillStyle = "rgba(16, 60, 40, 0.45)";
    ctx.fillRect(16, startY, w - 32, bannerH);
    ctx.strokeStyle = normal;
    ctx.lineWidth = 2;
    ctx.strokeRect(16, startY, w - 32, bannerH);

    // Large Glowing Status Pill
    ctx.fillStyle = normal;
    ctx.font = "bold 34px 'Consolas', monospace";
    ctx.fillText("● ALL CLEAR", 36, startY + 44);

    ctx.fillStyle = textPrimary;
    ctx.font = "14px 'Consolas', monospace";
    ctx.fillText(
      data.message?.description || "All monitored emergency conditions are currently clear.",
      38,
      startY + 72
    );

    // Emergency Subsystems Checklist
    const listY = startY + bannerH + 16;
    const footerH = 44;
    const listH = h - listY - footerH;

    ctx.fillStyle = "rgba(16, 35, 50, 0.75)";
    ctx.fillRect(16, listY, w - 32, listH);
    ctx.strokeStyle = "rgba(69, 184, 232, 0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(16, listY, w - 32, listH);

    // Checklist Header
    ctx.fillStyle = "rgba(20, 48, 70, 0.9)";
    ctx.fillRect(16, listY, w - 32, 30);
    ctx.fillStyle = normal;
    ctx.font = "bold 13px 'Consolas', monospace";
    ctx.fillText("AUTOMATED EMERGENCY SENSORS & SYSTEM DIAGNOSTICS", 28, listY + 20);

    const emergencyItems = [
      { label: "ATMOSPHERIC DEPRESSURIZATION SENSORS", state: "NOMINAL", detail: "Cabin pressure rate: 0.00 kPa/min" },
      { label: "THERMAL RUNAWAY & FIRE DETECTION", state: "SECURE", detail: "Zero smoke/ionization particles detected" },
      { label: "HABITAT STRUCTURAL STRAIN MONITORS", state: "NOMINAL", detail: "Hull tension within structural elastic limit" },
      { label: "TOXIC CONTAMINANT / HAZMAT SCANNERS", state: "CLEAR", detail: "Trace gas levels below permissible threshold" },
      { label: "SOLAR PARTICLE EVENT (SPE) SHIELD", state: "ARMED", detail: "Storm shelter passive shielding active" }
    ];

    const rowH = Math.floor((listH - 34) / emergencyItems.length);
    emergencyItems.forEach((item, idx) => {
      const y = listY + 32 + idx * rowH;

      ctx.fillStyle = idx % 2 === 0 ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.15)";
      ctx.fillRect(18, y, w - 36, rowH - 2);

      // Checkmark icon
      ctx.fillStyle = normal;
      ctx.font = "bold 16px 'Consolas', monospace";
      ctx.fillText("[OK]", 32, y + rowH / 2 + 5);

      // Title
      ctx.fillStyle = textPrimary;
      ctx.font = "bold 13px 'Consolas', monospace";
      ctx.fillText(item.label, 80, y + rowH / 2 - 4);

      // Detail
      ctx.fillStyle = textSecondary;
      ctx.font = "11px 'Consolas', monospace";
      ctx.fillText(item.detail, 80, y + rowH / 2 + 13);

      // Status Tag
      ctx.fillStyle = normal;
      ctx.font = "bold 12px 'Consolas', monospace";
      ctx.textAlign = "right";
      ctx.fillText(item.state, w - 36, y + rowH / 2 + 5);
      ctx.textAlign = "left";
    });

    // Footer
    this.drawScreenFooter(ctx, w, h, "EMERGENCY MONITORING", "SIMULATED TELEMETRY · NO ACTIVE ALERTS");
  }

  // =========================================================================
  // 4. WATER AND NUTRITION DISPLAY RENDERER
  // =========================================================================
  public renderHabitatWaterNutritionDisplay(
    ctx: CanvasRenderingContext2D,
    data: any,
    w: number,
    h: number,
    missionDay: number = 1,
    app?: any
  ): void {
    const accent = app?.accent || "#45B8E8";
    const normal = app?.normal || "#42D392";
    const textPrimary = app?.primaryText || "#E8F1FA";
    const textSecondary = app?.secondaryText || "#8EA7BF";

    // Header Bar
    this.drawScreenHeader(
      ctx,
      w,
      data.header || "WATER & NUTRITION",
      "RESERVES: STABLE",
      normal,
      missionDay
    );

    const startY = 70;
    const footerH = 44;
    const availH = h - startY - footerH;

    // Split vertically into 2 main modules:
    // Top: Water Systems (Water Reserve + Daily Consumption + Recycling)
    // Bottom: Nutrition & Food Systems (Food Inventory + Nutrition + Cultivation)
    const sectionH = Math.floor((availH - 12) / 2);

    // --- SECTION 1: WATER SYSTEMS ---
    ctx.fillStyle = "rgba(16, 35, 50, 0.75)";
    ctx.fillRect(16, startY, w - 32, sectionH);
    ctx.strokeStyle = "rgba(69, 184, 232, 0.3)";
    ctx.strokeRect(16, startY, w - 32, sectionH);

    // Section Header
    ctx.fillStyle = "rgba(20, 48, 70, 0.9)";
    ctx.fillRect(16, startY, w - 32, 28);
    ctx.fillStyle = accent;
    ctx.font = "bold 12px 'Consolas', monospace";
    ctx.fillText("WATER RESERVES & RECYCLING LOOP", 28, startY + 19);

    // Water Reserve Progress Bar
    const waterPct = data.waterReserve?.value ?? 82;
    ctx.fillStyle = textSecondary;
    ctx.font = "12px 'Consolas', monospace";
    ctx.fillText("POTABLE WATER STORAGE", 28, startY + 52);

    ctx.fillStyle = textPrimary;
    ctx.font = "bold 20px 'Consolas', monospace";
    ctx.fillText(`${waterPct}%`, w - 80, startY + 52);

    // Visual Meter
    const meterX = 28;
    const meterY = startY + 62;
    const meterW = w - 56;
    const meterH = 18;

    ctx.fillStyle = "rgba(10, 20, 30, 0.9)";
    ctx.fillRect(meterX, meterY, meterW, meterH);
    ctx.strokeStyle = "rgba(69, 184, 232, 0.4)";
    ctx.strokeRect(meterX, meterY, meterW, meterH);

    const fillW = Math.max(4, Math.round(meterW * (waterPct / 100)));
    ctx.fillStyle = accent;
    ctx.fillRect(meterX + 1, meterY + 1, fillW - 2, meterH - 2);

    // Water Stats Columns
    const statsY = startY + 98;
    const colW = Math.floor((w - 56) / 2);

    // Daily Consumption
    ctx.fillStyle = textSecondary;
    ctx.font = "11px 'Consolas', monospace";
    ctx.fillText("DAILY CONSUMPTION RATE", 28, statsY);
    ctx.fillStyle = textPrimary;
    ctx.font = "bold 18px 'Consolas', monospace";
    ctx.fillText(`${data.dailyWaterConsumption?.value ?? 3.2} ${data.dailyWaterConsumption?.unit || "L"}/SOL`, 28, statsY + 22);

    // Recycling Efficiency
    ctx.fillStyle = textSecondary;
    ctx.font = "11px 'Consolas', monospace";
    ctx.fillText("CLOSED-LOOP EFFICIENCY", 28 + colW, statsY);
    ctx.fillStyle = normal;
    ctx.font = "bold 18px 'Consolas', monospace";
    ctx.fillText(`${data.waterRecycling?.efficiency ?? 91}% ${data.waterRecycling?.status || "OPERATIONAL"}`, 28 + colW, statsY + 22);

    // --- SECTION 2: NUTRITION & FOOD SUPPLIES ---
    const sec2Y = startY + sectionH + 12;
    ctx.fillStyle = "rgba(16, 35, 50, 0.75)";
    ctx.fillRect(16, sec2Y, w - 32, sectionH);
    ctx.strokeStyle = "rgba(69, 184, 232, 0.3)";
    ctx.strokeRect(16, sec2Y, w - 32, sectionH);

    // Section Header
    ctx.fillStyle = "rgba(20, 48, 70, 0.9)";
    ctx.fillRect(16, sec2Y, w - 32, 28);
    ctx.fillStyle = accent;
    ctx.font = "bold 12px 'Consolas', monospace";
    ctx.fillText("FOOD INVENTORY & CULTIVATION", 28, sec2Y + 19);

    const foodCards = [
      {
        label: "RATION INVENTORY",
        val: data.foodInventory?.value || "SUFFICIENT",
        detail: "180 Sols of caloric meals",
        color: normal
      },
      {
        label: "NUTRITION & VITAMINS",
        val: data.nutritionSupplies?.value || "NORMAL",
        detail: "Micro-nutrient packs intact",
        color: normal
      },
      {
        label: "HYDROPONIC CULTIVATION",
        val: data.cultivation?.value || "OPERATIONAL",
        detail: "Seedling cycle nominal",
        color: accent
      }
    ];

    const cardRowH = Math.floor((sectionH - 38) / foodCards.length);
    foodCards.forEach((fc, idx) => {
      const y = sec2Y + 32 + idx * cardRowH;

      ctx.fillStyle = idx % 2 === 0 ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.15)";
      ctx.fillRect(18, y, w - 36, cardRowH - 2);

      ctx.fillStyle = textSecondary;
      ctx.font = "bold 11px 'Consolas', monospace";
      ctx.fillText(fc.label, 28, y + 18);

      ctx.fillStyle = fc.color;
      ctx.font = "bold 15px 'Consolas', monospace";
      ctx.fillText(fc.val, 28, y + 36);

      ctx.fillStyle = textSecondary;
      ctx.font = "11px 'Consolas', monospace";
      ctx.textAlign = "right";
      ctx.fillText(fc.detail, w - 36, y + 28);
      ctx.textAlign = "left";
    });

    // Footer
    this.drawScreenFooter(ctx, w, h, "RESOURCE MONITORING", "SIMULATED TELEMETRY · 2000ms");
  }

  // =========================================================================
  // SHARED DRAWING HELPERS
  // =========================================================================

  private drawHudGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.strokeStyle = "rgba(14, 34, 53, 0.4)";
    ctx.lineWidth = 1;

    for (let x = 0; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    for (let y = 0; y < h; y += 40) {
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
    // Header Bar Fill
    ctx.fillStyle = "rgba(16, 35, 48, 0.95)";
    ctx.fillRect(8, 8, w - 16, 48);
    ctx.strokeStyle = "rgba(69, 184, 232, 0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(8, 8, w - 16, 48);

    // Left Title
    ctx.fillStyle = "#E88747";
    ctx.font = "bold 18px 'Consolas', monospace";
    ctx.fillText(`PHOBOSIA // ${title}`, 24, 38);

    // Right Status Badges
    ctx.fillStyle = statusColor;
    ctx.font = "bold 13px 'Consolas', monospace";
    ctx.textAlign = "right";
    ctx.fillText(`[${subStatus}]`, w - 140, 38);

    ctx.fillStyle = "#45B8E8";
    ctx.fillText(`SOL 0${sol}`, w - 24, 38);
    ctx.textAlign = "left";
  }

  private drawScreenFooter(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    leftText: string,
    rightText: string
  ): void {
    const y = h - 38;
    ctx.fillStyle = "rgba(10, 24, 36, 0.95)";
    ctx.fillRect(8, y, w - 16, 30);
    ctx.strokeStyle = "rgba(69, 184, 232, 0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(8, y, w - 16, 30);

    ctx.fillStyle = "#8EA7BF";
    ctx.font = "11px 'Consolas', monospace";
    ctx.fillText(leftText, 20, y + 19);

    ctx.textAlign = "right";
    ctx.fillText(rightText, w - 20, y + 19);
    ctx.textAlign = "left";
  }

  private drawCornerBrackets(ctx: CanvasRenderingContext2D, w: number, h: number, color: string): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    const len = 16;

    // Top Left
    ctx.beginPath();
    ctx.moveTo(8, 8 + len);
    ctx.lineTo(8, 8);
    ctx.lineTo(8 + len, 8);
    ctx.stroke();

    // Top Right
    ctx.beginPath();
    ctx.moveTo(w - 8 - len, 8);
    ctx.lineTo(w - 8, 8);
    ctx.lineTo(w - 8, 8 + len);
    ctx.stroke();

    // Bottom Left
    ctx.beginPath();
    ctx.moveTo(8, h - 8 - len);
    ctx.lineTo(8, h - 8);
    ctx.lineTo(8 + len, h - 8);
    ctx.stroke();

    // Bottom Right
    ctx.beginPath();
    ctx.moveTo(w - 8 - len, h - 8);
    ctx.lineTo(w - 8, h - 8);
    ctx.lineTo(w - 8, h - 8 - len);
    ctx.stroke();
  }

  // =========================================================================
  // DATA MANAGEMENT & CLEANUP
  // =========================================================================

  /**
   * Updates runtime data for a specific screen and triggers a re-render.
   */
  public updateScreenData(screenKey: string, partialData: any): void {
    if (this.configData.screens[screenKey]) {
      this.configData.screens[screenKey].data = {
        ...this.configData.screens[screenKey].data,
        ...partialData
      };
      const binding = this.activeBindings.find((b) => b.screenKey === screenKey);
      if (binding) {
        this.renderBinding(binding);
        binding.texture.needsUpdate = true;
      }
    }
  }

  /**
   * Retrieves active bindings for testing and inspection.
   */
  public getActiveBindings(): readonly HabitatScreenBinding[] {
    return this.activeBindings;
  }

  /**
   * Retrieves current configuration for a screen.
   */
  public getScreenConfig(screenKey: string): any {
    return this.configData.screens[screenKey] || null;
  }

  /**
   * Disposes of all CanvasTextures, materials, and active bindings to prevent VRAM memory leaks.
   */
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
