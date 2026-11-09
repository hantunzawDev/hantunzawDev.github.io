// Synthesised creatures and streets: rooster, hens, crows, koel, birds, frogs,
// dogs, cars, motorbikes, bicycles, horns, crowd, market. Nothing is sampled.
//
// Every builder takes the layers.js toolbox `h` and wires into `h.dest`. The
// voices here are scheduled ahead (h.stream) and their per-event nodes free
// themselves when the event's source ends, so a layer left on for hours keeps
// a flat node count.
//
// Building blocks:
//   voice()  a pitched call: oscillator → (growl AM) → shaper → formant bank →
//            envelope → pan → lowpass. Birds, roosters, crows, frogs, dogs,
//            horns and street vendors are all voices with different contours.
//   passby() a moving source: gain / pan / brightness / doppler curves for
//            something that approaches, passes the listener and leaves.
//   space()  an outdoor tail: a short synthetic impulse response, so calls land
//            between houses instead of inside your headphones.

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
const expo = (rate) => -Math.log(1 - Math.random()) / rate;
const side = () => (Math.random() < 0.5 ? -1 : 1);

// vowel formants (F1, F2, F3), roughly an adult voice
const VOWEL = {
  a: [800, 1250, 2600], o: [520, 900, 2500], u: [350, 800, 2400],
  e: [480, 1900, 2600], i: [300, 2300, 3000], aw: [650, 1000, 2500],
};

// ---------------------------------------------------------------- shared per-context caches

const caches = new WeakMap();
function cache(ctx) {
  let c = caches.get(ctx);
  if (!c) { c = { curves: new Map(), irs: new Map() }; caches.set(ctx, c); }
  return c;
}
function shaperCurve(ctx, k) {
  const c = cache(ctx).curves, key = Math.round(k * 10);
  let cur = c.get(key);
  if (!cur) {
    cur = new Float32Array(1024);
    const n = Math.tanh(k);
    for (let i = 0; i < cur.length; i++) { const x = (i / (cur.length - 1)) * 2 - 1; cur[i] = Math.tanh(k * x) / n; }
    c.set(key, cur);
  }
  return cur;
}
// decaying stereo noise with a few early reflections: walls, a lane, a yard
function impulse(ctx, secs, early) {
  const c = cache(ctx).irs, key = `${secs}|${early}`;
  let b = c.get(key);
  if (!b) {
    const n = Math.round(ctx.sampleRate * secs);
    b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let s = 0x9e3779b9 ^ (ch * 7919);
      const r = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296) * 2 - 1; };
      for (let i = 0; i < n; i++) { const x = i / n; d[i] = r() * Math.pow(1 - x, 2.4) * Math.exp(-x * 3); }
      for (const [at, g] of early) { const i = Math.round(at * ctx.sampleRate) + ch * 37; if (i < n) d[i] += g * (ch ? 0.8 : 1); }
    }
    c.set(key, b);
  }
  return b;
}

// free a cluster of per-event nodes when `src` ends
function freeOn(src, nodes) {
  src.onended = () => { for (const n of nodes) { try { n.disconnect(); } catch {} } };
}

// ---------------------------------------------------------------- building blocks

// Outdoor tail. Returns the node to feed: dry goes straight on, wet goes through
// the convolver. `early` are slap-back reflections [seconds, gain].
export function space(h, { wet = 0.3, secs = 1.6, early = [[0.07, 0.35], [0.19, 0.2]], to = h.dest } = {}) {
  const { ctx } = h;
  const input = h.gain(1);
  input.connect(to);
  const conv = h.keep(ctx.createConvolver());
  conv.buffer = impulse(ctx, secs, early);
  input.connect(conv);
  conv.connect(h.gain(wet, to));
  return input;
}

