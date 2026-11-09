// Layer runtime: turns the LAYERS catalogue into live Web Audio.
//
// `wanted` is the selection (id → volume) and survives stop/start; `live` holds
// the running instances and exists only while the engine is active. set() on a
// live layer only ramps its gain, so rapid toggling can't stack duplicate nodes.
//
// Grains (rain drops, crackles, chirps, clacks...) are scheduled ahead off
// ctx.currentTime from a 200 ms interval, so a throttled tab doesn't drift them.
import { engine } from "./engine.js";
import { fillNoise, makeRng } from "./gen.js";
import { LAYERS, BRAINWAVE, CARRIER_HZ } from "./catalog.js";
import { SFX } from "./sfx.js";
import { store } from "../data.js";

const TICK_MS = 200;
const HORIZON = 1.5;            // seconds scheduled ahead of ctx.currentTime
const VOL_TC = 0.08;            // volume glide, never a step (no clicks)
const TAU = Math.PI * 2;

const wanted = new Map();       // id → 0..1
const live = new Map();         // id → instance
const lv = new Map();           // id → { v, t } smoothed level state
let ctx = null, bus = null, ticker = 0;
let bufs = new Map(), bufCtx = null;

// ---------------------------------------------------------------- helpers

const rand = (a, b) => a + Math.random() * (b - a);
const expo = (rate) => -Math.log(1 - Math.random()) / rate; // Poisson gap

function seedOf(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

// One cached 4 s buffer per colour, generated on first use for this context.
function buffer(color) {
  if (bufCtx !== ctx) { bufs = new Map(); bufCtx = ctx; }
  let b = bufs.get(color);
  if (!b) {
    const data = fillNoise(color, new Float32Array(Math.round(ctx.sampleRate * 4)), makeRng(seedOf(color)));
    b = ctx.createBuffer(1, data.length, ctx.sampleRate);
    b.getChannelData(0).set(data);
    bufs.set(color, b);
  }
  return b;
}

// Per-instance toolbox. Everything created through it is cleaned up on dispose.
function toolbox(dest) {
  const srcs = [], nodes = [], streams = [];
  const q = []; let energy = 0, lastT = 0; // q: flat [t, a, t, a...]
  const tb = {
    ctx, dest, srcs, nodes, streams,
    noiseBuf: (c) => buffer(c),
    keep(n) { nodes.push(n); return n; },
    gain(v = 1, to) { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); nodes.push(g); return g; },
    filter(type, f, qv = 1, to) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = qv; if (to) b.connect(to); nodes.push(b); return b; },
    // looping noise bed, started at a random offset so two beds never phase-lock
    bed(color, to) {
      const s = ctx.createBufferSource(); s.buffer = buffer(color); s.loop = true;
      s.connect(to); s.start(0, Math.random() * 3.5); srcs.push(s); return s;
    },
    osc(type, f, to) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; if (to) o.connect(to); o.start(); srcs.push(o); return o; },
    // a short filtered noise burst
    burst(t, { color = "white", dur = 0.01, amp = 0.3, atk = 0.0008, type, f = 3000, q: qv = 1, to = dest } = {}) {
      const s = ctx.createBufferSource(); s.buffer = buffer(color);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(amp, t + atk);
      env.gain.setTargetAtTime(0, t + atk, dur / 3);
      let head = s;
      if (type) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = qv; s.connect(b); head = b; }
      head.connect(env); env.connect(to);
      s.start(t, Math.random() * 3.5); s.stop(t + dur * 2 + 0.05);
    },
    // a short pitched blip (optionally gliding)
    tone(t, { f = 1000, f2 = f, dur = 0.05, amp = 0.1, atk = 0.002, type = "sine", to = dest } = {}) {
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (f2 !== f) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(amp, t + atk);
      env.gain.setTargetAtTime(0, t + atk, dur / 3);
      o.connect(env); env.connect(to);
      o.start(t); o.stop(t + dur * 2 + 0.05);
    },
    // schedule fire(t) at random gaps (gap() seconds), ahead of the clock
    stream(gap, fire) {
      let next = null;
      streams.push((now, hz) => {
        if (next === null || next < now - 0.25) next = now + gap();
        while (next < hz) { fire(next); next += gap(); }
      });
    },
    // loudness bookkeeping: hit(t, a) at scheduled time t. `pending` only ever
    // holds hits within the scheduling horizon (tick() folds due ones into the
    // envelope), so memory is O(1) whether or not the UI polls level().
    hit(t, a = 1) { q.push(t, a); },
    energy(now, tau = 0.15) {
      let sum = 0, w = 0;
      for (let i = 0; i < q.length; i += 2) {
        if (q[i] <= now) sum += q[i + 1]; else { q[w++] = q[i]; q[w++] = q[i + 1]; }
      }
      q.length = w;
      if (now > lastT) { energy *= Math.exp(-(now - lastT) / tau); lastT = now; }
      energy = Math.min(4, energy + sum);
      return Math.min(1, energy);
    },
    pending() { return q.length / 2; },
  };
  return tb;
}

