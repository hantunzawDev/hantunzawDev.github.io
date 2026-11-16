// noise.app window: compact header (transport, readout, spectrum), a controls row
// (master volume, sleep timer), sounds / radio tabs. The sounds tab (rail, tiles,
// now-mixing strip, presets) lives in ui-sounds.js, the radio tab (vibe rail, station
// tiles) in ui-radio.js, the focus/zen mini player in ui-mini.js, the noise / radio /
// sleep commands in ui-cmd.js. This file owns the state, persistence, transport and
// the one render loop.
//
// Every live animation (header spectrum, tile glow, mini player) runs
// on ONE rAF that only ticks while something is really on screen (desktop mode,
// window open, in view, tab visible; or the mini player on the focus/zen stage).
//
// `state` is the sanitized persisted object (store key `noise`); the module
// listeners below keep it in step with the engine whether or not the window is
// open, so commands and the mini player see the same state.
import { store } from "../data.js";
import { audio } from "../audio.js";
import { icon } from "../icons.js";
import { engine } from "./engine.js";
import { layers } from "./layers.js";
import { radio } from "./radio.js";
import { CATEGORIES, LAYERS, layerOf } from "./catalog.js";
import { STATIONS, VIBES, stationById } from "./stations.js";
import { PRESETS, sanitizeState } from "./presets.js";
import { buildSounds } from "./ui-sounds.js";
import { buildRadio } from "./ui-radio.js";
import { reducedMotion, onMotionChange } from "./motion.js";
import { createMini, readColors, drawSpectrum, spectrumState } from "./ui-mini.js";
import { createCommands } from "./ui-cmd.js";

const KNOWN = { layers: LAYERS.map((l) => l.id), stations: STATIONS.map((s) => s.id), cats: CATEGORIES.map((c) => c.id), vibes: VIBES };
const TABS = ["sounds", "radio"];
const LIVE = ["playing", "paused", "fading"];
const SLEEP = [0, 15, 30, 60, 90];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const nameOf = (id) => layerOf(id)?.name ?? id;
const isLive = () => LIVE.includes(engine.state);
const isBusy = () => isLive() || engine.state === "loading";
// the transport button stops only these; paused / fading (sleep) / idle / error press "play"
const stopMode = () => engine.state === "playing" || engine.state === "loading";
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

// ---------------------------------------------------------------- state + persistence

let state = sanitizeState(store.get("noise", null), KNOWN);
let pick = store.get("noise.src", null) === "radio" && state.station ? "radio" : "none"; // "radio" | "none"
let userPresets = loadUser();
let activePreset = null;
let sleepSel = 0;
const lastVol = {};        // sound → its volume before it was switched off
const muted = new Map();   // sound → volume, muted from the strip (kept in the mix, silent)
let order = [];            // the strip's order: sounds as they were added
let saveT = 0;

function persist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { store.set("noise", state); store.set("noise.src", pick); }, 150);
}

function loadUser() {
  const raw = store.get("noise.presets", []);
  return (Array.isArray(raw) ? raw : []).filter((p) => p && typeof p.id === "string" && typeof p.name === "string").map((p) => ({
    id: p.id, name: p.name.slice(0, 24), user: true,
    layers: sanitizeState({ layers: p.layers }, KNOWN).layers,
  })).filter((p) => Object.keys(p.layers).length); // presets from the old app that held no sounds have nothing left
}

function syncOrder() {
  const act = layers.active();
  for (const id of Object.keys(act)) if (!order.includes(id)) order.push(id);
  order = order.filter((id) => id in act || muted.has(id));
}

// restore the selection into the (idle) engine at load: selection only, no sound
for (const [id, v] of Object.entries(state.layers)) layers.set(id, v);
syncOrder();
engine.setVol(state.vol);
// any layer change (window, command, preset) lands in the persisted state, window open or not
layers.onChange(() => {
  const act = layers.active();
  for (const id of Object.keys(act)) muted.delete(id);
  state.layers = act;
  syncOrder();
  persist(); renderSoon();
});

