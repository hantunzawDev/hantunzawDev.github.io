// noise.app window: header readout + spectrum ring, the 16-step sequencer strip,
// mix / music / radio tabs and the transport footer.
//
// Every live animation (ring, playhead, tile breathing, genre meter, radio scope)
// runs on ONE rAF that only ticks while the window is really on screen (desktop
// mode, window open, in view, tab visible). Knobs and faders ease on a separate
// critically damped spring runner that only runs while something is moving.
//
// `state` is the sanitized persisted object (store key `noise`); the module
// listeners below keep it in step with the engine whether or not the window is
// open, so commands and the mini player see the same state.
import { store } from "../data.js";
import { audio, bands, waveF } from "../audio.js";
import { engine } from "./engine.js";
import { layers } from "./layers.js";
import { music } from "./music.js";
import { radio } from "./radio.js";
import { LAYERS } from "./catalog.js";
import { GENRES, genPattern } from "./patterns.js";
import { STATIONS, VIBES, stationById } from "./stations.js";
import { PRESETS, sanitizeState } from "./presets.js";
import { parseNoise, parseRadio, parseSleep } from "./cmd.js";

const KNOWN = { genres: GENRES.map((g) => g.id), layers: LAYERS.map((l) => l.id), stations: STATIONS.map((s) => s.id) };
const GROUPS = ["color", "nature", "places", "brainwave"];
const TABS = ["mix", "music", "radio"];
const SRCS = ["music", "radio", "none"];
const LIVE = ["playing", "paused", "fading"];
const SLEEP = [0, 15, 30, 60, 90];
const HOT = new Set(["fire", "thunder"]); // tiles that glow amber instead of the theme accent
const ROWS = [["kick", "kk"], ["hat", "hh"], ["perc", "pc"], ["bass", "bs"]];
const PREVIEW_SEED = 0x51f15e;
const RM = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const genreOf = (id) => GENRES.find((g) => g.id === id) || GENRES[0];
const layerOf = (id) => LAYERS.find((l) => l.id === id);
const isLive = () => LIVE.includes(engine.state);
const isBusy = () => isLive() || engine.state === "loading";
const pct = (v) => String(Math.round(v * 100));
const mmss = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

// ---------------------------------------------------------------- dom helpers

function h(tag, a = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(a)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
}
const SVGNS = "http://www.w3.org/2000/svg";
function s(tag, a = {}) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(a)) n.setAttribute(k, v);
  return n;
}

// ---------------------------------------------------------------- state + persistence

let state = sanitizeState(store.get("noise", null), KNOWN);
let pick = SRCS.includes(store.get("noise.src", null)) ? store.get("noise.src", null) : state.station ? "radio" : "none";
if (pick === "radio" && !state.station) pick = "none";
let userPresets = loadUser();
let activePreset = null;
let sleepSel = 0;
const lastVol = {}; // layer → its volume before it was switched off
let saveT = 0;

function persist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { store.set("noise", state); store.set("noise.src", pick); }, 150);
}

function loadUser() {
  const raw = store.get("noise.presets", []);
  return (Array.isArray(raw) ? raw : []).filter((p) => p && typeof p.id === "string" && typeof p.name === "string").map((p) => ({
    id: p.id, name: p.name.slice(0, 24),
    genre: KNOWN.genres.includes(p.genre) ? p.genre : null,
    knobs: sanitizeState({ genre: p.genre, knobs: p.knobs }, KNOWN).knobs,
    layers: sanitizeState({ layers: p.layers }, KNOWN).layers,
  }));
}

// restore the layer selection into the (idle) engine at load: selection only, no sound
for (const [id, v] of Object.entries(state.layers)) layers.set(id, v);
engine.setVol(state.vol);
// any layer change (window, command, preset) lands in the persisted state, window open or not
layers.onChange(() => { state.layers = layers.active(); persist(); renderSoon(); });

// ---------------------------------------------------------------- module sync (window open or not)

let seenGenre = null, seenStation = null;
music.onChange(() => {
  const g = music.genre;
  if (g) {
    if (g !== seenGenre) { pick = "music"; state.genre = g; state.station = null; }
    const k = music.knobs;
    state.knobs = { bpm: k.bpm, dark: k.dark, density: k.density };
  } else if (seenGenre && pick === "music") pick = radio.current ? "radio" : "none";
  seenGenre = g;
  persist(); renderSoon();
});
radio.onChange(() => {
  const st = radio.current?.id ?? null;
  if (st && st !== seenStation) { pick = "radio"; state.station = st; }
  else if (!st && seenStation) { state.station = null; if (pick === "radio") pick = music.genre ? "music" : "none"; }
  seenStation = st;
  persist(); renderSoon();
});
engine.onChange((snap) => {
  if (Math.abs(state.vol - snap.vol) > 1e-6) { state.vol = snap.vol; persist(); }
  if (!engine.sleepLeft()) sleepSel = 0;
  renderSoon();
});

// ---------------------------------------------------------------- transport

function hasSelection() { return pick !== "none" || Object.keys(layers.active()).length > 0; }

function start() {
  if (pick === "radio" && state.station) return radio.play(state.station).catch(() => {});
  if (pick === "music") return playGenre(state.genre);
  if (Object.keys(layers.active()).length) return engine.play().catch(() => {});
  return playGenre(state.genre);
}
function stop() { engine.stop(); }
function toggle() {
  const st = engine.state;
  if (st === "playing" || st === "fading" || st === "loading") return stop();
  if (st === "paused") return void engine.play();
  return start();
}
// nothing left to hear: return to idle rather than "playing" silence
function idleIfEmpty() {
  if (isBusy() && !music.genre && !radio.current && !Object.keys(layers.active()).length) engine.stop();
}

function playGenre(id) {
  const same = id === state.genre;
  const k = { ...state.knobs };
  pick = "music"; state.station = null; state.genre = id;
  if (!same) state.knobs = { ...k, bpm: genreOf(id).bpm[2] };
  const p = music.play(id);
  music.setKnob("dark", k.dark);
  music.setKnob("density", k.density);
  if (same) music.setKnob("bpm", k.bpm);
  persist(); renderSoon();
  return Promise.resolve(p).catch(() => {});
}

function clickGenre(id) {
  activePreset = null;
  if (music.genre === id && isBusy()) { music.stop(); idleIfEmpty(); return; }
  playGenre(id);
}

function stepGenre(d) {
  const ids = KNOWN.genres, n = ids.length;
  const id = ids[(ids.indexOf(state.genre) + d + n) % n];
  activePreset = null;
  if (isBusy()) playGenre(id);
  else {
    pick = "music"; state.station = null; state.genre = id;
    state.knobs = { ...state.knobs, bpm: genreOf(id).bpm[2] };
    persist(); renderSoon();
  }
  ui?.genreCards.get(id)?.el.scrollIntoView({ block: "nearest", behavior: RM.matches ? "auto" : "smooth" });
}

function clickStation(id) {
  activePreset = null;
  if (radio.current?.id === id) {
    if (radio.status === "error") { radio.stop(); return radio.play(id).catch(() => {}); }
    if (isBusy()) { radio.stop(); idleIfEmpty(); return; }
  }
  return radio.play(id).catch(() => {});
}

function retry() {
  if (pick === "radio" && state.station && isLive()) { const id = state.station; radio.stop(); return radio.play(id).catch(() => {}); }
  if (pick === "music" && isLive()) return playGenre(state.genre);
  return start();
}

function syncLayers() {
  state.layers = { ...layers.active() };
  persist(); renderSoon();
}
function toggleLayer(id) {
  const act = layers.active();
  activePreset = null;
  if (id in act) { lastVol[id] = act[id]; layers.off(id); syncLayers(); idleIfEmpty(); return; }
  layers.set(id, lastVol[id] ?? 0.5);
  syncLayers();
  if (!isBusy()) start();
}
function setLayerVol(id, v) {
  const was = id in layers.active();
  activePreset = null;
  if (v <= 0.005) { if (was) { layers.off(id); syncLayers(); idleIfEmpty(); } return; }
  layers.set(id, v);
  lastVol[id] = v;
  syncLayers();
  if (!was && !isBusy()) start();
}

function setKnob(k, v) {
  state.knobs = { ...state.knobs, [k]: v };
  activePreset = null;
  if (music.genre === state.genre) music.setKnob(k, v);
  persist(); renderSoon();
}

function setSleep(m) {
  sleepSel = m;
  engine.sleep(m);
  renderSoon();
}

// ---------------------------------------------------------------- presets

function applyPreset(id, { play = true } = {}) {
  const p = PRESETS.find((x) => x.id === id) || userPresets.find((x) => x.id === id);
  if (!p) return false;
  for (const lid of Object.keys(layers.active())) if (!(lid in p.layers)) layers.off(lid);
  for (const [lid, v] of Object.entries(p.layers)) layers.set(lid, v);
  state.layers = { ...layers.active() };
  if (p.genre) {
    const g = genreOf(p.genre), k = p.knobs || {};
    state.genre = p.genre;
    state.knobs = { bpm: k.bpm ?? g.bpm[2], dark: k.dark ?? 0.5, density: k.density ?? 0.5 };
    pick = "music"; state.station = null;
    if (play || isBusy()) playGenre(p.genre);
  } else {
    pick = "none";
    music.stop(); radio.stop();
    if (play && !isBusy()) engine.play().catch(() => {});
  }
  if (p.sleep) setSleep(p.sleep);
  activePreset = p.id;
  persist(); renderSoon();
  return true;
}

