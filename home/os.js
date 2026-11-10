// hzOS shell: window manager, modes, apps, command line.
import {
  store, settings, saveSettings, resetSettings, links, pad, dayKey, hhmm, hourLabel, ago, isoWeek, spark, bar,
  currentQuote, fetchWeather, FEEDS, fetchFeed, getJSON,
} from "./data.js";
import { createMap, subsolar } from "./map.js";
import { PACK_NAMES, ROTATIONS, parseLine, formatLine, contextLabel, slotKey } from "./quotes.js";
import { snake, typer } from "./games.js";
import { bughunt } from "./fps.js";
import { viz, VIZ_MODES, VIZ_SOURCES } from "./viz.js";
import { backdrop, BG_THEMES } from "./backdrop.js";
import { cowsay, neofetch, eightBall, HACK, TRAIN, matrix, calc } from "./fun.js";
import { icon, hydrateIcons } from "./icons.js";
import { sniff, calcJoke, bump, heat, reaction, applyHeat, consoleBait } from "../assets/js/eggs.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) if (k != null && k !== false) n.append(k);
  return n;
};
const osReduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
// motion setting: "auto" follows the OS, "full"/"reduced" override it
const calcReduce = () => settings.motion === "reduced" || (settings.motion !== "full" && osReduce);
let reduce = calcReduce();
const small = () => matchMedia("(max-width: 900px)").matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const css = (name) => getComputedStyle(document.body).getPropertyValue(name).trim();
const VERSION = "2.10.0";
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
  config:  [0.27, 0.07, 0.44, 0.84],
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
  config:  [0.06, 0.10, 0.88, 0.66],
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
// px between tiles and snapped windows, and at the desktop edge (config: windows > gap)
const gapPx = () => clamp(+settings.gap || 0, 0, 24);
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
// tile layouts: bento (weighted treemap, mixed tile sizes) or master (dwm master + stack)
const TILE_LAYOUTS = ["bento", "master"]; // what alt+space cycles through
// a preset can pin a fixed arrangement: columns left to right, each a stack of rows
// { name, cols: [{ w, rows: [[app, weight], ...] }, ...] }
const validGroups = (g) => g && typeof g.name === "string" && Array.isArray(g.cols) && g.cols.every((c) => Array.isArray(c.rows));
let tileGroups = validGroups(store.get("tile.groups")) ? store.get("tile.groups") : null;
const tileLayout = () => (settings.tileLayout === "columns" && tileGroups ? "columns" : TILE_LAYOUTS.includes(settings.tileLayout) ? settings.tileLayout : "bento");
const layoutLabel = () => (tileLayout() === "columns" ? tileGroups.name : tileLayout());
// master + stack: master gets mfact of the long axis, the stack splits into columns
// whose count keeps each cell close to 1.4:1 so eight windows still read
function masterGeom(apps, W, H) {
  const cells = {}, seams = [], n = apps.length;
  if (n === 1) { cells[apps[0]] = [0, 0, 1, 1]; return { cells, seams }; }
  const wide = W >= H, m = settings.mfact;
  cells[apps[0]] = wide ? [0, 0, m, 1] : [0, 0, 1, m];
  seams.push({ key: "mfact", axis: wide ? "x" : "y", node: [0, 0, 1, 1], ratio: m });
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
    for (let r = 0; r < k; r++) cells[st[i++]] = [rx + (rw * c) / cols, ry + (rh * r) / k, rw / cols, rh / k];
  }
  return { cells, seams };
}
// how much room each app wants in a bento: content-heavy windows get the big tiles
const BENTO_WEIGHT = { map: 3, game: 2.6, viz: 2.4, feed: 2.2, term: 2, noise: 1.7, clock: 1.6, config: 1.6, notes: 1.5, todo: 1.3, focus: 1, wx: 1, fortune: 0.85 };
const HERO = 1.5; // the first window in tile order (alt+enter) is the hero tile
// dragged seam ratios, keyed by the subtree's apps + where it was cut, so a different
// window set falls back to the automatic split instead of inheriting a stale one
const splits = store.get("tile.splits", {});
const saveSplits = () => {
  const ks = Object.keys(splits);
  if (ks.length > 80) ks.slice(0, ks.length - 80).forEach((k) => delete splits[k]);
  store.set("tile.splits", splits);
};
// bento: split the ordered list in two where the weights balance best, cut across the
// longer side (in pixels), recurse. no holes, no overlaps, deterministic for any count.
function bentoGeom(apps, W, H) {
  const cells = {}, seams = [];
  const items = apps.map((a, i) => ({ a, w: (BENTO_WEIGHT[a] || 1) * (i === 0 ? HERO : 1) }));
  // how far a box (px) holding m windows is from m comfortable ~1.45:1 tiles
  const misfit = (pw, ph, m) => {
    let best = Infinity;
    for (let c = 1; c <= m; c++) best = Math.min(best, Math.abs(Math.log((pw / c) / (ph / Math.ceil(m / c)) / 1.45)));
    return best * m;
  };
  const go = (list, x, y, w, h) => {
    if (list.length === 1) { cells[list[0].a] = [x, y, w, h]; return; }
    const total = list.reduce((s, it) => s + it.w, 0);
    // try every ordered cut on both axes; keep the one whose halves tile most comfortably
    let k = 1, acc = 0, axis = "x", best = Infinity, run = 0;
    for (let j = 1; j < list.length; j++) {
      run += list[j - 1].w;
      const f = run / total;
      for (const ax of ["x", "y"]) {
        const [aw, ah, bw, bh] = ax === "x" ? [w * W * f, h * H, w * W * (1 - f), h * H] : [w * W, h * H * f, w * W, h * H * (1 - f)];
        const score = misfit(aw, ah, j) + misfit(bw, bh, list.length - j) + (ax === (w * W >= h * H ? "x" : "y") ? 0 : 0.15);
        if (score < best - 1e-9) { best = score; k = j; acc = run; axis = ax; }
      }
    }
    const key = `${list.map((it) => it.a).join(",")}/${k}${axis}`;
    const r = clamp(splits[key] ?? acc / total, 0.12, 0.88);
    seams.push({ key, axis, node: [x, y, w, h], ratio: r });
    const A = list.slice(0, k), B = list.slice(k);
    if (axis === "x") { go(A, x, y, w * r, h); go(B, x + w * r, y, w * (1 - r), h); }
    else { go(A, x, y, w, h * r); go(B, x, y + h * r, w, h * (1 - r)); }
  };
  if (items.length) go(items, 0, 0, 1, 1);
  return { cells, seams };
}
// fixed columns: the preset's columns in order, rows stacked inside each. windows the
// preset doesn't name stack into one extra column on the right. closed ones drop out.
function columnsGeom(apps, W, H) {
  const cells = {}, seams = [], set = new Set(apps);
  const cols = tileGroups.cols
    .map((c) => ({ w: +c.w || 1, rows: c.rows.filter(([a]) => set.has(a)).map(([a, wt]) => ({ a, w: +wt || 1 })) }))
    .filter((c) => c.rows.length);
  const named = new Set(cols.flatMap((c) => c.rows.map((r) => r.a)));
  const extra = apps.filter((a) => !named.has(a));
  if (extra.length) cols.push({ w: 0.22, rows: extra.map((a) => ({ a, w: 1 })) });
  // peel the first item off the rest, so every boundary is its own draggable seam
  const peel = (list, x, y, w, h, axis, id, leaf) => {
    if (list.length === 1) return leaf(list[0], x, y, w, h);
    const total = list.reduce((t, it) => t + it.w, 0);
    const key = `c:${tileGroups.name}:${id(list)}`;
    const r = clamp(splits[key] ?? list[0].w / total, 0.08, 0.92);
    seams.push({ key, axis, node: [x, y, w, h], ratio: r });
    if (axis === "x") { leaf(list[0], x, y, w * r, h); peel(list.slice(1), x + w * r, y, w * (1 - r), h, axis, id, leaf); }
    else { leaf(list[0], x, y, w, h * r); peel(list.slice(1), x, y + h * r, w, h * (1 - r), axis, id, leaf); }
  };
  const colId = (l) => l.map((c) => c.rows.map((r) => r.a).join("+")).join("|");
  peel(cols, 0, 0, 1, 1, "x", colId, (c, x, y, w, h) =>
    peel(c.rows, x, y, w, h, "y", (l) => l.map((r) => r.a).join("+"), (r, rx, ry, rw, rh) => { cells[r.a] = [rx, ry, rw, rh]; }));
  return { cells, seams };
}
// unit-square cells for the tiled windows, plus the draggable seams between them
function tileGeom(apps, W, H, kind = tileLayout()) {
  if (!apps.length) return { cells: {}, seams: [] };
  return kind === "master" ? masterGeom(apps, W, H) : kind === "columns" ? columnsGeom(apps, W, H) : bentoGeom(apps, W, H);
}
const tileCells = (apps, W, H) => tileGeom(apps, W, H).cells;
// inset a unit cell by the gap: a full gap at the desktop edge, half a gap on shared edges
function gapped([x, y, w, hh], { width: W, height: H }) {
  const G = gapPx(), e = 1e-6, half = G / 2;
  const l = x < e ? G : half, r = x + w > 1 - e ? G : half, t = y < e ? G : half, b = y + hh > 1 - e ? G : half;
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
  const { cells, seams } = tiling() ? tileGeom(tiledApps(), area.width, area.height) : { cells: {}, seams: [] };
  for (const a of APPS) {
    const el = win(a);
    el.classList.toggle("is-tiled", !!cells[a]);
    el.classList.toggle("is-float", tiling() && isPinned(a));
    applyRect(el, cells[a] ? gapped(cells[a], area) : layout[a]);
    syncFloatButton(a);
  }
  renderSeams(seams);
  syncLayoutChip();
}

