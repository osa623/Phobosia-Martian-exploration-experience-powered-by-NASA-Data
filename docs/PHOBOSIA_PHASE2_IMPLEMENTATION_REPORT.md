# PHOBOSIA — Phase 2 Implementation Report
## Days 1–5 Mission System, 3D Screen Rendering, Module Interactions, Professional UI & Validation

**Project:** PHOBOSIA (Martian First-Person Scientific Observation Experience)  
**Root Directory:** `F:\Phobosia`  
**Specification Reference:** `src/jsons/PHOBOSIA_Days_1-5_Specification.json`  
**Date:** October 26, 2026  
**Git Branch:** `dev`  

---

## 1. Repository & System Audit

### 1.1 Architecture & Stack Verification
- **Framework:** Next.js `15.2.4` (App Router, static optimization)
- **UI / Runtime:** React `19.0.0` & React-DOM `19.0.0`
- **3D Graphics:** Three.js `0.174.0` (with `GLTFLoader`, `EXRLoader`)
- **Language / Typing:** TypeScript `5.8.2` (strict mode)
- **3D Modules:** Blender binary glTF (`.glb`) assets located in `public/assets/models/`:
  - `AirLock.glb`, `Central_Connector.glb`, `Engineering.glb`, `Habitat_Zone.glb`, `Mission_Control.glb`, `Science_Zone.glb`, `mars_Terrain.glb`
- **Master Terrain:** `mars_Terrain.glb` with `PHOBOSIA_MarsTerrain_2km` mesh, Raycaster ground-height detection from `(x, 1000, z)` downwards.
- **Visual References Inspected:** `public/assets/shots/` (`HabitatShot.png`, `MissionControlShot.png`, `EngineeringShot.png`, `AirLockShot.png`, `centralConnectorpng.png`).

---

## 2. Trigger, Screen & 3D Plane Inventory

### 2.1 Entrance Triggers & Verified Destination Mappings
| Trigger Identifier | Parent Module | Target Destination | Destination Module | Spawn Marker | Video Path | Status |
|---|---|---|---|---|---|---|
| `Habitat_Entrance_Trigger` | Central Hub | Habitat | `Habitat` | `HABITAT_SPAWN_POINT` | `/assets/videos/Habitat_Entrance.mp4` | Verified |
| `HAB_EXIT_TRIGGER` (`.001`) | Habitat | Central Hub | `Hub` | `Habitat_Entrance_Trigger` | None | Verified |
| `Main_Entrance_Trigger` | Central Hub | Airlock | `Airlock` | `Central_Hub_Entrance_Trigger` | `/assets/videos/AirLock.mp4` | Verified |
| `Central_Hub_Entrance_Trigger` | Airlock | Central Hub | `Hub` | `Main_Entrance_Trigger` | None | Verified |
| `Terrain_Entrance_Trigger` | Airlock | Mars Terrain | `Terrain` | `Spwaning_Position` | None | Verified |
| `Spwaning_Position` | Mars Terrain | Airlock | `Airlock` | `Terrain_Entrance_Trigger` | None | Verified |
| `Engineering_Entrance_Trigger` | Central Hub | Engineering Unit | `Engineering` | `Engineering_Entrance` | `/assets/videos/Engineering_Entrance.mp4` | Verified |
| `Engineering_Entrance` | Engineering | Central Hub | `Hub` | `Engineering_Entrance_Trigger` | None | Verified |
| `ScienceLab_Entrance_Trigger` | Central Hub | Research Lab | `Science` | `SCIENCE_LAB_SPAWN_POINT` | `/assets/videos/ReserachLab_Entrance.mp4` | Verified |
| `LAB_EXIT_TRIGGER` | Science Lab | Central Hub | `Hub` | `ScienceLab_Entrance_Trigger` | None | Verified |
| `MissionControl_Entrance_Trigger` | Central Hub | Mission Control | `MissionControl` | `MissionControl_Entrance_Trigger` | `/assets/videos/MissionControl_Entrance.mp4` | Verified |
| `MissionControl_Entrance_Trigger` | Mission Control | Central Hub | `Hub` | `MissionControl_Entrance_Trigger` | None | Verified |

