// hzOS shell: window manager, modes, apps, command line.
import {
  store, settings, saveSettings, links, pad, dayKey, hhmm, hourLabel, ago, isoWeek, spark, bar,
  currentQuote, fetchWeather, FEEDS, fetchFeed, getJSON,
} from "./data.js";
import { createMap, subsolar } from "./map.js";
import { PACK_NAMES, ROTATIONS, parseLine, formatLine, contextLabel, slotKey } from "./quotes.js";
import { snake, typer } from "./games.js";
import { bughunt } from "./fps.js";
import { viz, VIZ_MODES, VIZ_SOURCES } from "./viz.js";
import { backdrop, BG_THEMES } from "./backdrop.js";
import { cowsay, neofetch, eightBall, HACK, TRAIN, matrix, calc } from "./fun.js";
import { sniff, calcJoke, bump, heat, reaction, applyHeat, consoleBait } from "../assets/js/eggs.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) if (k != null && k !== false) n.append(k);
  return n;
};
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const small = () => matchMedia("(max-width: 900px)").matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const css = (name) => getComputedStyle(document.body).getPropertyValue(name).trim();
const VERSION = "2.9.0";
const bootedAt = Date.now();

/* =========================================================
   window manager: open/close, drag, resize, maximize
   ========================================================= */
const APPS = ["clock", "wx", "todo", "notes", "focus", "map", "fortune", "feed", "term", "viz", "noise", "game", "config"];
const FILES = { clock: "clock.app", wx: "wx.sh", todo: "todo.txt", notes: "notes.md", focus: "focus.exe", map: "world.map", fortune: "fortune", feed: "feed.rss", term: "term", viz: "viz.app", noise: "noise.app", game: "game.exe", config: "config.ini" };
const ALIAS = { world: "map", globe: "map", weather: "wx", settings: "config", news: "feed", quote: "fortune", timer: "focus", visualizer: "viz", audio: "viz", terminal: "term", shell: "term", sh: "term", cli: "term", sound: "noise", music: "noise", radio: "noise" };
const appName = (a) => (Object.hasOwn(ALIAS, a) ? ALIAS[a] : a);
// default layout as fractions of the desktop: x, y, w, h
const DEFAULT_LAYOUT = {
  clock:   [0.012, 0.025, 0.30, 0.40],
  wx:      [0.322, 0.025, 0.19, 0.40],
  map:     [0.522, 0.025, 0.245, 0.40],
  feed:    [0.777, 0.025, 0.211, 0.95],
  todo:    [0.012, 0.455, 0.215, 0.52],
  notes:   [0.237, 0.455, 0.20, 0.52],
  focus:   [0.447, 0.455, 0.32, 0.25],
  fortune: [0.447, 0.725, 0.32, 0.25],
  term:    [0.20, 0.30, 0.46, 0.55],
  viz:     [0.22, 0.08, 0.50, 0.62],
  noise:   [0.30, 0.06, 0.34, 0.80],
  game:    [0.30, 0.06, 0.40, 0.88],
  config:  [0.30, 0.10, 0.36, 0.78],
};
// tall screens (vertical monitors): two even columns, map full width
const PORTRAIT_LAYOUT = {
  clock:   [0.012, 0.012, 0.482, 0.17],
  wx:      [0.506, 0.012, 0.482, 0.17],
  map:     [0.012, 0.192, 0.976, 0.26],
  feed:    [0.012, 0.462, 0.482, 0.33],
  focus:   [0.506, 0.462, 0.482, 0.16],
  fortune: [0.506, 0.632, 0.482, 0.16],
  todo:    [0.012, 0.802, 0.482, 0.186],
  notes:   [0.506, 0.802, 0.482, 0.186],
  term:    [0.06, 0.55, 0.88, 0.38],
  viz:     [0.06, 0.14, 0.88, 0.45],
  noise:   [0.10, 0.08, 0.80, 0.62],
  game:    [0.06, 0.10, 0.88, 0.70],
  config:  [0.10, 0.12, 0.80, 0.62],
};
const MIN_W = 220, MIN_H = 130;
// each orientation keeps its own defaults and its own saved edits
const ORIENT = {
  landscape: { key: "layout.v2", defaults: DEFAULT_LAYOUT },
  portrait:  { key: "layout.portrait.v1", defaults: PORTRAIT_LAYOUT },
};
const orientation = () => (innerHeight > innerWidth ? "portrait" : "landscape");
let orient = orientation();
const loadLayout = (o) => Object.assign({}, ORIENT[o].defaults, store.get(ORIENT[o].key, {}));
const layout = loadLayout(orient);
const OPT_IN = ["config", "game", "viz", "noise", "term"]; // closed until asked for
const closed = new Set(store.get("closed.v2", OPT_IN));
if (!store.get("viz.known")) { closed.add("viz"); store.set("viz.known", true); store.set("closed.v2", [...closed]); }
if (!store.get("noise.known")) { closed.add("noise"); store.set("noise.known", true); store.set("closed.v2", [...closed]); }
if (!store.get("term.known")) { closed.add("term"); store.set("term.known", true); store.set("closed.v2", [...closed]); }
const desktop = $("#desktop");
const win = (app) => $(`.win[data-app="${app}"]`);
let zTop = 10;

function saveLayout() {
  const { key, defaults } = ORIENT[orient];
  store.set(key, Object.fromEntries(Object.entries(layout).filter(([k, v]) => v !== defaults[k])));
}
// swap to the other orientation's layout when the screen is rotated or resized across the line
function syncOrientation() {
  const o = orientation();
  if (o === orient) return;
  orient = o;
  for (const k of Object.keys(layout)) delete layout[k];
  Object.assign(layout, loadLayout(o));
}
const pct = (f) => `${f * 100}%`;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
function applyRect(el, [x, y, w, hh]) {
  if (small()) { el.style.left = el.style.top = el.style.width = el.style.height = ""; return; }
  Object.assign(el.style, { left: pct(x), top: pct(y), width: pct(w), height: pct(hh) });
}
const toFrac = (r, area) => [(r.left - area.left) / area.width, (r.top - area.top) / area.height, r.width / area.width, r.height / area.height];

/* ---------- tiling: dwm-style master + stack ---------- */
const GAP = 8; // px between tiles and snapped windows, and at the desktop edge
// every window tiles; opt-in apps (viz, game, config) join at the bottom of the stack
const TILE_ORDER = ["map", "clock", "feed", "todo", "notes", "wx", "focus", "fortune", "term", "viz", "noise", "game", "config"];
const tileable = (a) => APPS.includes(a);
const tileOrder = (() => {
  const saved = store.get("tile.order", TILE_ORDER).filter((a) => APPS.includes(a) && tileable(a));
  return [...new Set([...saved, ...APPS.filter(tileable)])];
})();
const tiling = () => settings.tile && !small();
// per-window float pin (i3 "floating toggle"): pinned windows leave the grid and float above it
const FLOAT_DEFAULT = ["config"];
const floats = new Set(store.get("float.v1", FLOAT_DEFAULT).filter((a) => APPS.includes(a)));
const isPinned = (a) => floats.has(a);
const tiledApps = () => tileOrder.filter((a) => !win(a).hidden && !isPinned(a));
const isTiled = (a) => tiling() && tileable(a) && !isPinned(a) && !win(a).hidden;
// floats stack above tiles; both layers keep their own click-to-front order
const FLOAT_LAYER = 5000;
const zFor = (a) => {
  if (zTop > FLOAT_LAYER - 500) { zTop = 10; restack(); } // keep tiles from climbing into the float layer
  return ++zTop + (tiling() && isPinned(a) ? FLOAT_LAYER : 0);
};
// unit-square cells: master gets mfact of the long axis, the stack splits into columns
// whose count keeps each cell close to 1.4:1 so eight windows still read
function tileCells(apps, W, H) {
  const out = {}, n = apps.length;
  if (!n) return out;
  if (n === 1) { out[apps[0]] = [0, 0, 1, 1]; return out; }
  const wide = W >= H, m = settings.mfact;
  out[apps[0]] = wide ? [0, 0, m, 1] : [0, 0, 1, m];
  const st = apps.slice(1), s = st.length;
  const [rx, ry, rw, rh] = wide ? [m, 0, 1 - m, 1] : [0, m, 1, 1 - m];
  let cols = 1, best = Infinity;
  for (let c = 1; c <= s; c++) {
    const d = Math.abs(Math.log(((rw * W) / c) / ((rh * H) / Math.ceil(s / c)) / 1.4));
    if (d < best) { best = d; cols = c; }
  }
  let i = 0;
  for (let c = 0; c < cols; c++) {
    const k = Math.floor(s / cols) + (c < s % cols ? 1 : 0);
    for (let r = 0; r < k; r++) out[st[i++]] = [rx + (rw * c) / cols, ry + (rh * r) / k, rw / cols, rh / k];
  }
  return out;
}
// inset a unit cell by the gap: a full gap at the desktop edge, half a gap on shared edges
function gapped([x, y, w, hh], { width: W, height: H }) {
  const e = 1e-6, half = GAP / 2;
  const l = x < e ? GAP : half, r = x + w > 1 - e ? GAP : half, t = y < e ? GAP : half, b = y + hh > 1 - e ? GAP : half;
  return [x + l / W, y + t / H, w - (l + r) / W, hh - (t + b) / H];
}
function flow() {
  if (reduce) return;
  desktop.classList.add("is-flowing");
  clearTimeout(flow.t);
  flow.t = setTimeout(() => desktop.classList.remove("is-flowing"), 400);
}
// place every window: tiles when tiling is on, saved float spots otherwise
function relayout(animate = false) {
  if (animate) flow();
  const area = desktop.getBoundingClientRect();
  const cells = tiling() ? tileCells(tiledApps(), area.width, area.height) : {};
  for (const a of APPS) {
    const el = win(a);
    el.classList.toggle("is-tiled", !!cells[a]);
    el.classList.toggle("is-float", tiling() && isPinned(a));
    applyRect(el, cells[a] ? gapped(cells[a], area) : layout[a]);
    syncFloatButton(a);
  }
}
function syncFloatButton(a) {
  const b = $("[data-float]", win(a));
  if (!b) return;
  const pinned = isPinned(a);
  b.setAttribute("aria-pressed", String(pinned));
  b.textContent = pinned ? "◱" : "▦";
  b.title = pinned ? "floating · click to tile (alt+shift+space)" : "tiled · click to float (alt+shift+space)";
  b.setAttribute("aria-label", `${pinned ? "Tile" : "Float"} ${FILES[a]}`);
}
// alt+shift+space: pin the window as floating, or send it back into the grid
function toggleFloat(app = $(".win.is-front")?.dataset.app, force) {
  app = appName(app || "");
  if (!APPS.includes(app) || small()) return false;
  const on = force ?? !isPinned(app);
  if (on) floats.add(app); else floats.delete(app);
  store.set("float.v1", [...floats]);
  win(app).classList.remove("is-max");
  relayout(true);
  front(app);
  renderDock();
  return on;
}
function swapTiles(a, b) {
  const i = tileOrder.indexOf(a), j = tileOrder.indexOf(b);
  if (i < 0 || j < 0 || i === j) return;
  [tileOrder[i], tileOrder[j]] = [tileOrder[j], tileOrder[i]];
  store.set("tile.order", tileOrder);
  relayout(true);
}
function setTile(on, { say = true } = {}) {
  settings.tile = !!on;
  saveSettings();
  syncLayoutChip();
  if (settings.tile) $$(".win.is-max").forEach((w) => isTiled(w.dataset.app) && w.classList.remove("is-max"));
  relayout(true);
  restack();
  renderDock();
  if (say) log(`tile: ${settings.tile ? "on · alt+shift+space float · alt+j/k focus · alt+enter master · alt+h/l split" : "off"}`, "ok");
}
function syncLayoutChip() {
  desktop.classList.toggle("is-tiled", !!settings.tile);
  const b = $("#layout-tile");
  b.setAttribute("aria-pressed", String(!!settings.tile));
  $(".chip__glyph", b).textContent = settings.tile ? "▦" : "◱";
  $(".chip__label", b).textContent = settings.tile ? "tile" : "float";
}
// re-apply z-order after the layer rules change (floats above tiles only while tiling)
function restack() {
  APPS.map((a) => win(a)).filter((el) => !el.hidden)
    .sort((x, y) => (+x.style.zIndex || 0) % FLOAT_LAYER - (+y.style.zIndex || 0) % FLOAT_LAYER)
    .forEach((el) => { el.style.zIndex = zFor(el.dataset.app); });
}
function nudgeSplit(d) {
  if (!tiling()) return false;
  settings.mfact = clamp(Math.round((settings.mfact + d) * 100) / 100, 0.2, 0.8);
  saveSettings();
  relayout(true);
  log(`tile: master ${Math.round(settings.mfact * 100)}%`);
  return true;
}
// alt+enter: focused tile becomes master; on the master it swaps with the first stack tile (dwm zoom)
function promote(app = $(".win.is-front")?.dataset.app) {
  if (!app) return;
  if (!isTiled(app)) { toggleMax(app); return; }
  const vis = tiledApps();
  const other = vis[0] === app ? vis[1] : vis[0];
  if (other) swapTiles(app, other);
}
function cycleFocus(d) {
  const open = (tiling() ? tiledApps() : APPS).filter((a) => !win(a).hidden);
  if (!open.length) return;
  const i = open.indexOf($(".win.is-front")?.dataset.app);
  const next = open[(i + d + open.length) % open.length];
  front(next);
  win(next).focus({ preventScroll: true });
}