function save(name) {
  name = String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
  if (!name) return null;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mix";
  const p = {
    id: "u-" + slug, name,
    genre: pick === "music" ? state.genre : null,
    knobs: { ...state.knobs },
    layers: { ...layers.active() },
  };
  userPresets = [...userPresets.filter((x) => x.id !== p.id), p];
  store.set("noise.presets", userPresets);
  activePreset = p.id;
  renderSoon();
  return p;
}

// ---------------------------------------------------------------- springs (knob / fader easing)

// Critically damped, solved exactly per frame so a slow frame can never overshoot.
const springs = new Set();
let springRaf = 0, springLast = 0;
const OMEGA = 40; // ~120 ms to settle
function spring(apply, x0 = 0) {
  const sp = {
    x: x0, v: 0, target: x0, apply,
    to(t, instant = false) {
      sp.target = t;
      if (instant || RM.matches) { sp.x = t; sp.v = 0; springs.delete(sp); apply(t); return; }
      springs.add(sp);
      if (!springRaf) springRaf = requestAnimationFrame(stepSprings);
    },
    kill() { springs.delete(sp); },
  };
  apply(x0);
  return sp;
}
function stepSprings(now) {
  const dt = springLast ? Math.min(0.05, (now - springLast) / 1000) : 1 / 60;
  springLast = now;
  const e = Math.exp(-OMEGA * dt);
  for (const sp of springs) {
    const c1 = sp.x - sp.target, c2 = sp.v + OMEGA * c1;
    sp.x = sp.target + (c1 + c2 * dt) * e;
    sp.v = (c2 - OMEGA * (c1 + c2 * dt)) * e;
    if (Math.abs(sp.x - sp.target) < 1e-4 && Math.abs(sp.v) < 1e-3) { sp.x = sp.target; sp.v = 0; springs.delete(sp); }
    sp.apply(sp.x);
  }
  if (springs.size) springRaf = requestAnimationFrame(stepSprings);
  else { springRaf = 0; springLast = 0; }
}

// ---------------------------------------------------------------- knob (SVG 270° arc, role=slider)

const A0 = (-135 * Math.PI) / 180, A1 = (135 * Math.PI) / 180, KR = 25;
const pt = (a, r) => [32 + r * Math.sin(a), 32 - r * Math.cos(a)];
function arc(a0, a1, r) {
  const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

function knob({ label, min, max, step, def, fmt, text, wheelStep, onInput }) {
  let lo = min, hi = max, val = def, dflt = def, disabled = false;
  const svg = s("svg", { viewBox: "0 0 64 64", class: "nz-knob__svg", "aria-hidden": "true" });
  for (let i = 0; i <= 10; i++) {
    const a = A0 + (i / 10) * (A1 - A0), major = i % 5 === 0;
    const [x0, y0] = pt(a, 29.5), [x1, y1] = pt(a, major ? 32 : 31);
    svg.append(s("line", { x1: x0, y1: y0, x2: x1, y2: y1, class: "nz-knob__tick" + (major ? " is-major" : "") }));
  }
  svg.append(s("path", { d: arc(A0, A1, KR), class: "nz-knob__track" }));
  const fill = s("path", { class: "nz-knob__fill" });
  const cap = s("circle", { cx: 32, cy: 32, r: 16.5, class: "nz-knob__cap" });
  const ptr = s("line", { class: "nz-knob__ptr" });
  const dot = s("circle", { r: 2.4, class: "nz-knob__dot" });
  svg.append(fill, cap, ptr, dot);
  const num = h("span", { class: "nz-knob__val" });
  const range = h("span", { class: "nz-knob__range" });
  const el = h("div", { class: "nz-knob", role: "slider", tabindex: "0", "aria-label": label },
    h("div", { class: "nz-knob__dial" }, svg, num),
    h("span", { class: "nz-knob__label", text: label }), range);
  const frac = (v) => (hi > lo ? (v - lo) / (hi - lo) : 0.5);
  const draw = (f) => {
    f = clamp(f, 0, 1);
    const a = A0 + f * (A1 - A0);
    fill.setAttribute("d", f > 0.004 ? arc(A0, a, KR) : "");
    const [dx, dy] = pt(a, KR), [px0, py0] = pt(a, 8), [px1, py1] = pt(a, 14.5);
    dot.setAttribute("cx", dx.toFixed(2)); dot.setAttribute("cy", dy.toFixed(2));
    ptr.setAttribute("x1", px0.toFixed(2)); ptr.setAttribute("y1", py0.toFixed(2));
    ptr.setAttribute("x2", px1.toFixed(2)); ptr.setAttribute("y2", py1.toFixed(2));
  };
  const sp = spring(draw, frac(val));
  function sync(instant) {
    el.setAttribute("aria-valuemin", String(lo));
    el.setAttribute("aria-valuemax", String(hi));
    el.setAttribute("aria-valuenow", String(+val.toFixed(3)));
    el.setAttribute("aria-valuetext", text(val));
    num.textContent = fmt(val);
    range.textContent = hi > lo ? `${fmt(lo)}–${fmt(hi)}` : "fixed";
    sp.to(frac(val), instant);
  }
  function set(v, { emit = false, instant = false } = {}) {
    v = clamp(Math.round(v / step) * step, lo, hi);
    v = +v.toFixed(4);
    const changed = v !== val;
    val = v;
    sync(instant);
    if (emit && changed) onInput(v);
  }
  let drag = null;
  el.addEventListener("pointerdown", (e) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    el.focus({ preventScroll: true });
    el.setPointerCapture(e.pointerId);
    drag = { y: e.clientY, v: val };
    el.classList.add("is-drag");
  });
  el.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const span = hi - lo, k = e.shiftKey ? 0.25 : 1;
    set(drag.v + ((drag.y - e.clientY) / 160) * span * k, { emit: true });
  });
  const end = () => { drag = null; el.classList.remove("is-drag"); };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("wheel", (e) => {
    // only once focused: scrolling the panel past a knob must not turn it
    if (disabled || document.activeElement !== el) return;
    e.preventDefault();
    set(val - Math.sign(e.deltaY || -e.deltaX) * wheelStep, { emit: true });
  }, { passive: false });
  el.addEventListener("keydown", (e) => {
    if (disabled) return;
    const big = Math.max(step, (hi - lo) / 10);
    const d = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: big, PageDown: -big }[e.key];
    if (d !== undefined) { e.preventDefault(); set(val + d * (e.shiftKey ? 5 : 1), { emit: true }); }
    else if (e.key === "Home") { e.preventDefault(); set(lo, { emit: true }); }
    else if (e.key === "End") { e.preventDefault(); set(hi, { emit: true }); }
  });
  el.addEventListener("dblclick", () => { if (!disabled) set(dflt, { emit: true }); });
  sync(true);
  return {
    el, set,
    get value() { return val; },
    setRange(a, b, d) {
      if (a === lo && b === hi && d === dflt) return;
      lo = a; hi = b; dflt = d; val = clamp(val, lo, hi); sync(false);
    },
    setDisabled(b) {
      disabled = b;
      el.setAttribute("aria-disabled", String(b));
      el.tabIndex = b ? -1 : 0;
      el.classList.toggle("is-off", b);
    },
    kill() { sp.kill(); },
  };
}

// ---------------------------------------------------------------- build

let ui = null;

