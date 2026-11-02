# PHOBOSIA Sol 7 — Task-by-Task Instructions

## Global rules

Use existing scene triggers, screens, mission/report progression and the global EVA system. Do not change Sols 1–6. Preserve the Sol 6 sample ID, provenance and cultivation status. Do not implement or touch Sol 8 repair triggers. Keep source-backed, existing telemetry, unavailable and gameplay-simulation data distinct.

## Task 1 — Habitat: Dust Storm Alert

Review and acknowledge the Sol 7-only safety alert on the existing Habitat physical screen. Explain the temporary outdoor restriction and indoor safety guidance.

## Task 2 — Mission Control: Systems Assessment

Review the existing Mission Control systems, communications and navigation screens. Record power generation/reserve, communications, navigation and active warnings. Identify the provenance and limitations of each entry.

## Task 3 — Central Hub: Outpost Status

Review the existing Module Status Display. Record operational, degraded or unavailable section status and available power distribution. Do not change distribution.

## Task 4 — Airlock: EVA Lockdown

Verify that the active storm restriction blocks Mars surface access through the shared EVA policy. Preserve the existing suit requirement and all normal EVA behavior.

## Task 5 — Research Lab: Science Power

Review both Research Monitoring and the existing Cultivation display. Assess science/cultivation power. Preserve the Sol 6 sample, provenance and in-progress experiment; do not restart it or invent results.

## Task 6 — Engineering: Power Assessment

Use the existing Engineering power unit front-end in read-only mode. Record solar generation output, available reserve, estimated duration, panel A status, panel B status, outdoor main solar line status, distribution, life-support power and science/cultivation availability. Prefix each value with `Source-backed:`, `Existing telemetry:`, `Unavailable:` or `Gameplay simulation:`.

## Task 7 — Engineering: Report and Storm Shutdown

Submit the final report through the existing report interface after Tasks 1–6 validate. Successful validation fades both Sol 7 sounds, restores the exact captured light properties, ends storm state, restores shared EVA rules, and persists the post-storm power assessment. Show completion without starting Sol 8.

## Emergency lighting and sounds

Capture original light values before restrained flicker. Asset-verified Central Hub names use underscore separators (`Light_12`, `Light_15`…); Science names use dotted suffixes (`Light.007`, `Light.010`, `Light.012`). Restore values after report validation or interrupted cleanup. Audio assets are `/assets/sounds/sol7Sounds/warningBeepTone.MP3` and `/assets/sounds/sol7Sounds/sandStormSound.MP3`; play only during Sol 7.