/* ---------- edge snap (float mode) ---------- */
const EDGE = 12, CORNER = 64; // px from the desktop edge, measured at the cursor
const snapPrev = {}; // app -> size before it was snapped, restored when dragged away
// which zone the cursor is in: corners are quarters, sides are halves, top maximizes
function snapZone(x, y, { width: W, height: H }) {
  const L = x <= EDGE, R = x >= W - EDGE, T = y <= EDGE, B = y >= H - EDGE;
  const nearX = x < CORNER || x > W - CORNER, nearY = y < CORNER || y > H - CORNER;
  if (((L || R) && nearY) || ((T || B) && nearX)) return [x < W / 2 ? 0 : 0.5, y < H / 2 ? 0 : 0.5, 0.5, 0.5];
  if (L) return [0, 0, 0.5, 1];
  if (R) return [0.5, 0, 0.5, 1];
  if (T) return [0, 0, 1, 1];
  return null;
}
const ghost = h("div", { className: "snap-ghost" });
ghost.setAttribute("aria-hidden", "true");
desktop.append(ghost);
function showGhost(frac, from) {
  if (!frac) { ghost.classList.remove("is-on"); return; }
  if (!ghost.classList.contains("is-on")) {
    // grow out of the dragged window's frame, like GNOME's tile preview
    ghost.style.transition = "none";
    applyRect(ghost, from);
    void ghost.offsetWidth;
    ghost.style.transition = "";
    ghost.classList.add("is-on");
  }
  applyRect(ghost, frac);
}

// title-bar drag: free move, snap preview in float mode, swap target in tile mode, esc cancels
function startDrag(e, el, handle) {
  if (small() || e.button !== 0 || e.target.closest("button") || el.classList.contains("is-max")) return;
  e.preventDefault();
  const app = el.dataset.app;
  const area = desktop.getBoundingClientRect();
  const start = el.getBoundingClientRect();
  const orig = el.style.cssText;
  const tiled = isTiled(app);
  const prev = snapPrev[app];
  const off = { x: e.clientX - start.left, y: e.clientY - start.top };
  let w = start.width, moved = false, done = false, target = null;
  handle.setPointerCapture(e.pointerId);
  const move = (ev) => {
    if (!moved) {
      if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 4) return;
      moved = true;
      el.classList.add("is-dragging");
      ghost.style.zIndex = FLOAT_LAYER * 2;
      el.style.zIndex = FLOAT_LAYER * 2 + 1;
      if (prev && !tiled) { // unsnap: back to the old size, cursor keeps its spot across the title bar
        const pw = prev[2] * area.width;
        off.x = pw * (off.x / w); w = pw;
        el.style.width = pct(prev[2]); el.style.height = pct(prev[3]);
      }
    }
    const x = clamp(ev.clientX - off.x - area.left, -w + 80, area.width - 80);
    const y = clamp(ev.clientY - off.y - area.top, 0, area.height - 26);
    el.style.left = pct(x / area.width);
    el.style.top = pct(y / area.height);
    const px = ev.clientX - area.left, py = ev.clientY - area.top;
    if (tiled) {
      const cells = tileCells(tiledApps(), area.width, area.height);
      const fx = px / area.width, fy = py / area.height;
      const hit = Object.keys(cells).find((a) => { const [cx, cy, cw, ch] = cells[a]; return a !== app && fx >= cx && fx < cx + cw && fy >= cy && fy < cy + ch; });
      target = hit || null;
      showGhost(gapped(cells[hit || app], area), toFrac(el.getBoundingClientRect(), area));
    } else {
      const z = settings.snap ? snapZone(px, py, area) : null;
      target = z && gapped(z, area);
      showGhost(target, toFrac(el.getBoundingClientRect(), area));
    }
  };
  const key = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); end(true); } };
  const end = (cancel = false) => {
    if (done) return;
    done = true;
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", up);
    handle.removeEventListener("pointercancel", up);
    removeEventListener("keydown", key, true);
    try { handle.releasePointerCapture(e.pointerId); } catch {}
    el.classList.remove("is-dragging");
    ghost.classList.remove("is-on");
    if (!moved) return;
    el.style.zIndex = zFor(app);
    if (cancel) { el.style.cssText = orig; el.style.zIndex = zFor(app); return; }
    if (tiled) { flow(); target ? swapTiles(app, target) : relayout(true); return; }
    if (target) {
      snapPrev[app] = prev || toFrac(start, area);
      layout[app] = target;
      flow();
      applyRect(el, target);
    } else {
      delete snapPrev[app];
      layout[app] = toFrac(el.getBoundingClientRect(), area);
    }
    saveLayout();
  };
  const up = () => end();
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", up);
  handle.addEventListener("pointercancel", up);
  addEventListener("keydown", key, true);
}
function front(app) {
  $$(".win.is-front").forEach((w) => w.classList.remove("is-front"));
  const el = win(app);
  el.classList.add("is-front");
  el.style.zIndex = zFor(app);
  syncDock();
}
function openApp(app, { focus = true } = {}) {
  app = appName(app);
  if (!APPS.includes(app)) return false;
  if (document.body.dataset.mode !== "desktop") setMode("desktop");
  const el = win(app);
  const wasHidden = el.hidden;
  el.hidden = false;
  closed.delete(app);
  store.set("closed.v2", [...closed]);
  if (wasHidden && !reduce) { el.classList.remove("is-opening"); void el.offsetWidth; el.classList.add("is-opening"); }
  front(app);
  if (wasHidden && isTiled(app)) { // dwm-style: a newly opened window takes the master slot
    tileOrder.splice(tileOrder.indexOf(app), 1);
    tileOrder.unshift(app);
    store.set("tile.order", tileOrder);
    relayout(true);
  }
  if (app === "config") fillConfig();
  if (app === "viz") mountViz();
  if (app === "noise") mountNoise();
  if (app === "term") syncTermDock();
  if (focus) (el.querySelector("textarea, input, select") || el.querySelector(".win__ctrl button"))?.focus();
  renderDock();
  if (small()) el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  return true;
}
function closeApp(app) {
  app = appName(app);
  const el = win(app);
  if (!el) return false;
  el.hidden = true;
  el.classList.remove("is-max");
  closed.add(app);
  store.set("closed.v2", [...closed]);
  if (app === "game") stopGame();
  if (app === "viz") unmountViz();
  if (app === "noise") unmountNoise();
  if (app === "term") syncTermDock();
  if (tiling() && tileable(app)) relayout(true);
  renderDock();
  return true;
}
function toggleMax(app) {
  app = appName(app);
  const el = win(app);
  if (!el || small()) return false;
  if (el.hidden) openApp(app);
  el.classList.toggle("is-max");
  front(app);
  return true;
}
// taskbar: only windows that are open. click focuses, middle-click closes
function renderDock() {
  const open = APPS.filter((a) => !win(a).hidden);
  $("#dock").replaceChildren(...open.map((app) => {
    const b = h("button", { type: "button", className: "task", title: `${FILES[app]} · middle-click to close` });
    b.dataset.app = app;
    b.append(h("span", { className: "task__name", textContent: app === "game" ? ($("#game-title").textContent || "game").replace(/\.exe$/, "") : app }));
    if (tiling() && isPinned(app)) b.append(h("span", { className: "task__float", textContent: "◱", title: "floating" }));
    b.addEventListener("click", () => { openApp(app); win(app).focus({ preventScroll: true }); });
    b.addEventListener("auxclick", (e) => { if (e.button === 1) { e.preventDefault(); closeApp(app); } });
    return b;
  }));
  syncDock();
}
function syncDock() {
  const cur = $(".win.is-front")?.dataset.app;
  $$("#dock .task").forEach((b) => b.toggleAttribute("aria-current", b.dataset.app === cur));
}