/* ---------- seams: drag the line between tiles to resize both sides ---------- */
const seamEls = new Map(); // key -> element, reused so a drag keeps its pointer capture
const SEAM_MIN = 0.12, SEAM_MAX = 0.88;
function seamPos({ axis, node: [x, y, w, hh], ratio }) {
  return axis === "x" ? [x + w * ratio, y, hh] : [y + hh * ratio, x, w]; // [cut, start, length] in unit coords
}
function renderSeams(seams) {
  const live = new Set();
  for (const s of seams) {
    live.add(s.key);
    let el = seamEls.get(s.key);
    if (!el) { el = makeSeam(s.key); seamEls.set(s.key, el); desktop.append(el); }
    el._seam = s;
    const [cut, start, len] = seamPos(s);
    el.dataset.axis = s.axis;
    el.setAttribute("aria-orientation", s.axis === "x" ? "vertical" : "horizontal");
    el.setAttribute("aria-valuenow", String(Math.round(s.ratio * 100)));
    el.setAttribute("aria-valuetext", `${Math.round(s.ratio * 100)}% / ${100 - Math.round(s.ratio * 100)}%`);
    el.style.setProperty("--cut", pct(cut));
    el.style.setProperty("--start", pct(start));
    el.style.setProperty("--len", pct(len));
    $(".tile-seam__tip", el).textContent = `${Math.round(s.ratio * 100)} · ${100 - Math.round(s.ratio * 100)}`;
  }
  for (const [k, el] of seamEls) if (!live.has(k) && !el.classList.contains("is-active")) { el.remove(); seamEls.delete(k); }
}
function setSeam(s, r) {
  r = clamp(Math.round(r * 1000) / 1000, SEAM_MIN, SEAM_MAX);
  if (s.key === "mfact") settings.mfact = clamp(r, 0.2, 0.8); else splits[s.key] = r;
}
function commitSeam(s) {
  if (s.key === "mfact") saveSettings(); else saveSplits();
}
function resetSeam(s) {
  if (s.key === "mfact") { settings.mfact = 0.55; saveSettings(); } else { delete splits[s.key]; saveSplits(); }
  relayout(true);
}
function makeSeam(key) {
  const el = h("div", { className: "tile-seam" });
  el.tabIndex = 0;
  el.setAttribute("role", "separator");
  el.setAttribute("aria-valuemin", String(SEAM_MIN * 100));
  el.setAttribute("aria-valuemax", String(SEAM_MAX * 100));
  el.setAttribute("aria-label", "Resize tiles · arrows to move, enter to reset");
  el.title = "drag to resize · double-click to reset";
  el.append(h("span", { className: "tile-seam__line" }), h("span", { className: "tile-seam__tip" }));
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const s = el._seam, area = desktop.getBoundingClientRect();
    const [nx, ny, nw, nh] = s.node;
    el.setPointerCapture(e.pointerId);
    el.classList.add("is-active");
    desktop.classList.add("is-splitting");
    let raf = 0, last = e;
    const apply = () => {
      raf = 0;
      const f = s.axis === "x" ? ((last.clientX - area.left) / area.width - nx) / nw : ((last.clientY - area.top) / area.height - ny) / nh;
      setSeam(s, f);
      relayout();
    };
    const move = (ev) => { last = ev; raf ||= requestAnimationFrame(apply); };
    const up = () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", move);
      el.classList.remove("is-active");
      desktop.classList.remove("is-splitting");
      commitSeam(el._seam);
      relayout();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up, { once: true });
    el.addEventListener("pointercancel", up, { once: true });
  });
  el.addEventListener("dblclick", () => resetSeam(el._seam));
  el.addEventListener("keydown", (e) => {
    const s = el._seam;
    const back = s.axis === "x" ? "ArrowLeft" : "ArrowUp", fwd = s.axis === "x" ? "ArrowRight" : "ArrowDown";
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === back || e.key === fwd) { e.preventDefault(); setSeam(s, s.ratio + (e.key === fwd ? step : -step)); commitSeam(s); relayout(true); }
    else if (e.key === "Enter" || e.key === "Home") { e.preventDefault(); resetSeam(s); }
  });
  return el;
}
function syncFloatButton(a) {
  const b = $("[data-float]", win(a));
  if (!b) return;
  const pinned = isPinned(a);
  b.setAttribute("aria-pressed", String(pinned));
  b.innerHTML = icon(pinned ? "float" : "tile");
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
  if (say) log(`tile: ${settings.tile ? `${tileLayout()} · alt+space layout · alt+shift+space float · alt+j/k focus · alt+enter hero · alt+h/l split · drag seams to resize` : "off"}`, "ok");
}
// switch the tile algorithm; turns tiling on, since that's the only place it shows
function setTileLayout(kind, { say = true } = {}) {
  if (!TILE_LAYOUTS.includes(kind) && !(kind === "columns" && tileGroups)) return false;
  settings.tileLayout = kind;
  if (!settings.tile) setTile(true, { say: false }); else { saveSettings(); relayout(true); }
  saveSettings();
  if (say) log(`tile: ${layoutLabel()}`, "ok");
  if (!win("config").hidden) writeField("tileLayout", kind);
  return true;
}
const cycleTileLayout = () => setTileLayout(!settings.tile ? tileLayout() : tileLayout() === "columns" ? "bento" : TILE_LAYOUTS[(TILE_LAYOUTS.indexOf(tileLayout()) + 1) % TILE_LAYOUTS.length]);
function syncLayoutChip() {
  desktop.classList.toggle("is-tiled", !!settings.tile);
  desktop.dataset.tileLayout = tileLayout();
  const b = $("#layout-tile");
  b.setAttribute("aria-pressed", String(!!settings.tile));
  const glyph = settings.tile ? (tileLayout() === "master" ? "tile" : "bento") : "float";
  if (b.dataset.glyph !== glyph) { $(".chip__glyph", b).innerHTML = icon(glyph); b.dataset.glyph = glyph; }
  $(".chip__label", b).textContent = settings.tile ? layoutLabel() : "float";
  b.title = settings.tile ? `tiling: ${layoutLabel()} · click for float (alt+t) · alt+space switches layout` : "toggle tiling (alt+t)";
}
// re-apply z-order after the layer rules change (floats above tiles only while tiling)
function restack() {
  APPS.map((a) => win(a)).filter((el) => !el.hidden)
    .sort((x, y) => (+x.style.zIndex || 0) % FLOAT_LAYER - (+y.style.zIndex || 0) % FLOAT_LAYER)
    .forEach((el) => { el.style.zIndex = zFor(el.dataset.app); });
}
// alt+h/l: move the first (outermost) seam — the master split, or the bento's root cut
function nudgeSplit(d) {
  if (!tiling()) return false;
  const area = desktop.getBoundingClientRect();
  const root = tileGeom(tiledApps(), area.width, area.height).seams[0];
  if (!root) return false;
  setSeam(root, root.ratio + d);
  commitSeam(root);
  relayout(true);
  log(`tile: ${root.key === "mfact" ? "master" : "split"} ${Math.round((root.key === "mfact" ? settings.mfact : splits[root.key]) * 100)}%`);
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
const T3 = 1 / 3;
// which zone the cursor is in: corners are quarters, sides are halves; the top edge
// splits into left third · maximize · right third, the bottom edge into ⅔ · middle ⅓ · ⅔
function snapZone(x, y, { width: W, height: H }) {
  const L = x <= EDGE, R = x >= W - EDGE, T = y <= EDGE, B = y >= H - EDGE;
  const nearX = x < CORNER || x > W - CORNER, nearY = y < CORNER || y > H - CORNER;
  if (((L || R) && nearY) || ((T || B) && nearX)) {
    const z = [x < W / 2 ? 0 : 0.5, y < H / 2 ? 0 : 0.5, 0.5, 0.5];
    return { rect: z, label: `${y < H / 2 ? "top" : "bottom"} ${x < W / 2 ? "left" : "right"} ¼` };
  }
  if (L) return { rect: [0, 0, 0.5, 1], label: "left ½" };
  if (R) return { rect: [0.5, 0, 0.5, 1], label: "right ½" };
  const col = x < W * T3 ? 0 : x > W * 2 * T3 ? 2 : 1;
  if (T) return [{ rect: [0, 0, T3, 1], label: "left ⅓" }, { rect: [0, 0, 1, 1], label: "maximize" }, { rect: [2 * T3, 0, T3, 1], label: "right ⅓" }][col];
  if (B) return [{ rect: [0, 0, 2 * T3, 1], label: "left ⅔" }, { rect: [T3, 0, T3, 1], label: "middle ⅓" }, { rect: [T3, 0, 2 * T3, 1], label: "right ⅔" }][col];
  return null;
}
const ghost = h("div", { className: "snap-ghost" }, h("span", { className: "snap-ghost__label" }));
ghost.setAttribute("aria-hidden", "true");
desktop.append(ghost);

/* ---------- magnetic edges: drag or resize near another window's edge and it clicks in ---------- */
const MAG = 10; // px pull distance
const guideX = h("div", { className: "snap-guide snap-guide--x" }), guideY = h("div", { className: "snap-guide snap-guide--y" });
guideX.setAttribute("aria-hidden", "true"); guideY.setAttribute("aria-hidden", "true");
desktop.append(guideX, guideY);
// rects (px, relative to the desktop) of every other window a dragged one can line up with
function magnetRects(app, area) {
  return APPS.filter((a) => a !== app && !win(a).hidden && !win(a).classList.contains("is-max")).map((a) => {
    const r = win(a).getBoundingClientRect();
    return { l: r.left - area.left, t: r.top - area.top, r: r.right - area.left, b: r.bottom - area.top };
  });
}
// targets per edge: line up with an edge, sit a gap beside it, the desktop margin, the centre line
function magnetTargets(rects, W, H) {
  const G = gapPx();
  const t = { l: [[G, null]], r: [[W - G, null]], t: [[G, null]], b: [[H - G, null]] };
  t.l.push([W / 2 + G / 2, null]); t.r.push([W / 2 - G / 2, null]);
  t.t.push([H / 2 + G / 2, null]); t.b.push([H / 2 - G / 2, null]);
  for (const o of rects) {
    t.l.push([o.l, o], [o.r + G, o]); t.r.push([o.r, o], [o.l - G, o]);
    t.t.push([o.t, o], [o.b + G, o]); t.b.push([o.b, o], [o.t - G, o]);
  }
  return t;
}
// closest pull for a set of edges: [{edge value, target list}] -> { d, at, src }
function pull(edges) {
  let best = null;
  for (const [v, list] of edges) for (const [at, src] of list) {
    const d = at - v;
    if (Math.abs(d) <= MAG && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at, src };
  }
  return best;
}
function showGuides(px, py, box) {
  const set = (g, hit, axis) => {
    if (!hit) { g.classList.remove("is-on"); return; }
    const lo = Math.min(axis === "x" ? box.t : box.l, hit.src ? (axis === "x" ? hit.src.t : hit.src.l) : 0);
    const hi = Math.max(axis === "x" ? box.b : box.r, hit.src ? (axis === "x" ? hit.src.b : hit.src.r) : Infinity);
    if (axis === "x") Object.assign(g.style, { left: `${hit.at}px`, top: `${hit.src ? lo : 0}px`, height: hit.src ? `${hi - lo}px` : "100%" });
    else Object.assign(g.style, { top: `${hit.at}px`, left: `${hit.src ? lo : 0}px`, width: hit.src ? `${hi - lo}px` : "100%" });
    g.classList.add("is-on");
  };
  set(guideX, px, "x"); set(guideY, py, "y");
}
const hideGuides = () => { guideX.classList.remove("is-on"); guideY.classList.remove("is-on"); };

function showGhost(frac, from, label = "") {
  if (!frac) { ghost.classList.remove("is-on"); return; }
  $(".snap-ghost__label", ghost).textContent = label;
  ghost.classList.toggle("has-label", !!label);
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
  let w = start.width, moved = false, done = false, target = null, targets = null;
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
    let x = clamp(ev.clientX - off.x - area.left, -w + 80, area.width - 80);
    let y = clamp(ev.clientY - off.y - area.top, 0, area.height - 26);
    const px = ev.clientX - area.left, py = ev.clientY - area.top;
    if (tiled) {
      const cells = tileCells(tiledApps(), area.width, area.height);
      const fx = px / area.width, fy = py / area.height;
      const hit = Object.keys(cells).find((a) => { const [cx, cy, cw, ch] = cells[a]; return a !== app && fx >= cx && fx < cx + cw && fy >= cy && fy < cy + ch; });
      target = hit || null;
      showGhost(gapped(cells[hit || app], area), toFrac(el.getBoundingClientRect(), area), hit ? `swap with ${hit}` : "");
    } else {
      const z = settings.snap ? snapZone(px, py, area) : null;
      target = z && gapped(z.rect, area);
      showGhost(target, toFrac(el.getBoundingClientRect(), area), z?.label);
      // no zone under the cursor: pull onto nearby window edges (hold alt to place freely)
      if (!z && settings.snap && !ev.altKey) {
        targets ??= magnetTargets(magnetRects(app, area), area.width, area.height);
        const hh = el.offsetHeight;
        const mx = pull([[x, targets.l], [x + w, targets.r]]), my = pull([[y, targets.t], [y + hh, targets.b]]);
        if (mx) x += mx.d;
        if (my) y = Math.max(0, y + my.d);
        showGuides(mx, my, { l: x, t: y, r: x + w, b: y + hh });
      } else hideGuides();
    }
    el.style.left = pct(x / area.width);
    el.style.top = pct(y / area.height);
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
    hideGuides();
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
    if (tiling() && isPinned(app)) b.append(h("span", { className: "task__float", title: "floating", innerHTML: icon("float") }));
    b.addEventListener("click", () => { openApp(app); win(app).focus({ preventScroll: true }); });
    b.addEventListener("auxclick", (e) => { if (e.button === 1) { e.preventDefault(); closeApp(app); } });
    return b;
  }));
  syncDock();
  if (!win("config").hidden) renderAppGrid();
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
  b.append(h("span", { className: "menu__check", innerHTML: checked ? icon(role === "menuitemradio" ? "dot" : "check") : "" }), h("span", { className: "menu__label", textContent: label }));
  if (hint) b.append(kbd(hint));
  b.addEventListener("click", () => { closeMenus(); run(); });
  return b;
}
const menuSep = () => { const s = h("div", { className: "menu__sep" }); s.setAttribute("role", "separator"); return s; };
const menuHead = (t) => h("div", { className: "menu__head", textContent: t });
const MENUS = {
  sys: () => [
    menuItem("about hzOS", () => COMMANDS.neofetch()),
    menuItem("settings…", () => openConfig(), { hint: "⌥," }),
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
      menuItem("bento", () => setTileLayout("bento"), { role: "menuitemradio", checked: settings.tile && tileLayout() === "bento", disabled: !wide, hint: settings.tile && tileLayout() !== "bento" ? "⌥␣" : "" }),
      ...(tileGroups ? [menuItem(`${tileGroups.name} columns`, () => setTileLayout("columns"), { role: "menuitemradio", checked: settings.tile && tileLayout() === "columns", disabled: !wide })] : []),
      menuItem("master + stack", () => setTileLayout("master"), { role: "menuitemradio", checked: settings.tile && tileLayout() === "master", disabled: !wide, hint: settings.tile && tileLayout() !== "master" ? "⌥␣" : "" }),
      menuItem(settings.tile ? "rebalance tiles" : "arrange all (bento)", arrangeAll, { disabled: !wide, hint: "⌥A" }),
      menuItem(cur ? `snap ${FILES[cur]}…` : "snap window…", () => openZones(cur, { focusFirst: true }), { disabled: !cur || !wide, hint: "⌥Z" }),
      menuItem(cur ? `float ${FILES[cur]}` : "float window", () => toggleFloat(cur), { role: "menuitemcheckbox", checked: cur && isPinned(cur), disabled: !cur || !tiling(), hint: "⌥⇧␣" }),
      menuItem("snap & magnetic edges", () => { settings.snap = !settings.snap; saveSettings(); }, { role: "menuitemcheckbox", checked: settings.snap, disabled: !wide }),
      menuSep(), menuHead("layouts"),
      ...Object.keys(presets).sort().map((n) => menuItem(n, () => { applyPreset(n); log(`layout: ${n}`, "ok"); }, { disabled: !wide, hint: settings.startLayout === n ? "startup" : "" })),
      menuItem("save layout…", () => { openConfig("windows"); $("#cfg-preset-name").focus(); }, { disabled: !wide }),
      menuItem("reset layout", () => { resetLayout(); log("layout: reset.", "ok"); }, { disabled: !wide }),
    ];
  },
  links: () => [
    ...links().map((l) => menuItem(l.name, () => openLink(l.url), { hint: l.host.replace(/^www\./, "") })),
    menuSep(),
    menuItem("edit links…", () => openConfig("links")),
  ],
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