// ---------------------------------------------------------------- builders
// Each builder(h, t0) wires nodes into h.dest and returns { mod(now) → 0..1 }.
// `mod` is the layer's loudness character, mirrored from what it schedules.

const colorTrim = { white: 0.35, pink: 0.6, brown: 0.8, blue: 0.3, grey: 0.5 };
function color(name) {
  return (h) => {
    h.bed(name, h.gain(colorTrim[name], h.dest));
    return { mod: () => 1 };
  };
}

function rain(h, t0) {
  const bed = h.gain(0.38, h.dest);
  h.bed("pink", h.filter("highpass", 380, 0.7, h.filter("lowpass", 7500, 0.7, bed)));
  const rate = (now) => 34 + 22 * Math.sin((now - t0) * 0.13) + 6 * Math.sin((now - t0) * 0.71);
  h.stream(() => expo(Math.max(12, rate(ctx.currentTime))), (t) => {
    h.burst(t, { dur: rand(0.008, 0.02), amp: rand(0.06, 0.26), type: "bandpass", f: rand(2200, 7500), q: rand(0.8, 2), to: h.dest });
    h.hit(t, 0.1);
  });
  h.stream(() => expo(5), (t) => { // fat drops landing on something
    h.tone(t, { f: rand(380, 900), f2: rand(200, 400), dur: 0.05, amp: rand(0.02, 0.06) });
    h.hit(t, 0.06);
  });
  return { mod: (now) => 0.4 + 0.6 * h.energy(now, 0.18) };
}

function thunder(h) {
  const strike = (t) => {
    const dur = rand(6, 9), amp = rand(0.6, 0.9);
    // per-strike nodes are not kept in h.nodes (that would grow forever): freed after the strike
    const env = ctx.createGain(); env.gain.value = 0; env.connect(h.dest);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900; lp.Q.value = 0.7; lp.connect(env);
    const s = ctx.createBufferSource(); s.buffer = buffer("brown"); s.loop = true;
    // free them when the source actually ends (stop() is scheduled below), not on a wall-clock timer
    s.onended = () => { for (const n of [s, lp, env]) { try { n.disconnect(); } catch {} } };
    s.connect(lp); s.start(t, Math.random() * 3); s.stop(t + dur + 0.2);
    lp.frequency.setValueAtTime(rand(700, 1100), t);
    lp.frequency.exponentialRampToValueAtTime(70, t + dur);
    const g = env.gain;
    g.setValueAtTime(0, t); g.linearRampToValueAtTime(amp, t + rand(0.05, 0.4));
    let tt = t + 0.4, a = amp;
    for (let k = 0; k < 4; k++) { // rolling rumble: a few decaying swells
      tt += rand(0.5, 1.3); a *= rand(0.55, 0.85);
      g.linearRampToValueAtTime(a * 0.55, tt);
      g.linearRampToValueAtTime(a, tt + rand(0.15, 0.4));
    }
    g.linearRampToValueAtTime(0, t + dur);
    if (Math.random() < 0.5) h.burst(t, { dur: 0.18, amp: 0.25, type: "highpass", f: 1400, to: h.dest }); // close crack
    h.hit(t + 0.2, 1);
  };
  let first = true;
  h.stream(() => { const g = first ? rand(3, 12) : rand(20, 60); first = false; return g; }, strike);
  return { mod: (now) => 0.1 + 0.9 * h.energy(now, 2.6) };
}