/* ---------- menubar menus: ◆ hzOS · apps · view ---------- */
const APP_GROUPS = [
  ["desk", ["clock", "wx", "map", "fortune"]],
  ["work", ["todo", "notes", "focus", "feed", "term"]],
  ["media", ["viz", "noise"]],
];
const kbd = (t) => h("kbd", { className: "menu__kbd", textContent: t });
function menuItem(label, run, { role = "menuitem", checked, disabled, hint } = {}) {
  const b = h("button", { type: "button", className: "menu__item", disabled: !!disabled });
  b.setAttribute("role", role);
  if (checked != null) b.setAttribute("aria-checked", String(!!checked));
  b.append(h("span", { className: "menu__check", textContent: checked ? (role === "menuitemradio" ? "●" : "✓") : "" }), h("span", { className: "menu__label", textContent: label }));
  if (hint) b.append(kbd(hint));
  b.addEventListener("click", () => { closeMenus(); run(); });
  return b;
}
const menuSep = () => { const s = h("div", { className: "menu__sep" }); s.setAttribute("role", "separator"); return s; };
const menuHead = (t) => h("div", { className: "menu__head", textContent: t });
const MENUS = {
  sys: () => [
    menuItem("about hzOS", () => COMMANDS.neofetch()),
    menuItem("settings…", () => openApp("config")),
    menuItem("command line", () => focusCmd(), { hint: "/" }),
    menuItem(win("term").hidden ? "open terminal window" : "dock terminal", () => (win("term").hidden ? openApp("term") : closeApp("term"))),
    menuItem("help", () => COMMANDS.help()),
  ],
  apps: () => [
    ...APP_GROUPS.flatMap(([g, apps], i) => [
      ...(i ? [menuSep()] : []), menuHead(g),
      ...apps.map((a) => menuItem(FILES[a], () => (win(a).hidden ? openApp(a) : closeApp(a)), { role: "menuitemcheckbox", checked: !win(a).hidden })),
    ]),
    menuSep(), menuHead("games"),
    ...Object.entries(GAMES).map(([k, [, t]]) => menuItem(t, () => COMMANDS[k]())),
  ],
  view: () => {
    const cur = $(".win.is-front:not([hidden])")?.dataset.app;
    const wide = !small();
    return [
      menuHead("mode"),
      ...MODES.map((m, i) => menuItem(m, () => setMode(m), { role: "menuitemradio", checked: document.body.dataset.mode === m, hint: `⌥${i + 1}` })),
      menuSep(), menuHead("windows"),
      menuItem("tile windows", () => setTile(!settings.tile), { role: "menuitemcheckbox", checked: settings.tile, disabled: !wide, hint: "⌥T" }),
      menuItem(cur ? `float ${FILES[cur]}` : "float window", () => toggleFloat(cur), { role: "menuitemcheckbox", checked: cur && isPinned(cur), disabled: !cur || !tiling(), hint: "⌥⇧␣" }),
      menuItem("snap to edges", () => { settings.snap = !settings.snap; saveSettings(); }, { role: "menuitemcheckbox", checked: settings.snap, disabled: !wide }),
      menuSep(),
      menuItem("reset layout", () => { resetLayout(); log("layout: reset.", "ok"); }, { disabled: !wide }),
    ];
  },
};
let openMenu = null;
function closeMenus({ refocus = false } = {}) {
  if (!openMenu) return;
  const m = openMenu;
  openMenu = null;
  m.classList.remove("is-open");
  const t = $(".menu__trigger", m);
  t.setAttribute("aria-expanded", "false");
  if (refocus) t.focus();
}
function showMenu(m, { focusFirst = false } = {}) {
  if (openMenu === m) return;
  // keyboard opens and menu-to-menu scrubbing swap instantly; only a fresh pointer open eases in
  const instant = focusFirst || !!openMenu;
  closeMenus();
  $(".menu__panel", m).replaceChildren(...MENUS[m.dataset.menu]());
  m.classList.toggle("is-instant", instant);
  m.classList.add("is-open");
  $(".menu__trigger", m).setAttribute("aria-expanded", "true");
  openMenu = m;
  if (focusFirst) $(".menu__item:not(:disabled)", m)?.focus();
}
$$("#menus .menu").forEach((m) => {
  const t = $(".menu__trigger", m);
  t.addEventListener("click", (e) => (openMenu === m ? closeMenus() : showMenu(m, { focusFirst: e.detail === 0 })));
  t.addEventListener("pointerenter", () => { if (openMenu && openMenu !== m) showMenu(m); }); // menubar scrubbing
  t.addEventListener("keydown", (e) => { if (e.key === "ArrowDown") { e.preventDefault(); showMenu(m, { focusFirst: true }); } });
  m.addEventListener("keydown", (e) => {
    const items = $$(".menu__item:not(:disabled)", m);
    const i = items.indexOf(document.activeElement);
    const menus = $$("#menus .menu");
    const step = (d) => { const n = menus[(menus.indexOf(m) + d + menus.length) % menus.length]; showMenu(n, { focusFirst: true }); };
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenus({ refocus: true }); }
    else if (e.key === "ArrowDown" && i >= 0) { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === "ArrowUp" && i >= 0) { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === "ArrowRight" && openMenu) { e.preventDefault(); step(1); }
    else if (e.key === "ArrowLeft" && openMenu) { e.preventDefault(); step(-1); }
    else if (e.key === "Tab") closeMenus();
  });
});
addEventListener("pointerdown", (e) => { if (openMenu && !openMenu.contains(e.target)) closeMenus(); }, true);

function pointerTrack(handle, el, onMove, onEnd) {
  handle.addEventListener("pointerdown", (e) => {
    if (small() || e.button !== 0 || e.target.closest("button") || el.classList.contains("is-max") || el.classList.contains("is-tiled")) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const area = desktop.getBoundingClientRect();
    handle.setPointerCapture(e.pointerId);
    const move = (ev) => onMove(ev, e, rect, area);
    const up = () => {
      handle.removeEventListener("pointermove", move);
      onEnd(el.getBoundingClientRect(), area);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up, { once: true });
    handle.addEventListener("pointercancel", up, { once: true });
  });
}
function enableWindow(el) {
  const app = el.dataset.app;
  const bar = $(".win__bar", el);
  const grip = h("span", { className: "win__grip", title: "resize" });
  grip.setAttribute("aria-hidden", "true");
  el.append(grip);
  el.tabIndex = -1; // alt+j/k can focus the window itself
  const fb = h("button", { type: "button", className: "win__float" });
  fb.dataset.float = "";
  fb.addEventListener("click", () => toggleFloat(app));
  $(".win__ctrl", el).prepend(fb);
  syncFloatButton(app);
  const commit = (r, area) => {
    layout[app] = [(r.left - area.left) / area.width, (r.top - area.top) / area.height, r.width / area.width, r.height / area.height];
    saveLayout();
  };
  // move by title bar (snap / tile aware)
  bar.addEventListener("pointerdown", (e) => startDrag(e, el, bar));
  // resize by corner grip
  pointerTrack(grip, el, (ev, e0, rect, area) => {
    el.classList.add("is-resizing");
    const w = Math.min(Math.max(rect.width + ev.clientX - e0.clientX, MIN_W), area.right - rect.left);
    const hh = Math.min(Math.max(rect.height + ev.clientY - e0.clientY, MIN_H), area.bottom - rect.top);
    el.style.width = `${(w / area.width) * 100}%`;
    el.style.height = `${(hh / area.height) * 100}%`;
  }, (r, area) => { el.classList.remove("is-resizing"); delete snapPrev[app]; commit(r, area); });
  bar.addEventListener("dblclick", (e) => { if (!e.target.closest("button")) toggleMax(app); });
  el.addEventListener("pointerdown", () => front(app));
  el.addEventListener("focusin", () => front(app));
  $$("[data-close]", el).forEach((b) => b.addEventListener("click", () => closeApp(app)));
}
// put every window back to its default spot and reopen the default set
function resetLayout() {
  store.del(ORIENT[orient].key);
  Object.assign(layout, ORIENT[orient].defaults);
  for (const k of Object.keys(snapPrev)) delete snapPrev[k];
  settings.mfact = 0.55; saveSettings();
  floats.clear(); FLOAT_DEFAULT.forEach((a) => floats.add(a)); store.del("float.v1");
  APPS.forEach((a) => win(a).classList.remove("is-max"));
  APPS.filter((a) => !OPT_IN.includes(a)).forEach((a) => openApp(a, { focus: false }));
  // after reopening, since each reopened window would otherwise claim master
  tileOrder.sort((a, b) => (TILE_ORDER.indexOf(a) + 1 || 99) - (TILE_ORDER.indexOf(b) + 1 || 99));
  store.del("tile.order");
  relayout(true);
}
$("#layout-tile").addEventListener("click", () => setTile(!settings.tile));
// tiling keys (alt / option, matched by physical key so macOS option-characters don't get in the way)
addEventListener("keydown", (e) => {
  if (!e.altKey || e.ctrlKey || e.metaKey || small() || document.body.dataset.mode !== "desktop") return;
  if (document.activeElement?.tagName === "CANVAS") return;
  if (e.code === "Space" && e.shiftKey) {
    if (!tiling()) return;
    e.preventDefault();
    const a = $(".win.is-front")?.dataset.app;
    if (a) log(`${FILES[a]}: ${toggleFloat(a) ? "floating" : "tiled"}`);
    return;
  }
  const act = {
    KeyT: () => setTile(!settings.tile),
    KeyJ: () => cycleFocus(1), KeyK: () => cycleFocus(-1),
    Enter: () => promote(), NumpadEnter: () => promote(),
    KeyH: () => nudgeSplit(-0.05), KeyL: () => nudgeSplit(0.05),
  }[e.code];
  if (!act) return;
  e.preventDefault();
  act();
});

/* =========================================================
   modes: desktop · focus · zen
   ========================================================= */
const MODES = ["desktop", "focus", "zen"];
const stageBg = backdrop({ log }); // three.js / css background behind focus + zen
function setMode(mode) {
  if (!MODES.includes(mode)) return false;
  document.body.dataset.mode = mode;
  stageBg.setMode(mode);
  store.set("mode", mode);
  $("#stage-focus").hidden = mode !== "focus";
  $("#stage-zen").hidden = mode !== "zen";
  syncTermDock();
  $$(".modes [role=radio]").forEach((b) => { const on = b.dataset.mode === mode; b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1; });
  if (mode === "focus") { renderStageTask(); $("#stage-focus [data-focus-start]").focus(); }
  if (mode === "zen") renderZen();
  syncMini();
  if (mode !== "desktop" && !reduce && window.gsap && !document.hidden) {
    gsap.from(`#stage-${mode} > *:not(.nz-mini)`, { opacity: 0, y: 8, duration: 0.3, stagger: 0.05, ease: "power2.out", clearProps: "opacity,transform" });
  }
  return true;
}
$$("[data-mode-go]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.modeGo)));
// always-visible mode switch: click, or arrow keys inside the radio group
$$(".modes [role=radio]").forEach((b) => {
  b.addEventListener("click", () => setMode(b.dataset.mode));
  b.addEventListener("keydown", (e) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const next = MODES[(MODES.indexOf(document.body.dataset.mode) + d + MODES.length) % MODES.length];
    setMode(next);
    $(`.modes [data-mode="${next}"]`).focus();
  });
});
// alt+1/2/3 switch modes from anywhere, even while typing (alt+digit types nothing useful)
addEventListener("keydown", (e) => {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (e.code === "KeyN") { e.preventDefault(); loadNoise().then((ui) => ui.toggle(), (err) => log(`noise.app: ${err.message}`, "err")); return; }
  const m = { Digit1: "desktop", Digit2: "focus", Digit3: "zen" }[e.code];
  if (!m) return;
  e.preventDefault();
  setMode(m);
});

