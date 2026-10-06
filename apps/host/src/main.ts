import '../../game/src/fonts.css';
import './style.css';
import {
  PORTS,
  type BridgeMessage,
  type BuilderSummary,
  type FeedLine,
  type GameState,
  type HostMessage,
} from '@temples/shared';
import {
  demoKind,
  dueEvents,
  makeEvent,
  pickUser,
  rng,
  roseCombo,
  TEST_GIFTS,
  TEST_USERS,
  type SimKind,
} from './events';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const bridgeUrl = new URLSearchParams(location.search).get('bridge') ?? `ws://localhost:${PORTS.bridgeWs}`;

// ---------- connection ----------
let ws: WebSocket | null = null;
let retry = 500;
function connect(): void {
  ws = new WebSocket(`${bridgeUrl}/?role=host`);
  ws.onopen = () => {
    retry = 500;
    setPill('pill-bridge', 'Bridge: connected', 'ok');
  };
  ws.onclose = () => {
    setPill('pill-bridge', 'Bridge: reconnecting…', 'warn');
    setTimeout(connect, retry);
    retry = Math.min(retry * 2, 5000);
  };
  ws.onmessage = (e) => onMessage(JSON.parse(String(e.data)) as BridgeMessage);
}
function send(m: HostMessage): void {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
}
function simulate(event: Record<string, unknown>): void {
  send({ kind: 'simulate', event });
}
function setPill(id: string, text: string, state?: string): void {
  const el = $(id);
  el.textContent = text;
  if (state) el.dataset.state = state;
}

// ---------- simulate ----------
const userSel = $<HTMLSelectElement>('user');
userSel.innerHTML =
  `<option value="random">Random viewer</option>` +
  TEST_USERS.map((u) => `<option value="${u.id}">${u.name} (@${u.handle})</option>`).join('');
const r = rng(Date.now());
const currentUser = () => TEST_USERS.find((u) => u.id === userSel.value) ?? pickUser(r);
const sim = (kind: SimKind) => simulate(makeEvent(kind, currentUser(), Date.now()));

$('gifts').innerHTML = TEST_GIFTS.map(
  (g, i) =>
    `<button data-gift="${i}">${g.name}<span class="coins">${g.coins.toLocaleString()}</span><kbd>${i + 1}</kbd></button>`,
).join('');

const actions: Record<string, () => void> = {
  like: () => sim({ type: 'like' }),
  tap15: () => sim({ type: 'like', count: 15 }),
  follow: () => sim({ type: 'follow' }),
  share: () => sim({ type: 'share' }),
  join: () => sim({ type: 'join' }),
  mystone: () => sim({ type: 'comment', text: '!mystone' }),
  combo: () => {
    const u = currentUser();
    roseCombo(12, u, Date.now()).forEach((e, i) => setTimeout(() => simulate(e), i * 80));
  },
};
document.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  if (b.dataset.sim) actions[b.dataset.sim]?.();
  if (b.dataset.guild) sim({ type: 'comment', text: b.dataset.guild });
  if (b.dataset.vote) sim({ type: 'comment', text: `!${b.dataset.vote}` });
  if (
    b.dataset.mode === 'build' ||
    b.dataset.mode === 'expedition' ||
    b.dataset.mode === 'kingdom' ||
    b.dataset.mode === 'anachak'
  ) {
    send({ kind: 'control', action: 'setMode', mode: b.dataset.mode });
    $('ctl-status').textContent =
      b.dataset.mode === 'expedition'
        ? 'Expedition: choose a hero in the game window'
        : b.dataset.mode === 'kingdom'
          ? 'Kingdom: play in the game window (mouse)'
          : b.dataset.mode === 'anachak'
            ? 'Anachak Khmer: play in the game window (mouse; 🎮 for 3D hero mode)'
            : 'Build mode';
  }
  const op = b.dataset.kingdom;
  if (op === 'save' || op === 'load' || op === 'new') {
    const difficulty = $<HTMLSelectElement>('kingdom-difficulty').value as
      'easy' | 'normal' | 'hard' | 'expert';
    if (op === 'new' && !confirm('Start a new Kingdom game? The current one stays in its autosave backups.'))
      return;
    send({ kind: 'control', action: 'kingdom', op, difficulty });
    $('ctl-status').textContent = `Kingdom: ${op}`;
  }
  if (b.dataset.gift) {
    const g = TEST_GIFTS[Number(b.dataset.gift)]!;
    sim({ type: 'gift', name: g.name, coins: g.coins });
  }
  if (b.dataset.user) $<HTMLInputElement>('remove-id').value = b.dataset.user;
});

