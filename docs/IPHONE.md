# នគរខ្មែរ សម្រាប់ iPhone និង iPad · Khmer Kingdoms for iPhone and iPad (D73, D74)

**អ្នកអភិវឌ្ឍ · Developer: Mr. Sopheak Pang**

Apple អនុញ្ញាតឱ្យបង្កើតកម្មវិធី iPhone តែលើកុំព្យូទ័រ Mac ជាមួយ Xcode ប៉ុណ្ណោះ។ ដូច្នេះ iPhone ទទួលបានហ្គេមដដែល ជា **web app** ដែលដំឡើងលើ Home Screen ហើយលេងបានគ្មានអ៊ីនធឺណិត។
Apple only builds iPhone apps on a Mac with Xcode, so the iPhone gets the same phone page as an installable web app: full screen from the Home Screen, offline, saves on the phone. No Mac, no Apple fee.

## ១. ដាក់លើអ៊ីនធឺណិត · Put it online (once)

The phone page must be served over **https** once, so the iPhone can install it. Free with GitHub Pages:

1. On github.com, create a repository (e.g. `khmer-kingdoms`, Public) and push this project to it (GitHub Desktop: File → Add local repository → `the-temples` → Publish).
2. In the repository: **Settings → Pages → Source: GitHub Actions**.
3. The workflow `.github/workflows/iphone-web.yml` builds `apps/game` (`npm run build:mobile`) and publishes `dist-mobile/`. After about 3 minutes the link is shown under **Actions → iPhone web app** and in Settings → Pages, like `https://<your-name>.github.io/khmer-kingdoms/`. Every push to `main` updates it.

Any other https host works too: upload the contents of `apps/game/dist-mobile/` (after `npm run build:mobile -w @temples/game`).

## ២. ដំឡើងលើ iPhone · Install on the iPhone

1. បើកតំណក្នុង **Safari** (មិនមែន Chrome) · Open the link in **Safari**.
2. ចុច **Share ⬆︎** → **Add to Home Screen** → **Add**.
3. បើកពីរូបតំណាង នគរខ្មែរ លើ Home Screen · Open it from the new នគរខ្មែរ icon: full screen, and it works without internet from then on.
4. Turn the phone sideways (the game asks when it is upright). The Kingdom saves by itself; the save stays on that iPhone.

Updates: when a new version is published, open the app once with internet; the next start uses the new version.

## ៣. លេងលើ iPad តាម Wi-Fi ពីកុំព្យូទ័រ · Play on iPad over Wi-Fi from the PC (D74)

No internet link needed: the PC serves the game to the iPad on the same Wi-Fi.

1. នៅលើកុំព្យូទ័រ ចុចពីរដងលើ **`Play-on-iPad.bat`** (ក្នុងថត `the-temples`) · On the PC, double-click **`Play-on-iPad.bat`** in the `the-temples` folder (or run `npm run ipad`). The first time takes a minute (it builds the game).
2. The window shows an address like `http://192.168.1.23:8080/`. If Windows asks about the firewall, tick **Private networks** and **Allow**.
3. នៅលើ iPad (Wi-Fi ដូចគ្នា) បើក Safari ហើយវាយអាសយដ្ឋាននោះ · On the iPad (same Wi-Fi), type that address in Safari. Share ⬆︎ → Add to Home Screen gives it a full-screen icon.
4. Keep the PC window open while playing. Saves stay on the iPad.

Offline play without the PC needs the https link (§1); plain Wi-Fi addresses cannot keep files offline (Apple allows that only on https).

**iPad screen:** the stage takes the iPad's own shape (4:3 → 1920 × 1440; iPad Pro 11" → 1920 × 1341), so the map fills the screen with no black bars; the top bar and command bar stay at the edges and the extra height shows more of the kingdom.

## ៤. ផ្នែកបច្ចេកទេស · Technical notes

- Same page as Android (`mobile.html` → `dist-mobile/`), same touch controls (`docs/ANDROID.md` §4). No Back button on iPhone: close panels with their ✕ and the ☰ menu.
- `public-mobile/manifest.webmanifest` (fullscreen, landscape) and icons (drawn by `apps/android/tools/icons.py`, `web_icons()`); iOS meta tags in `mobile.html` (`apple-mobile-web-app-capable`, `apple-touch-icon`, black-translucent status bar).
- `sw.js` is written at build time (`vite.mobile.config.ts`, `src/pwa/offline.ts`): it caches every built file (fonts, script, icons) under a name that changes with each build. It is not registered inside the Android app (Capacitor) or on `file://`.
- Upright phones get a "turn your phone" screen; Safari pinch/double-tap page zoom is blocked (the game uses pinch); the kingdom also saves on `pagehide`, which is how iOS closes a Home Screen app.
- A real App Store / TestFlight app would need a Mac (or a cloud Mac) and a paid Apple Developer account; not done.