let stageTask = 0;
function renderStageTask() {
  const open = todos.filter((t) => !t.done);
  const el = $("#stage-task");
  if (!open.length) { el.textContent = "no open task. add one: t <task>"; return; }
  stageTask %= open.length;
  el.textContent = `working on: ${open[stageTask].text}`;
}
$("#stage-next-task").addEventListener("click", () => { stageTask++; renderStageTask(); });
function renderZen() {
  if (quote) $("#zen-quote").textContent = `${quote.text}  -- ${quote.by}`;
}

/* =========================================================
   clock.app + menubar
   ========================================================= */
let sun = null;
function greeting(hr) {
  if (hr < 5) return "still up";
  if (hr < 12) return "good morning";
  if (hr < 17) return "good afternoon";
  if (hr < 22) return "good evening";
  return "good night";
}
const fmtDay = (d) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(d).toLowerCase().replace(/,/g, "");
let lastMinute = -1;
let lastDay = dayKey();
function tick() {
  const now = new Date();
  $("#st-time").textContent = settings.h24 ? `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` : hhmm(now);
  $("#clock-s").textContent = pad(now.getSeconds());
  renderTimers();
  if (now.getMinutes() !== lastMinute) {
    lastMinute = now.getMinutes();
    const hrs = settings.h24 ? pad(now.getHours()) : String(now.getHours() % 12 || 12);
    const time = `${hrs}:${pad(now.getMinutes())}`;
    $("#clock").textContent = time;
    $("#zen-time").textContent = time;
    renderMapInfo();
    const slot = slotKey(settings.qRotation, now);
    if (slot && slot !== qSlot) { qSlot = slot; qSalt = 0; renderFortune(); }
    $("#clock").dateTime = now.toISOString();
    $("#hello").textContent = `${greeting(now.getHours())}, ${(settings.name || "friend").toLowerCase()}.`;
    const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5);
    const days = (new Date(now.getFullYear() + 1, 0, 1) - new Date(now.getFullYear(), 0, 1)) / 864e5;
    $("#clock-date").textContent = `${fmtDay(now)} · w${isoWeek(now)} · day ${doy}/${days}`;
    $("#zen-date").textContent = `${greeting(now.getHours())}, ${(settings.name || "friend").toLowerCase()} · ${fmtDay(now)}`;
    $("#st-date").textContent = fmtDay(now).split(" ").slice(0, 3).join(" ");
    const dayFrac = (now.getHours() * 60 + now.getMinutes()) / 1440;
    const yearFrac = doy / days;
    const lines = [
      `day  ${bar(dayFrac, 24)} <b>${Math.round(dayFrac * 100)}%</b>`,
      `year ${bar(yearFrac, 24)} <b>${Math.round(yearFrac * 100)}%</b>`,
    ];
    if (sun) {
      const toSet = sun.set - now, toRise = sun.rise - now;
      const fmtDur = (ms) => `${Math.floor(ms / 36e5)}h${pad(Math.floor((ms % 36e5) / 6e4))}m`;
      lines.push(`sun  ${hhmm(sun.rise)} ↑ ${hhmm(sun.set)} ↓ <b>${toRise > 0 ? `rises in ${fmtDur(toRise)}` : toSet > 0 ? `sets in ${fmtDur(toSet)}` : "down"}</b>`);
    }
    $("#clock-bars").innerHTML = lines.join("\n"); // only our own strings
    if (dayKey(now) !== lastDay) { lastDay = dayKey(now); renderFortune(); renderTodo(); renderFocusMeta(); }
  }
  setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
}

/* =========================================================
   wx.sh + world.map
   ========================================================= */
let worldMap = null;
async function loadWx(force = false) {
  const box = $("#wx");
  try {
    const w = await fetchWeather(force);
    sun = w.sun; lastMinute = -1;
    const temps = w.hourly.map((x) => x.temp);
    const rains = w.hourly.map((x) => x.rain);
    const hours = w.hourly.filter((_, i) => i % 6 === 0).map((x) => hourLabel(x.time).padEnd(6)).join("");
    const desc = h("span", { className: "wx__desc", textContent: `${w.desc}\nH${Math.round(w.max)}° L${Math.round(w.min)}°` });
    desc.style.whiteSpace = "pre";
    box.replaceChildren(
      h("p", { className: "prompt", textContent: `$ wx ${w.place.name.toLowerCase()}${w.stale ? " --offline" : ""}` }),
      h("div", { className: "wx__now" }, h("span", { className: "wx__temp", textContent: `${Math.round(w.temp)}°` }), desc),
      h("pre", { className: "wx__rows", innerHTML:
        `feels ${Math.round(w.feels)}° · hum ${Math.round(w.humidity)}% · wind ${Math.round(w.wind)}km/h\n` +
        `temp <b>${spark(temps)}</b> ${Math.round(Math.min(...temps))}-${Math.round(Math.max(...temps))}°\n` +
        `rain <b>${spark(rains, 0, 100)}</b> ${Math.max(...rains)}%\n` +
        `     ${hours}` }),
      h("p", { className: "wx__guess", textContent: `> ${w.guess}` }),
    );
    $("#st-wx").textContent = `wx:${Math.round(w.temp)}° ${w.rainy ? "rain" : w.desc.split(" ").pop()}`;
    worldMap?.setLocation(w.place.lat, w.place.lon);
    renderMapInfo(w);
    return w;
  } catch (err) {
    console.warn("wx", err);
    box.replaceChildren(h("p", { className: "prompt", textContent: "$ wx" }), h("p", { className: "dim", textContent: "error: weather unreachable. try `wx` again." }));
    return null;
  }
}

const fmtLat = (v) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? "N" : "S"}`;
const fmtLon = (v) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? "E" : "W"}`;
let lastPlace = null;
function renderMapInfo(w = lastPlace) {
  if (!w) return;
  lastPlace = w;
  const night = worldMap?.isNight(w.place.lat, w.place.lon);
  const s = subsolar();
  $("#map-info").replaceChildren(
    h("b", { textContent: `● ${w.place.name.toLowerCase()}` }), ` ${fmtLat(w.place.lat)} ${fmtLon(w.place.lon)} · ${night ? "night" : "day"} side\n`,
    `sun ↑${hhmm(w.sun.rise)} ↓${hhmm(w.sun.set)} · overhead at ${fmtLat(s.lat)} ${fmtLon(s.lon)}`,
  );
}

/* =========================================================
   todo.txt
   ========================================================= */
let todos = store.get("tasks", []);
function saveTodo() { store.set("tasks", todos); renderTodo(); }
function renderTodo() {
  const today = dayKey();
  todos = todos.filter((t) => !t.done || t.doneOn === today);
  const list = $("#todo");
  list.replaceChildren(...todos.map((t, i) => {
    const box = h("button", { type: "button", className: "box", textContent: t.done ? "[x]" : "[ ]" });
    box.setAttribute("role", "checkbox");
    box.setAttribute("aria-checked", String(!!t.done));
    box.setAttribute("aria-label", t.text);
    box.addEventListener("click", () => toggleTodo(i + 1));
    const rm = h("button", { type: "button", className: "rm", textContent: "rm" });
    rm.setAttribute("aria-label", `Remove ${t.text}`);
    rm.addEventListener("click", () => removeTodo(i + 1));
    return h("li", { className: t.done ? "done" : "" }, h("span", { className: "n", textContent: pad(i + 1) }), box, h("span", { className: "txt", textContent: t.text }), rm);
  }));
  if (!todos.length) list.append(h("li", { className: "dim", textContent: "empty. what's the one thing today?" }));
  const open = todos.filter((t) => !t.done).length;
  $("#todo-meta").textContent = todos.length ? `${open}/${todos.length} open` : "";
  if (document.body.dataset.mode === "focus") renderStageTask();
}
function addTodo(text) { todos.push({ id: Date.now(), text, done: false }); saveTodo(); }
function toggleTodo(n) { const t = todos[n - 1]; if (!t) return false; t.done = !t.done; t.doneOn = t.done ? dayKey() : null; saveTodo(); return t; }
function removeTodo(n) { const t = todos[n - 1]; if (!t) return false; todos.splice(n - 1, 1); saveTodo(); return t; }
$("#todo-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#todo-input").value.trim();
  if (v) { addTodo(v); $("#todo-input").value = ""; }
});

/* =========================================================
   notes.md
   ========================================================= */
const notesEl = $("#notes");
notesEl.value = store.get("notes", "");
let notesTimer = 0;
function notesMeta(saved = true) { $("#notes-meta").textContent = `${notesEl.value.length} ch${saved ? "" : " · …"}`; }
notesEl.addEventListener("input", () => {
  notesMeta(false);
  clearTimeout(notesTimer);
  notesTimer = setTimeout(() => { store.set("notes", notesEl.value); notesMeta(); }, 400);
});
function appendNote(text) {
  notesEl.value = (notesEl.value.replace(/\s*$/, "") + `\n- ${text}`).replace(/^\n/, "");
  store.set("notes", notesEl.value); notesMeta();
}

/* =========================================================
   focus.exe (shared by the window and focus mode)
   ========================================================= */
const focus = { minutes: 25, mode: "focus", remaining: 25 * 60e3, endAt: 0, running: false, timer: 0 };
const mmss = (ms) => { const s = Math.ceil(ms / 1000); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
function renderFocus() {
  const total = (focus.mode === "focus" ? focus.minutes : 5) * 60e3;
  const ms = focus.running ? Math.max(0, focus.endAt - Date.now()) : focus.remaining;
  for (const view of $$("[data-focus-view]")) {
    $("[data-focus-time]", view).textContent = mmss(ms);
    $("[data-focus-bar]", view).textContent = `${bar(1 - ms / total, view.classList.contains("focus--stage") ? 40 : 26)} ${focus.mode}`;
    view.classList.toggle("is-running", focus.running && focus.mode === "focus");
    view.classList.toggle("is-break", focus.mode === "break");
    $("[data-focus-start]", view).textContent = focus.running ? "pause" : ms < total ? "resume" : "start";
  }
  document.title = focus.running ? `${mmss(ms)} ${focus.mode} · hzOS` : "hzOS";
  $$(".focus__len .key").forEach((b) => (b.disabled = focus.running));
  return ms;
}
function renderFocusMeta() {
  const n = store.get("focus." + dayKey(), 0);
  $("#focus-meta").textContent = n ? "■".repeat(Math.min(n, 8)) + ` ${n}` : "0 today";
  $("#stage-sessions").textContent = `sessions today: ${n ? "■".repeat(Math.min(n, 12)) : "none yet"}`;
}
function chime(notes = [523, 659, 784]) {
  try {
    const ctx = new AudioContext();
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "square"; o.frequency.value = f;
      const t = ctx.currentTime + i * 0.12;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.2);
    });
  } catch {}
}
function focusLoop() {
  if (renderFocus() <= 0) {
    focus.running = false; chime();
    if (focus.mode === "focus") {
      store.set("focus." + dayKey(), store.get("focus." + dayKey(), 0) + 1);
      renderFocusMeta();
      focus.mode = "break"; focus.remaining = 5 * 60e3;
      log("focus.exe: session done. take 5.", "ok");
    } else { focus.mode = "focus"; focus.remaining = focus.minutes * 60e3; log("focus.exe: break over.", "ok"); }
    renderFocus();
    return;
  }
  focus.timer = setTimeout(focusLoop, 250);
}
function focusStart(min) {
  if (min) setLength(min);
  if (focus.running) return;
  focus.endAt = Date.now() + focus.remaining; focus.running = true; focusLoop();
}
function focusPause() {
  if (!focus.running) return;
  focus.remaining = Math.max(0, focus.endAt - Date.now()); focus.running = false; clearTimeout(focus.timer); renderFocus();
}
function focusReset() { clearTimeout(focus.timer); focus.running = false; focus.mode = "focus"; focus.remaining = focus.minutes * 60e3; renderFocus(); }
function setLength(min) {
  clearTimeout(focus.timer); focus.running = false;
  focus.minutes = min; focus.mode = "focus"; focus.remaining = min * 60e3;
  $$(".focus__len .key").forEach((b) => b.setAttribute("aria-checked", String(+b.dataset.min === min)));
  renderFocus();
}
$$("[data-focus-start]").forEach((b) => b.addEventListener("click", () => (focus.running ? focusPause() : focusStart())));
$$("[data-focus-reset]").forEach((b) => b.addEventListener("click", focusReset));
$$(".focus__len .key").forEach((b) => b.addEventListener("click", () => setLength(+b.dataset.min)));

