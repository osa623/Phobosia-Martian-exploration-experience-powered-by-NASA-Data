/**
 * PHOBOSIA — 3D Screen Plane Renderer
 *
 * Renders high-legibility, flat, planar textures onto the authored 3D screen meshes
 * placed inside Blender modules. Normalizes and reprojects planar UVs to fix degenerate,
 * collapsed, or atlas UVs, matching offscreen canvas textures directly to each screen's
 * real physical aspect ratio.
 */

import * as THREE from "three";
import {
  type MissionProgressState,
  type MissionDayNumber,
  DAYS_CONFIG,
  MASTER_TERRAIN_TARGETS
} from "./MissionManager";
import { reprojectPlanarUVs, type PlanarUVOptions } from "./Collision";

export interface ScreenConfigOverride extends PlanarUVOptions {
  aspectRatioOverride?: number;
  width?: number;
  height?: number;
}

export const SCREEN_CONFIG_OVERRIDES: Record<string, ScreenConfigOverride> = {
  Habitat_Workstation_Display: { flipV: true },
  ResearchMonitoring_AnalysisScreen: { flipV: true },
  MonitoringSection_Indicator_Screen: { flipV: true },
  MonitoringSection_Operational_Screen: { flipV: false },
  Airlock_Control_Console: { flipV: false },
  MissionControl_TerrainMapScreen: { flipV: false },
  MissionControl_ObjectivesScreen: { flipV: false },
  MissionControl_DroneOperationScreen: { flipV: false }
};

export interface ScreenMeshBinding {
  nodeName: string;
  mesh: THREE.Mesh;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  material: THREE.MeshBasicMaterial;
  width: number;
  height: number;
  rendererType: string;
}

export class ScreenRenderer {
  private activeBindings: ScreenMeshBinding[] = [];

  constructor() {}