function build(root) {
  const R = {};
  R.root = root;
  root.classList.add("noise");
  root.replaceChildren();

  // header: ring + readout
  R.ring = h("canvas", { class: "nz-ring__cv", width: "96", height: "96" });
  R.ringNum = h("b", { class: "nz-ring__num" });
  R.ringCap = h("small", { class: "nz-ring__cap" });
  R.kicker = h("div", { class: "nz-kicker" });
  R.title = h("div", { class: "nz-title" });
  R.statusText = h("span", { class: "nz-status__text" });
  R.statusGlyph = h("span", { class: "nz-status__glyph", "aria-hidden": "true" });
  R.retry = h("button", { type: "button", class: "nz-retry", text: "▶ retry", onclick: () => retry() });
  R.status = h("div", { class: "nz-status", role: "status", "aria-live": "polite" }, R.statusGlyph, R.statusText, R.retry);
  R.sub = h("div", { class: "nz-sub" });
  const head = h("header", { class: "nz-head" },
    h("div", { class: "nz-ring", "aria-hidden": "true" }, R.ring, h("div", { class: "nz-ring__mid" }, R.ringNum, R.ringCap)),
    h("div", { class: "nz-readout" }, R.kicker, R.title, R.status, R.sub));

  // sequencer strip: beat ruler + 4 rows × 16 cells, gutters every 4 steps
  const col = (i) => 2 + i + Math.floor(i / 4);
  const grid = h("div", { class: "nz-seq__grid" });
  grid.append(h("span", { class: "nz-seq__lab nz-seq__lab--ruler", style: "grid-row:1;grid-column:1" }));
  for (let i = 0; i < 16; i++) {
    const beat = i % 4 === 0;
    grid.append(h("span", { class: "nz-seq__tick" + (beat ? " is-beat" : ""), style: `grid-row:1;grid-column:${col(i)}`, text: beat ? String(i / 4 + 1) : "·" }));
  }
  R.cells = {};
  ROWS.forEach(([row, lab], r) => {
    grid.append(h("span", { class: "nz-seq__lab", style: `grid-row:${r + 2};grid-column:1`, text: lab }));
    R.cells[row] = [];
    for (let i = 0; i < 16; i++) {
      const c = h("i", { class: `nz-cell nz-cell--${row}`, style: `grid-row:${r + 2};grid-column:${col(i)}`, "data-v": "0" });
      R.cells[row].push(c);
      grid.append(c);
    }
  });
  R.head = h("span", { class: "nz-seq__head", style: "grid-row:1 / 6;grid-column:2" });
  grid.prepend(R.head);
  R.seqNote = h("span", { class: "nz-seq__note" });
  R.seq = h("div", { class: "nz-seq", "aria-hidden": "true" }, h("div", { class: "nz-seq__inner" }, grid, R.seqNote));
  R.col = col;

  // tabs
  R.tabs = new Map();
  R.ink = h("span", { class: "nz-tabs__ink", "aria-hidden": "true" });
  const tablist = h("div", { class: "nz-tabs", role: "tablist", "aria-label": "noise.app sections" });
  for (const t of TABS) {
    const badge = h("span", { class: "nz-tab__badge" });
    const b = h("button", {
      type: "button", role: "tab", id: `nz-tab-${t}`, "aria-controls": `nz-panel-${t}`, class: "nz-tab",
      onclick: () => selectTab(t, true),
    }, h("span", { class: "nz-tab__label", text: t }), badge);
    R.tabs.set(t, { b, badge });
    tablist.append(b);
  }
  tablist.append(R.ink);
  tablist.addEventListener("keydown", (e) => {
    const i = TABS.indexOf(state.tab);
    const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (j === undefined) return;
    e.preventDefault();
    const t = TABS[(j + TABS.length) % TABS.length];
    selectTab(t, true);
    R.tabs.get(t).b.focus();
  });
  R.tablist = tablist;

  // panels
  R.panels = new Map();
  const panel = (t) => {
    const p = h("div", { class: `nz-panel nz-panel--${t}`, role: "tabpanel", id: `nz-panel-${t}`, "aria-labelledby": `nz-tab-${t}`, tabindex: "0" });
    R.panels.set(t, p);
    return p;
  };
  const mixP = panel("mix"), musicP = panel("music"), radioP = panel("radio");
  buildMix(R, mixP);
  buildMusic(R, musicP);
  buildRadio(R, radioP);
  R.scroller = h("div", { class: "nz-panels" }, mixP, musicP, radioP);

  // footer
  R.play = h("button", { type: "button", class: "nz-play", onclick: () => toggle() },
    h("span", { class: "nz-play__glyph", "aria-hidden": "true" }));
  R.vol = h("input", { type: "range", min: "0", max: "100", step: "1", class: "nz-vol__range", "aria-label": "Master volume" });
  R.vol.addEventListener("input", () => engine.setVol(R.vol.value / 100));
  R.volNum = h("output", { class: "nz-vol__num" });
  R.sleep = new Map();
  const sleepGroup = h("div", { class: "nz-sleep__chips", role: "radiogroup", "aria-label": "Sleep timer" });
  for (const m of SLEEP) {
    const b = h("button", { type: "button", role: "radio", class: "nz-sleep__chip", text: m ? String(m) : "off", "aria-label": m ? `sleep in ${m} minutes` : "sleep timer off", onclick: () => setSleep(m) });
    R.sleep.set(m, b);
    sleepGroup.append(b);
  }
  sleepGroup.addEventListener("keydown", (e) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const cur = SLEEP.indexOf(engine.sleepLeft() ? sleepSel : 0);
    const m = SLEEP[(cur + d + SLEEP.length) % SLEEP.length];
    setSleep(m);
    R.sleep.get(m).focus();
  });
  R.sleepLeft = h("span", { class: "nz-sleep__left" });
  const foot = h("footer", { class: "nz-foot" },
    R.play,
    h("label", { class: "nz-vol" }, h("span", { class: "nz-foot__lab", text: "vol" }), R.vol, R.volNum),
    h("div", { class: "nz-sleep" }, h("span", { class: "nz-foot__lab", "aria-hidden": "true", text: "☾" }), sleepGroup, R.sleepLeft));

  root.append(head, R.seq, tablist, R.scroller, foot);
  return R;
}

function buildMix(R, p) {
  R.tiles = new Map();
  R.groupCounts = new Map();
  for (const g of GROUPS) {
    const count = h("span", { class: "nz-group__count" });
    R.groupCounts.set(g, count);
    const tiles = h("div", { class: "nz-tiles" });
    for (const L of LAYERS.filter((l) => l.group === g)) tiles.append(buildTile(R, L));
    p.append(h("section", { class: "nz-group" },
      h("header", { class: "nz-group__head" }, h("span", { class: "nz-group__name", text: g }), h("span", { class: "nz-group__rule" }), count),
      tiles));
  }
  // presets
  R.chips = h("div", { class: "nz-chips" });
  R.saveInput = h("input", { type: "text", class: "nz-save__input", placeholder: "name this mix", maxlength: "24", "aria-label": "Preset name", spellcheck: "false" });
  R.saveForm = h("form", { class: "nz-save", hidden: true }, R.saveInput, h("button", { type: "submit", class: "nz-chip nz-chip--go", text: "save ↵" }));
  R.saveForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (save(R.saveInput.value)) { R.saveInput.value = ""; R.saveForm.hidden = true; R.saveBtn.focus(); }
  });
  R.saveInput.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); R.saveForm.hidden = true; R.saveBtn.focus(); } });
  R.saveBtn = h("button", { type: "button", class: "nz-chip nz-chip--star", text: "★ save", "aria-label": "Save current mix as a preset", onclick: () => { R.saveForm.hidden = !R.saveForm.hidden; if (!R.saveForm.hidden) R.saveInput.focus(); } });
  p.append(h("section", { class: "nz-group nz-presets" },
    h("header", { class: "nz-group__head" }, h("span", { class: "nz-group__name", text: "presets" }), h("span", { class: "nz-group__rule" })),
    R.chips, R.saveForm));
}

function buildTile(R, L) {
  const fill = h("span", { class: "nz-fader__fill" });
  const fader = h("div", { class: "nz-fader", role: "slider", tabindex: "0", "aria-orientation": "vertical", "aria-label": `${L.name} volume`, "aria-valuemin": "0", "aria-valuemax": "100" },
    h("span", { class: "nz-fader__track" }, fill));
  const btn = h("button", { type: "button", class: "nz-tile__btn", "aria-pressed": "false", onclick: () => toggleLayer(L.id) },
    h("span", { class: "nz-tile__glyph", "aria-hidden": "true", text: L.glyph }),
    h("span", { class: "nz-tile__name", text: L.name }));
  const num = h("span", { class: "nz-tile__pct", "aria-hidden": "true" });
  const el = h("div", { class: "nz-tile" + (HOT.has(L.id) ? " is-hot" : ""), "data-id": L.id, "data-group": L.group }, btn, num, fader, h("span", { class: "nz-tile__lv", "aria-hidden": "true" }));
  const sp = spring((v) => el.style.setProperty("--vol", v.toFixed(3)), 0);
  const fromY = (e) => { const r = fader.getBoundingClientRect(); return clamp(1 - (e.clientY - r.top - 4) / Math.max(1, r.height - 8), 0, 1); };
  let drag = false;
  fader.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    fader.focus({ preventScroll: true });
    fader.setPointerCapture(e.pointerId);
    drag = true; el.classList.add("is-drag");
    setLayerVol(L.id, Math.round(fromY(e) * 100) / 100);
  });
  fader.addEventListener("pointermove", (e) => { if (drag) setLayerVol(L.id, Math.round(fromY(e) * 100) / 100); });
  const end = () => { drag = false; el.classList.remove("is-drag"); };
  fader.addEventListener("pointerup", end);
  fader.addEventListener("pointercancel", end);
  const cur = () => layers.active()[L.id] || 0;
  fader.addEventListener("keydown", (e) => {
    const d = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05, PageUp: 0.2, PageDown: -0.2 }[e.key];
    if (d !== undefined) { e.preventDefault(); setLayerVol(L.id, +clamp(cur() + d, 0, 1).toFixed(2)); }
    else if (e.key === "Home") { e.preventDefault(); setLayerVol(L.id, 0); }
    else if (e.key === "End") { e.preventDefault(); setLayerVol(L.id, 1); }
  });
  fader.addEventListener("wheel", (e) => { if (document.activeElement !== fader) return; e.preventDefault(); setLayerVol(L.id, +clamp(cur() - Math.sign(e.deltaY) * 0.05, 0, 1).toFixed(2)); }, { passive: false });
  R.tiles.set(L.id, { el, btn, fader, num, sp, on: null, vol: -1, lv: 0 });
  return el;
}