### 2.2 Verified Scene Objects
- **`Rover`:** Node 87 in `mars_Terrain.glb` (`trans=[6.32, -0.44, 0.23]`, `scale=[1.32, 1.32, 1.32]`).
- **`Rover_Front_Wheels`:** Node 81 in `mars_Terrain.glb` (mesh `Rover_wheel_1_Rover_2ver_0`).
- **`Rover_Middle_Wheels`:** Node 82 in `mars_Terrain.glb` (actual Blender node name `Rover_Midde_Wheels`, mesh `Rover_wheel_2_Rover_2ver_0`).
- **`Rover_Rear_Wheels`:** Node 83 in `mars_Terrain.glb` (mesh `Rover_wheel_3_Rover_2ver_0`).
- **`Drone_Object`:** Node 4 in `mars_Terrain.glb` (Empty anchor at `(470.00, 1.02, -58.71)`).
- **`Cinematic_Location`:** Node 5 in `mars_Terrain.glb` (Overlook empty anchor at `(60.73, -0.03, -265.10)`).
- **`HAB_WORKSTATION_01`:** Node 85 in `Habitat_Zone.glb` (Cylinder mesh at `(-0.65, 0.16, -2.61)`).

### 2.3 3D Screen Plane Inventory & Aspect Ratios
| Module | Screen Object Name | Mesh Node | Measured World Dimensions ($W \times H$) | Aspect Ratio | Assigned Telemetry & Content |
|---|---|---|---|---|---|
| **Habitat** | `Habitat_Main_Status_Display` | `Cube.029` | $1.93\text{ m} \times 1.34\text{ m}$ | 1.44:1 | Habitat Main Status, Sol & Objective Checklist |
| **Habitat** | `Habitat_LifeSupport_Display` | `Cube.032` | $1.88\text{ m} \times 1.37\text{ m}$ | 1.37:1 | Life Support Diagnostics & Scrubbers |
| **Habitat** | `Habitat_WaterNutrition_Display` | `Cube.034` | $0.93\text{ m} \times 0.98\text{ m}$ | 0.95:1 | Potable water reserve, graywater recovery |
| **Habitat** | `Habitat_Emergency_Status_Display` | `Cube.030` | $1.37\text{ m} \times 1.26\text{ m}$ | 1.08:1 | Hull integrity & emergency power feed |
| **Mission Control** | `MissionControl_TerrainMapScreen` | `Cube.013` | $2.50\text{ m} \times 2.50\text{ m}$ | 1.00:1 (Square) | Master Terrain 2D Tactical Contour Map & Sites $\alpha, \beta, \gamma$ |
| **Mission Control** | `MissionControl_ObjectivesScreen` | `Cube.008` | $3.31\text{ m} \times 2.64\text{ m}$ | 1.25:1 | 14-Day Campaign Log & Day Status |
| **Mission Control** | `MissionControl_OutpostStatusScreen` | `Cube.009` | $3.31\text{ m} \times 2.64\text{ m}$ | 1.25:1 | Outpost subsystem load & power allocations |
| **Mission Control** | `MissionControl_CommunicationsScreen` | `Cube.011` | $4.04\text{ m} \times 2.13\text{ m}$ | 1.90:1 | Deep Space Network & UHF link telemetry |
| **Mission Control** | `MissionControl_SystemsScreen` | `Cube.010` | $4.04\text{ m} \times 2.13\text{ m}$ | 1.90:1 | Outpost electrical distribution telemetry |
| **Engineering** | `PowerUnitScreenMain` | `Cube.036` | $3.26\text{ m} \times 2.34\text{ m}$ | 1.39:1 | Solar array output ($48.6\text{ kW}$) & capacitor bank |
| **Engineering** | `PowerUnitScreenMain02` | `Cube.037` | $4.26\text{ m} \times 2.34\text{ m}$ | 1.82:1 | High-capacity energy storage grid telemetry |
| **Engineering** | `LifeSupportUnitScreenMain03]` | `Cube.042` | $1.65\text{ m} \times 1.40\text{ m}$ | 1.18:1 | Atmospheric CO2 scrubber ($0.04\%\text{ vol}$) & thermal loop |
| **Engineering** | `MonitoringSection_Indicator_Screen`| `Plane` | $1.72\text{ m} \times 1.07\text{ m}$ | 1.61:1 | Operational monitoring telemetry |
| **Airlock** | `Airlock_Control_Console` | `Cube.015` | $1.69\text{ m} \times 1.74\text{ m}$ | 0.97:1 | Chamber pressure, hatch seals & suit link |
| **Central Hub** | `Env_Status_Display` | `Sphere.006` | $1.97\text{ m} \times 0.84\text{ m}$ | 2.34:1 | Directional corridor guide & transit status |
| **Central Hub** | `Module_Status_Display` | `Sphere.007` | $2.17\text{ m} \times 1.05\text{ m}$ | 2.06:1 | Module environmental safety indicator |