// ---------- modes ----------
let demoTimer: number | undefined;
let stressTimer: number | undefined;
const modeStatus = $('mode-status');
function setToggle(id: string, on: boolean): void {
  $(id).setAttribute('aria-pressed', String(on));
}
function toggleDemo(): void {
  if (demoTimer) {
    clearInterval(demoTimer);
    demoTimer = undefined;
  } else {
    demoTimer = window.setInterval(() => simulate(makeEvent(demoKind(r), pickUser(r), Date.now())), 350);
  }
  setToggle('demo', Boolean(demoTimer));
  updateModeStatus();
}
function burst(): void {
  for (let i = 0; i < 100; i++) simulate(makeEvent(demoKind(r), pickUser(r), Date.now()));
  modeStatus.textContent = 'Sent a burst of 100 events';
}
function toggleStress(): void {
  if (stressTimer) {
    clearInterval(stressTimer);
    stressTimer = undefined;
  } else {
    const minutes = Math.max(1, Math.min(120, Number($<HTMLInputElement>('stress-min').value) || 10));
    const start = performance.now();
    let sent = 0;
    stressTimer = window.setInterval(() => {
      const elapsed = performance.now() - start;
      if (elapsed > minutes * 60_000) return toggleStress();
      const n = dueEvents(1000, elapsed, sent);
      for (let i = 0; i < n; i++) simulate(makeEvent(demoKind(r), pickUser(r), Date.now()));
      sent += n;
      modeStatus.textContent = `Stress: ${sent.toLocaleString()} events sent · ${(elapsed / 60_000).toFixed(1)} of ${minutes} min`;
    }, 50);
  }
  setToggle('stress', Boolean(stressTimer));
  if (!stressTimer) updateModeStatus();
}
function updateModeStatus(): void {
  modeStatus.textContent = demoTimer ? 'Demo viewers running (≈3 events/s)' : 'Idle';
}
$('demo').addEventListener('click', toggleDemo);
$('burst').addEventListener('click', burst);
$('stress').addEventListener('click', toggleStress);

// ---------- controls ----------
let paused = false;
let zones = false;
const ctlStatus = $('ctl-status');
$('pause').addEventListener('click', () => send({ kind: 'control', action: paused ? 'resume' : 'pause' }));
$('newstream').addEventListener('click', () => {
  send({ kind: 'control', action: 'newStream' });
  ctlStatus.textContent = 'New stream started: follow and guild limits reset.';
});
$('skip99').addEventListener('click', () => send({ kind: 'control', action: 'skipTo99' }));
$('zones').addEventListener('click', () => {
  zones = !zones;
  setToggle('zones', zones);
  send({ kind: 'control', action: 'safeZones', on: zones });
});
$('reset').addEventListener('click', () => ($('reset-confirm').hidden = false));
$('reset-no').addEventListener('click', () => ($('reset-confirm').hidden = true));
$('reset-yes').addEventListener('click', () => {
  send({ kind: 'control', action: 'resetTemple' });
  $('reset-confirm').hidden = true;
  ctlStatus.textContent = 'Temple reset to 0%.';
});
$('remove-btn').addEventListener('click', () => {
  const id = $<HTMLInputElement>('remove-id').value.trim();
  if (!id) {
    ctlStatus.textContent = 'Type or click a viewer id first.';
    return;
  }
  send({ kind: 'control', action: 'removeName', userId: id });
  ctlStatus.textContent = `Name removed for ${id}. It now shows as អ្នកសាងសង់.`;
});

// ---------- hotkeys ----------
document.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).closest('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey)
    return;
  const k = e.key.toLowerCase();
  const map: Record<string, () => void> = {
    l: actions.like!,
    t: actions.tap15!,
    f: actions.follow!,
    h: actions.share!,
    j: actions.join!,
    m: actions.mystone!,
    c: actions.combo!,
    d: toggleDemo,
    b: burst,
    p: () => $('pause').click(),
    z: () => $('zones').click(),
  };
  const gi = Number(k) - 1;
  if (gi >= 0 && gi < TEST_GIFTS.length) {
    const g = TEST_GIFTS[gi]!;
    sim({ type: 'gift', name: g.name, coins: g.coins });
  } else map[k]?.();
});

// ---------- live view ----------
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = (n: number) => n.toLocaleString('en-US');
const GUILD_NAMES: Record<string, string> = {
  '1': 'ជាងកាត់ថ្ម',
  '2': 'អ្នកថែដំរី',
  '3': 'អ្នកបើកក្បូន',
  '4': 'ជាងចម្លាក់',
};