function buildMusic(R, p) {
  R.genreCards = new Map();
  const grid = h("div", { class: "nz-genres", role: "radiogroup", "aria-label": "Genre" });
  for (const g of GENRES) {
    const bars = [];
    const meter = h("span", { class: "nz-genre__meter", "aria-hidden": "true" });
    for (let i = 0; i < 8; i++) { const b = h("i"); bars.push(b); meter.append(b); }
    const range = g.bpm[0] === g.bpm[1] ? `${g.bpm[0]}` : `${g.bpm[0]}–${g.bpm[1]}`;
    const el = h("button", { type: "button", role: "radio", class: "nz-genre", "data-id": g.id, onclick: () => clickGenre(g.id) },
      h("span", { class: "nz-genre__top" }, h("strong", { class: "nz-genre__name", text: g.name }), h("span", { class: "nz-genre__bpm", text: range })),
      h("span", { class: "nz-genre__mood", text: g.mood }),
      meter);
    R.genreCards.set(g.id, { el, bars });
    grid.append(el);
  }
  grid.addEventListener("keydown", (e) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const ids = KNOWN.genres;
    const cur = ids.indexOf(document.activeElement?.dataset?.id ?? state.genre);
    R.genreCards.get(ids[(cur + d + ids.length) % ids.length]).el.focus();
  });
  const g0 = genreOf(state.genre);
  R.knobs = {
    bpm: knob({ label: "bpm", min: g0.bpm[0], max: g0.bpm[1], step: 1, def: g0.bpm[2], wheelStep: 1, fmt: (v) => String(Math.round(v)), text: (v) => `${Math.round(v)} beats per minute`, onInput: (v) => setKnob("bpm", v) }),
    dark: knob({ label: "dark", min: 0, max: 1, step: 0.01, def: 0.5, wheelStep: 0.05, fmt: pct, text: (v) => `${pct(v)} percent`, onInput: (v) => setKnob("dark", v) }),
    density: knob({ label: "density", min: 0, max: 1, step: 0.01, def: 0.5, wheelStep: 0.05, fmt: pct, text: (v) => `${pct(v)} percent`, onInput: (v) => setKnob("density", v) }),
  };
  p.append(grid,
    h("section", { class: "nz-group nz-knobs-wrap" },
      h("header", { class: "nz-group__head" }, h("span", { class: "nz-group__name", text: "shape" }), h("span", { class: "nz-group__rule" }), h("span", { class: "nz-group__count", text: "drag ↕ · arrows · wheel when focused" })),
      h("div", { class: "nz-knobs" }, R.knobs.bpm.el, R.knobs.dark.el, R.knobs.density.el)),
    h("p", { class: "nz-hint" }, h("kbd", { text: "[" }), " ", h("kbd", { text: "]" }), " genre · ", h("kbd", { text: "space" }), " play/stop · double-click a knob to reset"));
}

function buildRadio(R, p) {
  R.stations = new Map();
  for (const v of VIBES) {
    const list = h("ul", { class: "nz-stations" });
    for (const st of STATIONS.filter((x) => x.vibe === v)) {
      const tag = h("span", { class: "nz-st__tag" });
      const btn = h("button", { type: "button", class: "nz-st__btn", "aria-pressed": "false", onclick: () => clickStation(st.id) },
        h("span", { class: "nz-st__dot", "aria-hidden": "true" }),
        h("span", { class: "nz-st__name", text: st.name }),
        tag);
      const li = h("li", { class: "nz-st", "data-id": st.id }, btn);
      R.stations.set(st.id, { li, btn, tag });
      list.append(li);
    }
    p.append(h("section", { class: "nz-group" },
      h("header", { class: "nz-group__head" }, h("span", { class: "nz-group__name", text: v }), h("span", { class: "nz-group__rule" }), h("span", { class: "nz-group__count", text: String(STATIONS.filter((x) => x.vibe === v).length) })),
      list));
  }
  // the live strip moves into whichever row is playing
  R.scope = h("canvas", { class: "nz-scope", "aria-hidden": "true" });
  R.np = h("span", { class: "nz-st__np" });
  R.live = h("div", { class: "nz-st__live" }, R.scope, R.np);
  p.append(h("p", { class: "nz-hint", text: "internet radio · streams may drop · click a playing station to turn it off" }));
}

// ---------------------------------------------------------------- render

let renderQueued = false;
function renderSoon() {
  if ((!ui && !mini) || renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => { renderQueued = false; if (ui) render(); if (mini) renderMini(); });
}

function statusInfo() {
  const st = engine.state;
  if (st === "error") return { cls: "err", glyph: "⚠", text: engine.error || "something went wrong", retry: true };
  if (st === "loading") return { cls: "load", glyph: "◌", text: pick === "music" && !window.Tone ? "loading engine…" : pick === "radio" ? "tuning in…" : "starting…" };
  if (pick === "music" && music.offline && isLive()) return { cls: "err", glyph: "⚠", text: "music engine offline", retry: true };
  if (pick === "radio" && isLive()) {
    if (radio.status === "error") return { cls: "err", glyph: "⚠", text: "station offline", retry: true };
    if (radio.status === "loading") return { cls: "load", glyph: "◌", text: "tuning in…" };
  }
  if (st === "playing") return { cls: "on", glyph: "▶", text: pick === "radio" ? "on air" : "playing" };
  if (st === "paused") return { cls: "", glyph: "‖", text: "paused" };
  if (st === "fading") return { cls: "on", glyph: "☾", text: "fading out" };
  return { cls: "", glyph: "■", text: hasSelection() ? "stopped · press ▶" : "pick a sound, or press ▶" };
}

// now-playing text, unless the stream only echoes its own name back
function nowPlaying(st) {
  const np = (radio.nowPlaying || "").trim();
  return np && (!st || np.toLowerCase() !== st.name.toLowerCase()) ? np : "";
}

function layerSummary(act) {
  const ids = Object.keys(act);
  if (!ids.length) return "";
  return ids.map((id) => `${layerOf(id)?.name ?? id} ${pct(act[id])}`).join(" · ");
}