function wind(h, t0) {
  const fF = rand(0.09, 0.14), fG = rand(0.05, 0.08);
  const g = h.gain(0.5, h.dest);
  const bp = h.filter("bandpass", 550, 0.9, g);
  h.bed("pink", bp);
  h.osc("sine", fF, h.gain(330, bp.frequency));
  h.osc("sine", fG, h.gain(0.32, g.gain));
  const wg = h.gain(0.05, h.dest), wbp = h.filter("bandpass", 1500, 7, wg); // faint whistle
  h.bed("pink", wbp);
  h.osc("sine", 0.17, h.gain(500, wbp.frequency));
  h.osc("sine", 0.11, h.gain(0.04, wg.gain));
  return { mod: (now) => (0.5 + 0.32 * Math.sin(TAU * fG * (now - t0))) / 0.82 };
}

function ocean(h, t0) {
  const f = 1 / rand(6, 10);
  const swell = h.gain(0.5, h.dest);
  h.bed("brown", h.filter("lowpass", 650, 0.7, swell));
  h.osc("sine", f, h.gain(0.45, swell.gain));
  const foam = h.gain(0.1, h.dest); // hiss that builds on the crest, a beat behind
  h.bed("pink", h.filter("bandpass", 3200, 0.5, h.filter("highpass", 1400, 0.7, foam)));
  const lag = 0.28 / f;
  const lfo = ctx.createOscillator(); lfo.frequency.value = f;
  const depth = h.gain(0.09, foam.gain); lfo.connect(depth); lfo.start(t0 + lag); h.srcs.push(lfo);
  return { mod: (now) => (0.5 + 0.45 * Math.sin(TAU * f * (now - t0))) / 0.95 };
}

function stream_(h) {
  const bed = h.gain(0.25, h.dest);
  h.bed("pink", h.filter("bandpass", 2100, 0.9, bed));
  h.stream(() => 0.055, (t) => bed.gain.setTargetAtTime(rand(0.1, 0.42), t, 0.03));
  h.stream(() => expo(26), (t) => {
    const f = rand(500, 1500);
    h.tone(t, { f, f2: f * rand(1.5, 2.1), dur: rand(0.025, 0.06), amp: rand(0.025, 0.08) });
    h.hit(t, 0.07);
  });
  return { mod: (now) => 0.4 + 0.6 * h.energy(now, 0.2) };
}

function fire(h) {
  const bed = h.gain(0.55, h.dest);
  h.bed("brown", h.filter("lowpass", 420, 0.7, bed));
  h.stream(() => rand(0.25, 0.7), (t) => bed.gain.setTargetAtTime(rand(0.35, 0.65), t, 0.2)); // flicker
  const crack = (t) => {
    const big = Math.random() < 0.08;
    h.burst(t, { dur: big ? 0.03 : rand(0.002, 0.012), amp: big ? rand(0.5, 0.8) : rand(0.08, 0.35), type: "highpass", f: rand(1200, 3500), q: 0.7 });
    h.hit(t, big ? 0.5 : 0.18);
  };
  h.stream(() => expo(9), (t) => { // crackle, sometimes in a quick cluster
    crack(t);
    if (Math.random() < 0.3) for (let i = 1; i <= Math.round(rand(2, 5)); i++) crack(t + i * rand(0.02, 0.07));
  });
  return { mod: (now) => 0.35 + 0.65 * h.energy(now, 0.25) };
}