/* ---------- snap layouts: pick a zone from a little map of the screen ---------- */
const ZONE_SETS = [
  ["halves", [["left ½", [0, 0, 0.5, 1]], ["right ½", [0.5, 0, 0.5, 1]]]],
  ["thirds", [["left ⅓", [0, 0, T3, 1]], ["middle ⅓", [T3, 0, T3, 1]], ["right ⅓", [2 * T3, 0, T3, 1]]]],
  ["⅔ · ⅓", [["left ⅔", [0, 0, 2 * T3, 1]], ["right ⅓", [2 * T3, 0, T3, 1]]]],
  ["bento", [["left ½", [0, 0, 0.5, 1]], ["top right ¼", [0.5, 0, 0.5, 0.5]], ["bottom right ¼", [0.5, 0.5, 0.5, 0.5]]]],
  ["quarters", [["top left ¼", [0, 0, 0.5, 0.5]], ["top right ¼", [0.5, 0, 0.5, 0.5]], ["bottom left ¼", [0, 0.5, 0.5, 0.5]], ["bottom right ¼", [0.5, 0.5, 0.5, 0.5]]]],
  ["rows", [["top ½", [0, 0, 1, 0.5]], ["bottom ½", [0, 0.5, 1, 0.5]]]],
];
// put one window into a zone (floats it if it was a tile, so the rest of the grid keeps flowing)
function placeIn(app, frac, label) {
  app = appName(app || "");
  if (!APPS.includes(app) || small()) return false;
  const el = win(app);
  if (el.hidden) openApp(app, { focus: false });
  el.classList.remove("is-max");
  if (tiling() && !isPinned(app)) { floats.add(app); store.set("float.v1", [...floats]); }
  const area = desktop.getBoundingClientRect();
  snapPrev[app] ??= layout[app];
  layout[app] = gapped(frac, area);
  saveLayout();
  relayout(true);
  front(app);
  renderDock();
  log(`${FILES[app]}: ${label}`);
  return true;
}
// alt+a: float mode packs every open window into a bento; tile mode rebalances the seams
function arrangeAll() {
  if (small()) return false;
  if (tiling()) {
    for (const k of Object.keys(splits)) delete splits[k];
    saveSplits();
    if (tileLayout() === "master") { settings.mfact = 0.55; saveSettings(); }
    relayout(true);
    log(`tile: ${tileLayout()} rebalanced`, "ok");
    return true;
  }
  const area = desktop.getBoundingClientRect();
  const apps = tileOrder.filter((a) => !win(a).hidden);
  if (!apps.length) return false;
  const { cells } = bentoGeom(apps, area.width, area.height);
  for (const a of apps) { win(a).classList.remove("is-max"); delete snapPrev[a]; layout[a] = gapped(cells[a], area); }
  saveLayout();
  relayout(true);
  log(`arranged ${apps.length} window${apps.length === 1 ? "" : "s"} · bento`, "ok");
  return true;
}
const zonePicker = h("div", { className: "zones" });
zonePicker.setAttribute("role", "dialog");
zonePicker.hidden = true;
document.body.append(zonePicker);
zonePicker.app = null;
function zoneMini(set, app) {
  const [name, zones] = set;
  const box = h("div", { className: "zones__set" });
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", name);
  const map = h("div", { className: "zones__map" });
  for (const [label, [x, y, w, hh]] of zones) {
    const b = h("button", { type: "button", className: "zones__zone" });
    b.setAttribute("aria-label", `${label} (${name})`);
    b.title = label;
    Object.assign(b.style, { left: pct(x), top: pct(y), width: pct(w), height: pct(hh) });
    b.addEventListener("click", () => { closeZones(); placeIn(app, [x, y, w, hh], label); });
    map.append(b);
  }
  box.append(map, h("span", { className: "zones__name", textContent: name }));
  return box;
}
function openZones(app, { focusFirst = false } = {}) {
  if (small() || !APPS.includes(app)) return;
  closeMenus();
  if (zonePicker.app && zonePicker.app !== app) closeZones();
  const btn = $(".win__zones", win(app));
  zonePicker.app = app;
  zonePicker.setAttribute("aria-label", `Snap layouts for ${FILES[app]}`);
  const foot = h("div", { className: "zones__foot" });
  const act = (label, run, hint) => {
    const b = h("button", { type: "button", className: "zones__act" }, h("span", { textContent: label }));
    if (hint) b.append(kbd(hint));
    b.addEventListener("click", () => { closeZones(); run(); });
    return b;
  };
  foot.append(act("maximize", () => toggleMax(app)), act(tiling() ? "rebalance" : "arrange all", arrangeAll, "⌥A"));
  const lay = h("div", { className: "zones__layouts" }, h("span", { className: "zones__head", textContent: "tile" }));
  for (const k of [...TILE_LAYOUTS, ...(tileGroups ? ["columns"] : []), "float"]) {
    const on = k === "float" ? !settings.tile : settings.tile && tileLayout() === k;
    const b = h("button", { type: "button", className: "zones__chip", innerHTML: icon(k === "master" ? "tile" : k === "float" ? "float" : "bento") });
    b.append(h("span", { textContent: k === "columns" ? tileGroups.name : k }));
    b.setAttribute("aria-pressed", String(on));
    b.addEventListener("click", () => { closeZones(); k === "float" ? setTile(false) : setTileLayout(k); });
    lay.append(b);
  }
  zonePicker.replaceChildren(
    h("div", { className: "zones__head", textContent: `snap ${FILES[app]}` }),
    h("div", { className: "zones__grid" }, ...ZONE_SETS.map((s) => zoneMini(s, app))),
    lay, foot,
  );
  zonePicker.hidden = false;
  btn?.setAttribute("aria-expanded", "true");
  // under the button, right-aligned, kept on screen
  const r = (btn || win(app)).getBoundingClientRect(), pw = zonePicker.offsetWidth, ph = zonePicker.offsetHeight;
  zonePicker.style.left = `${clamp(r.right - pw, 8, innerWidth - pw - 8)}px`;
  zonePicker.style.top = `${r.bottom + ph + 8 > innerHeight ? Math.max(8, r.top - ph - 6) : r.bottom + 6}px`;
  zonePicker.classList.remove("is-on"); void zonePicker.offsetWidth; zonePicker.classList.add("is-on");
  if (focusFirst) $(".zones__zone", zonePicker)?.focus();
}
function closeZones({ refocus = false } = {}) {
  const app = zonePicker.app;
  if (!app) return;
  zonePicker.app = null;
  zonePicker.hidden = true;
  zonePicker.classList.remove("is-on");
  const btn = $(".win__zones", win(app));
  btn?.setAttribute("aria-expanded", "false");
  if (refocus) btn?.focus();
}
// hover-opened pickers close when the pointer leaves both the button and the picker
let zoneLeave = 0;
zonePicker.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse" && !zonePicker.contains(document.activeElement)) zoneLeave = setTimeout(closeZones, 380); });
zonePicker.addEventListener("pointerenter", () => clearTimeout(zoneLeave));
addEventListener("pointerdown", (e) => { if (zonePicker.app && !zonePicker.contains(e.target) && !e.target.closest(".win__zones")) closeZones(); }, true);
zonePicker.addEventListener("keydown", (e) => {
  const items = $$("button", zonePicker), i = items.indexOf(document.activeElement);
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeZones({ refocus: true }); }
  else if ((e.key === "ArrowRight" || e.key === "ArrowDown") && i >= 0) { e.preventDefault(); items[(i + 1) % items.length].focus(); }
  else if ((e.key === "ArrowLeft" || e.key === "ArrowUp") && i >= 0) { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
});

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
  // resize by corner grip; the right and bottom edges pull onto neighbours' edges too
  let targets = null;
  pointerTrack(grip, el, (ev, e0, rect, area) => {
    el.classList.add("is-resizing");
    let w = Math.min(Math.max(rect.width + ev.clientX - e0.clientX, MIN_W), area.right - rect.left);
    let hh = Math.min(Math.max(rect.height + ev.clientY - e0.clientY, MIN_H), area.bottom - rect.top);
    if (settings.snap && !ev.altKey) {
      targets ??= magnetTargets(magnetRects(app, area), area.width, area.height);
      const l = rect.left - area.left, t = rect.top - area.top;
      const mx = pull([[l + w, targets.r]]), my = pull([[t + hh, targets.b]]);
      if (mx && w + mx.d >= MIN_W) w += mx.d;
      if (my && hh + my.d >= MIN_H) hh += my.d;
      showGuides(mx, my, { l, t, r: l + w, b: t + hh });
    } else hideGuides();
    el.style.width = `${(w / area.width) * 100}%`;
    el.style.height = `${(hh / area.height) * 100}%`;
  }, (r, area) => { el.classList.remove("is-resizing"); targets = null; hideGuides(); delete snapPrev[app]; commit(r, area); });
  // snap-layout picker: hover (or click) the zones button for a menu of places to put this window
  const zb = h("button", { type: "button", className: "win__zones", innerHTML: icon("layout") });
  zb.setAttribute("aria-label", `Snap layouts for ${FILES[app]}`);
  zb.setAttribute("aria-haspopup", "dialog");
  zb.setAttribute("aria-expanded", "false");
  zb.title = "snap layouts (alt+z)";
  zb.addEventListener("click", (e) => (zonePicker.app === app ? closeZones() : openZones(app, { focusFirst: e.detail === 0 })));
  zb.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") { clearTimeout(zb._t); zb._t = setTimeout(() => openZones(app), 420); } });
  zb.addEventListener("pointerleave", () => clearTimeout(zb._t));
  $(".win__ctrl", el).prepend(zb);
  bar.addEventListener("dblclick", (e) => { if (!e.target.closest("button")) toggleMax(app); });
  el.addEventListener("pointerdown", () => front(app));
  el.addEventListener("focusin", () => front(app));
  $$(".win__ctrl [data-close]", el).forEach((b) => { b.innerHTML = icon("close"); });
  $$("[data-close]", el).forEach((b) => b.addEventListener("click", () => closeApp(app)));
}
// put every window back to its default spot and reopen the default set
function resetLayout() {
  if (presets[DEFAULT_PRESET] && !small()) { for (const k of Object.keys(splits)) delete splits[k]; saveSplits(); applyPreset(DEFAULT_PRESET); return; }
  store.del(ORIENT[orient].key);
  Object.assign(layout, ORIENT[orient].defaults);
  for (const k of Object.keys(snapPrev)) delete snapPrev[k];
  settings.mfact = 0.55; saveSettings();
  for (const k of Object.keys(splits)) delete splits[k];
  saveSplits();
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
  if (e.code === "Space" && !e.shiftKey) { e.preventDefault(); cycleTileLayout(); return; }
  if (e.code === "Space" && e.shiftKey) {
    if (!tiling()) return;
    e.preventDefault();
    const a = $(".win.is-front")?.dataset.app;
    if (a) log(`${FILES[a]}: ${toggleFloat(a) ? "floating" : "tiled"}`);
    return;
  }
  const act = {
    KeyT: () => setTile(!settings.tile),
    KeyA: () => arrangeAll(),
    KeyZ: () => { const a = $(".win.is-front:not([hidden])")?.dataset.app; if (a) (zonePicker.app === a ? closeZones({ refocus: true }) : openZones(a, { focusFirst: true })); },
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
  if (e.code === "Comma") { e.preventDefault(); openConfig(); return; }
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
  const hm = hhmm(now), ss = pad(now.getSeconds());
  $("#st-time").textContent = !settings.secs ? hm : settings.h24 ? `${hm}:${ss}` : hm.replace(/(\d{2})(?=[a-z]|$)/, `$1:${ss}`);
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
  const root = document.documentElement;
  root.classList.add("no-trans");
  if (name === "lime") delete document.body.dataset.theme; else document.body.dataset.theme = name;
  void root.offsetHeight; // flush with transitions off
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("no-trans")));
  settings.theme = name;
  $('meta[name="theme-color"]').content = css("--bg") || "#0a0c08";
  worldMap?.setColors();
  vizApp?.setColors();
  stageBg.setColors();
  return true;
}
// look: scanlines, glow, motion
function applyLook() {
  document.body.classList.toggle("no-glow", !settings.glow);
  $(".crt").hidden = !settings.crt;
  reduce = calcReduce();
  document.body.classList.toggle("motion-reduced", reduce);
  document.body.classList.toggle("motion-full", settings.motion === "full");
}

