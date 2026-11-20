// Sample player: the layer runtime behind `layers` (layers.js is thin wiring).
//
// Selection model: `wanted` (id → 0..1) is the selection and survives engine
// stop/start; `live` (id → instance) exists only while the engine is active.
// An instance that is switched off fades for EDGE_S and sits in `fading` until
// it is disposed; switching it back on inside that window revives the same
// instance, so rapid toggling can never stack duplicate nodes or refetch.
//
// Recordings: one fetch + decodeAudioData per sound, cached per AudioContext,
// concurrent loads deduped (a failed load is dropped from the cache so a later
// toggle retries). Looping is an overlap crossfade (looper.js): copies of the
// same buffer start one `period` apart and cross over `fade` seconds on an
// equal-power curve, each with its own envelope gain. Copies are queued from a
// 200 ms ticker up to HORIZON seconds ahead of ctx.currentTime, and always at
// least one whole copy beyond the one sounding (period + 1 s), so a throttled
// background tab whose timers fire late (or once a minute) keeps time as long
// as a stall is shorter than the file. Buffers under NATIVE_BELOW seconds use
// loop=true. The first copy starts at a random offset so two beds never
// phase-lock. A catalogue row may set its own `fade` (seconds) where the
// recording has a steady rhythm, so the copies' beats land on each other.
//
// Builders (tones, the three streamed Myanmar recordings) are `(h, t0) => ...`
// functions wired into the small toolbox below; they sound immediately.
//
// Gain per instance = vol × trim. Start/stop fade with setTargetAtTime (τ 0.08,
// ~99% in 0.4 s), volume moves glide (τ 0.08); disposal waits DISPOSE_MS, after
// the fade has finished (below -80 dB), never mid-ramp.
//
// Long recordings are cut to their first MAX_DECODED_S seconds after decoding
// (see clip()), so a mix of long beds holds tens of MB of PCM, not hundreds.
//
// level(id) reads a small AnalyserNode (fftSize 256) on each live instance's
// output gain, so it follows the actual sound × volume; smoothing state lives
// on the instance (no per-call allocation) and non-live ids return 0.
//
// Test seam: createSampler(deps) takes everything environmental as deps, so
// node tests drive it with a fake AudioContext, a fake clock and a fetch stub:
//   catalog(id) → row | undefined      builders { id: (h, t0) => ... }
//   fetch(url) → Response-like         base   URL that `row.src` resolves against
//   isActive() → engine is playing     timers { setTimeout, clearTimeout, setInterval, clearInterval }
//   now() → ms (level smoothing)       random() → 0..1 (first-copy offset)
// It returns { api, source }: `api` is the public layers surface, `source` the
// engine.attachSource contract (init/start/has/stop). `cacheCap` (bytes,
// default defaultCacheCap()) bounds decoded PCM. `_bus`, `_cached()` and
// `_dropCache()` exist for tests only.
import { loopPlan, fadeCurves } from "./looper.js";

const TICK_MS = 200;
const HORIZON = 1.5;          // seconds of copies queued ahead of ctx.currentTime
const LOOP_FADE = 1.5;        // wanted crossfade (a row's `fade` overrides); loopPlan clamps short files to d/3
const NATIVE_BELOW = 0.25;    // shorter than this: plain loop=true
const LEAD = 0.03;            // first copy starts this far ahead (lets the graph settle)
const MICRO = 0.02;           // first copy's own tiny fade-in (no click at a random offset)
const VOL_TC = 0.08;          // volume glide
const EDGE_TC = 0.08;         // start / stop fade: 5τ = 0.4 s
const DISPOSE_MS = 750;       // after the stop fade has landed: e^(-0.75/0.08) ≈ -81 dB, so the hard stop is inaudible
// Decoded recordings longer than CLIP_ABOVE_S keep only their first
// MAX_DECODED_S seconds. Trade-off: such a bed repeats its first minute instead
// of its whole length (the crossfade hides the seam; a minute of rain or a cafe
// does not read as a loop), in exchange for 60 s of PCM per sound instead of up
// to ~270 s (a 4-bed mix of long beds went from ~300-650 MB to ~90 MB).
const MAX_DECODED_S = 60;
const CLIP_ABOVE_S = 75;      // a little over the cut, so a 62 s file is not trimmed by 2 s
const LEVEL_FFT = 256;
const LEVEL_GAIN = 16;        // RMS → 0..1: a loudness-matched sound at vol 1 reads ~0.7 (measured on white-noise in Chrome)
const MB = 2 ** 20;