function crickets(h) {
  const voice = (f) => {
    const amp = h.gain(0.0001, h.dest), o = h.osc("sine", f, amp);
    o.frequency.value = f;
    h.stream(() => rand(0.45, 1.3), (t) => { // one chirp: a group of three quick pulses
      for (let i = 0; i < 3; i++) {
        const p = t + i * 0.075;
        amp.gain.setValueAtTime(0.0001, p);
        amp.gain.linearRampToValueAtTime(0.1, p + 0.006);
        amp.gain.setTargetAtTime(0.0001, p + 0.03, 0.006);
        h.hit(p, 0.35);
      }
    });
  };
  voice(4300); voice(4520); voice(4780);
  return { mod: (now) => 0.15 + 0.85 * h.energy(now, 0.3) };
}

function cafe(h, t0) {
  const sum = h.gain(0.7, h.filter("lowpass", 3600, 0.7, h.dest));
  const rates = [];
  for (let v = 0; v < 4; v++) { // a few overlapping "talkers"
    const f1 = rand(380, 720), f2 = rand(1100, 2200);
    const g = h.gain(0.5, sum), a = h.filter("bandpass", f1, 3, h.filter("bandpass", f2, 2.5, g));
    h.bed("pink", a);
    const r = rand(2.2, 5.5); rates.push(r);
    h.osc("sine", r, h.gain(0.4, g.gain));
    h.osc("sine", rand(0.1, 0.3), h.gain(0.25, g.gain));
  }
  h.stream(() => rand(3, 9), (t) => { // cup / spoon clink
    const f = rand(2800, 4200), v = rand(0.015, 0.05);
    h.tone(t, { f, dur: 0.12, amp: v });
    h.tone(t, { f: f * 1.51, dur: 0.08, amp: v * 0.6 });
    h.hit(t, 0.7);
  });
  return { mod: (now) => 0.62 + 0.14 * Math.sin((now - t0) * 0.9) + 0.24 * h.energy(now, 0.3) };
}

function fan(h, t0) {
  h.bed("brown", h.filter("lowpass", 1200, 0.7, h.gain(0.7, h.dest)));
  const air = h.gain(0.1, h.dest); h.bed("pink", h.filter("bandpass", 900, 0.6, air));
  h.osc("sine", 120, h.gain(0.04, h.dest));
  h.osc("sine", 121.3, h.gain(0.04, h.dest)); // slow beating against the hum
  h.osc("sine", 240.5, h.gain(0.012, h.dest));
  return { mod: (now) => 0.88 + 0.12 * Math.sin(TAU * 1.3 * (now - t0)) };
}

function train(h) {
  h.bed("brown", h.filter("lowpass", 160, 0.7, h.gain(0.65, h.dest)));
  const clack = (t, a) => {
    h.burst(t, { dur: 0.03, amp: 0.5 * a, type: "bandpass", f: rand(800, 1100), q: 1.2 });
    h.tone(t, { f: 90, f2: 55, dur: 0.07, amp: 0.35 * a });
    h.hit(t, a);
  };
  h.stream(() => rand(1.06, 1.14), (t) => { clack(t, 1); clack(t + rand(0.13, 0.16), 0.75); });
  return { mod: (now) => 0.3 + 0.7 * h.energy(now, 0.22) };
}

function keyboard(h) {
  const key = (t, soft) => {
    const a = rand(0.12, 0.3) * (soft ? 0.7 : 1);
    h.burst(t, { dur: 0.012, amp: a, type: "bandpass", f: rand(2400, 4200), q: 1.1 });
    h.tone(t, { f: rand(150, 210), f2: 100, dur: 0.03, amp: a * 0.6 }); // the thock
    h.hit(t, 0.35);
  };
  h.stream(() => rand(1.5, 5), (t) => { // a burst of typing
    let tt = t;
    for (let i = 0, n = Math.round(rand(6, 20)); i < n; i++) { key(tt, Math.random() < 0.2); tt += rand(0.05, 0.19) * (Math.random() < 0.12 ? 2.2 : 1); }
    if (Math.random() < 0.4) h.burst(tt + 0.1, { dur: 0.03, amp: 0.3, type: "bandpass", f: 1500, q: 0.8 }); // space bar
  });
  return { mod: (now) => 0.05 + 0.95 * h.energy(now, 0.3) };
}