/* ---------- saved window layouts ---------- */
// a layout is a snapshot of where windows sit, which are open, and the tiling state.
// positions are per orientation, so a portrait snapshot leaves landscape positions alone.
const presets = store.get("layouts.v1", {});
// built-in layouts, seeded once into the saved list so they load, list and delete like any other
const BUILTIN_PRESETS = {
  // the default desktop. left to right: clock over weather · world map over the visualizer ·
  // noise · feed · focus, todo, notes and fortune stacked
  studio: {
    builtin: true, version: 2, tile: true, tileLayout: "columns", mfact: 0.55, splits: {}, floats: ["config"],
    open: ["clock", "wx", "map", "viz", "noise", "feed", "focus", "todo", "notes", "fortune"],
    order: ["clock", "wx", "map", "viz", "noise", "feed", "focus", "todo", "notes", "fortune"],
    groups: { name: "studio", cols: [
      { w: 0.176, rows: [["clock", 0.39], ["wx", 0.61]] },
      { w: 0.256, rows: [["map", 0.37], ["viz", 0.63]] },
      { w: 0.176, rows: [["noise", 1]] },
      { w: 0.2, rows: [["feed", 1]] },
      { w: 0.192, rows: [["focus", 0.27], ["todo", 0.24], ["notes", 0.24], ["fortune", 0.25]] },
    ] },
  },
};
for (const [n, p] of Object.entries(BUILTIN_PRESETS)) {
  const seeded = store.get(`layouts.seeded.${n}`); // true (v1) or the version number seeded
  const ver = seeded === true ? 1 : +seeded || 0;
  if (ver >= p.version) continue;
  const cur = presets[n];
  const deleted = ver && !cur; // the user removed it: leave it gone
  if (!deleted && (!cur || cur.builtin)) presets[n] = { ...p, at: Date.now() };
  store.set(`layouts.seeded.${n}`, p.version);
  store.set("layouts.v1", presets);
}
const DEFAULT_PRESET = "studio";
const presetName = (s) => String(s || "").trim().toLowerCase().replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
function snapshotLayout() {
  return {
    orient, rects: { ...layout }, tile: !!settings.tile, mfact: settings.mfact, tileLayout: tileLayout(), splits: { ...splits }, ...(tileLayout() === "columns" ? { groups: tileGroups } : {}),
    open: APPS.filter((a) => a !== "config" && a !== "game" && !win(a).hidden),
    floats: [...floats], order: [...tileOrder], at: Date.now(),
  };
}
function savePreset(raw) {
  const name = presetName(raw);
  if (!name) return null;
  presets[name] = snapshotLayout();
  store.set("layouts.v1", presets);
  renderPresets();
  return name;
}
function deletePreset(name) {
  if (!presets[name]) return false;
  delete presets[name];
  store.set("layouts.v1", presets);
  if (settings.startLayout === name) { settings.startLayout = ""; saveSettings(); }
  renderPresets();
  return true;
}
// put the snapshot's state in place without side effects (used at startup, before anything mounts)
function applyPresetState(p) {
  if (p.orient === orient && p.rects) { for (const [k, v] of Object.entries(p.rects)) if (APPS.includes(k) && Array.isArray(v) && v.length === 4) layout[k] = v; saveLayout(); }
  floats.clear(); (p.floats || []).filter((a) => APPS.includes(a)).forEach((a) => floats.add(a)); store.set("float.v1", [...floats]);
  const order = [...new Set([...(p.order || []).filter((a) => APPS.includes(a)), ...APPS])];
  tileOrder.splice(0, tileOrder.length, ...order); store.set("tile.order", tileOrder);
  if (typeof p.mfact === "number") settings.mfact = clamp(p.mfact, 0.2, 0.8);
  if (p.tileLayout === "columns" && validGroups(p.groups)) { tileGroups = p.groups; store.set("tile.groups", tileGroups); settings.tileLayout = "columns"; }
  else if (TILE_LAYOUTS.includes(p.tileLayout)) settings.tileLayout = p.tileLayout;
  if (p.splits && typeof p.splits === "object") { for (const k of Object.keys(splits)) delete splits[k]; for (const [k, v] of Object.entries(p.splits)) if (typeof v === "number") splits[k] = clamp(v, SEAM_MIN, SEAM_MAX); saveSplits(); }
  settings.tile = !!p.tile; saveSettings();
  const want = new Set(p.open || []);
  for (const a of APPS) {
    if (a === "config") continue;
    const show = want.has(a) && a !== "game";
    win(a).hidden = !show; win(a).classList.remove("is-max");
    if (show) closed.delete(a); else closed.add(a);
  }
  store.set("closed.v2", [...closed]);
}
function applyPreset(name) {
  const p = presets[name];
  if (!p || small()) return false;
  const before = new Set(APPS.filter((a) => !win(a).hidden));
  applyPresetState(p);
  for (const a of APPS) {
    const on = !win(a).hidden;
    if (on === before.has(a)) continue;
    if (on) { if (a === "viz") mountViz(); if (a === "noise") mountNoise(); }
    else { if (a === "game") stopGame(); if (a === "viz") unmountViz(); if (a === "noise") unmountNoise(); }
  }
  syncTermDock();
  syncLayoutChip();
  relayout(true);
  restack();
  renderDock();
  const top = p.open?.find((a) => !win(a).hidden);
  if (top) front(top);
  if (!win("config").hidden) fillConfig();
  return true;
}