// ---------------------------------------------------------------- module sync (window open or not)

let seenStation = null, seenState = engine.state;
radio.onChange(() => {
  const st = radio.current?.id ?? null;
  if (st && st !== seenStation) { pick = "radio"; state.station = st; }
  else if (!st && seenStation) { state.station = null; pick = "none"; }
  seenStation = st;
  persist(); renderSoon();
});
engine.onChange((snap) => {
  if (Math.abs(state.vol - snap.vol) > 1e-6) { state.vol = snap.vol; persist(); }
  if (!engine.sleepLeft()) sleepSel = 0;
  if (snap.state !== seenState) { seenState = snap.state; if (snap.state === "error") announce(`noise.app: ${engine.error || "something went wrong"}`); }
  renderSoon();
});

// ---------------------------------------------------------------- transport

const hasSound = () => Object.keys(layers.active()).length > 0;
function hasSelection() { return pick === "radio" || hasSound() || muted.size > 0; }

function start() {
  if (pick === "radio" && state.station) return radio.play(state.station).catch(() => {});
  if (hasSound()) return engine.play().catch(() => {});
  announce("Nothing to play yet. Pick a sound or a preset.");
}
function stop() { engine.stop(); }
function toggle() {
  const st = engine.state;
  if (st === "playing" || st === "loading") return stop();
  // paused resumes; fading (sleep timer's last minute) cancels the fade back to full volume
  if (st === "paused" || st === "fading") return void engine.play();
  return start();
}
// nothing left to hear: return to idle rather than "playing" silence
function idleIfEmpty() {
  if (isBusy() && !radio.current && !hasSound() && !muted.size) engine.stop();
}

function clickStation(id) {
  activePreset = null;
  if (radio.current?.id === id) {
    if (radio.status === "error") { radio.stop(); return radio.play(id).catch(() => {}); }
    if (isBusy()) { radio.stop(); idleIfEmpty(); return; }
  }
  return radio.play(id).catch(() => {});
}

const failedSounds = () => Object.keys(layers.active()).filter((id) => layers.status(id) === "failed");
function retry() {
  const bad = failedSounds();
  if (bad.length) { for (const id of bad) retryLayer(id); return; }
  if (pick === "radio" && state.station && isLive()) { const id = state.station; radio.stop(); return radio.play(id).catch(() => {}); }
  return start();
}

// ---------------------------------------------------------------- sound actions

function layerOn(id, v) {
  activePreset = null;
  muted.delete(id);
  layers.set(id, v);
  lastVol[id] = v;
  if (!isBusy()) start();
}
function layerOff(id) {
  const act = layers.active();
  muted.delete(id);
  if (!(id in act)) { syncOrder(); renderSoon(); return false; }
  activePreset = null;
  lastVol[id] = act[id];
  layers.off(id);
  idleIfEmpty();
  return true;
}
function toggleLayer(id) {
  if (id in layers.active()) { layerOff(id); announce(`${nameOf(id)} off`); return; }
  layerOn(id, muted.get(id) ?? lastVol[id] ?? 0.5);
  announce(`${nameOf(id)} on`);
}
function setLayerVol(id, v) {
  activePreset = null;
  lastVol[id] = v;
  layers.set(id, v);
  if (!isBusy()) start();
}
function retryLayer(id) {
  const v = layers.active()[id] ?? lastVol[id] ?? 0.5;
  layers.off(id); // clears the failure, so the next set loads again
  layers.set(id, v);
  announce(`Retrying ${nameOf(id)}`);
  if (!isBusy()) start();
}
function muteLayer(id) {
  const v = layers.active()[id];
  if (v == null) return;
  muted.set(id, v);
  lastVol[id] = v;
  layers.off(id); // the strip keeps it (muted ids stay in `order`)
  announce(`${nameOf(id)} muted`);
}
function unmuteLayer(id) {
  const v = muted.get(id);
  if (v == null) return;
  layerOn(id, v);
  announce(`${nameOf(id)} unmuted`);
}
function removeLayer(id) {
  layerOff(id);
  announce(`${nameOf(id)} removed`);
}
function clearMix() {
  muted.clear();
  activePreset = null;
  for (const id of Object.keys(layers.active())) { lastVol[id] = layers.active()[id]; layers.off(id); }
  syncOrder();
  idleIfEmpty();
  renderSoon();
  announce("Mix cleared");
}

