# នគរខ្មែរ សម្រាប់ Android · Khmer Kingdoms for Android (D72)

**អ្នកអភិវឌ្ឍ · Developer: Mr. Sopheak Pang**

ហ្គេម «នគរខ្មែរ» (ផ្នែក Kingdom) អាចលេងលើទូរស័ព្ទ Android ដោយគ្មានអ៊ីនធឺណិត ជាហ្គេមលេងម្នាក់ឯង (គ្មាន TikTok LIVE)។
The Kingdom tab as an offline, single-player Android game (no TikTok LIVE): touch controls, a touch-sized screen layout, the phone quality preset, saves on the phone.

## ១. ត្រូវការអ្វីខ្លះ · What you need (on the PC)

|                                   |                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Node.js 22                        | already used for the game (`node -v`)                                          |
| Android Studio (latest)           | https://developer.android.com/studio — it installs the Android SDK and Java 21 |
| A phone with Android 7.0 or newer | and a USB cable, or send the APK file to the phone                             |

## ២. បង្កើត APK · Build the APK

1. បើក Terminal (PowerShell) នៅក្នុងថត `the-temples` · Open a terminal in the `the-temples` folder:
   ```
   npm install
   npm run android
   ```
   `npm run android` builds the phone page (`apps/game`, `vite.mobile.config.ts` → `dist-mobile`) and copies it into the Android project (`apps/android/android`).
2. បើក Android Studio → **Open** → ជ្រើសថត `the-temples\apps\android\android` · Open that folder in Android Studio (or run `npm run android:open`). The first time, Android Studio downloads Gradle and the SDK parts it needs; wait until "Gradle sync" finishes.
3. ម៉ឺនុយ **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.
4. ពេលរួច ឯកសារនៅក្នុងថត `the-temples\apk\` · When it finishes, the file is copied to
   `the-temples\apk\KhmerKingdoms-1.4.0-debug.apk` (the name comes from `versionName` in `app/build.gradle`; the original stays in `app\build\outputs\apk\debug\`).

## ៣. ដំឡើងលើទូរស័ព្ទ · Install on a phone

- ផ្ញើឯកសារ `app-debug.apk` ទៅទូរស័ព្ទ (Telegram, USB, Drive) ហើយចុចលើវា។ ទូរស័ព្ទនឹងសួរអនុញ្ញាត «ដំឡើងកម្មវិធីពីប្រភពមិនស្គាល់» — ចុចអនុញ្ញាត។
  Send `app-debug.apk` to the phone and open it; allow "install unknown apps" when asked.
- Or with the phone plugged in (USB debugging on), press ▶ **Run** in Android Studio.
- **Samsung មិនព្រមដំឡើង · Samsung will not install it:**
  1. Settings → Security and privacy → **Auto Blocker** → បិទ (Off). Auto Blocker blocks every app not from Galaxy Store / Play Store.
  2. When Play Protect says "unsafe app blocked", tap **More details → Install anyway**.
  3. Allow the app you open the APK from (My Files, Telegram, Chrome) under Settings → Apps → ⋮ → Special access → **Install unknown apps**.
  4. "App not installed" / "package appears to be invalid": the phone needs Android 7.0 or newer, the file must be complete (download it again), and an older copy of នគរខ្មែរ signed by another PC must be uninstalled first.
- The debug APK is for you and testers. For Google Play a signed release bundle is needed (not done).

## ៤. របៀបលេង · How to play (touch)

| ចលនា · Gesture                     | ធ្វើអ្វី · Does                                                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ចុច · Tap                          | ជ្រើសរបស់យើង; ពេលមានកងជ្រើសហើយ ចុចដី/ដើមឈើ/ថ្ម/សត្រូវ = បញ្ជា · select ours; with units selected, tap the ground, a tree, a rock or an enemy to send them                                                           |
| ចុចពីរដង · Double tap              | ជ្រើសកងប្រភេទដូចគ្នាទាំងអស់នៅលើអេក្រង់ · every unit of that kind on screen                                                                                                                                          |
| អូសម្រាមដៃមួយ · Drag one finger    | រំកិលទិដ្ឋភាព · move the view                                                                                                                                                                                       |
| ញែកម្រាមដៃពីរ · Pinch              | ពង្រីក/បង្រួម · zoom                                                                                                                                                                                                |
| ចុចឱ្យយូរ · Hold                   | មើលព័ត៌មាន (អ្វីនៅទីនោះ ត្រូវការអ្វី) · the hint for what is there                                                                                                                                                  |
| ចុចឱ្យយូរ រួចអូស · Hold, then drag | ប្រអប់ជ្រើសច្រើន · a selection box                                                                                                                                                                                  |
| ☰                                 | ម៉ឺនុយ៖ ទំនេរ ទ័ព ផែនទី ប្រវត្តិ ល្បែងថ្មី អំពី សំឡេង · menu                                                                                                                                                        |
| ▼                                  | បង្រួមរបារបញ្ជា · fold the command bar                                                                                                                                                                              |
| ប៊ូតុង Back · Back button          | បិទផែនទី/ម៉ឺនុយ/កាត/ការជ្រើស ម្ដងមួយ; បើគ្មានអ្វីបើក ហ្គេមចូលផ្ទៃខាងក្រោយ (មិនបាត់) · closes the map, menu, card or selection one at a time; with nothing open the app goes to the background (the kingdom is kept) |

The game saves by itself (autosave) and when the phone switches away from it.

## ៥. ផ្នែកបច្ចេកទេស · Technical notes

- Wrapper: Capacitor 8.5 (`apps/android`, appId `com.sopheakpang.khmerkingdoms`, name នគរខ្មែរ). New dependency, reason: it packs the existing web game into an Android app without rewriting it.
- Page: `apps/game/mobile.html` → `src/mobile.ts`: only the Kingdom; `Kingdom(..., { mobile: true })` turns on touch (`kingdom/touch.ts`), the `k-mobile` layout (text ≥ 36 stage px, buttons ≥ 110 px, ☰ menu) and turns off the viewers' council. `setLandscapeWidth()` widens the 16:9 stage to the phone (1920–2560 × 1080). `config/quality.json` `mobile`: 75 % render size, no antialias, no shadows.
- Android: landscape only (`sensorLandscape`), immersive fullscreen, screen kept on, cut-out used, back button → `window.__kingdomBack()`; icon and splash drawn by `apps/android/tools/icons.py`.
- Credits: `config/credits.json` (About card, start screen, splash).
- Test in a browser: `npm run dev -w @temples/game`, then open `http://localhost:5173/mobile.html` with the browser's phone mode; e2e `KM-01`.
- Not verified here: the Gradle build itself (Google's Android downloads are blocked in the cloud workspace), so the first build happens on the PC.