function vinyl(h) {
  h.bed("white", h.filter("highpass", 3500, 0.7, h.gain(0.02, h.dest))); // surface hiss
  h.bed("brown", h.filter("lowpass", 90, 0.7, h.gain(0.12, h.dest)));    // motor rumble
  h.stream(() => expo(14), (t) => {
    const pop = Math.random() < 0.06;
    h.burst(t, { dur: pop ? 0.012 : 0.003, amp: pop ? rand(0.4, 0.7) : rand(0.04, 0.22), type: "highpass", f: rand(1500, 4000), q: 0.7 });
    h.hit(t, pop ? 0.6 : 0.2);
  });
  return { mod: (now) => 0.35 + 0.65 * h.energy(now, 0.2) };
}

function binaural(beat) {
  return (h, t0) => {
    const merger = h.keep(ctx.createChannelMerger(2));
    const out = h.gain(0.22, h.dest);
    merger.connect(out);
    const l = h.osc("sine", CARRIER_HZ), r = h.osc("sine", CARRIER_HZ + beat);
    l.connect(merger, 0, 0); r.connect(merger, 0, 1); // hard-panned: left ear / right ear
    return { mod: (now) => 0.7 + 0.3 * Math.sin(TAU * 0.6 * (now - t0)) }; // slow breathing, not the real beat
  };
}

function iso(h, t0) {
  const gate = h.gain(0.5, h.dest), tone = h.gain(0.3, gate);
  h.osc("sine", CARRIER_HZ, tone);
  // square LFO swings gate gain 0..1 at 10 Hz; the lowpass rounds the edges so it doesn't click
  const lfo = h.osc("square", BRAINWAVE.alpha), soft = h.filter("lowpass", 160, 0.5), amt = h.gain(0.5);
  lfo.connect(soft); soft.connect(amt); amt.connect(gate.gain);
  return { mod: (now) => 0.7 + 0.3 * Math.sin(TAU * 0.6 * (now - t0)) };
}

// ---------------------------------------------------------------- recordings
// A `rec` layer streams its file through a MediaElementSource. It plays the
// whole recording (nothing is trimmed), loops back to the start when it ends,
// and remembers where it was, so turning it off and on again carries on.

const recs = new Map(); // id → { el, an, buf } while live

const posKey = (id) => "noise.pos." + id;
function horn(h, input) {
  // a horn loudspeaker tied to a post, heard from down the lane: band-limited,
  // a little overdriven, slap-back off the houses, drifting with the wind
  const hp = h.filter("highpass", 320, 0.7);
  const peak = h.keep(ctx.createBiquadFilter()); peak.type = "peaking"; peak.frequency.value = 1750; peak.Q.value = 0.9; peak.gain.value = 7;
  const ws = h.keep(ctx.createWaveShaper());
  ws.curve = Float32Array.from({ length: 1024 }, (_, i) => { const x = (i / 1023) * 2 - 1; return Math.tanh(1.9 * x) / Math.tanh(1.9); });
  const lp = h.filter("lowpass", 4300, 0.7);
  const dry = h.gain(0.78, h.dest);
  input.connect(hp); hp.connect(peak); peak.connect(ws); ws.connect(lp); lp.connect(dry);
  const echoes = h.gain(0.3, h.filter("lowpass", 2400, 0.7, h.dest));
  for (const [d, fb] of [[0.23, 0.22], [0.41, 0.18], [0.67, 0.1]]) {
    const dl = h.keep(ctx.createDelay(1)); dl.delayTime.value = d;
    const g = h.gain(fb); lp.connect(dl); dl.connect(g); g.connect(dl); dl.connect(echoes);
  }
  h.osc("sine", 0.055, h.gain(0.14, dry.gain)); // wind carries it closer, then away
}