function render() {
  const R = ui, act = layers.active(), nLayers = Object.keys(act).length;
  const g = genreOf(state.genre), st = state.station ? stationById(state.station) : null;
  const busy = isBusy(), live = isLive();
  R.root.dataset.src = pick;
  R.root.dataset.state = engine.state;

  // readout
  if (pick === "radio" && st) {
    R.kicker.textContent = `radio · ${st.vibe}`;
    R.title.textContent = st.name;
    R.title.classList.add("is-long");
    R.ringNum.textContent = "fm";
    R.ringCap.textContent = st.vibe;
    const np = nowPlaying(st);
    R.sub.textContent = np ? `♪ ${np}` : nLayers ? `+ ${layerSummary(act)}` : (radio.analysed || !live ? "" : "playing direct · no viz");
  } else if (pick === "music") {
    R.kicker.textContent = "generated · music";
    R.title.textContent = `${g.name} · ${Math.round(state.knobs.bpm)}`;
    R.title.classList.remove("is-long");
    R.ringNum.textContent = String(Math.round(state.knobs.bpm));
    R.ringCap.textContent = "bpm";
    R.sub.textContent = nLayers ? `+ ${layerSummary(act)}` : g.mood;
  } else {
    R.kicker.textContent = "noise · mix";
    R.title.textContent = nLayers ? (nLayers > 2 ? `${nLayers} layers` : Object.keys(act).map((id) => layerOf(id)?.name ?? id).join(" + ")) : "silence";
    R.title.classList.remove("is-long");
    R.ringNum.textContent = String(nLayers);
    R.ringCap.textContent = nLayers === 1 ? "layer" : "layers";
    R.sub.textContent = nLayers ? layerSummary(act) : "rain, brown noise, café… or a preset";
  }
  const si = statusInfo();
  R.status.dataset.k = si.cls;
  R.statusGlyph.textContent = si.glyph;
  R.statusText.textContent = si.text;
  R.retry.hidden = !si.retry;

  // transport
  const stopMode = engine.state === "playing" || engine.state === "fading" || engine.state === "loading";
  R.play.dataset.k = stopMode ? "stop" : "play";
  R.play.setAttribute("aria-label", stopMode ? "Stop" : engine.state === "error" ? "Retry" : "Play");
  R.play.title = stopMode ? "stop (space)" : "play (space)";
  if (document.activeElement !== R.vol) R.vol.value = String(Math.round(state.vol * 100));
  R.vol.style.setProperty("--v", state.vol.toFixed(3));
  R.volNum.textContent = pct(state.vol);
  const sl = engine.sleepLeft();
  for (const [m, b] of R.sleep) {
    const on = (sl ? sleepSel : 0) === m;
    b.setAttribute("aria-checked", String(on));
    b.tabIndex = on ? 0 : -1;
  }
  sleepText();

  // sequencer: shown for generated music only
  R.seq.classList.toggle("is-shown", pick === "music");
  if (!(music.genre === state.genre && live && music.steps.kick.some(Boolean))) {
    const key = `${state.genre}:${state.knobs.dark}:${state.knobs.density}`;
    if (R.stepsKey !== key) {
      R.stepsKey = key;
      R.stepsRef = null;
      paintSteps(genPattern(state.genre, state.knobs, 0, PREVIEW_SEED), true);
      movePlayhead(-1);
    }
  }
  R.seqNote.textContent = g.drums ? "" : "no drums · drifting";

  // tabs
  for (const [t, { b, badge }] of R.tabs) {
    const on = t === state.tab;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
    R.panels.get(t).hidden = !on;
    badge.textContent = t === "mix" ? (nLayers ? String(nLayers) : "")
      : t === "music" ? (pick === "music" && busy ? "♪" : "")
      : (pick === "radio" && busy ? "●" : "");
    badge.dataset.on = String(!!badge.textContent);
  }
  placeInk();

  // tiles
  for (const [id, T] of R.tiles) {
    const on = id in act, v = act[id] || 0;
    if (T.on !== on) {
      T.on = on;
      T.el.classList.toggle("is-on", on);
      T.btn.setAttribute("aria-pressed", String(on));
    }
    if (T.vol !== v) {
      T.vol = v;
      T.sp.to(v);
      T.num.textContent = on ? pct(v) : "";
      T.fader.setAttribute("aria-valuenow", pct(v));
      T.fader.setAttribute("aria-valuetext", on ? `${pct(v)} percent` : "off");
    }
  }
  for (const [grp, el] of R.groupCounts) {
    const n = Object.keys(act).filter((id) => layerOf(id)?.group === grp).length;
    el.textContent = n ? `${n} on` : "";
  }
  renderChips();

  // music
  for (const [id, C] of R.genreCards) {
    const sel = id === state.genre && pick === "music";
    C.el.setAttribute("aria-checked", String(sel));
    C.el.tabIndex = sel || (pick !== "music" && id === state.genre) ? 0 : -1;
    C.el.classList.toggle("is-live", sel && busy);
  }
  R.knobs.bpm.setRange(g.bpm[0], g.bpm[1], g.bpm[2]);
  R.knobs.bpm.setDisabled(g.bpm[0] === g.bpm[1]);
  for (const k of ["bpm", "dark", "density"]) {
    if (Math.abs(R.knobs[k].value - state.knobs[k]) > 1e-6) R.knobs[k].set(state.knobs[k]);
  }

  // radio
  for (const [id, S] of R.stations) {
    const cur = pick === "radio" && state.station === id;
    const playing = cur && busy;
    S.li.classList.toggle("is-cur", cur);
    S.li.classList.toggle("is-live", playing);
    S.btn.setAttribute("aria-pressed", String(playing));
    let tag = "", k = "";
    if (cur && playing) {
      if (radio.status === "error") { tag = "station offline"; k = "err"; }
      else if (radio.status === "loading" || engine.state === "loading") { tag = "tuning…"; k = "load"; }
      else if (radio.status === "playing" && !radio.analysed) { tag = "no viz"; k = "dim"; }
      else { tag = "live"; k = "on"; }
    } else if (cur) tag = "▶";
    S.tag.textContent = tag;
    S.tag.dataset.k = k;
    S.li.dataset.k = cur ? k : "";
    if (playing && R.live.parentNode !== S.li) S.li.append(R.live);
  }
  if (!(pick === "radio" && busy)) R.live.remove();
  const np = nowPlaying(st);
  R.np.textContent = np ? `♪ ${np}` : radio.status === "error" ? "the stream did not answer. click to retry" : !radio.analysed && radio.status === "playing" ? "this station can't be analysed, so no scope" : "";

  // window title bar
  if (R.meta) R.meta.textContent = live ? `${engine.state === "paused" ? "‖" : "▶"} ${pick === "music" ? Math.round(state.knobs.bpm) + " bpm" : pick === "radio" ? "radio" : nLayers + " layers"}${sl ? " · ☾ " + mmss(sl) : ""}` : "";
}

function renderChips() {
  const R = ui;
  const all = [...PRESETS.map((p) => ({ ...p, user: false })), ...userPresets.map((p) => ({ ...p, user: true }))];
  const key = all.map((p) => p.id).join("|") + "#" + activePreset;
  if (R.chipsKey === key) return;
  R.chipsKey = key;
  const focusedId = document.activeElement?.dataset?.preset;
  R.chips.replaceChildren(...all.map((p) => {
    const b = h("button", { type: "button", class: "nz-chip" + (p.user ? " is-user" : ""), "data-preset": p.id, "aria-pressed": String(activePreset === p.id), text: (p.user ? "★ " : "") + p.name, title: presetTitle(p), onclick: () => applyPreset(p.id) });
    return b;
  }), R.saveBtn);
  if (focusedId) R.chips.querySelector(`[data-preset="${CSS.escape(focusedId)}"]`)?.focus();
}
function presetTitle(p) {
  const parts = [];
  if (p.genre) parts.push(genreOf(p.genre).name);
  for (const [id, v] of Object.entries(p.layers)) parts.push(`${layerOf(id)?.name ?? id} ${pct(v)}`);
  if (p.sleep) parts.push(`sleep ${p.sleep}m`);
  return parts.join(" + ") || p.name;
}

function sleepText() {
  if (!ui) return;
  const sl = engine.sleepLeft();
  ui.sleepLeft.textContent = sl ? mmss(sl) : "";
}

function selectTab(t, user) {
  if (!TABS.includes(t)) return;
  state.tab = t;
  persist();
  if (ui) { render(); if (user) ui.scroller.scrollTop = 0; wake(); }
}

function placeInk() {
  const b = ui.tabs.get(state.tab)?.b;
  if (!b || !b.offsetWidth) return;
  ui.ink.style.width = `${b.offsetWidth}px`;
  ui.ink.style.transform = `translateX(${b.offsetLeft}px)`;
}

// ---------------------------------------------------------------- sequencer

function paintSteps(p, preview) {
  const R = ui;
  R.seq.classList.toggle("is-preview", preview);
  for (const [row] of ROWS) {
    const vals = p[row] || [];
    R.cells[row].forEach((c, i) => {
      const v = vals[i] || 0;
      const k = v <= 0 ? "0" : row === "bass" ? "1" : v >= 2 ? "2" : "1";
      if (c.dataset.v !== k) c.dataset.v = k;
      if (row === "bass") c.style.setProperty("--n", v > 0 ? (0.3 + 0.7 * Math.min(1, (v - 1) / 12)).toFixed(2) : "0");
    });
  }
}

function movePlayhead(step) {
  const R = ui;
  if (R.hit) for (const c of R.hit) c.classList.remove("is-hit");
  R.hit = null;
  R.stepAt = step;
  if (step < 0) { R.head.hidden = true; return; }
  R.head.hidden = false;
  R.head.style.gridColumn = String(R.col(step));
  R.hit = ROWS.map(([row]) => R.cells[row][step]).filter((c) => c.dataset.v !== "0");
  for (const c of R.hit) c.classList.add("is-hit");
}

// ---------------------------------------------------------------- canvases

let colors = null;
function readColors() {
  const cs = getComputedStyle(ui.root);
  const v = (n) => cs.getPropertyValue(n).trim();
  colors = { accent: v("--lime"), hot: v("--amber"), line: v("--line"), lineHi: v("--line-hi"), dim: v("--dim"), glow: v("--glow") !== "none" };
}