/* =========================================================
   timers (timer 10m tea)
   ========================================================= */
let timers = [];
function parseDur(s) {
  const m = /^(\d+(?:\.\d+)?)(s|m|h)?$/i.exec(s || "");
  if (!m) return 0;
  return +m[1] * { s: 1e3, m: 6e4, h: 36e5 }[(m[2] || "m").toLowerCase()];
}
function renderTimers() {
  const now = Date.now();
  for (const t of timers.filter((x) => x.end <= now)) { chime([784, 659, 784, 659]); log(`timer: "${t.label}" is up!`, "ok"); }
  timers = timers.filter((x) => x.end > now);
  const el = $("#st-timer");
  if (!timers.length) { el.hidden = true; return; }
  const t = timers.reduce((a, b) => (a.end < b.end ? a : b));
  el.hidden = false;
  el.textContent = `${t.label} ${mmss(t.end - now)}${timers.length > 1 ? ` +${timers.length - 1}` : ""}`;
}

/* =========================================================
   fortune (quote engine lives in quotes.js)
   ========================================================= */
let quote = null, why = "", qSalt = 0, qSlot = slotKey(settings.qRotation, new Date());
function renderFortune(again = false) {
  const prev = quote?.text;
  let r = currentQuote(new Date(), again ? ++qSalt : qSalt);
  // "again" should actually change the quote when the pool allows it
  for (let i = 0; again && r.quote.text === prev && i < 6; i++) r = currentQuote(new Date(), ++qSalt);
  quote = r.quote; why = r.why;
  const el = $("#fortune-text");
  $("#fortune-by").textContent = `  -- ${quote.by}`;
  $("#fortune-ctx").textContent = settings.qMatch ? contextLabel(new Date()) : "";
  if (again && !reduce) typeOut(el, quote.text); else { clearInterval(el._t); el.textContent = quote.text; }
  renderZen();
}
function typeOut(el, text) {
  clearInterval(el._t);
  let i = 0;
  el.textContent = "";
  el._t = setInterval(() => { i += 2; el.textContent = text.slice(0, i); if (i >= text.length) clearInterval(el._t); }, 16);
}
$("#fortune-next").addEventListener("click", () => renderFortune(true));
// custom quotes live in settings.qCustom, one per line
const customLines = () => (settings.qCustom || "").split("\n").filter((l) => parseLine(l));

/* =========================================================
   feed.rss
   ========================================================= */
let feedSrc = store.get("newsTab", "hn");
async function loadFeed(src = feedSrc, force = false) {
  const list = $("#feed");
  if (!store.get("cache.news." + src)) list.replaceChildren(h("li", { className: "loading", textContent: `fetching ${src}… ▍` }));
  try {
    const { data, t, stale } = await fetchFeed(src, force);
    if (src !== feedSrc) return;
    list.replaceChildren(...data.map((it) => h("li", {}, h("a", { href: safeUrl(it.url), target: "_blank", rel: "noopener" },
      h("div", {}, h("strong", { textContent: it.title }), h("span", { textContent: it.meta, title: it.meta }))))));
    $("#feed-meta").textContent = (stale ? "offline · " : "") + ago(t);
  } catch (err) {
    console.warn("feed", err);
    if (src !== feedSrc) return;
    list.replaceChildren(h("li", { className: "empty", textContent: `error: ${src} unreachable. run \`news ${src}\` to retry.` }));
  }
}
const tabs = $$(".feed__tabs [role=tab]");
function selectFeed(src, { focusTab = false, force = false } = {}) {
  if (!FEEDS[src]) return false;
  feedSrc = src; store.set("newsTab", src);
  for (const b of tabs) { const on = b.dataset.src === src; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; if (on && focusTab) b.focus(); }
  $("#feed").setAttribute("aria-labelledby", `tab-${src}`);
  loadFeed(src, force);
  return true;
}
tabs.forEach((b, i) => {
  b.addEventListener("click", () => selectFeed(b.dataset.src));
  b.addEventListener("keydown", (e) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (d) { e.preventDefault(); selectFeed(tabs[(i + d + tabs.length) % tabs.length].dataset.src, { focusTab: true }); }
  });
});

/* =========================================================
   game.exe
   ========================================================= */
let game = null;
const GAMES = { snake: [snake, "snake.exe"], type: [typer, "type.exe"], fps: [bughunt, "bughunt.exe"] };
function startGame(name) {
  stopGame();
  const [fn, title] = GAMES[name];
  openApp("game", { focus: false });
  $("#game-title").textContent = title;
  renderDock();
  game = fn($("#game"), { setMeta: (m) => ($("#game-meta").textContent = m), log });
}
/* =========================================================
   viz.app (three.js is loaded only when the window opens)
   ========================================================= */
let vizApp = null;
function mountViz() { vizApp ??= viz($("#viz"), { setMeta: (m) => ($("#viz-meta").textContent = m), log }); return vizApp; }
function unmountViz() { vizApp?.stop(); vizApp = null; }
/* noise.app (its modules load on first open; Tone.js only when a genre plays) */
let noiseP = null, noiseWanted = false;
const loadNoise = () => (noiseP ??= import("./noise/ui.js").then((m) => { queueMicrotask(syncMini); return m.noiseUI; }, (e) => { noiseP = null; throw e; }));
// A saved noise.app selection (genre / station / layers) from a past visit, read from
// storage so the module need not load to know. noise/ui.js decides the same thing from
// its live state once loaded (hasSelection); this is only the "is it worth loading" check.
function noiseSaved() {
  const src = store.get("noise.src", null), saved = store.get("noise", null);
  const hasLayers = saved && typeof saved.layers === "object" && saved.layers && Object.keys(saved.layers).length > 0;
  return src === "music" || src === "radio" || !!hasLayers;
}
// mini player on the focus/zen stage; it decides itself whether there is anything to show.
// Entering focus/zen with a saved selection loads the module (silent: never autoplays).
function syncMini() {
  const mode = document.body.dataset.mode;
  const p = mode !== "desktop" && !noiseP && noiseSaved() ? loadNoise() : noiseP;
  p?.then((ui) => {
    if (document.body.dataset.mode !== mode) return;
    if (mode === "desktop") ui.unmountMini();
    else ui.mountMini($(`#stage-${mode}`), { onExpand: () => { setMode("desktop"); openApp("noise"); } });
  }, () => {});
}
// noise / radio / sleep commands: the module loads on first use (no sound until asked)
function noiseCmd(cmd, a) {
  return loadNoise().then((ui) => { for (const [text, cls = ""] of ui.run(cmd, a || "")) log(text, cls); }, (e) => log(`noise.app: ${e.message}`, "err"));
}
// boot: bring back the last selection (silent) so the mini player can show it. On the
// desktop nothing shows it until noise.app opens (or focus/zen starts, via syncMini),
// so the module isn't fetched there at all.
function noiseRestore() {
  if (document.body.dataset.mode !== "desktop") syncMini();
}
function mountNoise() {
  noiseWanted = true;
  loadNoise().then((ui) => { if (noiseWanted && !win("noise").hidden) ui.mount($("#noise")); }, (e) => log(`noise.app: ${e.message}`, "err"));
}
function unmountNoise() { noiseWanted = false; noiseP?.then((ui) => ui.unmount(), () => {}); }
function stopGame() { game?.stop(); game = null; $("#game").replaceChildren(); $("#game-meta").textContent = ""; }
let guess = null;

/* =========================================================
   themes + config.ini
   ========================================================= */
const THEMES = ["lime", "amber", "ice", "purple", "paper"];
function applyTheme(name) {
  if (!THEMES.includes(name)) return false;
  if (name === "lime") delete document.body.dataset.theme; else document.body.dataset.theme = name;
  settings.theme = name;
  $('meta[name="theme-color"]').content = css("--bg") || "#0a0c08";
  worldMap?.setColors();
  vizApp?.setColors();
  stageBg.setColors();
  return true;
}
const cfg = $("#config");
function fillConfig() {
  for (const [k, v] of Object.entries(settings)) {
    const f = cfg.elements[k];
    if (!f) continue;
    if (f.type === "checkbox") f.checked = !!v; else f.value = v;
  }
}
cfg.addEventListener("submit", (e) => {
  e.preventDefault();
  for (const k of Object.keys(settings)) {
    const f = cfg.elements[k];
    if (f) settings[k] = f.type === "checkbox" ? f.checked : f.value.trim();
  }
  saveSettings();
  applyTheme(settings.theme);
  setTile(settings.tile, { say: false });
  qSlot = slotKey(settings.qRotation, new Date()); qSalt = 0; renderFortune();
  closeApp("config");
  log("config.ini saved.", "ok");
  lastMinute = -1;
  loadWx(true);
});

/* =========================================================
   command line
   ========================================================= */