  /**
   * Scans a loaded module model and binds planar canvas textures to authored screen meshes.
   */
  public attachToModule(
    model: THREE.Group,
    moduleName: string,
    missionState: Readonly<MissionProgressState>
  ): void {
    this.dispose();

    model.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;

      const name = mesh.name || "";
      const parentName = mesh.parent?.name || "";
      const identifier = name || parentName;

      const rendererType = this.matchScreenType(moduleName, identifier);
      if (rendererType) {
        // Habitat physical status displays are handled by dedicated HabitatScreenRenderer
        if (
          moduleName === "Habitat" &&
          [
            "Habitat_LifeSupport_Display",
            "Habitat_Main_Status_Display",
            "Habitat_Emergency_Status_Display",
            "Habitat_WaterNutrition_Display"
          ].some(s => identifier.includes(s))
        ) {
          return;
        }

        this.bindScreen(mesh, identifier, rendererType, missionState);
      }
    });

    this.renderAll(moduleName, missionState);
  }

  public matchScreenType(moduleName: string, name: string): string | null {
    // Habitat Screens
    if (/Habitat_Workstation_Display/i.test(name)) return "habitat_workstation";
    if (/Habitat_Main_Status_Display/i.test(name)) return "habitat_main";
    if (/Habitat_LifeSupport_Display/i.test(name)) return "habitat_lifesupport";
    if (/Habitat_WaterNutrition_Display/i.test(name)) return "habitat_nutrition";
    if (/Habitat_Emergency_Status_Display/i.test(name)) return "habitat_emergency";

    // Mission Control Screens
    if (/MissionControl_TerrainMapScreen/i.test(name)) return "mc_terrain_map";
    if (/MissionControl_ObjectivesScreen/i.test(name)) return "mc_objectives";
    if (/MissionControl_OutpostStatusScreen/i.test(name)) return "mc_outpost_status";
    if (/MissionControl_OverviewScreen/i.test(name)) return "mc_overview";
    if (/MissionControl_SystemsScreen/i.test(name)) return "mc_systems";
    if (/MissionControl_CommunicationsScreen/i.test(name)) return "mc_comms";
    if (/MissionControl_DroneOperationScreen/i.test(name)) return "mc_drone";
    if (/MissionControl_ObservationSitesScreen/i.test(name)) return "mc_sites";

    // Engineering Screens
    if (/PowerUnitScreenMain02/i.test(name)) return "eng_power_sub";
    if (/PowerUnitScreenMain/i.test(name)) return "eng_power";
    if (/PowerUnitScreen/i.test(name)) return "eng_power_sub";
    if (/LifeSupportUnitScreenMain04/i.test(name)) return "eng_lifesupport_sub";
    if (/LifeSupportUnitScreen/i.test(name)) return "eng_lifesupport";
    if (/MonitoringSection_Indicator_Screen/i.test(name)) return "eng_indicator";
    if (/MonitoringSection_Operational_Screen/i.test(name)) return "eng_monitoring";
    if (/MonitoringSection_Screen/i.test(name)) return "eng_monitoring";
    if (/DiagnosticsWorkbenchScreen/i.test(name)) return "eng_diagnostics";

    // Airlock Screen
    if (/Airlock_Control_Console/i.test(name)) return "airlock_console";

    // Research / Science Lab Screens
    if (/ResearchMonitoring_MainScreen/i.test(name)) return "science_main";
    if (/ResearchMonitoring_AnalysisScreen/i.test(name)) return "science_analysis";
    if (/ResearchMonitoring_SystemScreen/i.test(name)) return "science_system";
    if (/SeedStorage_InventoryScreen/i.test(name)) return "science_seed";
    if (/WaterNutrition_MixingScreen/i.test(name)) return "science_water_mixing";
    if (/WaterNutrition_QualityScreen/i.test(name)) return "science_water_quality";
    if (/Cultivation_EnvironmentScreen/i.test(name)) return "science_cultivation";

    // Central Hub Screens
    if (/Env_Status_Display/i.test(name)) return "hub_env";
    if (/Module_Status_Display/i.test(name)) return "hub_status";
    if (/Internal_Communication_Display/i.test(name)) return "hub_comms";

    return null;
  }

  private bindScreen(
    mesh: THREE.Mesh,
    identifier: string,
    rendererType: string,
    missionState: Readonly<MissionProgressState>
  ): void {
    // 1. Re-project clean planar UVs onto screen geometry to correct degenerate or collapsed UVs
    const override = SCREEN_CONFIG_OVERRIDES[identifier] || SCREEN_CONFIG_OVERRIDES[mesh.name] || {};
    const planar = reprojectPlanarUVs(mesh.geometry, override);
    const aspect = override.aspectRatioOverride || Math.max(0.25, Math.min(4.0, planar.width / Math.max(0.001, planar.height)));

    // 2. Derive pixel dimensions matched to physical plane aspect ratio
    let width = override.width || 1024;
    let height = override.height || Math.round(1024 / aspect);
    if (!override.height && height > 1024) {
      height = 1024;
      width = Math.round(1024 * aspect);
    }
    width = THREE.MathUtils.clamp(width, 512, 1024);
    height = THREE.MathUtils.clamp(height, 256, 1024);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
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
      side: THREE.DoubleSide
    });

    mesh.material = material;
    mesh.visible = true;

    this.activeBindings.push({
      nodeName: identifier,
      mesh,
      canvas,
      ctx,
      texture,
      material,
      width,
      height,
      rendererType
    });
  }

  /**
   * Redraws all active screen planes with current mission telemetry.
   */
  public renderAll(moduleName: string, missionState: Readonly<MissionProgressState>): void {
    for (const binding of this.activeBindings) {
      this.renderScreen(binding, moduleName, missionState);
      binding.texture.needsUpdate = true;
    }
  }

  private renderScreen(
    b: ScreenMeshBinding,
    moduleName: string,
    state: Readonly<MissionProgressState>
  ): void {
    const { ctx, width: w, height: h, rendererType } = b;

    // Base background
    ctx.fillStyle = "#071017";
    ctx.fillRect(0, 0, w, h);

    // Subtle dark grid
    ctx.strokeStyle = "#0e2230";
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

    // Outer border
    ctx.strokeStyle = "#32576c";
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, w - 8, h - 8);

    // Header bar
    ctx.fillStyle = "#102330";
    ctx.fillRect(8, 8, w - 16, 44);

    ctx.fillStyle = "#e88747";
    ctx.font = "bold 18px monospace";
    ctx.fillText("PHOBOSIA MARS EXPEDITION", 24, 37);

    ctx.fillStyle = "#55cde8";
    ctx.font = "bold 13px monospace";
    ctx.fillText(`SOL ${state.currentDay} · [SIMULATED TELEMETRY]`, w - 260, 37);

    switch (rendererType) {
      case "habitat_main":
        this.drawHabitatMain(ctx, w, h, state);
        break;
      case "habitat_lifesupport":
        this.drawHabitatLifeSupport(ctx, w, h, state);
        break;
      case "habitat_nutrition":
        this.drawHabitatNutrition(ctx, w, h, state);
        break;
      case "habitat_emergency":
        this.drawHabitatEmergency(ctx, w, h, state);
        break;
      case "habitat_workstation":
        this.drawHabitatWorkstation(ctx, w, h, state);
        break;

      case "mc_terrain_map":
        this.drawMCTerrainMap(ctx, w, h, state);
        break;
      case "mc_objectives":
        this.drawMCObjectives(ctx, w, h, state);
        break;
      case "mc_outpost_status":
      case "mc_overview":
      case "mc_systems":
        this.drawMCOutpostStatus(ctx, w, h, state);
        break;
      case "mc_comms":
        this.drawMCComms(ctx, w, h, state);
        break;
      case "mc_drone":
        this.drawMCDrone(ctx, w, h, state);
        break;
      case "mc_sites":
        this.drawMCSites(ctx, w, h, state);
        break;

      case "eng_power":
      case "eng_power_sub":
      case "eng_power_0":
        this.drawEngineeringPower(ctx, w, h, state);
        break;
      case "eng_lifesupport":
      case "eng_lifesupport_sub":
      case "eng_monitoring":
      case "eng_indicator":
      case "eng_diagnostics":
        this.drawEngineeringLifeSupport(ctx, w, h, state);
        break;

      case "science_main":
        this.drawScienceMain(ctx, w, h, state);
        break;
      case "science_analysis":
        this.drawScienceAnalysis(ctx, w, h, state);
        break;
      case "science_system":
      case "science_seed":
      case "science_water_mixing":
      case "science_water_quality":
      case "science_cultivation":
        this.drawScienceSystem(ctx, w, h, state);
        break;

      case "airlock_console":
        this.drawAirlockConsole(ctx, w, h, state);
        break;

      case "hub_env":
      case "hub_status":
      case "hub_comms":
        this.drawHubStatus(ctx, w, h, state);
        break;

      default:
        this.drawDefaultTelemetry(ctx, w, h, b.nodeName, state);
        break;
    }
  }

  // --- Specialized Screen Renderers with Useful Idle Content ---

  private drawHabitatMain(ctx: CanvasRenderingContext2D, w: number, h: number, state: Readonly<MissionProgressState>): void {
    ctx.fillStyle = "#eaf2f4";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("HABITAT PRIMARY ENVIRONMENTAL STATUS", 28, 92);

    ctx.fillStyle = "#8ba8b5";
    ctx.font = "15px monospace";
    ctx.fillText("CABIN PRESSURE: 101.3 kPa (NOMINAL)", 28, 130);
    ctx.fillText("ATMOSPHERE: 21.0% O2 | 78.2% N2 | 0.04% CO2", 28, 160);
    ctx.fillText("TEMPERATURE: 21.4 °C | HUMIDITY: 42.0% RH", 28, 190);
    ctx.fillText("THERMAL LOOP: ACTIVE | RECIRCULATION: 1,200 RPM", 28, 220);

    ctx.fillStyle = "#122a3a";
    ctx.fillRect(28, 255, w - 56, 140);
    ctx.strokeStyle = "#477891";
    ctx.strokeRect(28, 255, w - 56, 140);

    const mission = DAYS_CONFIG[state.currentDay];
    ctx.fillStyle = "#e88747";
    ctx.font = "bold 16px monospace";
    ctx.fillText(`EXPEDITION LOG · SOL 0${state.currentDay}: ${mission.title.toUpperCase()}`, 44, 290);

    ctx.fillStyle = "#d0e2e8";
    ctx.font = "14px sans-serif";
    ctx.fillText(mission.primaryObjective, 44, 320);

    ctx.fillStyle = state.objectiveState === "completed" ? "#44d788" : "#f1b344";
    ctx.font = "bold 15px monospace";
    const statusText =
      state.objectiveState === "completed"
        ? "OBJECTIVE VALIDATED — READY FOR REST PERIOD"
        : `IN PROGRESS (${state.completedStepIds.length} / ${mission.steps.length} STEPS COMPLETED)`;
    ctx.fillText(statusText, 44, 360);
  }

  private drawHabitatWorkstation(ctx: CanvasRenderingContext2D, w: number, h: number, state: Readonly<MissionProgressState>): void {
    ctx.fillStyle = "#55cde8";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("HABITAT SCIENTIFIC WORKSTATION", 28, 92);

    ctx.fillStyle = "#8ba8b5";
    ctx.font = "15px monospace";
    ctx.fillText("USER: MISSION SPECIALIST · TERMINAL ID: HAB-WS01", 28, 130);
    ctx.fillText("NETWORK LINK: UPLINK TO MISSION CONTROL SYNCHRONIZED", 28, 160);
    ctx.fillText("ARCHIVE STORAGE: 4.2 TB NVMe LOCAL DISK READY", 28, 190);

    ctx.fillStyle = "#122a3a";
    ctx.fillRect(28, 230, w - 56, 140);
    ctx.strokeStyle = "#385d73";
    ctx.strokeRect(28, 230, w - 56, 140);

    ctx.fillStyle = "#e88747";
    ctx.font = "bold 15px monospace";
    ctx.fillText("PRESS [E] TO ACCESS DEDICATED PHOBOSIA OS", 44, 270);
    ctx.fillStyle = "#d0e2e8";
    ctx.font = "14px sans-serif";
    ctx.fillText("Launch the full mission operating system to review archives, telemetry, and diagnostics.", 44, 305);
    ctx.fillText("All station applications accessible from any terminal.", 44, 335);
  }

  private drawHabitatLifeSupport(ctx: CanvasRenderingContext2D, w: number, h: number, state: Readonly<MissionProgressState>): void {
    ctx.fillStyle = "#55cde8";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("LIFE SUPPORT DIAGNOSTICS & TELEMETRY", 28, 92);

    const metrics = [
      { name: "SABATIER REACTOR", val: "ONLINE (99.2% EFFICIENCY)" },
      { name: "CO2 SCRUBBER BANK A", val: "0.04% VOL (NOMINAL)" },
      { name: "CABIN PRESSURE BALANCE", val: "101.3 kPa (STABLE)" },
      { name: "THERMAL REGULATION LOOP", val: "21.5 °C (ACTIVE)" },
      { name: "EMERGENCY O2 RESERVES", val: "1,200 L @ 300 bar (100%)" }
    ];

    let y = 140;
    for (const m of metrics) {
      ctx.fillStyle = "#8ba8b5";
      ctx.font = "15px monospace";
      ctx.fillText(m.name, 28, y);
      ctx.fillStyle = "#44d788";
      ctx.font = "bold 15px monospace";
      ctx.fillText(m.val, 320, y);
      y += 40;
    }
  }

  private drawHabitatNutrition(ctx: CanvasRenderingContext2D, w: number, h: number, state: Readonly<MissionProgressState>): void {
    ctx.fillStyle = "#55cde8";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("WATER & NUTRITION MONITORING", 28, 92);

    ctx.fillStyle = "#8ba8b5";
    ctx.font = "15px monospace";
    ctx.fillText("GRAYWATER RECOVERY: 98.4% (NOMINAL)", 28, 140);
    ctx.fillText("POTABLE STORAGE TANK: 1,420 L RESERVED", 28, 180);
    ctx.fillText("HYDROPONIC NUTRIENT SOLUTION: pH 6.2 (OPTIMAL)", 28, 220);
    ctx.fillText("RATION INVENTORY: 14 SOLS AT 2,800 KCAL/SOL", 28, 260);

    ctx.fillStyle = "#44d788";
    ctx.fillRect(28, 300, w - 56, 8);
  }

  private drawHabitatEmergency(ctx: CanvasRenderingContext2D, w: number, h: number, state: Readonly<MissionProgressState>): void {
    ctx.fillStyle = "#f1b344";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("HABITAT SAFETY & EMERGENCY MATRIX", 28, 92);

    ctx.fillStyle = "#8ba8b5";
    ctx.font = "15px monospace";
    ctx.fillText("FIRE SUPPRESSION MATRIX: CHARGED (N2 PURGE)", 28, 140);
    ctx.fillText("HULL INTEGRITY SENSORS: 100% PRESSURE ENVELOPE", 28, 180);
    ctx.fillText("AIRLOCK SEALS: DUAL PNEUMATIC ENGAGED", 28, 220);
    ctx.fillText("AUXILIARY LIFE SUPPORT BATTERY: 100% STANDBY", 28, 260);
  }

  private drawMCTerrainMap(ctx: CanvasRenderingContext2D, w: number, h: number, state: Readonly<MissionProgressState>): void {
    ctx.fillStyle = "#e88747";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("MASTER TERRAIN CARTOGRAPHY & WAYPOINTS", 28, 86);

    const mapX = 28;
    const mapY = 105;
    const mapW = w - 56;
    const mapH = h - 165;

    ctx.fillStyle = "#091722";
    ctx.fillRect(mapX, mapY, mapW, mapH);
    ctx.strokeStyle = "#385d73";
    ctx.strokeRect(mapX, mapY, mapW, mapH);

    // Contours
    ctx.strokeStyle = "#173347";
    ctx.lineWidth = 1;
    for (let r = 40; r < mapW; r += 50) {
      ctx.beginPath();
      ctx.arc(mapX + mapW * 0.45, mapY + mapH * 0.5, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Waypoint markers
    const targets = [
      { t: MASTER_TERRAIN_TARGETS[0], px: mapX + mapW * 0.35, py: mapY + mapH * 0.35 },
      { t: MASTER_TERRAIN_TARGETS[1], px: mapX + mapW * 0.75, py: mapY + mapH * 0.65 },
      { t: MASTER_TERRAIN_TARGETS[2], px: mapX + mapW * 0.18, py: mapY + mapH * 0.8 }
    ];

    for (const item of targets) {
      const isSelected = state.selectedRouteTarget?.id === item.t.id;
      ctx.fillStyle = isSelected ? "#44d788" : "#e88747";
      ctx.beginPath();
      ctx.arc(item.px, item.py, isSelected ? 8 : 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = isSelected ? "#44d788" : "#8ba8b5";
      ctx.font = isSelected ? "bold 13px monospace" : "12px monospace";
      ctx.fillText(item.t.name.split("—")[0].trim(), item.px + 10, item.py + 4);
    }

    ctx.fillStyle = "#102330";
    ctx.fillRect(mapX, h - 46, mapW, 36);
    ctx.fillStyle = state.selectedRouteTarget ? "#44d788" : "#e88747";
    ctx.font = "bold 13px monospace";
    const selectedMsg = state.selectedRouteTarget
      ? `ACTIVE ROUTE: ${state.selectedRouteTarget.name} (${state.selectedRouteTarget.distanceEstimate})`
      : "TERRAIN SURVEY ROUTE PLANNING · ACCESS CONSOLE [E]";
    ctx.fillText(selectedMsg, mapX + 16, h - 23);
  }

  private drawMCObjectives(ctx: CanvasRenderingContext2D, w: number, h: number, state: Readonly<MissionProgressState>): void {
    ctx.fillStyle = "#e88747";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("EXPEDITION OBSERVATION LOG (DAYS 1–9)", 28, 84);

    let y = 115;
    const rowH = 30;
    for (let day = 1; day <= 9; day++) {
      const mission = DAYS_CONFIG[day as MissionDayNumber];
      const isPast = day < state.currentDay;
      const isCurrent = day === state.currentDay;

      ctx.fillStyle = isCurrent ? "#173a4e" : isPast ? "#0f222d" : "#0a161e";
      ctx.fillRect(28, y - 14, w - 56, rowH);
      ctx.strokeStyle = isCurrent ? "#55cde8" : "#284454";
      ctx.strokeRect(28, y - 14, w - 56, rowH);

      ctx.fillStyle = isCurrent ? "#ffffff" : isPast ? "#8ba8b5" : "#456170";
      ctx.font = "bold 13px monospace";
      ctx.fillText(`SOL 0${day}: ${mission.title}`, 40, y + 6);

      const status = isPast
        ? "ARCHIVED"
        : isCurrent
        ? state.objectiveState === "completed"
          ? "VALIDATED"
          : "ACTIVE"
        : "PENDING";
      ctx.fillStyle =
        isPast || (isCurrent && state.objectiveState === "completed")
          ? "#44d788"
          : isCurrent
          ? "#f1b344"
          : "#456170";
      ctx.font = "bold 12px monospace";
      ctx.fillText(status, w - 140, y + 6);

      y += 36;
    }
  }

  private drawMCOutpostStatus(ctx: CanvasRenderingContext2D, w: number, h: number, state: Readonly<MissionProgressState>): void {
    ctx.fillStyle = "#55cde8";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("OUTPOST INTEGRATED SYSTEMS MATRIX", 28, 88);

    const systems = [
      { name: "HABITAT MODULE", status: "NOMINAL", pwr: "4.8 kW" },
      { name: "CENTRAL CONNECTOR HUB", status: "NOMINAL", pwr: "1.2 kW" },
      { name: "ENGINEERING UNIT", status: "ONLINE", pwr: "14.2 kW" },
      { name: "AIRLOCK SYSTEM", status: "STANDBY", pwr: "2.1 kW" },
      { name: "SCIENCE RESEARCH LAB", status: "STANDBY", pwr: "3.5 kW" },
      { name: "ROVER CHARGE BAY", status: "ONLINE", pwr: "0.8 kW" }
    ];

    let y = 135;
    for (const s of systems) {
      ctx.fillStyle = "#8ba8b5";
      ctx.font = "15px monospace";
      ctx.fillText(s.name, 28, y);
      ctx.fillStyle = "#44d788";
      ctx.font = "bold 15px monospace";
      ctx.fillText(s.status, 340, y);
      ctx.fillStyle = "#e88747";
      ctx.fillText(s.pwr, 480, y);
      y += 40;
    }
  }

  private drawMCComms(ctx: CanvasRenderingContext2D, w: number, h: number, state: Readonly<MissionProgressState>): void {
    ctx.fillStyle = "#55cde8";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("DEEP SPACE COMMUNICATIONS LINK", 28, 88);

    ctx.fillStyle = "#8ba8b5";
    ctx.font = "15px monospace";
    ctx.fillText("PRIMARY LINK: X-BAND DISH ARRAY (EARTH DIRECT)", 28, 135);
    ctx.fillText("UPLINK FREQUENCY: 7.15 GHz | DOWNLINK: 8.41 GHz", 28, 175);
    ctx.fillText("SIGNAL DELAY: 14 MIN 22 SEC (ONE-WAY LIGHT TIME)", 28, 215);
    ctx.fillText("LOCAL UHF RELAY: ORBITER ODYSSEY PASS IN 38 MIN", 28, 255);

    ctx.fillStyle = "#44d788";
    ctx.fillRect(28, 295, w - 56, 8);
  }

  private drawMCDrone(ctx: CanvasRenderingContext2D, w: number, h: number, state: Readonly<MissionProgressState>): void {
    ctx.fillStyle = "#55cde8";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("SCOUT DRONE 01 — TELEMETRY & OPERATIONS", 28, 88);

    ctx.fillStyle = "#8ba8b5";
    ctx.font = "15px monospace";
    ctx.fillText("UPLINK FREQUENCY: 8.4 GHz X-BAND · SYNCHRONIZED", 28, 130);
    ctx.fillText("BATTERY: 88% (CELL TEMP: 18.2 °C) · SIGNAL: 96%", 28, 165);
    ctx.fillText("LAUNCH ANCHOR: [470.0, 1.0, -58.7] · MARS TERRAIN", 28, 200);

    const hasSurvey = state.droneSurvey !== null;
    ctx.fillStyle = hasSurvey ? "#44d788" : state.currentDay === 9 ? "#e88747" : "#8ba8b5";
    ctx.font = "bold 15px monospace";
    const statusText = hasSurvey
      ? "SURVEY STATUS: SOL 09 REMOTE SURVEY ARCHIVED"
      : state.currentDay === 9
      ? "SURVEY STATUS: READY FOR FPV SORTIE · ACCESS CONSOLE [E]"
      : "SURVEY STATUS: STANDBY AT LAUNCH DOCK";
    ctx.fillText(statusText, 28, 245);

    ctx.fillStyle = "#122a3a";
    ctx.fillRect(28, 275, w - 56, h - 310);
    ctx.strokeStyle = "#25485c";
    ctx.strokeRect(28, 275, w - 56, h - 310);

    ctx.fillStyle = "#55cde8";
    ctx.font = "13px monospace";
    ctx.fillText("[FPV OPTICAL SENSOR 01] · WIDE-ANGLE SURVEY CAMERA", 44, 305);
    if (state.droneSurvey) {
      ctx.fillStyle = "#44d788";
      ctx.fillText(`CAPTURED RECORD: ${state.droneSurvey.id}`, 44, 335);
      ctx.fillStyle = "#d0e2e8";
      ctx.font = "13px sans-serif";
      ctx.fillText(state.droneSurvey.summary, 44, 365);
    } else {
      ctx.fillStyle = "#8ba8b5";
      ctx.fillText("TARGET: SITE GAMMA CANYON ESCARPMENT [60.7, -0.02, -265.1]", 44, 335);
    }
  }

  private drawMCSites(ctx: CanvasRenderingContext2D, w: number, h: number, state: Readonly<MissionProgressState>): void {
    ctx.fillStyle = "#e88747";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("SURFACE OBSERVATION SITES CATALOG", 28, 88);

    let y = 130;
    for (const t of MASTER_TERRAIN_TARGETS) {
      ctx.fillStyle = "#55cde8";
      ctx.font = "bold 15px monospace";
      ctx.fillText(t.name, 28, y);
      ctx.fillStyle = "#8ba8b5";
      ctx.font = "13px sans-serif";
      ctx.fillText(`${t.description} (${t.distanceEstimate})`, 28, y + 22);
      y += 55;
    }
  }

  private drawEngineeringPower(ctx: CanvasRenderingContext2D, w: number, h: number, state: Readonly<MissionProgressState>): void {
    ctx.fillStyle = "#e88747";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("ENGINEERING POWER DISTRIBUTION UNIT", 28, 88);

    ctx.fillStyle = "#8ba8b5";
    ctx.font = "15px monospace";
    ctx.fillText("PHOTOVOLTAIC CAPTURE: 48.6 kW (SOLAR ARRAYS A/B/C)", 28, 135);
    ctx.fillText("CAPACITOR BANK BALANCE: 96.2% (BALANCED)", 28, 175);
    ctx.fillText("AUXILIARY FUEL CELL: STANDBY (100% READY)", 28, 215);
    ctx.fillText("GRID VOLTAGE: 240 V BUS · 60.0 Hz (NOMINAL)", 28, 255);

    ctx.fillStyle = "#122a3a";
    ctx.fillRect(28, 290, w - 56, 26);
    ctx.fillStyle = "#e88747";
    ctx.fillRect(28, 290, (w - 56) * 0.962, 26);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px monospace";
    ctx.fillText("MAIN BUS LOAD: 96.2% EFFICIENCY", 40, 308);
  }

  private drawEngineeringLifeSupport(ctx: CanvasRenderingContext2D, w: number, h: number, state: Readonly<MissionProgressState>): void {
    ctx.fillStyle = "#55cde8";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("ENGINEERING ENVIRONMENTAL SCRUBBERS", 28, 88);

    ctx.fillStyle = "#8ba8b5";
    ctx.font = "15px monospace";
    ctx.fillText("PRIMARY CO2 SCRUBBER: 0.04% VOL (NOMINAL)", 28, 135);
    ctx.fillText("N2/O2 INJECTION REGULATION: AUTOMATIC", 28, 175);
    ctx.fillText("TRACE CONTAMINANT FILTER: OK", 28, 215);
    ctx.fillText("CABIN RECIRCULATION LOOP: 1,200 RPM", 28, 255);

    ctx.fillStyle = "#44d788";
    ctx.fillRect(28, 295, w - 56, 8);
  }

  private drawScienceMain(ctx: CanvasRenderingContext2D, w: number, h: number, state: Readonly<MissionProgressState>): void {
    ctx.fillStyle = "#55cde8";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("RESEARCH LAB — SCIENTIFIC MONITORING", 28, 88);

    ctx.fillStyle = "#8ba8b5";
    ctx.font = "15px monospace";
    ctx.fillText("INCUBATION CHAMBERS: 4/4 STABLE (20.0 °C)", 28, 130);
    ctx.fillText("ATMOSPHERIC STABILITY: N2/CO2 CONTROL NOMINAL", 28, 165);
    ctx.fillText("RAMAN SPECTROMETER: CALIBRATED (532 nm LASER)", 28, 200);
    ctx.fillText("X-RAY DIFFRACTOMETER: STANDBY", 28, 235);

    ctx.fillStyle = "#122a3a";
    ctx.fillRect(28, 265, w - 56, 120);
    ctx.strokeStyle = "#477891";
    ctx.strokeRect(28, 265, w - 56, 120);

    ctx.fillStyle = "#e88747";
    ctx.font = "bold 15px monospace";
    ctx.fillText(`RESEARCH PROGRAM · SOL 0${state.currentDay}`, 44, 298);

    ctx.fillStyle = "#d0e2e8";
    ctx.font = "14px sans-serif";
    if (state.currentDay < 7) {
      ctx.fillText("Awaiting outdoor surface observation data from upcoming field sorties.", 44, 330);
    } else if (state.currentDay === 7) {
      ctx.fillText("Sol 07 Surface Observation in progress. Sample data pending transfer.", 44, 330);
    } else if (state.currentDay === 8) {
      ctx.fillText("Sol 08 Laboratory Analysis active. Access Analysis console [E] to review.", 44, 330);
    } else {
      ctx.fillText("Sol 08 Laboratory Analysis completed. Telemetry archived.", 44, 330);
    }
  }

  private drawScienceAnalysis(ctx: CanvasRenderingContext2D, w: number, h: number, state: Readonly<MissionProgressState>): void {
    ctx.fillStyle = "#e88747";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("RESEARCH LAB — SPECTRAL & SURFACE ANALYSIS", 28, 88);

    // Left Panel: Source Observation
    ctx.fillStyle = "#122a3a";
    ctx.fillRect(28, 105, (w - 70) / 2, 175);
    ctx.strokeStyle = "#385d73";
    ctx.strokeRect(28, 105, (w - 70) / 2, 175);

    ctx.fillStyle = "#55cde8";
    ctx.font = "bold 14px monospace";
    ctx.fillText("SOURCE DATA: SOL 07 OBSERVATION", 44, 132);

    ctx.fillStyle = "#d0e2e8";
    ctx.font = "12px monospace";
    if (state.surfaceObservation) {
      ctx.fillStyle = "#44d788";
      ctx.fillText(`ID: ${state.surfaceObservation.id}`, 44, 158);
      ctx.fillStyle = "#d0e2e8";
      ctx.fillText(`Pattern: ${state.surfaceObservation.observedCategories.surfacePattern}`, 44, 182);
      ctx.fillText(`Area: ${state.surfaceObservation.observedCategories.areaOfInterest}`, 44, 206);
      ctx.fillStyle = "#44d788";
      ctx.fillText("STATUS: VERIFIED & PARSED", 44, 235);
    } else {
      ctx.fillStyle = "#f1b344";
      ctx.fillText("STATUS: NO SOL 07 RECORD FOUND", 44, 158);
      ctx.fillStyle = "#8ba8b5";
      ctx.fillText("Complete Sol 07 Surface Observation", 44, 185);
      ctx.fillText("before running lab analysis.", 44, 210);
    }

    // Right Panel: Interpretation
    const rightX = 28 + (w - 70) / 2 + 14;
    ctx.fillStyle = "#122a3a";
    ctx.fillRect(rightX, 105, (w - 70) / 2, 175);
    ctx.strokeStyle = "#385d73";
    ctx.strokeRect(rightX, 105, (w - 70) / 2, 175);

    ctx.fillStyle = "#55cde8";
    ctx.font = "bold 14px monospace";
    ctx.fillText("CROSS-REFERENCE & SYNTHESIS", rightX + 16, 132);

    ctx.fillStyle = "#d0e2e8";
    ctx.font = "12px monospace";
    if (state.scienceAnalysis) {
      ctx.fillStyle = "#44d788";
      ctx.fillText("ANALYSIS RECORD: ARCHIVED", rightX + 16, 158);
      ctx.fillStyle = "#d0e2e8";
      ctx.fillText(`Interpretation: ${state.scienceAnalysis.selectedInterpretationId}`, rightX + 16, 182);
      ctx.fillText(`Cross-ref: ${state.scienceAnalysis.comparedSurveyId ?? "None"}`, rightX + 16, 206);
    } else if (state.geologicalSurvey) {
      ctx.fillStyle = "#44d788";
      ctx.fillText(`Sol 06 Geology: ${state.geologicalSurvey.id}`, rightX + 16, 158);
      ctx.fillStyle = "#8ba8b5";
      ctx.fillText("Comparison ready. Awaiting interpretation.", rightX + 16, 185);
    } else {
      ctx.fillStyle = "#8ba8b5";
      ctx.fillText("Single-source observation analysis ready.", rightX + 16, 170);
    }

    // Spectrogram graph
    ctx.fillStyle = "#091722";
    ctx.fillRect(28, 295, w - 56, h - 330);
    ctx.strokeStyle = "#25485c";
    ctx.strokeRect(28, 295, w - 56, h - 330);

    ctx.strokeStyle = "#55cde8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const specW = w - 80;
    const specH = h - 355;
    const baseY = 295 + specH;
    for (let i = 0; i < specW; i += 4) {
      const freq = i * 0.04;
      const peak1 = Math.exp(-Math.pow((i - specW * 0.28) / 25, 2)) * 50;
      const peak2 = Math.exp(-Math.pow((i - specW * 0.55) / 35, 2)) * 75;
      const peak3 = Math.exp(-Math.pow((i - specW * 0.78) / 20, 2)) * 40;
      const noise = (Math.sin(freq * 3) + Math.cos(freq * 7)) * 3;
      const val = baseY - (peak1 + peak2 + peak3 + noise + 10);
      if (i === 0) ctx.moveTo(40 + i, val);
      else ctx.lineTo(40 + i, val);
    }
    ctx.stroke();

    ctx.fillStyle = "#8ba8b5";
    ctx.font = "11px monospace";
    ctx.fillText("RELATIVE REFLECTANCE SPECTROMETRY (SIMULATED CALIBRATION: 400nm - 1100nm)", 40, h - 18);
  }

  private drawScienceSystem(ctx: CanvasRenderingContext2D, w: number, h: number, state: Readonly<MissionProgressState>): void {
    ctx.fillStyle = "#55cde8";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("RESEARCH LAB — INSTRUMENTATION SYSTEMS", 28, 88);

    ctx.fillStyle = "#8ba8b5";
    ctx.font = "15px monospace";
    ctx.fillText("CENTRIFUGAL PARTICULATE SEPARATOR: 6,000 RPM (STABLE)", 28, 135);
    ctx.fillText("ULTRA-HIGH VACUUM CHAMBER: 1.2 x 10^-6 mbar", 28, 175);
    ctx.fillText("CRYO-STORAGE VAULT: -80.0 °C (LIQUID N2 BACKUP OK)", 28, 215);
    ctx.fillText("X-RAY POWDER DIFFRACTOMETER: READY", 28, 255);

    ctx.fillStyle = "#44d788";
    ctx.fillRect(28, 295, w - 56, 8);
  }

  private drawAirlockConsole(ctx: CanvasRenderingContext2D, w: number, h: number, state: Readonly<MissionProgressState>): void {
    ctx.fillStyle = "#55cde8";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("AIRLOCK DEPRESSURIZATION CONSOLE", 30, 188);

    ctx.fillStyle = "#8ba8b5";
    ctx.font = "15px monospace";
    ctx.fillText("INNER HATCH: SECURED", 28, 135);
    ctx.fillText("OUTER HATCH: SECURED", 28, 175);
    ctx.fillText("CHAMBER PRESSURE: 101.3 kPa", 28, 215);
    ctx.fillText("TERRAIN AMBIENT: 0.006 bar (CO2 DOMINANT)", 28, 255);
    ctx.fillText("SUIT TELEMETRY LINK: SYNCED", 28, 295);

    ctx.fillStyle = "#e88747";
    ctx.font = "bold 13px monospace";
    ctx.fillText("EVA STATUS: READY FOR TERRAIN OBSERVATION", 28, 345);
  }

  private drawHubStatus(ctx: CanvasRenderingContext2D, w: number, h: number, state: Readonly<MissionProgressState>): void {
    ctx.fillStyle = "#55cde8";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("CENTRAL CONNECTOR TRANSIT HUB", 28, 88);

    ctx.fillStyle = "#8ba8b5";
    ctx.font = "15px monospace";
    ctx.fillText("→ HABITAT UNIT [SOUTH CORRIDOR]", 28, 135);
    ctx.fillText("→ AIRLOCK & MARS TERRAIN [WEST CORRIDOR]", 28, 175);
    ctx.fillText("→ ENGINEERING UNIT [NORTH-EAST CORRIDOR]", 28, 215);
    ctx.fillText("→ SCIENCE RESEARCH LAB [EAST CORRIDOR]", 28, 255);
    ctx.fillText("→ MISSION CONTROL [NORTH CORRIDOR]", 28, 295);

    ctx.fillStyle = "#e88747";
    ctx.font = "bold 13px monospace";
    ctx.fillText("ALL CORRIDOR SEALS NOMINAL · TRANSIT SAFE", 28, 345);
  }

  private drawDefaultTelemetry(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    name: string,
    state: Readonly<MissionProgressState>
  ): void {
    ctx.fillStyle = "#55cde8";
    ctx.font = "bold 20px monospace";
    ctx.fillText(`SUBSYSTEM: ${name.toUpperCase()}`, 28, 88);

    ctx.fillStyle = "#8ba8b5";
    ctx.font = "14px monospace";
    ctx.fillText("STATUS: ACTIVE · TELEMETRY NOMINAL", 28, 135);
    ctx.fillText(`ACTIVE MISSION SOL: 0${state.currentDay} / 14`, 28, 175);
    ctx.fillText("SAMPLING RATE: 10 Hz · LOCAL BUFFER SYNCHRONIZED", 28, 215);
  }

  public dispose(): void {
    for (const b of this.activeBindings) {
      b.material.dispose();
      b.texture.dispose();
    }
    this.activeBindings = [];
  }
}