function recorded(L) {
  return (h) => {
    const el = new Audio();
    el.preload = "auto";
    el.src = new URL(L.rec, import.meta.url).href;
    const saved = +store.get(posKey(L.id), 0) || 0;
    // resume where it was left; a server without range support only becomes
    // seekable once enough has buffered, so keep trying until the seek lands
    let want = saved > 0 ? saved : 0;
    const seek = () => {
      if (!want || !Number.isFinite(el.duration)) return;
      if (want >= el.duration - 2) { want = 0; return; }
      const s = el.seekable;
      for (let i = 0; i < s.length; i++) if (s.start(i) <= want && s.end(i) >= want) { el.currentTime = want; want = 0; return; }
    };
    for (const ev of ["loadedmetadata", "progress", "canplaythrough"]) el.addEventListener(ev, seek);
    el.addEventListener("ended", () => { store.set(posKey(L.id), 0); el.currentTime = 0; if (engine.state !== "paused") el.play().catch(() => {}); });
    const src = ctx.createMediaElementSource(el);
    const an = ctx.createAnalyser(); an.fftSize = 1024;
    const pre = h.gain(1);
    src.connect(pre); pre.connect(an);
    if (L.horn) horn(h, pre); else pre.connect(h.dest);
    const save = () => { if (!want && el.currentTime > 0) store.set(posKey(L.id), Math.floor(el.currentTime)); };
    const saver = setInterval(save, 5000);
    const follow = () => { if (engine.state === "paused") el.pause(); else if (el.paused) el.play().catch(() => {}); };
    const unsub = engine.onChange(follow);
    follow();
    const rec = { el, an, buf: new Float32Array(an.fftSize) };
    recs.set(L.id, rec);
    h.srcs.push({
      stop() { save(); clearInterval(saver); unsub(); el.pause(); el.removeAttribute("src"); el.load(); if (recs.get(L.id) === rec) recs.delete(L.id); },
      disconnect() { try { src.disconnect(); } catch {} try { an.disconnect(); } catch {} },
    });
    return {
      mod: () => {
        an.getFloatTimeDomainData(rec.buf);
        let sum = 0; for (let i = 0; i < rec.buf.length; i += 4) sum += rec.buf[i] * rec.buf[i];
        return Math.min(1, Math.sqrt(sum / (rec.buf.length / 4)) * 4.5);
      },
    };
  };
}

const BUILD = {
  rain, thunder, wind, ocean, stream: stream_, fire, crickets,
  cafe, fan, train, keyboard, vinyl, iso, ...SFX,
};
for (const L of LAYERS) if (L.rec) BUILD[L.id] = recorded(L);
for (const c of ["white", "pink", "brown", "blue", "grey"]) BUILD[c] = color(c);
for (const [id, beat] of Object.entries(BRAINWAVE)) BUILD[id] = binaural(beat);

// ---------------------------------------------------------------- runtime

const isActive = () => engine.ctx && ["playing", "paused", "fading"].includes(engine.state);

function spawn(id, vol) {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(bus);
  const h = toolbox(gain);
  const t0 = ctx.currentTime;
  const built = BUILD[id](h, t0);
  gain.gain.setTargetAtTime(vol, t0, VOL_TC);
  const inst = { id, gain, h, mod: built.mod, vol };
  live.set(id, inst);
  if (h.streams.length) { const now = ctx.currentTime; for (const s of h.streams) s(now, now + HORIZON); }
  startTicker();
  return inst;
}

