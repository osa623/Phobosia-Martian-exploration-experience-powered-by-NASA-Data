# PHOBOSIA first playable prototype

Run `npm install`, then `npm run dev` and open http://localhost:3000. Use W/A/S/D, Shift, Space, mouse, E, and Escape. The app loads the verified Habitat GLB first and uses `HABITAT_SPAWN_POINT` when available. Asset copies in `public/assets` are runtime-only copies; originals remain in `models` and `exr`.

`npm run build` runs the production build and `npm run typecheck` runs TypeScript checks.

Known prototype limits: collision presently maintains a floor-level test area only; it is not geometry collision. Entrance transitions load only verified source trigger names; unnamed-destination transitions use a labelled temporary local fallback. The EXR is preserved but not assigned as an environment map pending visual HDR verification.
