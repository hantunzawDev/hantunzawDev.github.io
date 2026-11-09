// bughunt.exe audio. Two halves:
//
//   sfx     every cue is synthesised on a small private AudioContext (nothing is
//           sampled), so the game still sounds when noise.app's music engine is
//           offline. Per-event nodes free themselves when their source ends, and
//           a voice cap drops low-priority cues first in a crowded fight.
//   score   the soundtrack is noise.app itself: the game asks its music module to
//           play a genre per sector and nudges the density / dark knobs with the
//           fight. It only takes the engine when the engine is idle, so a mix the
//           user already has running is never replaced, and gives it back on exit.
import { store } from "./data.js";

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ================================================================ sfx */

let ctx = null, out = null, noiseBuf = null, crushCurve = null;
let voices = 0;
const MAX_VOICES = 28;

function ensure() {
  if (ctx) { if (ctx.state === "suspended") ctx.resume().catch(() => {}); return ctx; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC({ latencyHint: "interactive" });
  out = ctx.createGain();
  out.gain.value = 0.55;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 4; comp.knee.value = 8;
  comp.attack.value = 0.003; comp.release.value = 0.15;
  out.connect(comp); comp.connect(ctx.destination);
  const n = ctx.sampleRate;
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  crushCurve = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const x = (i / 255) * 2 - 1; crushCurve[i] = Math.round(x * 5) / 5; } // 5-step bit crush
  return ctx;
}

// Claim a voice slot. Priority 2 cues (player feedback) always sound; 1 and 0
// give way as the mix fills so the shot and the hurt thud stay audible.
function claim(prio) {
  if (!ctx || ctx.state !== "running" && ctx.state !== "suspended") return false;
  const room = prio >= 2 ? MAX_VOICES + 8 : prio === 1 ? MAX_VOICES : MAX_VOICES * 0.6;
  if (voices >= room) return false;
  voices++;
  return true;
}

// a chain ending in a panner + gain, returning its input node and a cleanup hook
function chain({ pan = 0, gain = 1, lp = 0, dist = 0 }) {
  const g = ctx.createGain(); g.gain.value = gain;
  let head = g;
  const nodes = [g];
  if (lp || dist) {
    const f = ctx.createBiquadFilter(); f.type = "lowpass";
    f.frequency.value = lp || clamp(9000 / (1 + dist * 0.55), 900, 9000);
    f.connect(head); head = f; nodes.push(f);
  }
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (p) { p.pan.value = clamp(pan, -1, 1); g.connect(p); p.connect(out); nodes.push(p); } else g.connect(out);
  return { input: head, nodes };
}

function done(src, nodes, len) {
  let freed = false;
  const free = () => { if (freed) return; freed = true; voices = Math.max(0, voices - 1); for (const n of nodes) { try { n.disconnect(); } catch {} } };
  src.onended = free;
  setTimeout(free, (len + 0.5) * 1000); // belt and braces if onended never fires
}

// pitched blip: osc → (shaper) → (filter) → env → chain
function tone({ t = 0, type = "square", f0, f1 = f0, dur = 0.1, gain = 0.3, attack = 0.004, curve = "exp", to, crush = false, bp = 0, q = 1 }) {
  const now = ctx.currentTime + t;
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(Math.max(1, f0), now);
  if (f1 !== f0) (curve === "lin" ? o.frequency.linearRampToValueAtTime(f1, now + dur) : o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), now + dur));
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(gain, now + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  const nodes = [o, env];
  let node = o;
  if (crush) { const s = ctx.createWaveShaper(); s.curve = crushCurve; node.connect(s); node = s; nodes.push(s); }
  if (bp) { const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = bp; f.Q.value = q; node.connect(f); node = f; nodes.push(f); }
  node.connect(env); env.connect(to.input);
  o.start(now); o.stop(now + dur + 0.02);
  return { src: o, nodes, len: t + dur };
}

// filtered noise burst, with an optional filter sweep
function burst({ t = 0, dur = 0.1, gain = 0.3, type = "highpass", f0 = 1000, f1 = f0, q = 0.7, attack = 0.002, to, crush = false }) {
  const now = ctx.currentTime + t;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  s.playbackRate.value = rand(0.85, 1.15);
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, now);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(gain, now + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  const nodes = [s, f, env];
  let node = s;
  if (crush) { const w = ctx.createWaveShaper(); w.curve = crushCurve; node.connect(w); node = w; nodes.push(w); }
  node.connect(f); f.connect(env); env.connect(to.input);
  s.start(now, Math.random() * 0.5); s.stop(now + dur + 0.02);
  return { src: s, nodes, len: t + dur };
}