function setSleep(m) {
  sleepSel = m;
  engine.sleep(m);
  renderSoon();
}

// ---------------------------------------------------------------- presets

const allPresets = () => [...PRESETS, ...userPresets];
function applyPreset(id, { play = true } = {}) {
  const p = allPresets().find((x) => x.id === id);
  if (!p) return false;
  muted.clear();
  for (const lid of Object.keys(layers.active())) if (!(lid in p.layers)) layers.off(lid);
  for (const [lid, v] of Object.entries(p.layers)) { layers.set(lid, v); lastVol[lid] = v; }
  state.layers = { ...layers.active() };
  pick = "none";
  if (radio.current) radio.stop();
  if (play && !isBusy()) engine.play().catch(() => {});
  if (p.sleep) setSleep(p.sleep);
  activePreset = p.id;
  syncOrder();
  persist(); renderSoon();
  announce(`Preset ${p.name}`);
  return true;
}

function save(name) {
  name = String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
  if (!name || !hasSound()) return null;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mix";
  const p = { id: "u-" + slug, name, user: true, layers: { ...layers.active() } };
  userPresets = [...userPresets.filter((x) => x.id !== p.id), p];
  store.set("noise.presets", userPresets.map(({ id, name, layers }) => ({ id, name, layers })));
  activePreset = p.id;
  renderSoon();
  announce(`Saved preset ${p.name}`);
  return p;
}

function presetTitle(p) {
  const parts = Object.entries(p.layers).map(([id, v]) => `${nameOf(id)} ${pct(v)}`);
  if (p.sleep) parts.push(`sleep ${p.sleep}m`);
  return parts.join(" + ") || p.name;
}

// ---------------------------------------------------------------- text helpers

// now-playing text, unless the stream only echoes its own name back
function nowPlaying(st) {
  const np = (radio.nowPlaying || "").trim();
  return np && (!st || np.toLowerCase() !== st.name.toLowerCase()) ? np : "";
}
const layerSummary = (act) => Object.keys(act).map((id) => `${nameOf(id)} ${pct(act[id])}`).join(" · ");
const soundsTitle = (ids) => (ids.length > 2 ? `${ids.length} sounds` : ids.map(nameOf).join(" + "));

function info() {
  const act = layers.active(), ids = Object.keys(act);
  const p = activePreset ? allPresets().find((x) => x.id === activePreset) : null;
  const plus = ids.length ? ` + ${soundsTitle(ids)}` : "";
  if (pick === "radio" && state.station) {
    const st = stationById(state.station), np = nowPlaying(st);
    return { tag: "fm", name: st.name, desc: np ? `♪ ${np}` : `${st.vibe} radio${plus}` };
  }
  const name = p ? p.name : ids.length ? soundsTitle(ids) : muted.size ? "all muted" : "";
  return { tag: "mix", name, desc: ids.length ? layerSummary(act) : muted.size ? `${muted.size} muted` : "" };
}