/* ---------- config.ini: a sectioned settings window, changes apply and save as you go ---------- */
const cfg = $("#config");
const cfgTabs = $$(".config__nav [role=tab]", cfg);
function showPane(name, { focus = false } = {}) {
  if (!cfgTabs.some((t) => t.dataset.pane === name)) name = "general";
  for (const t of cfgTabs) {
    const on = t.dataset.pane === name;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
    if (on && focus) t.focus();
  }
  $$(".config__pane", cfg).forEach((p) => { p.hidden = p.dataset.pane !== name; });
  $(".config__panes", cfg).scrollTop = 0;
  store.set("cfg.pane", name);
}
cfgTabs.forEach((t, i) => {
  t.addEventListener("click", () => showPane(t.dataset.pane));
  t.addEventListener("keydown", (e) => {
    const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    showPane(cfgTabs[(i + d + cfgTabs.length) % cfgTabs.length].dataset.pane, { focus: true });
  });
});
function openConfig(pane) {
  openApp("config", { focus: false });
  if (pane) showPane(pane);
  $(".config__nav [aria-selected=true]", cfg)?.focus();
}

// read and write a settings key through the form, whatever control it lives in
function fieldOf(k) { const f = cfg.elements[k]; return f && (f instanceof RadioNodeList || f.name === k) ? f : null; }
function writeField(k, v) {
  const f = fieldOf(k);
  if (!f) return;
  if (f instanceof RadioNodeList) { for (const r of f) r.checked = r.value === String(v); return; }
  if (f.type === "checkbox") f.checked = !!v; else f.value = v;
  const o = $(`[data-out="${k}"]`, cfg);
  if (o) o.textContent = k === "mfact" ? `${Math.round(v * 100)}%` : `${v}px`;
}
function readField(k) {
  const f = fieldOf(k);
  const cur = settings[k];
  if (f instanceof RadioNodeList) return typeof cur === "boolean" ? f.value === "true" : f.value;
  if (f.type === "checkbox") return f.checked;
  if (typeof cur === "number") return +f.value;
  return f.value.trim();
}
function fillConfig() {
  // the preset's fixed columns only appear as a choice once a preset has set them up
  const colsOpt = $("#cfg-tl-columns");
  colsOpt.hidden = !tileGroups;
  if (tileGroups) $("span", colsOpt).textContent = `${tileGroups.name} columns`;
  for (const [k, v] of Object.entries(settings)) writeField(k, v);
  renderStartLayouts();
  writeField("startLayout", presets[settings.startLayout] ? settings.startLayout : "");
  renderLinkRows();
  renderAppGrid();
  renderPresets();
}
const savedTip = $("#cfg-saved");
function flashSaved(text = "saved") {
  savedTip.textContent = text;
  savedTip.classList.remove("is-on"); void savedTip.offsetWidth; savedTip.classList.add("is-on");
  clearTimeout(flashSaved.t);
  flashSaved.t = setTimeout(() => savedTip.classList.remove("is-on"), 1400);
}
const requote = () => { qSlot = slotKey(settings.qRotation, new Date()); qSalt = 0; renderFortune(); };
const clockNow = () => { lastMinute = -1; tick(); };
// what to redo when a key changes; anything not listed just saves
const LIVE = {
  name: clockNow, h24: clockNow, secs: clockNow, city: () => loadWx(true),
  theme: () => applyTheme(settings.theme),
  crt: applyLook, glow: applyLook, motion: applyLook,
  snap: () => {}, tile: () => setTile(settings.tile, { say: false }),
  mfact: () => relayout(true), gap: () => relayout(true), tileLayout: () => setTileLayout(settings.tileLayout, { say: false }),
  qRotation: requote, qMatch: requote, qp_dev: requote, qp_stoic: requote, qp_motivation: requote, qp_rest: requote, qCustom: requote,
  linksMenu: syncLinksMenu,
};
function commit(k) {
  if (!Object.hasOwn(settings, k) || !fieldOf(k)) return;
  const v = readField(k);
  if (v === settings[k]) return;
  settings[k] = v;
  saveSettings();
  LIVE[k]?.();
  writeField(k, v);
  flashSaved();
}
let typing = 0;
cfg.addEventListener("input", (e) => {
  const k = e.target.name;
  if (!k) return;
  if (e.target.type === "range") { commit(k); return; }
  if (e.target.matches("input[type=text], textarea") && k !== "city") { clearTimeout(typing); typing = setTimeout(() => commit(k), 450); }
});
cfg.addEventListener("change", (e) => { if (e.target.name) commit(e.target.name); });
cfg.addEventListener("submit", (e) => { e.preventDefault(); const k = document.activeElement?.name; if (k) commit(k); });