// play a cue made of several parts as one voice
function cue(prio, opts, build) {
  if (muted.sfx || !ensure() || !claim(prio)) return;
  const to = chain(opts);
  const parts = build(to);
  const last = parts.reduce((a, p) => (p.len > a.len ? p : a));
  done(last.src, [...to.nodes, ...parts.flatMap((p) => p.nodes)], last.len);
}

// where a sound sits for the listener: pan from the bearing, level from distance
export function place(P, x, y) {
  const dx = x - P.x, dy = y - P.y, d = Math.hypot(dx, dy);
  let rel = Math.atan2(dy, dx) - P.a;
  rel = Math.atan2(Math.sin(rel), Math.cos(rel));
  const behind = Math.abs(rel) > Math.PI / 2;
  return { pan: Math.sin(rel) * 0.85, gain: clamp(1.4 / (1 + d * 0.45), 0.05, 1) * (behind ? 0.75 : 1), dist: d + (behind ? 2 : 0) };
}

const muted = { sfx: !store.get("fps.sfx", true), music: !store.get("fps.music", true) };

export const sfx = {
  unlock() { ensure(); },
  get muted() { return muted.sfx; },
  setMuted(v) { muted.sfx = !!v; store.set("fps.sfx", !v); },

  // player: plasma blaster. bright zap down, air crack, chest thump
  shoot() {
    const det = rand(0.94, 1.06);
    cue(2, { gain: 0.9 }, (to) => [
      tone({ to, type: "square", f0: 1400 * det, f1: 90, dur: 0.16, gain: 0.22, bp: 1600, q: 0.8 }),
      tone({ to, type: "sawtooth", f0: 700 * det, f1: 160, dur: 0.09, gain: 0.12 }),
      burst({ to, dur: 0.09, gain: 0.28, type: "highpass", f0: 5000, f1: 1500 }),
      tone({ to, type: "sine", f0: 150, f1: 42, dur: 0.14, gain: 0.55, attack: 0.002 }),
    ]);
  },
  dry() {
    cue(2, { gain: 0.6 }, (to) => [
      burst({ to, dur: 0.025, gain: 0.35, type: "highpass", f0: 3500 }),
      tone({ to, type: "square", f0: 220, f1: 180, dur: 0.05, gain: 0.08, t: 0.03 }),
    ]);
  },
  // bug takes a hit: wet chirp, pitched up as it weakens
  hit(at, hpLeft = 1) {
    const up = 1 + (3 - clamp(hpLeft, 0, 3)) * 0.18;
    cue(1, at, (to) => [
      tone({ to, type: "sawtooth", f0: 260 * up, f1: 820 * up, dur: 0.09, gain: 0.22, bp: 900, q: 2 }),
      burst({ to, dur: 0.07, gain: 0.25, type: "bandpass", f0: 1800, f1: 600, q: 1.5 }),
    ]);
  },
  // bug dies: crunchy squelch, then a falling "error" arpeggio
  kill(at) {
    cue(1, at, (to) => [
      burst({ to, dur: 0.22, gain: 0.45, type: "lowpass", f0: 4000, f1: 300, crush: true }),
      tone({ to, type: "square", f0: 220, f1: 50, dur: 0.25, gain: 0.25, crush: true }),
      tone({ to, type: "square", f0: 988, dur: 0.06, gain: 0.09, t: 0.05 }),
      tone({ to, type: "square", f0: 740, dur: 0.06, gain: 0.09, t: 0.11 }),
      tone({ to, type: "square", f0: 494, dur: 0.1, gain: 0.09, t: 0.17 }),
    ]);
  },
  // bug notices you: two quick rising chirps
  alert(at) {
    cue(1, { ...at, gain: at.gain * 0.8 }, (to) => [
      tone({ to, type: "square", f0: 520, f1: 1500, dur: 0.07, gain: 0.12, bp: 1200, q: 1.2 }),
      tone({ to, type: "square", f0: 620, f1: 1800, dur: 0.08, gain: 0.12, bp: 1400, q: 1.2, t: 0.09 }),
    ]);
  },
  // windup before a bug fires: the telegraph you can hear from behind a wall
  charge(at, secs) {
    cue(1, { ...at, gain: at.gain * 0.75 }, (to) => [
      tone({ to, type: "sine", f0: 260, f1: 1300, dur: secs, gain: 0.18, attack: 0.05, curve: "lin" }),
      tone({ to, type: "square", f0: 130, f1: 650, dur: secs, gain: 0.05, attack: 0.05, curve: "lin", bp: 800 }),
    ]);
  },
  zap(at) {
    cue(1, at, (to) => [
      tone({ to, type: "sawtooth", f0: 1800, f1: 160, dur: 0.17, gain: 0.2, bp: 1400, q: 0.9 }),
      burst({ to, dur: 0.12, gain: 0.18, type: "bandpass", f0: 3000, f1: 800, q: 1 }),
    ]);
  },
  // player takes damage: body thud, crunch, low sting
  hurt(heavy) {
    cue(2, { gain: heavy ? 1 : 0.8 }, (to) => [
      tone({ to, type: "sine", f0: 110, f1: 38, dur: 0.3, gain: 0.7, attack: 0.002 }),
      burst({ to, dur: 0.16, gain: 0.35, type: "lowpass", f0: 1800, f1: 200, crush: true }),
      tone({ to, type: "sawtooth", f0: 92, f1: 70, dur: 0.22, gain: 0.08 }),
    ]);
  },
  heartbeat() {
    cue(0, { gain: 0.7, lp: 300 }, (to) => [
      tone({ to, type: "sine", f0: 62, f1: 40, dur: 0.13, gain: 0.6 }),
      tone({ to, type: "sine", f0: 55, f1: 36, dur: 0.15, gain: 0.45, t: 0.19 }),
    ]);
  },
  pickupHp() {
    const notes = [523, 659, 784, 1047];
    cue(2, { gain: 0.7 }, (to) => notes.map((f, i) => tone({ to, type: "triangle", f0: f, dur: 0.12, gain: 0.25, t: i * 0.055 })));
  },
  pickupAmmo() {
    cue(2, { gain: 0.7 }, (to) => [
      burst({ to, dur: 0.03, gain: 0.35, type: "bandpass", f0: 2600, q: 3 }),
      burst({ to, dur: 0.03, gain: 0.35, type: "bandpass", f0: 2100, q: 3, t: 0.07 }),
      tone({ to, type: "square", f0: 330, f1: 660, dur: 0.12, gain: 0.08, t: 0.12, bp: 900 }),
    ]);
  },
  locked() {
    cue(2, { gain: 0.6 }, (to) => [
      tone({ to, type: "square", f0: 116, dur: 0.12, gain: 0.14, bp: 500 }),
      tone({ to, type: "square", f0: 98, dur: 0.16, gain: 0.14, bp: 500, t: 0.15 }),
    ]);
  },
  exitOpen() {
    cue(2, { gain: 0.7 }, (to) => [
      ...[392, 523, 659, 784].map((f, i) => tone({ to, type: "triangle", f0: f, dur: 0.5 - i * 0.06, gain: 0.16, t: i * 0.07 })),
      burst({ to, dur: 0.5, gain: 0.08, type: "bandpass", f0: 1500, f1: 6000, q: 2 }),
    ]);
  },
  clear() {
    const seq = [523, 659, 784, 1047, 784, 1047, 1319];
    cue(2, { gain: 0.75 }, (to) => [
      ...seq.map((f, i) => tone({ to, type: "square", f0: f, dur: i === seq.length - 1 ? 0.45 : 0.1, gain: 0.08, t: i * 0.085, bp: 2200, q: 0.7 })),
      tone({ to, type: "triangle", f0: 131, dur: 0.8, gain: 0.25, t: 0.0 }),
    ]);
  },
  death() {
    cue(2, { gain: 0.9 }, (to) => [
      tone({ to, type: "sawtooth", f0: 440, f1: 32, dur: 1.4, gain: 0.22, attack: 0.01, crush: true }),
      tone({ to, type: "sine", f0: 120, f1: 30, dur: 1.2, gain: 0.5 }),
      burst({ to, dur: 1, gain: 0.2, type: "lowpass", f0: 3000, f1: 80, crush: true }),
    ]);
  },
  win() {
    const seq = [392, 523, 659, 784, 659, 784, 1047];
    cue(2, { gain: 0.8 }, (to) => [
      ...seq.map((f, i) => tone({ to, type: "triangle", f0: f, dur: i === seq.length - 1 ? 0.9 : 0.14, gain: 0.2, t: i * 0.12 })),
      ...[262, 330, 392].map((f) => tone({ to, type: "sine", f0: f, dur: 1.4, gain: 0.08, t: 0.72, attack: 0.08 })),
    ]);
  },
  start() {
    cue(2, { gain: 0.6 }, (to) => [
      tone({ to, type: "square", f0: 330, dur: 0.07, gain: 0.08, bp: 1500 }),
      tone({ to, type: "square", f0: 660, dur: 0.12, gain: 0.08, bp: 1500, t: 0.08 }),
    ]);
  },
  // soft footfall, alternating ears
  step(foot) {
    cue(0, { pan: foot ? 0.18 : -0.18, gain: 0.5, lp: 900 }, (to) => [
      burst({ to, dur: 0.06, gain: 0.18, type: "lowpass", f0: 700, f1: 200 }),
      tone({ to, type: "sine", f0: 90, f1: 60, dur: 0.06, gain: 0.12 }),
    ]);
  },
  // an awake bug nearby muttering to itself: where it is, without looking
  chitter(at) {
    const f = rand(1800, 2600);
    cue(0, { ...at, gain: at.gain * 0.45 }, (to) => [0, 1, 2, 3].map((i) =>
      tone({ to, type: "square", f0: f * rand(0.9, 1.1), f1: f * 0.7, dur: 0.03, gain: 0.09, t: i * 0.045, bp: f, q: 3 })));
  },
  close() {
    const c = ctx; ctx = null; voices = 0;
    c?.close?.().catch(() => {});
  },
};

