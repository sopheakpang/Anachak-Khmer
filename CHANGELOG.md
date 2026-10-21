# Khmer Kingdoms · The Temples — update log

Every update, newest first. Each change has a code (`<version>-<number>`) so it can be named in a message or a bug report. Decision numbers (D…) point to `docs/DECISIONS.md`; the Android APK of each version is `apk/KhmerKingdoms-<version>-debug.apk`.

## 1.9.0 — Sprint 1 (in progress, 2026-10-16)

| Code | Change |
| --- | --- |
| 1.9.0-01 | **3D hero: A / D / S fixed** (PK's bug): A and D now step sideways and S steps back while the hero keeps facing ahead; the camera stays where it is. Before, the camera swung round behind him at every step, so "left" kept changing and he and the camera spun in circles. W still walks ahead and the camera follows (D145). |
| 1.9.0-02 | **3D hero with the mouse**: right-click the ground and he walks there by himself (a gold ring marks the spot; any move key stops him); hold the right button and drag to turn the camera as before; left-click a raider or a wild animal to strike it (he walks up first if it is too far); the ring under the animal or raider at the cursor is gold when he can reach it, red when not; the wheel zooms (D145). |
| 1.9.0-03 | **Dust when the hero lands**: a ring of dust you can see above the grass, red earth on roads and bare ground, pale green on grass, bigger after a high fall, and a splash in shallow water (D145). |
| 1.9.0-04 | **3D hero: A / S / D turn him round** (PK): A turns him to the left, D to the right and S round toward the camera, and he walks that way showing his side or his face — no more walking with his back to you. The camera stays put (only W and a walk to a clicked point move it), so it still never spins (D146). |
| 1.9.0-05 | **Preah Ko appears the moment it is finished** (PK's bug): the stones now rise one by one while the temple is built, and the whole temple with its crowns, lintels and Nandi shows at once when the work ends; before, it only showed after loading a save (D147). |
| 1.9.0-06 | **Call to arms needs a barracks** (PK): the king can call villagers up as soldiers only once a barracks is finished; until then the buttons say "Build a barracks first" (D148). |
| 1.9.0-07 | **🤖 Auto for the 3D hero** (button or T): he plays by himself — fights a raider or a dangerous animal that comes near, otherwise works what is at hand or walks to the nearest work (takes a load to the store, helps build, gathers). Any key or click gives control back (D148). |
| 1.9.0-08 | **Red danger rings** (PK): red rings on the ground round tigers and other dangerous animals, raiders and rival camps, also on the minimap; in the 3D mode a red arrow at the edge of the screen points to the nearest danger with its name and how far it is. X hides or shows them (D148). |
| 1.9.0-09 | **Temple progress with its picture**: the objective line shows a small picture of the temple that fills from the foot up as it rises, with a gold bar and the percent (D148). |
| 1.9.0-10 | **MOBA keys for the 3D hero** (🎮 → Hero): pick "Action (WASD)" as now, or "MOBA": arrows walk, Q skill, A strike, Space dodge, F work, C jump; skills and strikes turn the hero toward the mouse pointer. Right-click to walk works in both (D148). |
| 1.9.0-11 | **PK's Meshy buildings** on the PC presets (PC 1660, High, Ultra): the barracks with its palisade, the lumber camp, the market stalls, the noble house on stilts, the river landing and the granary storehouse are PK's own Meshy models. Low keeps the built-in buildings (frame budget) (D149). |
| 1.9.0-12 | **PK's Meshy people as 3D heroes** (PC): play a villager, a spearman, a swordsman, an archer, the commander or the hunter as PK's own models; the king is the Meshy king of 879 (D149). |
| 1.9.0-13 | **🖥 Graphics** (year bar): see the frame rate (FPS), triangles and draw calls now, and switch the graphics: Low, **PC 1660** (for the GTX 1660 Super: Meshy buildings, sharper shadows), High, Ultra, Lite. The game is saved before it restarts with the new look (D149). |
| 1.9.0-14 | **More skills for the 3D hero** (PK): kings, soldiers, the hunter, the rider and the war elephant have four skills, villagers and the cart two — keys 1 2 3 (or W E R in MOBA), each with its own button and cooldown. The fourth is a great skill: the king's Power of the Devaraja strikes all round him under a golden yantra in the sky (D150). |
| 1.9.0-15 | **Yantra effects for every hero's skills** (PK, after the JX2 guide): each hero has a guardian drawn as a yantra — the seven-headed naga for the king and the swordsman, garuda for the spearman, the hongsa for the archer, the singha for the rider, three-headed Erawan for the war elephant, the tiger for the hunter — that rushes out with his charges or rises over him. Skills now throw crescents of light, rain spectral swords, spears or arrows from the sky, raise pillars of script round the hero, shake the ground with rings of force, cover him with a bell of light, shower lotus petals, wheel swords round him and leave streaks of light. Four new yantra: spires, mandala, star and sun (D151). |
| 1.9.0-16 | **Semi-realistic look on the PC presets** (PC 1660, High, Ultra; PK, D152): smooth shading, the models' own materials, no cartoon rim or ink outlines, a wider lens, soft shadows in corners (ambient occlusion), sharper edges (antialiasing) and no miniature blur. Low, Lite and the phone keep their look. |
| 1.9.0-17 | **PK's 3D models in the game** (PC presets; D153): houses are PK's Herbalist Hut, every other building PK's Meshy model with its dirt square trimmed so it sits in the land; dugouts, bamboo rafts and the trader boat (in place of the junk in 879); and PK's grass, shrubs, flowers, reeds, lotus, palms, trees, boulders, ruins' stones, fences, ducks, cranes and hens spread over the land in natural clumps — never on roads or under buildings. PK's fantasy plants are rare finds deep in the forest. |
| 1.9.0-18 | **PK's look notes** (D154): the forest is three times taller (trees 18–21 m, palms over 20 m), the Khmer house a little taller, boats sit in the water instead of floating on it, and the Meshy grass clumps that did not match the land's grass are gone. **The enemy has its era's name** on the danger card, raid warnings and the 3D danger arrow (e.g. Champa); 879, with no war on record, shows "Rival chiefdom (invented)". **All of PK's plants, trees and rocks are in**: 43 more models, and the 14 heaviest scans (reeds, wisteria, sunflowers, dead tree, emerald tree and others) lightened from up to 8 million triangles to about 6 000. |
| 1.9.0-19 | **The 3D hero moves like a person** (PK, PC presets; D155): PK's heroes now stand, walk and run with their own motion-captured movement — weight shifts at rest (a fighting stance for soldiers), a real walk that turns into a run as he speeds up, the feet keeping pace with the ground. Strikes, skills, work, jumps and dodges are still the game's own moves, blended in and out smoothly, and the sword, bow and shield stay in the model's hands. On the PC look the hero keeps the model's real material (no cartoon outline). |
| 1.9.0-20 | **The people you zoom in on are PK's 3D people** (PC look; D155): close up, the villagers and soldiers in the middle of the view are PK's Meshy people — builders, farmers, fishers, woodcutters, quarrymen, smiths, hunters, porters, spearmen, swordsmen, archers, the commander — standing, walking and running with real motion, and hammering, chopping, planting, reaping, casting the net, thrusting, cutting and drawing the bow with the same moves as the crowd around them. |
| 1.9.0-21 | **PK's notes** (D156): palms and the bigger plants now sit with the houses (palms 12–13.5 m); PK's buildings are drawn bigger and their colours blend with the land, with red earth dusted up the foot of the walls; the emerald tree is gone and a **big tropical tree made in Blender** (a spung with buttress roots and an umbrella crown, as at Ta Prohm) grows at the forest edges; **no trees stand in the water** — trees on the bank are smaller and the big ones keep back from it; in the 3D hero mode he **wades in the water** (no more walking on it) with rings round his legs and splashes when he runs, **the trees beside him no longer vanish**, and on the PC his buttons are **one bar along the bottom** with each key shown. |
| 1.9.0-22 | **ព្រះរាជបញ្ជា · Royal Orders** (PK; D157): in the 3D hero mode the king gives random daily orders — duties (gather, carry to the store, defeat raiders, hunt, heal, help build, inspect the granary, greet the merchants, report at the hall …) and questions on history and culture (answer with 1–4 or a click) — each with a reward. In the host dashboard (localhost:7421) a new **Royal Orders** page lists them and adds or removes orders; the game takes them at once. |
| 1.9.0-23 | **PK's notes** (D158): the water on the PC looks real — it mirrors the trees, banks and sky, with waves, sun glitter and soft foam; finer splashes and drops; the 3D hero **swims** in deep water (front crawl, or treading water); the bad-looking oak and lone tree are replaced by a mango tree and a rain tree made in Blender, and **the six forest trees are re-made in Blender** (real trunks and branches, leaf clusters cut out of a leaf atlas that cast leafy shadows, new picture cards for far trees; full 18–21 m height with wide crowns); the **royal court** before the hall is PK's 3D people; the hero's **weapons and gear are new detailed Blender models** (sword, Preah Khan, spear, lance, axe, goad, staff, bow, shield, quiver). |
| 1.9.0-24 | **Leafier trees** (PK's reference picture; D159): every Blender tree (the six forest trees, the mango, rain and big tropical trees) has new leaves — small serrated leaves in full round clumps, sunlit yellow-green on top, shaded underneath, the crown shading softly as one mass; the far pictures of the forest trees are new too; roots lie on the ground. |
| 1.9.0-25 | **PK's notes** (D160): **ព្រះរាជបញ្ជា** on the year bar (key N) — the news, history, chapter cards and the council vote go there instead of popping up; **progress bars over the roofs** with what waits next, instead of the blue light; people **stuck in traffic find a new way**; a **⚙ board** to switch any menu button or message box on or off; **see-through** for the new trees and models, and the canopy in front of the camera fades away (in the 3D hero mode too); the **royal hall's court is clear of trees**, and the villages have fewer; the **storehouse is its own building** (an open thatched store full of goods, made in Blender); **fish** (trey riel, snakehead, catfish) in the schools; the **3D hero bar at half size**; **PK's 3D animals** and more of his people round the hero; **the raid on the village**: raiders go for the storehouse, the soldiers form a line (shields, spears, bows) and fight one to one — swords, spears, axes, shields that block, arrows — with sparks, a small red flash, dust, the war drum, and a cheer when the raiders are beaten. |
| 1.9.0-26 | **Blender work** (D161): **Preah Ko textured** — brick courses, old lime stucco, weathering and a laterite platform, shown as the finished temple on the PC look; the **noble house** loses its tall Thai-style finials (short horns kept) and the broken ground under it; the **gibbon, langur, douc, macaque, slow loris and binturong** are 3D models now, so every wild animal has one. |
| 1.9.0-27 | **Android APK 1.9.0** (versionCode 10): the phone build of Kingdom and Anachak Khmer with everything up to 1.9.0-26, built in Android Studio's Gradle on PK's PC (`apk\KhmerKingdoms-1.9.0-debug.apk`). The PC-only 3D models stay out of the phone app (it keeps its built-in figures and buildings). |
| 1.9.0-28 | **Animals with their own coats** (D162): the banteng is chestnut, the serow charcoal, the moon bear black with its cream chest crescent and the clouded leopard greyer — before, they looked like the kouprey, the muntjac, the sun bear and the leopard. |
| 1.9.0-29 | **The phone has the PC's 3D models** (PK; D163): trees, plants, rocks, the people and animals near the view, boats, fish, PK's buildings, the finished Preah Ko and the 3D heroes with their weapons are the same models as on the PC, in the same places; the phone keeps its lighter look. The app is bigger (about 90 MB). |
| 1.9.0-30 | **Android APK 1.9.1** (versionCode 11): everything up to 1.9.0-29, built in Android Studio's Gradle on PK's PC (`apk\KhmerKingdoms-1.9.1-debug.apk`). |
| 1.9.0-31 | **The fantasy plants no longer smear** (D164): the glowcap, the crystal tree and the red mushrooms are repainted in clean colours (violet, teal, red caps on pale stems) instead of the broken streaky textures. |
| 1.9.0-32 | **Phone: taps answer the first time** (D166): a quick tap while the phone is busy is no longer taken for a press-and-hold, so you do not have to tap twice. |
| 1.9.0-33 | **Phone: a lighter forest** (D165, D166): plants and rocks are simpler on the phone and fewer are drawn far from the view; the fan palm is a lighter palm there; fewer detailed forest trees at once (the rest stay pictures); a soft shade lies under every tree. All the people and animals stay. About 40 % less for the phone to draw. |
| 1.9.0-34 | **Android APK 1.9.2** (versionCode 12): everything up to 1.9.0-33. |
| 1.9.0-35 | **Trees stay in their place** (PK; D167): the palms, rain, mango and tropical trees, big rocks and cliffs are always there (before, only the nearest one or two of each kind showed and they blinked in and out as you walked); the forest reaches out into the haze; a near tree turns into its far picture with a soft fade instead of a jump; small plants and stones fade in instead of popping up. |
| 1.9.0-36 | **Broken models gone or remade** (PK; D168): the wagon, the scale tree, the wisteria, the dead tree and a shredded plant are gone; the dense shrub, the purple bush, the reeds, the lily pads, the red lily, the wildflowers, the banyan and a broadleaf tree are new, made in Blender, whole. |
| 1.9.0-37 | **Spearman's energy beam** (PK; D169): the Lunge (ចាក់ស្ទុះ) now fires a glowing blue beam from the spear — a bright core, the beam, twisting flames round it, rings at its far end and streaking sparks — designed in Blender (the scene `energy_beam.blend`, every colour and speed on one control) and played in the game with the same five layers. |

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
| 1.8.0-15 | **A 10 cm lawn on every green meadow** (PK's Meshy "make grass for floor"): short dense grass, above the foot, fills the open green ground under the taller grass, from the high camera and round the hero; it thins only where the ground is worn to earth. Now and then a **cluster of stones in the grass** (PK's "Grass and Stones"). The low meadows near the water, bare before, have grass too. The 30 cm tussocks are a little sparser so the lawn shows between them (D138). |
| 1.8.0-16 | **PK's royal hall**: the royal hall (វាំងឈើ) is now PK's own 3D model, a carved wooden hall on stilts with tiered roofs and a brick terrace with steps at the front, in the kingdom view and in the 3D hero mode; the king's court stands before its steps (D139). |
| 1.8.0-17 | **Day and night, the sun and the seasons** (Anachak Khmer): a day is now an hour, about 30 minutes of daylight and 30 of night. The sun rises in the east, crosses over the south and sets in the west, and the shadows move with it. At sunrise and sunset the sky glows, the sun is a bright disc on the horizon and the water carries a path of its light, best seen in the 3D hero mode. The seasons change through the year (one game day a month): in the dry season (Nov–Apr) the sunrises and sunsets are gold and deep orange, in the wet season (May–Oct) rose and crimson; the days are a little longer in the wet season and the sun sets north of west in June, south of west in December. Rain and storms dull the sunset (D140). |
| 1.8.0-18 | **PK's own trees everywhere**: every tree of the forests is now one of PK's 3D models: six broadleaf forest trees (slim, round-crowned, open-crowned, old gnarled giants, tall, buttress-rooted), the forest palm and the fan palm, mixed through the forest. Up close they are PK's models in full detail (up to 6 000 triangles a tree); further off they are pictures of the same models seen from 6 sides and from above, so a whole forest keeps the look and the frame rate. Bamboo and the old built-in trees are gone from the forest. They sway in the wind (D141). |
| 1.8.0-19 | **Coconut and banana by the houses**: every house of a hamlet of three or more houses has a coconut palm (ដើមដូង) behind it and a banana plant (ដើមចេក) beside it; **along the working paths to the storehouse** (ឃ្លាំង) a palm or a coconut stands now and then by the worn earth (D141). |
| 1.8.0-20 | **The house (ផ្ទះ) as in 889 CE** (PK's brief and reference picture): two steep thatch gables side by side, their gable ends to the front, weathered grey-brown thatch with layered courses, bamboo battens laid over it, a ragged fringe at the eaves and carved horn finials curling up at the apexes and eave corners; woven bamboo walls in a hardwood frame with propped awning windows; a veranda with a railing before the door, reached by a wooden stair with handrails; square hardwood stilts standing on carved stone pedestals, not buried in the earth; under the house the farm's daily life: stacked firewood, baskets, an ox cart, clay water jars, straw, a fish trap (D142). |
| 1.8.0-21 | **Smoother and lighter** (PK's optimisation brief): **New Game and Load no longer keep the old world in memory**: before, each one left a whole map on the graphics card (about 110 shapes and 25 textures more every time, until the game slowed or froze); now the memory stays level. The grass, the ground detail and the trees are laid again only when new land is explored, not every 1.5 s while anyone walks, and only one grass field a frame: the short jolts while panning are mostly gone (the slowest 1 % of frames: about 55 → 18 ms of game work, the worst grass frame 53–71 → 24–29 ms). The sun and the night colours are worked out 20 and 10 times a second instead of every frame. **Trees get a middle step**: past the nearest trees in full detail, the next ones are a lighter copy of the same model before they turn into pictures. The built game no longer stops to check every new shader. Unused code and two unused tree models removed (D143). |

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
