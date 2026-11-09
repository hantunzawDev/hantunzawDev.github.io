// Pure noise generators: no DOM, no Web Audio.
export const PEAK = 0.9;
export const SEAM = 256;

// mulberry32: deterministic PRNG, returns floats in [0, 1).
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function white(out, rng) {
  for (let i = 0; i < out.length; i++) out[i] = rng() * 2 - 1;
}

// Paul Kellet's economy pink filter.
function pink(out, rng) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < out.length; i++) {
    const w = rng() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
  }
}

function brown(out, rng) {
  let b = 0;
  for (let i = 0; i < out.length; i++) {
    b = (b + 0.02 * (rng() * 2 - 1)) / 1.02;
    out[i] = b;
  }
}

function blue(out, rng) {
  let prev = rng() * 2 - 1;
  for (let i = 0; i < out.length; i++) {
    const w = rng() * 2 - 1;
    out[i] = w - prev;
    prev = w;
  }
}

// Pink with a gentle low-mid cut (pink minus a scaled one-pole low-pass).
function grey(out, rng) {
  pink(out, rng);
  let lp = 0;
  for (let i = 0; i < out.length; i++) {
    lp += 0.065 * (out[i] - lp);
    out[i] = out[i] - 0.5 * lp;
  }
}

const GENERATORS = { white, pink, brown, blue, grey };

// Fill `out` with `color` noise: DC removed, peak-normalised to 0.9, and the
// first/last SEAM samples ramped (raised cosine) to zero so a looped buffer
// has no click at the wrap point.
export function fillNoise(color, out, rng) {
  const gen = GENERATORS[color];
  if (!gen) throw new Error(`unknown noise color: ${color}`);
  gen(out, rng);
  const n = out.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += out[i];
  mean /= n;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    out[i] -= mean;
    const a = Math.abs(out[i]);
    if (a > peak) peak = a;
  }
  const g = peak > 0 ? PEAK / peak : 0;
  for (let i = 0; i < n; i++) out[i] *= g;
  const L = Math.min(SEAM, n >> 1);
  for (let i = 0; i < L; i++) {
    const w = 0.5 - 0.5 * Math.cos((Math.PI * i) / L); // 0 -> ~1
    out[i] *= w;
    out[n - 1 - i] *= w;
  }
  return out;
}