/* ================================================================ score (noise.app) */

// sector → genre and how dark it starts; winning gets the neon one
const SCORE = [
  { genre: "techno", dark: 0.35 },
  { genre: "dark-techno", dark: 0.55 },
  { genre: "dnb", dark: 0.75 },
];
const WIN = { genre: "synthwave", dark: 0.25 };

let mods = null, modsP = null;
let owned = false;      // we started the engine for the game (so we may pause / stop it)
let want = null;        // the genre the game wants right now
let lastKnob = { density: -1, dark: -1 }, knobT = 0, stopT = 0;

function load() {
  return (modsP ??= Promise.all([import("./noise/engine.js"), import("./noise/music.js")])
    .then(([e, m]) => (mods = { engine: e.engine, music: m.music }), (e) => { modsP = null; throw e; }));
}

function knob(name, v) {
  if (!mods || !owned) return;
  v = Math.round(clamp(v, 0, 1) * 20) / 20; // coarse steps: density only lands per bar anyway
  if (v === lastKnob[name]) return;
  lastKnob[name] = v;
  mods.music.setKnob(name, v);
}

export const score = {
  get muted() { return muted.music; },
  get owned() { return owned; },
  setMuted(v) {
    muted.music = !!v; store.set("fps.music", !v);
    if (muted.music) this.release(0.6);
  },
  // sector music. Called from a user gesture (start / level change), so the
  // AudioContext is allowed to start.
  sector(i, win = false) {
    if (muted.music) return;
    const s = win ? WIN : SCORE[clamp(i, 0, SCORE.length - 1)];
    want = s.genre;
    clearTimeout(stopT);
    load().then(({ engine, music }) => {
      if (want !== s.genre || muted.music) return;
      // somebody else's mix is playing: leave it alone, the game just plays over it
      if (!owned && engine.state !== "idle" && engine.state !== "error") return;
      owned = true;
      lastKnob = { density: -1, dark: -1 };
      const p = music.play(s.genre);
      knob("dark", s.dark);
      knob("density", 0.4);
      return p;
    }).catch(() => {}); // music offline: sfx still carry the game
  },
  // fight intensity 0..1 (awake bugs near you) and danger 0..1 (low hp)
  intensity(fight, danger, dt) {
    if (!owned || !mods) return;
    knobT -= dt;
    if (knobT > 0) return;
    knobT = 1.5;
    knob("density", 0.35 + fight * 0.6);
    const base = SCORE.find((s) => s.genre === want)?.dark ?? WIN.dark;
    knob("dark", base + danger * 0.35);
  },
  pause() { if (owned && mods?.engine.state === "playing") mods.engine.pause(); },
  resume() { if (owned && mods?.engine.state === "paused") mods.engine.play().catch(() => {}); },
  // let the song fade, then hand the engine back idle
  release(fade = 1.2) {
    want = null;
    if (!owned || !mods) return;
    const { engine, music } = mods;
    if (music.genre) music.stop(fade);
    clearTimeout(stopT);
    stopT = setTimeout(() => {
      if (want || !owned) return;
      owned = false;
      if (!music.genre && engine.state !== "idle") engine.stop();
    }, (fade + 0.3) * 1000);
  },
};