function statusInfo() {
  const st = engine.state;
  if (st === "error") return { cls: "err", text: engine.error || "something went wrong", retry: true };
  if (st === "loading") return { cls: "load", text: pick === "radio" ? "tuning in…" : "starting…" };
  if (pick === "radio" && isLive()) {
    if (radio.status === "error") return { cls: "err", text: "station offline", retry: true };
    if (radio.status === "loading") return { cls: "load", text: "tuning in…" };
  }
  if (isLive()) {
    const ids = Object.keys(layers.active());
    const bad = ids.filter((id) => layers.status(id) === "failed").length;
    const busy = ids.filter((id) => layers.status(id) === "loading").length;
    if (bad) return { cls: "err", text: `${bad} sound${bad > 1 ? "s" : ""} failed to load`, retry: true };
    if (busy && st === "playing") return { cls: "load", text: `loading ${busy} sound${busy > 1 ? "s" : ""}…` };
  }
  if (st === "playing") return { cls: "on", text: pick === "radio" ? "on air" : "playing" };
  if (st === "paused") return { cls: "", text: "paused" };
  if (st === "fading") return { cls: "on", text: "fading out" };
  return { cls: "", text: hasSelection() ? "stopped · press play" : "pick a sound, or a preset" };
}

function nowLine() {
  const i = info();
  return hasSelection() ? `${i.name}${i.desc && i.desc !== i.name ? ` · ${i.desc}` : ""}` : "nothing selected";
}

// ---------------------------------------------------------------- build

let ui = null;

function announce(text) {
  if (!ui) return;
  const n = ui.live;
  n.textContent = "";
  requestAnimationFrame(() => { if (ui?.live === n) n.textContent = text; });
}

const soundsCtx = {
  h, icon,
  cat: () => state.cat,
  setCat(id) { state.cat = id; persist(); if (ui) render(); },
  act: () => layers.active(),
  status: (id) => layers.status(id),
  level: (id) => layers.level(id),
  progress: (id) => layers.progress(id),
  muted: () => muted,
  order: () => order,
  toggle: toggleLayer, setVol: setLayerVol, retry: retryLayer,
  mute: muteLayer, unmute: unmuteLayer, remove: removeLayer, clear: clearMix,
  presets: {
    all: () => allPresets(),
    active: () => activePreset,
    apply: (id) => applyPreset(id),
    save: (name) => save(name),
    describe: presetTitle,
  },
};

const radioCtx = {
  h,
  vibe: () => state.vibe,
  setVibe(id) { state.vibe = id; persist(); if (ui) render(); },
  current: () => radio.current?.id ?? null,
  status: () => radio.status,
  engineState: () => engine.state,
  analysed: () => radio.analysed,
  nowPlaying: (st) => nowPlaying(st),
  level: () => audio.level,
  click: clickStation,
};

// open on the vibe of the saved / playing station, so it is in view
function followStation() {
  const st = state.station ? stationById(state.station) : null;
  if (st && st.vibe !== state.vibe) state.vibe = st.vibe;
}