const out = $("#cmd-out");
const input = $("#cmd-input");
let outTimer = 0;
function log(content, cls = "") {
  const node = typeof content === "string" ? h("span", { className: cls, textContent: content }) : content;
  out.append(node);
  while (out.childElementCount > (termDocked ? 500 : 60)) out.firstElementChild.remove();
  out.scrollTop = out.scrollHeight;
  if (!termDocked) armOutTimer();
  return node;
}
function art(text) { return log(h("span", { className: "art", textContent: text })); }
function armOutTimer(ms = 15000) {
  clearTimeout(outTimer);
  if (termDocked) return; // the terminal window keeps its scrollback
  outTimer = setTimeout(function hide() {
    if (document.activeElement === input) { outTimer = setTimeout(hide, 4000); return; }
    out.replaceChildren();
  }, ms);
}
/* ---------- term window: the command line can live in the footer or in its own window ---------- */
let termDocked = false;
const cmdFooter = $("footer.cmd");
// in the window on wide screens in desktop mode; back in the footer otherwise (focus/zen, phones, closed)
function syncTermDock() {
  const want = !win("term").hidden && !small() && document.body.dataset.mode === "desktop";
  if (want === termDocked) return;
  const hadFocus = document.activeElement === input;
  termDocked = want;
  const home = want ? $("#term") : cmdFooter;
  home.append(out, $("#cmd-form"));
  document.body.classList.toggle("term-docked", want);
  $("#cmd-pop").textContent = want ? "⤓" : "⧉";
  $("#cmd-pop").title = want ? "dock to the bottom bar" : "open as a window";
  if (!want) armOutTimer();
  out.scrollTop = out.scrollHeight;
  relayout();
  if (hadFocus) input.focus();
}
function focusCmd() {
  if (termDocked) front("term");
  input.focus();
}
$("#cmd-pop").addEventListener("click", () => (win("term").hidden ? openApp("term") : closeApp("term")));

const history = store.get("history", []);
let hIdx = history.length;

