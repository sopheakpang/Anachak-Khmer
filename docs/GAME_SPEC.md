# The Temples · សាងប្រាសាទ

Sep 28, 2026 · @PK

A 9:16 TikTok LIVE game where the whole room rebuilds the Khmer temples in historical order, starting with Preah Ko (879). Approve this spec, then run prompts 00 to 20 in Claude Code one at a time and say **check NN** after each.

## Decisions

PK chose rounds 1–2 directly. For rounds 3–8 he said "let's start build", so the recommended defaults below are taken. Any row marked **default** can be changed before prompt 02 at no cost.

| # | Decision | Source |
| --- | --- | --- |
| D1 | Name: **The Temples · សាងប្រាសាទ** | PK |
| D2 | Whole room builds one temple together; no teams against each other | PK |
| D3 | Goal-based rounds: one temple per round, target 10–20 minutes | PK |
| D4 | Finish moment: sunrise + Apsara festival + top builders carved on a plaque + next temple unlocks | PK |
| D5 | Host on face cam + voice the whole stream | PK |
| D6 | Campaign map of the Angkor region; temples built in real historical order, starting at Preah Ko (879) | PK |
| D7 | Every gift becomes stone; bigger gift = bigger stone and more stone units | PK |
| D8 | 60-second camera cycle: sky map → Kulen quarry → river rafts → elephant and human hauling → construction site; gifts cut to the construction site and show the giver's name on the stone | PK |
| D9 | Follow = named foundation block; share = a worker team; comments = guild join and `!mystone` | PK (1A) |
| D10 | World is saved across streams; names on stones stay forever | PK (3A) |
| D11 | Stone size decides transport: workers → ox-cart → elephant → river raft | PK (4A) |
| D12 | Add all extra features 5–20 except LIVE Match (moved to Later) | PK ("add more") |
| D13 | Art: painted-realistic, warm golden light, simplified 3D + painterly filter | **default** (6A) |
| D14 | Sky map: illustrated map look tilted into 3D | **default** (7A) |
| D15 | Camera loop seconds: map 15, quarry 10, river 15, hauling 10, construction 10 | **default** (8) |
| D16 | Screen 1080×1920 at 30 FPS locked (60 FPS optional on strong PC) | **default** |
| D17 | Khmer primary, English secondary on screen, no Thai; fonts embedded | **default** |
| D18 | Engine: **Three.js + TypeScript + Vite** (reasons in Tech architecture) | **default** (agent choice) |
| D19 | Stream PC: Vivobook laptop (i5-1135G7, 8 GB RAM) with the GTX 1660 Super eGPU; the Low preset is the stream target | **PK** |
| D20 | Capture: the game runs in its own app window and TikTok LIVE Studio captures it directly (no OBS); LIVE Studio Link source is the backup | **PK, tested in prompt 02** |
| D21 | Event source: `tiktok-live-connector` (Node), with TikFinity as a backup adapter | **default** |
| D22 | One game now, but the core (bridge, gift map, overlay) is reusable for future games | **default** |
| D23 | All art in the game is made new; the museum paintings and map are mood references only | agent (copyright) |
| D24 | Gifts place stones within \~3 seconds; convoys on the map are ambient and scale with recent activity | agent (viewer feedback speed) |

## Core loop and camera director

Every viewer action becomes stone, every stone lands on the temple within about 3 seconds with the giver's name, and a camera director keeps the picture cinematic without jumping around.

**One action, second by second**

1. 0.0 s — Event arrives from TikTok (or the simulator).
2. ≤ 1.0 s — Toast at the Kulen quarry: "Dara +10 ថ្ម". Feed and leaderboard update.
3. 0–3 s — Stone units are assigned to the next free build slots on the active temple.
4. Small and medium stones: placed with a short drop animation, shown in a picture-in-picture (PiP) corner if the main camera is elsewhere.
5. Large and huge stones: the director cuts full screen to the construction site; workers or a lever hoist the block; the giver's name appears carved on its face.
6. On the map, a convoy of the matching size (workers, ox-cart, elephant, raft) joins the route from Kulen, so the world looks busy in proportion to real activity.

**Game states**

| State | Enters when | Leaves when |
| --- | --- | --- |
| Idle tour | No events for 60 s | Any event |
| Building | A temple is active | Temple reaches 100% |
| Big moment | Large/huge gift, milestone, or combo peak | Cinematic ends (6–10 s) |
| Completion | Temple 100% | Festival ends (\~45 s), next temple unlocks |
| Paused | Host hotkey | Host hotkey |
| Disconnected | Bridge loses TikTok | Reconnected (auto, with backoff) |

**Camera director rules**

- Base loop, 60 s: sky map 15 s → Kulen quarry 10 s → river rafts 15 s → elephant and human hauling 10 s → construction site 10 s.
- A large or huge gift interrupts the loop with a full-screen construction cut, then the loop resumes where it left off.
- Full-screen cuts have an 8 s cooldown. Gifts arriving during a cooldown are queued and shown back to back, biggest first, max 4 in the queue; the rest go to PiP.
- Small and medium stones never take the full screen; they use a PiP window.
- Completion and like milestones outrank gifts.
- Idle tour: slow flight over the map and finished temples, with a "Did you know?" history card every 90 s. Never a "please gift" screen.

## Interaction map

All rules live in `config/gift-map.json`, never in game code. Gifts are matched by the coin value TikTok sends with each gift, so new or unknown gifts still work.

**Stone tiers** (by the coin value of one gift of that type)

| Tier | Coins per gift | Example gifts | Transport | Screen |
| --- | --- | --- | --- | --- |
| Small | likes, follow, share, 1–4 | Rose, TikTok, GG | Workers carry it | PiP |
| Medium | 5–29 | Finger Heart | Ox-cart | PiP |
| Large | 30–999 | Doughnut, Hand Hearts | Elephants drag it | Full-screen cut |
| Huge | 1,000+ | Galaxy, Lion, Universe | Bamboo raft on the canal | Full-screen cut + banner with avatar |

Example coin values are approximate and not needed by the game, which reads the real value from each event.

**Actions**

| Action | Progress units | What appears | Limits |
| --- | --- | --- | --- |
| Like | 1 per like | Small unnamed stone; likes batched per user every 2 s into one toast | none |
| Follow | 20 | Named foundation block | once per user per stream |
| Share | 10 | Worker team walks from Kulen | 1 per user per 5 min |
| Join the LIVE | 0 | "Welcome" line in the feed | 1 of every 10 joins shown |
| Comment `1` `2` `3` `4` | 0 | Joins a guild: Stone Cutters, Elephant Keepers, River Rafters, Carvers | change once per stream |
| Comment `!mystone` or `!ថ្មខ្ញុំ` | 0 | PiP camera flies to that viewer's biggest stone | 1 per user per 2 min; 1 globally per 10 s |
| Gift | coins × 5 | One named stone of its tier; a combo shows a counter "×12" | see caps |