const peaks = new Float32Array(32);
function drawRing(playing) {
  const cv = ui.ring, dpr = Math.min(2, devicePixelRatio || 1), S = 96;
  if (cv.width !== Math.round(S * dpr)) { cv.width = cv.height = Math.round(S * dpr); }
  const c = cv.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, S, S);
  const plain = RM.matches;
  const cx = S / 2, cy = S / 2;
  const kick = plain ? 0 : audio.beat * 6;
  const r0 = 25 + kick, maxLen = 17;
  const B = bands, gain = playing ? 1 : 0.45;

  // frame: faint outer ring with 4 cardinal ticks, inner hub ring that kicks
  c.lineWidth = 1;
  c.strokeStyle = colors.line;
  c.beginPath(); c.arc(cx, cy, 46.5, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = colors.lineHi;
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    c.beginPath(); c.moveTo(cx + Math.sin(a) * 44, cy - Math.cos(a) * 44); c.lineTo(cx + Math.sin(a) * 46.5, cy - Math.cos(a) * 46.5); c.stroke();
  }
  c.globalAlpha = playing ? 0.35 + 0.5 * (plain ? 0 : audio.beat) : 0.25;
  c.strokeStyle = colors.accent;
  c.beginPath(); c.arc(cx, cy, r0 - 3.5, 0, Math.PI * 2); c.stroke();
  c.globalAlpha = 1;

  // 64 bars, mirrored left/right (bass at the top), from the lower 48 bands
  c.lineCap = plain ? "butt" : "round";
  c.lineWidth = 1.25;
  if (colors.glow && !plain && playing) { c.shadowColor = colors.accent; c.shadowBlur = 6; }
  for (let m = 0; m < 32; m++) {
    const v = Math.min(1, B[Math.floor((m * 48) / 32)] * gain);
    if (v > peaks[m]) peaks[m] = v; else peaks[m] = Math.max(0, peaks[m] - (plain ? 0.08 : 0.012));
    const len = 1.5 + v * maxLen;
    c.strokeStyle = v > 0.72 && playing ? colors.hot : colors.accent;
    c.globalAlpha = 0.3 + 0.7 * v;
    for (const side of [1, -1]) {
      const a = side * ((m + 0.5) / 32) * Math.PI;
      const sx = Math.sin(a), cy0 = -Math.cos(a);
      c.beginPath();
      c.moveTo(cx + sx * r0, cy + cy0 * r0);
      c.lineTo(cx + sx * (r0 + len), cy + cy0 * (r0 + len));
      c.stroke();
    }
  }
  c.shadowBlur = 0;
  // peak caps: tiny dots that fall back slowly
  if (!plain && playing) {
    c.fillStyle = colors.accent;
    for (let m = 0; m < 32; m++) {
      if (peaks[m] < 0.08) continue;
      c.globalAlpha = 0.35 + 0.5 * peaks[m];
      const rr = r0 + 3 + peaks[m] * maxLen;
      for (const side of [1, -1]) {
        const a = side * ((m + 0.5) / 32) * Math.PI;
        c.fillRect(cx + Math.sin(a) * rr - 0.6, cy - Math.cos(a) * rr - 0.6, 1.2, 1.2);
      }
    }
  }
  c.globalAlpha = 1;
}

function drawScope(playing) {
  const cv = ui.scope;
  if (!cv.isConnected) return;
  const w = cv.clientWidth, hh = cv.clientHeight;
  if (!w || !hh) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hh * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
  const c = cv.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, hh);
  const mid = hh / 2;
  // baseline + quarter ticks
  c.strokeStyle = colors.line; c.lineWidth = 1;
  c.beginPath(); c.moveTo(0, mid + 0.5); c.lineTo(w, mid + 0.5); c.stroke();
  for (let k = 1; k < 4; k++) { const x = Math.round((w * k) / 4) + 0.5; c.beginPath(); c.moveTo(x, mid - 2); c.lineTo(x, mid + 3); c.stroke(); }
  if (!playing || radio.status !== "playing") return;
  if (!radio.analysed) { // direct stream: nothing to read, draw a dashed "no signal" line
    c.setLineDash([2, 4]); c.strokeStyle = colors.dim;
    c.beginPath(); c.moveTo(0, mid + 0.5); c.lineTo(w, mid + 0.5); c.stroke(); c.setLineDash([]);
    return;
  }
  const W = waveF, n = W.length, amp = mid - 2;
  if (RM.matches) { // plain bars
    c.fillStyle = colors.accent;
    const bars = Math.floor(w / 4);
    for (let i = 0; i < bars; i++) {
      const v = Math.abs(W[Math.floor((i / bars) * n)]);
      const bh = Math.max(1, v * amp * 2);
      c.fillRect(i * 4, mid - bh / 2, 2, bh);
    }
    return;
  }
  c.lineWidth = 1.4; c.lineJoin = "round"; c.strokeStyle = colors.accent;
  if (colors.glow) { c.shadowColor = colors.accent; c.shadowBlur = 5; }
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * w, y = mid - W[i] * amp * 1.6;
    if (i) c.lineTo(x, y); else c.moveTo(x, y);
  }
  c.stroke();
  c.shadowBlur = 0;
}

// ---------------------------------------------------------------- the one loop

// One rAF drives both the window (desktop) and the mini player (focus/zen). The two
// are never on screen together, and the loop stops as soon as neither is.
let raf = 0, lastPaint = 0, lastPoll = 0;
function visible() {
  return !!ui && !document.hidden && document.body.dataset.mode === "desktop" && !ui.win.hidden && ui.inView;
}
function wake() { if (!raf && (visible() || miniVisible())) raf = requestAnimationFrame(frame); }

function frame(now) {
  raf = 0;
  const win = visible(), mv = miniVisible();
  if (!win && !mv) return;
  raf = requestAnimationFrame(frame);
  if (RM.matches && now - lastPaint < 100) return; // reduced motion: 10 fps, plain bars
  lastPaint = now;
  audio.read(now / 1000);
  const playing = engine.state === "playing" || engine.state === "fading";
  if (mv) drawMini(now, playing);
  if (!win) return;
  drawRing(playing);

  // playhead follows the transport-derived step
  if (pick === "music" && music.genre === state.genre && isLive() && music.steps.kick.some(Boolean)) {
    if (music.steps !== ui.stepsRef) { ui.stepsRef = music.steps; ui.stepsKey = null; paintSteps(music.steps, false); }
    if (music.step !== ui.stepAt) movePlayhead(music.step);
  } else if (ui.stepsRef) { ui.stepsRef = null; ui.stepsKey = null; render(); }

  if (state.tab === "mix") {
    const act = layers.active();
    for (const [id, T] of ui.tiles) {
      if (!(id in act) || RM.matches) { if (T.lv) { T.lv = 0; T.el.style.setProperty("--lv", "0"); } continue; }
      const raw = layers.level(id);
      const n = clamp(raw / Math.max(0.05, act[id]), 0, 1);
      if (Math.abs(n - T.lv) > 0.004) { T.lv = n; T.el.style.setProperty("--lv", n.toFixed(3)); }
    }
  } else if (state.tab === "music") {
    const card = ui.genreCards.get(state.genre);
    const on = playing && pick === "music";
    if (card) card.bars.forEach((b, j) => {
      let v = 0;
      if (on) { for (let k = 0; k < 5; k++) v += bands[j * 5 + k]; v = Math.min(1, (v / 5) * 1.4); }
      else v = 0.12 + 0.06 * ((j * 7) % 5) / 4;
      b.style.transform = `scaleY(${(0.1 + 0.9 * v).toFixed(3)})`;
    });
  } else if (state.tab === "radio") drawScope(playing && pick === "radio");

  if (now - lastPoll > 300) { // the sleep countdown has no event of its own
    lastPoll = now;
    sleepText();
    if (ui.meta && engine.sleepLeft()) render();
  }
}

// ---------------------------------------------------------------- mini player (focus + zen)

// A glass pill at the bottom of the focus/zen stage: transport, what's on, a 24-bar
// spectrum, volume and a way back to the full window. It shows only while there is a
// selection, draws on the shared rAF, and in zen it dims to 0.2 after 4 s of no input.
const MB = 24;
const mVals = new Float32Array(MB), mPeaks = new Float32Array(MB);
let mini = null, mColors = null;

