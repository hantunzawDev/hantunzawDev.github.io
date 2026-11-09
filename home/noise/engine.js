// noise.app audio engine: one AudioContext, one bus chain, the transport state
// machine, the sleep timer, and the hand-off to audio.js for visuals.
//
//   sources ─► mixBus ─► master ─► compressor ─► limiter ─► destination
//                         └─► tap ─► audio.js analyser (never to the speakers)
//
// Every state change goes through machine.js `transition`. Sources (layers now,
// music/radio later) plug in with attachSource(); the engine starts them when
// playback begins and stops them when it returns to idle.
import { transition } from "./machine.js";
import { audio } from "../audio.js";

const FADE_IN_TC = 0.1;    // setTargetAtTime constant: ~98% of the way in 0.4 s
const PAUSE_TC = 0.0625;   // ~98% in 0.25 s
const SLEEP_FADE_S = 60;   // linear fade over the last minute
const RESUME_TIMEOUT_MS = 4000;

let ctx = null, mixBus = null, master = null, tap = null;
let state = "idle", vol = 0.7, error = null;
let epoch = 0;               // bumps on stop/restart so stale async work bows out
let loadingP = null;
let suspendTimer = 0, sleepTimers = [], sleepEnd = 0;
let ownsNoise = false, holding = false, claimToken = 0;
const sources = new Map();   // name → { start, stop, node, init, load, started }
const listeners = new Set();

export const engine = {
  get ctx() { return ctx; },
  get mixBus() { return mixBus; },
  get master() { return master; },
  get state() { return state; },
  get vol() { return vol; },
  get error() { return error; },
  play, pause, stop, setVol, sleep, sleepLeft,
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  attachSource, detachSource,
};

function emit() {
  const snap = { state, vol, error, sleepLeft: sleepLeft() };
  for (const fn of [...listeners]) { try { fn(snap, engine); } catch (e) { console.error(e); } }
}

function dispatch(event) {
  const next = transition(state, event);
  if (next === state) return false;
  state = next;
  emit();
  return true;
}

function ensureCtx() {
  if (ctx) return ctx;
  ctx = new AudioContext({ latencyHint: "playback" });
  mixBus = ctx.createGain();
  master = ctx.createGain();
  master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 3; comp.knee.value = 12;
  comp.attack.value = 0.01; comp.release.value = 0.25;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1; limiter.ratio.value = 20; limiter.knee.value = 0;
  limiter.attack.value = 0.001; limiter.release.value = 0.1;
  mixBus.connect(master); master.connect(comp); comp.connect(limiter); limiter.connect(ctx.destination);
  tap = ctx.createGain();
  master.connect(tap);
  audio.attachNode(tap, ctx);
  for (const src of sources.values()) wire(src);
  return ctx;
}

function wire(src) {
  if (!ctx || src.wired) return;
  src.wired = true;
  src.init?.(ctx, mixBus);
  if (src.node) src.node.connect(mixBus);
}

// Plug in a sound source. `start()`/`stop()` run on entering playing / idle;
// `load()` (optional, async) runs while `loading` and a rejection becomes FAIL;
// `node` (optional) is connected to the mix bus, or `init(ctx, mixBus)` (optional)
// is called once the context exists, for sources that build their own nodes.
function attachSource(name, src) {
  detachSource(name);
  const rec = { ...src, wired: false, started: false };
  sources.set(name, rec);
  wire(rec);
  if (state === "playing" || state === "paused" || state === "fading") {
    if (!rec.load) startSource(rec);
    else Promise.resolve().then(() => rec.load()).then(() => {
      if (sources.get(name) === rec && (state === "playing" || state === "paused" || state === "fading")) startSource(rec);
    }, (e) => {
      if (sources.get(name) !== rec) return;
      error = e?.message || String(e); // FAIL is only legal from loading; surface it without dropping playback
      dispatch("FAIL"); emit();
    });
  }
  return () => { if (sources.get(name) === rec) detachSource(name); };
}

function detachSource(name) {
  const rec = sources.get(name);
  if (!rec) return;
  stopSource(rec);
  try { rec.node?.disconnect(); } catch {}
  sources.delete(name);
}

function startSource(rec) {
  if (rec.started) return;
  rec.started = true;
  try { rec.start?.(); } catch (e) { console.error("noise source start failed", e); }
}
function stopSource(rec) {
  if (!rec.started) return;
  rec.started = false;
  try { rec.stop?.(); } catch (e) { console.error("noise source stop failed", e); }
}

// Re-anchor the master gain at its current value, then glide or ramp from there.
function anchor() {
  const p = master.gain, t = ctx.currentTime, cur = p.value;
  p.cancelScheduledValues(t);
  p.setValueAtTime(cur, t);
  return [p, t];
}
function glide(target, tc) { const [p, t] = anchor(); p.setTargetAtTime(target, t, tc); }

