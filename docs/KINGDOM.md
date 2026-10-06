# Khmer Kingdoms · នគរខ្មែរ (the RTS tab)

An **original** Khmer historical real-time strategy game inside The Temples, in the classic RTS mould (gather, build, train, research, fight, raise a monument). It copies nothing from Age of Empires or any other game: code, models, maps, UI, sounds and balance numbers are our own. Generic RTS mechanics are used; everything Khmer is data in `config/kingdom/*.json`.

## The campaign (this build, D53)

The campaign is played on one **empire world** (D60): 1080 × 1080 tiles (about 2.2 km a side, ten times the area of the old Greater Angkor map), laid out like the map of the Khmer Empire. Greater Angkor with all 13 temple sites sits in the middle as before; around it lie the Great Lake, the Mekong, the Tonle Sap river and the Mun, the Dangrek escarpment (with three passes) and the Annamite chain, the Cardamom massif, the Gulf in the south-west and rainforest belts. Twelve empire places (Phimai, Preah Vihear, Wat Phu, Koh Ker, Sambor Prei Kuk, Vat Nokor, Stung Treng, Angkor Borei, Vyadhapura, Oc Eo, Si Thep, Lavapura) are shown with a landmark and a name; the first of your people to come near one **finds** it and its gift. Every new game has its own seed: trees, stone, gold and fruit are placed afresh, and stone, gold and fruit are always within reach of the royal hall. Finishing a temple and holding it ends its era; the next temple, its era and its year unlock.

| #   | Temple        | Year | Era                                                | Opponent (label)                    |
| --- | ------------- | ---- | -------------------------------------------------- | ----------------------------------- |
| 1   | Preah Ko      | 879  | Roluos (Hariharalaya)                              | rival chiefdom (FICTIONAL)          |
| 2   | Bakong        | 881  | Roluos                                             | rival chiefdom (FICTIONAL)          |
| 3   | Lolei         | 893  | Yasodharapura                                      | rival chiefdom (FICTIONAL)          |
| 4   | Phnom Bakheng | 900  | Yasodharapura (capital moves: a second royal hall) | rival chiefdom (FICTIONAL)          |
| 5   | East Mebon    | 953  | 10th century                                       | Champa (CONFIRMED wars)             |
| 6   | Pre Rup       | 961  | 10th century                                       | Champa                              |
| 7   | Banteay Srei  | 967  | 10th century                                       | rival chiefdom                      |
| 8   | Ta Keo        | 1000 | 10th century                                       | rival claimant (SUPPORTED)          |
| 9   | Baphuon       | 1060 | 11th century                                       | rival claimant                      |
| 10  | Angkor Wat    | 1122 | Suryavarman II                                     | Đại Việt (CONFIRMED wars 1128–1138) |
| 11  | Ta Prohm      | 1186 | Jayavarman VII (after 1177)                        | Champa                              |
| 12  | Preah Khan    | 1191 | Jayavarman VII                                     | Champa                              |
| 13  | Bayon         | 1200 | Jayavarman VII                                     | Champa                              |

The exact list, years, footprints, forms, history lines and sources are in `config/kingdom/campaign.json`; opponents' labels and notes explain what is recorded and what is gameplay.

| Item         | Now                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Eras         | 6 (Roluos, Yasodharapura, 10th century, 11th century, Suryavarman II, Jayavarman VII); each adds buildings, units and techs, earlier ones stay               |
| Buildings    | royal hall, stilt house (Pteas Kantaang), noble house (Pteas Rongdeung, from the Suryavarman II era), storehouse, rice field, war camp, temple               |
| Technologies | v0.1's six plus Yasodharatataka, laterite works, West Baray, gallery reliefs, rest houses (+10 % speed), hospitals (people heal)                             |
| Opponents    | each chapter's historical opponent sets up camp on its side of the map; raids aim at the temple site; Cham soldiers wear the lotus headdress                 |
| Victory      | all 13 temples built. Defeat: every royal hall falls. Destroying a camp only stops that chapter's raids                                                      |
| History      | the History button (or Y) opens the timeline; a built temple can be visited any time: the camera flies there and its story is shown                          |
| Messages     | translucent message boxes (council, messages, help, chapter cards, History), text ≥ 26 px                                                                    |
| LIVE, saves  | as v0.1 (likes and gifts become resources; council vote; autosave, quick, manual, backups). Saves are v3 (seed + changed nodes); older saves can't be loaded |

### The living world (D61–D64)