const HELP = {
  todo:   "t <task> · done <n> · rm <n> · note <text> · cat todo.txt|notes.md",
  focus:  "f [min] · pause · reset · mode desktop|focus|zen · timer 10m [label] · timers",
  info:   "wx · news hn|dev|gh|world · define <word> · wiki <topic> · date · uptime",
  tools:  "= <math> · pass [len] · uuid · b64 <text> · unb64 <text> · g|yt|ddg|gh <query> · <link name>",
  quotes: "quote [now] · quote add <text> -- <author> @tags · quote ls · quote rm <n> · quote rotate visit|30m|hourly|daily · quote pack <name> on|off · quote match on|off · quote tags",
  fun:    "neofetch · cowsay <text> · fortune · joke · 8ball <q> · roll [2d6] · flip · hack · sl · matrix · coffee",
  games:  "snake · type · guess · fps (bughunt)",
  audio:  "viz [mic|sys|noise|off] · viz orb|terrain|pulsar",
  noise:  "noise (play/stop, alt+n) · noise <genre|preset> · noise <layer> [0-100] · noise off <layer> · noise bpm|dark|density|vol <n> · noise save <name> · noise list · radio [station|off] · sleep 30m|off",
  bg:     "bg [off|audio|drift|aurora|grid|scan|glow] [focus|zen] · bg orb|terrain|pulsar · bg mic|sys|noise|off · [ ] cycle on stage",
  system: "open|close|max <app> · ls · layout reset · tile [on|off] · float [app] [on|off] · snap on|off · theme lime|amber|ice|purple|paper · name|city <x> · 12h|24h · history · clear",
};
const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : "#"; } catch { return "#"; } }; // feed/calendar URLs are third-party data
const go = (url) => { location.href = safeUrl(url); };
const enc = encodeURIComponent;
const fmtUptime = (ms) => { const m = Math.floor(ms / 6e4); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`; };

const COMMANDS = {
  help: (a) => {
    if (a && Object.hasOwn(HELP, a)) return log(`${a.padEnd(7)}${HELP[a]}`);
    log(`hzOS ${VERSION} · commands (anything else searches the web)`, "ok");
    for (const [k, v] of Object.entries(HELP)) log(`${k.padEnd(7)}${v}`);
  },
  "?": (a) => COMMANDS.help(a),
  clear: () => out.replaceChildren(),
  cls: () => out.replaceChildren(),
  echo: (a) => log(a || ""),

  // todo + notes
  t: (a) => (a ? (addTodo(a), log(`todo: added #${todos.length}`, "ok")) : log("usage: t <task>", "err")),
  todo: (a) => COMMANDS.t(a),
  done: (a) => { const t = toggleTodo(+a); t ? log(`todo: ${t.done ? "done" : "reopened"} "${t.text}"`, "ok") : log("usage: done <n>", "err"); },
  x: (a) => COMMANDS.done(a),
  rm: (a) => {
    if (/^-rf?\b/.test(a || "")) return log("rm: permission denied. hzOS is read-only for chaos.", "err");
    const t = removeTodo(+a); t ? log(`todo: removed "${t.text}"`, "ok") : log("usage: rm <n>", "err");
  },
  note: (a) => (a ? (appendNote(a), log("notes.md: appended.", "ok")) : openApp("notes")),
  cat: (a) => {
    if (/todo/.test(a)) return todos.length ? todos.forEach((t, i) => log(`${pad(i + 1)} ${t.done ? "[x]" : "[ ]"} ${t.text}`)) : log("todo.txt is empty.");
    if (/notes/.test(a)) return log(notesEl.value || "notes.md is empty.");
    if (/config/.test(a)) return log(`name=${settings.name}\ncity=${settings.city}\ntheme=${settings.theme}\nclock=${settings.h24 ? "24h" : "12h"}\nquotes.rotate=${settings.qRotation}\nquotes.match=${settings.qMatch ? "on" : "off"}\nquotes.packs=${PACK_NAMES.filter((p) => settings["qp_" + p]).join(",") || "none"}\nquotes.custom=${customLines().length}`);
    log(`cat: ${a || "?"}: no such file. try: ls`, "err");
  },

  // focus + timers + modes
  f: (a) => { const m = +a || focus.minutes; focusStart(m); log(`focus.exe: ${m} min. go.`, "ok"); },
  focus: (a) => COMMANDS.f(a),
  pomodoro: (a) => COMMANDS.f(a),
  pause: () => { focusPause(); log("focus.exe: paused."); },
  stop: () => COMMANDS.pause(),
  reset: () => { focusReset(); log("focus.exe: reset."); },
  mode: (a) => (setMode(a || "desktop") ? log(`mode: ${a || "desktop"}`, "ok") : log("usage: mode desktop|focus|zen", "err")),
  zen: () => COMMANDS.mode("zen"),
  desktop: () => COMMANDS.mode("desktop"),
  exit: () => (document.body.dataset.mode !== "desktop" ? setMode("desktop") : log("there is no exit. you live here now.")),
  timer: (a) => {
    const [d, ...rest] = (a || "").split(/\s+/);
    const ms = parseDur(d);
    if (!ms) return log("usage: timer 10m [label] · units s, m, h", "err");
    const label = rest.join(" ") || d;
    timers.push({ end: Date.now() + ms, label });
    renderTimers();
    log(`timer: "${label}" set for ${d}.`, "ok");
  },
  timers: () => (timers.length ? timers.forEach((t) => log(`${t.label.padEnd(16)} ${mmss(t.end - Date.now())}`)) : log("no timers. try: timer 10m tea")),
  untimer: () => { timers = []; renderTimers(); log("timers cleared."); },

  // info
  wx: async () => { openApp("wx", { focus: false }); const w = await loadWx(true); if (w) log(`${w.place.name.toLowerCase()}: ${Math.round(w.temp)}° ${w.desc}. ${w.guess}`, "ok"); },
  weather: () => COMMANDS.wx(),
  news: (a) => (selectFeed(a || "hn", { force: true }) ? (openApp("feed", { focus: false }), log(`feed.rss: ${a || "hn"}`, "ok")) : log("usage: news hn|dev|gh|world", "err")),
  hn: () => COMMANDS.news("hn"), dev: () => COMMANDS.news("dev"), world: () => COMMANDS.news("world"),
  define: async (a) => {
    if (!a) return log("usage: define <word>", "err");
    try {
      const j = await getJSON(`https://en.wiktionary.org/api/rest_v1/page/definition/${enc(a.trim().toLowerCase())}`);
      const strip = (s) => new DOMParser().parseFromString(s, "text/html").body.textContent.trim();
      const senses = (j.en || []).flatMap((p) => p.definitions.filter((d) => d.definition).slice(0, 1).map((d) => [p.partOfSpeech, strip(d.definition)])).slice(0, 3);
      if (!senses.length) throw new Error("none");
      log(a.toLowerCase(), "ok");
      senses.forEach(([pos, d]) => log(`  ${pos.toLowerCase()}: ${d}`));
    } catch { log(`define: no entry for "${a}".`, "err"); }
  },
  wiki: async (a) => {
    if (!a) return log("usage: wiki <topic>", "err");
    try {
      const j = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${enc(a.replace(/ /g, "_"))}`);
      log(j.title, "ok");
      log(j.extract.length > 420 ? j.extract.slice(0, 420) + "…" : j.extract);
      if (j.content_urls?.desktop?.page) log(h("a", { href: safeUrl(j.content_urls.desktop.page), target: "_blank", rel: "noopener", textContent: "→ read on wikipedia" }));
    } catch { log(`wiki: nothing found for "${a}".`, "err"); }
  },
  date: () => log(new Date().toString()),
  uptime: () => log(`up ${fmtUptime(Date.now() - bootedAt)} · focus today: ${store.get("focus." + dayKey(), 0)} · tasks open: ${todos.filter((t) => !t.done).length}`),

  // tools
  "=": (a) => {
    const joke = calcJoke(a);
    if (joke) { for (const l of joke) log(l, "err"); return hackMeter(); }
    try { log(`= ${calc(a)}`, "ok"); } catch (e) { log(`calc: ${e.message}`, "err"); } },
  calc: (a) => COMMANDS["="](a),
  pass: (a) => {
    const n = Math.min(Math.max(+a || 20, 8), 64);
    const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*-_=+";
    const rnd = crypto.getRandomValues(new Uint32Array(n));
    const p = [...rnd].map((v) => chars[v % chars.length]).join("");
    log(p);
    navigator.clipboard?.writeText(p).then(() => log("pass: copied to clipboard.", "ok"), () => {});
  },
  uuid: () => { const u = crypto.randomUUID(); log(u); navigator.clipboard?.writeText(u).catch(() => {}); },
  b64: (a) => { try { log(btoa(unescape(enc(a || "")))); } catch { log("b64: could not encode.", "err"); } },
  unb64: (a) => { try { log(decodeURIComponent(escape(atob(a || "")))); } catch { log("unb64: not valid base64.", "err"); } },
  g: (a) => go(`https://www.google.com/search?q=${enc(a)}`),
  search: (a) => COMMANDS.g(a),
  yt: (a) => go(`https://www.youtube.com/results?search_query=${enc(a)}`),
  ddg: (a) => go(`https://duckduckgo.com/?q=${enc(a)}`),
  links: () => log(links().map((l) => l.name).join("  ") || "no links. add some in config."),

  // fun
  neofetch: () => {
    const ua = navigator.userAgent;
    const browser = /Edg\//.test(ua) ? "edge" : /Chrome\//.test(ua) ? "chrome" : /Firefox\//.test(ua) ? "firefox" : /Safari\//.test(ua) ? "safari" : "browser";
    art(neofetch({
      __title: `${(settings.name || "user").toLowerCase()}@hzos`,
      os: `hzOS ${VERSION}`, host: browser, resolution: `${screen.width}x${screen.height}`,
      uptime: fmtUptime(Date.now() - bootedAt), theme: settings.theme, tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      tasks: `${todos.filter((t) => !t.done).length} open`, focus: `${store.get("focus." + dayKey(), 0)} today`,
      snake: `best ${store.get("snake.best", 0)}`, typing: `best ${store.get("typer.best", 0)} wpm`, bughunt: `best ${store.get("fps.best", 0)}`,
    }));
  },
  cowsay: (a) => art(cowsay(a || quote?.text || "moo.")),
  fortune: () => { renderFortune(true); log(`${quote.text}  -- ${quote.by}`); },
  quote: (a) => quoteCmd(a),
  quotes: (a) => quoteCmd(a),
  joke: async () => {
    try { const j = await getJSON("https://icanhazdadjoke.com/", { headers: { Accept: "application/json" } }); log(j.joke); }
    catch { log("joke: the joke server is not laughing right now.", "err"); }
  },
  "8ball": (a) => log(a ? `8ball: ${eightBall()}` : "8ball: ask a question first.", a ? "ok" : "err"),
  roll: (a) => {
    const m = /^(\d*)d(\d+)$/i.exec(a || "d6");
    if (!m) return log("usage: roll 2d6", "err");
    const n = Math.min(+m[1] || 1, 20), sides = Math.max(2, Math.min(+m[2], 1000));
    const r = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * sides));
    log(`roll ${n}d${sides}: ${r.join(" + ")}${n > 1 ? ` = ${r.reduce((x, y) => x + y)}` : ""}`, "ok");
  },
  flip: () => log(`flip: ${Math.random() < 0.5 ? "heads" : "tails"}`, "ok"),
  hack: async () => {
    for (const l of HACK) { log(l, l.startsWith("access") ? "ok" : ""); await sleep(reduce ? 0 : 260); }
    log(heat() ? `real attempts this session: ${heat()}. last thing I said: "${reaction()}"` : "that was the pretend one. the real eggs need real attempts.", "dim");
  },
  sl: async () => {
    if (reduce) return art(TRAIN.join("\n"));
    const node = art("");
    const width = 70;
    for (let off = width; off > -TRAIN[0].length; off -= 2) {
      node.textContent = TRAIN.map((l) => (off >= 0 ? " ".repeat(off) + l : l.slice(-off))).map((l) => l.slice(0, width + 20)).join("\n");
      await sleep(35);
    }
    node.remove();
    log("choo choo. you meant `ls`.");
  },
  matrix: () => {
    const bg = css("--bg");
    const stop = matrix($("#matrix"), css("--lime"), /^#[0-9a-f]{6}$/i.test(bg) ? bg : "#0a0c08");
    if (!stop) return log("matrix: disabled with reduced motion.", "err");
    input.blur();
    const end = () => { stop(); removeEventListener("keydown", end, true); $("#matrix").removeEventListener("pointerdown", end); };
    setTimeout(() => { addEventListener("keydown", end, true); $("#matrix").addEventListener("pointerdown", end); }, 250);
  },
  sudo: () => { log(`${(settings.name || "user").toLowerCase()} is not in the sudoers file. this incident will be reported.`, "err"); hackMeter(); },
  whoami: () => log(`${(settings.name || "friend").toLowerCase()} @ hzOS ${VERSION}`),
  ping: async () => {
    const t = performance.now();
    try { await fetch("https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0&current=temperature_2m", { cache: "no-store" }); log(`pong · ${Math.round(performance.now() - t)}ms to open-meteo`, "ok"); }
    catch { log("ping: no route to host. are you offline?", "err"); }
  },
  coffee: () => art("   ( (\n    ) )\n  ........\n  |      |]\n  \\      /\n   `----'\nbrewing… done. drink some water too."),

  // games
  snake: () => { startGame("snake"); log("snake.exe: arrows/wasd, space to pause.", "ok"); },
  type: () => { startGame("type"); log("type.exe: type the quote. esc for a new one.", "ok"); },
  typing: () => COMMANDS.type(),
  fps: () => { startGame("fps"); log("bughunt.exe: click to lock the mouse. wasd move, mouse/arrows turn, space or click fires, m map.", "ok"); },
  bughunt: () => COMMANDS.fps(),
  viz: (a) => {
    a = (a || "").toLowerCase();
    if (a && !VIZ_SOURCES.includes(a) && !VIZ_MODES.includes(a)) return log(`usage: viz [${VIZ_SOURCES.join("|")}] · viz ${VIZ_MODES.join("|")}`, "err");
    openApp("viz", { focus: false });
    const v = mountViz();
    if (VIZ_MODES.includes(a)) { v.setMode(a); return log(`viz: ${a}`, "ok"); }
    if (a) return v.setSource(a);
    log("viz.app: pick mic or sys (chrome/edge: tick \"share audio\"). keys 1 2 3 switch scenes.", "ok");
  },
  visualizer: (a) => COMMANDS.viz(a),
  noise: (a) => noiseCmd("noise", a),
  radio: (a) => noiseCmd("radio", a),
  sleep: (a) => noiseCmd("sleep", a),
  bg: (a) => {
    const [x = "", where = ""] = (a || "").toLowerCase().split(/\s+/);
    const stage = ["focus", "zen"].includes(where) ? where : ["focus", "zen"].includes(document.body.dataset.mode) ? document.body.dataset.mode : null;
    if (!x) return log(`bg: focus=${stageBg.theme("focus")} zen=${stageBg.theme("zen")} scene=${stageBg.scene}`);
    if (BG_THEMES.includes(x)) {
      const m = stage || "zen";
      stageBg.setTheme(x, m);
      if (document.body.dataset.mode === "desktop") setMode(m);
      return log(`bg: ${m} → ${x}`, "ok");
    }
    if (VIZ_MODES.includes(x)) { stageBg.setScene(x); return log(`bg: audio scene → ${x}`, "ok"); }
    if (VIZ_SOURCES.includes(x)) {
      if (!stage) return log("bg: enter focus or zen first (mode zen), then pick a source.", "err");
      return stageBg.setSource(x);
    }
    log(`usage: ${HELP.bg}`, "err");
  },
  background: (a) => COMMANDS.bg(a),
  guess: (a) => {
    if (!guess || a === "new") { guess = { n: 1 + Math.floor(Math.random() * 100), tries: 0 }; return log("guess: i picked a number 1-100. type a number.", "ok"); }
    if (a) return guessTry(a);
    log("guess: type a number 1-100.");
  },

  // system
  open: (a) => (openApp(a) ? log(`open ${a}`, "ok") : log(`no app "${a}". try: ls`, "err")),
  close: (a) => (closeApp(a) ? log(`close ${a}`) : log(`no app "${a}"`, "err")),
  max: (a) => (toggleMax(a || $(".win.is-front")?.dataset.app) ? log(`max ${a || "front window"}`) : log("usage: max <app>", "err")),
  ls: () => log(APPS.map((a) => FILES[a] + (win(a).hidden ? "" : "*")).join("  ") + "\n(* = open)"),
  layout: (a) => (a === "reset" ? (resetLayout(), log("layout: reset.", "ok")) : log("usage: layout reset", "err")),
  tile: (a) => {
    if (small()) return log("tile: needs a wider screen", "err");
    if (!a || a === "toggle") return setTile(!settings.tile);
    if (a === "on" || a === "off") return setTile(a === "on");
    if (a === "master") return promote();
    log("usage: tile [on|off|master]", "err");
  },
  float: (a = "") => {
    if (small()) return log("float: needs a wider screen", "err");
    let [app, sw] = a.split(/\s+/);
    if (app === "on" || app === "off") [app, sw] = ["", app];
    app = appName(app || $(".win.is-front")?.dataset.app || "");
    if (!APPS.includes(app)) return log("usage: float [app] [on|off]", "err");
    const on = toggleFloat(app, sw ? sw === "on" : undefined);
    log(`${FILES[app]}: ${on ? "floating" : "tiles"}${tiling() ? "" : " (applies when tile is on)"}`, "ok");
  },
  snap: (a) => {
    if (a !== "on" && a !== "off") return log(`snap: ${settings.snap ? "on" : "off"} · usage: snap on|off`);
    settings.snap = a === "on"; saveSettings(); log(`snap: ${a}`, "ok");
  },
  theme: (a) => (applyTheme(a) ? (saveSettings(), log(`theme: ${a}`, "ok")) : log(`usage: theme ${THEMES.join("|")}`, "err")),
  config: () => openApp("config"), settings: () => openApp("config"),
  name: (a) => { if (!a) return log("usage: name <x>", "err"); settings.name = a; saveSettings(); lastMinute = -1; log(`hello, ${a.toLowerCase()}.`, "ok"); },
  city: (a) => { if (!a) return log("usage: city <x>", "err"); settings.city = a; saveSettings(); loadWx(true); log(`fallback city: ${a}`, "ok"); },
  "12h": () => { settings.h24 = false; saveSettings(); lastMinute = -1; log("clock: 12h", "ok"); },
  "24h": () => { settings.h24 = true; saveSettings(); lastMinute = -1; log("clock: 24h", "ok"); },
  history: () => history.slice(-12).forEach((l, i, arr) => log(`${String(history.length - arr.length + i + 1).padStart(4)}  ${l}`)),
  refresh: () => refreshAll(),
  reboot: () => { store.del("bootDay"); location.reload(); },
};
function guessTry(v) {
  const n = +v;
  if (!Number.isInteger(n) || n < 1 || n > 100) return log("guess: 1-100 please.", "err");
  guess.tries++;
  if (n === guess.n) {
    const best = store.get("guess.best", 0);
    const isBest = !best || guess.tries < best;
    if (isBest) store.set("guess.best", guess.tries);
    log(`guess: ${n} is right! ${guess.tries} tries${isBest ? " · new best" : ` · best ${best}`}.`, "ok");
    guess = null;
  } else log(`guess: ${n} is too ${n < guess.n ? "low" : "high"}.`);
}

function quoteCmd(a = "") {
  const [sub = "now", ...rest] = a.trim().split(/\s+/);
  const arg = rest.join(" ");
  const save = () => { saveSettings(); renderFortune(); };
  switch (sub) {
    case "now": case "":
      log(`${quote.text}  -- ${quote.by}`, "ok");
      log(`why: ${why}${quote.tags?.length ? ` · tags ${quote.tags.map((x) => "@" + x).join(" ")}` : ""} · source ${quote.source || "?"}`);
      return;
    case "add": {
      const q = parseLine(arg);
      if (!q || !/\s--\s/.test(arg)) return log("usage: quote add Ship it. -- Han @fri @evening", "err");
      settings.qCustom = [...customLines(), formatLine(q)].join("\n");
      qSalt = 0; save();
      return log(`quote: added #${customLines().length}${q.tags.length ? ` (shows ${q.tags.map((x) => "@" + x).join(" ")})` : " (any time)"}`, "ok");
    }
    case "ls": case "list": {
      const lines = customLines();
      if (!lines.length) return log("no custom quotes yet. quote add <text> -- <author> @tags");
      return lines.forEach((l, i) => log(`${pad(i + 1)}  ${l}`));
    }
    case "rm": {
      const lines = customLines();
      const n = +arg;
      if (!n || !lines[n - 1]) return log("usage: quote rm <n> · see quote ls", "err");
      const [gone] = lines.splice(n - 1, 1);
      settings.qCustom = lines.join("\n"); save();
      return log(`quote: removed "${parseLine(gone).text}"`, "ok");
    }
    case "rotate":
      if (!Object.hasOwn(ROTATIONS, arg)) return log(`usage: quote rotate ${Object.keys(ROTATIONS).join("|")} · now ${settings.qRotation}`, "err");
      settings.qRotation = arg; qSlot = slotKey(arg, new Date()); qSalt = 0; save();
      return log(`quote: rotates ${ROTATIONS[arg]}`, "ok");
    case "pack": {
      const [name, state] = rest;
      if (!PACK_NAMES.includes(name) || !["on", "off"].includes(state)) {
        return log(`packs: ${PACK_NAMES.map((p) => `${p}:${settings["qp_" + p] ? "on" : "off"}`).join("  ")} · quote pack <name> on|off`);
      }
      settings["qp_" + name] = state === "on"; save();
      return log(`quote: pack ${name} ${state}`, "ok");
    }
    case "match":
      if (!["on", "off"].includes(arg)) return log(`usage: quote match on|off · now ${settings.qMatch ? "on" : "off"}`, "err");
      settings.qMatch = arg === "on"; save();
      return log(`quote: time & day matching ${arg}`, "ok");
    case "tags":
      log("time   @morning @afternoon @evening @night");
      log("day    @mon @tue @wed @thu @fri @sat @sun @weekday @weekend");
      log("date   @12-25   hours  @9-12h (22-6h wraps midnight)");
      return log(`same group = or, different groups = and. right now: ${contextLabel(new Date())}`);
    default:
      log("usage: quote [now|add|ls|rm|rotate|pack|match|tags]", "err");
  }
}

/* ---------- easter eggs for hack attempts (../assets/js/eggs.js) ---------- */
// commands whose argument is the user's own text or a search: never hijacked by a joke
const TEXT_CMDS = new Set(["t", "todo", "note", "name", "city", "quote", "quotes", "b64", "unb64", "g", "search", "yt", "ddg", "gh", "define", "wiki"]);
function hackMeter() {
  const b = bump();
  log(b.line, "ok");
  if (b.maxed) log(h("a", { href: "/#contact", textContent: "→ hantunzaw.dev/#contact" }));
}
function hackJoke(egg, wasSearch) {
  for (const l of egg.lines) log(l, "err");
  hackMeter();
  if (wasSearch) log("(searching for it instead? use: g <query>)", "dim");
}
function hackWink() { log("stored safely as plain text 😉", "dim"); hackMeter(); }

function run(raw) {
  const line = raw.trim();
  if (!line) return;
  history.push(line); if (history.length > 100) history.shift(); store.set("history", history); hIdx = history.length;
  if (guess && /^\d+$/.test(line)) return guessTry(line);
  if (line.startsWith("=")) return COMMANDS["="](line.slice(1));
  const [cmd, ...rest] = line.split(/\s+/);
  const arg = rest.join(" ");
  const key = cmd.toLowerCase();
  const link = links().find((l) => l.name.toLowerCase() === line.toLowerCase());
  const egg = link ? null : sniff(line);
  if (egg && TEXT_CMDS.has(key)) { if (egg.kind === "xss") hackWink(); } // keep the text, plain as ever
  else if (egg) return hackJoke(egg, !Object.hasOwn(COMMANDS, key));
  if (key === "gh") return arg ? go(`https://github.com/search?q=${enc(arg)}`) : COMMANDS.news("gh");
  if (Object.hasOwn(COMMANDS, key)) return COMMANDS[key](arg);
  if (link) return go(link.url);
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(line)) return go(`https://${line}`);
  COMMANDS.g(line);
}
$("#cmd-form").addEventListener("submit", (e) => { e.preventDefault(); const v = input.value; input.value = ""; log(`$ ${v}`, "dim"); run(v); });
input.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp" && history.length) { e.preventDefault(); hIdx = Math.max(0, hIdx - 1); input.value = history[hIdx]; }
  else if (e.key === "ArrowDown") { e.preventDefault(); hIdx = Math.min(history.length, hIdx + 1); input.value = history[hIdx] || ""; }
  else if (e.key === "Tab" && input.value) {
    const [c, ...r] = input.value.split(" ");
    let pool, prefix = "";
    if (r.length === 0) pool = [...Object.keys(COMMANDS), ...links().map((l) => l.name)];
    else if (["open", "close", "max", "float"].includes(c)) { pool = APPS; prefix = c + " "; }
    else if (c === "theme") { pool = THEMES; prefix = c + " "; }
    else if (c === "mode") { pool = MODES; prefix = c + " "; }
    else if (c === "tile" || c === "snap") { pool = c === "tile" ? ["on", "off", "master"] : ["on", "off"]; prefix = c + " "; }
    else if (c === "news") { pool = Object.keys(FEEDS); prefix = c + " "; }
    else if (c === "viz") { pool = [...VIZ_SOURCES, ...VIZ_MODES]; prefix = c + " "; }
    else if (c === "help") { pool = Object.keys(HELP); prefix = c + " "; }
    else if (c === "quote" && r.length === 1) { pool = ["now", "add", "ls", "rm", "rotate", "pack", "match", "tags"]; prefix = c + " "; }
    else if (c === "quote" && r[0] === "rotate") { pool = Object.keys(ROTATIONS); prefix = "quote rotate "; r.shift(); }
    else if (c === "quote" && r[0] === "pack") { pool = PACK_NAMES; prefix = "quote pack "; r.shift(); }
    else if (["noise", "radio", "sleep"].includes(c) && (r.length === 1 || (c === "noise" && r.length === 2 && r[0] === "off"))) {
      // pools come from noise.app's own tables; the module loads on the first Tab
      e.preventDefault();
      const word = r[r.length - 1].toLowerCase(), pre = c + " " + (r.length === 2 ? r[0] + " " : "");
      const line = input.value;
      loadNoise().then((ui) => {
        if (input.value !== line) return;
        const hits = ui.completions(c, r.length === 2 ? r[0] : null).filter((p) => p.startsWith(word));
        if (hits.length === 1) input.value = pre + hits[0] + " ";
        else if (hits.length > 1) log(hits.join("  "));
      }, () => {});
      return;
    }
    if (!pool) return;
    const word = (r.length ? r.join(" ") : c).toLowerCase();
    const hits = pool.filter((p) => p.startsWith(word));
    e.preventDefault();
    if (hits.length === 1) input.value = prefix + hits[0] + " ";
    else if (hits.length > 1) log(hits.join("  "));
  } else if (e.key === "Escape") { input.blur(); if (!input.value && document.body.dataset.mode !== "desktop") setMode("desktop"); }
});
addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  const inGame = (game || vizApp) && document.activeElement?.tagName === "CANVAS";
  if (e.key === "/" && !typing && !inGame) { e.preventDefault(); focusCmd(); }
  if (e.key === "Escape" && !typing && document.body.dataset.mode !== "desktop") setMode("desktop");
});

