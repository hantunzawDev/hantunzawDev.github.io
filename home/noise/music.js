// noise.app music: lazy Tone.js loader, the 16-step sequencer, genre crossfades
// and knobs. Instruments live in ./genres/*.js (one build() per genre).
//
// Timing: every note is scheduled from Tone's Transport look-ahead callback
// (Tone's clock ticks from a Web Worker, so a background tab keeps time); the
// UI playhead (`music.step`) is the only thing that goes through Tone.Draw.
//
// Graph per genre:  instruments ─► genre Gain (crossfade / level) ─► engine.mixBus
import { engine } from "./engine.js";
import { GENRES, genPattern } from "./patterns.js";
import { makeRng } from "./gen.js";
import { stats } from "./genres/kit.js";
import { techno, darkTechno, minimal, dubTechno } from "./genres/techno.js";
import { lofi, synthwave, ambient, dnb, classical } from "./genres/chill.js";

export const TONE_URL = "https://cdn.jsdelivr.net/npm/tone@15.1.22/build/Tone.js";
export const TONE_SRI = "sha384-NWoslxaf/3dYwQk+uGziDYJFdsjBpVlU1WpFRexuDFcIk/5PJpCbpVXia2Uikeix";
const XFADE = 0.8;           // seconds, genre switch
const LOOKAHEAD = 0.1;       // Tone default while visible
const LOOKAHEAD_HIDDEN = 0.3; // more headroom when the tab is backgrounded

// Builder + output gain per genre (linear). Levels measured in the browser
// (5 s peak on the mix bus at dark/density 0.5) so each genre peaks near
// -12 dBFS; the engine compressor/limiter catch the rest.
const BUILD = {
  techno: [techno, 0.31], "dark-techno": [darkTechno, 0.38], minimal: [minimal, 0.32], "dub-techno": [dubTechno, 0.36],
  lofi: [lofi, 0.28], synthwave: [synthwave, 0.29], ambient: [ambient, 1.5], dnb: [dnb, 0.23], classical: [classical, 2.6],
};
const byId = Object.fromEntries(GENRES.map((g) => [g.id, g]));
const zeros = () => new Array(16).fill(0);
const EMPTY = () => ({ kick: zeros(), hat: zeros(), perc: zeros(), bass: zeros() });
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

let T = null, boundCtx = null, transport = null, draw = null;
let toneP = null;
let selected = null;   // genre id the user wants (null = music off)
let attached = false;  // registered with the engine as the "music" source
let running = false;   // sequencer running (engine started us)
let cur = null;        // { id, out, inst, seed, pattern }
let fading = [];       // outgoing genres during a crossfade
let stepN = 0, drawPending = 0;
const seeds = new Map(); // genre → seed, fixed for the session
const knobs = { bpm: 130, dark: 0.5, density: 0.5 };
const listeners = new Set();

export const music = {
  get genre() { return selected; },
  get knobs() { return { ...knobs }; },
  steps: EMPTY(),
  step: 0,
  offline: false,
  load,
  play,
  stop,
  setKnob,
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  // debug: Tone nodes made / freed by genre builders (live must stay bounded)
  debug() { return { created: stats.created, disposed: stats.disposed, live: stats.created - stats.disposed, fading: fading.length, genre: cur?.id ?? null }; },
};

function emit() { for (const fn of [...listeners]) { try { fn(music); } catch (e) { console.error(e); } } }

// ---------------------------------------------------------------- loading

function loadTone() {
  if (window.Tone?.getTransport) return Promise.resolve(window.Tone);
  if (toneP) return toneP;
  toneP = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = TONE_URL;
    s.integrity = TONE_SRI;
    s.crossOrigin = "anonymous";
    s.async = true;
    s.onload = () => (window.Tone?.getTransport ? resolve(window.Tone) : fail());
    s.onerror = fail;
    function fail() { s.remove(); toneP = null; reject(new Error("music engine offline")); } // next play retries
    document.head.appendChild(s);
  });
  return toneP;
}

async function load() {
  try {
    T = await loadTone();
  } catch (e) {
    if (!music.offline) { music.offline = true; emit(); }
    // Let the engine see the rejection first (FAIL, or engine.error mid-play), then
    // step aside so layers/radio can play; music.play() re-attaches and retries.
    setTimeout(() => { if (attached && music.offline) { attached = false; engine.detachSource("music"); } }, 0);
    throw e;
  }
  if (music.offline) { music.offline = false; emit(); }
  const ctx = engine.ctx;
  if (ctx && boundCtx !== ctx) {
    T.setContext(ctx, !boundCtx); // first bind also closes the AudioContext Tone made at import
    boundCtx = ctx;
    transport = T.getTransport();
    draw = T.getDraw();
    setLookAhead();
    document.addEventListener("visibilitychange", setLookAhead);
  }
}

function setLookAhead() {
  if (T && boundCtx) T.getContext().lookAhead = document.hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD;
}

// ---------------------------------------------------------------- engine source

const source = {
  load,
  start() {
    running = true;
    if (T && boundCtx === engine.ctx) return startSeq();
    // attached while the engine was already past its load step
    load().then(() => { if (running) startSeq(); }, () => { running = false; });
  },
  stop() {
    running = false;
    if (!transport) return;
    transport.stop();
    transport.cancel(0);
    retire(cur, 0.05); cur = null;
    for (const f of fading.splice(0)) retire(f, 0.05);
    music.step = 0; music.steps = EMPTY();
    emit();
  },
};