function dispose(inst) {
  live.delete(inst.id);
  const { gain, h } = inst;
  gain.gain.cancelScheduledValues(ctx.currentTime);
  gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  setTimeout(() => {
    for (const s of h.srcs) { try { s.stop(); } catch {} try { s.disconnect(); } catch {} }
    for (const n of h.nodes) { try { n.disconnect(); } catch {} }
    try { gain.disconnect(); } catch {}
  }, 450);
  if (![...live.values()].some((i) => i.h.streams.length)) stopTicker();
}

function tick() {
  if (!ctx) return;
  const now = ctx.currentTime, hz = now + HORIZON;
  for (const inst of live.values()) {
    for (const s of inst.h.streams) s(now, hz);
    inst.mod(now); // folds due hits into the envelope even when nothing polls level()
  }
}
function startTicker() { if (!ticker) ticker = setInterval(tick, TICK_MS); }
function stopTicker() { clearInterval(ticker); ticker = 0; }

// bring `live` in line with `wanted`
function sync() {
  if (!isActive()) return;
  ctx = engine.ctx;
  for (const [id, vol] of wanted) {
    const inst = live.get(id);
    if (inst) { inst.vol = vol; inst.gain.gain.setTargetAtTime(vol, ctx.currentTime, VOL_TC); }
    else if (vol > 0) spawn(id, vol);
  }
  for (const inst of [...live.values()]) if (!(wanted.get(inst.id) > 0)) dispose(inst);
}

function teardown() {
  for (const inst of [...live.values()]) dispose(inst);
  stopTicker();
}

// selection listeners: whoever changes a layer (window, command, preset), everyone hears it
const changeFns = new Set();
function changed() { for (const fn of [...changeFns]) { try { fn(); } catch (e) { console.error(e); } } }

export const layers = {
  set(id, vol = 0.6) {
    if (!BUILD[id]) return;
    vol = Math.min(1, Math.max(0, +vol || 0));
    const was = wanted.get(id);
    if (vol > 0) wanted.set(id, vol); else wanted.delete(id);
    sync();
    if (was !== wanted.get(id)) changed();
  },
  off(id) { const had = wanted.delete(id); sync(); if (had) changed(); },
  active() { return Object.fromEntries(wanted); },
  onChange(fn) { changeFns.add(fn); return () => changeFns.delete(fn); },
  // smoothed 0..1 loudness for UI tiles (volume × the layer's own modulation)
  level(id) {
    const now = performance.now();
    const s = lv.get(id) || { v: 0, t: now };
    const inst = live.get(id);
    const target = inst && ctx ? inst.vol * Math.min(1, Math.max(0, inst.mod(ctx.currentTime))) : 0;
    const dt = Math.min(0.25, (now - s.t) / 1000);
    s.v += (target - s.v) * (1 - Math.exp(-dt / 0.12));
    s.t = now;
    lv.set(id, s);
    return s.v < 0.001 ? 0 : s.v;
  },
  // playback position of a recording layer: { t, dur } in seconds, or null
  progress(id) {
    const r = recs.get(id);
    if (r) return { t: r.el.currentTime || 0, dur: Number.isFinite(r.el.duration) ? r.el.duration : 0 };
    const L = LAYERS.find((l) => l.id === id);
    return L?.rec ? { t: +store.get(posKey(id), 0) || 0, dur: 0 } : null;
  },
  // debug: number of running instances per id (a duplicate would show as a second node)
  liveCount() { const o = {}; for (const id of live.keys()) o[id] = 1; return o; },
  // debug: bookkeeping sizes per live layer (must stay bounded)
  sizes() { const o = {}; for (const i of live.values()) o[i.id] = { pending: i.h.pending(), nodes: i.h.nodes.length, srcs: i.h.srcs.length }; return o; },
};

engine.attachSource("layers", {
  init(c, mix) { ctx = c; bus = c.createGain(); bus.gain.value = 1; bus.connect(mix); },
  start() { ctx = engine.ctx; sync(); },
  has() { return wanted.size > 0; },
  stop() { teardown(); },
});
