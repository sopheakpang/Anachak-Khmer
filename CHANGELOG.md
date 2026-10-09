# Khmer Kingdoms · The Temples — update log

Every update, newest first. Each change has a code (`<version>-<number>`) so it can be named in a message or a bug report. Decision numbers (D…) point to `docs/DECISIONS.md`; the Android APK of each version is `apk/KhmerKingdoms-<version>-debug.apk`.

## 1.8.0 — 2026-10-09

| Code | Change |
| --- | --- |
| 1.8.0-01 | **Elephant grass and cogon grass** (ស្មៅដំរី, ស្បូវ; PK's Godot shader in three.js): dense stands of wild grass under 1 m high with natural variation (taller inside a stand, shorter at its edge), cogon paler with white plumes, a fringe along rivers (never on the water), rolling in waves of wind; people walking through push it aside; it grows round the hero in the 3D mode too. Never near buildings, on paths, fields or roads (D125, D131). |
| 1.8.0-02 | **Full screen** button ⛶ at the end of the menu bar (or F11): the game fills the whole 1920×1080 monitor; Esc or F11 leaves it (D126). |
| 1.8.0-03 | **See-through when zoomed in**: close up, buildings, trees, temple walls and tall grass in front of people open a window round them, so the people at work are always seen (D127). |
| 1.8.0-04 | **Torches at night** (ពេលយប់ដុតគប់ភ្លើង): a torch by the door of every house, torches round the hall, storehouses, camps, the landing, the market, the barracks and the temple site; people out walking carry a torch held high, and one is planted by people still at work; warm light on the ground and on the people near them (D128). |
| 1.8.0-05 | **Stars and the moon**: hundreds of twinkling stars and a moon that keeps time: it rises in the east and sets in the west, later each night, and goes from new to full and back (8 game days). Moonlight comes from where the moon stands, brighter at full moon; clouds go dark at night (D129). |
| 1.8.0-06 | **Crossing water** (PK): shallow water is waded; deeper than the chest people ride a dugout boat (ទូក), or a bamboo raft (ក្បូនឬស្សី) when they carry wood or stone, once the kingdom has a river landing; with no boat they swim (front crawl, or treading water when they stop). Elephants and horses wade (D130). |
| 1.8.0-07 | **Fixed** the frame budget: PK's rock and fruit models were drawn for the whole map every frame; now only those near the view (about 800 000 → 500 000 triangles at the start). |
| 1.8.0-08 | **Red laterite mud** (PK's jungle references): the worn paths and yards are red clay, dark when wet; after rain **puddles** stand in the hollows of the mud, mirroring the sky, rings where the drops fall; the ground dries in about six minutes (D132). |
| 1.8.0-09 | **The forest floor**: drifts of dead leaves under the trees, **mossy laterite rocks**, **fallen palm fronds** and **creeping roots** on the floor and at its edge; a few rocks out on open land and by the water (D132). |
| 1.8.0-10 | **Humid air**: soft banks of **ground mist** drifting low, thick in mist and rain, at dawn and after rain; **light shafts** slanting down from the sun through gaps in the clouds on cloudy days and after rain (D133). |
| 1.8.0-11 | **Crystal-clear turquoise water**: the rivers, canals and moats are clear turquoise; the pale sandy bed shows through in the shallows, with dancing light (caustics); deeper it turns deep teal (D134). |
| 1.8.0-12 | **The king wears his sword at the hip**: sheathed at his waist while he walks, works or rests; he draws it to strike or use his skill and puts it back a moment after the fight (D135). |
| 1.8.0-13 | **PK's 3D grass in the game**: PK's Meshy grass "Resilient Oasis" is now the elephant grass, and his "mix of cogon" grass covers **every green meadow** as short grass 30 cm high (above the foot, below the knee); both roll in the wind and bend round walkers; from the high camera each tussock is seen from above. The old spiky tufts round the hero are gone from the meadows (D136). |
| 1.8.0-14 | **Keyboard settings** 🎮 (year bar): every key of the kingdom view and of the 3D hero mode can be changed, two keys per action, Khmer names first; a key already used moves to the action it came from; kept in the browser; Reset brings the defaults back. The hero's buttons and hints name the keys you chose (D137). |

## 1.7.0 — 2026-10-06

| Code | Change |
| --- | --- |
| 1.7.0-01 | **Angkor Cel-Diorama look** (low, high, ultra): the land, buildings and water in stylised PBR light; people, animals and the court drawn flat like illustrated characters (toon light bands, ink outline, warm rim) so they read against the ground (D119). |
| 1.7.0-02 | **The ground follows life** (PK's reference): a natural lawn of several greens on open land; bare brown earth round every building and wherever people walk and work, so paths wear in by themselves; grass grows back where nobody goes (D120). |
| 1.7.0-03 | **Long sun shadows**: a lower afternoon sun, deeper shade, deep natural greens in the trees (D120). |
| 1.7.0-04 | **HD-2D camera**: a long lens (18°) like a model village, tilt-shift blur at the top and bottom, warm golden light against cool blue shade (D121). |
| 1.7.0-05 | **Prek canal water**: depth colour from jade to teal, the sky's colour by time of day, sharp sun glints, a crisp foam line, two drifting ripple layers, lotus pads and reeds (D122). |
| 1.7.0-06 | **Boats**: people cross water standing in a dugout boat (ទូក) and paddle it (D123). |
| 1.7.0-07 | **Fishing**: the fisher throws the Khmer cast net (សំណាញ់) and hauls it in (D123). |
| 1.7.0-08 | **Woodcutting**: two-handed axe strokes at the trunk; with the last cut the tree falls away from the woodcutter and leaves a stump (D123). |
| 1.7.0-09 | **More people**: the kingdom can grow to 150 people (was 60; 100 on the phone), and a house now shelters 10 (was 5), so far fewer houses are needed (D124). |
| 1.7.0-10 | **Fixed** the 3D mode camera standing inside a tree (a tree behind the hero could fill the whole view); it now stops in front of trees as it does in front of walls. |
| 1.7.0-11 | Graphics settings in one file: `config/kingdom/diorama.json` (toon ramp, outline, rim, lens, tilt-shift, grade, ground, light, terrain, water, detail). Docs: `docs/VISUAL_BIBLE.md`, `docs/TECH_ARCHITECTURE.md`. |
| 1.7.0-12 | Kept from the review of 1.6.0: the cel look was taken back off the Kingdom tab and Anachak got a `look` switch (`build` by default, `anime` for the 90s anime look); the Meshy trees' colours were toned down; the crumpled-looking Meshy broadleaf and mango stay off in the diorama (`props.json` `diorama: false`). |

## 1.6.0 — 2026-10-05

| Code | Change |
| --- | --- |
| 1.6.0-01 | **Move buildings**: select one of yours, press ✥ Move, click the new spot (red ghost = cannot go there, right-click cancels). The historical temples stay on their real sites (D113). |
| 1.6.0-02 | **Fixed** the tiger / raider danger call: *Play in 3D* and *Watch in 3D* did nothing when clicked (the HUD layer swallowed the click). |
| 1.6.0-03 | **Edge scroll follows the mouse** to the edge of the whole window, also over panels and the bars beside the view; it stops when the mouse leaves the window and speeds up nearer the edge (D114). |
| 1.6.0-04 | **Circle menu**: no hint box when hovering; a greyed button still shows what is missing (resources, a building first, a later era) (D115). |
| 1.6.0-05 | **PK's 3D models in the world**: Meshy common trees, forest palms, mango trees, sugar palms on the paddy dikes, stone and gold rocks, banana plants (464 KB in all; low/high/ultra presets) (D116). |
| 1.6.0-06 | **New king model** in the 3D mode: PK's Meshy *Golden Temple Guardian* with its own rig (D117). |
| 1.6.0-07 | **Stylised cel-shaded mid-poly look**: smooth shapes, three light bands, coloured ink lines, cool shadows and warm light, vibrant colour and warm haze toward the horizon (Kingdom tab and 3D mode) (D118). |
| 1.6.0-08 | **Wind in the grass** (gusts roll across the field, tips sway) and **sword slashes that dissolve in hard steps** (D118). |
| 1.6.0-09 | Tools: `scripts/models/props.mjs` (shrink PK's raw Meshy files for the game), `scripts/models/inspect.mjs` (triangles, textures, size, rig of any .glb). |
| 1.6.0-10 | This update log. |

## 1.5.0 — 2026-10-03

| Code | Change |
| --- | --- |
| 1.5.0-01 | The king's real 3D model (made on TRELLIS, shrunk and auto-rigged) in the 3D mode (D112). |
| 1.5.0-02 | Anachak: human anatomy for the heroes, the king after PK's reference sheet, rigged .glb model support (D109–D111). |
| 1.5.0-03 | 3D model prompt set: 259 assets with file names and history-based prompts (`docs/MODEL_PROMPTS.md`). |

## 1.4.0 — 2026-10-02

| Code | Change |
| --- | --- |
| 1.4.0-01 | Anachak: danger calls with watch / play in 3D, tiger encounters, sword slashes, night fires, character sheets, dress by rank (D100–D104). |
| 1.4.0-02 | Market exchange, yantra skill light, 90s anime look and reference-sheet dress, fish schools, clearer zoom, quieter sound (D105–D108). |

## 1.3.0 — 2026-10-02

| Code | Change |
| --- | --- |
| 1.3.0-01 | The Anachak Khmer tab: levy, the king's book, royal roads, the 3D hero mode, anime graphics (D92–D99). |

## 1.2.0 — 2026-10-02

| Code | Change |
| --- | --- |
| 1.2.0-01 | The king can be picked and gives his decree to build the temple; royal ceremonies; hunters sell hides and find hidden places; a river landing with the Chinese junk; developer credit (D87–D91). |

## 1.1.0 — 2026-10-02

| Code | Change |
| --- | --- |
| 1.1.0-01 | The rice year in every field, light alerts, hunter-scouts with dogs, Pailin gems, bamboo rafts, real carried loads, the Hay Day-style circle menu (D82–D86). |
| 1.1.0-02 | An active king, the order board with buyers and the Chinese junk, egg baskets; Anno-style graphics (AO, glow, tilt-shift, water, five tree kinds) (D79–D81). |

## 1.0.0 — 2026-09-30

| Code | Change |
| --- | --- |
| 1.0.0-01 | Khmer Kingdoms for Android: the Kingdom tab as an offline phone game, touch controls (D72). |
| 1.0.0-02 | Before the phone build: the campaign over 13 temples, the empire map, AoE II-style view and HUD, wildlife, music, weather (v0.1 → D78). |