**Caps and balance**

- One gift moves the active temple at most 15%. The overflow goes to a visible **Kulen stockpile** that feeds the next temple, so nothing is wasted and one Lion never ends a round alone.
- Temple targets live in config. Preah Ko starts at 3,000 units; later temples scale by size (Angkor Wat ×10).
- The ×5 gift multiplier and targets are tuned after the first 3 real streams using the saved stats.

**Recognition**

- Name carved on every gift stone and follow block (after the name filter).
- Top 5 builders of the current temple, and Top builders of today.
- Lifetime rank from total units: Laborer (0) → Stone Cutter (100) → Mason (1,000) → Master Carver (10,000) → Royal Architect (100,000). Khmer: កម្មករ → ជាងថ្ម → ជាងសំណង់ → មេជាងចម្លាក់ → ស្ថាបត្យករហ្លួង.
- Hall of Builders wall beside each finished temple lists its top 10 forever.

**Community events** (fixed goals, no luck involved)

| Trigger | Event |
| --- | --- |
| 5,000 likes in a stream | Monsoon rain; rafts move 1.5× faster for 3 min |
| 20,000 likes | Royal procession: king, parasols, elephants cross the site |
| 50,000 likes | Night lantern festival for 2 min |
| Gifts less than 10 s apart | Work-chant meter fills; workers chant and haul faster (visual only) |
| Guild with most units this temple | Its banner flies over the site |
| Real season (May–Oct wet, Nov–Apr dry) | Wet: high river, more rafts. Dry: more elephants and carts |

## Campaign

The campaign runs 13 temples in historical order, from Preah Ko (879) to the Bayon (\~1200); a year counter and the king's name sit under the title. The first release ships temple 1 only; each update adds the next.

