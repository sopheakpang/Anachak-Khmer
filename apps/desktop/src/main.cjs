'use strict';
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { windowSize, landscapeSize, pickDisplay } = require('./windowSize.cjs');

const root = path.resolve(__dirname, '../../..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/window.json'), 'utf8'));
const statePath = path.join(root, 'data/window-state.json');
const builtGame = path.join(root, 'apps/game/dist/index.html');

// Run on the GTX 1660 Super, allow the game's sound without a click,
// and keep rendering while LIVE Studio (not the game) has focus.
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(win) {
  try {
    const display = screen.getDisplayMatching(win.getBounds());
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({ displayId: display.id }));
  } catch (err) {
    console.error('[desktop] could not save window state', err);
  }
}

/** Quality preset for the game (config/window.json → ?preset=). */
function presetQuery() {
  const preset = ['low', 'high', 'lite'].includes(config.preset) ? config.preset : 'low';
  return `preset=${preset}`;
}

async function loadGame(win) {
  // Stream mode (--built): open the built game from disk, no dev server needed (saves RAM).
  if (process.argv.includes('--built')) {
    if (fs.existsSync(builtGame)) return win.loadFile(builtGame, { search: presetQuery() });
    console.error('[desktop] No build found. Run "npm run build" first.');
    return;
  }
  const url = process.env.TEMPLES_URL || config.url;
  try {
    await win.loadURL(`${url}${url.includes('?') ? '&' : '?'}${presetQuery()}`);
  } catch {
    if (fs.existsSync(builtGame)) {
      console.log(`[desktop] ${url} not reachable, opening the built game`);
      await win.loadFile(builtGame, { search: presetQuery() });
    } else {
      console.error(
        `[desktop] ${url} not reachable and no build found. Run "npm run dev" or "npm run build".`,
      );
    }
  }
}

function createWindow() {
  const display = pickDisplay(screen.getAllDisplays(), screen.getPrimaryDisplay().id, readState().displayId);
  const size = windowSize(display.workArea, config.contentHeight);
  const win = new BrowserWindow({
    title: config.title,
    x: display.workArea.x + Math.round((display.workArea.width - size.width) / 2),
    y: display.workArea.y,
    width: size.width,
    height: size.height,
    useContentSize: true,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    alwaysOnTop: Boolean(config.alwaysOnTop),
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  win.setMenu(null);
  // Keep a fixed title so LIVE Studio's capture source always finds the window.
  win.on('page-title-updated', (e) => e.preventDefault());
  win.on('close', () => saveState(win));
  // F11 toggles full screen (use it on the portrait monitor).
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') win.setFullScreen(!win.isFullScreen());
  });
  // The Kingdom tab is 16:9; Build and Expedition are 9:16 (D51). Resize and re-centre.
  ipcMain.on('temples:layout', (e, layout) => {
    if (e.sender !== win.webContents || win.isFullScreen()) return;
    const d = screen.getDisplayMatching(win.getBounds());
    const s =
      layout === 'landscape' ? landscapeSize(d.workArea) : windowSize(d.workArea, config.contentHeight);
    win.setContentSize(s.width, s.height);
    win.setPosition(
      d.workArea.x + Math.round((d.workArea.width - s.width) / 2),
      d.workArea.y + Math.round((d.workArea.height - s.height) / 2),
    );
  });
  void loadGame(win);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