function build(root) {
  const R = {};
  R.root = root;
  root.classList.add("noise");
  root.replaceChildren();

  // header: transport · readout · spectrum
  R.play = h("button", { type: "button", class: "nz-play", onclick: () => toggle() }, h("span", { class: "nz-play__glyph", "aria-hidden": "true" }));
  R.title = h("div", { class: "nz-title" });
  R.statusText = h("span", { class: "nz-status__text" });
  R.retry = h("button", { type: "button", class: "nz-retry", text: "retry", onclick: () => retry() });
  R.status = h("div", { class: "nz-status", role: "status", "aria-live": "polite" },
    h("i", { class: "nz-status__led", "aria-hidden": "true" }), R.statusText);
  R.sub = h("div", { class: "nz-sub" });
  R.spec = h("canvas", { class: "nz-spec", "aria-hidden": "true" });
  const head = h("header", { class: "nz-head" },
    R.play,
    h("div", { class: "nz-readout" }, R.title, h("div", { class: "nz-status-row" }, R.status, R.retry), R.sub),
    R.spec);

  // controls: master volume + sleep timer
  R.vol = h("input", { type: "range", min: "0", max: "100", step: "1", class: "nz-range nz-range--master", "aria-label": "Master volume" });
  R.vol.addEventListener("input", () => engine.setVol(R.vol.value / 100));
  R.volNum = h("output", { class: "nz-ctl__num", "aria-hidden": "true" });
  const volIco = h("span", { class: "nz-ctl__ico", "aria-hidden": "true" });
  volIco.innerHTML = '<svg class="ico" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false"><path d="M1.5 4.5h2l3-2.5v8l-3-2.5h-2z"/><path d="M8.5 4.2q1 1.8 0 3.6M10 2.8q2 3.2 0 6.4"/></svg>';
  R.sleep = new Map();
  const sleepGroup = h("div", { class: "nz-sleep__chips", role: "radiogroup", "aria-label": "Sleep timer" });
  for (const m of SLEEP) {
    const b = h("button", { type: "button", role: "radio", class: "nz-sleep__chip", text: m ? `${m}m` : "off", "aria-label": m ? `sleep in ${m} minutes` : "sleep timer off", onclick: () => setSleep(m) });
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
  const sleepIco = h("span", { class: "nz-ctl__ico", "aria-hidden": "true" });
  sleepIco.innerHTML = icon("zen");
  const ctl = h("div", { class: "nz-ctl" },
    h("label", { class: "nz-ctl__vol" }, volIco, R.vol, R.volNum),
    h("div", { class: "nz-sleep" }, sleepIco, sleepGroup, R.sleepLeft));

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

  // panels
  R.panels = new Map();
  const panel = (t) => {
    const p = h("div", { class: `nz-panel nz-panel--${t}`, role: "tabpanel", id: `nz-panel-${t}`, "aria-labelledby": `nz-tab-${t}` });
    R.panels.set(t, p);
    return p;
  };
  const soundsP = panel("sounds"), radioTab = panel("radio");
  R.sounds = buildSounds(soundsCtx);
  soundsP.append(R.sounds.el);
  R.radio = buildRadio(radioCtx);
  radioTab.append(R.radio.el);

  R.live = h("p", { class: "sr-only", role: "status", "aria-live": "polite" });
  root.append(head, ctl, tablist, h("div", { class: "nz-panels" }, soundsP, radioTab), R.live);
  return R;
}

// ---------------------------------------------------------------- render

let renderQueued = false;
function renderSoon() {
  if ((!ui && !mini.on) || renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => { renderQueued = false; if (ui) render(); mini.render(); });
}

function render() {
  const R = ui, act = layers.active(), ids = Object.keys(act);
  const st = state.station ? stationById(state.station) : null;
  const busy = isBusy(), live = isLive();
  R.root.dataset.src = pick;
  R.root.dataset.state = engine.state;

  // readout
  const i = info();
  if (pick === "radio" && st) {
    R.title.textContent = st.name;
    R.title.classList.add("is-long");
    const np = nowPlaying(st);
    R.sub.textContent = np ? `♪ ${np}` : ids.length ? `+ ${layerSummary(act)}` : (radio.analysed || !live ? `${st.vibe} radio` : "playing direct · no viz");
  } else {
    R.title.textContent = i.name || "silence";
    R.title.classList.toggle("is-long", (i.name || "").length > 18);
    R.sub.textContent = ids.length ? layerSummary(act) : muted.size ? `${muted.size} muted in the mix` : "rain, brown noise, a café… or a preset";
  }
  const si = statusInfo();
  R.status.dataset.k = si.cls;
  if (R.statusText.textContent !== si.text) R.statusText.textContent = si.text;
  R.retry.hidden = !si.retry;

  // transport
  const sm = stopMode();
  R.play.dataset.k = sm ? "stop" : "play";
  R.play.setAttribute("aria-label", sm ? "Stop" : engine.state === "error" ? "Retry" : engine.state === "fading" ? "Keep playing" : "Play");
  R.play.title = sm ? "stop (space)" : engine.state === "fading" ? "keep playing, cancel the sleep fade (space)" : "play (space)";
  R.play.disabled = !sm && !hasSelection() && !["paused", "fading"].includes(engine.state);
  if (document.activeElement !== R.vol) R.vol.value = String(Math.round(state.vol * 100));
  R.vol.style.setProperty("--v", state.vol.toFixed(3));
  R.vol.setAttribute("aria-valuetext", `${pct(state.vol)} percent`);
  R.volNum.textContent = pct(state.vol);
  const sl = engine.sleepLeft();
  for (const [m, b] of R.sleep) {
    const on = (sl ? sleepSel : 0) === m;
    b.setAttribute("aria-checked", String(on));
    b.tabIndex = on ? 0 : -1;
  }
  sleepText();

  // tabs
  for (const [t, { b, badge }] of R.tabs) {
    const on = t === state.tab;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
    R.panels.get(t).hidden = !on;
    badge.textContent = t === "sounds" ? (ids.length ? String(ids.length) : "") : (pick === "radio" && busy ? "live" : "");
    badge.dataset.on = String(!!badge.textContent);
  }
  placeInk();

  R.sounds.render();
  R.radio.render();
  renderMeta();
}

// window title bar: also refreshed by the loop while a sleep timer counts down
function renderMeta() {
  const R = ui;
  if (!R?.meta) return;
  const sl = engine.sleepLeft(), n = Object.keys(layers.active()).length;
  const what = pick === "radio" ? "radio" : `${n} sound${n === 1 ? "" : "s"}`;
  const text = isLive() ? `${engine.state === "paused" ? "paused" : "▶"} ${what}${sl ? " · ☾ " + mmss(sl) : ""}` : "";
  if (R.meta.textContent !== text) R.meta.textContent = text;
}

function sleepText() {
  if (!ui) return;
  const sl = engine.sleepLeft(), t = sl ? mmss(sl) : "";
  if (ui.sleepLeft.textContent !== t) ui.sleepLeft.textContent = t;
}

function selectTab(t, user) {
  if (!TABS.includes(t)) return;
  state.tab = t;
  if (t === "radio") followStation();
  persist();
  if (ui) { render(); if (user) ui.root.querySelector(".nz-panel:not([hidden]) .nz-stage")?.scrollTo(0, 0); wake(); }
}

function placeInk() {
  const b = ui.tabs.get(state.tab)?.b;
  if (!b || !b.offsetWidth) return;
  ui.ink.style.width = `${b.offsetWidth}px`;
  ui.ink.style.transform = `translateX(${b.offsetLeft}px)`;
}

// ---------------------------------------------------------------- canvases

let colors = null;
const headSpec = spectrumState(28);

// ---------------------------------------------------------------- the one loop

// One rAF drives both the window (desktop) and the mini player (focus/zen). The two
// are never on screen together, and the loop stops as soon as neither is.
let raf = 0, lastPaint = 0, lastPoll = 0;
function visible() {
  return !!ui && !document.hidden && document.body.dataset.mode === "desktop" && !ui.win.hidden && ui.inView;
}
function wake() { if (!raf && (visible() || mini.visible())) raf = requestAnimationFrame(frame); }

function frame(now) {
  raf = 0;
  const win = visible(), mv = mini.visible();
  if (!win && !mv) return;
  raf = requestAnimationFrame(frame);
  const playing = engine.state === "playing" || engine.state === "fading";
  // reduced motion, or nothing sounding (standby scanner): 10 fps is plenty
  const plain = reducedMotion();
  if ((plain || !playing) && now - lastPaint < 100) return;
  lastPaint = now;
  audio.read(now / 1000);
  if (mv) mini.draw(now, playing);
  if (!win) return;
  drawSpectrum(headSpec, ui.spec, colors, now, playing);
  if (state.tab === "sounds") ui.sounds.frame(now, plain);
  else ui.radio.frame(now, plain);
  if (now - lastPoll > 300) { // the sleep countdown has no event of its own: touch only its text
    lastPoll = now;
    if (engine.sleepLeft()) { sleepText(); renderMeta(); }
  }
}

// ---------------------------------------------------------------- mini player + commands

const mini = createMini({
  h, icon, engine, audio,
  toggle, stopMode, hasSelection, info, status: statusInfo,
  wake: () => wake(),
});

const commands = createCommands({
  engine, layers, radio,
  toggle, stopMode, isLive, hasSelection, nowLine,
  presets: allPresets, activePreset: () => activePreset, presetTitle, applyPreset, save,
  layerOn: (id, v) => layerOn(id, v),
  layerOff: (id) => layerOff(id),
  radioOff() {
    if (!radio.current && pick !== "radio") return false;
    radio.stop();
    if (pick === "radio") { pick = "none"; state.station = null; persist(); renderSoon(); }
    idleIfEmpty();
    return true;
  },
  radioPlay(id) { activePreset = null; radio.play(id).catch(() => {}); },
  setSleep,
});

function mountMini(stageEl, opts = {}) { mini.mount(stageEl, opts); return noiseUI; }
function unmountMini() { mini.unmount(); }

// ---------------------------------------------------------------- mount / unmount

let cleanup = [];
function mount(el) {
  if (!el) return noiseUI;
  if (ui) { if (ui.root === el) return noiseUI; unmount(); }
  ui = build(el);
  ui.win = el.closest(".win") || el;
  ui.meta = ui.win.querySelector(".win__meta");
  ui.inView = true;
  seenStation = radio.current?.id ?? null;
  if (state.tab === "radio") followStation();
  colors = readColors(ui.root);

  const onKey = (e) => {
    if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey || e.key !== " ") return;
    const t = e.target;
    const typing = t instanceof HTMLElement && (t.isContentEditable || /^(TEXTAREA|SELECT)$/.test(t.tagName) || (t.tagName === "INPUT" && !["range", "checkbox", "radio", "button"].includes(t.type)));
    if (typing) return;
    // a focused control keeps its own space (activate a button, pick a radio/tab, nudge a slider)
    if (t instanceof Element && t.closest("button, input, a[href], summary, [role=button], [role=radio], [role=tab], [role=slider], [role=checkbox], [role=switch]")) return;
    e.preventDefault(); toggle();
  };
  ui.win.addEventListener("keydown", onKey);
  const onVis = () => wake();
  document.addEventListener("visibilitychange", onVis);
  const mo = new MutationObserver((recs) => {
    if (recs.some((r) => r.attributeName === "data-theme") && ui) { colors = readColors(ui.root); render(); }
    wake();
  });
  mo.observe(document.body, { attributes: true, attributeFilter: ["data-mode", "data-theme"] });
  mo.observe(ui.win, { attributes: true, attributeFilter: ["hidden"] });
  const io = new IntersectionObserver((ents) => { for (const e of ents) ui && (ui.inView = e.isIntersecting); wake(); });
  io.observe(el);
  const ro = new ResizeObserver(() => { if (ui) placeInk(); });
  ro.observe(el);
  const offRM = onMotionChange(() => { if (ui) { render(); wake(); } });
  cleanup = [
    () => ui?.win.removeEventListener("keydown", onKey),
    () => document.removeEventListener("visibilitychange", onVis),
    () => mo.disconnect(), () => io.disconnect(), () => ro.disconnect(),
    offRM,
  ];

  render();
  if (window.gsap && !reducedMotion()) {
    gsap.from(el.querySelectorAll(".nz-head, .nz-ctl, .nz-tabs, .nz-panel:not([hidden]) .nz-rail, .nz-panel:not([hidden]) .nz-stage, .nz-panel:not([hidden]) .nz-strip"),
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
  ui.sounds.destroy();
  ui.radio.destroy();
  ui.root.replaceChildren();
  ui.root.classList.remove("noise");
  if (ui.meta) ui.meta.textContent = "";
  ui = null;
  clearTimeout(saveT);
  store.set("noise", state); store.set("noise.src", pick);
}

export const noiseUI = {
  mount, unmount,
  mountMini, unmountMini,
  run: (cmd, argStr) => commands.run(cmd, argStr),
  completions: (cmd, prev) => commands.completions(cmd, prev),
  applyPreset, save, toggle,
  get state() { return state; },
  get presets() { return allPresets(); },
};