// Decoded-PCM budget for the whole cache. Only buffers nobody uses (not
// selected, not fading out, not still loading) are evicted, least recently
// requested first, so the selected mix may exceed it but browsing doesn't pile
// up on top. Re-selecting an evicted sound refetches from the HTTP cache and
// decodes again. Phones and low-memory devices get half.
export function defaultCacheCap() {
  try {
    const nav = globalThis.navigator;
    const lowMem = typeof nav?.deviceMemory === "number" && nav.deviceMemory <= 4;
    const coarse = typeof globalThis.matchMedia === "function" && globalThis.matchMedia("(pointer: coarse)").matches;
    return (lowMem || coarse ? 24 : 48) * MB;
  } catch { return 48 * MB; }
}

const curves = fadeCurves();

export function createSampler({
  catalog, builders = {}, fetch, base,
  isActive = () => true, timers = globalThis,
  now = () => performance.now(), random = Math.random,
  cacheCap = defaultCacheCap(),
} = {}) {
  let ctx = null, bus = null, ticker = 0;
  const wanted = new Map();   // id → vol
  const live = new Map();     // id → instance
  const fading = new Map();   // id → instance fading out, awaiting disposal
  let on = false;             // the engine has started this source
  const failed = new Set();   // ids whose load failed (cleared by off / a fresh set)
  let cache = new Map(), cacheCtx = null; // src → { p, buf, bytes }

  // ------------------------------------------------------------ helpers

  const playable = (id) => {
    const L = catalog(id);
    return !!L && (!!builders[id] || (L.kind === "sample" && !!L.src));
  };
  const target = (inst) => inst.vol * (inst.L.trim ?? 1);
  function hold(p, t) {
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
    else { const v = p.value; p.cancelScheduledValues(t); p.setValueAtTime(v, t); }
  }
  const quiet = (n) => { try { n.disconnect(); } catch {} };

  const changeFns = new Set();
  function changed() { for (const fn of [...changeFns]) { try { fn(); } catch (e) { console.error(e); } } }

  // ------------------------------------------------------------ buffers

  function load(L) {
    if (cacheCtx !== ctx) { cache = new Map(); cacheCtx = ctx; }
    let e = cache.get(L.src);
    if (e) { cache.delete(L.src); cache.set(L.src, e); return e.p; } // most recently requested last
    const c = ctx;
    e = { p: null, buf: null, bytes: 0 };
    e.p = Promise.resolve()
      .then(() => fetch(new URL(L.src, base).href))
      .then((res) => {
        if (!res.ok) throw new Error(`${L.id}: HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((ab) => c.decodeAudioData(ab))
      .then((buf) => clip(c, buf))
      .then((buf) => {
        e.buf = buf;
        e.bytes = (buf.length || 0) * (buf.numberOfChannels || 1) * 4;
        evict();
        return buf;
      }, (err) => {
        if (cache.get(L.src) === e) cache.delete(L.src);
        throw err;
      });
    cache.set(L.src, e);
    return e.p;
  }

  // a decoded buffer over CLIP_ABOVE_S seconds becomes a copy of its first
  // MAX_DECODED_S seconds (same channels and rate); the original is dropped
  function clip(c, buf) {
    if (!(buf.duration > CLIP_ABOVE_S)) return buf;
    const n = Math.round(MAX_DECODED_S * buf.sampleRate);
    const out = c.createBuffer(buf.numberOfChannels, n, buf.sampleRate);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) out.copyToChannel(buf.getChannelData(ch).subarray(0, n), ch);
    return out;
  }

  // keep memory bounded: over the cap, drop decoded buffers nobody uses, oldest
  // request first. A live instance holds its own buffer reference, so eviction
  // only stops the cache from handing that buffer out again.
  function evict() {
    let total = 0;
    for (const e of cache.values()) total += e.bytes;
    if (total <= cacheCap) return;
    const used = new Set();
    for (const id of wanted.keys()) { const L = catalog(id); if (L?.src) used.add(L.src); }
    for (const i of fading.values()) if (i.L.src) used.add(i.L.src);
    for (const [src, e] of cache) {
      if (total <= cacheCap) break;
      if (!e.buf || used.has(src)) continue;
      cache.delete(src); total -= e.bytes;
    }
  }

  // ------------------------------------------------------------ loop

  function copy(inst, at, off, first) {
    const { buf, plan: { fade } } = inst;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const env = ctx.createGain();
    s.connect(env); env.connect(inst.gain);
    const end = at + (buf.duration - off);
    const g = env.gain;
    if (first) { g.setValueAtTime(0, at); g.linearRampToValueAtTime(1, at + MICRO); }
    else g.setValueCurveAtTime(curves.fadeIn, at, fade);
    g.setValueCurveAtTime(curves.fadeOut, end - fade, fade);
    s.start(at, off); s.stop(end);
    const rec = { s, env };
    inst.srcs.push(rec);
    s.onended = () => {
      quiet(s); quiet(env);
      const k = inst.srcs.indexOf(rec); if (k >= 0) inst.srcs.splice(k, 1);
    };
    inst.next = end - fade;
  }

  function pump(inst, t) {
    if (!inst.plan || inst.disposed) return;
    // queue the next whole copy too, so one late tick cannot leave a gap
    const ahead = Math.max(HORIZON, inst.plan.period + 1);
    while (inst.next < t + ahead) {
      if (inst.next < t) copy(inst, t + LEAD, 0, true); // fell behind (frozen tab): restart cleanly
      else copy(inst, inst.next, 0, false);
    }
  }

  function startLoop(inst, buf) {
    inst.buf = buf;
    const t0 = ctx.currentTime + LEAD;
    const d = buf.duration;
    if (d < NATIVE_BELOW) {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      s.connect(inst.gain); s.start(t0);
      inst.srcs.push({ s, env: null });
    } else {
      inst.plan = loopPlan(d, inst.L.fade ?? LOOP_FADE);
      copy(inst, t0, random() * Math.max(0, d - 2 * inst.plan.fade), true);
      pump(inst, ctx.currentTime);
      ensureTicker();
    }
    inst.started = true;
    if (live.get(inst.id) === inst) inst.gain.gain.setTargetAtTime(target(inst), t0, EDGE_TC);
  }

  // ------------------------------------------------------------ toolbox (builders)

  function toolbox(inst) {
    const { srcs, nodes } = inst.h;
    return {
      ctx, dest: inst.gain, srcs, nodes,
      keep(n) { nodes.push(n); return n; },
      gain(v = 1, to) { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); nodes.push(g); return g; },
      filter(type, f, q = 1, to) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; if (to) b.connect(to); nodes.push(b); return b; },
      osc(type, f, to) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; if (to) o.connect(to); o.start(); srcs.push(o); return o; },
    };
  }

  // ------------------------------------------------------------ instances

  function spawn(id, vol) {
    const old = fading.get(id);
    if (old) { // revive: same nodes, same buffer, ramp back up
      timers.clearTimeout(old.timer);
      fading.delete(id); live.set(id, old);
      old.vol = vol;
      if (old.started) { const p = old.gain.gain, t = ctx.currentTime; hold(p, t); p.setTargetAtTime(target(old), t, EDGE_TC); }
      return old;
    }
    const L = catalog(id);
    const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(bus);
    const an = ctx.createAnalyser(); an.fftSize = LEVEL_FFT; gain.connect(an);
    const inst = {
      id, L, vol, gain, an, srcs: [], h: { srcs: [], nodes: [] },
      buf: null, plan: null, next: 0, state: "loading", started: false, disposed: false, timer: 0,
      lvBuf: new Float32Array(LEVEL_FFT), lvV: 0, lvT: -1,
    };
    live.set(id, inst);
    const build = builders[id];
    if (build) {
      const t0 = ctx.currentTime;
      build(toolbox(inst), t0);
      inst.state = "playing"; inst.started = true;
      gain.gain.setTargetAtTime(target(inst), t0, EDGE_TC);
    } else {
      load(L).then((buf) => {
        if (inst.disposed) return;
        startLoop(inst, buf);
        inst.state = "playing";
        changed();
      }, (err) => {
        if (inst.disposed) return;
        console.warn("noise: could not load", id, err?.message || err);
        inst.state = "failed";
        if (wanted.has(id)) failed.add(id);
        if (live.get(id) === inst) live.delete(id);
        if (fading.get(id) === inst) { timers.clearTimeout(inst.timer); fading.delete(id); }
        destroy(inst);
        changed();
      });
    }
    return inst;
  }

  function setVol(inst, vol) {
    if (inst.vol === vol) return;
    inst.vol = vol;
    if (!inst.started) return; // startLoop ramps to the latest vol
    const p = inst.gain.gain, t = ctx.currentTime;
    hold(p, t); p.setTargetAtTime(target(inst), t, VOL_TC);
  }

  function dispose(inst) {
    live.delete(inst.id);
    const p = inst.gain.gain, t = ctx.currentTime;
    hold(p, t); p.setTargetAtTime(0, t, EDGE_TC);
    fading.set(inst.id, inst);
    inst.timer = timers.setTimeout(() => {
      if (fading.get(inst.id) !== inst) return;
      fading.delete(inst.id);
      destroy(inst);
    }, DISPOSE_MS);
  }

  function destroy(inst) {
    if (inst.disposed) return;
    inst.disposed = true;
    for (const { s, env } of inst.srcs) {
      s.onended = null;
      try { s.stop(); } catch {}
      quiet(s); if (env) quiet(env);
    }
    inst.srcs.length = 0;
    for (const s of inst.h.srcs) { try { s.stop(); } catch {} try { s.disconnect(); } catch {} }
    for (const n of inst.h.nodes) quiet(n);
    quiet(inst.an); quiet(inst.gain);
    if (!live.size && !fading.size) stopTicker();
    evict();
  }

  function tick() {
    if (!ctx) return;
    if (!live.size && !fading.size) { stopTicker(); return; }
    const t = ctx.currentTime;
    for (const i of live.values()) pump(i, t);
    for (const i of fading.values()) pump(i, t);
  }
  function ensureTicker() { if (!ticker) ticker = timers.setInterval(tick, TICK_MS); }
  function stopTicker() { if (ticker) timers.clearInterval(ticker); ticker = 0; }

  // bring `live` in line with `wanted`
  function sync() {
    if (!ctx || !bus || !on || !isActive()) return;
    for (const [id, vol] of wanted) {
      if (failed.has(id)) continue;
      const inst = live.get(id);
      if (inst) setVol(inst, vol);
      else if (vol > 0) spawn(id, vol);
    }
    for (const inst of [...live.values()]) if (!(wanted.get(inst.id) > 0)) dispose(inst);
  }

  function teardown() { for (const inst of [...live.values()]) dispose(inst); }

  // ------------------------------------------------------------ public

  const api = {
    set(id, vol = 0.6) {
      if (!playable(id)) return;
      vol = Math.min(1, Math.max(0, +vol || 0));
      const was = wanted.get(id);
      if (was === undefined || vol === 0) failed.delete(id); // a fresh selection retries a failed load
      if (vol > 0) wanted.set(id, vol); else wanted.delete(id);
      sync();
      if (was !== wanted.get(id)) changed();
    },
    off(id) {
      const had = wanted.delete(id);
      const wasFailed = failed.delete(id);
      sync();
      if (had || wasFailed) changed();
    },
    active() { return Object.fromEntries(wanted); },
    onChange(fn) { changeFns.add(fn); return () => changeFns.delete(fn); },
    status(id) {
      if (failed.has(id)) return "failed";
      return live.get(id)?.state ?? "idle";
    },
    // smoothed 0..1 loudness of the instance's own output (sound × volume)
    level(id) {
      const inst = live.get(id);
      if (!inst || inst.state !== "playing") return 0;
      const b = inst.lvBuf;
      inst.an.getFloatTimeDomainData(b);
      let sum = 0;
      for (let i = 0; i < b.length; i += 2) sum += b[i] * b[i];
      const tgt = Math.min(1, Math.sqrt(sum / (b.length / 2)) * LEVEL_GAIN);
      const t = now();
      const dt = inst.lvT < 0 ? 0.25 : Math.min(0.25, (t - inst.lvT) / 1000);
      inst.lvV += (tgt - inst.lvV) * (1 - Math.exp(-dt / 0.12));
      inst.lvT = t;
      return inst.lvV < 0.001 ? 0 : inst.lvV;
    },
    // debug: running instances per id (a duplicate would need a second node)
    liveCount() { const o = {}; for (const id of live.keys()) o[id] = 1; return o; },
    // debug: bookkeeping sizes per live layer (must stay bounded)
    sizes() {
      const o = {};
      for (const i of live.values()) o[i.id] = { srcs: i.srcs.length + i.h.srcs.length, nodes: i.h.nodes.length, fading: fading.size };
      return o;
    },
  };

  const source = {
    init(c, mix) { ctx = c; bus = c.createGain(); bus.gain.value = 1; bus.connect(mix); },
    // the engine starts / stops the source; a selection made while it is held
    // stopped (another source soloed) is kept but does not sound
    start() { on = true; sync(); },
    // only selected layers that have not failed can sound
    has() { for (const id of wanted.keys()) if (!failed.has(id)) return true; return false; },
    stop() { on = false; teardown(); },
  };

  return {
    api, source,
    get _bus() { return bus; },
    _cached() { return [...cache].filter(([, e]) => e.buf).map(([src]) => src); }, // tests: decoded srcs, oldest first
    _dropCache() { cache.clear(); },                                                // tests: simulate eviction of everything
  };
}