function rgba(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
function readMiniColors() {
  const cs = getComputedStyle(document.body);
  const v = (n) => cs.getPropertyValue(n).trim();
  mColors = { accent: v("--lime"), hot: v("--amber"), line: v("--line"), lineHi: v("--line-hi"), glow: v("--glow") !== "none" };
}

function buildMini() {
  const M = {};
  M.glyph = h("span", { class: "nz-mini__glyph", "aria-hidden": "true" });
  M.play = h("button", { type: "button", class: "nz-mini__play", "aria-label": "Play", onclick: () => { toggle(); poke(); } }, M.glyph);
  M.tag = h("span", { class: "nz-mini__tag" });
  M.name = h("span", { class: "nz-mini__name" });
  M.desc = h("span", { class: "nz-mini__desc" });
  M.sleep = h("span", { class: "nz-mini__sleep", title: "sleep timer" });
  M.cv = h("canvas", { class: "nz-mini__spec", width: "120", height: "28", "aria-hidden": "true" });
  M.vol = h("input", { type: "range", class: "nz-mini__range", min: "0", max: "100", step: "1", "aria-label": "Volume" });
  M.volNum = h("span", { class: "nz-mini__num", "aria-hidden": "true" });
  M.vol.addEventListener("input", () => {
    const v = clamp(+M.vol.value / 100, 0, 1);
    M.vol.style.setProperty("--v", v.toFixed(3));
    M.volNum.textContent = pct(v);
    engine.setVol(v);
  });
  M.more = h("button", { type: "button", class: "nz-mini__more", "aria-label": "Open noise.app", title: "open noise.app", text: "⋯", onclick: () => M.onExpand?.() });
  M.root = h("div", { class: "nz-mini", role: "region", "aria-label": "noise.app player" },
    M.play,
    h("div", { class: "nz-mini__info" },
      h("div", { class: "nz-mini__top" }, h("i", { class: "nz-mini__led", "aria-hidden": "true" }), M.tag, M.name),
      h("div", { class: "nz-mini__bot", role: "status", "aria-live": "polite" }, M.desc, M.sleep)),
    M.cv,
    h("div", { class: "nz-mini__vol" }, M.vol, M.volNum),
    M.more);
  M.shown = false;
  M.lastSleep = -1;
  return M;
}

function miniInfo() {
  const act = layers.active(), ids = Object.keys(act);
  const p = activePreset ? [...PRESETS, ...userPresets].find((x) => x.id === activePreset) : null;
  const names = ids.map((id) => layerOf(id)?.name ?? id);
  const plus = names.length ? ` + ${names.length > 2 ? `${names.length} layers` : names.join(" + ")}` : "";
  if (pick === "radio" && state.station) {
    const st = stationById(state.station), np = nowPlaying(st);
    return { tag: "fm", name: p ? p.name : st.name, desc: np ? `♪ ${np}` : `${st.vibe} radio${plus}` };
  }
  if (pick === "music") {
    const g = genreOf(state.genre);
    return { tag: "gen", name: p ? p.name : g.name, desc: `${p ? g.name + " · " : ""}${Math.round(state.knobs.bpm)} bpm${plus}` };
  }
  return { tag: "mix", name: p ? p.name : names.length > 2 ? `${names.length} layers` : names.join(" + "), desc: layerSummary(act) };
}

function renderMini() {
  const M = mini, show = hasSelection();
  if (show !== M.shown) {
    M.shown = show;
    M.root.classList.toggle("is-on", show);
    M.root.inert = !show;
    if (show) poke();
  }
  M.root.dataset.state = engine.state;
  M.root.dataset.src = pick;
  const busy = isBusy();
  M.play.dataset.k = busy ? "stop" : "play";
  M.play.setAttribute("aria-label", busy ? "Stop" : "Play");
  const info = miniInfo(), si = statusInfo();
  M.tag.textContent = info.tag;
  M.name.textContent = info.name || "noise";
  M.root.dataset.k = si.cls;
  M.desc.textContent = si.cls === "err" || si.cls === "load" ? `${si.glyph} ${si.text}` : info.desc;
  M.root.title = `${info.name} · ${info.desc}`;
  if (document.activeElement !== M.vol) {
    M.vol.value = pct(engine.vol);
    M.vol.style.setProperty("--v", engine.vol.toFixed(3));
    M.volNum.textContent = pct(engine.vol);
  }
  miniSleep();
  wake();
}

function miniSleep() {
  const sl = engine.sleepLeft(), sec = Math.ceil(sl / 1000);
  if (sec === mini.lastSleep) return;
  mini.lastSleep = sec;
  mini.sleep.textContent = sl ? `☾ ${mmss(sl)}` : "";
}

function miniVisible() {
  return !!mini && mini.shown && !document.hidden && mini.root.isConnected && document.body.dataset.mode !== "desktop";
}

// zen: fade to 0.2 after 4 s without pointer / key / focus; anything brings it back
function poke() {
  if (!mini) return;
  if (mini.idle) { mini.idle = false; mini.root.classList.remove("is-idle"); }
  clearTimeout(mini.idleT);
  if (mini.zen) mini.idleT = setTimeout(() => { if (mini && mini.zen) { mini.idle = true; mini.root.classList.add("is-idle"); } }, 4000);
}

function drawMini(now, playing) {
  const M = mini;
  if (now - (M.polled || 0) > 250) { M.polled = now; miniSleep(); }
  const cv = M.cv, w = cv.clientWidth, hh = cv.clientHeight;
  // the pill breathes with the music: border glow follows the level
  const lv = playing && !RM.matches ? clamp(audio.level * 1.4, 0, 1) : 0;
  if (Math.abs(lv - (M.lv || 0)) > 0.015) { M.lv = lv; M.root.style.setProperty("--lv", lv.toFixed(3)); }
  if (!w || !hh) return; // spectrum is dropped on narrow screens
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hh * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
  const c = cv.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, hh);
  const plain = RM.matches, C = mColors;
  const gap = 2, bw = (w - gap * (MB - 1)) / MB, base = hh - 1.5, top = 2, span = base - top;

  // baseline
  c.fillStyle = C.line;
  c.fillRect(0, base + 0.5, w, 1);

  if (!playing) { // standby: a row of dim dots, one slow scanner light
    const at = plain ? -1 : Math.floor(((now / 2400) % 1) * (MB + 6)) - 3;
    for (let i = 0; i < MB; i++) {
      mVals[i] *= plain ? 0 : 0.86; mPeaks[i] *= 0.9;
      const x = i * (bw + gap), d = Math.abs(i - at);
      const tail = d < 3 ? 1 - d / 3 : 0;
      const bh = Math.max(1.5, mVals[i] * span);
      c.fillStyle = tail ? rgba(C.accent, 0.25 + 0.55 * tail) : C.lineHi;
      c.fillRect(x, base - bh, bw, bh);
    }
    return;
  }

  const grad = c.createLinearGradient(0, top, 0, base);
  grad.addColorStop(0, C.accent);
  grad.addColorStop(1, rgba(C.accent, 0.28));
  if (C.glow && !plain) { c.shadowColor = rgba(C.accent, 0.6); c.shadowBlur = 6; }
  for (let i = 0; i < MB; i++) {
    // lower 48 of 64 bands, two per bar (the top 16 are mostly air)
    const t = Math.min(1, Math.pow((bands[i * 2] + bands[i * 2 + 1]) / 2, 1.4) * 1.2); // a little expansion so loud and quiet bands part
    if (plain) mVals[i] = t;
    else mVals[i] += (t - mVals[i]) * (t > mVals[i] ? 0.6 : 0.16);
    const v = mVals[i];
    if (v > mPeaks[i]) mPeaks[i] = v; else mPeaks[i] = Math.max(0, mPeaks[i] - (plain ? 1 : 0.011));
    const x = i * (bw + gap), bh = Math.max(1.5, v * span);
    c.fillStyle = grad;
    c.fillRect(x, base - bh, bw, bh);
    if (v > 0.78 && !plain) { // hot tip
      c.fillStyle = C.hot;
      c.fillRect(x, base - bh, bw, Math.min(3, bh));
    }
  }
  c.shadowBlur = 0;
  if (!plain) { // peak caps fall back slowly
    c.fillStyle = C.accent;
    for (let i = 0; i < MB; i++) {
      if (mPeaks[i] < 0.06) continue;
      c.globalAlpha = 0.4 + 0.5 * mPeaks[i];
      c.fillRect(i * (bw + gap), Math.round(base - 3 - mPeaks[i] * span), bw, 1);
    }
    c.globalAlpha = 1;
  }
}

let miniOff = [];
function mountMini(stageEl, opts = {}) {
  if (!stageEl) return noiseUI;
  if (!mini) {
    mini = buildMini();
    audio.retain();
    const onAny = () => poke();
    const onVis = () => wake();
    const evs = ["pointermove", "pointerdown", "keydown", "focusin", "wheel", "touchstart"];
    for (const ev of evs) addEventListener(ev, onAny, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onVis);
    const mo = new MutationObserver(() => { readMiniColors(); wake(); });
    mo.observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });
    const onRM = () => wake();
    RM.addEventListener("change", onRM);
    miniOff = [
      () => { for (const ev of evs) removeEventListener(ev, onAny, { capture: true }); },
      () => document.removeEventListener("visibilitychange", onVis),
      () => mo.disconnect(),
      () => RM.removeEventListener("change", onRM),
    ];
  }
  if (opts.onExpand) mini.onExpand = opts.onExpand;
  mini.zen = stageEl.id === "stage-zen";
  if (mini.root.parentNode !== stageEl) stageEl.append(mini.root);
  readMiniColors();
  renderMini();
  poke();
  wake();
  return noiseUI;
}

function unmountMini() {
  if (!mini) return;
  clearTimeout(mini.idleT);
  for (const fn of miniOff) fn();
  miniOff = [];
  mini.root.remove();
  mini = null;
  audio.release();
}

// ---------------------------------------------------------------- commands (noise / radio / sleep)

const USAGE = {
  noise: "usage: noise [genre|preset|layer [0-100]] · noise off <layer> · noise bpm|dark|density|vol <n> · noise save <name> · noise list",
  radio: "usage: radio [station|off] · radio lists the stations",
  sleep: "usage: sleep <1-600>m|<n>h|off",
};
const allPresets = () => [...PRESETS, ...userPresets];
const known = () => ({ ...KNOWN, presets: allPresets().map((p) => p.id) });
function nowLine() {
  const info = miniInfo();
  return hasSelection() ? `${info.name}${info.desc && info.desc !== info.name ? ` · ${info.desc}` : ""}` : "nothing selected";
}
const fail = (cmd, message) => (message.startsWith("usage:") ? [[`${cmd}: ${message}`, "err"]] : [[`${cmd}: ${message}`, "err"], [USAGE[cmd], "err"]]);

function run(cmd, argStr = "") {
  const words = String(argStr).trim().split(/\s+/).filter(Boolean);
  const args = words[0]?.toLowerCase() === "save" ? ["save", ...words.slice(1)] : words.map((w) => w.toLowerCase());
  if (cmd === "noise") return runNoise(args);
  if (cmd === "radio") return runRadio(args);
  if (cmd === "sleep") return runSleep(args);
  return [[`${cmd}: unknown`, "err"]];
}