// A pitched call. Times in `f`, `a` and `vowels` are offsets from t.
//   f: [[dt, hz], ...]        pitch contour (exponential glides)
//   a: [[dt, 0..1], ...]      amplitude contour (linear); last point = end
//   formants: [[hz, q, gain]] or vowels: [[dt, "a"], ...]
//   growl: [hz, depth]        amplitude roughness (rasp, trill, frog pulse)
//   vib: [hz, cents]          vibrato
export function voice(h, t, o) {
  const { ctx } = h;
  const {
    type = "sawtooth", f, a, amp = 0.2, formants, vowels, growl, vib,
    shape = 0, noise = 0, pan = 0, lp = 9000, to = h.dest, partial,
  } = o;
  const end = t + a[a.length - 1][0];
  const nodes = [];
  const mk = (n) => { nodes.push(n); return n; };

  const osc = mk(ctx.createOscillator());
  osc.type = type;
  osc.frequency.setValueAtTime(f[0][1], t);
  for (let i = 1; i < f.length; i++) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f[i][1]), t + f[i][0]);

  let head = mk(ctx.createGain());
  osc.connect(head);
  if (partial) { // a second, quieter oscillator (two-tone horns, whistles with an overtone)
    const o2 = mk(ctx.createOscillator()); o2.type = partial.type || type;
    o2.frequency.setValueAtTime(f[0][1] * partial.ratio, t);
    for (let i = 1; i < f.length; i++) o2.frequency.exponentialRampToValueAtTime(Math.max(20, f[i][1] * partial.ratio), t + f[i][0]);
    const g2 = mk(ctx.createGain()); g2.gain.value = partial.gain ?? 0.5;
    o2.connect(g2); g2.connect(head);
    o2.start(t); o2.stop(end + 0.05);
  }
  if (vib) {
    const l = mk(ctx.createOscillator()); l.frequency.value = vib[0];
    const d = mk(ctx.createGain()); d.gain.value = vib[1];
    l.connect(d); d.connect(osc.detune); l.start(t); l.stop(end + 0.05);
  }
  if (noise > 0) { // breath / rasp riding the same envelope
    const ns = mk(ctx.createBufferSource()); ns.buffer = h.noiseBuf("white"); ns.loop = true;
    const ng = mk(ctx.createGain()); ng.gain.value = noise;
    ns.connect(ng); ng.connect(head);
    ns.start(t, Math.random() * 3); ns.stop(end + 0.05);
  }
  if (growl) { // amplitude modulation: 1 - depth .. 1
    const am = mk(ctx.createGain()); am.gain.value = 1 - growl[1] / 2;
    const l = mk(ctx.createOscillator()); l.type = growl[2] || "sine"; l.frequency.value = growl[0];
    const d = mk(ctx.createGain()); d.gain.value = growl[1] / 2;
    l.connect(d); d.connect(am.gain); l.start(t); l.stop(end + 0.05);
    head.connect(am); head = am;
  }
  if (shape > 0) {
    const ws = mk(ctx.createWaveShaper()); ws.curve = shaperCurve(ctx, shape); ws.oversample = "2x";
    head.connect(ws); head = ws;
  }

  const env = mk(ctx.createGain());
  env.gain.setValueAtTime(0, t);
  for (const [dt, v] of a) env.gain.linearRampToValueAtTime(v * amp, t + dt);

  const bank = formants || (vowels ? VOWEL[vowels[0][1]].map((fq, i) => [fq, [6, 8, 10][i], [1, 0.6, 0.25][i]]) : null);
  if (bank) {
    const filters = bank.map(([fq, q, g]) => {
      const bp = mk(ctx.createBiquadFilter()); bp.type = "bandpass"; bp.frequency.value = fq; bp.Q.value = q;
      const gg = mk(ctx.createGain()); gg.gain.value = g * Math.sqrt(q);
      head.connect(bp); bp.connect(gg); gg.connect(env);
      return bp;
    });
    if (vowels) for (const [dt, v] of vowels.slice(1)) {
      VOWEL[v].forEach((fq, i) => filters[i].frequency.setTargetAtTime(fq, t + dt, 0.025));
    }
  } else head.connect(env);

  let out = env;
  if (lp < 9000) { const l = mk(ctx.createBiquadFilter()); l.type = "lowpass"; l.frequency.value = lp; l.Q.value = 0.5; out.connect(l); out = l; }
  if (pan) { const p = mk(ctx.createStereoPanner()); p.pan.value = Math.max(-1, Math.min(1, pan)); out.connect(p); out = p; }
  out.connect(to);

  osc.start(t); osc.stop(end + 0.05);
  freeOn(osc, nodes);
  return end;
}

// A moving source. Feed sources into the returned `input`; the curves do the
// rest. `dop` is the doppler ratio curve (approaching = higher) to multiply
// into any oscillator frequency.
export function passby(h, t, { dur, peak = 0.5, near = 1, dir = side(), bright = 5000, to = h.dest, nodes }) {
  const { ctx } = h;
  const N = 96;
  const g = new Float32Array(N), p = new Float32Array(N), c = new Float32Array(N), dop = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1), x = u * 2 - 1;               // -1 → 0 (closest) → 1
    const prox = 1 / (1 + (x * 3.2) ** 2 / near);       // inverse-square-ish, softened
    const win = Math.sin(Math.PI * u) ** 0.6;            // fade the ends so nothing clicks
    g[i] = peak * prox * win;
    p[i] = dir * Math.tanh(x * 2.6) * 0.85;
    c[i] = 500 + bright * prox;
    dop[i] = 1 - 0.055 * Math.tanh(x * 4 * near);
  }
  const input = ctx.createGain();
  const lpf = ctx.createBiquadFilter(); lpf.type = "lowpass"; lpf.Q.value = 0.6;
  const env = ctx.createGain(); env.gain.value = 0;
  const pn = ctx.createStereoPanner();
  input.connect(lpf); lpf.connect(env); env.connect(pn); pn.connect(to);
  env.gain.setValueCurveAtTime(g, t, dur);
  pn.pan.setValueCurveAtTime(p, t, dur);
  lpf.frequency.setValueCurveAtTime(c, t, dur);
  nodes.push(input, lpf, env, pn);
  return { input, dop, g };
}

// curve helper: scale a curve by k (and optionally a ramp from 1 → r over its length)
const scaled = (curve, k, r = 1) => curve.map((v, i) => v * k * (1 + (r - 1) * (i / (curve.length - 1))));

// a looped noise source for per-event use
function noiseSrc(h, color, t, stopAt, nodes) {
  const s = h.ctx.createBufferSource(); s.buffer = h.noiseBuf(color); s.loop = true;
  s.start(t, Math.random() * 3); s.stop(stopAt); nodes.push(s);
  return s;
}