- **Wild animals** (`world.json` `animals`): deer, wild boar, banteng, red junglefowl and green peafowl in herds in their habitat (rainforest or grassland), and tigers. Right-click an animal with villagers to **hunt** it: they throw spears from a few metres, the animal flees (a boar or a tiger fights back), and a kill leaves meat to carry home as food. Tigers stalk villagers who come near. Herds come back after a while.
- **Cambodia's forest wildlife** (PK's list, D75): 26 kinds, ~400 animals. Large mammals and forest cattle (Asian elephant, gaur, banteng, kouprey — very rare, serow on the hills), predators (Indochinese tiger — rare, leopard, clouded leopard, sun bear, moon bear, dhole packs, binturong), primates (gibbons — pileated and yellow-cheeked, silvered langur, red-shanked douc in the east, slow lorises — pygmy and Bengal, macaques — long-tailed and pig-tailed), birds (giant ibis, great hornbill, green peafowl, red junglefowl) and reptiles (Siamese crocodile, king cobra, reticulated python). Each kind's config sets its habitat (`forest`, `grass`, `water` shores, `hill`, `canopy` — drawn up in the trees while resting), an optional region (west/Cardamoms, east/plains), and a behaviour: **shy** animals run from people, **defensive** ones (boar, wild cattle, elephants, bears, python) strike back at their hunter, **predators** (tiger, leopards, dholes, crocodile, king cobra; red hover ring) attack people within their range, **calm** ones run only when hit. **Protected** kinds (elephant, kouprey, primates, giant ibis, hornbill) are never hunted: right-click just walks there, and the hover tip says so. Night animals are marked in the tip. Khmer names PK should check are listed in each kind's `notes`.
- **Fishing**: fish traps on the shores of the lake, rivers and sea. Villagers fish like any other food; fishing grounds are never used up, they grow back.
- **Auto-work** (ON by default, menu bar): a villager idle for 5 s finds work itself: an unfinished building close by, an empty rice field, then the resource the kingdom has least of. **Guard**: idle soldiers go out to meet raiders near your buildings. **Raids wait** until the kingdom has a war camp (ជំរំទាហាន) — the opponent's state says WAITING until then.
- **Weather** changes every 30 minutes (`rules.json` `weather`): clear, cloudy, rain (+25 % rice), storm (slower walking and gathering, lightning), mist. Rain falls around the camera, the light and haze follow.
- **Bokator fighting** (PK's Bokator files): arms bend at the elbow. Spearmen thrust, the new **swordsman** (ពលដាវ, war camp) fights in the Bokator way — a dao cut, then an elbow and knee strike — and holds a guard stance; archers draw; farmers plant bent over the field with splashes.

### The screen (D65, D66)

- **Menu bar** (top right): Idle (select the next idle villager; the count), Workers (every idle villager walks to where you look and finds work there), Army (select every soldier), Call (the army marches to where you look, fighting on the way), Auto-work ON/OFF, History, New game, and the weather.
- **3D buttons**: every build, train and research button shows its own low-poly model, which pops up above the label and turns when the mouse is over it.
- **Hover hints**: every button says what it is, what it costs and what it still needs (a missing building, missing resources, a later era). Every object in the world (trees, rocks, fruit, fish, meat, animals, buildings, units, empire places) shows a ring under it and a hint: what it is, how much is left, and what right-click will do.
- **Several spots**: Shift + right-click adds a waypoint; the unit walks them in turn (scouting).

### Houses (PK's five reference images, D70)

- **Pteas Rong** (ផ្ទះរោង, the house): one steep two-sided gable roof with horn finials and a sun-ray gable board, dark plank walls, nine round posts on stone footings, a stair on the long side; faces east; a spirit house at the corner. PK's reference says the Rong type goes back to the Funan period, the oldest of the five, so it is the house of every chapter.
- **Pteas Keung** (ផ្ទះកឹង, the officials' house, from the Suryavarman II era): the tallest type, a steep high gable over a lower hipped roof all round, a front porch under its own gable, a grand stair.
- Rong Doeung, Rong Dol and Pit are later derived types (Pit: 17th–20th century); they wait for a post-Angkor era. No Angkorian wooden house survives; all are reconstructions from the later tradition (see HISTORICAL_UNCERTAINTIES).
- **Village animals**: chickens and a pig round each house and the hall, a cow grazing at each rice field (decoration).

### The army (D69)

| Unit                       | Where      | Era               | What it does                                                                                      | Label                                                             |
| -------------------------- | ---------- | ----------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Horseman ទ័ពសេះ            | war camp   | Angkor Wat era on | fast lance cavalry, strong against archers                                                        | SUPPORTED (Angkor Wat, Bayon reliefs: bareback, no stirrups)      |
| Buffalo rider ទ័ពក្របី     | war camp   | all               | slow, tough, strong against spearmen                                                              | GAMEPLAY_ABSTRACTION (PK's request; buffalo were draught animals) |
| Supply ox-cart រទេះគោស្បៀង | storehouse | all               | soldiers near it heal; it never fights                                                            | SUPPORTED (Bayon reliefs)                                         |
| Commander មេទ័ព            | war camp   | all               | one at a time; soldiers near him hit harder and take less; parasols over him mark his rank        | SUPPORTED; names by era                                           |
| Watchman and dog អ្នកយាម   | royal hall | all               | walks to unexplored land by himself and reports stone, gold and fruit (toast, bark, minimap ping) | GAMEPLAY_ABSTRACTION                                              |

Commanders' names (rules.json `commanders`): title only in the Roluos to 10th-century chapters (no general of those kings is known by name); **Saṅgrāma** in the 11th century (Baphuon stele); **Śrī Vīrendrādhipativarman**, Dhanañjaya and Śrī Jayasiṃhavarman in the Angkor Wat era (labels of the historic procession); Prince **Śrīndrakumāra** and his anak sañjak Arjuna, Śrī Dharadevapura, Śrī Deva and Śrī Vardhana under Jayavarman VII (Banteay Chhmar K.227).

### People by era and job (PK's character prompt set, D71)

- `config/kingdom/characters.json` holds 45 occupations (farmer to ruler) with era, status, clothing, hair, jewellery, tools, workstation, work animation, resource, evidence and sources; `validateCharacters()` checks them (known sources, uncertainty explained, a tool for every job, real units, no child soldiers) and flags abstractions as HISTORICAL WARNINGs.
- Villagers change their tool with their job: builder (mallet, rope), farmer (hoe, basket), fisher (cast net, creel), woodcutter (axe-adze), quarryman (hammer, chisel), gold worker (pan), hunter (spear), forager (back basket), porter (carrying pole when walking loaded). Labourers wear no gold.
- Soldiers change their dress with the era: early and 11th century (little evidence: plain sampot, rattan shields, marked uncertain); Angkor Wat era (cuirass, helmets crested with deer, bird or horse heads, shields with a monster face); Jayavarman VII (bare-headed, scale cuirass, javelins, round monster shields). The commander follows PK's reference statues (scale cuirass, crossed quivers, dao, round shield) with his parasol.

### Screen, map, sound (D67, D68)

- The camera looks diagonally across the land (an AoE II-like view); arrows and screen edges pan along the screen.
- Top bar: era shield, each resource with the number of villagers working on it (⚒), people, clock; objective and temple progress below.
- Command bar at half height, with a ▼ button to fold it to one line.
- Minimap: a diamond at the bottom left, turned like the view. Clicking it (or M, or the Map button) opens the **old map of the empire** on parchment: drag to move, wheel to zoom, click to go there, right-click to send the selection; unexplored land stays blank.
- Weather is shown in the world, not the menu: rain streaks and ground splashes, blowing leaves when windy (a new weather), lightning in storms; rain, wind and birds are heard.
- Sound effects (synthesised, no files): chopping, chiselling, hammering, splashes, clashes, arrows, a gong when a building is finished, a horn for raids, a chime for discoveries, a dog's bark for a watchman's find. Particles: wood chips, stone dust, gold glints, water splashes, hit sparks, smoke. The Sound button turns it off.

### Sound: background music (D76)

- **Generated music, our own** (`view/music.ts`, rules in `config/kingdom/music.json`): composed live in WebAudio in the manner of the Khmer **pinpeat** and **mahori** ensembles. No recording is copied or sampled (the YouTube video PK linked was a reference for the style only and is not used).
- Instruments (synthesised): roneat ek (bright xylophone, the melody an octave up, elaborated, tremolo rolls), roneat thung (low xylophone, off the beat), kong vong (circle of gongs, bell partials, the melody on strong beats), sralai (quadruple-reed oboe: sawtooth through two formant peaks, slides, grace notes, vibrato), sampho and skor thom (hand drum and big drums), chhing (small cymbals, open _chhing_ and closed _chhap_ in turn, the timekeeper).
- Music: anhemitonic pentatonic C D E G A, with occasional modal shifts (C D F G A, C E♭ F G B♭). A seeded generator writes a core melody of 8, 12 or 16 beats; each instrument plays its own variant of it (heterophony); every phrase cadences on the tonic. A piece is a few variations of one core melody accelerating from slow to fast; then a new piece starts slow. It never repeats exactly.
- Moods: **calm** (village day: mahori-like, softer, slower, no big drums) and **tense** (pinpeat: faster, chhing twice a beat, drums). Tense from 30 s before a raid (when raids can come) until no raider is within 40 m of the player's buildings, calm again 8 s later; the two crossfade.
- Level: 0.25 of the master, through the same master and limiter as the effects. Starts only after the first click or key (browser autoplay rules), follows the Sound switch, stops when the Kingdom tab is left. Phone build: quieter by default (0.5 instead of 0.8).
- Menu bar: **តន្ត្រី · Music ON/OFF** and **🔉 volume** (steps 20–100 %).
- **PK's own music:** put audio files he owns or may use (mp3, ogg, m4a) in `apps/game/public/music/` and list them in `music.json` → `tracks` (`file`, `km`, `en`). They then play shuffled in a loop instead of the generated music; a missing file is skipped with a console warning, and if none plays the generated music comes back. They are served at `./music/` by a small Vite plugin (`apps/game/tools/musicFiles.ts`), because the public folder is `public-mobile` (phone icons); the phone build copies them only with `"tracksOnMobile": true`. See `apps/game/public/music/README.md`.

### PK's upgrade from the feature map (D77–D79, 2026-10-01)

- **Year bar and calendar** (D77): under the menu bar, 800–1220 CE with the 13 temples (diamonds: gold built, blue this chapter) and 28 world events (dots; Khmer ones red). The year runs on, one year per 120 game seconds (`rules.json` `calendar`), from the chapter's year to the year before the next temple; world events are announced as the year reaches them, and each chapter card lists what happened elsewhere in the world. Events: `config/kingdom/worldEvents.json` (Khmer text drafted by Claude, PK to review).
- **Game speed** 1×, 2×, 3×, 5× (`rules.json` `speed`): the ⏩ button on the year bar, or + and −.
- **🔍 Find** (menu bar, or F): the watchman, or an idle villager, goes to the nearest unreported source of the resource you have least of.
- **Command bar** hides when nothing is selected and pops up on selection; nothing can be built over fields, bushes or carcasses; windy leaves fall from the tree crowns.
- **Lumber camp** ឃ្លាំងឈើ (D77): wood drop-off that keeps the timber (shown in its card); ox-carts haul it to a storehouse or hall, 60 at a time (`rules.json` `haul`). It comes with one ox-cart. Ox-carts on the Bayon reliefs; the yard itself is a game abstraction.
- **The alarm** (D77): villagers and carts within 6 tiles of a raider or a dangerous animal (a predator, or a boar or banteng that was hit) drop their work and run to the nearest house or hall away from it; after 6 safe seconds they take their job up again. Idle soldiers within 40 tiles go for the danger (raiders: attack; animals: hunt). A hunter never runs from the animal he is hunting. Toast, war horn (raiders) or warning call (beasts), minimap ping (`rules.json` `alarm`).
- **Royal court** (D78): in front of every royal hall the king (crown of his era, pointing out his orders), two queens, two royal Brahmins (purohita, white cloth, coiled hair, conch) and two gold parasol bearers. The hall's tooltip names the king of the chapter. Crowns: conical mukuta (early, Baphuon), tiered (Angkor Wat), none (Jayavarman VII, bun). Sources: Zhou Daguan's account (1296), the reliefs.
- **Roofs by rank** (D78, PK's research report and Zhou Daguan): commoners' houses thatch (commoners were not allowed tiles), officials' houses yellow clay tiles, the palace's main roof lead tiles over a lower roof of yellow tiles. The house styles of Funan/Chenla and of after Angkor (Pteas Khmer, Kantang, Rongdol, Rongdoeung, Pit; shophouses; New Khmer Architecture; borey) belong to eras outside this campaign (879–1200) and wait for those eras.
- **Anno-style graphics** (D79, `view/gfx.ts`, `view/water.ts`, `view/flora.ts`; per preset in `config/quality.json` `kingdom`): soft contact shadows (ambient occlusion), glow, the miniature blur that grows as you zoom in, a warm golden-hour grade; living water (colour by depth, ripples, sun glints, foam at the shore, Mekong silt); five tree kinds (common, banyan, bamboo, sugar palm, mango) that sway with the weather; by every house a kitchen garden with clay jars, firewood and a fence; sugar palms on the corners of the paddy dikes; egrets circling the fields; cooking smoke. A new **Ultra** preset (`?preset=ultra`) for a strong PC; Low keeps half-size ambient occlusion for the stream laptop; phones keep only the water and tree kinds.
- **Not yet built from the list**: laterite roads and causeways between buildings, lotus on moats, the Royal Ploughing Ceremony and ploughing buffalo, hand-made art models (see _Kingdom Graphics Upgrade · Anno 1800 Style_).

### Hay Day-style features and an active king (D80, D81, 2026-10-02)

- **Order board** (D81, `sim/market.ts`, `rules.json` `orders`): the 📜 Orders button on the year bar (or O) opens three buyers (the market women, Chinese merchants, the ashrama, the temple works, a nearby village). Each wants one to three goods and pays gold; Deliver when the store has enough. A filled order gets a new buyer 40 s later; 🗑 throws one away (new buyer after 120 s). Amounts grow 15 % per temple. The button glows when an order can be filled. Zhou Daguan describes Chinese merchants at Angkor and women keeping the market; the buyers and amounts are gameplay.
- **Chinese junk** (D81): every 8 minutes a junk comes up the river with a three-good order and a 60 % bonus, and sails 4 minutes later if it is not filled.
- **Baskets** (D81, `rules.json` `livestock.produce`): the chickens and pigs at houses and the hall fill an egg basket every 90 s; it bobs over the house, click it for 12 food. Nobody may click on a live stream, so it is taken in by itself 45 s later.
- **An active king** (D80, `rules.json` `court`): he looks over the city and gestures his orders; when you send people or place a building he turns and points that way; when a building is finished or people join he blesses the city (both arms raised, the Brahmins with him, gold sparkles), at most every 20 s, with a toast every 10 people.
- **Fewer birds** (D80): one egret over every third field near the view, at most 4 on Low (`quality.json` `kingdom.birds`).
- Analysis of all Hay Day features and what comes next: _Hay Day features for Kingdom នគរ_ (Claude doc).

### The rice year, light alerts, hunters, rafts, the circle menu (D82–D86, 2026-10-02)

- **The rice year** (D82, `sim/rice.ts`, `rules.json` `rice`): each field is drawn plant by plant. While a farmer works it, the field goes through five stages: ព្រោះស្រូវ sowing (the farmer throws seed onto a seedling bed in one corner), ដាក់ទឹកស្រែ ដោយរហាត់ទឹក watering (he treads a rahat water wheel on the west bund), ស្ទូងស្រូវ transplanting into rows, the rice growing tall, and ច្រូតស្រូវ reaping (golden rice cut row by row to stubble). A full year takes 150 s of work; the harvest brings 20 food on top of what is gathered.
- **Light alerts** (D83, `view/alerts.ts`, `rules.json` `alerts`): a soft blue light over work in progress (building, training, research), a gold flash when a building or a person is ready, an amber light over a lumber camp holding 180 timber or more (waiting for a cart). On the resource bar a resource below 50 pulses red, and what a build, training, research or order still needs flashes red.
- **Hunter-scouts and dogs** (D84): the watchman is now ព្រាន និងឆ្កែ, the hunter-scout and his dog. When he sees stone, gold, gems or fruit he walks back to tell the king (the king then points the way); he hunts the game he meets (the kill is meat, food). **Gems** (ត្បូង: sapphires and rubies) lie in the Pailin gem fields west of the Cardamoms and scattered on the plains; they pay in gold, twice as fast as a gold rock. Pailin mining is recorded from the 19th century, so the gem fields are gameplay; Cambodia has no diamond mines, so there are no diamonds. The rahat is a traditional Khmer water wheel not shown on Angkor-period reliefs (plausible, not confirmed).
- **Rafts** (D85, `rules.json` `rafts`): people cross rivers, moats and the lake on bamboo rafts (ក្បូនឬស្សី) instead of walking round; a raft is slower than walking, so paths still prefer fords and land. Elephants wade.
- **Real loads** (D86): no more coloured box over workers' heads. On the walk home a worker carries a rattan basket of rice sheaves on a head pad (food), a bundle of logs on the shoulder (wood), a sandstone block (stone) or a small lidded basket (gold and gems), as people carry in the Bayon's daily-life reliefs; while working nothing is shown.
- **Circle menu** (D86): click a building or select villagers and a see-through ring of round buttons (the same actions as the command bar) opens round it, as in Hay Day.

### The king's orders, royal ceremonies, hunters' hides, hidden places, the river landing (D87–D91, 2026-10-02)

- **The king** (D87): point at the king before his hall to see his name (and his royal power, any ceremony, the decree); click him for his orders: **រាជបញ្ជា · Decree: build the temple** sets everyone to work for the temple — they gather what it still lacks (in proportion, as far as needed), the storehouse it needs is laid out and built first, then the foundation is laid on the temple's site and up to 14 build it — until it stands (farmers stay on their fields; `rules.json` `decree`). Also _Seek scarce_ and _Call workers_.
- **Royal ceremonies** (D88, `rules.json` `ceremonies`): every 6 minutes the king holds one by himself, the next allowed in the era: the devaraja rite (Jayavarman II, 802, Sdok Kok Thom inscription; early eras), royal consecration (abhiseka), consecrating the temple's image, and the festivals Zhou Daguan saw in 1296–97 (New Year with lanterns and fireworks before the palace, offering the new rice, counting the people; bathing the Buddha images only under Jayavarman VII). Each adds royal power (👑 on the objective line) and, for 90 s, people gather 10 % and build 15 % faster; fireworks, holy water or gold light at the hall.
- **Hunters' hides** (D89): the hunter-scout keeps the hide of every kill (a quarter of its meat, in gold) and sells them at a store when he has 60, or to the hall when he reports. **Hidden places** — Kbal Spean, Mahendraparvata on Phnom Kulen, Beng Mealea, Banteay Chhmar — are not marked until found; the hunter heads for one within reach. They stay in their forest (the world of older saves is unchanged).
- **River landing and the junk** (D90): build a កំពង់ផែ river landing at the water's edge; the Chinese junk ties up there (it passes by without one). The junk is drawn after Song–Yuan sea-going junks: flat broad hull, high square stern, stern rudder, deck house, two masts with brown battened matting sails.
- **Close and credits** (D91): every card and the help pop-up have ✕; the developer's name **លោក ប៉ង់ សុភ័ក្ត្រ** is shown in the Bokor font in About, on the chapter card and on the phone's start screen.

### Anachak Khmer អាណាចក្រខ្មែរ: the levy, the king's book, the royal roads, the 3D hero mode (D92–D108, 2026-10-02)

A second Kingdom tab (host panel: **Anachak Khmer · អាណាចក្រខ្មែរ**; phone: the second start button). It is the whole Kingdom game in its own save (`anachak.` slots) and its own world, with these on (`config/kingdom/anachak.json`):

- **The levy** (D92): click the king → **កេណ្ឌទ័ព · Call to arms** → pick a soldier kind (× 1 / 5 / 10). Villagers take up arms where they stand, each at the full price of that soldier (the same as training one), idle first, then gatherers and builders; farmers stay in the fields. They bring home what they carried and gather south of the hall. Era and training rules still apply (elephants need elephant training, horsemen the Angkor Wat era, one commander). Khmer armies were raised from the people (Coedès, Jacques; Zhou Daguan).
- **To battle** (D92): **ចេញច្បាំង** sends every soldier, fighting on the way, against the nearest enemy you know of (raiders first, then a rival camp you have seen); with none in sight they gather at the hall.
- **The king's book** (D93): **សៀវភៅរាជ្យ · Overview** — resources; villagers by work (rice, each resource, building, hunting, scouts, idle); houses and room; soldiers by kind and how many were called up; stores; what is going up; what is being trained or learnt; the temple's progress and what it lacks; royal power; roads found and the next caravan. It refreshes while open.
- **Royal roads** (D94, Hendrickson 2010): raised laterite causeways from the capital to Phimai, west to Sdok Kok Thom, east past Beng Mealea to Preah Khan of Kompong Svay, north-east by Koh Ker to Wat Phu, and south-east toward Champa over **Spean Praptos** at Kampong Kdei. People walk 35 % faster on them and paths prefer them; corbelled laterite bridges with naga rails carry them over water; from Jayavarman VII's era his **rest houses with fire** (121 in the Preah Khan stele, 1191) stand beside them and heal travellers. When the place at a road's end is found, a caravan brings goods to the hall every 150 s. Sdok Kok Thom and Preah Khan of Kompong Svay are new places to find. The old map inks the roads. Lines are not to scale; the road beyond Kampong Thom toward Champa is uncertain.
- **3D hero mode** (D95–D96): every character has **🎮 លេង ៣D · Play in 3D** (its panel and circle menu; the king's menu for the king). The camera goes behind that character in the live kingdom, drawn anime-style (cel shading in flat bands, ink outlines, a painted sky, distance haze). The game goes on round the hero; Esc or ✕ comes back.
  - Keys: WASD move (relative to the camera) · Shift run (stamina) · Space jump · Q dash (no hits while dashing) · click or J strike (a three-blow combo, the third strongest) · R or K skill · E work · right-drag turn the camera · wheel zoom · arrows turn it too. Phone: stick bottom left, buttons bottom right, drag to turn.
  - Each kit has its weapon and skill: villager axe and **Mighty chop**; spearman spear and round shield, **Spear sweep**; swordsman **Bokator-style elbow and knee**; archer bow, **Rain of arrows**; horse and buffalo riders lance, **Charge**; war elephant goad, **Elephant stomp**; commander **War cry** (heals); hunter bow and his dog, **Set the dog on** (with nothing to chase the dog picks up the scent of the nearest place not yet found); ox-cart driver **Share supplies**; the king the sacred sword **Preah Khan** and **King's blessing** (heals everyone near).
  - Work with E: chop, break stone, dig gold and gems, pick fruit, take meat, tend the rice, raise a building, and put the load in a store. Kills of wild beasts become meat as in a hunt (the hunter keeps the hide). Raiders and beasts hit back; a hero who falls returns to the kingdom.
  - **The king's tasks** (more ideas): a small task for the kit at a time (gather, store loads, defeat raiders, hunt, heal, help build) pays gold, food or stone and grows each round.
  - The hero sees 70 m round him (he explores); no fog veil while played; the trees load all round. The camera never sinks into a building.
- **Anime graphics** (D97–D99, PK's reference art): the whole Anachak tab, not only the hero mode, is drawn through the anime cel pass (flat light bands, cool shadows and warm light, coloured ink); a painted sky with cel clouds, green mountains fading into blue haze, drifting motes of light.
  - **People** (D98): adult proportions (longer legs, smaller head), a patterned silk sampot, and for the king engraved gold chest armour, shoulder guards, bracers, armlets and anklets, and the tall **Mokot** crown from the Angkor Wat era on (a low tiered crown before). A character sheet renders any kit on white: `/heroSheet.html?kit=king` (`docs/screens/k-hero-sheet.png`).
  - **The royal hall** (D99): a carved wooden hall on dark posts above a brick terrace with balustrades and a broad stair, three stacked gabled roofs of dark tile with gold sun panels and curling chovea finials (`docs/screens/k-anachak-hall.png`).
  - **The forest** (D99): great banyans with twisted stems, buttress roots and curtains of aerial roots, and lush broadleaf trees; round the hero, tufts of grass, bare earth under the trees and leaves drifting down (`docs/screens/k-anachak-forest.png`).
- **Danger calls** (D100, PK): when danger comes (raiders, a tiger, any fierce beast), the camera flies to the person in most danger and a card asks: **🎮 Play in 3D** (take them over), **🎥 Watch in 3D** (the camera follows them while the AI lives their life; E, a move key or 🎮 takes control) or **▶ Let life go on**. The choice waits 14 s, then life goes on; at most one call every 40 s; none while you are playing. **🔕 Don't ask again** turns calls off (the alarm still sounds); the king's orders have **🔔 Danger calls** to turn them back on.
- **The tiger** (D101, PK): in the 3D hero mode, in or by the forest, now and then a tiger comes out of the trees 16–26 m away and stalks the hero (it bites a played unit by the sim's own rules, and the king too). Beat it for meat and the king's task. Every melee blow draws a **sword-slash** crescent through the swing (gold for the king's sacred sword); skills draw bigger ones.
- **Night** (D102, PK): a day is 8 minutes. At dusk the light falls, the haze turns deep blue, the 3D sky fills with stars and a moon and the motes become fireflies; Jayavarman VII's **rest houses light their fires**, a flame, a glow and a pool of light on the road. Dawn brings the day back.
- **Every character's sheet** (D103, PK): `/heroSheet.html?all=1` lines up all eleven characters (`docs/screens/sheet-all.png`); `/heroSheet.html?kit=<unit>` gives each one's sheet (back, front, before the Angkor Wat era, face, arm; `docs/screens/sheet-<unit>.png`), for the costume reviewers.
- **Dress by rank** (D104, costume review): only the king wears densely flowered silk, the commander sparse flowers, everyone else plain cotton (Zhou Daguan); commoners wear no gold, soldiers armlets; from the Angkor Wat era soldiers wear the reliefs' beast-crested helmet; horses are ridden bareback. The tiger of the 3D mode is its own anime model (`/heroSheet.html?tiger=1`, `docs/screens/sheet-tiger.png`).
- **The market** (D105, PK): villagers can build a **ផ្សារ · Market** (wood and food; needs a storehouse): mats, baskets and thatched shades on open ground, as Zhou Daguan saw the market women trade. Select it to exchange goods: **Give** (press to change the good), the **lot** (20 / 50 / 100 / 200), and one button per good you can get at today's rate, less 10 % stall rent to the officials. What you sell gets cheaper and what you buy dearer (▼ ▲ on the buttons); prices drift back over time and are kept in the save.
- **Yantra light** (D106, PK): every skill opens a shining **yantra** (យ័ន្ត) — a halo behind the hero, and over the area it touches a canopy — gold for the king and for blessings, moonlight blue for the others. Three original designs in the yantra manner: the eight-petal **lotus** (blessings, war cry), the **spiral** of letters with rays (sweeps, charges, the mighty chop) and the corner **grids** (rain of arrows, the dog). The letters are the Khmer consonants in order, not an incantation; out of respect the yantra is never put under anyone's feet. `/heroSheet.html?yantra=1` shows them (`docs/screens/sheet-yantra.png`).
- **90s anime look** (D107, PK's character reference): two-tone cel shading, crisper and thicker ink lines and richer colour for every figure, animal and object; soldiers and commoners in **sampot chang kben** to the knee in the reference's colours (villager red, spearman green, swordsman blue, archer brown, riders red, hunter green, cart driver tan), round metal helmets for the soldiers (Angkor Wat era on), a red saddle cloth on the horse; the character sheets carry a colour model.
- **Human figures** (D109, PK): the 3D heroes are built like people now — a sculpted torso with chest and shoulders, shaped arms and legs, hands with fingers, feet, a jaw and chin, and a painted anime face (`docs/screens/sheet-<unit>.png`, `sheet-all.png`). The king follows PK's reference sheet (D110): gold cuirass, medallion belt, long gold apron, purple silk sampot to mid-calf, tall Mokot.
- **Real 3D models** (D111, PK): put a rigged `king.glb` (made from the concept sheet with an image-to-3D tool such as Meshy, rigged for a humanoid) in `apps/game/public-mobile/models/` and the king's 3D mode and sheet use it, animated by the game. Other kits can follow by adding them to `anachak.json` `hero.models`.
- **The king's real model** (D112): made free on TRELLIS.2 from PK's concept sheet, shrunk and auto-rigged in the build. For another character: generate on TRELLIS.2 (logged in to Hugging Face), then `node scripts/models/shrink.mjs raw.glb small.glb 24000`, write its landmarks (copy `scripts/models/king-landmarks.mjs`), `node scripts/models/autorig.mjs small.glb <kit>.glb ./<kit>-landmarks.mjs`, put it in `apps/game/public-mobile/models/` and name it in `anachak.json` `hero.models`.
- **Fish** (D108, PK): silver fish swim round every fishing spot near the view, their backs at the surface, now and then one leaps out (`docs/screens/k-fish.png`).
- **Clearer, quieter** (D108, PK): land you have explored is no longer greyed when you zoom out (only land nobody has seen stays dark), and the haze starts beyond what the camera looks at; sound effects, rain and wind are softer.
- **Review agents** (D97): four AI reviewers in `.claude/agents/` check the work and only report: **khmer-culture-reviewer** (dress, crowns, titles, buildings against the record), **gesture-reviewer** (each character's moves and timing), **environment-reviewer** (light, sky, haze, terrain, trees) and **game-ui-reviewer** (functions, controls, HUD rules). They look at screenshots made with `node scripts/shot.mjs URL steps.json`. Ask Claude Code to "run the four reviewers on Anachak".

### Version 1.6.0: move buildings, PK's 3D props, the stylised cel look (D113–D118, 2026-10-05)

- **Move a building**: select it, press ✥ Move, click the new spot (red ghost = cannot go there; right-click cancels). The historical temples stay on their sites.
- **Edge scroll** follows the mouse to the edge of the window, also over panels and the bars beside the view.
- **Circle menu**: no hint box on hover; a greyed button still says what it lacks.
- **Tiger alarm**: Play in 3D and Watch in 3D work again.
- **PK's 3D models**: Meshy trees, palms, sugar palms, rocks and banana plants (`config/kingdom/props.json`, rebuilt with `node scripts/models/props.mjs "<raw folder>"`); the king is the Golden Temple Guardian.
- **Stylised cel-shaded look**: smooth mid-poly shapes, light bands, coloured ink, warm haze, wind in the grass, stepped slash dissolve (low/high/ultra; lite and the phone keep the faster low-poly look).
- Every change is listed in `CHANGELOG.md` at the top of the game folder.

### Version 1.7.0: the Angkor Cel-Diorama look, the ground follows life, boats, nets and axes (D119–D124, 2026-10-06)

- **Look**: stylised PBR land with long afternoon shadows; people and animals as flat illustrated figures with ink outlines (docs/VISUAL_BIBLE.md).
- **Ground**: bare earth round buildings and along the paths people actually walk; grass grows back where nobody goes.
- **HD-2D camera**: long lens, tilt-shift, warm light and cool shade.
- **Water**: Prek canals with jade-to-teal depth, sky colour by time of day, glints, foam, lotus and reeds.
- **Work**: rowers paddle dugout boats, fishers throw cast nets, woodcutters fell their trees (stumps remain).
- **People**: up to 150 (100 on the phone); a house shelters 10.

## Android (D72)

The Kingdom also runs as an offline Android game: see `docs/ANDROID.md` (build steps in Khmer and English, touch controls). About (menu bar) shows the credits: developer **Mr. Sopheak Pang**.

On iPhone it is an offline web app added to the Home Screen from Safari (D73): see `docs/IPHONE.md`.

## Controls

- Left click: select. Drag: box-select your units. Shift: add to the selection.
- Right click: the obvious command (walk, cut a tree, mine, fish, hunt an animal, farm a field, build a foundation, attack). Shift + right-click: one more spot to walk to.
- Command panel buttons: build (villagers), train and research (buildings), cancel.
- Arrows / WASD or the cursor at the screen edge: move the camera. Wheel: zoom. Minimap: click to look, right-click to send the selection.
- Menu bar: Idle, Find, Workers, Army, Call, Auto-work, Map, History, New game, About, Sound, Music, music volume. M: the old map. ▼: fold the command bar. Year bar: ⏩ speed, 📜 Orders. Click a bobbing 🥚 basket over a house to take the food.
- H: royal hall. Y: History. F: Find. O: Orders. Click the king for his orders. + / −: game speed. Space: centre on the selection. Esc: cancel. Delete: cancel a foundation. F5 / F9: quick save / load.
- Anachak Khmer, 3D hero mode: WASD, Shift, Space, Q, click / J, R / K, E, right-drag, wheel; Esc to come back.

## History first

Every building, unit, technology and era carries a confidence label and sources (see `docs/HISTORICAL_SOURCES.md` and `docs/HISTORICAL_UNCERTAINTIES.md`). The labels are shown in the command panel. `validateKingdom()` (packages/shared/src/kingdom.ts) refuses unknown sources, unexplained uncertainty and anything outside the scenario's era; it runs in the unit tests.

## Planned eras (not built yet; they will not be faked)

Pre-Angkor / Chenla before Roluos, and Late Angkor → Post-Angkor after the Bayon (with the later house types). Each new era needs its own buildings, clothing, units and monuments, and must pass historical, gameplay, visual, performance and AI checks before the next one starts.
