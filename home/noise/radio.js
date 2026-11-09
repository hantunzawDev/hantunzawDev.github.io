// noise.app radio: internet stations through the engine graph.
//
//   <audio crossOrigin=anonymous> ─► MediaElementSource ─► station Gain ─► engine.mixBus
//
// Error handling: on a stream error the first try is an element WITHOUT
// crossOrigin (a CORS-less station fails the anonymous one with the same
// "unsupported" error as an offline one, so playing is the only way to tell).
// If that plays, the station runs "direct": not in the graph, `analysed=false`
// (UI shows "no viz"). If it fails too, retry at 2 s and 5 s, then `error`.
//
// Direct elements bypass master gain, so we mirror engine volume / pause / sleep
// fade onto audio.volume via engine.onChange (approximation: the sleep fade is
// stepped twice a second, and compressor/limiter do not apply).
//
// Exclusivity with music: radio.play() calls music.stop(); music.play() calls
// music.exclusive?.(), which radio.js sets to radio.stop (no circular import).
import { engine } from "./engine.js";
import { music } from "./music.js";
import { STATIONS, stationById } from "./stations.js";

const XFADE = 0.8;
const RETRY_MS = [2000, 5000];
const NOWPLAYING_MS = 30000;
const SLEEP_FADE_MS = 60000;
const live = () => ["playing", "paused", "fading"].includes(engine.state);

let selected = null;   // station id the user wants (null = radio off)
let attached = false;
let running = false;   // engine started our source
let cur = null;        // active station object
let fading = [];       // outgoing stations during a crossfade
let status = "idle";   // idle | loading | playing | error
let nowPlaying = "", analysed = false, errMsg = null;
let pollTimer = 0, pollGen = 0, fadeTimer = 0;
const listeners = new Set();

export const radio = {
  get current() { return selected ? stationById(selected) : null; },
  get nowPlaying() { return nowPlaying; },
  get analysed() { return analysed; },
  get status() { return status; },
  get error() { return errMsg; },
  stations: STATIONS,
  play, stop,
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
music.exclusive = () => radio.stop();

function emit() { for (const fn of [...listeners]) { try { fn(radio); } catch (e) { console.error(e); } } }
function set(s, err = null) { status = s; errMsg = err; emit(); }

// ---------------------------------------------------------------- level mirror (direct elements)

function engineLevel() {
  const { state, vol } = engine;
  if (state === "paused" || state === "idle") return 0;
  if (state === "fading") return vol * Math.min(1, engine.sleepLeft() / SLEEP_FADE_MS);
  return vol;
}
function applyLevel(st) { if (st.direct) st.audio.volume = Math.min(1, Math.max(0, engineLevel() * st.f)); }
engine.onChange((snap) => {
  for (const st of [cur, ...fading]) if (st) applyLevel(st);
  // Direct audio would keep streaming while the engine is paused: pause it for real.
  if (cur?.direct && running) {
    if (snap.state === "paused" && !cur.audio.paused) cur.audio.pause();
    else if (snap.state === "playing" && cur.audio.paused && cur.started) cur.audio.play().catch(() => {});
  }
  clearInterval(fadeTimer);
  if (snap.state === "fading" && cur?.direct) fadeTimer = setInterval(() => applyLevel(cur), 500);
});

// ---------------------------------------------------------------- station lifecycle

function makeEl(url, cors) {
  const a = document.createElement("audio");
  if (cors) a.crossOrigin = "anonymous";
  a.preload = "none";
  a.src = url;
  return a;
}

// Build and start one station attempt. `f0` = starting fade factor (0 when crossfading in).
// `n` = retries used so far; `probed` = the CORS-less probe already ran this round.
function open(info, f0, mode = "graph", n = 0, probed = false) {
  const st = { info, audio: makeEl(info.url, mode === "graph"), direct: mode === "direct",
    gain: null, node: null, f: f0, n, probed, timer: 0, dead: false, started: false };
  if (!st.direct) {
    st.node = new MediaElementAudioSourceNode(engine.ctx, { mediaElement: st.audio });
    st.gain = engine.ctx.createGain();
    st.gain.gain.value = st.f;
    st.node.connect(st.gain); st.gain.connect(engine.mixBus);
  }
  applyLevel(st);
  st.audio.addEventListener("playing", () => {
    if (st.dead || cur !== st) return;
    st.started = true; st.n = 0;
    analysed = !st.direct;
    set("playing");
  });
  st.audio.addEventListener("error", () => onError(st));
  st.audio.play().catch((e) => { if (e?.name === "NotAllowedError") onError(st); });
  return st;
}

function ramp(st, to, secs) {
  if (st.gain) {
    const p = st.gain.gain, t = engine.ctx.currentTime;
    p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(to, t + secs);
    st.f = to;
  } else { // direct element: tween f by hand
    const from = st.f, t0 = performance.now();
    clearInterval(st.tween);
    st.tween = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
      st.f = from + (to - from) * k; applyLevel(st);
      if (k >= 1) clearInterval(st.tween);
    }, 40);
  }
}