// ================================================================ animals

export function rooster(h) {
  const out = space(h, { wet: 0.32, secs: 2.2, early: [[0.11, 0.3], [0.29, 0.18], [0.5, 0.1]] });
  const crow = (t, { amp, lp, pan, b }) => {
    const common = { type: "sawtooth", amp, lp, pan, to: out, shape: 1.6, noise: 0.12,
      formants: [[950, 4, 1], [1750, 5, 0.75], [2900, 7, 0.3]], growl: [rand(48, 62), 0.4] };
    // cock - a - doodle - dooooo
    voice(h, t, { ...common, f: [[0, b], [0.09, b * 1.18]], a: [[0.012, 0.7], [0.08, 0.6], [0.11, 0]] });
    voice(h, t + 0.15, { ...common, f: [[0, b * 1.12], [0.1, b * 1.32]], a: [[0.012, 0.8], [0.09, 0.7], [0.12, 0]] });
    voice(h, t + 0.3, { ...common, f: [[0, b * 1.36], [0.1, b * 1.58], [0.2, b * 1.46]], a: [[0.015, 0.9], [0.18, 0.8], [0.21, 0]] });
    const L = rand(0.9, 1.35);
    voice(h, t + 0.55, {
      ...common, vib: [rand(6, 8), 28],
      f: [[0, b * 1.5], [0.18, b * 1.78], [L * 0.75, b * 1.72], [L, b * 1.15]],
      a: [[0.03, 1], [L * 0.6, 0.95], [L * 0.85, 0.55], [L, 0]],
    });
    return t + 0.55 + L;
  };
  let first = true;
  h.stream(() => { const g = first ? rand(0.8, 3) : rand(9, 26); first = false; return g; }, (t) => {
    const near = { amp: rand(0.2, 0.28), lp: 6500, pan: rand(-0.5, 0.5), b: rand(470, 560) };
    const end = crow(t, near);
    h.hit(t + 0.6, 1);
    if (Math.random() < 0.55) { // a neighbour's rooster answers from across the lane
      const t2 = end + rand(0.6, 3.5);
      crow(t2, { amp: rand(0.06, 0.11), lp: rand(1800, 2800), pan: -near.pan * rand(0.6, 1.4), b: rand(430, 600) });
      h.hit(t2 + 0.6, 0.35);
    }
  });
  return { mod: (now) => 0.12 + 0.88 * h.energy(now, 1.2) };
}

export function chickens(h) {
  const out = space(h, { wet: 0.18, secs: 1.1 });
  const hens = Array.from({ length: 3 }, () => ({ b: rand(260, 360), pan: rand(-0.7, 0.7), amp: rand(0.07, 0.13) }));
  const cluck = (t, hen, k = 1) => voice(h, t, {
    type: "sawtooth", f: [[0, hen.b * k * 1.08], [0.07, hen.b * k * 0.86]], a: [[0.006, 1], [0.05, 0.5], [0.08, 0]],
    amp: hen.amp, pan: hen.pan, to: out, noise: 0.18, shape: 1.2, lp: 4500,
    formants: [[750, 3, 1], [1500, 4, 0.6], [2700, 6, 0.25]],
  });
  h.stream(() => rand(0.6, 2.4), (t) => {
    const hen = pick(hens);
    let tt = t;
    for (let i = 0, n = Math.round(rand(3, 8)); i < n; i++) { cluck(tt, hen, rand(0.95, 1.08)); h.hit(tt, 0.2); tt += rand(0.16, 0.42); }
    if (Math.random() < 0.18) { // ba-GAWK: the egg announcement
      voice(h, tt + 0.1, {
        type: "sawtooth", f: [[0, hen.b * 1.2], [0.12, hen.b * 2.1], [0.4, hen.b * 1.4]], a: [[0.02, 1], [0.3, 0.8], [0.42, 0]],
        amp: hen.amp * 1.4, pan: hen.pan, to: out, noise: 0.15, shape: 1.8, growl: [70, 0.35], lp: 5000,
        formants: [[850, 3, 1], [1700, 4, 0.7], [3000, 6, 0.3]],
      });
      h.hit(tt + 0.2, 0.6);
    }
  });
  h.stream(() => rand(1.5, 5), (t) => { // scratching in the dust
    for (let i = 0; i < Math.round(rand(2, 5)); i++) h.burst(t + i * rand(0.08, 0.15), { color: "pink", dur: 0.05, amp: rand(0.03, 0.07), type: "bandpass", f: rand(2500, 4500), q: 0.8, to: out });
  });
  return { mod: (now) => 0.15 + 0.85 * h.energy(now, 0.35) };
}