// windows pane: open/close toggles for every app
function renderAppGrid() {
  const grid = $("#cfg-apps");
  if (!grid) return;
  grid.replaceChildren(...APPS.filter((a) => a !== "config" && a !== "game").map((a) => {
    const box = h("input", { type: "checkbox", checked: !win(a).hidden });
    box.addEventListener("change", () => (box.checked ? openApp(a, { focus: false }) : closeApp(a)));
    return h("label", { className: "pill pill--app" }, box, h("span", { textContent: FILES[a] }));
  }));
}
const fmtPreset = (p) => {
  const n = (p.open || []).length;
  return `${n} window${n === 1 ? "" : "s"} · ${p.tile ? (p.tileLayout === "columns" ? `${p.groups?.name || "custom"} columns` : p.tileLayout || "master") : "floating"} · ${p.orient}`;
};
function renderPresets() {
  const list = $("#cfg-presets");
  if (!list) return;
  const names = Object.keys(presets).sort();
  if (!names.length) {
    list.replaceChildren(h("p", { className: "presets__empty", textContent: "no saved layouts yet. arrange your windows, name it below and save." }));
  } else {
    list.replaceChildren(...names.map((n) => {
      const p = presets[n];
      const iconBtn = (ic, label, run, cls = "") => {
        const b = h("button", { type: "button", className: `iconbtn ${cls}`, title: label, innerHTML: icon(ic) });
        b.setAttribute("aria-label", `${label} ${n}`);
        b.addEventListener("click", run);
        return b;
      };
      return h("div", { className: "preset" },
        h("span", { className: "preset__icon", innerHTML: icon("layout") }),
        h("span", { className: "preset__text" },
          h("span", { className: "preset__name", textContent: n }, settings.startLayout === n ? h("span", { className: "badge", textContent: "startup" }) : null),
          h("span", { className: "preset__meta", textContent: fmtPreset(p) })),
        iconBtn("play", "Apply", () => { applyPreset(n); flashSaved(`applied ${n}`); }),
        iconBtn("save", "Overwrite with current", () => { savePreset(n); flashSaved(`updated ${n}`); }),
        iconBtn("trash", "Delete", () => { deletePreset(n); renderStartLayouts(); flashSaved(`deleted ${n}`); }, "iconbtn--danger"));
    }));
  }
  renderStartLayouts();
}
function renderStartLayouts() {
  const sel = $("#cfg-startwin");
  if (!sel) return;
  sel.replaceChildren(h("option", { value: "", textContent: "restore last session" }),
    ...Object.keys(presets).sort().map((n) => h("option", { value: n, textContent: `layout: ${n}` })));
  sel.value = presets[settings.startLayout] ? settings.startLayout : "";
}
$("#cfg-preset-save").addEventListener("click", () => {
  const inp = $("#cfg-preset-name");
  const n = savePreset(inp.value || `layout-${Object.keys(presets).length + 1}`);
  if (n) { inp.value = ""; flashSaved(`saved ${n}`); }
});
$("#cfg-preset-name").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("#cfg-preset-save").click(); } });
$("#cfg-layout-reset").addEventListener("click", () => { resetLayout(); fillConfig(); flashSaved("layout reset"); });
$("#cfg-boot-test").addEventListener("click", () => boot({ force: true }));