function resumeCtx() {
  if (ctx.state === "running") return Promise.resolve();
  let timer;
  const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("audio is blocked. click or tap, then press play")), RESUME_TIMEOUT_MS); });
  return Promise.race([ctx.resume(), timeout]).finally(() => clearTimeout(timer));
}

// Mic / shared audio analysis shares this context; don't freeze it under them.
function canSuspend() { return audio.source !== "mic" && audio.source !== "sys"; }

function play() {
  ensureCtx();
  clearTimeout(suspendTimer);
  if (state === "idle" || state === "error") return begin();
  if (state === "paused") {
    dispatch("PLAY");
    ctx.resume().catch(() => {});
    glide(vol, FADE_IN_TC);
    return Promise.resolve();
  }
  if (state === "fading") { // any play during the sleep fade cancels the timer and restores volume
    cancelSleep();
    dispatch("PLAY");
    glide(vol, FADE_IN_TC);
    return Promise.resolve();
  }
  return loadingP || Promise.resolve(); // loading / playing: nothing to add
}

function begin() {
  const mine = ++epoch;
  error = null;
  dispatch("PLAY"); // idle|error → loading
  loadingP = (async () => {
    try {
      await resumeCtx();
      await Promise.all([...sources.values()].map((s) => s.load?.()));
    } catch (e) {
      if (mine !== epoch) return;
      error = e?.message || String(e);
      dispatch("FAIL");
      return;
    }
    if (mine !== epoch || state !== "loading") return;
    dispatch("READY");
    for (const s of sources.values()) startSource(s);
    glide(vol, FADE_IN_TC);
    claimVisuals();
  })().finally(() => { if (mine === epoch) loadingP = null; });
  return loadingP;
}

function pause() {
  if (!dispatch("PAUSE")) return;
  glide(0, PAUSE_TC);
  clearTimeout(suspendTimer);
  suspendTimer = setTimeout(() => {
    if (state === "paused" && canSuspend()) ctx.suspend().catch(() => {});
  }, 320);
}

function stop() {
  cancelSleep();
  const had = state !== "idle";
  dispatch("STOP");
  if (ctx) goIdle(had);
}

// Shared by stop() and the sleep timer's end: everything that must happen on entering idle.
function goIdle(had) {
  epoch++; loadingP = null;
  clearTimeout(suspendTimer);
  glide(0, 0.04);
  for (const s of sources.values()) stopSource(s);
  releaseVisuals();
  if (had) suspendTimer = setTimeout(() => {
    if (state === "idle" && canSuspend()) ctx.suspend().catch(() => {});
  }, 400);
}

function setVol(v) {
  vol = Math.min(1, Math.max(0, +v || 0));
  if (state === "playing") glide(vol, 0.08);
  emit();
}

// Sleep timer: fade over the final minute, then stop. 0 clears it.
function sleep(minutes) {
  cancelSleep();
  const ms = Math.round((+minutes || 0) * 60e3);
  if (ms > 0) {
    sleepEnd = Date.now() + ms;
    sleepTimers = [
      setTimeout(endSoon, Math.max(0, ms - SLEEP_FADE_S * 1e3)),
      setTimeout(done, ms),
    ];
  }
  emit();
}
function sleepLeft() { return sleepEnd ? Math.max(0, sleepEnd - Date.now()) : 0; }
function cancelSleep() {
  sleepTimers.forEach(clearTimeout); sleepTimers = []; sleepEnd = 0;
}
function endSoon() {
  if (!dispatch("TIMER_END_SOON")) return;
  const secs = Math.max(0.5, Math.min(SLEEP_FADE_S, sleepLeft() / 1e3));
  const [p, t] = anchor();
  p.linearRampToValueAtTime(0, t + secs);
}
function done() {
  sleepTimers.forEach(clearTimeout); sleepTimers = []; sleepEnd = 0;
  if (state === "fading") {
    dispatch("TIMER_DONE");
    goIdle(true);
  } else if (state !== "idle") stop(); // timer ran out while paused / loading
}

// Visual source ownership: only take audio.js over if nobody has chosen one.
// `holding` is our retain() on the shared analyser; `ownsNoise` means we are the
// one who switched it to "noise" (and so switch it back to "off" on stop).
async function claimVisuals() {
  if (holding || audio.source !== "off") return;
  const token = ++claimToken;
  audio.retain(); holding = true;
  ownsNoise = true;
  const ok = await audio.setSource("noise");
  if (token !== claimToken) return; // released while the call was in flight
  if (!ok) { ownsNoise = false; releaseVisuals(); }
}
function releaseVisuals() {
  claimToken++;
  const owned = ownsNoise;
  ownsNoise = false;
  if (owned && audio.source === "noise") audio.setSource("off");
  if (holding) { holding = false; audio.release(); }
}
// If the user switches audio.js to mic/sys/off themselves, it is no longer ours to reset.
audio.onChange((src) => { if (ownsNoise && src !== "noise") ownsNoise = false; });
