# Host panel — your control room

Open it at **http://localhost:7421** (test mode, `Start The Temples.bat`) or **http://localhost:7420/host/** (stream mode, `Stream The Temples.bat`).

## Simulate viewers (works without TikTok)

Pick a viewer (or _Random_), then press a button or its key. Keys don't fire while you are typing in a box.

| Key     | Action                                                       | What the game does                                                           |
| ------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `L`     | Like                                                         | 1 small unnamed stone (likes are grouped per viewer every 2 s)               |
| `T`     | Tap ×15                                                      | 15 likes at once                                                             |
| `F`     | Follow                                                       | Named foundation block, +20 (once per viewer per stream)                     |
| `H`     | Share                                                        | Worker team, +10 (once per viewer per 5 min)                                 |
| `J`     | Join                                                         | "Welcome" for 1 of every 10 joins                                            |
| `M`     | `!mystone` comment                                           | Camera shows that viewer's biggest stone                                     |
| —       | Guild 1–4                                                    | Viewer joins a guild (one change per stream)                                 |
| `1`–`6` | Rose · Finger Heart · Doughnut · Hand Hearts · Galaxy · Lion | Named stone by tier; coins × 5 units; one gift moves the temple at most 15 % |
| `C`     | Rose combo ×12                                               | 12 named stones, one feed line "×12"                                         |
| `D`     | Demo viewers                                                 | Realistic mix, about 3 events per second, until you press again              |
| `B`     | Burst 100                                                    | 100 events at once                                                           |
| —       | Stress 1,000/min                                             | For N minutes, to test the laptop under heavy load                           |

The test viewers include a Thai name and an emoji-only name on purpose: the game shows only Khmer and English, so they appear as their `@handle`.

## Stream controls

| Key | Control             | Notes                                                                                         |
| --- | ------------------- | --------------------------------------------------------------------------------------------- |
| `P` | Pause / Resume game | Events are still counted while paused                                                         |
| —   | New stream          | Press at the start of each stream: resets follow-once and guild-change limits                 |
| —   | Skip to 99%         | For testing the temple finish                                                                 |
| `Z` | Safe zones          | Shows TikTok's covered areas on the game screen (prompt 13)                                   |
| —   | Reset temple…       | Asks to confirm inside the page. Names, ranks and the stockpile are kept                      |
| —   | Remove a name       | Click a name in Top 5 (fills the id), then **Remove**. The name becomes អ្នកសាងសង់ everywhere |

## What is saved

Everything is saved in `data/temples.db` every half second, and a full copy goes to `data/backups/` whenever the bridge stops. Copy `data/` somewhere safe after each stream.