export function crows(h) {
  const out = space(h, { wet: 0.22, secs: 1.4, early: [[0.09, 0.3], [0.23, 0.15]] });
  // the house crow: a flat, nasal "kaa", sometimes a hoarse jungle crow among them
  const birds = Array.from({ length: 4 }, () => {
    const jungle = Math.random() < 0.3;
    return { b: jungle ? rand(380, 470) : rand(600, 820), pan: rand(-0.9, 0.9), amp: rand(0.07, 0.15), lp: rand(2600, 6000), jungle };
  });
  const caw = (t, c) => {
    const d = rand(0.24, 0.38) * (c.jungle ? 1.25 : 1);
    voice(h, t, {
      type: "sawtooth", amp: c.amp, pan: c.pan, lp: c.lp, to: out, shape: 2.2, noise: c.jungle ? 0.5 : 0.32,
      f: [[0, c.b * 0.88], [0.04, c.b], [d * 0.7, c.b * 0.96], [d, c.b * 0.72]],
      a: [[0.02, 1], [d * 0.6, 0.9], [d, 0]],
      formants: [[1150, 3, 1], [1950, 4, 0.8], [3100, 5, 0.4]],
      growl: [rand(85, 125), c.jungle ? 0.75 : 0.55],
    });
    return d;
  };
  h.stream(() => expo(0.42), (t) => {
    const c = pick(birds);
    let tt = t;
    for (let i = 0, n = Math.round(rand(2, 5)); i < n; i++) { const d = caw(tt, c); h.hit(tt, 0.5); tt += d + rand(0.12, 0.3); }
    if (Math.random() < 0.35) { // another one argues back
      const o = pick(birds.filter((x) => x !== c)); let t2 = tt + rand(0.2, 0.9);
      for (let i = 0, n = Math.round(rand(1, 3)); i < n; i++) { const d = caw(t2, o); h.hit(t2, 0.35); t2 += d + rand(0.15, 0.35); }
    }
  });
  return { mod: (now) => 0.1 + 0.9 * h.energy(now, 0.5) };
}

export function koel(h) {
  const out = space(h, { wet: 0.38, secs: 2.4, early: [[0.15, 0.25], [0.36, 0.15]] });
  // the Asian koel: "ko-EL", repeated, each round higher and more urgent
  h.stream(() => rand(14, 38), (t) => {
    const pan = rand(-0.8, 0.8), amp = rand(0.1, 0.16), lp = rand(3000, 5500);
    let base = rand(620, 760), gap = rand(0.85, 1.05), tt = t;
    const n = Math.round(rand(5, 10));
    for (let i = 0; i < n; i++) {
      const w = { type: "sine", amp, pan, lp, to: out, partial: { ratio: 2, gain: 0.12, type: "sine" } };
      voice(h, tt, { ...w, f: [[0, base * 0.97], [0.16, base * 1.04]], a: [[0.03, 0.75], [0.12, 0.7], [0.18, 0]] });
      voice(h, tt + 0.24, { ...w, f: [[0, base * 1.24], [0.14, base * 1.44], [0.32, base * 1.4]], a: [[0.03, 1], [0.24, 0.9], [0.34, 0]], vib: [11, 9] });
      h.hit(tt + 0.3, 0.6);
      tt += gap; gap *= 0.93; base *= 1.035;
    }
  });
  return { mod: (now) => 0.08 + 0.92 * h.energy(now, 0.6) };
}

export function birds(h) {
  const out = space(h, { wet: 0.28, secs: 1.8 });
  // a handful of individuals, each with its own song shape
  const SPECIES = [
    (t, b) => { // sparrow chirps
      let tt = t;
      for (let i = 0, n = Math.round(rand(2, 6)); i < n; i++) {
        const f = rand(3800, 5200) * b.k;
        voice(h, tt, { type: "sine", amp: b.amp, pan: b.pan, lp: b.lp, to: out, f: [[0, f], [0.03, f * 1.25], [0.06, f * 0.9]], a: [[0.005, 1], [0.05, 0.6], [0.07, 0]] });
        tt += rand(0.08, 0.2);
      }
      return tt;
    },
    (t, b) => { // bulbul: a bubbling 3-5 note whistle
      let tt = t; const notes = [1, 1.26, 1.12, 1.5, 1.33];
      for (let i = 0, n = Math.round(rand(3, 5)); i < n; i++) {
        const f = 1700 * b.k * notes[i];
        voice(h, tt, { type: "sine", amp: b.amp, pan: b.pan, lp: b.lp, to: out, partial: { ratio: 2, gain: 0.08 }, f: [[0, f * 0.95], [0.08, f * 1.04]], a: [[0.012, 1], [0.08, 0.7], [0.12, 0]] });
        tt += rand(0.12, 0.17);
      }
      return tt;
    },
    (t, b) => { // a quick trill
      const f = rand(3000, 4200) * b.k, n = Math.round(rand(10, 22));
      for (let i = 0; i < n; i++) voice(h, t + i * 0.034, { type: "sine", amp: b.amp * 0.7, pan: b.pan, lp: b.lp, to: out, f: [[0, f], [0.025, f * 0.82]], a: [[0.003, 1], [0.025, 0]] });
      return t + n * 0.034;
    },
    (t, b) => { // magpie-robin: a long liquid phrase
      let tt = t;
      for (let i = 0, n = Math.round(rand(4, 8)); i < n; i++) {
        const f = rand(1800, 3600) * b.k, d = rand(0.06, 0.16);
        voice(h, tt, { type: "sine", amp: b.amp, pan: b.pan, lp: b.lp, to: out, f: [[0, f], [d, f * rand(0.8, 1.3)]], a: [[0.01, 1], [d * 0.8, 0.8], [d, 0]], vib: [rand(20, 35), 40] });
        tt += d + rand(0.02, 0.08);
      }
      return tt;
    },
  ];
  const flock = Array.from({ length: 6 }, (_, i) => ({ song: SPECIES[i % SPECIES.length], k: rand(0.85, 1.15), pan: rand(-0.95, 0.95), amp: rand(0.025, 0.06), lp: rand(5000, 9000) }));
  h.stream(() => expo(1.6), (t) => { const b = pick(flock); b.song(t, b); h.hit(t, 0.25); });
  return { mod: (now) => 0.15 + 0.85 * h.energy(now, 0.35) };
}