/* =========================================================
   status + refresh
   ========================================================= */
function net() { const on = navigator.onLine, el = $("#st-net"); el.title = on ? "online" : "offline"; el.firstElementChild.textContent = el.title; el.classList.toggle("off", !on); }
addEventListener("online", net); addEventListener("offline", net);
async function refreshAll() {
  log("refreshing wx and feed…");
  await Promise.allSettled([loadWx(true), loadFeed(feedSrc, true)]);
  log("done.", "ok");
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) { loadWx(); loadFeed(); } });

/* =========================================================
   boot
   ========================================================= */
// arriving from the hzsh terminal (`hzos` command): always boot, starting from
// the dot the terminal's CRT power-off left behind
const handoff = (() => {
  const q = new URLSearchParams(location.search);
  if (q.get("via") !== "hzsh") return null;
  window.history.replaceState(null, "", location.pathname + location.hash);
  return { theme: q.get("theme") };
})();

async function boot() {
  const firstToday = store.get("bootDay") !== dayKey();
  store.set("bootDay", dayKey());
  if ((!firstToday && !handoff) || reduce || document.hidden) { document.documentElement.classList.remove("handoff"); return; }
  const el = $("#boot"), pre = $("#boot-log");
  el.hidden = false;
  if (handoff) await sleep(Math.max(0, 560 - performance.now())); // power-on started at first paint; let it open before text lands
  const lines = [
    ...(handoff ? ["handoff from hzsh (tty1) ...... ok"] : []),
    `hzOS ${VERSION} · build ${dayKey().replace(/-/g, "")}`,
    "cpu .................... ok",
    `mount /home/${(settings.name || "user").toLowerCase()} ........ ok`,
    "net: open-meteo hn dev gh wiki .. ok",
    "games: snake type guess fps ..... ok",
    "audio: viz (three.js, lazy) ..... ok",
    `todo: ${todos.filter((t) => !t.done).length} open · notes: ${notesEl.value.length} ch`,
    "",
    `${greeting(new Date().getHours())}, ${(settings.name || "friend").toLowerCase()}.`,
  ];
  let skip = false;
  const stop = () => { skip = true; };
  addEventListener("keydown", stop, { once: true });
  el.addEventListener("pointerdown", stop, { once: true });
  for (const l of lines) {
    if (skip) break;
    pre.textContent += l + "\n";
    await sleep(110);
  }
  if (!skip) await sleep(350);
  el.hidden = true;
  document.documentElement.classList.remove("handoff");
}

async function start() {
  applyHeat(); // red prompt if they already tried hacking this session
  consoleBait();
  // carry the terminal's phosphor over for visitors who haven't picked an hzOS theme
  const savedTheme = store.get("settings", {}).theme;
  applyTheme((!savedTheme && handoff?.theme && THEMES.includes(handoff.theme)) ? handoff.theme : settings.theme || "lime");
  APPS.forEach((app) => { enableWindow(win(app)); win(app).hidden = closed.has(app); });
  syncLayoutChip();
  syncTermDock();
  relayout();
  if (!win("viz").hidden) mountViz();
  if (!win("noise").hidden) mountNoise();
  noiseRestore();
  if (!win("game").hidden) closeApp("game"); // games don't resume across reloads
  addEventListener("resize", () => { syncOrientation(); syncTermDock(); relayout(); });
  renderDock();
  front("clock");
  net();
  renderTodo();
  notesMeta();
  renderFocus(); renderFocusMeta();
  renderFortune();
  tick();
  selectFeed(feedSrc);
  setMode(store.get("mode", "desktop"));
  worldMap = createMap($("#map"), $("#map-pin"));
  loadWx();

  await boot();
  if (window.gsap && !reduce && !document.hidden && !small() && document.body.dataset.mode === "desktop") {
    gsap.from($$(".win:not([hidden])"), { opacity: 0, y: 10, duration: 0.35, stagger: 0.04, ease: "power2.out", clearProps: "opacity,transform" });
  }
  log("hzOS ready. type `help`.", "ok");
  armOutTimer(4000);
}
start();