// links pane: one row per link, written back to settings.links as "name | url" lines
function linkRows() {
  return (settings.links || "").split("\n").filter((l) => l.trim()).map((l) => {
    const i = l.indexOf("|");
    return i < 0 ? [l.trim(), ""] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  });
}
const validUrl = (u) => { try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; } };
function writeLinks() {
  const rows = $$("#cfg-links .linkrow").map((r) => [$(".linkrow__name", r).value.trim(), $(".linkrow__url", r).value.trim()]);
  settings.links = rows.filter(([n, u]) => n || u).map(([n, u]) => `${n} | ${u}`).join("\n");
  saveSettings();
  syncLinksMenu();
  flashSaved();
}
function renderLinkRows(focusIdx = -1) {
  const list = $("#cfg-links");
  const rows = linkRows();
  list.replaceChildren(...rows.map(([n, u], i) => {
    const name = h("input", { type: "text", className: "linkrow__name", value: n, placeholder: "name", maxLength: 24, spellcheck: false });
    const url = h("input", { type: "url", className: "linkrow__url", value: u, placeholder: "https://", spellcheck: false });
    name.setAttribute("aria-label", `Link ${i + 1} name`);
    url.setAttribute("aria-label", `Link ${i + 1} address`);
    const mark = () => url.toggleAttribute("aria-invalid", !!url.value.trim() && !validUrl(url.value.trim()));
    mark();
    let t = 0;
    for (const f of [name, url]) f.addEventListener("input", () => { mark(); clearTimeout(t); t = setTimeout(writeLinks, 400); });
    const move = (d) => {
      const all = linkRows(); const j = i + d;
      if (j < 0 || j >= all.length) return;
      [all[i], all[j]] = [all[j], all[i]];
      settings.links = all.map(([a, b]) => `${a} | ${b}`).join("\n"); saveSettings(); renderLinkRows(); flashSaved();
      $$("#cfg-links .linkrow")[j]?.querySelector(d < 0 ? "[data-up]" : "[data-down]")?.focus();
    };
    const btn = (ic, label, run, attr) => {
      const b = h("button", { type: "button", className: "iconbtn", title: label, innerHTML: icon(ic) });
      b.setAttribute("aria-label", `${label}: ${n || "link " + (i + 1)}`);
      if (attr) b.setAttribute(attr, "");
      b.addEventListener("click", run);
      return b;
    };
    let host = "";
    try { host = new URL(u).hostname.replace(/^www\./, ""); } catch {}
    return h("li", { className: "linkrow" },
      h("span", { className: "linkrow__ico", innerHTML: icon("link"), title: host }),
      name, url,
      btn("up", "Move up", () => move(-1), "data-up"),
      btn("down", "Move down", () => move(1), "data-down"),
      btn("trash", "Remove", () => { const all = linkRows(); all.splice(i, 1); settings.links = all.map(([a, b]) => `${a} | ${b}`).join("\n"); saveSettings(); renderLinkRows(); flashSaved("removed"); }));
  }));
  if (!rows.length) list.append(h("li", { className: "presets__empty", textContent: "no links yet." }));
  if (focusIdx >= 0) $$("#cfg-links .linkrow__name")[focusIdx]?.focus();
  syncLinksMenu();
}
$("#cfg-link-add").addEventListener("click", () => {
  const rows = linkRows();
  settings.links = [...rows.map(([a, b]) => `${a} | ${b}`), "new | https://"].join("\n");
  saveSettings();
  renderLinkRows(rows.length);
  const n = $$("#cfg-links .linkrow__name")[rows.length];
  n?.select();
});
function syncLinksMenu() { $('[data-menu="links"]').hidden = !settings.linksMenu || !links().length; }
const openLink = (url) => (settings.linksNewTab ? window.open(safeUrl(url), "_blank", "noopener") : go(url));