function runNoise(args) {
  const r = parseNoise(args, known());
  switch (r.type) {
    case "error": return fail("noise", r.message);
    case "toggle": {
      const was = isBusy() && engine.state !== "paused";
      toggle();
      return was ? [["noise: ■ stopped"]] : [[`noise: ▶ ${nowLine()}`, "ok"]];
    }
    case "list": {
      const sel = activePreset;
      const st = engine.state === "playing" ? "▶" : engine.state === "idle" ? "■" : engine.state;
      return [
        [`now      ${st} ${nowLine()} · vol ${pct(engine.vol)}${engine.sleepLeft() ? ` · ☾ ${mmss(engine.sleepLeft())}` : ""}`, "ok"],
        [`genres   ${KNOWN.genres.map((id) => (pick === "music" && state.genre === id ? `[${id}]` : id)).join(" ")}`],
        [`layers   ${KNOWN.layers.map((id) => (id in layers.active() ? `[${id} ${pct(layers.active()[id])}]` : id)).join(" ")}`],
        [`presets  ${allPresets().map((p) => (p.id === sel ? `[${p.id}]` : p.id)).join(" ")}`],
        ["radio    radio lists the stations · sleep 30m fades out and stops", "dim"],
      ];
    }
    case "save": {
      const p = save(r.name);
      return p ? [[`noise: saved ★ ${p.name} · play it with: noise ${p.id}`, "ok"]] : fail("noise", "usage: noise save <name>");
    }
    case "layerOff": {
      const act = layers.active();
      if (!(r.id in act)) return [[`noise: ${layerOf(r.id).name} is not on`]];
      lastVol[r.id] = act[r.id];
      activePreset = null;
      layers.off(r.id);
      idleIfEmpty();
      return [[`noise: ${layerOf(r.id).name} off`, "ok"]];
    }
    case "vol":
      engine.setVol(r.vol);
      return [[`noise: vol ${pct(r.vol)}`, "ok"]];
    case "knob": {
      let v = r.value, note = "";
      if (r.knob === "bpm") {
        const g = genreOf(state.genre);
        v = clamp(Math.round(v), g.bpm[0], g.bpm[1]);
        if (v !== r.value) note = ` (${g.name} runs ${g.bpm[0]}-${g.bpm[1]})`;
      }
      setKnob(r.knob, v);
      return [[`noise: ${r.knob} ${r.knob === "bpm" ? v : v.toFixed(2)}${note}`, "ok"]];
    }
    case "layer": {
      activePreset = null;
      layers.set(r.id, r.vol);
      lastVol[r.id] = r.vol;
      if (!isBusy()) start();
      return [[`noise: + ${layerOf(r.id).name} ${pct(r.vol)}`, "ok"]];
    }
    case "preset": {
      applyPreset(r.id);
      const p = allPresets().find((x) => x.id === r.id);
      return [[`noise: ▶ ${p.name} · ${presetTitle(p)}`, "ok"]];
    }
    case "genre":
      activePreset = null;
      playGenre(r.id);
      return [[`noise: ▶ ${genreOf(r.id).name} · ${Math.round(state.knobs.bpm)} bpm`, "ok"]];
  }
  return fail("noise", "usage");
}

function runRadio(args) {
  const r = parseRadio(args, known());
  if (r.type === "error") return fail("radio", r.message);
  if (r.type === "off") {
    if (!radio.current && pick !== "radio") return [["radio: already off"]];
    radio.stop();
    if (pick === "radio") { pick = "none"; state.station = null; persist(); renderSoon(); }
    idleIfEmpty();
    return [["radio: off", "ok"]];
  }
  if (r.type === "play") {
    activePreset = null;
    const st = stationById(r.id);
    radio.play(r.id).catch(() => {});
    return [[`radio: tuning in ${st.name} · ${st.vibe}`, "ok"]];
  }
  const w = Math.max(...STATIONS.map((s) => s.id.length));
  return [
    ...VIBES.flatMap((vibe) => STATIONS.filter((s) => s.vibe === vibe).map((s) => {
      const cur = radio.current?.id === s.id;
      return [`${cur ? "▶" : " "} ${s.id.padEnd(w)}  ${s.name} · ${s.vibe}`, cur ? "ok" : ""];
    })),
    ["radio <station> tunes in · radio off", "dim"],
  ];
}

function runSleep(args) {
  const r = parseSleep(args);
  if (r.type === "error") return fail("sleep", r.message);
  if (r.type === "off") { setSleep(0); return [["sleep: off", "ok"]]; }
  setSleep(r.minutes);
  const hrs = Math.floor(r.minutes / 60), m = r.minutes % 60;
  const len = hrs ? `${hrs}h${m ? ` ${m}m` : ""}` : `${m}m`;
  return [[`sleep: fades out over the last minute and stops in ${len}${isLive() ? "" : " (nothing is playing yet)"}`, "ok"]];
}

// tab completion pools for os.js
function completions(cmd, prev) {
  if (cmd === "radio") return ["off", ...KNOWN.stations];
  if (cmd === "sleep") return ["15m", "30m", "1h", "90m", "off"];
  if (cmd === "noise" && prev === "off") return Object.keys(layers.active()).length ? Object.keys(layers.active()) : KNOWN.layers;
  if (cmd === "noise") return ["list", "save", "off", "bpm", "dark", "density", "vol", ...allPresets().map((p) => p.id), ...KNOWN.genres, ...KNOWN.layers];
  return [];
}

// ---------------------------------------------------------------- mount / unmount

let cleanup = [];
function mount(el) {
  if (!el) return noiseUI;
  if (ui) { if (ui.root === el) return noiseUI; unmount(); }
  audio.retain();
  ui = build(el);
  ui.win = el.closest(".win") || el;
  ui.meta = ui.win.querySelector(".win__meta");
  ui.inView = true;
  seenGenre = music.genre; seenStation = radio.current?.id ?? null;
  readColors();

  const onKey = (e) => {
    if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return;
    const t = e.target;
    const typing = t instanceof HTMLElement && (t.isContentEditable || /^(TEXTAREA|SELECT)$/.test(t.tagName) || (t.tagName === "INPUT" && !["range", "checkbox", "radio", "button"].includes(t.type)));
    if (typing) return;
    if (e.key === " ") {
      // a focused control keeps its own space (activate a button, pick a radio/tab, nudge a slider)
      if (t instanceof Element && t.closest("button, a[href], summary, [role=button], [role=radio], [role=tab], [role=slider], [role=checkbox], [role=switch]")) return;
      e.preventDefault(); toggle();
    }
    else if (e.key === "[" || e.key === "]") { e.preventDefault(); stepGenre(e.key === "]" ? 1 : -1); }
  };
  ui.win.addEventListener("keydown", onKey);
  const onVis = () => wake();
  document.addEventListener("visibilitychange", onVis);
  const mo = new MutationObserver((recs) => {
    if (recs.some((r) => r.attributeName === "data-theme")) { readColors(); render(); }
    wake();
  });
  mo.observe(document.body, { attributes: true, attributeFilter: ["data-mode", "data-theme"] });
  mo.observe(ui.win, { attributes: true, attributeFilter: ["hidden"] });
  const io = new IntersectionObserver((ents) => { for (const e of ents) ui && (ui.inView = e.isIntersecting); wake(); });
  io.observe(el);
  const ro = new ResizeObserver(() => { if (ui) placeInk(); });
  ro.observe(el);
  const onRM = () => { if (ui) { render(); wake(); } };
  RM.addEventListener("change", onRM);
  cleanup = [
    () => ui?.win.removeEventListener("keydown", onKey),
    () => document.removeEventListener("visibilitychange", onVis),
    () => mo.disconnect(), () => io.disconnect(), () => ro.disconnect(),
    () => RM.removeEventListener("change", onRM),
  ];

  render();
  if (window.gsap && !RM.matches) {
    gsap.from(el.querySelectorAll(".nz-head, .nz-seq.is-shown, .nz-tabs, .nz-panel:not([hidden]) .nz-group, .nz-panel:not([hidden]) .nz-genres, .nz-foot"),
      { opacity: 0, y: 6, duration: 0.32, stagger: 0.035, ease: "power2.out", clearProps: "opacity,transform" });
  }
  wake();
  return noiseUI;
}

function unmount() {
  if (!ui) return;
  cancelAnimationFrame(raf); raf = 0;
  for (const fn of cleanup) fn();
  cleanup = [];
  for (const T of ui.tiles.values()) T.sp.kill();
  for (const k of Object.values(ui.knobs)) k.kill();
  ui.root.replaceChildren();
  ui.root.classList.remove("noise");
  if (ui.meta) ui.meta.textContent = "";
  ui = null;
  audio.release();
  clearTimeout(saveT);
  store.set("noise", state); store.set("noise.src", pick);
}

export const noiseUI = {
  mount, unmount,
  mountMini, unmountMini, run, completions,
  applyPreset, save, toggle,
  get state() { return state; },
  get presets() { return [...PRESETS, ...userPresets]; },
};