function close(st) {
  if (!st) return;
  st.dead = true;
  clearTimeout(st.timer); clearInterval(st.tween);
  if (st.audio) {
    try { st.audio.pause(); } catch {}
    st.audio.removeAttribute("src");
    try { st.audio.load(); } catch {}
  }
  try { st.gain?.disconnect(); st.node?.disconnect(); } catch {}
}

function retire(st, secs) {
  if (!st) return;
  fading.push(st);
  ramp(st, 0, secs);
  setTimeout(() => { close(st); fading = fading.filter((x) => x !== st); }, secs * 1000 + 100);
}

function onError(st) {
  if (st.dead || cur !== st) return;
  const { info, direct, probed, n } = st;
  close(st);
  if (!direct && !probed) { cur = open(info, st.f, "direct", n, true); return; } // CORS probe, free
  if (n >= RETRY_MS.length) {
    cur = null; analysed = false; stopPoll(); nowPlaying = "";
    set("error", "station offline");
    return;
  }
  set("loading");
  const ph = { info, dead: true, timer: 0 }; // placeholder: stale events no-op, close() clears the timer
  cur = ph;
  ph.timer = setTimeout(() => {
    if (cur !== ph || !running) return;
    cur = open(info, 1, "graph", n + 1);
  }, RETRY_MS[n]);
}

// ---------------------------------------------------------------- now playing

function stopPoll() { clearTimeout(pollTimer); pollGen++; }
function startPoll(info) {
  stopPoll();
  nowPlaying = info.name;
  emit();
  if (!info.soma) return;
  const gen = pollGen;
  const tick = async () => {
    try {
      const r = await fetch(`https://somafm.com/songs/${info.soma}.json`, { cache: "no-store" });
      const j = await r.json();
      const s = j?.songs?.[0];
      if (gen !== pollGen) return;
      if (s?.artist && s?.title) { nowPlaying = `${s.artist} – ${s.title}`; emit(); }
    } catch { /* keep the station name */ }
    if (gen === pollGen) pollTimer = setTimeout(tick, NOWPLAYING_MS);
  };
  tick();
}

// ---------------------------------------------------------------- engine source

const source = {
  start() {
    running = true;
    const info = stationById(selected);
    if (!info || cur) return;
    set("loading");
    cur = open(info, 1);
    startPoll(info);
  },
  stop() {
    running = false;
    clearInterval(fadeTimer);
    stopPoll();
    close(cur); cur = null;
    for (const f of fading.splice(0)) close(f);
    analysed = false; nowPlaying = "";
    set("idle");
  },
};

function attach() { engine.attachSource("radio", source); attached = true; }

// ---------------------------------------------------------------- public API

function play(id) {
  const info = stationById(id);
  if (!info) return Promise.resolve();
  music.stop(); // exclusive with generated music
  const changed = selected !== id;
  selected = id;
  if (!live()) {
    if (!attached) attach();
    emit();
    return engine.play();
  }
  if (!attached) { attach(); emit(); return Promise.resolve(); } // start() fires on attach
  if (changed || !cur) {
    if (cur) { const old = cur; cur = null; retire(old, XFADE); }
    set("loading");
    cur = open(info, 0); ramp(cur, 1, XFADE);
    startPoll(info);
  }
  emit();
  return Promise.resolve();
}

function stop() {
  const had = selected !== null;
  selected = null;
  if (attached) { attached = false; engine.detachSource("radio"); } // runs source.stop()
  else source.stop();
  if (had) emit();
}