---

## 3. Mission Implementation (Days 1–5)

### Day 1 — Base Orientation
- **Required Steps:**
  1. `DAY1_REVIEW_CONTROLS`: Locomotion and interaction controls reviewed.
  2. `DAY1_VISIT_CENTRAL_HUB`: Transit to Central Hub.
  3. `DAY1_INSPECT_BASE_AREAS`: Inspect work area console (`HAB_MONITOR_01`).
  4. `DAY1_CONFIRM_ORIENTATION`: Orientation checklist confirmed.
- **Actual Interactions Used:** `Habitat_Entrance_Trigger`, `HAB_MONITOR_01`.
- **Screens Activated:** `Habitat_Main_Status_Display`, `Env_Status_Display`.
- **Data Saved:** Observation record `orientation` with base readiness status.
- **Completion Rule:** All 4 steps validated. Enables Habitat Rest action.
- **Rest Advancement:** Resting at `HAB_REST_01` advances Sol 1 to Sol 2.

### Day 2 — Habitat Readiness
- **Required Steps:**
  1. `DAY2_ENTER_HABITAT`: Enter Habitat module.
  2. `DAY2_INSPECT_READINESS`: Inspect water recycling & hydroponics (`HAB_WATER_NUTRITION_01`).
  3. `DAY2_RECORD_STATUS`: Log Habitat readiness validation (`HAB_MONITOR_01`).
- **Actual Interactions Used:** `HAB_WATER_NUTRITION_01`, `HAB_MONITOR_01`.
- **Screens Activated:** `Habitat_LifeSupport_Display`, `Habitat_WaterNutrition_Display`.
- **Data Saved:** `habitat_readiness` record (water recovery $98.4\%$, pressure $101.3\text{ kPa}$, $O_2$ $21.0\%$).
- **Completion Rule:** Required readiness steps logged.
- **Rest Advancement:** Resting at `HAB_REST_01` advances Sol 2 to Sol 3.

### Day 3 — Power System Observation
- **Required Steps:**
  1. `DAY3_REACH_ENGINEERING`: Transit to Engineering via Hub.
  2. `DAY3_INSPECT_POWER`: Inspect Engineering Power Unit (`Engineering_PowerUnit_Trigger`).
  3. `DAY3_RECORD_POWER_OBSERVATION`: Save baseline power observation.
- **Actual Interactions Used:** `Engineering_Entrance_Trigger`, `Engineering_PowerUnit_Trigger`.
- **Screens Activated:** `PowerUnitScreenMain`, `PowerUnitScreenMain02`.
- **Data Saved:** `power_observation` record (solar array $48.6\text{ kW}$, capacitor balance $96.2\%$, grid voltage $240\text{ V}$).
- **Completion Rule:** Observation record saved to mission state.
- **Rest Advancement:** Resting at `HAB_REST_01` advances Sol 3 to Sol 4.