function attach() {
  engine.attachSource("music", source);
  attached = true;
}

function startSeq() {
  if (!selected || cur) return;
  const g = byId[selected];
  transport.stop();
  transport.cancel(0);
  transport.position = 0;
  transport.bpm.value = knobs.bpm;
  transport.swing = g.swing;
  transport.swingSubdivision = "16n";
  stepN = 0;
  cur = spawn(selected, 0.05);
  transport.scheduleRepeat(tick, "16n", 0);
  transport.start("+0.05");
}

// ---------------------------------------------------------------- genres

function spawn(id, fadeIn) {
  const [build, level] = BUILD[id];
  if (!seeds.has(id)) seeds.set(id, (Math.random() * 2 ** 32) >>> 0);
  const out = new T.Gain(0);
  stats.created++;
  out.connect(engine.mixBus);
  const inst = build(T, out, { ...knobs });
  out.gain.rampTo(level, fadeIn);
  const g = { id, out, inst, seed: seeds.get(id), pattern: null, until: Infinity };
  g.pattern = makePattern(g, Math.floor(stepN / 16));
  return g;
}

function retire(g, fade) {
  if (!g || g.gone) return;
  const now = boundCtx.currentTime;
  g.until = Math.min(g.until, now + fade);
  g.out.gain.cancelScheduledValues(now);
  g.out.gain.rampTo(0, fade);
  clearTimeout(g.timer); // a second retire (rapid switching) only shortens the fade
  g.timer = setTimeout(() => {
    g.gone = true;
    try { g.inst.dispose(); } catch (e) { console.error(e); }
    try { g.out.dispose(); } catch {}
    stats.disposed++;
    const i = fading.indexOf(g);
    if (i >= 0) fading.splice(i, 1);
  }, (fade + T.getContext().lookAhead + 0.4) * 1000);
}

function rngFor(g, bar) {
  const block = bar >> 4;
  return (salt) => makeRng((g.seed ^ Math.imul(block + 1, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b)) >>> 0);
}

function info(g, bar, step) {
  return { bar, step, dur: 15 / transport.bpm.value, knobs, rng: rngFor(g, bar), rnd: Math.random };
}

function makePattern(g, bar) {
  const p = genPattern(g.id, knobs, bar, g.seed);
  return (g.inst.decorate && g.inst.decorate(p, info(g, bar, 0))) || p;
}

function tick(time) {
  const step = stepN % 16, bar = Math.floor(stepN / 16);
  stepN++;
  if (step === 0) for (const g of [cur, ...fading]) if (g) g.pattern = makePattern(g, bar);
  for (const g of fading) if (time < g.until) fire(g, step, time, bar);
  if (cur) fire(cur, step, time, bar);
  const pattern = cur?.pattern;
  const ui = () => { music.step = step; if (pattern && music.steps !== pattern) music.steps = pattern; };
  // Draw runs on rAF, which stalls when the page isn't rendered: set directly
  // then (and if Draw falls behind) instead of letting its queue grow.
  // A once-a-bar probe notices when rAF is back (stale events expire uncounted).
  if (document.hidden || drawPending > 32) {
    ui();
    if (step === 0 && !document.hidden) draw.schedule(() => { drawPending = 0; }, time);
  } else {
    drawPending++;
    draw.schedule(() => { drawPending = Math.max(0, drawPending - 1); ui(); }, time);
  }
}

function fire(g, step, time, bar) {
  try { g.inst.trigger(step, time, g.pattern, info(g, bar, step)); }
  catch (e) { console.error(`noise music: ${g.id} step ${step}`, e); }
}

// ---------------------------------------------------------------- public API

function play(genreId) {
  const g = byId[genreId];
  if (!g) return Promise.resolve();
  const changed = selected !== genreId;
  selected = genreId;
  if (changed) knobs.bpm = g.bpm[2];
  emit();
  const live = ["playing", "paused", "fading"].includes(engine.state);
  if (!live) {
    if (!attached) attach();
    return engine.play();
  }
  if (!attached || !running || music.offline) { attach(); return Promise.resolve(); }
  if (changed && cur) crossfade(genreId);
  else if (!cur && transport) startSeq();
  return Promise.resolve();
}

function crossfade(id) {
  const g = byId[id];
  while (fading.length >= 2) { // rapid switching: cut the oldest outgoing genre now
    const old = fading.shift();
    old.until = 0;
    retire(old, 0.03);
  }
  if (cur) { fading.push(cur); retire(cur, XFADE); }
  transport.bpm.rampTo(knobs.bpm, XFADE);
  transport.swing = g.swing;
  cur = spawn(id, XFADE);
}

function stop() {
  selected = null;
  if (attached) { attached = false; engine.detachSource("music"); }
  emit();
}

function setKnob(name, v) {
  v = Number(v);
  if (!Number.isFinite(v)) return;
  if (name === "bpm") {
    const g = byId[selected || "techno"];
    knobs.bpm = clamp(v, g.bpm[0], g.bpm[1]);
    if (transport && running) transport.bpm.rampTo(knobs.bpm, 0.5);
  } else if (name === "dark" || name === "density") {
    knobs[name] = clamp(v, 0, 1);
    if (name === "dark") for (const g of [cur, ...fading]) { try { g?.inst.setKnob?.("dark", knobs.dark); } catch (e) { console.error(e); } }
    // density lands on the next bar's pattern
  } else return;
  emit();
}