| # | Temple | Year | King | Main material | Size × | Check |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | [Preah Ko](https://en.wikipedia.org/wiki/Preah_Ko) ព្រះគោ | 879 | Indravarman I | Brick + stucco, sandstone door frames | 1 | sourced |
| 2 | [Bakong](https://en.wikipedia.org/wiki/Bakong) បាគង | 881 | Indravarman I | Sandstone temple mountain | 2 | sourced |
| 3 | Lolei លោលៃ | 893 | Yasovarman I | Brick | 1 | verify |
| 4 | Phnom Bakheng ភ្នំបាខែង | \~900 | Yasovarman I | Sandstone on a hill | 3 | sourced (king) |
| 5 | East Mebon មេបុណខាងកើត | 953 | Rajendravarman | Brick + laterite | 2 | verify year |
| 6 | Pre Rup ប្រែរូប | 961 | Rajendravarman | Brick + laterite + sandstone | 3 | sourced (king) |
| 7 | Banteay Srei បន្ទាយស្រី | 967 | Built by a courtier, not a king | Pink sandstone, fine carving | 1 | sourced |
| 8 | Ta Keo តាកែវ | \~1000 | Jayavarman V | First temple almost all sandstone | 4 | sourced (material) |
| 9 | Baphuon បាពួន | \~1060 | Udayadityavarman II | Sandstone | 5 | sourced |
| 10 | Angkor Wat អង្គរវត្ត | early 1100s | Suryavarman II | Sandstone, laterite core | 10 | sourced |
| 11 | Ta Prohm តាព្រហ្ម | 1186 | Jayavarman VII | Sandstone + laterite | 5 | verify year |
| 12 | Preah Khan ព្រះខ័ន | 1191 | Jayavarman VII | Sandstone + laterite | 5 | verify year |
| 13 | Bayon បាយ័ន | late 1100s–early 1200s | Jayavarman VII | Sandstone, face towers | 8 | sourced (king) |

Kings and styles are from [Khmer architecture](https://en.wikipedia.org/wiki/Khmer_architecture). Rows marked **verify** use years from memory and must be checked before that temple is built.

**How material changes the look**

- Brick temples (Preah Ko, Lolei): the game's "stones" are red bricks fired in kilns by the river, plus grey-green sandstone door frames and lintels hauled from Kulen for bigger gifts.
- Sandstone temples: blocks come from the Kulen quarries; grey-green when cut, warming to gold once set in the temple.
- Laterite (red, porous): foundations and enclosure walls, dug from local pits.

**Transport facts used in the scenes and history cards** ([Live Science](https://www.livescience.com/24440-angkor-wat-canals.html))

- About 50 sandstone quarries sat at the base of Phnom Kulen.
- A network of canals and roads gave a route of about 37 km to Angkor Wat.
- Angkor Wat used 5–10 million sandstone blocks, some up to 1,500 kg.

**Map places**: Phnom Kulen and its quarries, the Siem Reap river and canals, Roluos (Hariharalaya), East and West Baray, Angkor Thom's moat, Angkor Wat, the Tonle Sap shore. Distances are stylized, not to scale.

## World, art and assets

The look is the museum panorama in PK's references — warm golden dust, bamboo scaffolding, crowds hauling stone — made with simplified 3D models and a painterly filter so it runs smoothly while streaming.

**Look rules**

- Light: low golden sun, soft haze, long shadows; sky pale blue-to-cream by day, indigo at night.
- Palette: laterite red, Kulen grey-green sandstone, warm gold set stone, brick red, jungle green, river brown-green.
- Filter: warm color grade + soft bloom + light posterize + paper-grain overlay + vignette. No heavy per-pixel painting filters.
- Crowds: many low-detail workers far away (instanced), 3–6 detailed workers in close-ups.
- Sky map: illustrated style of the reference map — flat colored land, blue canals and moats, temple icons — tilted in 3D with small moving convoys.
- Real details to show: drilled lifting holes in blocks, wooden levers and pulleys, bamboo scaffolding, thatched huts, a food stall, carvers shaping lions and lintels.

**Scenes**

| Scene | What is in it |
| --- | --- |
| Sky map | Whole region, temple sites (locked / active / finished), convoys on routes, year and king |
| Kulen quarry | Cliff face, cutters splitting blocks, stockpile, toast pop-ups for new stones |
| River rafts | Canal with bamboo rafts and pole men, huge blocks, temple towers in the distance |
| Hauling | Rope teams and elephants dragging blocks on log rollers, ox-carts on a dirt road |
| Construction site | Active temple with scaffolding, lever hoist, stones landing with carved names |
| Festival | Sunrise behind the finished temple, Apsara dancers, lanterns, plaque of top builders |

**Assets** (every item needs a license before use)

| Asset | Source plan | License | Status |
| --- | --- | --- | --- |
| Temples (13) | Built in code from a modular Khmer kit: platforms, tiered towers, lintels, doorways, gopuras, walls | Own work | Prompt 09 |
| Terrain, rivers, canals, map | Built in code from a hand-drawn height and water map | Own work | Prompt 08 |
| Rafts, carts, levers, scaffolding, huts | Built in code from simple shapes | Own work | Prompts 10–11 |
| Human workers (animated) | Quaternius or Kenney CC0 characters, or Mixamo (free use in games) | CC0 / Mixamo terms | TODO: PK approves pick in prompt 11 |
| Elephant and ox (animated) | CC0 model search first; else image-to-3D tool + auto-rig | Check each | TODO, placeholder until found |
| Apsara dancers | Stylized low-poly, own or commissioned | Own / paid | TODO, silhouettes as placeholder |
| Fonts | Moulpali, Dangrek, Bokor by Danh Hong (PK's choice) + Kantumruy Pro for small text (Google Fonts) | SIL OFL | Embedded in prompt 02 |
| Music | Royalty-free Khmer traditional (pinpeat-style) tracks | Must allow streaming | TODO: PK picks |
| Sound effects | CC0 packs (stone knocks, crowds, elephants, water, chants) | CC0 | Prompt 16 |
| Khmer voice lines | PK's Khmer TTS Studio | Own | Optional, prompt 16 |

The museum paintings and the illustrated map are mood references only and never appear in the game or on stream.

## Screen layout

The game renders at 1080×1920 and keeps everything important out of the areas where TikTok draws its own header, comments, gift pop-ups and buttons. The zone sizes below are estimates; prompt 20 checks them on a real stream and adjusts `config/layout.json`.

| Zone | Pixels (y from top) | Contents |
| --- | --- | --- |
| TikTok header | 0–200 | Nothing important (TikTok shows host name and viewers) |
| Title band | 200–480 | សាងប្រាសាទ title, temple name, year and king, progress bar with %, stockpile count |
| Info band | 480–760 | Left: live feed (last 4 actions). Right: Top 5 of this temple. Toasts appear here |
| Main view | 760–1270 | The cinematic camera; banners for huge gifts centred here; history cards |
| Face cam and PiP | 900–1250, left 300 px | Host face cam (circle, added in LIVE Studio). PiP window sits right of it |
| TikTok comments and gift bar | 1270–1920 | Scenery only: ground, moat, crowds. No text |
| TikTok right buttons | x 930–1080, y 1000–1920 | No text or faces |

**UI rules**

- Khmer first, English second, e.g. "ថ្ម 1,240 / 3,000 stones".
- Fonts (PK's choice, all by Danh Hong): Moulpali for the game title and temple names; Bokor for big moments (huge-gift banners, "ប្រាសាទរួចរាល់!", the plaque); Dangrek for names carved on stones, the feed and leaderboard names and section labels. Kantumruy Pro only for small text (numbers, help lines, history-card body) where display faces get hard to read, and as the fallback for any missing Latin glyph. All embedded in the build.
- Minimum text size 26 px at 1080 wide, so it stays readable on a phone.
- On-screen help is neutral: "ចុចបេះដូង ដើម្បីដាក់ថ្ម · Tap like to lay a stone" and "Type 1–4 to join a guild". Never a price list of gifts.
- A debug overlay (host hotkey) draws the safe zones in red for setup.

## Tech architecture

Three.js with TypeScript is the engine: it is code-only, so Claude Code can build, test and screenshot every step without a visual editor, and a browser renders Khmer script correctly out of the box.

**Why not the others**: Godot 4 needs its editor for most scene work; Unity is heavy for an 8 GB RAM laptop and its editor can't be driven by Claude Code either; Unreal is far too heavy.

**Data flow**

1. TikTok LIVE → `apps/bridge` (Node) receives likes, follows, shares, comments, gifts, joins through `tiktok-live-connector`.
2. The bridge validates, removes duplicates, merges gift combos, filters names, applies `config/gift-map.json`, and saves to SQLite.
3. The bridge sends normalized events and game state to the game over WebSocket `ws://localhost:7420`.
4. `apps/game` (Three.js) draws the world and UI at 1080×1920.
5. `apps/desktop` (Electron) opens the game in one window titled "The Temples", rendering 1080×1920 inside, on the eGPU.
6. TikTok LIVE Studio (Vertical layout) captures that window with Game Capture or Window Capture, adds the face cam and mic, and streams. A Link source at 1080×1920 is the backup.
7. `apps/host` (localhost:7421) is PK's control panel and simulator; it sends the same events as TikTok for testing.

**Repo layout** (npm workspaces, TypeScript strict)

| Path | Job |
| --- | --- |
| `packages/shared` | Event schema (zod), config schemas, tier and unit math, name filter — pure functions, fully unit-tested |
| `apps/bridge` | TikTok adapter, backup TikFinity adapter, queue, rate limits, SQLite store, WebSocket server |
| `apps/game` | Three.js scenes, camera director, build slots, convoys, UI overlay, post-processing |
| `apps/host` | Control panel: test buttons, burst and stress modes, pause, reset, hotkeys, safe-zone overlay |
| `config/` | `gift-map.json`, `temples.json`, `layout.json`, `camera.json`, `names-blocklist.txt` |
| `assets/` | Models (glTF), textures, fonts, audio, each with a `LICENSES.md` line |
| `docs/` | `GAME_SPEC.md` (this doc), `ARCHITECTURE.md`, `DECISIONS.md`, `CHECKS.md` |

**Normalized event**

```json
{ "id": "string", "type": "like|follow|share|comment|gift|join", "user": { "id": "string", "name": "string", "avatarUrl": "string?" }, "giftName": "string?", "giftCoins": 0, "count": 1, "comboEnd": true, "text": "string?", "ts": 0 }
```

**Saved data** (SQLite, `data/temples.db`): builders (id, name, lifetime units, rank, guild), contributions (builder, temple, units, time), stones (temple, slot, builder, tier, name shown), campaign (active temple, progress, stockpile), stream stats (likes, gifts, peak viewers per hour). Back up the file after each stream. A host command removes a viewer's name on request.

**Main commands**: `npm run dev` (all apps), `npm run verify` (lint + types + unit tests + build), `npm run e2e` (Playwright: opens the game at 1080×1920, sends simulator events, saves screenshots, logs FPS).

## Performance budget

The stream PC is the Vivobook laptop (i5-1135G7, 4 cores, 8 GB RAM) with a GTX 1660 Super eGPU, so the **Low preset is the stream target**. 8 GB is TikTok LIVE Studio's own minimum, so memory is the tightest limit: game + LIVE Studio + face cam must fit together. Limits are measured in prompt 02 and prompt 19 with LIVE Studio running.

| Measure | Low preset — stream target (laptop + GTX 1660 Super) | High preset — future stronger PC |
| --- | --- | --- |
| Frame rate | 30 FPS locked, 1% lows ≥ 25 | 30 or 60 FPS |
| Frame time | ≤ 30 ms | ≤ 25 ms |
| Game RAM (whole app) | ≤ 700 MB | ≤ 1.2 GB |
| Total system RAM in use while live | ≤ 7.2 GB of 8 GB | — |
| CPU (game only) | ≤ 35% | — |
| Triangles on screen | ≤ 150,000 | ≤ 400,000 |
| Draw calls | ≤ 120 | ≤ 300 |
| Animated characters | ≤ 100 (instanced) | ≤ 300 |
| Particles | ≤ 1,500 | ≤ 5,000 |
| GPU memory | ≤ 1 GB | ≤ 1.5 GB |
| Memory growth | < 50 MB over 2 hours | same |
| Event to screen | toast ≤ 1 s, stone placed ≤ 3 s | same |
| Event flood | 1,000 events/min with no freeze | same |

On this laptop: LIVE Studio should encode with the GPU (NVENC) to spare the 4-core CPU; close Chrome and other apps while live; plug in power and use Ethernet if possible. If the laptop has a free RAM slot, upgrading to 16 GB is the single biggest improvement.

How: instanced meshes for stones, bricks and crowds; baked vertex animation for far workers; object pools; textures ≤ 2K; shadows from one light only; post-processing on half-resolution buffers where possible.

## TikTok rules compliance

The design avoids the two known dangers: chance-based rewards and low-effort gift-begging streams. See [TikTok LIVE gifts requirements](https://support.tiktok.com/en/live-gifts-wallet/tiktok-live/live-gifts-on-tiktok) and the [gambling and gamification policy](https://seller-us.tiktok.com/university/essay?knowledge_id=2903157654996737&lang=en).

| Rule | How the game meets it |
| --- | --- |
| No games of chance tied to gifts (wheels, loot boxes, lucky draws) | Every effect is fixed and shown in advance; no random prizes; randomness is only cosmetic (which worker walks where) |
| No prizes of value, cash or gift cards | Rewards are only on screen: names, ranks, banners |
| Free actions must matter | Likes, follows, shares and comments all build or change the scene; like milestones unlock the biggest events |
| Real, interactive host | PK on face cam and voice; history cards give real content; host thanks builders by name |
| No pressure wording | No price lists, no "send X to unlock"; help text only says how to take part |
| Not an unattended loop | Idle tour only between activity; host present for the whole stream |
| Account eligibility | 18+, about 1,000 followers for LIVE, Gifts available in PK's region — PK to confirm in the app |
| Names on screen | Filtered for bad words; removed on request |

TikTok can restrict any interactive game LIVE, so the risk is lowered, not removed.

## Acceptance criteria

Each line is a test. Prompts cite these IDs, and **check NN** marks each one met, partial or missing.

**Events and rules**

- **AC-01** Given the simulator sends 1 gift of 30 coins, when the bridge processes it, then the game receives one event with tier Large and 150 units within 200 ms.
- **AC-02** Given a gift combo of 12 Roses, when the combo ends, then 12 named small stones exist and the feed shows one line "×12".
- **AC-03** Given the same event id twice, then it is counted once.
- **AC-04** Given an unknown gift name with 50 coins, then it is treated as Large using its coin value.
- **AC-05** Given a malformed event, then it is logged and ignored and nothing crashes.
- **AC-06** Given a name containing a blocklisted word or emoji, then the carved name is filtered or shown as "Builder".
- **AC-07** Given one gift worth more than 15% of the temple target, then the temple gains exactly 15% and the rest goes to the Kulen stockpile.
- **AC-08** Given the same user follows twice in a stream, then only the first gives units.

**Game and camera**

- **AC-09** Given any event, then its toast appears within 1 s and its stone is placed within 3 s (during the \~45 s completion sequence stones are queued and placed right after it).
- **AC-10** Given no gifts, then the camera runs the 60 s loop in order with the configured seconds (±0.5 s).
- **AC-11** Given two Large gifts 2 s apart, then two full-screen cuts play back to back with no cut starting within 8 s of the previous start.
- **AC-12** Given a Small or Medium gift, then it never takes the full screen and shows in PiP.
- **AC-13** Given the comment `!mystone` from a user with stones, then PiP shows that user's biggest stone within 3 s; a second request inside 2 min is ignored.
- **AC-14** Given the temple reaches 100%, then the completion sequence plays, the plaque lists the top 10, and the next temple becomes active.
- **AC-15** Given 5,000 likes in the stream, then the monsoon event plays once.

**Saving**

- **AC-16** Given the game and bridge restart mid-temple, then progress, stones, names, ranks and stockpile are restored exactly.

**Stream quality**

- **AC-17** Given the performance scenario, then the Low-preset budget holds on the stream PC with LIVE Studio running.
- **AC-18** Given 1,000 events per minute for 10 minutes, then FPS stays ≥ 27 and the event queue stays under its cap.
- **AC-19** Given the TikTok connection drops, then a "reconnecting" badge shows and the bridge retries with backoff (1, 2, 4 … 60 s) until connected.
- **AC-20** Given Khmer text with subscripts and vowels (e.g. ស្ថាបត្យករហ្លួង), then it renders correctly in UI and in carved names.
- **AC-21** Given the safe-zone overlay is on, then no text or face sits in the TikTok zones.
- **AC-22** Given LIVE Studio captures the game window, then the vertical stream shows the whole game, sharp on a phone, with no black bars or cropping.

## Preflight report

**Verdict: READY WITH RISKS.** The plan can start at prompt 00 today; 5 risks are handled by early spikes or placeholders, and 4 answers from PK are needed before the prompts that use them.

| Check | Result | Notes |
| --- | --- | --- |
| Coverage | OK | Every AC-01…AC-22 is built and tested by at least one prompt (map below) |
| Order | OK | No prompt uses a file or system made later; prompt 10 logs `!mystone` until the director exists in 12 |
| Consistency | OK | Ports 5173 / 7420 / 7421, config file names and event fields are the same in spec and prompts |
| Assets | RISK | Animated humans and elephants not chosen yet; placeholders keep work moving, PK picks in prompt 11 |
| Hardware fit | RISK | HIGH: 8 GB RAM is LIVE Studio's minimum on its own; game + LIVE Studio + face cam must fit. Low preset is the target and prompt 02 measures real RAM; 16 GB RAM (if a slot is free) removes most of this risk |
| TikTok rules | OK | No chance mechanics, free actions matter, host present, neutral wording |
| Khmer text | OK | Tested first in prompt 02 in HTML and on 3D textures |
| Failure paths | OK | Connector down, floods, unknown gifts, duplicates, restart — all have tests |
| Capture | RISK | LIVE Studio captures the game window; a sharp 1080×1920 picture needs a window that tall, so a portrait external monitor on the eGPU is best. Prompt 02 tests 3 options as a gate |
| TikTok connector | RISK | Unofficial library may need a sign-server key or change without notice; prompt 18 checks first, TikFinity is the backup |
| History | RISK | Years for Lolei, East Mebon, Ta Prohm, Preah Khan to verify before those temples |

**Fixed during preflight**

- AC-09 conflicted with the 45 s completion freeze → stones are queued during the finish.
- Prompt 09 left slot-to-unit math open → `unitsPerSlot` defined.
- Preah Ko is brick, but routes only came from Kulen → brick kiln routes added in prompt 08.
- Game sound must reach LIVE Studio → audio capture checked in prompt 02, autostart in the app window in prompt 16.

**Acceptance criteria → prompts**

| AC | Prompts |
| --- | --- |
| 01–05, 08 | 03, 04 |
| 06, 07 | 03, 05 |
| 09 | 10, 15 |
| 10–13 | 10, 12 |
| 14 | 15 |
| 15 | 14 |
| 16 | 05, 14 |
| 17, 18 | 17, 19 |
| 19 | 18 |
| 20 | 02, 10, 13 |
| 21, 22 | 02, 13, 20 |

**Open questions for PK** (answer any time before the prompt listed)

- [ ] Stream PC (laptop + GTX 1660 Super eGPU): 8 GB RAM, free slot to confirm in Task Manager; portrait monitor on the eGPU is being set up (option A in prompt 02); upload speed to test at stream time — before prompt 02
- [ ] TikTok account: 1,000+ followers, LIVE and Gifts turned on in your region — before prompt 02
- [ ] Pick animated human and elephant models from the 3 options offered — prompt 11
- [ ] Music: royalty-free Khmer traditional tracks you are allowed to stream — prompt 16

## Build prompts

Run these in Claude Code one at a time, in order, in a new folder `the-temples`. Paste one prompt, let it finish, then come back and say **check NN**. Do not start the next prompt until the check passes.

**Phase A — foundations (00–06): everything testable without 3D or TikTok**

```markdown
### Prompt 00 — Project start
**Goal:** Create the repo and save the spec as the single source of truth.
**Tasks:**
1. `git init` in `the-temples`. Create `docs/GAME_SPEC.md` from the file I attach (exported from my spec doc) — copy it exactly.
2. Create `docs/DECISIONS.md` containing the Decisions table from the spec, and `docs/CHECKS.md` (empty log).
3. Create `CLAUDE.md` with these standing rules for every future prompt:
   - Read `docs/GAME_SPEC.md` and `docs/ARCHITECTURE.md` before work.
   - If the spec is unclear or conflicts, stop and report; never guess.
   - No new dependency without one line of reason in the summary.
   - Gift and game rules only in `config/*.json`, never hard-coded.
   - Every feature ships with its tests in the same prompt.
   - Finish only when `npm run verify` passes; report what was run and the results.
   - Keep 1080x1920 and the performance budget.
**Acceptance:** files exist; `CLAUDE.md` lists all 7 rules.
**Deliver:** file list and first commit "docs: spec".
```

```markdown
### Prompt 01 — Architecture and monorepo scaffold
**Goal:** A working npm-workspaces monorepo with strict TypeScript, lint and tests.
**Context:** Read docs/GAME_SPEC.md, section "Tech architecture".
**Tasks:**
1. Workspaces: `packages/shared`, `apps/bridge`, `apps/game` (Vite + Three.js), `apps/host` (Vite). Node 20+, TypeScript strict, ESLint, Prettier, Vitest.
2. Root scripts: `dev` (runs bridge, game, host together), `verify` (lint + typecheck + unit tests + build), `e2e` (Playwright, stub for now).
3. Folders `config/`, `assets/` (with `LICENSES.md`), `data/` (git-ignored).
4. Write `docs/ARCHITECTURE.md`: data flow, ports (game 5173, bridge WebSocket 7420, host 7421), folder jobs, event schema.
5. `.env.example` with `TIKTOK_USERNAME=`, `EULER_API_KEY=` (optional), `PORT_WS=7420`.
**Acceptance:** `npm run verify` passes on a clean clone; `npm run dev` starts all three apps.
**Verify:** `npm ci && npm run verify`.
**Deliver:** tree, scripts, results.
```

```markdown
### Prompt 02 — Game window, capture and Khmer text spike (gate)
**Goal:** Prove on the stream PC that the game runs beside TikTok LIVE Studio, looks sharp, and shows Khmer correctly — before any real game work.
**Context:** Stream PC = Vivobook laptop, i5-1135G7 (4 cores), 8 GB RAM, GTX 1660 Super eGPU over USB-C, Windows. No OBS: LIVE Studio captures the game directly.
**Tasks:**
1. `apps/game`: Three.js scene with a fixed internal render of 1080x1920 (scaled to fit the window, letterbox-free at 9:16), a rotating placeholder tower, sky gradient, and a meter (F3) for FPS, frame time and JS heap.
2. `apps/desktop`: Electron app that opens the game in one window titled "The Temples": no menu bar, 9:16 content size from `config/window.json` (default: as tall as the screen allows), prefers the high-performance GPU, remembers which monitor it was on, exits cleanly. One line in the summary on why Electron; add `apps/desktop` to `docs/ARCHITECTURE.md`.
3. Embed fonts Moulpali, Dangrek, Bokor and Kantumruy Pro (SIL OFL, roles as in spec "Screen layout"; in `assets/fonts`, license lines in `assets/LICENSES.md`). Test panel: សាងប្រាសាទ, ស្ថាបត្យករហ្លួង, ព្រះគោ, an English line (no Thai: the game is Khmer + English only) — each in all four fonts, as HTML text and drawn on a canvas texture on a 3D stone; flag any font missing Khmer or English letters. A test tone button to check sound capture.
4. Playwright: open the game at 1080x1920, wait for fonts, save `docs/screens/02-khmer.png`, log average FPS over 10 s.
5. `docs/CAPTURE.md`: step-by-step LIVE Studio setup (Vertical layout) for three options, each with a hand checklist:
   - A. Game window full screen on a portrait external monitor plugged into the eGPU → Game Capture. Sharpest.
   - B. Game window on the laptop screen (about 608x1080) → Game Capture or Window Capture, stretched to the vertical canvas.
   - C. LIVE Studio Link source at `http://localhost:5173`, custom size 1080x1920, no separate window.
   For all: Windows Graphics settings set Electron and LIVE Studio to the GTX 1660 Super; face cam and mic in LIVE Studio; game sound captured (use the test tone); hardware encoder (NVENC); 30 FPS.
6. A results table in `docs/CAPTURE.md` for me to fill per option: game FPS, LIVE Studio dropped frames, total RAM used, CPU %, GPU %, sharpness 1–5 on a phone.
**Acceptance:** AC-20; AC-22 checklist written; the game app alone uses ≤ 700 MB RAM and holds 30 FPS on Low.
**Verify:** `npm run verify && npm run e2e`; describe the screenshot.
**Stop after this prompt.** I will run a private test LIVE with each option and pick one. If no option holds 30 FPS with total RAM ≤ 7.2 GB, report and propose lighter options before prompt 03.
```

```markdown
### Prompt 03 — Shared rules: events, tiers, units, names
**Goal:** All game rules as pure, tested functions in `packages/shared`.
**Tasks:**
1. zod schemas: normalized event (spec "Tech architecture"), `config/gift-map.json`, `config/temples.json`, `config/camera.json`, `config/layout.json`. Write the four config files with the spec's values (tiers, units, limits, caps, temple list and targets, camera seconds, safe zones).
2. `tierForCoins(coins)`: Small 1–4, Medium 5–29, Large 30–999, Huge 1000+.
3. `unitsFor(event, config)`: like 1 each, follow 20, share 10, gift coins × multiplier (5).
4. `applyToTemple(state, units, target)`: 15% per-gift cap, overflow to stockpile.
5. `cleanName(name)`: remove emoji and control chars, blocklist from `config/names-blocklist.txt` (starter list in Khmer and English), max 16 chars; the game shows only Khmer and English letters, so if a display name has other scripts (Thai, Chinese, emoji only) use the viewer's @handle instead, fallback "Builder" / "អ្នកសាងសង់".
6. `rankFor(lifetimeUnits)` with the five ranks and Khmer names.
**Acceptance:** AC-04, AC-06, AC-07 as unit tests, plus edge cases (0 coins, huge numbers, Khmer names kept intact).
**Verify:** `npm run verify`; coverage ≥ 90% for `packages/shared`.
```

```markdown
### Prompt 04 — Bridge core: queue, combos, limits, WebSocket
**Goal:** The bridge turns raw events into clean, rate-limited game events.
**Tasks:**
1. `apps/bridge`: an `EventSource` interface (start, stop, onEvent, onStatus). Implement `SimulatorSource` only for now.
2. Pipeline: validate → dedupe by id (LRU of 10,000) → merge gift combos (each repeat placed immediately; one feed line per combo with ×N at combo end) → per-user limits from config (follow once per stream, share 1/5 min, `!mystone` 1/2 min, guild change once) → batch likes per user every 2 s → units and tier from `packages/shared`.
3. Queue cap 2,000 items; when full, merge likes first, never drop gifts; log drops.
4. WebSocket server on 7420: sends `event`, `state`, `status` messages; game can send `hello` and receives a full `state` snapshot.
5. Structured logs to `data/logs/bridge-YYYY-MM-DD.log`.
**Acceptance:** AC-01, AC-02, AC-03, AC-05, AC-08 as tests with recorded fixtures in `apps/bridge/test/fixtures`.
**Verify:** `npm run verify`.
```

```markdown
### Prompt 05 — Saved world (SQLite)
**Goal:** The campaign survives restarts.
**Tasks:**
1. `better-sqlite3` store at `data/temples.db` with migrations: builders, contributions, stones, campaign, stream_stats (spec "Saved data").
2. Repository functions used by the bridge: add units, place stone in slot, get top N per temple / today / lifetime, set guild, complete temple, get snapshot.
3. Write-ahead logging on; writes batched every 500 ms; a backup copy `data/backups/temples-<date>.db` on bridge shutdown.
4. Host command `removeName(userId)` replaces that name everywhere with the fallback.
**Acceptance:** AC-16 (kill and restart the bridge mid-temple in a test; snapshot is identical), AC-07 stockpile persists.
**Verify:** `npm run verify`.
```

```markdown
### Prompt 06 — Host panel and simulator
**Goal:** I can test every feature without going live.
**Tasks:**
1. `apps/host` at localhost:7421: buttons for like, tap burst ×15, follow, share, join, comment `1`–`4`, `!mystone`, and gifts of 1, 5, 30, 100, 1000, 29999 coins; a user-name field with random Khmer/English names, plus a few Thai and emoji names to test the @handle fallback.
2. Modes: Demo (realistic random mix), Burst (100 events), Stress (1,000 events/min for N minutes).
3. Controls: pause/resume game, reset temple (with a confirm step inside the page), skip to 99%, safe-zone overlay toggle, remove a name, status of bridge and TikTok connection.
4. Hotkeys documented in `docs/HOST.md`.
**Acceptance:** each button produces the correct normalized event (tests); Stress mode sends 1,000 ±5 events/min.
**Verify:** `npm run verify && npm run e2e`.
```

**Phase B — the game world (07–13)**

```markdown
### Prompt 07 — Game shell
**Goal:** The game connects to the bridge and has the systems every scene uses.
**Tasks:**
1. WebSocket client with auto-reconnect; typed store for game state (active temple, progress, stockpile, feed, leaderboards, guilds, milestones).
2. Scene manager with named scenes: `map`, `quarry`, `river`, `hauling`, `site`, `festival`; each a class with `enter`, `update(dt)`, `exit`, sharing one renderer.
3. Quality presets High/Low from `config/quality.json` (spec "Performance budget"); Low is the default (stream PC); `?preset=high` for stronger PCs.
4. A fake clock for tests; a debug HUD (F3): FPS, frame time, draw calls, triangles, queue length.
**Acceptance:** on simulator events the store updates within 100 ms (test); switching all six placeholder scenes leaks no GPU memory (renderer.info before/after).
**Verify:** `npm run verify && npm run e2e`.
```

```markdown
### Prompt 08 — Campaign sky map
**Goal:** The illustrated 3D map of the Angkor region.
**Tasks:**
1. Stylized terrain from a hand-authored height/water map in `assets/map/`: Phnom Kulen plateau (north-east), Siem Reap river and canals, Roluos, East and West Baray, Angkor Thom square moat, Angkor Wat, Tonle Sap shore (south). Flat painted colors like an illustrated map, tilted camera.
2. Temple site markers from `config/temples.json`: locked (grey outline), active (glowing, progress ring), finished (gold icon).
3. Named routes (splines) from Kulen and from riverside brick kilns near Roluos to each site, mixing river/canal and road segments; stored in `config/routes.json`.
4. Year and king label for the active temple.
**Acceptance:** screenshot `docs/screens/08-map.png` shows all places labelled in Khmer and English; route lengths computed and logged.
**Verify:** `npm run verify && npm run e2e`.
```

```markdown
### Prompt 09 — Temple kit and build slots (Preah Ko)
**Goal:** Temples are built from ordered slots that stones fill.
**Tasks:**
1. A modular Khmer temple kit in code: laterite platform with steps, square sanctuary tower with receding tiers, false doors, sandstone door frame and carved lintel, guardian lion statues, low enclosure wall.
2. Preah Ko layout: six brick towers in two rows of three on one platform (front row taller), facing east, plus the enclosure and three Nandi statues in front.
3. Slot generator: splits each part into brick or block slots with a build order (foundation → platform → walls up tier by tier → lintels → tower tops → statues). Each slot is worth `unitsPerSlot = ceil(target / slotCount)` units (stored in config); a stone fills as many slots as its units cover, and a Large or Huge stone takes the next big-piece slot (lintel, tower top) first.
4. Material per slot from config: brick, laterite, sandstone.
5. Instanced rendering: all placed slots of a material in one instanced mesh.
**Acceptance:** at 0%, 50%, 100% the temple renders correctly (screenshots); slot order never places a block above an empty slot (test); draw calls ≤ 20 for the whole temple.
**Verify:** `npm run verify && npm run e2e`.
```

```markdown
### Prompt 10 — Stone placement and carved names
**Goal:** Every stone lands on the temple with feedback and the giver's name.
**Tasks:**
1. On each event: toast within 1 s; assign units to next slots; animate the stone into place (drop for Small/Medium, lever hoist with rope for Large/Huge).
2. Named stones: the name is drawn onto the stone face as a carved texture (canvas texture with inner shadow), Khmer and Latin supported. Store slot → builder.
3. Tier looks: Small = brick/small block; Medium = larger block; Large = block with drilled lifting holes; Huge = lintel or tower-top piece.
4. `!mystone`: find the user's biggest stone and send a request to the camera director (prompt 12 will show it; for now, log and highlight it).
5. Stockpile: a visible pile at the site entrance whose size follows the stockpile count.
**Acceptance:** AC-09, AC-13 (highlight part), AC-20 on carved names; 200 stones placed in 60 s keep FPS ≥ 27.
**Verify:** `npm run verify && npm run e2e`.
```

```markdown
### Prompt 11 — Transport convoys
**Goal:** Stones visibly travel from Kulen by the right transport.
**Tasks:**
1. Convoy types by tier: workers carrying (Small), ox-cart (Medium), elephants dragging a block on log rollers (Large), bamboo raft with pole men on the canal (Huge).
2. Convoys follow `config/routes.json`; count on screen scales with activity in the last 60 s (cap by preset).
3. Characters: first placeholder capsules with simple walk cycles. Then list 3 free animated human and elephant options (CC0 or free-for-games: Quaternius, Kenney, Mixamo) with license links in `docs/ASSETS.md` and **stop for PK to choose**. After PK chooses, import as glTF with baked vertex animation for far crowds.
4. Wet/dry season: river level and raft speed from the real month.
**Acceptance:** 100 animated characters on Low (stream PC) at ≥ 30 FPS; convoy type matches tier (test).
**Verify:** `npm run verify && npm run e2e`.
```

```markdown
### Prompt 12 — Camera director
**Goal:** Cinematic, calm camera following the spec rules.
**Tasks:**
1. Shots from `config/camera.json`: sky map 15 s, Kulen quarry 10 s, river rafts 15 s, hauling 10 s, construction site 10 s; smooth spline moves and slow dolly, no hard jumps except cuts.
2. Interrupts: Large/Huge gift → full-screen site cut (6 s), 8 s cooldown, queue max 4 biggest first, rest to PiP; completion and milestones outrank gifts; loop resumes where it left off.
3. PiP window (render-to-texture, 360x480) for Small/Medium stones and `!mystone`.
4. Idle tour after 60 s without events.
5. All timing tested with the fake clock.
**Acceptance:** AC-10, AC-11, AC-12, AC-13.
**Verify:** `npm run verify && npm run e2e`; save a 30 s screen recording or a screenshot every 5 s to `docs/screens/12/`.
```

```markdown
### Prompt 13 — UI overlay (Khmer first)
**Goal:** The on-screen information, inside the safe zones.
**Tasks:**
1. HTML/CSS overlay on top of the canvas at 1080x1920, positions from `config/layout.json`: title band (សាងប្រាសាទ, temple, year, king, progress %, stockpile), info band (feed of last 4, Top 5 this temple), toasts, big-gift banner with avatar (Huge only), history cards.
2. "Did you know?" cards from `config/history-cards.json` (Khmer + English, 20 facts from the spec's Campaign section; mark each with its source).
3. Rank badge next to names; guild banner of the leading guild.
4. Safe-zone debug overlay (host toggle).
5. Neutral help text only; no gift price list.
**Acceptance:** AC-20, AC-21; text ≥ 26 px; screenshot with overlay on and off.
**Verify:** `npm run verify && npm run e2e`.
```

**Phase C — events, finish, polish, going live (14–20)**

```markdown
### Prompt 14 — Community events
**Goal:** Free-action goals, guilds, ranks and the chant meter.
**Tasks:**
1. Like milestones per stream from config: 5,000 monsoon rain (rafts 1.5× for 3 min), 20,000 royal procession, 50,000 lantern festival; each fires once per stream and tells the camera director.
2. Guilds: comments `1`–`4` join Stone Cutters, Elephant Keepers, River Rafters, Carvers; per-temple guild totals; leading guild's banner over the site.
3. Work-chant meter: gifts under 10 s apart fill it; at full, workers animate faster and a chant sound plays; purely visual.
4. Ranks shown from lifetime units (prompt 03).
**Acceptance:** AC-15; guild totals correct after restart (AC-16 extended); nothing in this prompt changes units given (test).
**Verify:** `npm run verify && npm run e2e`.
```

```markdown
### Prompt 15 — Temple completion and campaign progress
**Goal:** The big finish and the unlock of the next temple.
**Tasks:**
1. At 100%: freeze new placements for ~45 s (queue them); sequence — camera sweep, sunrise behind the towers with moat reflection, Apsara dancers (silhouette placeholders), lanterns and fireworks, then the stone plaque carving the top 10 names one by one, then the Hall of Builders wall.
2. Campaign: mark temple done in the store, activate the next temple from `config/temples.json`, move the stockpile into it, update the map and year/king.
3. If the next temple has no kit yet, show "Coming in the next update" on the map and keep an endless "festival site" mode that still accepts stones into the stockpile.
4. Clip marker: write the time of each temple finish to `data/clips.log` and show it in the host panel, so the moment is easy to find in the LIVE replay when cutting Shorts.
**Acceptance:** AC-14; queued stones during the finish are not lost (test).
**Verify:** `npm run verify && npm run e2e`; screenshots of each stage.
```

```markdown
### Prompt 16 — Audio
**Goal:** Sound that fits and never blasts.
**Tasks:**
1. Mixer with channels music, ambience, effects, voice; volumes in `config/audio.json`; host mute hotkey (M) and per-channel sliders in the host panel.
2. Music: play tracks from `assets/audio/music/` (I will add royalty-free Khmer traditional tracks; add silent placeholders and a README listing license requirements).
3. Effects (CC0): stone knock by tier, crowd hauling, elephant call, water and poles, chant, festival drums.
4. Ducking: music drops 40% during big-gift banners.
5. Optional hook: play a Khmer voice line file per event type from `assets/audio/voice/` if present (I will generate them with my Khmer TTS).
**Acceptance:** no clip louder than -3 dBFS peak (analysis script); audio starts by itself in the game app window, and LIVE Studio receives it (checked in prompt 02).
**Verify:** `npm run verify`.
```

```markdown
### Prompt 17 — Painted look
**Goal:** The warm museum-panorama look within the performance budget.
**Tasks:**
1. Post-processing: warm color grade (LUT), soft bloom, light posterize, paper-grain overlay, vignette, haze fog; High and Low settings.
2. Lighting: low golden sun, hemisphere sky light, one shadow-casting light; night variant for the lantern festival.
3. Materials: grey-green fresh sandstone that warms to gold once placed (0.5 s lerp), brick red, laterite; bamboo scaffolding and thatched huts around the site; dust particles.
4. Compare to the mood notes in the spec (no reference images are used as assets).
**Acceptance:** AC-17 holds on the Low preset with its effects on (High may add more); before/after screenshots.
**Verify:** `npm run verify && npm run e2e`.
```

```markdown
### Prompt 18 — Real TikTok connection
**Goal:** Live events flow from my TikTok LIVE into the same pipeline as the simulator.
**Tasks:**
1. Check the current `tiktok-live-connector` version and docs: event names, gift combo fields, and whether a sign-server API key (Euler Stream) is required or rate-limited. Report findings before coding.
2. `TikTokSource` implementing `EventSource`: map chat, like, follow (social), share, member join, gift → normalized events; read the gift's coin value from the event.
3. Reconnect with backoff 1, 2, 4 … 60 s; status messages to the game ("reconnecting" badge) and host panel.
4. `TikFinitySource` backup adapter (WebSocket from the TikFinity app) behind the same interface; choose source in `.env`.
5. Record 10 minutes of real events to `apps/bridge/test/fixtures/live-*.jsonl` (usernames hashed) and replay them in tests.
6. Offline dry-run doc: go live privately / with a friend and run `docs/GO-LIVE.md` checks.
**Acceptance:** AC-19; replayed live fixtures produce the same units as live processing (test).
**Verify:** `npm run verify`; manual dry-run report.
```

```markdown
### Prompt 19 — Performance and soak test
**Goal:** Prove the game holds for a full stream.
**Tasks:**
1. Playwright performance scenario: Low preset on the stream PC with LIVE Studio open, Demo mode for 10 min, then Stress 1,000 events/min for 10 min; record FPS (avg, 1% low), frame time, draw calls, triangles, JS heap every 10 s to `docs/perf/<date>.csv`.
2. Soak: 2 hours Demo mode; heap growth < 50 MB; no WebSocket reconnect loops.
3. Fix anything over budget (instancing, pooling, LODs, texture sizes) and re-run.
4. Log total system RAM and CPU too; repeat with `?preset=high` to record headroom for a future PC.
**Acceptance:** AC-17, AC-18; a results table in `docs/perf/README.md`.
**Verify:** `npm run verify` + the scenarios.
```

```markdown
### Prompt 20 — Package and go-live checklist
**Goal:** One click to start, and a checklist before every stream.
**Tasks:**
1. `start-stream.bat` (Windows): starts bridge and host, opens the game app window; opens the host panel; checks ports; writes logs.
2. `docs/README.md` in English and Khmer: install, start, LIVE Studio scene (game capture filling the vertical canvas + face cam circle at the spec's position, NVENC encoder), hotkeys, backup of `data/temples.db`.
3. `docs/GO-LIVE.md` pre-stream checklist: TikTok connected, test gift in simulator, audio levels, safe-zone check on the real TikTok app (adjust `config/layout.json` if TikTok's overlays cover anything), backup done.
4. After the first real stream, read stream stats and propose new values for the ×5 multiplier and temple targets so a temple takes 10–20 minutes.
**Acceptance:** AC-21 and AC-22 confirmed on a real stream; start script works on a fresh Windows user account.
**Verify:** `npm run verify`; my manual go-live report.
```

## Later and sources

**Later** (not in the first release)

- Temples 2–13, one per update, each with its own kit variant.
- LIVE Match mode: race temples against another streamer.
- Adaptive temple targets that tune themselves from the last 5 streams.
- Viewer web page "find my stone" outside the LIVE.
- Selling or renting the game to other streamers (installer, license, settings UI).
- Reusing the bridge, gift map and overlay for the next game.

**Sources**

- [Khmer architecture — Wikipedia](https://en.wikipedia.org/wiki/Khmer_architecture)
- [Preah Ko — Wikipedia](https://en.wikipedia.org/wiki/Preah_Ko)
- [Bakong — Wikipedia](https://en.wikipedia.org/wiki/Bakong)
- [Mystery of Angkor Wat Temple's Huge Stones Solved — Live Science](https://www.livescience.com/24440-angkor-wat-canals.html)
- [LIVE Gifts on TikTok — TikTok Support](https://support.tiktok.com/en/live-gifts-wallet/tiktok-live/live-gifts-on-tiktok)
- [Gambling policy — TikTok Shop Seller University](https://seller-us.tiktok.com/university/essay?knowledge_id=2903157654996737&lang=en)
- [TikTok-Live-Connector — GitHub](https://github.com/zerodytrash/TikTok-Live-Connector)
- [Using API keys in Node.js — Euler Stream](https://www.eulerstream.com/docs/api-key-usage/nodejs)