### Day 4 — Life-Support Verification
- **Required Steps:**
  1. `DAY4_REACH_RELEVANT_MODULE`: Reach Engineering or Habitat life support area.
  2. `DAY4_INSPECT_LIFE_SUPPORT`: Inspect life-support diagnostics (`Engineering_LifeSupport_Trigger`).
  3. `DAY4_RECORD_VERIFICATION`: Log verification report.
- **Actual Interactions Used:** `Engineering_LifeSupport_Trigger` / `Habitat_LifeSupport_Display`.
- **Screens Activated:** `LifeSupportUnitScreenMain03]`, `Habitat_LifeSupport_Display`.
- **Data Saved:** `life_support_verification` record ($CO_2$ scrubber $0.04\%\text{ vol}$, cabin temp $21.5^\circ\text{C}$).
- **Completion Rule:** Verification record saved.
- **Rest Advancement:** Resting at `HAB_REST_01` advances Sol 4 to Sol 5.

### Day 5 — Terrain Route Planning
- **Required Steps:**
  1. `DAY5_REACH_MISSION_CONTROL`: Transit to Mission Control via Hub.
  2. `DAY5_REVIEW_MASTER_TERRAIN`: Review Master Terrain map on `MissionControl_TerrainMapScreen`.
  3. `DAY5_SELECT_ROUTE_OR_TARGET`: Select survey candidate (Site Alpha, Beta, or Gamma).
  4. `DAY5_SAVE_ROUTE_PLAN`: Confirm and register route plan in telemetry.
- **Actual Interactions Used:** `MissionControl_Entrance_Trigger`, `MC_NAVIGATION_01`, Route Planning Modal.
- **Screens Activated:** `MissionControl_TerrainMapScreen`, `MissionControl_ObjectivesScreen`.
- **Data Saved:** `route_plan` record with selected target coordinates and hazard rating.
- **Completion Rule:** Route plan validated and confirmed.
- **Phase Boundary Rule:** Day 5 does **not** advance to Day 6. Acknowledged as completion of Phase 2 campaign.

---

## 4. UI & Rendering Implementation Details

### 4.1 Outdoor Astronaut Helmet HUD
- Implemented as a zero-overhead CSS overlay active strictly when `isOutdoorTerrain` is true (`active === "Terrain"`).
- Features a dark curved visor rim (`.visor-frame`) with vignette shading (`box-shadow`), leaving the central view unobstructed for scientific exploration.
- Top-right HUD shows simulated suit telemetry: pressure ($0.38\text{ bar}$), $O_2$ mix ($21.0\%$), core temperature ($21.4^\circ\text{C}$), UHF comm link status, clearly labelled `SIMULATED SUIT TELEMETRY`.
- Center-bottom compass strip displays heading in degrees.
- Guaranteed to never occlude loading screens, transition videos, or modal dialogues.