export function frogs(h) {
  const out = space(h, { wet: 0.3, secs: 1.6 });
  // small tree frogs: each a pulsed tone, trilling in bouts
  const chorus = Array.from({ length: 6 }, () => ({ f: rand(1300, 2800), rate: rand(22, 48), pan: rand(-0.95, 0.95), amp: rand(0.03, 0.07) }));
  for (const fr of chorus) {
    h.stream(() => rand(0.9, 3.2), (t) => {
      let tt = t;
      for (let i = 0, n = Math.round(rand(2, 7)); i < n; i++) {
        const d = rand(0.12, 0.35);
        voice(h, tt, { type: "triangle", amp: fr.amp, pan: fr.pan, to: out, lp: 6000, f: [[0, fr.f * 0.97], [d, fr.f]], a: [[0.01, 1], [d * 0.8, 0.8], [d, 0]], growl: [fr.rate, 0.95, "square"], formants: [[fr.f, 4, 1], [fr.f * 2, 6, 0.25]] });
        h.hit(tt, 0.12);
        tt += d + rand(0.15, 0.45);
      }
    });
  }
  // the banded bullfrog after rain: a deep "uum-AH", answered across the paddy
  h.stream(() => rand(2.5, 7), (t) => {
    const b = rand(190, 250), pan = rand(-0.7, 0.7), amp = rand(0.12, 0.2);
    let tt = t;
    for (let i = 0, n = Math.round(rand(1, 4)); i < n; i++) {
      voice(h, tt, {
        type: "sawtooth", amp, pan, to: out, lp: 1800, shape: 1, growl: [rand(28, 36), 0.5],
        f: [[0, b * 0.85], [0.15, b * 1.12], [0.42, b * 0.92]], a: [[0.05, 0.8], [0.2, 1], [0.38, 0.6], [0.48, 0]],
        vowels: [[0, "u"], [0.18, "a"]],
      });
      h.hit(tt + 0.15, 0.7);
      tt += rand(0.9, 1.4);
    }
  });
  return { mod: (now) => 0.25 + 0.75 * h.energy(now, 0.4) };
}

export function dogs(h) {
  const out = space(h, { wet: 0.4, secs: 2.6, early: [[0.13, 0.3], [0.31, 0.2], [0.55, 0.12]] });
  const pack = Array.from({ length: 3 }, () => ({ b: rand(230, 480), pan: rand(-0.9, 0.9), amp: rand(0.06, 0.13), lp: rand(1600, 3800) }));
  const bark = (t, d) => {
    const L = rand(0.12, 0.2);
    voice(h, t, {
      type: "sawtooth", amp: d.amp, pan: d.pan, lp: d.lp, to: out, shape: 2, noise: 0.35, growl: [rand(80, 110), 0.45],
      f: [[0, d.b * 1.15], [0.03, d.b * 1.5], [L, d.b * 0.85]], a: [[0.008, 1], [L * 0.5, 0.7], [L, 0]],
      vowels: [[0, "aw"], [L * 0.4, "o"]],
    });
    return L;
  };
  h.stream(() => rand(4, 16), (t) => {
    const d = pick(pack); let tt = t;
    for (let i = 0, n = Math.round(rand(2, 6)); i < n; i++) { const L = bark(tt, d); h.hit(tt, 0.6); tt += L + rand(0.18, 0.45); }
    if (Math.random() < 0.5) { // the whole lane joins in
      const o = pick(pack.filter((x) => x !== d)); let t2 = tt + rand(0.3, 1.5);
      for (let i = 0, n = Math.round(rand(2, 5)); i < n; i++) { const L = bark(t2, o); h.hit(t2, 0.4); t2 += L + rand(0.2, 0.5); }
    }
  });
  return { mod: (now) => 0.08 + 0.92 * h.energy(now, 0.5) };
}

// ================================================================ street

// low far-off traffic wash, shared by cars / motorbikes when they're on alone
function trafficBed(h, amount, t0) {
  const g = h.gain(amount, h.dest);
  h.bed("brown", h.filter("lowpass", 220, 0.7, g));
  const hiss = h.gain(amount * 0.12, h.dest);
  h.bed("pink", h.filter("bandpass", 900, 0.5, hiss));
  h.osc("sine", rand(0.03, 0.06), h.gain(amount * 0.3, g.gain)); // the city breathes
  return t0;
}

