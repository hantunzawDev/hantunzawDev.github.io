// Shared helpers for the genre builders: node bookkeeping, pitch math, sidechain
// ducking and the drum voices several genres reuse. Every Tone node a builder
// makes goes through `k.n()` so `dispose()` can free all of it and `stats` can
// prove nothing leaks across genre switches.
export const stats = { created: 0, disposed: 0 };

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const vel = (v) => (v === 2 ? 1 : 0.72);
export const clamp01 = (v) => Math.min(1, Math.max(0, +v || 0));
export const lerp = (a, b, t) => a + (b - a) * t;
// exponential interpolation, for frequencies
export const xerp = (a, b, t) => a * Math.pow(b / a, t);

export function kit(Tone) {
  const nodes = [];
  let disposed = false;
  const add = (node) => {
    nodes.push(node); stats.created++;
    // Reverb renders its impulse asynchronously; a genre disposed mid-render
    // (rapid switching) must not surface as an unhandled rejection.
    if (node.ready && typeof node.ready.catch === "function") node.ready.catch((e) => { if (!disposed) console.error(e); });
    return node;
  };
  return {
    add,
    n: (name, opts) => add(new Tone[name](opts)),
    dispose() {
      disposed = true;
      for (const node of nodes.splice(0).reverse()) {
        try { node.dispose(); } catch {}
        stats.disposed++;
      }
    },
  };
}

// Kick-triggered gain dip: hold at `depth`, recover with time constant `rel`.
export function duck(gainNode, t, depth = 0.25, rel = 0.07) {
  const p = gainNode.gain;
  p.cancelAndHoldAtTime(t);
  p.linearRampToValueAtTime(depth, t + 0.004);
  p.setTargetAtTime(1, t + 0.03, rel);
}

// Kick = pitched sine body + a short filtered noise click for the attack.
export function kick(k, dest, o = {}) {
  const body = k.n("MembraneSynth", {
    pitchDecay: o.pitchDecay ?? 0.045, octaves: o.octaves ?? 5.5,
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: o.decay ?? 0.42, sustain: 0, release: 0.05 },
    volume: o.volume ?? 0,
  });
  const click = k.n("NoiseSynth", {
    noise: { type: "white" },
    envelope: { attack: 0.0005, decay: o.clickDecay ?? 0.006, sustain: 0, release: 0.004 },
    volume: o.clickVolume ?? -16,
  });
  const clickHp = k.n("Filter", { type: "highpass", frequency: o.clickHp ?? 2400 });
  body.connect(dest);
  click.chain(clickHp, dest);
  const note = o.note ?? 41.2;
  return {
    body,
    hit(t, v = 1) {
      body.triggerAttackRelease(note, 0.25, t, v);
      if (o.click !== false) click.triggerAttackRelease(0.01, t, v);
    },
  };
}

// Hat = noise burst through a highpass (plus optional bandpass for tone).
export function hat(k, dest, o = {}) {
  const synth = k.n("NoiseSynth", {
    noise: { type: o.noise ?? "white" },
    envelope: { attack: 0.001, decay: o.decay ?? 0.03, sustain: 0, release: o.release ?? 0.01 },
    volume: o.volume ?? -12,
  });
  const hp = k.n("Filter", { type: "highpass", frequency: o.hp ?? 8000, Q: 0.7 });
  const pan = k.n("Panner", o.pan ?? 0);
  synth.chain(hp, pan, dest);
  return {
    synth, hp, pan,
    hit(t, v = 1, len = 0.02) { synth.triggerAttackRelease(len, t, v); },
  };
}

// Snare/clap = bandpassed noise + a short tonal body.
export function snare(k, dest, o = {}) {
  const noise = k.n("NoiseSynth", {
    noise: { type: o.noise ?? "white" },
    envelope: { attack: 0.001, decay: o.decay ?? 0.16, sustain: 0, release: 0.03 },
    volume: o.volume ?? -10,
  });
  const bp = k.n("Filter", { type: "bandpass", frequency: o.bp ?? 1900, Q: o.Q ?? 0.8 });
  noise.chain(bp, dest);
  let body = null;
  if (o.body !== false) {
    body = k.n("MembraneSynth", {
      pitchDecay: 0.02, octaves: 2,
      envelope: { attack: 0.001, decay: o.bodyDecay ?? 0.09, sustain: 0, release: 0.02 },
      volume: o.bodyVolume ?? -14,
    });
    body.connect(dest);
  }
  return {
    hit(t, v = 1) {
      noise.triggerAttackRelease(0.05, t, v);
      body?.triggerAttackRelease(o.bodyNote ?? 190, 0.05, t, v);
    },
  };
}

// Bit-depth reducer as a staircase WaveShaper (Tone's BitCrusher is an
// AudioWorklet loaded from a blob: URL, which the site CSP rightly refuses).
export function crusher(k, bits) {
  const ws = k.n("WaveShaper", { length: 4096 });
  const set = (b) => { const q = 2 ** (Math.max(4, b) - 1); ws.setMap((x) => Math.round(x * q) / q); }; // floor: 4 bits
  set(bits);
  ws.setBits = set;
  return ws;
}

// Seeded choice helpers (rng from gen.js makeRng).
export const pickOf = (rng, arr) => arr[Math.floor(rng() * arr.length)];