### 4.2 3D Screen Distortion Fix & Plane Layouts
- **Root Cause of Text Distortion:** Previous approaches attempted spherical/panoramic projection or uniform 16:9 texture scaling on non-16:9 flat planar and curved meshes (`Sphere.006`, `Cube.029`, `Cube.013`).
- **The Solution:** [ScreenRenderer.ts](file:///f:/Phobosia/src/core/ScreenRenderer.ts) calculates the geometry bounding box of each screen plane and dynamically creates a matching aspect-ratio offscreen `HTMLCanvasElement` ($1024 \times 512$, $1024 \times 768$, or $768 \times 768$).
- Applied with `THREE.DoubleSide` and `THREE.SRGBColorSpace` directly onto authored meshes.
- Event-driven re-rendering: Canvas textures are only redrawn when mission state or active module changes, preserving target GPU performance.

### 4.3 Rest & Day Advance Guarding
- Interacting with `HAB_REST_01` runs `missionManager.canRestAndAdvance()`.
- If required steps are incomplete, advancement is blocked and an explanation listing the missing steps is displayed.
- If validated, advances the day exactly once, updates localStorage, triggers the new day's briefing modal, and updates all 3D screen planes.
- Protected against spamming/duplicate key events via a debounce lock.

---

## 5. Files Changed & Added

1. **`src/core/MissionManager.ts` (New):** Authoritative mission state machine, step validation, observation record persistence, and guarded rest logic for Days 1–5.
2. **`src/core/ScreenRenderer.ts` (New):** Three.js screen plane renderer generating aspect-ratio-matched canvas textures for all module displays.
3. **`src/core/EventBus.ts` (Modified):** Extended `GameState` interface with mission telemetry, briefing modal state, helmet HUD flag, and route planning state.
4. **`src/core/Game.ts` (Modified):** Integrated `MissionManager` and `ScreenRenderer`, wired trigger interactions, protected screen meshes from visibility hiding, and connected outdoor helmet HUD logic.
5. **`src/components/game/GameViewport.tsx` (Modified):** Rendered the outdoor helmet HUD, mission progress badge, briefing dialog, route planning modal, and rest feedback.
6. **`src/app/globals.css` (Modified):** Added styles for the astronaut helmet visor, tactical map cards, mission HUD, and modal dialogs.
7. **`tests/mission_tests.js` (New):** 9-test automated test suite verifying mission logic, idempotency, record saving, and rest gating.
8. **`package.json` (Modified):** Added `npm test` script.

---

## 6. Verification & Automated Test Results

### 6.1 Automated Unit & Integration Tests (`npm test`)
- Command: `npm test`
- Output:
```
=== PHOBOSIA PHASE 2 AUTOMATED MISSION TESTS ===

  ✓ PASS: Initial state is Day 1 with in_progress status
  ✓ PASS: Rest is blocked when Day 1 objective is incomplete
  ✓ PASS: Step completion is tracked and idempotent against duplicate events
  ✓ PASS: Day 1 completes when all steps are validated, and rest advances to Day 2 exactly once
  ✓ PASS: Repeated rest input cannot skip a day
  ✓ PASS: Day 2 Habitat readiness completes and stores simulated observation record
  ✓ PASS: Day 3 Power observation logs baseline telemetry and advances to Day 4
  ✓ PASS: Day 4 Life-support verification records telemetry and advances to Day 5
  ✓ PASS: Day 5 Route planning validates selection and strictly prevents advancing to Day 6

Results: 9 / 9 tests passed.
ALL PHASE 2 MISSION TESTS PASSED SUCCESSFULLY.
```

### 6.2 TypeScript Compilation Check (`npm run typecheck`)
- Command: `npm run typecheck` (`tsc --noEmit`)
- Result: **PASSED (Exit code 0)** with zero diagnostics.

### 6.3 Production Next.js Build (`npm run build`)
- Command: `npm run build` (`next build`)
- Result: **PASSED (Exit code 0)**. Optimized static pages generated for `/` and `/_not-found`.

---

## 7. Remaining Limitations & Manual Checks

1. **Hardware Evaluation:** Visual frame rates with 3D canvas textures should be verified on the target NVIDIA MX350 GPU in a running browser.
2. **Audio/Video Playback:** Transition video playback (`.mp4`) depends on browser autoplay permissions; Enter-to-skip is provided as a verified fallback.
3. **Phase 2 Boundary:** In strict adherence to the specification, Days 6–14 gameplay, Rover driving, and Drone flight were not implemented in this phase.

---

## 8. Recommended Next Phase (Phase 3)

With Days 1–5 mission systems, 3D screen rendering, and interactive telemetry fully validated:
- **Phase 3 Recommendation:** Implement Days 6–8 (Geological Site Survey, Surface Observation, Scientific Sample Analysis), integrating surface waypoint markers on Master Terrain for the selected Day 5 survey target.
