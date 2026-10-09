# Technical architecture of the visuals (1.7.0, 1.8.0)

This file covers how the Angkor Cel-Diorama look is built. For the whole game (sim, views, host, bridge), see `docs/ARCHITECTURE.md`. For the art rules, see `docs/VISUAL_BIBLE.md`.

The game runs on **three.js**, not Godot. PK's Godot prompts (spatial shaders, WorldEnvironment, Camera3D) were ported technique for technique, as the table shows. Changing engine would throw away the game; every technique has a direct three.js equivalent.

| PK's Godot prompt | three.js implementation | File |
| --- | --- | --- |
| Dual-pass pipeline: NPR units, stylised PBR world | The world stays on `MeshStandardMaterial`. Unit meshes are switched to `MeshToonMaterial` plus an outline mesh by `NprUnits` | `kingdom/view/npr.ts` |
| 1D toon LUT | `toonRamp()`: a 64×1 nearest-filtered `DataTexture`, read in **colour**. three's toon shader reads only `.r`, so the chunk is patched | `npr.ts` |
| Inverted-hull outline (front-face cull, normal extrusion) | `outlineMaterial()`: `BackSide`, vertices pushed out along their normals by `outlinePx × pxScale × depth`, so the line is constant on screen. The extrusion runs *before* the limb animation, so the hull bends with the body | `npr.ts` |
| Inspector-exposed ramp, outline, rim | `config/kingdom/diorama.json` → `units` (zod schema `DioramaSchema`) | `packages/shared/src/kingdom.ts` |
| HD-2D camera (low FOV) | `KingdomScene` uses `camera.fov` 18°. `lensStretch()` moves the camera back so the framing equals the old 32° lens; zoom numbers are unchanged | `kingdom/view/scene.ts` |
| WorldEnvironment tilt-shift DoF and colour correction | `KingdomPost` grade pass: a tilt-shift band plus a warm-highlight/cool-shadow split tone. Screen-space AO (GTAO) is dropped in the diorama | `kingdom/view/gfx.ts` |
| Terrain splatmap by slope and elevation | `splatTerrain()` patches the ground material: meadow lawn, forest floor, laterite by slope, block AO in steps (baked per vertex by `blockAo()`) | `kingdom/view/terrain.ts` |
| Ground that follows life (PK's living-settlement reference) | `WearMap`: one byte per tile in an R8 `DataTexture`. Building yards, feet (walk and work wear), regrowth every 10 s, uploaded at most every 2 s | `kingdom/view/wear.ts` |
| Prek canal water shader | `makePrekWater()`: height-texture depth fade (steadier than the depth buffer), Fresnel sky in time-of-day steps (`skyStep`), 2-step cel specular, crisp foam, two ripple layers | `kingdom/view/water.ts` |
| Ground detail | `GroundDetailRts`: forest undergrowth, flowers, pebbles on worn earth, reeds, lotus. Hash-placed on the tile grid near the camera, four draw calls | `kingdom/view/detail.ts` |
| Elephant grass (PK's Godot spatial shader, 1.8.0) | `ElephantGrass`: one instanced Lambert draw; vertex displacement only (`ELEPHANT_GRASS_VERTEX`): one fetch of a seeded tileable noise texture per vertex at the clump origin, scrolled downwind; quadratic bend with the tip sinking (length kept); per-clump sway; flutter; trample (16 walkers, uniform array); distance shrink. The shadow pass uses a `MeshDepthMaterial` with the same patch. Normals: straight up in view space (no black backs). Planted by `layElephantGrass` (stand noise, banks, `clear` near buildings and worn earth) | `kingdom/view/elephantGrass.ts` |
| Grass cards and the meadow sward (PK's Meshy models, 1.8.0) | `scripts/models/grassCards.mjs` renders a model (Playwright, flat light, orthographic) into a WebP atlas: 3 side views + 1 from above × 2 rows, leaf colours bled into the clear pixels; `grassCardGeometry` = crossed cards (atlas columns) + a flat top card (`aKind` 2) that folds away when the view is low; `aVariant` picks the row; alpha test. Further `ElephantGrass` fields: `sward` (30 cm) and `lawn` (10 cm, top view cut round by the bake's `round` option, `topAt`, `wearMax`) cover every grass tile (cover 1, radius from `grassReach`); `stones` scatter rock clusters (no wind). Clumps stand on `groundY`; grass needs `GRASS_DRY` above the water | `kingdom/view/elephantGrass.ts`, `scene.ts` |
| Keyboard settings (1.8.0) | `Keymap`: defaults from `config/kingdom/controls.json`, player diff in localStorage, swap on conflict; the map and the hero read held keys by `KeyboardEvent.code` through it; panel HTML `keysPanelHtml`, opened from the year bar | `kingdom/keymap.ts` |
| Jungle ground (1.8.0) | `splatTerrain()` gains a forest mask (`aForest` per vertex) for dead leaves, wetness (`wetness()`), puddles in the mud's hollows with a lower roughness and the sky colour, drop rings; `mossyRockGeometry`, `frondGeometry`, `rootGeometry` in the ground detail | `kingdom/view/terrain.ts`, `detail.ts` |
| Mist and light shafts (1.8.0) | `MistLayer` (instanced noise quads) and `LightShafts` (instanced additive beams built along the sun direction in the vertex shader), `cellSpots()` on a world grid, `mistAmount()`, `shaftAmount()` | `kingdom/view/atmosphere.ts` |
| See-through cover (1.8.0) | `addSeeThrough()` chains a fragment test onto cover materials (flagged `userData.seeThrough`): `vSeeClip` from the vertex stage gives exact NDC and depth; windows (`setTargets`: people projected each frame, at most 32) drop nearer fragments in an interleaved-gradient-noise dither. Program cache key `…|see` | `kingdom/view/seeThrough.ts` |
| Torches (1.8.0) | `TorchView`: posts, flames (flicker by scale), camera-facing glows and ground pools (additive, soft falloff texture), a fixed set of `PointLight`s moved to the torches nearest the view; `torchSpots()` from buildings | `kingdom/view/torches.ts` |
| Stars and moon (1.8.0) | `NightSky`: additive star points with twinkle, a moon quad with its phase terminator in the shader; `moonDir()` (the sun's path, a phase of a day behind), `moonPhase()`, `moonLit()`. The scene's sun light turns to moonlight from the moon's direction at night | `kingdom/view/nightSky.ts` |
| Swimming, wading, rafts (1.8.0) | Sim: `shoreDistance()` (two-pass chamfer), `waterDepth()`, `waterWay()` → speed; view: `ACT.swim` (front crawl, body flat via `Agent.lean`), treading water, wading depth, bamboo rafts poled, dugouts paddled. `ACT.torch` holds a torch up | `kingdom/sim/water.ts`, `engine/figures.ts`, `kingdom/view/scene.ts` |
| Rowing, fishing, chopping | Figure shader actions `ACT.chop`, `ACT.fish` and `ACT.row` (GPU limb animation). Dugout boats and paddles (`paddleSwing` keeps them in time); felled trees fall and leave stumps. The sim emits `felled` | `engine/figures.ts`, `kingdom/view/actions.ts`, `sim/sim.ts` |

## Frame order (Kingdom tab, diorama on)

1. The sim steps.
2. `KingdomScene.update()`:
   - syncs trees (with the foliage tint per instance), units (choosing the action, boats and paddles), NPR (`syncNpr` turns new figure meshes toon and inks them), detail, and wear;
   - updates the water's sky step and the fallen trees.
3. `KingdomPost.render()`:
   - draws the scene (shadow map from the low sun, its frustum following the view);
   - adds bloom;
   - runs the output pass and the grade pass (tilt-shift and split tone).

## Cost (1.8.0)

- **Wild grass.** 1 500 tussocks × 108 triangles near the view (no grass shadows on low).
- **Mist and shafts.** 14 + 8 quads.
- **See-through.** A loop over at most 24 windows in cover fragments, only when zoomed in (skipped otherwise).
- **Torches.** Instanced flames, glows and pools; 4 real lights on low (6 high, 8 ultra), always present so no shader recompiles.
- **Rocks and fruit.** Only those near the view are drawn now (PK's ~1 000-triangle models were drawn for the whole map): the start view went from about 800 000 to 500 000 triangles.

## Cost (1.7.0)

- **Outlines.** Outlines draw each figure mesh twice, a small cost: figures are a few thousand triangles per instanced mesh.
- **Ground detail.** At most 2,600 + 500 + 700 + 220 small instances. The open meadow carries no tufts.
- **Wear map.** One float and one byte per tile. A full regrow pass runs every 10 s of game time, and an upload at most every 2 s.
- **Removed.** Screen-space AO is gone in the diorama, which is cheaper than before. The cel pass (Anachak `look: anime`) is unchanged and still used when chosen.

## Tests

`kingdom/view/diorama.test.ts` covers:
- the config and presets;
- the toon ramp, its bands and the cool shadow;
- the toon and outline shaders (the limb motion is kept, the extrusion comes first, and the outline is screen-constant);
- that `NprUnits` follows counts and removes the ink with the figures;
- the lens stretch, the post chain, laterite, block AO and the splat patch;
- the Prek water, detail placement and the wear map;
- the boat, the paddle and falling trees.

`sim/felled.test.ts` checks the felled event. `hero/hero.test.ts` checks the camera stopping in front of trees.

`kingdom/view/night18.test.ts` covers the elephant grass (config, geometry, noise, shader, placement, the field), the see-through cover (zoom, projection, patching), the torches, the stars and the moon. `kingdom/sim/water.test.ts` covers depth, wading, swimming, boats and rafts; `src/fullscreen.test.ts` the full-screen switch. `kingdom/view/grass18.test.ts` covers the clear water, the grass cards and the meadow sward; `kingdom/keymap.test.ts` the keyboard settings (e2e KG-09).

`kingdom/view/jungle18.test.ts` covers the red mud, wetness and puddles, the forest-floor detail, the mist and the light shafts.