export function cars(h, t0) {
  trafficBed(h, 0.32, t0);
  h.stream(() => expo(0.28), (t) => {
    const big = Math.random() < 0.2; // a bus or a truck
    const dur = big ? rand(5, 8) : rand(3, 5.5), nodes = [];
    const near = rand(0.4, 1.1);
    const pb = passby(h, t, { dur, peak: (big ? 0.42 : 0.3) * near, near, bright: big ? 2200 : 4200, nodes });
    // tyres on wet tarmac: the dominant part of a passing car
    const tyre = h.ctx.createBiquadFilter(); tyre.type = "bandpass"; tyre.frequency.value = rand(700, 1300); tyre.Q.value = 0.6;
    nodes.push(tyre);
    noiseSrc(h, "pink", t, t + dur + 0.1, nodes).connect(tyre);
    const tg = h.ctx.createGain(); tg.gain.value = 0.9; nodes.push(tg); tyre.connect(tg); tg.connect(pb.input);
    // engine: a low sawtooth (firing rate), doppler applied
    const e = (big ? rand(28, 40) : rand(38, 62));
    const o = h.ctx.createOscillator(); o.type = "sawtooth"; nodes.push(o);
    o.frequency.setValueCurveAtTime(scaled(pb.dop, e, rand(0.95, 1.12)), t, dur);
    const elp = h.ctx.createBiquadFilter(); elp.type = "lowpass"; elp.frequency.value = big ? 260 : 420; nodes.push(elp);
    const eg = h.ctx.createGain(); eg.gain.value = big ? 0.55 : 0.32; nodes.push(eg);
    o.connect(elp); elp.connect(eg); eg.connect(pb.input);
    o.start(t); o.stop(t + dur + 0.1);
    freeOn(o, nodes);
    h.hit(t + dur / 2, big ? 0.9 : 0.6);
  });
  return { mod: (now) => 0.3 + 0.7 * h.energy(now, 1.4) };
}

export function motorbike(h, t0) {
  trafficBed(h, 0.18, t0);
  h.stream(() => expo(0.22), (t) => {
    const dur = rand(2.4, 4.2), nodes = [];
    const near = rand(0.5, 1.2);
    const pb = passby(h, t, { dur, peak: 0.26 * near, near, bright: 5200, nodes });
    // single-cylinder buzz: fast sawtooth + a sub, through a mid "exhaust" bandpass
    const e = rand(70, 105), rev = rand(1.05, 1.35);
    const o = h.ctx.createOscillator(); o.type = "sawtooth"; nodes.push(o);
    const sub = h.ctx.createOscillator(); sub.type = "square"; nodes.push(sub);
    o.frequency.setValueCurveAtTime(scaled(pb.dop, e, rev), t, dur);
    sub.frequency.setValueCurveAtTime(scaled(pb.dop, e / 2, rev), t, dur);
    const ws = h.ctx.createWaveShaper(); ws.curve = shaperCurve(h.ctx, 2.5); nodes.push(ws);
    const bp = h.ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = rand(700, 1300); bp.Q.value = 0.9; nodes.push(bp);
    const sg = h.ctx.createGain(); sg.gain.value = 0.4; nodes.push(sg);
    const og = h.ctx.createGain(); og.gain.value = 0.55; nodes.push(og);
    o.connect(ws); sub.connect(sg); sg.connect(ws); ws.connect(bp); bp.connect(og); og.connect(pb.input);
    o.start(t); sub.start(t); o.stop(t + dur + 0.1); sub.stop(t + dur + 0.1);
    freeOn(o, nodes);
    h.hit(t + dur / 2, 0.6);
    if (Math.random() < 0.3) { // beep-beep coming through
      const ht = t + dur * rand(0.3, 0.45), f = rand(480, 620);
      for (let i = 0; i < 2; i++) voice(h, ht + i * 0.16, { type: "square", amp: 0.07 * near, pan: 0, lp: 3500, f: [[0, f], [0.1, f]], a: [[0.005, 1], [0.09, 1], [0.11, 0]], partial: { ratio: 1.26, gain: 0.7 }, formants: [[1100, 1.2, 1], [2400, 2, 0.5]] });
      h.hit(ht, 0.5);
    }
  });
  return { mod: (now) => 0.25 + 0.75 * h.energy(now, 1) };
}

// a bicycle bell: inharmonic partials of a struck dome
function bell(h, t, { amp = 0.08, pan = 0, base = rand(2100, 2700), to = h.dest } = {}) {
  const ratios = [1, 2.76, 5.4, 8.93], gains = [1, 0.55, 0.3, 0.15];
  const pattern = Math.random() < 0.4 ? [0, 0.11] : Math.random() < 0.6 ? [0, 0.065, 0.13, 0.195, 0.26] : [0];
  for (const off of pattern) {
    ratios.forEach((r, i) => {
      const d = 0.9 / (1 + i * 0.8);
      h.tone(t + off, { f: base * r, dur: d, amp: amp * gains[i], atk: 0.001, type: "sine", to: panTo(h, pan, to) });
    });
  }
  return pattern[pattern.length - 1];
}
// cached panners per layer instance: stable pan positions, kept for the layer's life
function panTo(h, pan, to) {
  h._pans ||= new Map();
  const key = Math.round(pan * 10);
  let p = h._pans.get(key);
  if (!p) { p = h.keep(h.ctx.createStereoPanner()); p.pan.value = key / 10; p.connect(to); h._pans.set(key, p); }
  return p;
}

