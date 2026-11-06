# Master Terrain Dynamic Day/Night Environment — Implementation Report

## Summary

Added Master Terrain-only night switching using `/assets/exr/NightSkyHDRI008_4K_HDR.exr`, retaining the running app's daytime EXR `/assets/exr/mars-dunes-day-light_2K_fc2ff73b-6eed-4836-92ed-f94e0d2d649f.exr`. Eligibility checks the current SOL's required task IDs and authoritative completion records. Seven valid marker locations create real SpotLights aimed at the loaded Habitat bounds. The lights and night environment are disabled outside an eligible nighttime session. A six-hour active-gameplay timer persists elapsed time separately from mission progress.

## Architecture discovered

- `src/core/Game.ts` owns the single WebGL renderer, active module scene, EXR loader, PMREM resources, shadow settings, model cache, animation loop, and cleanup.
- `src/core/MissionManager.ts` owns authoritative mission state. `DAYS_CONFIG` supplies required steps for SOL 2–9; SOL 1 uses `DAY1_TASKS.filter(task => task.required)`. No general mission-acceptance or active-task flag exists. Eligibility also checks special SOL records and Sol 5 drone attempt state.
- Terrain shadow flags are already configured by `configureMeshShadows`; the renderer already enables PCF soft shadows. The authored Terrain Sun is disabled at night and restored during daytime.

## Actual Terrain hierarchy

Inspected `public/assets/models/mars_Terrain.glb`. Seven panel objects are at the model root; there is no `LightsPanel` node. Actual panel names are `Light_Panel`, `Light_Panel_02`, `Light_Panel_04`, `Light_Panel_05`, `Light_Panel_06`, `Light_Panel_07`, and `Light_Panel_08`. Thus `_03` is missing and `_08` is unexpected. Authored children:

| Panel | Actual children |
|---|---|
| Light_Panel | `light01`, `Light_Stumb`, `reallight01` |
| Light_Panel_02 | `light02`, `Light_Stumb.001`, `reallight02` |
| Light_Panel_04 | `light04`, `Light_Stumb.003`, `reallight04` |
| Light_Panel_05 | `light05`, `Light_Stumb.004`, `reallight05` |
| Light_Panel_06 | `light06`, `Light_Stumb.005`, `reallight06` |
| Light_Panel_07 | `light07`, `Light_Stumb.006`, `reallight07` |
| Light_Panel_08 | `light08`, `Light_Stumb.002`, `reallight08` |

Seven marker nodes are Mesh objects with no children: `reallight01`, `reallight02`, and `reallight04` through `reallight08`. `reallight03` is missing; no duplicate names were found.

Marker world positions and Euler rotations (radians, XYZ), composed from actual GLB node transforms:

| Marker | World position | World rotation |
|---|---:|---:|
| reallight01 | (456.610, 14.646, -46.610) | (1.0297, 0, 0) |
| reallight02 | (468.282, 14.646, -92.066) | (1.8014, -0.4939, 2.0306) |
| reallight04 | (522.126, 15.251, -25.549) | (1.5917, 0.3485, -1.6321) |
| reallight05 | (480.633, 14.591, 68.005) | (1.3094, -0.2341, 0.7144) |
| reallight06 | (408.083, 14.571, -33.645) | (1.3094, -0.2341, 0.7144) |
| reallight07 | (562.114, 14.591, -135.180) | (1.7830, 0.2793, -2.2343) |
| reallight08 | (566.673, 14.336, -67.289) | (1.4606, 0.3319, -1.2434) |

Habitat mesh bounds: min `(488.323, 0.226, -119.617)`, max `(497.182, 4.388, -103.889)`, center `(492.752, 2.307, -111.753)`. Runtime aims use the loaded Habitat bounds rather than invented coordinates.

## Lighting and shadows

One actual SpotLight is parented to each valid marker so it follows authored transforms. Each aims downward toward the Habitat bounds. The two shadow-casting fixture lights use the warm-white color at intensity 800, while the five non-shadow fill lights use intensity 65 to preserve contrast. The two nearest markers (`reallight02` and `reallight07`) cast shadows with 1024×1024 maps; bias, normal bias, and shadow FOV are tuned for visible soft shadows. The nighttime hemisphere and environment fill are also reduced to avoid washing out shadow contrast. All lights start hidden. No decorative light meshes are created. Visual acceptance still requires browser/WebGL review.

The nighttime EXR background and environment reflection rotate together at one revolution per 18 hours of active gameplay. Rotation pauses outside an active Terrain night session.

## Eligibility and timer

Eligibility is independent per current SOL and reads only that SOL's required task IDs; optional Sol 1 work is excluded. Required SOL 2 readiness, SOL 3 proposal, SOL 4 preparation records, and SOL 7–9 validated reports are also checked. An active objective, Sol 5 drone attempt, or module transition blocks nighttime. Mission state is only observed.

The six-hour gameplay clock advances from the existing frame delta (capped at 0.05 seconds), pauses when the tab is hidden or module transition is active, and persists elapsed time/expiry under a separate local-storage key by SOL. Expiry restores day without changing progress. It will not reactivate until eligibility is lost and becomes valid again.

## Scene isolation and performance

Only `Game.updateEnvironment()` assigns the active scene's environment. Night uses the new EXR only when Terrain is active and an eligible night session is active; indoor modules clear `scene.environment` and retain their existing background. No second renderer or animation loop was added. Seven spotlights and two 512×512 shadow maps are added. EXRs and PMREM targets are loaded/generated once per Game instance. FPS and VRAM were not measured.

## Files inspected

`src/core/Game.ts`, `src/core/MissionManager.ts`, `src/core/Day1Config.ts`, `src/core/ModuleLighting.ts`, `src/core/Discovery.ts`, mission JSON inventory under `src/jsons/Missions`, `public/assets/models/mars_Terrain.glb`, both EXRs, `package.json`, and existing tests.

## Files modified or created

- Modified: `src/core/Game.ts`, `package.json`.
- Created: `src/core/MasterTerrainEnvironment.ts`, `tests/master_terrain_environment_tests.js`, and this report directory.

## Known limitations and acceptance status

Environment/background selection is immediate; a cross-fade was not implemented. EXR loading, rendered spotlight coverage, shadow artifacts, indoor isolation in live WebGL, save/resume, performance, and repeated scene unload/reload remain browser-unverified. The existing mission architecture has no general acceptance/task-start flag, so the implementation gates on its current authoritative objective state and specialized Sol 5 activity. Missing panel/marker objects are diagnosed and never synthesized. These unverified criteria are marked BLOCKED in `TEST_RESULTS.md`; full visual/runtime acceptance remains incomplete.
