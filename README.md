# The Temples · សាងប្រាសាទ

> **កំណែសាកល្បង · Prototype** — នគរខ្មែរ · សាងប្រាសាទ (Khmer Kingdoms · The Temples)

**▶ លេងលើវេប · Play on the web: https://sopheakpang.github.io/Anachak-Khmer/** (ល្អបំផុតនៅលើកុំព្យូទ័រ · best on a computer)

## អំពីអ្នកបង្កើត · About me

ខ្ញុំឈ្មោះ ប៉ង់ សុភ័ក្ត្រ ជាកូនខ្មែរម្នាក់ដែលស្រឡាញ់ប្រវត្តិសាស្ត្រ និងវប្បធម៌ខ្មែរ។ ហ្គេមនេះ ខ្ញុំបង្កើតឡើងដោយខ្លួនឯង ក្នុងពេលទំនេរ ដោយចិត្តស្រឡាញ់ និងមោទនភាពចំពោះដូនតាខ្មែរ ដែលបានកសាងប្រាសាទដ៏អស្ចារ្យ។

*I am Sopheak Pang, a Khmer who loves Cambodian history and culture. I make this game myself, in my free time, out of love and pride for the ancestors who built the great temples.*

## គោលបំណង · Purpose

គោលបំណងនៃហ្គេមនេះ គឺចង់ឲ្យកូនខ្មែរ និងមិត្តភក្តិទូទាំងពិភពលោក បានស្គាល់ និងរៀនពីប្រវត្តិសាស្ត្រសម័យអង្គរ តាមរយៈការលេង៖ សាងសង់ប្រាសាទទាំង ១៣ តាមលំដាប់សម័យកាល ការពារនគរ និងរស់នៅជាមួយប្រជាជនសម័យនោះ។ អ្នកទស្សនាក្នុង TikTok LIVE ក៏អាចចូលរួមសាងប្រាសាទជាមួយគ្នាបានដែរ។ ព័ត៌មានប្រវត្តិសាស្ត្រ យោងតាមប្រភពស្រាវជ្រាវ ហើយចំណុចណាដែលជាការរៀបចំសម្រាប់ហ្គេម ត្រូវបានបញ្ជាក់ច្បាស់។

*The purpose of this game is to let Khmer children and friends around the world know and learn the history of the Angkor era by playing: build the 13 temples in the order of their eras, defend the kingdom and live among the people of that time. Viewers on TikTok LIVE can join in and build the temples together. The history follows research sources, and what is arranged for the game is clearly marked.*

## ស្ថានភាព · Status

សូមជម្រាបថា នេះជាកំណែសាកល្បង (Prototype) ដែលកំពុងអភិវឌ្ឍនៅឡើយ។ ក្រាហ្វិក មុខងារ និងតុល្យភាពហ្គេម អាចផ្លាស់ប្តូរ ហើយអាចមានកំហុសខ្លះៗ។ រាល់មតិយោបល់ និងការណែនាំរបស់លោកអ្នក គឺជាកម្លាំងចិត្តដ៏ធំសម្រាប់ការអភិវឌ្ឍបន្ត។ សូមអរគុណ!

*Please note: this is a prototype, still in development. The graphics, features and balance may change, and some mistakes may remain. Your feedback and suggestions are a great encouragement to keep building. Thank you!*

អ្នកអភិវឌ្ឍ · Developer: **លោក ប៉ង់ សុភ័ក្ត្រ · Mr. Sopheak Pang** · ការផ្លាស់ប្តូរនីមួយៗ · Every update: `CHANGELOG.md`

---

TikTok LIVE interactive game: viewers' likes and gifts rebuild the Khmer temples in historical order, starting with Preah Ko (879).

- Spec: `docs/GAME_SPEC.md` · Architecture: `docs/ARCHITECTURE.md` · Rules for Claude Code: `CLAUDE.md`
- Status: prompts 00–13 done (rules, bridge, saved world, host panel, 3D world: map, quarry, river, hauling, Preah Ko site with carved names, camera director, on-screen text). Capture test in `docs/CAPTURE.md` waits for the hardware upgrade. Next: prompts 14–20 (community events, festival, audio, painted look, real TikTok connector).
- Kulen Expedition (second mode, host plays with the mouse): E01–E03 done — jungle, heroes, walking, hero vote. Switch in the host panel.
- Look: stylised 3D animated-film style (D25). Quality preset in `config/window.json` (`low` / `high` / `lite`).
- Character models: choose in `docs/ASSETS.md`
- Host panel guide: `docs/HOST.md`
- Web version: `.github/workflows/pages.yml` publishes `web/index.html` (front page) and the game under `/play/` (offline, no TikTok bridge) on GitHub Pages at every push to `main`. Repository → Settings → Pages → Source: GitHub Actions.

## Quick start (Windows)

```
npm install
npm run dev        # game http://localhost:5173 · host panel http://localhost:7421 · bridge :7420
npm run desktop    # game window "The Temples" for LIVE Studio Game Capture
```

`npm run verify` must pass after every prompt. `npm run e2e` runs the browser tests.