function board(el: HTMLElement, list: BuilderSummary[]): void {
  el.innerHTML = list.length
    ? list
        .map(
          (b) =>
            `<li><button class="name" data-user="${esc(b.userId)}" title="${esc(b.userId)}">${esc(b.name)}</button>` +
            `<span class="rank">${esc(b.rankKm)}</span><span class="units">${fmt(b.units)}</span></li>`,
        )
        .join('')
    : '<li class="empty">No builders yet</li>';
}

function renderState(s: GameState): void {
  document
    .querySelectorAll<HTMLButtonElement>('[data-mode]')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === s.mode)));
  document
    .querySelectorAll<HTMLButtonElement>('[data-vote]')
    .forEach((b) => (b.disabled = s.mode === 'build'));
  document
    .querySelectorAll<HTMLButtonElement>('[data-kingdom]')
    .forEach((b) => (b.disabled = s.mode !== 'kingdom' && s.mode !== 'anachak'));
  const t = s.temple;
  const pct = Math.min(100, (t.progress / t.target) * 100);
  $('t-km').textContent = `${t.km} · ${t.en}`;
  $('t-meta').textContent = `Temple ${t.order} · ${t.year} · ${t.king}${t.completed ? ' · complete' : ''}`;
  $('t-fill').style.width = `${pct}%`;
  $('t-pct').textContent = `${pct.toFixed(pct < 10 ? 1 : 0)}%`;
  $('t-bar').setAttribute('aria-valuenow', pct.toFixed(0));
  $('t-prog').textContent = `${fmt(t.progress)} / ${fmt(t.target)}`;
  $('t-stock').textContent = fmt(t.stockpile);
  $('t-likes').textContent = fmt(s.likesToday);
  board($('top-temple'), s.topTemple);
  board($('top-today'), s.topToday);
  const max = Math.max(1, ...Object.values(s.guilds));
  $('guild-bars').innerHTML = (['1', '2', '3', '4'] as const)
    .map(
      (g) =>
        `<div class="gbar"><span class="gname">${g} · ${GUILD_NAMES[g]}</span>` +
        `<span class="gtrack"><span class="gfill" style="width:${(s.guilds[g] / max) * 100}%"></span></span>` +
        `<span class="units">${fmt(s.guilds[g])}</span></div>`,
    )
    .join('');
  paused = s.paused;
  $('pause').innerHTML = `${paused ? 'Resume game' : 'Pause game'} <kbd>P</kbd>`;
  $('pill-paused').hidden = !paused;
}

const feedEl = $('feed');
function addFeed(html: string, cls = ''): void {
  const li = document.createElement('li');
  li.className = cls;
  li.innerHTML = `<time>${new Date().toLocaleTimeString('en-GB')}</time>${html}`;
  feedEl.prepend(li);
  while (feedEl.children.length > 40) feedEl.lastElementChild?.remove();
}
function feedLine(f: FeedLine): void {
  const what =
    f.action === 'gift'
      ? `${esc(f.giftName ?? 'Gift')}${f.count > 1 ? ` ×${f.count}` : ''}`
      : f.action === 'like'
        ? `${f.count} likes`
        : f.action;
  addFeed(
    `<b>${esc(f.name)}</b> ${what} <span class="units">+${fmt(f.units)}</span>`,
    f.action === 'gift' ? 'gift' : '',
  );
}

function onMessage(m: BridgeMessage): void {
  switch (m.kind) {
    case 'state':
      renderState(m);
      break;
    case 'status':
      setPill(
        'pill-source',
        `Source: ${m.source} · ${m.connection}`,
        m.connection === 'connected' ? 'ok' : 'warn',
      );
      setPill(
        'pill-queue',
        `Queue ${fmt(m.queue)}${m.dropped ? ` · dropped ${fmt(m.dropped)}` : ''}`,
        m.dropped ? 'warn' : undefined,
      );
      break;
    case 'feed':
      feedLine(m);
      break;
    case 'stone':
      if (m.tier === 'large' || m.tier === 'huge')
        addFeed(
          `<b>${esc(m.name ?? '')}</b> ${m.tier} stone → temple +${fmt(m.applied)}, stockpile +${fmt(m.toStockpile)}`,
          'big',
        );
      break;
    case 'command':
      if (m.name === 'myStone') addFeed(`<b>${esc(m.displayName ?? '')}</b> asked to see their stone`, 'cmd');
      if (m.name === 'guildJoined')
        addFeed(`<b>${esc(m.displayName ?? '')}</b> joined guild ${m.guild}`, 'cmd');
      if (m.name === 'welcome') addFeed(`Welcome <b>${esc(m.displayName ?? '')}</b>`, 'cmd');
      break;
  }
}

connect();
