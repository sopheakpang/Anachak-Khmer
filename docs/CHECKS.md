# Check log

One entry per "check NN": date, verdict, automated results, acceptance criteria, issues.

## Check 00–02 — 2026-09-28

**Verdict:** PASS WITH ISSUES (capture test on the stream PC still to do — it is PK's manual gate)

**Automated (run in the build container, Linux, headless Chromium):**
lint ✅ · types ✅ · unit 21/21 ✅ · build ✅ · e2e 3/3 ✅ · npm audit 0 vulnerabilities ✅

**Acceptance criteria**

| AC                                       | Result  | Evidence                                                                                                                                                                                          |
| ---------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-20 Khmer renders correctly            | ✅      | `e2e/khmer.spec.ts`; `docs/screens/02-khmer.png` — stacked subscripts in ស្ថាបត្យករហ្លួង correct in Moulpali, Bokor, Dangrek, Kantumruy Pro, as HTML and as a carved canvas texture on a 3D stone |
| AC-22 capture checklist written          | ✅      | `docs/CAPTURE.md` (options A/B/C, results table)                                                                                                                                                  |
| Game ≤ 700 MB RAM, 30 FPS on Low         | not run | needs the stream PC; headless software GL shows 5 FPS, which says nothing about the 1660 Super                                                                                                    |
| Stage stays 9:16 in a laptop-size window | ✅      | `e2e/khmer.spec.ts` second test                                                                                                                                                                   |

**Found and fixed during the build**

- Frame limiter rendered 46 FPS instead of 30 on 120 Hz screens (floating-point edge in the carry). Fixed in `apps/game/src/pacing.ts`; regression test covers 30/60/75/120/144 Hz.
- Electron 38 and Vitest 3 had known vulnerabilities → upgraded to Electron 44.4.5 and Vitest 5.0.2.
- PK: no Thai in the game → Thai font and test line removed; fonts config and tests are Khmer + English only.

**Not verified here:** Electron window (no display in the container; syntax and window-size logic are unit-tested), LIVE Studio capture, sound capture, real FPS/RAM. These are the manual steps in `docs/CAPTURE.md`.

## Check 03–06 — 2026-09-28

**Verdict:** PASS

**Automated (Linux container):** lint ✅ · types ✅ · unit 126 ✅ · build ✅ · e2e 4/4 ✅ (incl. host panel → bridge end to end) · shared coverage 100 % lines / 90 % branches ✅ · npm audit 0 ✅

**Live run:** bridge started, gift sent from a host socket, stopped with Ctrl+C, restarted → progress 150 restored; backup written on each stop.

| AC                                               | Result | Evidence                                                                       |
| ------------------------------------------------ | ------ | ------------------------------------------------------------------------------ |
| AC-01 30-coin gift → Large, 150 units, < 200 ms  | ✅     | `pipeline.test.ts`; `server.test.ts` over a real WebSocket; `e2e/host.spec.ts` |
| AC-02 12-Rose combo → 12 stones, one "×12" line  | ✅     | `pipeline.test.ts`; host e2e ("Rose ×12")                                      |
| AC-03 duplicate id counted once                  | ✅     | `pipeline.test.ts`                                                             |
| AC-04 unknown 50-coin gift → Large               | ✅     | `rules.test.ts`                                                                |
| AC-05 malformed events ignored, no crash         | ✅     | `rules.test.ts`, `pipeline.test.ts`                                            |
| AC-06 name filter; Thai/emoji → @handle          | ✅     | `names.test.ts`, host e2e (@somchai_bkk)                                       |
| AC-07 15 % cap, overflow to stockpile, conserved | ✅     | `rules.test.ts`, `sqliteStore.test.ts`                                         |
| AC-08 follow once per stream                     | ✅     | `pipeline.test.ts`                                                             |
| AC-16 restart restores everything                | ✅     | `sqliteStore.test.ts` + live restart                                           |

**Found and fixed during the build**

- Name cleaner removed the Khmer joiner U+200C (needed for correct Khmer shaping) → rebuilt with set subtraction; test added.
- Two backups in the same minute failed ("SQL logic error") → numbered `-2`, `-3`; test added; confirmed live.
- Host panel "Cancel" didn't hide the reset box (CSS `display:flex` beat `hidden`) → fixed; covered by host e2e.

**Decision to confirm (PK):** the Kulen stockpile may fill at most **50 %** of the next temple (`caps.stockpileMaxStartShare` in `config/gift-map.json`), so every temple still needs the room. The spec said the stockpile "feeds the next temple" without a number.

**Deferred:** capture gate (prompt 02) — laptop RAM too low with LIVE Studio (96 % used); PK upgrading hardware first.

## Check 07–13 — 2026-09-28

**Verdict:** PASS (automated); live check on PK's PC pending

**Automated (Linux container):** lint ✅ · types ✅ · unit 162 ✅ · build ✅ · e2e 12/12 ✅ · npm audit 0 ✅

Note: the test machine has no GPU and renders headless at about 2 FPS, so timing checks use `?cutSeconds=` and timing traces, not frame rate. Frame rate is checked on PK's PC (30 FPS measured earlier).

| AC                                                           | Result | Evidence                                            |
| ------------------------------------------------------------ | ------ | --------------------------------------------------- |
| AC-09 60 s camera loop map → quarry → river → hauling → site | ✅     | `director.test.ts`, scene screenshots `b-*.png`     |
| AC-10 Large/Huge gift cuts to the site, loop resumes         | ✅     | `director.test.ts`, `e2e/game.spec.ts` (b-cut.png)  |
| AC-11 Small/Medium gifts show 4 s picture-in-picture         | ✅     | `director.test.ts`, e2e PiP test (b-map-pip.png)    |
| AC-12 giver's name carved on the placed stone                | ✅     | `kit.test.ts`, `pipeline.test.ts`, e2e build test   |
| AC-13 names survive restart                                  | ✅     | `sqliteStore.test.ts` (slots + v1→v2 migration)     |
| AC-20 Khmer text readable, min 26 px                         | ✅     | `e2e/game.spec.ts` text-size check                  |
| AC-21 nothing inside TikTok's areas                          | ✅     | `e2e/game.spec.ts` overlap check (b-safe-zones.png) |

**Found and fixed during the build**

- Camera loop jumped ahead by the length of a cut → loop now resumes where it stopped; test added.
- Empty convoy route crashed the map scene and stopped the frame loop → guards + tests; frame loop now survives any scene error.
- Help text wrapped into TikTok's comment area (caught by the AC-21 test) → moved up and height-limited.
- Likes were taking carved name slots → only named gifts/follows carve; test added.

**Waiting on PK:** character/animal models (docs/ASSETS.md: A, B or C) · review of the Khmer history cards (`config/history-cards.json`) · 50 % stockpile rule.

## Check — Animated-film look (D25) — 2026-09-28

**Verdict:** PASS (automated); frame rate on the stream laptop still to confirm

**Automated (Linux container):** lint ✅ · types ✅ · unit 172 ✅ · build ✅ · e2e 12/12 ✅

**What changed**

- Lighting: filmic tone mapping, one warm sun with soft shadows (1024 map on Low), sky reflections from an environment map, warm edge glow on characters, gradient sky with sun glow, puffy clouds and hazy hills, warm grade + vignette layer.
- Characters rebuilt in code: workers with big heads, eyes, top-knots and sampots in 7 colours; mallets, poles and carried stones; elephants with big ears, curled trunk and cloth; white Khmer zebu with a rolling-wheel cart. Walking, pulling, hammering and poling run on the GPU (still one draw call per crowd).
- World: rounded stone blocks with per-stone shade, lotus-bud finials, carved door frames and lintels, rounded Nandi; fluffy trees, sugar palms, bushes, stilt houses; ground without visible tiling; turquoise canal; 3D trees on the map.
- Fallback preset `lite` (no shadows, fewer people) selectable in `config/window.json` → `"preset"`.
- PiP durations moved to `config/camera.json` (`pip.seconds`, `pip.myStoneSeconds`), rule 4.

**Budget (per frame incl. shadow pass, headless):** site with full temple 415k triangles / 35 draw calls; quarry 128k / 16; river 117k / 29; hauling 139k / 12 — e2e fails above 600k / 80.

**To confirm on PK's laptop:** open with `?meter=1` (or watch LIVE Studio) — Low must hold 30 FPS; if not, set `"preset": "lite"` in `config/window.json`.

## Check — Muscular Khmer workers (D26) — 2026-09-28

**Verdict:** PASS (automated)

**Automated:** lint ✅ · types ✅ · unit 173 ✅ · build ✅ · e2e 12/12 ✅

- Workers rebuilt with heroic proportions (PK's reference picture used only as a body-shape guide): broad shoulders, V-taper, pectorals, biceps, calves; head ≈ 1/7 of height (unit test checks shoulder/waist ratio and head size).
- Angkor-era Khmer dress: bare chest, sampot chang kben with front panel (crowd colours), gold belt, armbands, bracelets, necklace, earrings, top-knot tied with gold; palm-leaf sun hats on rope teams and raft polers.
- Budget: site with full temple 463k triangles / 36 draw calls (limit 600k / 80); worker ≈ 3.9k triangles.

## Check — Real temple detail, no hats (D27) — 2026-09-28

**Verdict:** PASS (automated)

**Automated:** lint ✅ · types ✅ · unit 180 ✅ · build ✅ · e2e 12/12 ✅

- Palm-leaf hats removed (PK: not Khmer).
- Preah Ko detail layer (`world/ornaments.ts`), read from the kit so saved slots and carved names are unchanged: moulded sandstone base, corner and door pilasters that grow with the walls, stepped cornice on the body and each of the 4 roof tiers, 8 lotus-bud antefixes per level, miniature false doors on every tier face, carved sandstone false doors on the back/left/right faces, octagonal colonettes at the real door, guardian figures in arched niches, stairs with seated lions at each tower and at the platform.
- Brick texture now shows 5 courses of small bricks in running bond with thin joints, as at Preah Ko.
- Laterite enclosure wall with an east gopura (entrance pavilion) around the work yard.
- Huge-gift banner now stays up for the cut (was fixed 5 s).
- Budget: site with full temple 548k triangles / 52 draw calls (limit 600k / 80); site workers 40 → 32.

## Check E01–E03 — Kulen Expedition shell, jungle, heroes — 2026-09-28

**Verdict:** PASS (automated); frame rate on the stream PC still to confirm (needs the GTX 1660 Super)

**Automated:** lint ✅ · types ✅ · unit 193 ✅ · build ✅ · e2e 14/14 ✅

| AC                                                                                       | Result | Evidence                                                          |
| ---------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------- |
| AX-01 host switches Build ⇄ Expedition, temple progress kept, mode saved across restarts | ✅     | `server.test.ts`, `sqliteStore.test.ts`, `e2e/expedition.spec.ts` |
| AX-02 Expedition HUD outside TikTok areas, text ≥ 26 px (choice screen and play)         | ✅     | `e2e/expedition.spec.ts`                                          |
| AX-04 frame budget                                                                       | ✅     | expedition 187k triangles / 46 draw calls (limit 600k / 120)      |
| AX-05 every zone reachable from camp; clicks on trees/water walk to open ground          | ✅     | `kulenMap.test.ts`                                                |
| AX-06 fallen hero rises at the nearest shrine and walks on                               | ✅     | `kulenMap.test.ts` (hero)                                         |
| Chat votes !1 !2 !3 (and Khmer digits) reach the game only in Expedition                 | ✅     | `rules.test.ts`, `server.test.ts`, e2e vote count on the card     |

**Built**

- Mode switch in the host panel (Build · សាងសង់ / Expedition · បេសកកម្ម) and vote test buttons; mode kept in SQLite.
- Kulen plateau 180 × 180 m: plateau, cliff with a western ramp, river with 3 fords, waterfall pool, 5 zones, 4 shrines, camp; ~2,650 plants (dipterocarps, strangler figs, sugar palms, ferns, bushes, rocks) in 30 m chunks.
- Riverbed lingas, hermitage ruins, quarry outcrops with drilled blocks, landing dock and rafts, mist, light shafts, fireflies, campfire.
- Mist of mystery (fog of war) over unexplored jungle, lifted as the hero walks; minimap with shrines, hero arrow and camera view.
- Foliage between the camera and the hero, and in front of the camera, is dithered away so the hero is never hidden.
- Heroes: វីរៈ Vireak (warrior: cord armour, shield, sword), ពិសិដ្ឋ Piseth (Brahmin sage: white robe, saffron shawl, sacred thread, lotus staff), គិរី Kiri (elephant rider on a war elephant). Right-click A* walking, wheel zoom, middle-drag pan, Space to centre, minimap click to look / right-click to walk. Game-drawn golden cursor.
- 30 s hero vote (config `selectSeconds` param for slow test machines), then the top vote wins; the host can click a card or press 1–3.

**Not yet (next prompts):** skills are shown but have no effects yet (E07); no enemies (E06); stone veins, clues and quarrying (E04–E05); escort and delivery (E09).

**Default taken (PK can change):** in Build mode, gifts first lay the stones already delivered; anything beyond goes to the Kulen stockpile, which counts toward the next expedition's 25%.

## Controls rework + help pop-up (D39, D40) — 2026-09-28

**Automated:** lint ✅ · types ✅ · unit 201 ✅ · build ✅ · e2e 15/15 ✅

| Check                                                                                               | Result | Evidence                                                                 |
| --------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| Arrow keys walk the hero, sliding along the river/cliffs, never into water                          | ✅     | `combat.test.ts`, `e2e/expedition.spec.ts` (ArrowUp)                     |
| Mouse turns the hero; cursor becomes a red sword over a post in reach; click strikes it             | ✅     | `combat.test.ts`, `e2e/expedition.spec.ts`, `docs/screens/x-strike.png`  |
| Attacks/skills respect range, energy and cooldown; area damage; heals; Garuda leap; posts respawn   | ✅     | `combat.test.ts`                                                         |
| Q casts at the cursor and spends energy                                                             | ✅     | `e2e/expedition.spec.ts`                                                 |
| Help pop-up: white, rounded, black letters, at the top under TikTok's header, never in TikTok areas | ✅     | `e2e/game.spec.ts` (help pop-up, AC-21), `docs/screens/b-help-popup.png` |

## Low-poly style (D41) — 2026-09-28

**Automated:** lint ✅ · types ✅ · unit 205 ✅ · build ✅ · e2e 15/15 ✅

| Check                                                                                                                  | Result | Evidence                                                                            |
| ---------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| Low-poly is the default in all presets; `?style=film` brings back the D25 look                                         | ✅     | `look.test.ts`                                                                      |
| Round shapes use half the segments; flat shading; detail textures become flat average colours; maps with pictures kept | ✅     | `look.test.ts`                                                                      |
| Frame budget: expedition 79k triangles (was 187k), hauling 66k (was 148k), site built 384k (limit 600k)                | ✅     | `e2e` budget lines                                                                  |
| Screens                                                                                                                | ✅     | `docs/screens/b-site.png`, `b-hauling.png`, `x-strike.png`, `x-hermitage-rider.png` |

## Busy crew, real animals, textured detail, countryside (D42–D45) — 2026-09-28

**Automated:** lint ✅ · types ✅ · unit 211 ✅ · build ✅ · e2e 15/15 ✅

| Check                                                                                                                                         | Result | Evidence                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------- |
| Haulers fetch, carry on the head, set down at the tower most behind, never walk through a tower; empty pile → from the gate                   | ✅     | `worksite.test.ts`                                                    |
| Carvers hammer > 60 % of the time; lever pairs at growing towers, rest when done; rope team lifts on the tallest growing tower and leans back | ✅     | `worksite.test.ts`                                                    |
| Every animal has normals, colours and limb data; within its triangle budget                                                                   | ✅     | `figures.test.ts` (elephant, horse, pack horse, zebu, Nandi, ox cart) |
| Textured low-poly keeps painted detail; flatColors option                                                                                     | ✅     | `look.test.ts`                                                        |
| Frame budget with countryside and crew: site built 469k triangles, 64 draw calls (limit 600k / 120)                                           | ✅     | e2e budget line                                                       |

## Khmer Kingdoms v0.1, the RTS tab (D46–D49) — 2026-09-29

**Automated:** lint ✅ · types ✅ · unit 238 ✅ · build ✅ · e2e 17/17 ✅ (the Kingdom spec re-run after moving the menu board: 2/2 ✅)

| Check                                                                                                                       | Result | Evidence                                               |
| --------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------ |
| Kingdom data loads; historical validation finds no errors; catches anachronisms, unknown sources, unexplained uncertainty   | ✅     | `kingdom.test.ts`                                      |
| Map is deterministic, royal centre clear, fords over the river, paths to quarry, gold and rival camp                        | ✅     | `sim.test.ts`                                          |
| Gather wood/stone/gold/food and carry to drop-off; trees run out and villagers move on                                      | ✅     | `sim.test.ts`                                          |
| Build in stages (0/25/50/75/100 %), population room, cancel refunds 75 %, bad placements refused                            | ✅     | `sim.test.ts`                                          |
| Train (cost, population), research (prerequisites, effects), elephants locked behind a tech                                 | ✅     | `sim.test.ts`                                          |
| Combat, armour, bonuses, archers shoot; rival raids on time, logs its plan, retreats; fog of war                            | ✅     | `sim.test.ts`                                          |
| Victory (monument held, camp destroyed), defeat (royal hall falls)                                                          | ✅     | `sim.test.ts`                                          |
| Saves: round trip, rotating backups, corrupt save recovered, failed write keeps the old save, slots, versions               | ✅     | `save.test.ts`                                         |
| Bridge: Kingdom mode, council votes pass, save/load/new commands, bad ops ignored                                           | ✅     | `server.test.ts`                                       |
| In the browser: select by box, build a house, gather by right-click, train, gift → stone, council vote, save/load from host | ✅     | `e2e/kingdom.spec.ts` KG-01, `docs/screens/k-play.png` |
| Viewer-facing HUD outside TikTok areas, text ≥ 26 px, budget 262k triangles / 34 draw calls                                 | ✅     | KG-02, `docs/screens/k-demo.png`                       |
| Menu board at the bottom (PK); host-only, may sit under TikTok comments for viewers                                         | ✅     | KG-02                                                  |

## Kingdom tab 16:9 + selection box fix (D51, D52) — 2026-09-29

**Automated:** lint ✅ · types ✅ · unit 240 ✅ · build ✅ · e2e 17/17 ✅

| Check                                                                                                                | Result | Evidence                         |
| -------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------- |
| Kingdom stage is 16:9; HUD inside it; command bar at the bottom; text ≥ 26 px; budget 262k triangles / 36 draw calls | ✅     | KG-02, `docs/screens/k-demo.png` |
| Selection box drawn exactly under the mouse (within 4 px)                                                            | ✅     | KG-01                            |
| Build and Expedition return to 9:16 after the Kingdom tab                                                            | ✅     | full e2e run                     |
| Desktop window sizes for 16:9                                                                                        | ✅     | `windowSize.test.ts`             |

## Khmer Kingdoms campaign: Greater Angkor map, 13 temples, eras, opponents, History, translucent boxes, houses (D53–D57) — 2026-09-29

**Automated:** lint ✅ · types ✅ · unit 253 ✅ · build ✅ · e2e 18/18 ✅ (full run; Kingdom specs re-run after the last fixes)

| Check                                                                                                                                            | Result | Evidence                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------ |
| Campaign data valid: chapters in temples.json order, years inside their eras, time runs forward, opponents known and labelled, sources known     | ✅     | `kingdom.test.ts`                                      |
| Big map deterministic; every temple on its own site in the Build-map layout, no overlaps; islands and Angkor Wat's moat reachable by causeways   | ✅     | `sim.test.ts` (Greater Angkor map)                     |
| Paths from the first hall to stone, gold and the rival camp; bad placements refused (water, hall, later era, temple off its site)                | ✅     | `sim.test.ts`                                          |
| Finishing and holding a temple ends its era: next temple, year, era content, new site, new opponent camp; capital moves at Bakheng; 13 = victory | ✅     | `sim.test.ts`                                          |
| Rest houses (speed) and hospitals (healing) work                                                                                                 | ✅     | `sim.test.ts`                                          |
| Save v2 keeps chapter, finished temples and temple buildings; v0.1 saves refused with a message                                                  | ✅     | `save.test.ts`                                         |
| Temple models fit their sites, stay under 20k triangles each, silhouettes differ; Kantaang and Rongdeung houses; opponents' headwear             | ✅     | `temples.test.ts`                                      |
| In the browser: chapter card on completion, header year 881, objective Bakong; message boxes see-through; History timeline (13, 1 built); visit  | ✅     | KG-03, `k-chapter.png`, `k-history.png`, `k-visit.png` |
| HUD inside 16:9, text ≥ 26 px, budget 257k triangles / 37 draw calls (big map: camera window of trees, coarser ground)                           | ✅     | KG-02, `k-demo.png`                                    |
| All 12 temples + Bayon rising, everything explored, far zoom: under 600k triangles                                                               | ✅     | manual run, 587k                                       |

## Build and Expedition from PK's low-poly prompts (D58, D59) — 2026-09-29

**Automated:** lint ✅ · types ✅ · unit 264 ✅ · build ✅ · e2e 18/18 ✅

| Check                                                                                                               | Result | Evidence                                               |
| ------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------ |
| Gifts today counted by the bridge (each gift of a combo), likes separately; counters beside the progress bar        | ✅     | `pipeline.test.ts`, game.spec (61 gifts), `b-site.png` |
| Carving-yard blocks carry the newest names, Khmer blessings otherwise; newest-first, no repeats                     | ✅     | `landscape.test.ts`, `store.test.ts`                   |
| Pteas Kantaang houses (stone footings, raised floor) in the villages; elephant carries a block; zebu carts          | ✅     | `figures.test.ts`, gallery                             |
| Indratataka earth dam on four sides with a sluice                                                                   | ✅     | `landscape.test.ts`                                    |
| Old Quarry: faces reachable, cut takes cutSec, walking away stops it, carry slower, lay on camp pile, fall drops it | ✅     | `quarry.test.ts`, AX-01, `x-quarry.png`                |
| Cliff path switches back ≥ 3 times and still reaches the landing; steps and kerbs drawn                             | ✅     | `kulenMap.test.ts`                                     |
| How-to card (arrows walk, mouse aims, click strikes, Q W E R, Space, F) after the hero is chosen                    | ✅     | AX-01                                                  |
| Budgets: site 478k triangles / 69 draw calls; Expedition HUD rules unchanged                                        | ✅     | game.spec, AX-02                                       |

## Kingdom empire world (D60–D66) — 2026-09-30

**Automated:** lint ✅ · types ✅ · unit 281 ✅ · build ✅ · e2e 19/19 ✅

| Check                                                                                                                 | Result | Evidence                                  |
| --------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------- |
| World 1080 × 1080 tiles (10× the area); lake, sea, places on dry land; Dangrek a wall with open passes                | ✅     | `world.test.ts`                           |
| Same seed = same world; a new seed moves stone, gold and trees; stone, gold, fruit near the hall for every seed       | ✅     | `world.test.ts`                           |
| Every animal kind in the world; villagers hunt a deer and bring food home; a tiger attacks; fish never run out        | ✅     | `world.test.ts`                           |
| Auto-work finds jobs (and stays off when switched off); idle soldiers meet raiders; no raids without a war camp       | ✅     | `world.test.ts`, `sim.test.ts`            |
| Waypoints walked in turn; a 150-tile walk arrives (legs); empire place found with its gift; weather every 30 min      | ✅     | `world.test.ts`                           |
| War camp trains the Bokator swordsman; figures bend at the elbow (thrust, sword, draw, guard, plant)                  | ✅     | `world.test.ts`, gallery, `k-bokator.png` |
| Save v3: seed, changed nodes, animals, weather round-trip; v2 refused with a message                                  | ✅     | `save.test.ts`                            |
| In the browser: menu bar (Idle, Workers, Army, Call, Auto, History, New game, weather), 3D button icons, button needs | ✅     | KG-04, `k-icons.png`                      |
| Hover hint on a tree (ring, wood left, right-click action); idle button selects a villager; storm shown               | ✅     | KG-04, `k-hover.png`, `k-storm.png`       |
| Budget: world view 186k triangles / 18 draw calls; demo view 368k / 41                                                | ✅     | KG-02, KG-04                              |

## Kingdom AoE-style view, army, people, houses, sound (D67–D71) — 2026-09-30

**Automated:** lint ✅ · types ✅ · unit 341 ✅ · build ✅ · e2e 19/19 ✅ (KG-04 re-run after making its tree pick independent of the random world)

| Check                                                                                                                                           | Result | Evidence                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------ |
| Occupation database (45) valid: known sources, uncertainty explained, a tool per job, real units, no child soldiers                             | ✅     | `kingdom.test.ts` (validateCharacters)     |
| Commanders: one at a time, title only in 879, Saṅgrāma in the 11th c., Śrīndrakumāra under Jayavarman VII; horsemen wait for the Angkor Wat era | ✅     | `army.test.ts`, `kingdom.test.ts`          |
| Commander aura raises attack; supply cart heals and never fights; watchman explores by himself and reports a patch once                         | ✅     | `army.test.ts`                             |
| Villager tool follows the job; soldiers' dress changes by era; commander parasol, watchman's dog; mounts within budget                          | ✅     | `people.test.ts`, `/gallery.html?people=1` |
| Rong and Keung houses fit their plots, Keung taller; pig, chicken, cow legs animate                                                             | ✅     | `houses.test.ts`, `/gallery.html?houses=1` |
| Sound: no-op without WebAudio, every sim event mapped (found → bark), rate limiter; particles recycle within capacity                           | ✅     | `sound.test.ts`, `vfx.test.ts`             |
| Weather in the world: windy shows leaves, rain shows streaks and splashes; storm raises rain and wind                                           | ✅     | `weather.test.ts`, KG-04 `k-storm.png`     |
| Old map: screen↔world round trip, zoom clamp, drag threshold; the minimap opens it, Esc closes it                                               | ✅     | `ancientMap.test.ts`, KG-04 `k-oldmap.png` |
| Diagonal camera: box select and right-click on a tree still work; command bar folds; menu bar without weather                                   | ✅     | KG-01, KG-04                               |
| Budget: demo view 375k triangles / 47 draw calls; world view 189k / 21                                                                          | ✅     | KG-02, KG-04                               |

## Android phone build of the Kingdom (D72) — 2026-09-30

**Automated:** lint ✅ · types ✅ · unit 345 ✅ · build ✅ · e2e 20/20 ✅ · `npm run android` (build + Capacitor sync) ✅ · MainActivity compiled against Android stubs ✅ · Gradle/APK build ⏳ on PK's PC (Google's Android downloads are blocked in the cloud workspace)

| Check                                                                                                       | Result | Evidence                          |
| ----------------------------------------------------------------------------------------------------------- | ------ | --------------------------------- |
| Gestures: tap, double tap, one-finger pan, pinch zoom, hold hint, hold-drag box; pinch never taps           | ✅     | `touch.test.ts`                   |
| Phone page: credit screen (Mr. Sopheak Pang), tap to start, stage widened to 20:9, touch layout, no council | ✅     | KM-01, `m-start.png`              |
| Touch play: tap a villager selects him, tap a tree sends him to cut wood; ☰ menu; About credits            | ✅     | KM-01, `m-play.png`, `m-menu.png` |
| Android back: closes card, then selection, then reports nothing open                                        | ✅     | KM-01                             |
| Desktop About card credits the developer                                                                    | ✅     | KG-04                             |
| Phone budget: 179k triangles / 20 draw calls (mobile preset: 75 % render, no shadows)                       | ✅     | KM-01                             |

## iPhone web app of the Kingdom (D73) — 2026-09-30

**Automated:** lint ✅ · types ✅ · unit 350 ✅ · build ✅ · e2e KM-01, KM-02 ✅ · offline check: built `dist-mobile` served, service worker cached 17 files, reload with the network off started the game ✅ · on a real iPhone ⏳ (PK)

| Check                                                                                                         | Result | Evidence              |
| ------------------------------------------------------------------------------------------------------------- | ------ | --------------------- |
| Offline file list, cache version per build, worker source, register only as a web app                         | ✅     | `offline.test.ts`     |
| iPhone Safari: install hint on the start screen; apple-touch-icon and manifest (fullscreen, landscape) served | ✅     | KM-02, `m-iphone.png` |
| Upright phone: "turn your phone sideways" screen; hidden when sideways                                        | ✅     | KM-02                 |
| Android APK named `KhmerKingdoms-1.0.0-debug.apk`, copied to `the-temples/apk/`; built on PK's PC             | ✅     | Android Studio build  |

## iPad screen and Wi-Fi play (D74) — 2026-09-30

**Automated:** lint ✅ · types ✅ · unit 355 ✅ · build ✅ · e2e KG-01…04, KM-01…03 7/7 ✅ · local server tried: page, script, manifest, icon, worker served with the right types; `/../` refused ✅ · on a real iPad ⏳ (PK)

| Check                                                                                         | Result | Evidence              |
| --------------------------------------------------------------------------------------------- | ------ | --------------------- |
| Stage shape: long phones wider (up to 2560 × 1080), iPads taller (4:3 → 1920 × 1440)          | ✅     | `screenShape.test.ts` |
| iPad 1180 × 820: stage fills the screen, no bars; command bar at the bottom; no rotate screen | ✅     | KM-03, `m-ipad.png`   |
| Desktop Kingdom unchanged (HUD tips and panel limits now read the stage height)               | ✅     | KG-01…04              |
| Wi-Fi server: files inside `dist-mobile` only, Safari types, home-network address first       | ✅     | `localServe.test.ts`  |

## Cambodian wildlife (D75) — 2026-10-01

**Automated:** lint ✅ · types ✅ · unit 376 ✅ · build ✅ · e2e not run this time (KG-01 only needs more than 100 animals: ~400 now) · in-game look and frame rate on the stream laptop ⏳ (PK)

| Check                                                                                                    | Result | Evidence                     |
| -------------------------------------------------------------------------------------------------------- | ------ | ---------------------------- |
| Old animal configs still parse (`aggressive` → predator); new fields default; bad habitat refused        | ✅     | `kingdom.test.ts` (shared)   |
| Config validates: 26 kinds, unique ids, sources known, uncertain Khmer names explained in notes          | ✅     | `kingdom.test.ts`, sim tests |
| 220 < animals ≤ 450, each kind ≤ 60, kouprey ≤ 2, tiger rare                                             | ✅     | `sim/wildlife.test.ts`       |
| Predator attacks a nearby villager; king cobra only at short range                                       | ✅     | `sim/wildlife.test.ts`       |
| Defensive animal strikes back at its hunter; left alone it does not attack                               | ✅     | `sim/wildlife.test.ts`       |
| Shy animal runs from people; protected kinds skipped by hunt and right-click                             | ✅     | `sim/wildlife.test.ts`       |
| Crocodile, giant ibis, python spawn by water; serow by hills; canopy by forest; doucs in the east region | ✅     | `sim/wildlife.test.ts`       |
| Every model builds (colours, normals, limbs), ≤ 600 triangles (wild elephant ≤ 1000); snakes no legs     | ✅     | `engine/wildlife.test.ts`    |
| Every config kind has a look (scale, ring, perch for canopy); hover tips name the behaviour              | ✅     | `engine/wildlife.test.ts`    |

## Kingdom background music (D76) — 2026-10-01

**Automated:** lint ✅ · types ✅ · unit 383 ✅ (28 new) · build ✅ (PC and phone) · e2e not run (not needed for this change) · headless Chromium smoke test on the built page ✅ · listening on the stream PC ⏳ (PK)

| Check                                                                                                                                                                  | Result | Evidence                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------- |
| Music config: defaults from an empty file, partial moods keep defaults, bad files/levels/scales/tempos refused                                                         | ✅     | `packages/shared/src/music.test.ts` |
| Scale helpers: steps → semitones/Hz across octaves; scale membership; tonic in any octave                                                                              | ✅     | `view/music.test.ts`                |
| Generator: same seed → same music; every pitched note in the phrase's scale (modal shifts too)                                                                         | ✅     | `view/music.test.ts`                |
| Every phrase cadences on the tonic (core, roneat ek, sralai); a piece is variations of one core, accelerating                                                          | ✅     | `view/music.test.ts`                |
| Tense faster than calm, denser chhing, skor thom only when tense; chhing alternates open/closed                                                                        | ✅     | `view/music.test.ts`                |
| Look-ahead scheduler: only notes due in the window, in order, no gaps; mood change at a beat; stall recovery                                                           | ✅     | `view/music.test.ts` (fake clock)   |
| PK's tracks: shuffled rounds, no repeat in a row, failed files skipped, none left → generated; phone: generated                                                        | ✅     | `view/music.test.ts`                |
| Mood rule: tense 30 s before a raid until no raider near, calm 8 s later; no tension while raids wait                                                                  | ✅     | `view/music.test.ts`                |
| Music files: only plain mp3/ogg/m4a names served, copied to the build only when allowed                                                                                | ✅     | `test/musicFiles.test.ts`           |
| Browser: after the first click the AudioContext runs and generated music plays; a raider at the hall → tense; Music button toggles; menu bar fits 1920 px (63–1904 px) | ✅     | headless Chromium on `vite preview` |

**Notes:** the linked YouTube recording is not used or copied; the music is generated. The menu bar font went from 26 to 22 px so the two new buttons fit.

## PK's feature-map upgrade: calendar, lumber camp, alarm, royal court, Anno-style graphics (D77–D79) — 2026-10-02

**Automated:** lint ✅ · types ✅ · unit 433 ✅ (50 new) · build ✅ (PC and phone) · e2e kingdom KG-01…04 ✅ · e2e mobile KM-01…03 ✅ · look on the stream PC ⏳ (PK)

| Check                                                                                                                                | Result | Evidence                                     |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------ | -------------------------------------------- |
| Calendar starts at each chapter's year, one year per 120 game s, held one year before the next temple; saved                         | ✅     | `sim/calendar.test.ts`                       |
| Game speed 1·2·3·5× (button, + and -); Find sends the watchman or an idle villager to the scarcest resource, unexplored ground first | ✅     | `sim/calendar.test.ts`                       |
| 28 world events load sorted with Khmer and English text; shown as the year reaches them and on chapter cards                         | ✅     | `sim/calendar.test.ts`, KG-01                |
| Lumber camp keeps woodcutters' timber; its ox-cart hauls 60 at a time to the store; one cart comes with the camp; stock saved        | ✅     | `sim/logistics.test.ts`                      |
| Alarm: villagers run from a tiger or raiders and go back to their work; idle soldiers go for the danger; calm animals raise nothing  | ✅     | `sim/logistics.test.ts`                      |
| Royal court before every hall (king pointing, queens, Brahmins, parasols), crown and dress by era; roofs by rank                     | ✅     | `view/court.test.ts`                         |
| Graphics switches per preset (AO, bloom, tilt-shift, grade, water, tree kinds, wind, life); phone has no post; Ultra preset          | ✅     | `view/gfx.test.ts`, `engine/figures.test.ts` |
| Forest tree kinds ≤ 260 triangles each (drawn up to 1 600 times)                                                                     | ✅     | `view/gfx.test.ts`                           |
| Meter: scene counted as before (the view, without shadow maps); post-processing counted apart                                        | ✅     | `meter.test.ts`                              |
| HUD on the 1920 stage: menu bar, year bar and eight build buttons fit; all text ≥ 26 px                                              | ✅     | KG-02                                        |
| Frame budget on Low (demo kingdom): scene 409k triangles, 61 calls (limit 600k / 120); post 409k / 78 (limit 600k / 120)             | ✅     | KG-02 budget line                            |

**Notes:** the AO normal pass no longer redraws the shadow maps (they are drawn once per frame). In headless software GL the Kingdom renders at about 0.3 fps, so the gameplay e2e tests use `?preset=lite` and a 10-minute timeout; KG-02 keeps the default Low preset. Sound and music are one button (🎵 on → 🔊 effects only → 🔇 off) so the menu bar fits at 26 px.

## Active king, fewer birds, Hay Day-style orders and baskets (D80, D81) — 2026-10-02

**Automated:** lint ✅ · types ✅ · unit 453 ✅ (20 new) · build ✅ (PC and phone) · e2e kingdom KG-01…04 ✅ · e2e mobile KM-01…03 ✅ · play on the stream PC ⏳ (PK)

| Check                                                                                                                                                               | Result | Evidence                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------- |
| Birds: at most 6 egrets on any preset, none on phones; one over every third field near the view                                                                     | ✅     | `view/gfx.test.ts`                  |
| King: pointing arm swings from the shoulder; looks around and gestures when calm; turns to the last order; blesses with arms raised and a bounce, Brahmins with him | ✅     | `view/court.test.ts`                |
| Order board: a buyer per slot after the wait, goods the buyer wants, gold pay; seeded; several buyers                                                               | ✅     | `sim/market.test.ts`                |
| Deliver takes the goods and pays; not without the goods or before the buyer is there; new buyer after 40 s, 120 s after a throw-away; more per temple               | ✅     | `sim/market.test.ts`                |
| Junk: comes with a three-good order and a bonus, sails if not filled, pays and leaves when filled                                                                   | ✅     | `sim/market.test.ts`                |
| Baskets: fill after 90 s, a click takes 12 food, taken in by themselves 45 s later                                                                                  | ✅     | `sim/market.test.ts`                |
| Saves keep the orders, the junk timer and the baskets                                                                                                               | ✅     | `sim/market.test.ts`                |
| Browser: Orders button opens the board, Deliver pays gold; a basket click adds food                                                                                 | ✅     | KG-04 (`docs/screens/k-orders.png`) |
| HUD still fits the 1920 stage, text ≥ 26 px; frame budget on Low: scene 392k triangles, 57 calls; post 392k / 74                                                    | ✅     | KG-02                               |

## Rice year, light alerts, hunter-scouts and gems, rafts, real loads, circle menu (D82–D86) — 2026-10-02

**Automated:** lint ✅ · types ✅ · unit 475 ✅ (22 new) · build ✅ (PC and phone) · e2e kingdom KG-01…04 ✅ · e2e mobile KM-01…03 ✅ · Android APK 1.1.0 ⏳ (built on the PC) · play on the stream PC ⏳ (PK)

| Check                                                                                                                           | Result | Evidence                                     |
| ------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------- |
| Rice year: five stages in order; moves on only while a farmer works; harvest adds food; seedbed → rows → taller → gold → reaped | ✅     | `sim/rice.test.ts`                           |
| Rahat on the west bund; new farmer actions (sow, pedal, reap); crowd shader has no GLSL reserved names                          | ✅     | `sim/rice.test.ts`, `engine/figures.test.ts` |
| Light alerts: blue over work in progress (gone when done), amber over a full lumber camp, gold flash fading out                 | ✅     | `view/alerts.test.ts`                        |
| Hunter-scout tells the king in person (no report until he reaches the hall), once per patch; hunts game he meets                | ✅     | `sim/army.test.ts`                           |
| Gems in the Pailin fields and scattered; placed after all older nodes (old saves keep ids); pay gold, faster than gold          | ✅     | `sim/gems.test.ts`                           |
| Rafts: no crossing without them; crossing with them; a ford is still preferred; water never buildable                           | ✅     | `sim/rafts.test.ts`                          |
| Real loads: a model per resource, under 600 triangles; logs on the shoulder, baskets on the head                                | ✅     | `view/loads.test.ts`                         |
| Browser: the circle menu opens round the hall and trains from it; orders and baskets still work                                 | ✅     | KG-04 (`docs/screens/k-radial.png`)          |
| HUD fits, text ≥ 26 px; frame budget on Low: scene 411k triangles, 65 calls; post 411k / 81                                     | ✅     | KG-02                                        |

## The king's orders, royal ceremonies, hides and hidden places, the river landing, ✕ and credits (D87–D91) — 2026-10-02

**Automated:** lint ✅ · types ✅ · unit 490 ✅ (15 new) · build ✅ (PC and phone) · e2e kingdom KG-01…04 ✅ · e2e mobile KM-01…03 ✅ · Android APK 1.2.0 (built on the PC) · play on the stream PC ⏳ (PK)

| Check                                                                                                                                                                                               | Result | Evidence                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------- |
| Decree: villagers gather every resource the temple lacks; the storehouse it needs is laid out; foundation laid when the store has enough; up to 14 builders; farmers stay; ends when lifted         | ✅     | `sim/royal.test.ts`                      |
| Ceremonies: each from the record (Khmer + English note, confidence); Buddhist bathing only under Jayavarman VII; devaraja in early eras; by themselves; royal power; 90 s work bonus; kept in saves | ✅     | `sim/royal.test.ts`                      |
| Hunter keeps hides from kills and sells them at a store for gold; heads for a hidden place; hidden places do not clear terrain (old saves)                                                          | ✅     | `sim/army.test.ts`, `sim/world.test.ts`  |
| Junk passes by without a river landing (and says so); a landing must stand at the water's edge                                                                                                      | ✅     | `sim/market.test.ts`                     |
| Fonts: Bokor only for the developer credit                                                                                                                                                          | ✅     | `packages/shared/src/fonts.test.ts`      |
| Browser: the king's name on hover, his circle menu, the decree starts; every card closes with ✕                                                                                                     | ✅     | KG-01, KG-04 (`docs/screens/k-king.png`) |
| HUD fits with nine build buttons, text ≥ 26 px; frame budget on Low: scene 403k triangles, 64 calls; post 402k / 80                                                                                 | ✅     | KG-02                                    |

## Anachak Khmer: levy, king's book, royal roads, 3D hero mode, anime graphics, review agents (D92–D99) — 2026-10-02

**Automated:** lint ✅ · types ✅ · unit 539 ✅ (49 new) · build ✅ (PC and phone) · e2e kingdom KG-02, KG-05 ✅ · e2e mobile KM-04 ✅ (KM-01…03 earlier this round) · Android APK 1.3.0 ⏳ (built on the PC) · play on the stream PC ⏳ (PK)

| Check                                                                                                                                     | Result | Evidence                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------- |
| Levy at the soldier's price (idle first, farmers kept, era/tech/room/commander rules); To battle only against known enemies               | ✅     | `sim/anachak.test.ts`                                             |
| King's overview: resources, people by work, soldiers, houses, stores, plans; refreshes while open                                         | ✅     | `sim/anachak.test.ts`, KG-05 (`k-anachak-overview.png`)           |
| Royal roads: five routes, bridges, rest houses from Jayavarman VII, faster walking, caravans; Kingdom saves unchanged                     | ✅     | `sim/anachak.test.ts`, KG-05                                      |
| Hero mode: move, run, jump, dash, combo, skills, work, quests; the AI leaves the hero alone; Esc and ✕ come back; phone stick and buttons | ✅     | `hero/hero.test.ts`, KG-05 (`k-hero.png`), KM-04                  |
| Figures stand upright in every pose; under 70 draws each; character sheet renders                                                         | ✅     | `hero/hero.test.ts`, `k-hero-sheet.png`                           |
| Royal hall and forest trees: finite, on the footprint, triangle limits; mountains have no NaN colours; grass only on open land and forest | ✅     | `hero/hero.test.ts`, `k-anachak-hall.png`, `k-anachak-forest.png` |
| HUD fits, text ≥ 26 px; frame budget on Low: Kingdom 402k triangles, 65 calls; Anachak hero view 394k triangles, 72 calls                 | ✅     | KG-02, `scripts/shot.mjs` stats                                   |

## Anachak Khmer: danger calls, watch in 3D, the tiger and sword slashes, night fires, every character's sheet, dress by rank (D100–D104) — 2026-10-02

**Automated:** lint ✅ · types ✅ · unit 551 ✅ (25 new) · build ✅ (PC and phone) · e2e kingdom KG-02, KG-05, KG-06 ✅ · e2e mobile KM-04 ✅ · Android APK 1.4.0 ⏳ (built on the PC) · play on the stream PC ⏳ (PK)

| Check                                                                                                                                      | Result | Evidence                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------- |
| The alarm names the person in most danger and the threat; the call flies there; Play / Watch / Let it be; Watch keeps the AI; E takes over | ✅     | `sim/anachak.test.ts`, KG-06 (`k-danger.png`)                           |
| Watching: the body and pose follow the AI's unit (walk, strike, work, rest)                                                                | ✅     | `hero/hero.test.ts`                                                     |
| Tiger encounter: on forest, 16–26 m out, stalking the hero; one at a time; none without forest; anime tiger model                          | ✅     | `sim/anachak.test.ts`, `k-tiger.png`, `sheet-tiger.png`                 |
| Sword slash: crescent sweeps and fades, the pool is reused                                                                                 | ✅     | `hero/hero.test.ts`                                                     |
| Night: day at the start, full night after dusk, smooth dusk; sun and sky dim, sky dome darkens; rest-house fires light at night            | ✅     | `sim/anachak.test.ts`, `hero/hero.test.ts`, KG-06 (`k-watch-night.png`) |
| Dress by rank: dense silk king, sparse commander, plain for others; no gold on commoners; helmets from the Angkor Wat era; shields         | ✅     | `hero/hero.test.ts`, `sheet-all.png`, `sheet-<unit>.png`                |
| Frame budget on Low: Kingdom 409k triangles, 65 calls (post 409k / 81); Anachak hero view under 600k                                       | ✅     | KG-02, `scripts/shot.mjs` stats                                         |

## Anachak Khmer: market, yantra magic, 90s anime look, fish, softer sound, clear zoom, real anatomy, the king's cuirass, real 3D models — the king from TRELLIS, auto-rigged (D105–D112) — 2026-10-03

**Automated:** lint ✅ · types ✅ · unit 572 ✅ · build ✅ (PC and phone) · e2e kingdom KG-01…KG-07 ✅ (KG-07 fixed: the market needs a storehouse first) · e2e mobile KM-04 ✅ · Android APK 1.5.0 ⏳ (built on the PC) · play on the stream PC ⏳ (PK)

| Check                                                                                                                                    | Result | Evidence                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------- |
| Market: villagers can build it after a storehouse; a finished market trades one good for another at the day's price                      | ✅     | `sim/market.test.ts`, KG-07 (`k-market-trade.png`)       |
| Yantra halo and canopy on the skills; fish schools at fishing spots; explored land stays clear; haze starts beyond the zoom              | ✅     | `hero/hero.test.ts`, `view/weather.test.ts`              |
| Anime concept-sheet look, real anatomy (torso, limbs, hands, face), the king's engraved cuirass                                          | ✅     | `hero/anatomy.test.ts`, `sheet-all.png`                  |
| Real model: the king's TRELLIS model (287k → 24k triangles, 2.2 MB) loads, is auto-rigged, replaces the figure, holds the sword, strikes | ✅     | `hero/glbModel.test.ts`, `sheet-king.png`, 3D-mode shots |
| A rig with its arms already down is not turned as a T-pose and stands at idle as sculpted                                                | ✅     | `hero/glbModel.test.ts` (fails without the fix)          |
| The model tools reproduce `king.glb` byte for byte from TRELLIS's file                                                                   | ✅     | `scripts/models/shrink.mjs`, `autorig.mjs`               |

### 1.6.0 (2026-10-05)

| Check | Result | Evidence |
| --- | --- | --- |
| Tiger danger call: Play / Watch in 3D work with a real mouse click (the HUD layer swallowed it; the old test used a synthetic event) | ✅ | `e2e` KG-06 (hit test), Playwright real click |
| Edge scroll keeps going past the stage edge, over panels and bars; stops when the mouse leaves the window | ✅ | `edgeScroll.test.ts` |
| Circle menu: no hint on pressable buttons, a hint on every greyed one | ✅ | `e2e` KG-04 |
| A house moves to a new spot (grid freed and taken, units step off, `moved` event, cost share); temples, rival buildings, switched-off stay put | ✅ | `sim/move.test.ts`, `e2e` KG-08 |
| Props: every slot's file ships and is small; models fit the replaced shape; baked colours graded; textured rocks; instance tint cleared | ✅ | `view/props.test.ts`, `test/propFiles.test.ts`, screenshots |
| Guardian king loads in the 3D mode and stands as sculpted | ✅ | screenshot, `test/propFiles.test.ts` |
| Grass wind and stepped slash dissolve compile into the shaders | ✅ | `hero/hero.test.ts` |
| Kingdom world budget with props (lite preset in the e2e) | ✅ | KG-04: 203,496 triangles, 34 draw calls |

### 1.7.0 (2026-10-06)

| Check | Result | Evidence |
| --- | --- | --- |
| Toon LUT steps the light in flat bands, cool dark band; toon and outline shaders keep the limb motion; outline screen-constant, follows the figures and goes with them | ✅ | `view/diorama.test.ts` |
| Long lens keeps the framing; diorama drops GTAO and always grades | ✅ | `view/diorama.test.ts` |
| Laterite by slope, block AO in whole steps, splat patch keeps the material's own patch | ✅ | `view/diorama.test.ts` |
| Wear map: yards round buildings (not fields), paths worn as bands, regrowth, upload | ✅ | `view/diorama.test.ts`, screenshots after 400–500 s of village life |
| Prek water: Fresnel sky steps by time of day, 2-step glint, crisp foam | ✅ | `view/diorama.test.ts`, screenshot |
| Detail: none on open meadow, pebbles on earth, reeds and lotus at the water, within caps, deterministic | ✅ | `view/diorama.test.ts` |
| Chop, fish, row actions; boat and paddle; the last cut fells the tree (sim event) and it falls and leaves a stump | ✅ | `view/diorama.test.ts`, `sim/felled.test.ts`, screenshots |
| 3D camera stops in front of a tree | ✅ | `hero/hero.test.ts`, screenshot |
| Population 150 / house 10 / phone 100 | ✅ | `rules.json`, `buildings.json`, sim tests read the config |

### 1.8.0 (2026-10-09)

**Automated:** `npm run verify` (lint, types, 633 unit tests in 70 files, build) ✅ · e2e `kingdom.spec.ts` KG-01…KG-08 ✅, `mobile.spec.ts` ✅ (KM-01 timed out once while the machine ran the whole suite in software GL, passed alone).

| Check | Result | Evidence |
| --- | --- | --- |
| Elephant grass: config, 1 m clump with leaves and culms, one noise fetch per vertex, quadratic bend, trample, shrink, shadow pass sways, no black backs; grows in stands and on banks, never near buildings, on earth, forest or water; capped, nearest first; re-laid only when the view moves | ✅ | `view/night18.test.ts`, `docs/screens/k18-grass-low.jpg` (the first tall version was replaced by PK's lower grass) |
| Full screen: toggles in and out, nothing where the browser cannot, a refusal leaves the window; ⛶ fits the 1920 menu bar with text ≥ 26 px | ✅ | `src/fullscreen.test.ts`, e2e KG-02 |
| See-through: only zoomed in; people projected to windows (behind the camera: none); cover patched once, keeps its own patch, own program key | ✅ | `view/night18.test.ts`, `docs/screens/k18-see-through.jpg` |
| Torches: one by each house door, a ring round work places (buildings exist in config), out by day, lit at night, nearest give real light; walkers hold a torch up (`ACT.torch`) | ✅ | `view/night18.test.ts`, `docs/screens/k18-night-torches.jpg` |
| Stars and moon: hundreds of stars above the horizon; phases over cycleDays; full moon up all night, new moon not; rises east, sets west; shown only at night, follows the camera; moonlight follows the phase | ✅ | `view/night18.test.ts`, `docs/screens/k18-moon-stars.jpg` |
| Water: shore distance, depth by slope and cap; wade / swim / boat / raft; in the sim a villager swims until his side has a landing, then boats, rafts with wood | ✅ | `sim/water.test.ts`, `docs/screens/k18-swimming.jpg`, `k18-boats-raft.jpg` |
| Frame budget (low preset, Kingdom start view): 1.7.0 measured 804 833 triangles (over the 600 000 limit: PK's rock and fruit models drawn for the whole map); 1.8.0 with elephant grass 475 351–519 613 | ✅ | e2e KG-02 (`[budget]` lines), KG-04 world 181 136 |

**Not verified here:** frame rate on the stream laptop (software GL in the container), the look of torches and moonlight on a real GPU, the full-screen switch in the Electron window.

### 1.8.0, second part: the jungle references and lower grass (2026-10-09)

**Automated:** `npm run verify` ✅ (lint, types, 642 unit tests in 71 files, build) · e2e KG-02 ✅ (budget 506 148 triangles, 85 draw calls), KG-05, KG-06 ✅.

| Check | Result | Evidence |
| --- | --- | --- |
| Grass under 1 m (both kinds), cogon mixed in, height varies, never on the water, a fringe along it | ✅ | `view/night18.test.ts`, `docs/screens/k18-grass-low.jpg`, `k18-hero-grass.jpg` |
| Red mud, wetness soaks and dries, puddles shine, dead leaves only on forest land | ✅ | `view/jungle18.test.ts`, `docs/screens/k18-mud-puddles.jpg` |
| Mossy rocks, fronds, roots on the forest floor and its edge, none on open grass (rocks rarely) | ✅ | `view/jungle18.test.ts` |
| Mist and light shafts by weather, dawn, wetness and night; fixed world grid | ✅ | `view/jungle18.test.ts`, `docs/screens/k18-light-shafts.jpg` |


### 1.8.0, third part: clear water, the sword at the hip, PK's grass, the keyboard (2026-10-09)

**Automated:** `npm run verify` ✅ (lint, types, 653 unit tests in 73 files, build) · e2e KG-01…KG-09 ✅ (KG-02 budget 502 228 and 506 889 triangles, 86 draw calls; KG-09 new), KM-02…KM-04 ✅. KM-01 ❌: the tap selects the king instead of the villager and times out; it fails the same way on the previous commit (ec40d29) in this container, so it is not caused by these changes — to look at on a real phone.

| Check | Result | Evidence |
| --- | --- | --- |
| Water turquoise, see-through in the shallows (clarity), caustics on a pale sand bed | ✅ | `view/grass18.test.ts`, `docs/screens/k18-water-clear.jpg` |
| The king's sword sheathed at the hip, drawn to strike, back after `keepDrawn` | ✅ | `hero/hero.test.ts`, `docs/screens/k18-sword-hip.jpg` |
| PK's grass baked to cards (3 sides + top, 2 rows), alpha cut, top card folds for a low eye; elephant grass uses Resilient Oasis | ✅ | `view/grass18.test.ts`, `docs/screens/k18-sward-close.jpg` |
| Meadow grass 0.26–0.34 m on every open grass tile (not soil, forest, water, paths, buildings), 8 triangles a clump, green tint; old hero tufts only on the forest floor | ✅ | `view/grass18.test.ts`, `docs/screens/k18-sward-rts.jpg`, `k18-sward-hero.jpg` |
| Keyboard: defaults from config, swap on conflict, Esc/Backspace reserved, kept in the browser (and a blocked store is harmless), Reset; panel Khmer first, text ≥ 26 px; a new key works in the game and the old one stops | ✅ | `kingdom/keymap.test.ts`, e2e KG-09, `docs/screens/k18-keyboard.jpg` |

**Not verified here:** the frame rate with the meadow grass on the stream laptop (software GL here), the keyboard panel with a real Khmer keyboard layout.

### 1.8.0, fourth part: the 10 cm lawn and stones (2026-10-09)

**Automated:** `npm run verify` ✅ (lint, types, 656 unit tests in 73 files, build) · e2e KG-02 ✅ (budget 527 922 triangles, 90 draw calls), KG-09 ✅, KG-05 ✅, KG-06 ✅.

| Check | Result | Evidence |
| --- | --- | --- |
| Lawn 0.09–0.11 m on every open grass tile, patches overlap, flat card above the ground bumps, clumps stand on the ground, thins only on worn earth | ✅ | `view/grass18.test.ts`, `docs/screens/k18-lawn-rts.jpg`, `k18-lawn-hero.jpg` |
| Stone clusters rare, no wind, not pushed | ✅ | `view/grass18.test.ts` |
| Low meadows (a few cm above the water) grow grass; none on the water | ✅ | `view/grass18.test.ts` (GRASS_DRY), water screenshot (no grass on the water) |

### 1.8.0, fifth part: PK's royal hall, the sun and the seasons (2026-10-09)

**Automated:** `npm run verify` ✅ (lint, types, 663 unit tests in 75 files, build) · e2e KG-02 ✅ (budget 528 398 triangles, 88 draw calls), KG-05 ✅, KG-06 ✅, KG-09 ✅.

| Check | Result | Evidence |
| --- | --- | --- |
| Royal hall drawn from PK's model, fitted to the hall's footprint, its own colours, file shipped | ✅ | `view/hall18.test.ts`, `docs/screens/k18-royal-hall.jpg` |
| A day is an hour: ~30 min daylight at the equinox, longer in June, shorter in December; night ≈ half the hour | ✅ | `sim/sunPath.test.ts` |
| Sun rises east, crosses over the south (November), sets west; north of west in June, south in December; under the land at night; shading light kept 10°–62° | ✅ | `sim/sunPath.test.ts` |
| Golden light only near sunrise/sunset; dry and wet season colours differ and blend | ✅ | `sim/sunPath.test.ts`, `docs/screens/k18-sunset-dry.jpg`, `k18-sunset-wet.jpg` |
| Sun disc in the sky dome; water takes the sun's colour and a path of light | ✅ | `view/hall18.test.ts`, `docs/screens/k18-sunset-water.jpg` |

**Not verified here:** the moving shadows' look over a whole hour of play on the stream laptop.

### 1.8.0, sixth part: PK's trees (2026-10-10)

**Automated:** `npm run verify` ✅ (lint, types, 669 unit tests in 76 files, build) · e2e KG-02 ✅ (now waits for the tree models: 546 191 and 560 514 triangles, 91–98 draw calls; world view 193 640), KG-04, KG-05, KG-06, KG-09 ✅.

| Check | Result | Evidence |
| --- | --- | --- |
| Every tree kind the rules name has its model and picture cards shipped | ✅ | `view/trees18.test.ts` |
| Fitted to height, smaller when the crown would be too wide | ✅ | `view/trees18.test.ts` |
| The nearest trees get the model while the triangle budget lasts, the rest picture cards | ✅ | `view/trees18.test.ts`, `docs/screens/k18-trees-forest.jpg`, `k18-trees-hero.jpg` |
| Every house of a group of ≥ 3 has a coconut and a banana; lone pairs none; never inside a building | ✅ | `view/trees18.test.ts`, `docs/screens/k18-trees-hamlet.jpg` |
| Palms and coconuts now and then beside (never on) worn paths near a storehouse | ✅ | `view/trees18.test.ts`, `docs/screens/k18-trees-wayside.jpg` |

**Not verified here:** the frame rate of a dense forest on the stream laptop (software GL here), the first load time of the tree models over the web (4.4 MB).

### 1.8.0, seventh part: the 889 CE house (2026-10-10)

| Check | Result | Evidence |
| --- | --- | --- |
| (KG-02 with the new house: 557 716 triangles ✅) The house fits its 4 × 4 m plot, 5.79 m high, 5 684 triangles, thatch colour, team cloth; above the old stilt house, below the officials' house | ✅ | `view/houses.test.ts`, `view/court.test.ts`, `docs/screens/k18-house-889.jpg`, `k18-house-889-model.jpg` |

### 1.8.0, eighth part: the optimisation pass (2026-10-11)

PK's "master optimization prompt", checked against the code first; parts that did not fit the code were put to PK, who chose (D143).

| Check | Result | Evidence |
| --- | --- | --- |
| `disposeNode` frees each geometry, material, instance buffer, depth material, bone texture and shadow map once; spares shared and kept resources; textures only when asked; safe twice and with nothing | ✅ | `engine/dispose.test.ts` |
| New Game frees the old world: graphics memory level over three New Games (before: +117 geometries, +25 textures each) | ✅ | e2e KG-10; side-by-side run: 121 → 238 → 355 → 439 geometries before, 120 → 120 → 120 after |
| After a New Game the world draws as before (royal hall model, court, grass fields, trees, rocks); no console warnings or errors | ✅ | `docs/screens/k18-optimised-newgame.jpg` |
| Grass: a field knows whether it would re-plant; one field a frame, the longest-waiting first; ground and grass re-laid on new exploration only | ✅ | `view/perf18.test.ts` (`wouldLay`, `exploredVersion`) |
| Night and golden light recolour at most every 0.1 s and catch up after; the sun placed every 0.05 s | ✅ | `view/weather.test.ts`, `view/perf18.test.ts` |
| Trees: model, lighter copy, picture cards by distance and budget; every tree's lighter copy ships | ✅ | `view/trees18.test.ts` |
| Frame budget (Low) with the middle tree step | ✅ 585 442 triangles, 104 calls | e2e KG-02 (40 000 mid + 30 000 near was 606 903: rebalanced to 30 000 + 20 000) |
| CPU work per frame, drawing off, old and new served side by side, three 20 s pans each | ✅ p99 51–62 → 16–21 ms; worst 95–141 → 47–62 ms; worst grass frame 53–71 → 24–29 ms | scratchpad harness (not shipped) |
| `npm run verify` (lint, typecheck, 78 test files / 677 tests, build) | ✅ | |
| e2e: KG-01…KG-10, KM-01…KM-04, AX-01, AX-02, smoke | ✅ | |

**Not done (PK's choice):** WebGPU, a 600-clump grass cap, per-tree `THREE.LOD`, the model re-simplifier. **Not verified here:** frame times on the stream laptop's GTX 1660 Super (software GL here, so only the game's own CPU work was measured).

### 1.9.0, Sprint 1, first part: the 3D hero's controls (2026-10-16)

PK said "Let start" on the upgrade plan; the six decisions follow the proposals (D144). Controls: D145.

| Check | Result | Evidence |
| --- | --- | --- |
| A / D step sideways, S steps back at the back speed, he keeps facing ahead, legs run backward on S | ✅ | `hero/heroControls.test.ts` |
| Ten seconds of A with the camera rule on: a straight line, the camera never turns (the old spin) | ✅ | `hero/heroControls.test.ts`; e2e KG-05 (A held: mode `side`, camera yaw unchanged, heading ahead) |
| The touch stick still turns him toward where it points | ✅ | `hero/heroControls.test.ts` |
| Right click vs right drag; walks to the clicked point and stops; a move key takes over; gives up at a wall; walking up to a foe ends in a strike | ✅ | `hero/heroControls.test.ts` |
| Gold ring in reach, red beyond; a click strikes or walks up; the cursor picks raiders and animals, never a friend | ✅ | `hero/heroControls.test.ts` |
| Landing dust: fall speed reported; 20 puffs (30 after a hard fall) lifted 0.35 m above the 10 cm lawn, ochre on earth, green on grass, a splash on water; particles take the colours and spread in a ring | ✅ | `hero/heroControls.test.ts` |
| `npm run verify` (lint, typecheck, 79 test files / 693 tests, build) | ✅ | |
| e2e KG-05 (levy, overview, 3D hero: W, A, strike, Esc, the king) | ✅ 1 passed (3.5 min) | `docs/screens/k-hero.png` |

**Not done (D145):** "Q W E R skills at the cursor" and "arrow keys walk" (those keys are already Dodge, Forward, Work, Skill and the camera). The walk to a clicked point goes straight with wall sliding, not along a path round obstacles. **Not seen here:** the rings and dust at full speed on PK's PC (software GL in the test).

### 1.9.0, Sprint 1, second part: PK's bugs, ខ១–ខ៨, levy, auto hero, danger rings, progress, MOBA keys (2026-10-16)

PK delegated ខ១–ខ៨ ("by your decisions, what is best for me", D146); his bugs: A/S/D showed only the hero's back (D146), Preah Ko did not show when finished (D147); Sprint 1 items: D148.

| Check | Result | Evidence |
| --- | --- | --- |
| A turns him left, D right, S round toward the camera at full speed with legs forward; W after S turns him back; the camera never spins | ✅ | `hero/heroControls.test.ts`; e2e KG-05 (A: mode `side`, camera yaw unchanged, heading to the camera's left) |
| Preah Ko built in play: new stones fly in, more than 90 % shown at 0.99, all shown within 5 s of finishing; big pieces wait for their course | ✅ | `world/templeGrow.test.ts`; e2e KG-11 |
| No levy without a finished barracks of the player's; a rival one does not count; the button greyed in the panel, enabled once built | ✅ | `sim/anachak.test.ts`; e2e KG-05 |
| Danger zones: predators on explored land at their sense range, none on unseen land, seen raiders, known camps; nearest-edge order; the edge arrow's angle | ✅ | `sim/danger.test.ts` |
| In 3D a tiger 30 m ahead: ring on the ground, arrow at the top of the screen with its name and distance; X hides and shows | ✅ | e2e KG-12, `docs/screens/k-hero-danger.png` |
| 🤖 auto: a raider in range first, shy deer never a foe, walks to the nearest work then swings, a load goes to a store; T starts it, W takes control back | ✅ | `hero/heroAuto.test.ts`; e2e KG-12 |
| Temple progress picture clipped to the built height, bar, Khmer percent | ✅ | `view/monumentProgress.test.ts` |
| Hero schemes: Action default, MOBA keys, no key twice in any merged scheme (schema), kept with `_scheme`, Reset back to Action, panel shows both | ✅ | `keymap.test.ts`; schema in `packages/shared/src/kingdom.ts` |
| `npm run verify` (lint, typecheck, 83 test files / 718 tests, build) | ✅ | |
| e2e KG-05, KG-09, KG-11, KG-12 | ✅ | |

**Not done yet:** ខ៥ (extra skills on W E R), Sprint G, Sprint M, Sprints 2–3. **Not seen here:** frame cost of the rings on PK's PC (two instanced draws, at most 48 rings).

### 1.9.0, Sprint M step 1 and Sprint G start: Meshy buildings and heroes, PC 1660, 🖥 (2026-10-16)

| Check | Result | Evidence |
| --- | --- | --- |
| Six Meshy buildings and the royal hall: a model in the game, one mesh, colour map only, ≤ 15 000 triangles, `pc` on all but the hall | ✅ | `view/props.test.ts` |
| Meshy buildings face +z like the game's (door, stair, jetty on the water side) | ✅ four views each (scratchpad render) | `docs/screens/k-pc1660.png` (granary, noble house in the game) |
| Low frame budget with them on Low | ❌ 618 350 triangles → kept off Low | e2e KG-02 |
| Low frame budget (built-in buildings) | ✅ 586 662 triangles, 105 draws | e2e KG-02 |
| PC 1660 loads the Meshy buildings; the 🖥 panel shows FPS and the lit preset | ✅ | e2e KG-13, `docs/screens/k-pc1660.png`, `docs/screens/k-gfx-panel.png` |
| Meshy heroes: every hero on foot has one, rig and one map, no clips; the phone table keeps only the king's own file | ✅ | `hero/glbModel.test.ts` |
| Presets: pc1660 = 4096 shadows + Meshy buildings, Low/Lite/phone without; stored choice wins, `presetLock` and bad values handled; panel colours | ✅ | `view/gfxPanel.test.ts` |
| `npm run verify` (lint, typecheck, 84 test files / 724 tests, build) | ✅ | |
| e2e KG-02, KG-13 | ✅ | |

**Not verified here:** frame rate of PC 1660 on PK's GTX 1660 Super with LIVE Studio running (PK: 🖥 on the year bar). **Not done yet:** the five new buildings (forge, healer's hut, arogyasala, quarry, training ground) and their rules; Meshy people in the crowds (ខ១ A: near the camera); animals in the game.

## 1.9.0-14 hero skills (D150) — 2026-10-16

| Check | Result | How |
| --- | --- | --- |
| Config: every kit's skills valid, fighters 3 extra, villager/cart 1, great skill longest cooldown | ✅ | `hero/heroSkills.test.ts` |
| Keys: Action 1/2/3, MOBA W/E/R, no key repeated in a scheme | ✅ | `kingdom/keymap.test.ts` |
| The king's four buttons, the great skill fires on 3, cooldown shown, yantra canopy above him | ✅ | e2e KG-14, `docs/screens/k-hero-ultimate.png` |
| `npm run verify` (lint, typecheck, 85 test files / 729 tests, build) | ✅ | |
| e2e KG-12, KG-14 | ✅ | |

## 1.9.0-15 yantra effects for every hero (D151) — 2026-10-16

| Check | Result | How |
| --- | --- | --- |
| Every skill of every hero has known effects; fighters have a guardian; great skills ≥ 2 effects | ✅ | `hero/skillVfx.test.ts` |
| Plans: rain lands inside its radius, dash streak start→end, crescents round / fan, pillars round him, yantra art never under his feet, under half of `maxLive` | ✅ | `hero/skillVfx.test.ts` |
| Art sheet: 7 yantra, 6 guardians, weapons, script, wave, petal | ✅ | `/heroSheet.html?yantra=1` |
| Each hero's great skill plays its effects in game (king, swordsman, spearman, archer, horseman, war elephant, watchman) | ✅ | e2e KG-15, `docs/screens/k-vfx-*.png`; KG-14 still passes |

**To change (D152, PK's choice):** the unalom and chedi spires go for 9th-century motifs; the script pillars are faint and will be brightened with the PC realistic look.
| `npm run verify` (lint, typecheck, 86 test files / 743 tests, build) | ✅ | |

## 1.9.0-16/17 semi-realistic PC look and PK's models (D152, D153) — 2026-10-19

| Check | Result | How |
| --- | --- | --- |
| PC 1660 / High / Ultra are `real` (no tilt-shift); Low, Lite, phone unchanged; AO back in the PC chain | ✅ | `view/gfx.test.ts`, `engine/look.test.ts` |
| `real` never flattens a material | ✅ | `engine/look.test.ts` |
| Every building type incl. the house has a model (one mesh, ≤ 3 PBR maps, ≤ 15k triangles) | ✅ | `view/props.test.ts` |
| Scatter: every kind is a matched model; habitats kept, no road, hall clear, rare kinds rare, clumps; worst case < 650k triangles | ✅ | `view/scatter.test.ts` |
| 107 models made game-ready in Blender, each checked by its picture; 6 broken by over-cutting re-made | ✅ | `scripts/models/blender/gamify.py`, check pictures on PK's PC |
| In game on PC 1660: house / storehouse / market models, scatter > 50 shown | ✅ | e2e KG-16, `docs/screens/k-real-village.png`, `docs/screens/k-real-land.png` |
| `npm run verify` (87 test files / 755 tests) | ✅ | |

**Not yet:** people, animals and livestock from the models (need animation), Preah Ko textured, noble house finials trimmed, the second batch of plants and rocks (running in Blender). Frame rate on PK's PC not measured.

## 1.9.0-18 PK's look notes and the rest of the models (D154) — 2026-10-19

| Check | Result | How |
| --- | --- | --- |
| Trees a–f ≥ 18 m, house `scaleY` > 1, boats sink ≥ 0.3 | ✅ | `view/props.test.ts` |
| Grass kinds gone from the scatter; clumps still in habitat | ✅ | `view/scatter.test.ts` |
| Enemy named by era; 879 marked invented | ✅ | `sim/foe.test.ts` |
| Every scatter kind has its model: one mesh, one part, ≤ 4 PBR maps | ✅ | `view/props.test.ts` |
| 43 models (8 re-made, 35 plants/trees/rocks) checked by picture; old trunk rejected (shredded) and re-made | ✅ | check pictures on PK's PC |
| Scatter worst case counted from the files < 550k (≈ 524k); no kind over 10k (rare 6k); one software-rendered frame 47 s → 1.1 s, 2.07 M triangles with shadows | ✅ | `view/scatter.test.ts`, browser probe on PC 1660 |
| 14 heaviest scans (0.9–8 M triangles → ≈ 6 000) made with `scripts/models/heavy.mjs`, checked by picture; glowcap, crystal tree and red mushrooms' textures smear (rare fantasy kinds, kept) | ⚠️ | Blender renders on PK's PC |

## 1.9.0-19 the 3D hero's own clips (D155) — 2026-10-19

| Check | Result | How |
| --- | --- | --- |
| Gait weights: idle → walk → run by speed, add up to 1 | ✅ | `hero/glbModel.test.ts` |
| Rig with clips: idle standing, run running, strike = game's arms over clip legs, jump = game's whole body; drawn sword in the model's right hand | ✅ | `hero/glbModel.test.ts` |
| Every PC hero file carries idle (or combat stance), walk and run clips; phone keeps its figures | ✅ | `hero/glbModel.test.ts` |
| `npm run verify` (88 test files / 763 tests, build) | ✅ | |

## 1.9.0-20 the RTS people near the camera (D155) — 2026-10-20

| Check | Result | How |
| --- | --- | --- |
| Every act gives finite joint turns; walking and standing left to the clips; a hammer blow raises the arms over the head; the spear arm drives while the shield arm holds; fights and field work hold the legs, planting and reaping the body | ✅ | `view/nearPeople.test.ts` |
| Model by type or job, shared by id; riders, elephants and the cart stay in the crowd; every named file has idle (or stance) and walk clips | ✅ | `view/nearPeople.test.ts` |
| Nearest within the radius, at most `max`; a person waits for the model (the crowd draws him), works, goes back to the pool and is reused | ✅ | `view/nearPeople.test.ts` |
| `?shadowMap=` only takes powers of two 512–4096 (tests' software renderer) | ✅ | `engine/look.test.ts` |
| e2e KG-13 (PC 1660: Meshy buildings, Meshy heroes, 🖥 panel) | ✅ | 9.8 min in the software renderer, `shadowMap=2048` |
| e2e KG-16 (PC look village, scatter, near people) | ❌ times out | In the software renderer a frame of the whole explored Anachak map now takes ≈ 20 s (the 21 m trees and their shadows); at the KG-13 close view one frame took 56 ms with the old trees and > 4 min with the new ones (4096 shadows; 1.1 s at 2048, 0.2 s without shadows). **The frame rate must be measured on PK's GTX 1660 Super** (🖥 panel) before the tall forest is kept as it is. |
| `npm run verify` (89 test files / 770 tests, build) | ✅ | |

## 1.9.0-21 PK's notes of 2026-10-20 (D156)

| Check | Result | How |
| --- | --- | --- |
| Palms ≤ 14 m, scattered palms ≤ 1.6× their model; buildings drawn bigger (house 1.5, others 1.3); land blend set | ✅ | `view/props.test.ts` |
| A building can be drawn bigger than its footprint, still standing on the ground; the blend reaches the shader (colour to the land, dusted foot) | ✅ | `view/props.test.ts` |
| Bank trees smaller the nearer the water, none in it; water distance by tiles | ✅ | `view/props.test.ts` |
| Big scattered trees keep 3 tiles from open water (whole Anachak map) | ✅ | `view/scatter.test.ts` |
| Emerald tree gone; the big tropical tree from Blender (4 100 triangles, one mesh, bark-and-leaf atlas) in its place, checked by renders | ✅ | `view/scatter.test.ts`, renders on PK's PC |
| 3D hero: scatter picked round him (trees by him no longer vanish) | ✅ | `view/scatter.test.ts` |
| 3D hero wades: into the shallows up to the chest, never deep water; fords count as water; the depth eases between tiles; rings and splashes | ✅ | `hero/hero.test.ts`, `hero/wading.test.ts`; browser probe: knee-deep in the river, 5 rings, `docs/screens/k-hero-wade.png` |
| PC hero buttons: one bar at the bottom, every button with its key | ✅ | e2e KG-14, `docs/screens/k-hero-ultimate.png` |

| `npm run verify` (90 test files / 781 tests, build) | ✅ | |

## 1.9.0-22 Royal Orders ព្រះរាជបញ្ជា (D157) — 2026-10-20

| Check | Result | How |
| --- | --- | --- |
| Orders file read and checked: duties and questions, unique ids, answers in range, kits and places known; a bad file is refused with its reason | ✅ | `shared/orders.test.ts` |
| Random pick by kit, a question every 3rd order, never the same order twice in a row; ids made from the English name | ✅ | `shared/orders.test.ts` |
| Bridge sends the orders on connect, adds and removes from the host, writes `config/kingdom/orders.json`, refuses a bad order | ✅ | `bridge/server.test.ts` |
| Host tab: list, add form (duty or question), remove | ✅ | `host/orders.test.ts`, e2e `host.spec.ts`, `docs/screens/host-royal-orders.png` |
| 3D hero: next order skips visits to buildings not built; duty progress counted; keys 1–4 or clicks answer a question | ✅ | `hero/royalOrders.test.ts`; browser probe: question card shown |

## 1.9.0-23 PK's notes of 2026-10-20 10:28 (D158)

| Check | Result | How |
| --- | --- | --- |
| Real water: Fresnel 2 % straight down → mirror at a glancing view; light absorbed red first; reflection drawn once a frame, disposed | ✅ | `view/realWater.test.ts`; browser probe |
| Hero swims in deep water (crawl moving, treading still), no jump or dodge there, swim pace from the rules | ✅ | `hero/hero.test.ts`; browser probe: swimming, card shown |
| Court before the hall: PK's king, queens, Brahmins, parasol bearers; files present | ✅ | `view/nearPeople.test.ts` |
| Blender weapons and gear: 10 models, one mesh each, 466–1 202 triangles; hero swaps them in on the PC look | ✅ | `hero/glbModel.test.ts`, renders on PK's PC |
| Oak and lone tree → mango and rain tree (Blender) | ✅ | `view/scatter.test.ts` |
| Forest trees a–f re-made in Blender (3 455–4 399 triangles, alpha leaf atlas, new cards); full height kept; leaf cut-out and leafy shadows; stray objects from other Blender scenes stripped from the exports | ✅ | `view/trees18.test.ts`, card atlas and browser probe |
| `npm run verify` (94 test files / 799 tests, build) | ✅ | |

## 1.9.0-24 leafier trees (D159) — 2026-10-20

| Check | Result | How |
| --- | --- | --- |
| New leaf atlas and crowns (round lobes of leaf sprays, sunlit top, shaded heart, normals out of the clumps); forest trees a–f 4 375–5 713 triangles, new picture cards | ✅ | Blender renders on PK's PC, card atlas checked by picture |
| A leaf-card tree keeps its own normals; other trees get them worked out again | ✅ | `view/trees18.test.ts` |
| Mango, rain and big tropical trees remade, each ≤ 4 984 triangles, scatter worst case still < 550k | ✅ | `view/scatter.test.ts` |
| lint, typecheck, tests (94 files / 800 tests), game build | ✅ | |

## 1.9.0-25 PK's notes of 2026-10-20 16:01 (D160)

| Check | Result | How |
| --- | --- | --- |
| ព្រះរាជបញ្ជា inbox: newest first, at most 60, unread count, chapter cards kept whole, the vote at the top | ✅ | `view/inbox.test.ts` |
| Roof bars: progress, what is in hand, the queue counted by kind, builders on a site; no blue light where a bar stands | ✅ | `view/roofBars.test.ts`, `view/alerts.test.ts` |
| Stuck in traffic: a walker held up by people standing in the lane plans round them and arrives; the grid is untouched afterwards | ✅ | `sim/move.test.ts` |
| ⚙ board: every top-menu and year-bar button and message box switches off by CSS, remembered, broken copies ignored | ✅ | `view/board.test.ts` |
| See-through: near fade before the camera in both views, the hero's own window; scatter models are cover | ✅ | `view/night18.test.ts` |
| Royal hall court clear of trees (sim and yard trees); half the houses have yard trees | ✅ | `view/trees18.test.ts` |
| Storehouse made in Blender (3 952 triangles), not shared with a house | ✅ | `view/props.test.ts`, Blender renders |
| Fish made in Blender: three kinds by weight, nose forward, files ship | ✅ | `view/fishSchool.test.ts`, Blender render |
| PK's animals near the view: files for 20 kinds, real size, walk clip at their pace, pooled; primates keep figures | ✅ | `view/nearAnimals.test.ts` |
| Raid: raiders go for the storehouse; the line forms (shields, spears, bows); pairs; theft, loot dropped back; cheer; blocks ≈ 35 %; push back; a Royal Order calls a raid; the hurt rest | ✅ | `sim/battle.test.ts` |
| Battle sounds (drum, block, axe, cheer) mapped from events | ✅ | `view/sound.test.ts` |
| `npm run verify` (99 test files / 836 tests, build) | ✅ | |
| e2e KG-01 (inbox, vote), KG-03 (chapter card from the inbox), KG-14 (half-size hero bar; the open Royal Order question closed first, since 1–4 answer it) | ✅ | software renderer, 7.2 min + 1.7 min; `docs/screens/k-inbox.png`, `k-hero-ultimate.png` |