export function bicycle(h) {
  h.stream(() => expo(0.16), (t) => {
    const dur = rand(4, 7), nodes = [];
    const near = rand(0.5, 1.3);
    const pb = passby(h, t, { dur, peak: 0.5 * near, near, bright: 7000, nodes });
    // freewheel: a fast ratchet while coasting, chain whirr while pedalling
    const coastAt = dur * rand(0.35, 0.6), clicks = rand(16, 24);
    for (let x = coastAt; x < dur - 0.2; x += 1 / clicks) h.burst(t + x, { dur: 0.004, amp: rand(0.05, 0.09), type: "highpass", f: 4500, q: 0.7, to: pb.input });
    const whirr = h.ctx.createBiquadFilter(); whirr.type = "bandpass"; whirr.frequency.value = 2400; whirr.Q.value = 1.4; nodes.push(whirr);
    const wg = h.ctx.createGain(); wg.gain.value = 0; nodes.push(wg);
    const ped = h.ctx.createOscillator(); ped.frequency.value = rand(1.1, 1.6); nodes.push(ped); // pedal strokes
    const pd = h.ctx.createGain(); pd.gain.value = 0.05; nodes.push(pd);
    ped.connect(pd); pd.connect(wg.gain);
    wg.gain.setValueAtTime(0.06, t); wg.gain.setValueAtTime(0.06, t + coastAt); wg.gain.linearRampToValueAtTime(0, t + coastAt + 0.2);
    const ns = noiseSrc(h, "pink", t, t + dur + 0.1, nodes);
    ns.connect(whirr); whirr.connect(wg); wg.connect(pb.input);
    ped.start(t); ped.stop(t + dur + 0.1);
    freeOn(ns, nodes);
    h.hit(t + dur / 2, 0.3);
    if (Math.random() < 0.65) { // tring-tring
      const bt = t + dur * rand(0.25, 0.45);
      bell(h, bt, { amp: 0.07 * near, pan: rand(-0.4, 0.4) });
      h.hit(bt, 0.8);
    }
  });
  return { mod: (now) => 0.1 + 0.9 * h.energy(now, 0.6) };
}

export function horns(h) {
  const out = space(h, { wet: 0.25, secs: 1.2, early: [[0.06, 0.35], [0.14, 0.25], [0.27, 0.12]] }); // street canyon slap
  const KINDS = [
    { f: () => rand(390, 450), r: 1.25, type: "square", lp: 4000, bp: 1300 },  // car, two-tone
    { f: () => rand(280, 330), r: 1.25, type: "sawtooth", lp: 2600, bp: 900 }, // bus
    { f: () => rand(520, 680), r: 1.19, type: "square", lp: 5000, bp: 1800 },  // motorbike / tuk-tuk
  ];
  const honk = (t, k, f, d, amp, pan, lp) => voice(h, t, {
    type: k.type, amp, pan, lp, to: out, shape: 1.4, partial: { ratio: k.r, gain: 0.8 },
    f: [[0, f * 0.97], [0.02, f], [d, f * 0.99]], a: [[0.006, 1], [d - 0.02, 0.95], [d, 0]],
    formants: [[k.bp, 1.1, 1], [k.bp * 2.1, 2, 0.4]],
  });
  h.stream(() => expo(0.4), (t) => {
    const k = pick(KINDS), f = k.f(), dist = rand(0.2, 1);
    const amp = 0.05 + 0.1 * dist, pan = rand(-0.9, 0.9), lp = 1500 + 4000 * dist;
    const pat = pick([[0.12], [0.1, 0.1], [0.08, 0.08, 0.08], [rand(0.5, 1.1)], [0.1, rand(0.4, 0.8)]]);
    let tt = t;
    for (const d of pat) { honk(tt, k, f, d, amp, pan, lp); tt += d + rand(0.07, 0.12); }
    h.hit(t, 0.4 + 0.5 * dist);
    if (Math.random() < 0.3) { const k2 = pick(KINDS); honk(tt + rand(0.2, 0.8), k2, k2.f(), rand(0.15, 0.5), 0.05, -pan, 2500); } // answered
  });
  return { mod: (now) => 0.05 + 0.95 * h.energy(now, 0.4) };
}

// many overlapping talkers: formant-filtered noise, gated at syllable rate
function talkers(h, n, sum, { spread = 0.9 } = {}) {
  const rates = [];
  for (let v = 0; v < n; v++) {
    const vw = VOWEL[pick(Object.keys(VOWEL))];
    const g = h.gain(0.4);
    const p = h.keep(h.ctx.createStereoPanner()); p.pan.value = rand(-spread, spread);
    g.connect(p); p.connect(sum);
    const f2 = h.filter("bandpass", vw[1] * rand(0.9, 1.15), 2.2, g);
    h.bed("pink", h.filter("bandpass", vw[0] * rand(0.9, 1.15), 2.6, f2));
    const r = rand(3, 6); rates.push(r);
    h.osc("sine", r, h.gain(0.36, g.gain));                // syllables
    h.osc("sine", rand(0.07, 0.25), h.gain(0.3, g.gain));  // phrases come and go
  }
  return rates;
}