// data pane: backup / restore / reset
const hzKeys = () => { try { return Object.keys(localStorage).filter((k) => k.startsWith("hz.")); } catch { return []; } };
$("#cfg-export").addEventListener("click", () => {
  const data = Object.fromEntries(hzKeys().map((k) => [k, localStorage.getItem(k)]));
  const blob = new Blob([JSON.stringify({ hzos: VERSION, at: new Date().toISOString(), data }, null, 2)], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `hzos-backup-${dayKey()}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  flashSaved("exported");
});
$("#cfg-import").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  try {
    const { data } = JSON.parse(await file.text());
    const entries = Object.entries(data || {}).filter(([k, v]) => k.startsWith("hz.") && typeof v === "string");
    if (!entries.length) throw new Error("no hzOS data in that file");
    if (!confirm(`replace this browser's hzOS data with ${entries.length} saved items from ${file.name}?`)) return;
    hzKeys().forEach((k) => localStorage.removeItem(k));
    entries.forEach(([k, v]) => localStorage.setItem(k, v));
    location.reload();
  } catch (err) { log(`import: ${err.message}`, "err"); flashSaved("import failed"); }
});
$("#cfg-reset-settings").addEventListener("click", () => {
  if (!confirm("reset every setting to its default? todos, notes and layouts stay.")) return;
  resetSettings(); location.reload();
});
$("#cfg-reset-all").addEventListener("click", () => {
  if (!confirm("wipe ALL hzOS data in this browser: todos, notes, settings, layouts? this can't be undone.")) return;
  hzKeys().forEach((k) => localStorage.removeItem(k));
  location.reload();
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
  system: "open|close|max <app> · ls · layout ls|save|load|rm|startup <name> · layout reset · config [general|look|windows|startup|links|quotes|data] · tile [on|off|bento|master|hero|rebalance] · arrange · zones [app] · float [app] [on|off] · snap on|off · theme lime|amber|ice|purple|paper · name|city <x> · 12h|24h · history · clear",
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
  layout: (a = "") => {
    const [sub, ...rest] = a.split(/\s+/);
    const n = presetName(rest.join(" "));
    if (sub === "reset") return resetLayout(), log("layout: reset.", "ok");
    if (sub === "save") { const k = savePreset(n || `layout-${Object.keys(presets).length + 1}`); return log(`layout: saved ${k}`, "ok"); }
    if (sub === "load" || sub === "use") return applyPreset(n) ? log(`layout: ${n}`, "ok") : log(`layout: no layout named "${n}". try layout ls`, "err");
    if (sub === "rm") return deletePreset(n) ? log(`layout: deleted ${n}`, "ok") : log(`layout: no layout named "${n}"`, "err");
    if (sub === "startup") { settings.startLayout = presets[n] ? n : ""; saveSettings(); return log(`startup: ${settings.startLayout || "restore last session"}`, "ok"); }
    if (sub === "ls" || !sub) { const ks = Object.keys(presets).sort(); return log(ks.length ? ks.map((k) => `${k}${settings.startLayout === k ? " *" : ""}  ${fmtPreset(presets[k])}`).join("\n") : "no saved layouts. layout save <name>"); }
    log("usage: layout ls|save <name>|load <name>|rm <name>|startup <name>|reset", "err");
  },
  tile: (a) => {
    if (small()) return log("tile: needs a wider screen", "err");
    if (!a || a === "toggle") return setTile(!settings.tile);
    if (a === "on" || a === "off") return setTile(a === "on");
    if (TILE_LAYOUTS.includes(a)) return setTileLayout(a);
    if (a === "hero" || a === "promote") return promote();
    if (a === "rebalance" || a === "reset") return settings.tile ? arrangeAll() : log("tile: off", "err");
    log(`usage: tile [on|off|${TILE_LAYOUTS.join("|")}|hero|rebalance]`, "err");
  },
  arrange: () => (small() ? log("arrange: needs a wider screen", "err") : arrangeAll()),
  zones: (a = "") => {
    const app = appName(a || $(".win.is-front:not([hidden])")?.dataset.app || "");
    if (!APPS.includes(app) || small()) return log("usage: zones [app]", "err");
    openZones(app, { focusFirst: true });
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
  config: (a) => openConfig(a), settings: (a) => openConfig(a),
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
  if (link) return openLink(link.url);
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
    else if (c === "tile" || c === "snap") { pool = c === "tile" ? ["on", "off", ...TILE_LAYOUTS, "hero", "rebalance"] : ["on", "off"]; prefix = c + " "; }
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

// how often the boot log plays (config: startup > boot screen)
function shouldBoot() {
  if (handoff) return true;
  if (settings.bootMode === "never") return false;
  if (settings.bootMode === "always") return true;
  if (settings.bootMode === "session") { try { return !sessionStorage.getItem("hz.booted"); } catch { return true; } }
  return store.get("bootDay") !== dayKey();
}
// a tab that loads unseen (chrome restoring its startup tabs, a home page opening behind
// another window) waits until it is actually on screen: otherwise the boot played to nobody
const whenVisible = () => (!document.hidden ? Promise.resolve() : new Promise((r) => {
  const f = () => { if (document.hidden) return; document.removeEventListener("visibilitychange", f); r(); };
  document.addEventListener("visibilitychange", f);
}));
const BOOT_STEP = { slow: 190, normal: 110, fast: 40 };
let booting = false;
async function boot({ force = false } = {}) {
  if (booting) return;
  await whenVisible();
  if (!force && (!shouldBoot() || reduce)) return reveal(false);
  booting = true;
  store.set("bootDay", dayKey());
  try { sessionStorage.setItem("hz.booted", "1"); } catch {}
  const el = $("#boot"), pre = $("#boot-log");
  window.gsap?.killTweensOf(el);
  el.style.opacity = "";
  el.hidden = false;
  el.classList.add("is-running");
  pre.textContent = "";
  document.documentElement.classList.remove("preboot"); // the boot screen covers the desktop from here
  if (handoff && !force) await sleep(Math.max(0, 560 - performance.now())); // power-on started at first paint; let it open before text lands
  const lines = [
    ...(handoff && !force ? ["handoff from hzsh (tty1) ...... ok"] : []),
    `hzOS ${VERSION} · build ${dayKey().replace(/-/g, "")}`,
    "cpu .................... ok",
    `mount /home/${(settings.name || "user").toLowerCase()} ........ ok`,
    "net: open-meteo hn dev gh wiki .. ok",
    "games: snake type guess fps ..... ok",
    "audio: viz (three.js, lazy) ..... ok",
    `layout: ${presets[settings.startLayout] ? settings.startLayout : "last session"} · ${APPS.filter((a) => !win(a).hidden).length} windows`,
    `todo: ${todos.filter((t) => !t.done).length} open · notes: ${notesEl.value.length} ch`,
    "",
    `${greeting(new Date().getHours())}, ${(settings.name || "friend").toLowerCase()}.`,
  ];
  let skip = false;
  const stop = () => { skip = true; };
  addEventListener("keydown", stop);
  el.addEventListener("pointerdown", stop);
  const step = BOOT_STEP[settings.bootSpeed] ?? BOOT_STEP.normal;
  for (const l of lines) {
    if (skip) break;
    pre.textContent += l + "\n";
    await sleep(step);
  }
  if (!skip) await sleep(step * 3);
  removeEventListener("keydown", stop);
  el.removeEventListener("pointerdown", stop);
  el.classList.remove("is-running");
  booting = false;
  return reveal(true);
}
// lift the cover: the boot screen (or the blank pre-boot cover) fades while the open windows
// rise into place in reading order, one wave. menubar and command line are already there.
function reveal(fromBoot) {
  const root = document.documentElement, el = $("#boot");
  const animate = window.gsap && !reduce && !small() && document.body.dataset.mode === "desktop";
  const wasCovered = fromBoot || root.classList.contains("preboot") || root.classList.contains("handoff");
  if (!animate || !wasCovered) { root.classList.remove("preboot", "handoff"); el.hidden = true; return; }
  el.hidden = false; // keep the cover up for its fade even though the pre-boot class goes
  root.classList.remove("preboot", "handoff");
  const wins = $$(".win:not([hidden])").sort((x, y) => {
    const a = x.getBoundingClientRect(), b = y.getBoundingClientRect();
    return Math.round(a.top / 40) - Math.round(b.top / 40) || a.left - b.left;
  });
  gsap.to(el, { opacity: 0, duration: fromBoot ? 0.34 : 0.24, ease: "power2.out", onComplete: () => { el.hidden = true; el.style.opacity = ""; } });
  gsap.from(wins, {
    opacity: 0, y: 14, scale: 0.985, transformOrigin: "50% 0%", duration: 0.46, ease: "power3.out", delay: fromBoot ? 0.08 : 0.02,
    stagger: { each: 0.045, ease: "power1.in" }, clearProps: "opacity,transform,transformOrigin",
  });
}

async function start() {
  applyHeat(); // red prompt if they already tried hacking this session
  consoleBait();
  // carry the terminal's phosphor over for visitors who haven't picked an hzOS theme
  const savedTheme = store.get("settings", {}).theme;
  applyTheme((!savedTheme && handoff?.theme && THEMES.includes(handoff.theme)) ? handoff.theme : settings.theme || "lime");
  applyLook();
  hydrateIcons();
  APPS.forEach((app) => { enableWindow(win(app)); win(app).hidden = closed.has(app); });
  win("config").hidden = true; // settings never reopen on their own
  closed.add("config");
  // the studio layout became the default in 2.10: every desktop starts there once,
  // after that the session (or a chosen startup layout) is restored as usual
  const firstStudio = !store.get("layout.studio-default");
  if (firstStudio) store.set("layout.studio-default", true);
  if (presets[settings.startLayout] && !small()) applyPresetState(presets[settings.startLayout]);
  else if (firstStudio && presets[DEFAULT_PRESET] && !small()) applyPresetState(presets[DEFAULT_PRESET]);
  else if (firstStudio) { settings.tile = true; saveSettings(); }
  showPane(store.get("cfg.pane", "general"));
  syncLinksMenu();
  syncLayoutChip();
  syncTermDock();
  relayout();
  if (!win("viz").hidden) mountViz();
  if (!win("noise").hidden) mountNoise();
  noiseRestore();
  if (!win("game").hidden) closeApp("game"); // games don't resume across reloads
  addEventListener("resize", () => { closeZones(); syncOrientation(); syncTermDock(); relayout(); });
  renderDock();
  front("clock");
  net();
  renderTodo();
  notesMeta();
  renderFocus(); renderFocusMeta();
  renderFortune();
  tick();
  selectFeed(feedSrc);
  setMode(settings.startMode === "last" ? store.get("mode", "desktop") : settings.startMode);
  worldMap = createMap($("#map"), $("#map-pin"));
  loadWx();

  await boot();
  log("hzOS ready. type `help`.", "ok");
  armOutTimer(4000);
}
start();
