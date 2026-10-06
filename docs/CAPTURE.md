# Capture test — TikTok LIVE Studio (prompt 02 gate)

Goal: find the setup that looks sharpest on a phone while holding **30 FPS** and keeping **total RAM ≤ 7.2 GB** on the stream PC (Vivobook i5-1135G7, 8 GB RAM, GTX 1660 Super eGPU). No OBS.

Do this as a **private test LIVE** (or LIVE Studio preview) before any real stream.

## 0. One-time setup (all options)

1. Install **Node.js 20 or newer** (nodejs.org, LTS) and **Git**.
2. In the project folder, run once: `npm install`
3. Windows **Settings → System → Display → Graphics**: add these apps and set each to **High performance (NVIDIA GeForce GTX 1660 Super)**:
   - `node_modules\electron\dist\electron.exe` (inside the project folder)
   - TikTok LIVE Studio
4. In TikTok LIVE Studio **Settings → Video**: encoder **NVIDIA NVENC** (hardware), **30 FPS**, resolution per your upload speed (1080p if upload ≥ 6 Mbps, else 720p).
5. Close Chrome, games and other heavy apps. Plug in the charger. Use a LAN cable if you can.

## 1. Start the game

Open two terminals in the project folder:

```
npm run dev        # terminal 1: game, bridge and host panel
npm run desktop    # terminal 2: the game window "The Temples"
```

- **F3** shows or hides the meter (FPS, frame time, memory, draw calls).
- **F11** toggles full screen.
- The font test panel has a **Test tone 440 Hz** button to check that the game's sound reaches LIVE Studio.
- Add `?panel=0` to the URL in `config/window.json` to hide the test panel later.

## 2. Try each option

### Option A — portrait monitor on the eGPU (sharpest, recommended)

1. Plug the monitor into the **GTX 1660 Super's own port**.
2. Windows **Display settings** → select that monitor → **Display orientation: Portrait**, resolution **1080 × 1920**.
3. Drag the game window onto that monitor, press **F11**. (It reopens there next time.)
4. LIVE Studio: **Vertical** layout → **Add source → Game Capture** (or **Window Capture** if Game Capture shows black) → choose **The Temples**. It should fill the canvas exactly.

### Option B — game window on the laptop screen

1. Leave the window on the laptop screen (about 585 × 1040).
2. LIVE Studio: **Vertical** layout → **Add source → Game Capture** → **The Temples** → drag the corners to fill the canvas.
3. Expect a softer picture: it is stretched from about 585 × 1040 up to 1080 × 1920.

### Option C — Link source (no game window)

1. Close the game window (keep `npm run dev` running).
2. LIVE Studio: **Add source → Link** → `http://localhost:5173` → custom size **1080 × 1920**.
3. Guides warn Link sources use more memory; measure it.

## 3. For every option, also add

- **Camera** source (face cam) as a circle, left side, around 900–1250 px from the top (spec: Screen layout).
- **Microphone** in LIVE Studio.
- Press **Test tone** in the game: you must hear it in LIVE Studio's audio meter.

## 4. Measure and fill in

Run each option for **10 minutes** with the face cam on. Read FPS from the game meter (F3), dropped frames from LIVE Studio, RAM/CPU/GPU from Task Manager (Performance tab), and judge sharpness on your phone watching the test LIVE.

| Option               | Game FPS | LIVE Studio dropped frames | Total RAM used (GB) | CPU % | GPU % (1660 Super) | Sharp on phone (1–5) | Test tone heard? |
| -------------------- | -------- | -------------------------- | ------------------- | ----- | ------------------ | -------------------- | ---------------- |
| A — portrait monitor |          |                            |                     |       |                    |                      |                  |
| B — laptop screen    |          |                            |                     |       |                    |                      |                  |
| C — Link source      |          |                            |                     |       |                    |                      |                  |

**Pass:** 30 FPS steady, total RAM ≤ 7.2 GB, no dropped-frame warnings, tone heard, sharpness ≥ 4.

## 5. Checklist (AC-22)

- [ ] Whole 9:16 game visible in the vertical stream, no black bars, nothing cropped
- [ ] Sharp enough to read the carved names on a phone
- [ ] Face cam and mic work; game sound heard
- [ ] Game keeps running smoothly while LIVE Studio (not the game) is the focused window
- [ ] Chosen option: ____

If **no option passes**, stop and report the table: the next step is lighter settings (lower render size, fewer effects) or the RAM upgrade before prompt 03.