export function crowd(h, t0) {
  const sum = h.gain(0.55, h.filter("lowpass", 3200, 0.7, space(h, { wet: 0.25, secs: 1.3 })));
  talkers(h, 9, sum);
  h.bed("pink", h.filter("bandpass", 450, 0.5, h.gain(0.07, h.dest))); // shuffle of feet, the room of the street
  // laughter: a falling run of "ha"
  h.stream(() => rand(5, 14), (t) => {
    const b = rand(220, 340), pan = rand(-0.8, 0.8), amp = rand(0.04, 0.07);
    for (let i = 0, n = Math.round(rand(3, 7)); i < n; i++) voice(h, t + i * rand(0.11, 0.15), { type: "sawtooth", amp: amp * (1 - i * 0.08), pan, lp: 3500, noise: 0.4, f: [[0, b * (1 - i * 0.03)], [0.08, b * (0.92 - i * 0.03)]], a: [[0.01, 1], [0.06, 0.5], [0.09, 0]], vowels: [[0, "a"]] });
    h.hit(t, 0.4);
  });
  // a voice that carries: someone calling a name across the road
  h.stream(() => rand(6, 18), (t) => {
    const b = rand(200, 330), pan = rand(-0.9, 0.9), d = rand(0.5, 0.9);
    voice(h, t, { type: "sawtooth", amp: rand(0.04, 0.07), pan, lp: 3000, noise: 0.08, f: [[0, b], [0.15, b * 1.3], [d, b * 1.05]], a: [[0.04, 0.8], [d * 0.6, 1], [d, 0]], vowels: [[0, "e"], [d * 0.35, "o"]] });
    h.hit(t + 0.1, 0.5);
  });
  return { mod: (now) => 0.6 + 0.12 * Math.sin((now - t0) * 0.7) + 0.28 * h.energy(now, 0.5) };
}

// a street vendor's sing-song cry, some through a hand megaphone
function vendorCall(h, t, v, to) {
  const SCALE = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3]; // pentatonic-ish
  const syl = Math.round(rand(3, 6));
  let tt = t;
  for (let i = 0; i < syl; i++) {
    const last = i === syl - 1;
    const f = v.b * (last ? pick([1, 9 / 8]) : pick(SCALE));
    const d = last ? rand(0.6, 1.1) : rand(0.16, 0.3);
    const vw = pick(["a", "o", "e", "i", "aw"]);
    voice(h, tt, {
      type: "sawtooth", amp: v.amp, pan: v.pan, lp: v.mega ? 3400 : 4200, to, shape: v.mega ? 3 : 0.6, noise: 0.05,
      f: last ? [[0, f * 1.04], [d * 0.4, f], [d, f * 0.82]] : [[0, f * 0.98], [d, f * 1.02]],
      a: [[0.03, 0.9], [d * 0.7, last ? 0.8 : 0.9], [d, 0]],
      vowels: [[0, vw]], vib: last ? [5.5, 25] : null,
      // megaphone: narrow, honky, a resonance around 2.2 kHz
      formants: v.mega ? [[VOWEL[vw][0], 4, 1], [VOWEL[vw][1], 5, 0.8], [2200, 1, 0.4]] : undefined,
    });
    tt += d + (last ? 0 : rand(0.03, 0.08));
  }
  return tt;
}

export function market(h, t0) {
  const out = space(h, { wet: 0.28, secs: 1.5 });
  const sum = h.gain(0.38, h.filter("lowpass", 3000, 0.7, out));
  talkers(h, 6, sum);
  const vendors = Array.from({ length: 4 }, (_, i) => ({ b: i % 2 ? rand(270, 360) : rand(170, 230), pan: rand(-0.85, 0.85), amp: rand(0.05, 0.085), mega: i === 3 }));
  for (const v of vendors) h.stream(() => rand(7, 18), (t) => { vendorCall(h, t, v, out); h.hit(t, 0.6); });
  // chopping on a block, a ladle against a pot, plastic bags
  h.stream(() => rand(3, 9), (t) => {
    for (let i = 0, n = Math.round(rand(4, 12)); i < n; i++) {
      const tt = t + i * rand(0.17, 0.24);
      h.burst(tt, { color: "pink", dur: 0.025, amp: 0.12, type: "bandpass", f: rand(1200, 1800), q: 1.5, to: out });
      h.tone(tt, { f: rand(140, 180), f2: 90, dur: 0.04, amp: 0.08, to: out });
    }
  });
  h.stream(() => rand(4, 11), (t) => { const f = rand(1800, 2600); h.tone(t, { f, dur: 0.35, amp: 0.025, to: out }); h.tone(t, { f: f * 2.4, dur: 0.2, amp: 0.012, to: out }); });
  h.stream(() => rand(2, 7), (t) => {
    for (let i = 0; i < Math.round(rand(3, 8)); i++) h.burst(t + i * rand(0.02, 0.06), { dur: rand(0.02, 0.05), amp: rand(0.02, 0.05), type: "highpass", f: rand(3000, 6000), q: 0.7, to: out });
  });
  return { mod: (now) => 0.55 + 0.1 * Math.sin((now - t0) * 0.6) + 0.35 * h.energy(now, 0.6) };
}

export const SFX = { birds, rooster, chickens, crows, koel, frogs, dogs, cars, motorbike, bicycle, horns, crowd, market };
