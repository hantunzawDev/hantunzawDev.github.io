// Non-techno builders: lo-fi, synthwave, ambient, drum & bass, classical.
// Same contract as techno.js: build(Tone, out, knobs) → { trigger, setKnob?, decorate?, dispose }.
import { kit, duck, kick, hat, snare, crusher, mtof, vel, lerp, pickOf } from "./kit.js";

const chordHz = (root, ivs, oct = 0) => ivs.map((s) => mtof(root + s + oct));

// ---------------------------------------------------------------- lo-fi
// Swung dusty drums through LP 3.5 kHz + light bitcrush, Rhodes-ish FM chords
// over a maj7/min9 progression, tape wobble, vinyl crackle, round bass.
export function lofi(Tone, out, knobs) {
  const k = kit(Tone);
  const drumLp = k.n("Filter", { type: "lowpass", frequency: 3500, rolloff: -12 });
  const drumCrush = crusher(k, 10); // light: 10-bit grit
  drumCrush.chain(drumLp, out);
  const kk = kick(k, drumCrush, { note: mtof(38), decay: 0.32, pitchDecay: 0.03, octaves: 3, click: false, volume: -2 });
  const roomVerb = k.n("Reverb", { decay: 1.2, wet: 0.25 }); roomVerb.connect(drumCrush);
  const sn = snare(k, roomVerb, { noise: "pink", decay: 0.17, bp: 1700, Q: 0.7, volume: -6, bodyNote: 180, bodyVolume: -12 });
  const hh = hat(k, drumCrush, { decay: 0.035, hp: 6000, volume: -16, pan: 0.15 });

  const wobble = k.n("Vibrato", { frequency: 0.3, depth: 0.08 });
  const keysLp = k.n("Filter", { type: "lowpass", frequency: 3000 });
  const keysVerb = k.n("Reverb", { decay: 2.5, wet: 0.3 });
  const keys = k.n("PolySynth", { maxPolyphony: 12, voice: Tone.FMSynth, options: {
    harmonicity: 3, modulationIndex: 1.6,
    oscillator: { type: "sine" }, modulation: { type: "sine" },
    envelope: { attack: 0.008, decay: 1.6, sustain: 0.3, release: 1.4 },
    modulationEnvelope: { attack: 0.004, decay: 0.5, sustain: 0.1, release: 0.6 },
  }, volume: -15 });
  keys.chain(wobble, keysLp, keysVerb, out);
  const bassLp = k.n("Filter", { type: "lowpass", frequency: 420 });
  const bass = k.n("Synth", { oscillator: { type: "triangle" }, envelope: { attack: 0.01, decay: 0.4, sustain: 0.5, release: 0.25 }, volume: -8 });
  bass.chain(bassLp, out);
  const dust = k.n("Noise", { type: "brown", volume: -42 }); dust.connect(out); dust.start();
  const crackle = hat(k, out, { decay: 0.002, release: 0.001, hp: 2500, volume: -28 });

  // [root midi, intervals] one chord per bar; two progressions alternate per 16-bar block
  const PROGS = [
    [[53, [0, 4, 7, 11]], [52, [0, 3, 7, 10]], [50, [0, 3, 7, 10, 14]], [48, [0, 4, 7, 11]]], // Fmaj7 Em7 Dm9 Cmaj7
    [[51, [0, 4, 7, 11]], [50, [0, 3, 7, 10]], [48, [0, 3, 7, 10, 14]], [46, [0, 4, 7, 11, 14]]], // Ebmaj7 Dm7 Cm9 Bbmaj9
  ];
  const applyDark = (d) => { keysLp.frequency.rampTo(lerp(3600, 1500, d), 0.4); keysVerb.wet.rampTo(lerp(0.25, 0.45, d), 0.4); };
  applyDark(knobs.dark);
  let chord = PROGS[0][0];

  return {
    setKnob(name, v) { if (name === "dark") applyDark(v); },
    trigger(step, t, p, info) {
      const { bar, dur } = info;
      if (step === 0) {
        chord = PROGS[(bar >> 4) % 2][bar % 4];
        const ivs = info.knobs.dark > 0.6 && chord[1][1] === 4 ? [0, 3, 7, 10] : chord[1];
        chordHz(chord[0], ivs).forEach((f, i) => keys.triggerAttackRelease(f, dur * 12, t + i * 0.014 + info.rnd() * 0.006, 0.55 + 0.2 * info.rnd()));
      }
      if (step === 14 && info.rnd() < 0.35) keys.triggerAttackRelease(mtof(chord[0] + 12 + pickOf(info.rng(61 + bar % 8), chord[1])), dur * 3, t, 0.35);
      if (p.kick[step]) kk.hit(t, vel(p.kick[step]) * 0.9);
      if (p.perc[step]) sn.hit(t, p.perc[step] === 2 ? 0.85 : 0.3);
      if (p.hat[step]) hh.hit(t, 0.3 + 0.35 * info.rnd(), 0.02);
      if (p.bass[step]) bass.triggerAttackRelease(mtof(chord[0] - 12 + (p.bass[step] - 1 === 7 ? 7 : 0)), dur * 3, t, 0.85);
      if (info.rnd() < 0.35) crackle.hit(t + info.rnd() * dur, 0.15 + 0.85 * info.rnd() ** 3, 0.002);
    },
    dispose: k.dispose,
  };
}

// ---------------------------------------------------------------- synthwave
// A minor, i–VI–III–VII (two bars each): 16th saw arpeggio into a delay, wide
// detuned pad, 8th-note octave bass, gated-reverb snare, ducked to the kick.
export function synthwave(Tone, out, knobs) {
  const k = kit(Tone);
  const PROG = [[45, [0, 3, 7]], [41, [0, 4, 7]], [48, [0, 4, 7]], [43, [0, 4, 7]]]; // Am F C G
  const duckBus = k.n("Gain", 1); duckBus.connect(out);
  const kk = kick(k, out, { note: mtof(33), decay: 0.32, pitchDecay: 0.04, octaves: 5, volume: -2 });

  // gated reverb: dry snare + a reverb tail chopped off by a fast gate
  const snBus = k.n("Gain", 1); snBus.connect(out);
  const gateVerb = k.n("Reverb", { decay: 2.6, wet: 1 });
  const gate = k.n("Gain", 0);
  snBus.chain(gateVerb, gate, out);
  const sn = snare(k, snBus, { decay: 0.2, bp: 2200, Q: 0.6, volume: -8, bodyNote: 200, bodyVolume: -10 });
  const ch = hat(k, duckBus, { decay: 0.03, hp: 9000, volume: -22, pan: 0.2 });
  const oh = hat(k, duckBus, { decay: 0.15, hp: 7500, volume: -22, pan: -0.2 });

  const arpLp = k.n("Filter", { type: "lowpass", frequency: 2400, Q: 1.5 });
  const arpDelay = k.n("FeedbackDelay", { delayTime: "8n.", feedback: 0.3, wet: 0.28 });
  const arpPan = k.n("AutoPanner", { frequency: 0.12, depth: 0.5 }).start();
  const arp = k.n("MonoSynth", {
    oscillator: { type: "sawtooth" },
    filter: { type: "lowpass", Q: 2 },
    envelope: { attack: 0.002, decay: 0.14, sustain: 0.15, release: 0.08 },
    filterEnvelope: { attack: 0.002, decay: 0.12, sustain: 0.2, release: 0.1, baseFrequency: 700, octaves: 2.5 },
    volume: -19,
  });
  arp.chain(arpLp, arpDelay, arpPan, duckBus);

  const padLp = k.n("Filter", { type: "lowpass", frequency: 1800 });
  const chorus = k.n("Chorus", { frequency: 0.6, delayTime: 3.5, depth: 0.7, spread: 180, wet: 0.6 }).start();
  const padVerb = k.n("Reverb", { decay: 3.5, wet: 0.4 });
  const pad = k.n("PolySynth", { maxPolyphony: 8, voice: Tone.Synth, options: {
    oscillator: { type: "fatsawtooth", count: 3, spread: 42 },
    envelope: { attack: 0.7, decay: 0.6, sustain: 0.75, release: 1.6 },
  }, volume: -27 });
  pad.chain(padLp, chorus, padVerb, duckBus);

  const bass = k.n("MonoSynth", {
    oscillator: { type: "sawtooth" },
    filter: { type: "lowpass", rolloff: -24, Q: 1 },
    envelope: { attack: 0.003, decay: 0.15, sustain: 0.4, release: 0.06 },
    filterEnvelope: { attack: 0.002, decay: 0.12, sustain: 0.2, release: 0.1, baseFrequency: 140, octaves: 2.6 },
    volume: -11,
  });
  bass.connect(duckBus);

  const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 4, 3, 2, 1, 2, 3, 4, 5];
  const applyDark = (d) => { arpLp.frequency.rampTo(lerp(3600, 1200, d), 0.3); padLp.frequency.rampTo(lerp(2600, 900, d), 0.3); };
  applyDark(knobs.dark);
  let chord = PROG[0];

  return {
    setKnob(name, v) { if (name === "dark") applyDark(v); },
    // octave bass on every 8th, pattern bass adds 16th pickups
    decorate(p) {
      const bassOut = p.bass.map((b, i) => (i % 2 === 0 ? (i % 4 === 2 ? 13 : 1) : b ? 13 : 0));
      return { ...p, bass: bassOut };
    },
    trigger(step, t, p, info) {
      const { bar, dur } = info;
      if (step === 0) {
        chord = PROG[(bar >> 1) % 4];
        if (bar % 2 === 0) pad.triggerAttackRelease(chordHz(chord[0], [...chord[1], 12], 12), dur * 31, t, 0.6);
      }
      const tones = [...chord[1], 12, chord[1][1] + 12, chord[1][2] + 12];
      arp.triggerAttackRelease(mtof(chord[0] + 12 + tones[ARP[step]]), dur * 0.6, t, step % 4 === 0 ? 0.9 : 0.6);
      if (p.kick[step]) { kk.hit(t, vel(p.kick[step])); duck(duckBus, t, 0.35, 0.07); }
      if (p.perc[step] === 2) {
        sn.hit(t, 0.95);
        gate.gain.cancelAndHoldAtTime(t);
        gate.gain.setValueAtTime(0.9, t);
        gate.gain.setValueAtTime(0.9, t + 0.26);
        gate.gain.linearRampToValueAtTime(0, t + 0.29);
      }
      if (p.hat[step] === 2) oh.hit(t, 0.7, 0.06); else if (p.hat[step]) ch.hit(t, 0.4 + 0.3 * info.rnd());
      if (p.bass[step]) bass.triggerAttackRelease(mtof(chord[0] - 12 + p.bass[step] - 1), dur * 0.8, t, 0.85);
    },
    dispose: k.dispose,
  };
}

// ---------------------------------------------------------------- ambient
// D (lydian, minor when dark). Three slow detuned pad voices with random 8–20 s
// envelopes, a root drone, rare bells, all into a long reverb + octave shimmer.
export function ambient(Tone, out, knobs) {
  const k = kit(Tone);
  const verb = k.n("Reverb", { decay: 10, preDelay: 0.05, wet: 0.55 }); verb.connect(out);
  const shimmerSend = k.n("Gain", 0.4);
  const shift = k.n("PitchShift", { pitch: 12, windowSize: 0.12 });
  const shimmerVerb = k.n("Reverb", { decay: 14, wet: 1 });
  const shimmerLevel = k.n("Gain", 0.3);
  shimmerSend.chain(shift, shimmerVerb, shimmerLevel, out);
  const lp = k.n("Filter", { type: "lowpass", frequency: 1800, rolloff: -12 });
  lp.connect(verb); lp.connect(shimmerSend);

  const voices = [-0.6, 0, 0.6].map((pan) => {
    const pn = k.n("Panner", pan);
    const s = k.n("Synth", { oscillator: { type: "fattriangle", count: 3, spread: 22 }, envelope: { attack: 4, decay: 1, sustain: 0.8, release: 6 }, volume: -14 });
    s.chain(pn, lp);
    return { s, freeAt: 0 };
  });
  const drone = k.n("Synth", { oscillator: { type: "sine" }, envelope: { attack: 8, decay: 1, sustain: 1, release: 8 }, volume: -16 });
  drone.connect(lp);
  const bell = k.n("FMSynth", {
    harmonicity: 3.5, modulationIndex: 6,
    envelope: { attack: 0.01, decay: 3, sustain: 0, release: 3 },
    modulationEnvelope: { attack: 0.01, decay: 1.5, sustain: 0, release: 1 },
    volume: -30,
  });
  bell.connect(shimmerSend);

  let dark = knobs.dark, droneOn = false;
  const ROOT = 38; // D2
  const scale = () => (dark > 0.5 ? [0, 3, 7, 10, 14, 15, 19] : [0, 4, 7, 9, 11, 14, 18]);
  const applyDark = (d) => { dark = d; lp.frequency.rampTo(lerp(2400, 700, d), 1); shimmerLevel.gain.rampTo(lerp(0.4, 0.15, d), 1); };
  applyDark(dark);

  return {
    setKnob(name, v) { if (name === "dark") applyDark(v); },
    trigger(step, t, p, info) {
      const { knobs: kn } = info;
      if (!droneOn) { droneOn = true; drone.triggerAttack(mtof(ROOT), t, 0.7); }
      const active = 1 + Math.round(2 * kn.density);
      voices.forEach((v, i) => {
        if (i >= active || t < v.freeAt || info.rnd() > 0.06) return;
        const len = 8 + info.rnd() * 12;
        v.s.envelope.attack = len * 0.35;
        v.s.envelope.release = len * 0.45;
        const oct = 12 + (i === 2 ? 12 : 0);
        v.s.triggerAttackRelease(mtof(ROOT + oct + pickOf(info.rnd, scale())), len * 0.55, t, 0.5 + 0.3 * info.rnd());
        v.freeAt = t + len;
      });
      if (step === 8 && info.rnd() < 0.04) bell.triggerAttackRelease(mtof(ROOT + 36 + pickOf(info.rnd, scale())), 0.5, t, 0.5);
    },
    dispose: k.dispose,
  };
}

// ---------------------------------------------------------------- drum & bass
// F minor, liquid. Two-step break with ghost snares, Reese bass (two detuned
// saws → moving lowpass) over a sine sub, soft chord pad.
export function dnb(Tone, out, knobs) {
  const k = kit(Tone);
  const ROOT = 29; // F1
  const duckBus = k.n("Gain", 1); duckBus.connect(out);
  const kk = kick(k, out, { note: mtof(ROOT + 12), decay: 0.24, pitchDecay: 0.03, octaves: 4.5, volume: -2 });
  const snVerb = k.n("Reverb", { decay: 1.1, wet: 0.2 }); snVerb.connect(out);
  const sn = snare(k, snVerb, { decay: 0.15, bp: 2000, Q: 0.7, volume: -6, bodyNote: 220, bodyVolume: -9 });
  const ch = hat(k, out, { decay: 0.022, hp: 9500, volume: -18, pan: 0.2 });
  const shaker = hat(k, out, { decay: 0.04, hp: 7000, volume: -26, pan: -0.25 });

  const reeseLp = k.n("Filter", { type: "lowpass", frequency: 400, rolloff: -24, Q: 1.5 });
  const reeseLfo = k.n("LFO", { frequency: 0.11, min: 180, max: 650 }).start();
  reeseLfo.connect(reeseLp.frequency);
  const reeseDrive = k.n("Distortion", { distortion: 0.25, wet: 0.4 });
  const reese = k.n("Synth", { oscillator: { type: "fatsawtooth", count: 2, spread: 28 }, envelope: { attack: 0.02, decay: 0.3, sustain: 0.85, release: 0.2 }, volume: -14 });
  reese.chain(reeseLp, reeseDrive, duckBus);
  const sub = k.n("Synth", { oscillator: { type: "sine" }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.9, release: 0.15 }, volume: -10 });
  sub.connect(duckBus);

  const padLp = k.n("Filter", { type: "lowpass", frequency: 1800 });
  const padVerb = k.n("Reverb", { decay: 4, wet: 0.5 });
  const pad = k.n("PolySynth", { maxPolyphony: 10, voice: Tone.Synth, options: {
    oscillator: { type: "fattriangle", count: 3, spread: 20 },
    envelope: { attack: 1.2, decay: 1, sustain: 0.7, release: 3 },
  }, volume: -22 });
  pad.chain(padLp, padVerb, duckBus);
  // Fm9, Dbmaj7, Bbm9, Cm7sus — four bars each
  const PADS = [[41, [0, 3, 7, 10, 14]], [37, [0, 4, 7, 11]], [46, [0, 3, 7, 10, 14]], [36, [0, 5, 7, 10]]];

  const applyDark = (d) => { reeseLfo.min = lerp(220, 120, d); reeseLfo.max = lerp(900, 380, d); padLp.frequency.rampTo(lerp(2400, 900, d), 0.4); reeseDrive.distortion = lerp(0.2, 0.5, d); };
  applyDark(knobs.dark);

  return {
    setKnob(name, v) { if (name === "dark") applyDark(v); },
    trigger(step, t, p, info) {
      const { bar, dur } = info;
      if (step === 0 && bar % 4 === 0) {
        const c = PADS[(bar >> 2) % 4];
        pad.triggerAttackRelease(chordHz(c[0], c[1], 12), dur * 62, t, 0.55);
      }
      if (p.kick[step]) { kk.hit(t, vel(p.kick[step])); duck(duckBus, t, 0.4, 0.06); }
      if (p.perc[step]) sn.hit(t, p.perc[step] === 2 ? 1 : 0.22);
      if (step % 2 === 0) ch.hit(t, step % 4 === 2 ? 0.75 : 0.4, 0.015);
      else if (p.hat[step]) ch.hit(t, 0.2 + 0.2 * info.rnd(), 0.01);
      if (info.knobs.density > 0.6) shaker.hit(t, 0.25 + 0.2 * (step % 2), 0.02);
      if (p.bass[step]) {
        let next = step + 1;
        while (next < 16 && !p.bass[next]) next++;
        const len = Math.min(next - step, 8) * dur * 0.95;
        const f = mtof(ROOT + 12 + p.bass[step] - 1);
        reese.triggerAttackRelease(f, len, t, 0.9);
        sub.triggerAttackRelease(f / 2, len, t, 0.9);
      }
    },
    dispose: k.dispose,
  };
}

// ---------------------------------------------------------------- classical
// Satie-like: a low bass note then a sustained chord, alternating two chords
// each bar (Gmaj7 / Dmaj7, or Em9 / Bm7 when dark), rising arpeggios and a
// sparse melody; FM piano in a room; rubato of ±3 % of a beat on every note.
export function classical(Tone, out, knobs) {
  const k = kit(Tone);
  const lp = k.n("Filter", { type: "lowpass", frequency: 3200, rolloff: -12 });
  const room = k.n("Reverb", { decay: 2.8, preDelay: 0.02, wet: 0.35 });
  const piano = k.n("PolySynth", { maxPolyphony: 16, voice: Tone.FMSynth, options: {
    harmonicity: 2, modulationIndex: 1.4,
    oscillator: { type: "sine" }, modulation: { type: "triangle" },
    envelope: { attack: 0.004, decay: 2.6, sustain: 0.06, release: 1.8 },
    modulationEnvelope: { attack: 0.002, decay: 0.7, sustain: 0, release: 0.4 },
  }, volume: -11 });
  piano.chain(lp, room, out);

  const PAIRS = { light: [[43, [12, 16, 19, 23]], [38, [16, 19, 21, 25]]], dark: [[40, [12, 15, 19, 26]], [35, [15, 19, 22, 24]]] };
  const SCALE = [0, 2, 4, 7, 9, 11];
  let dark = knobs.dark, mel = 3;
  const applyDark = (d) => { dark = d; lp.frequency.rampTo(lerp(3800, 1800, d), 1); room.wet.rampTo(lerp(0.3, 0.45, d), 1); };
  applyDark(dark);

  const play = (m, len, t, v, info) => piano.triggerAttackRelease(mtof(m), len, t + (info.rnd() * 2 - 1) * 0.03 * info.dur * 4, v * (0.85 + 0.3 * info.rnd()));

  return {
    setKnob(name, v) { if (name === "dark") applyDark(v); },
    // show the piano's plan on the strip: bass on 1, chord on 2, melody/arpeggio after
    decorate(p, info) {
      const bass = new Array(16).fill(0), perc = new Array(16).fill(0), hat = new Array(16).fill(0);
      bass[0] = 1; perc[4] = 2;
      const r = info.rng(71 + (info.bar % 8));
      if (r() < 0.45) [8, 10, 12, 14].forEach((s) => (hat[s] = 1));
      else if (r() < 0.7) { hat[8] = 2; if (r() < 0.5) hat[12] = 1; }
      return { ...p, bass, perc, hat };
    },
    trigger(step, t, p, info) {
      const { bar, dur } = info;
      const pair = dark > 0.55 ? PAIRS.dark : PAIRS.light;
      const [root, ivs] = pair[bar % 2];
      if (p.bass[step]) play(root, dur * 14, t, 0.6, info);
      if (p.perc[step]) ivs.forEach((s, i) => play(root + s, dur * 11, t + i * 0.01, 0.38, info));
      if (p.hat[step] === 1) {
        const i = [8, 10, 12, 14].indexOf(step);
        if (i >= 0 && p.hat[8] === 1) play(root + 24 + ivs[i % ivs.length] - 12, dur * 6, t, 0.42, info);
        else play(root + 24 + pickOf(info.rnd, [0, 4, 7]), dur * 4, t, 0.35, info);
      } else if (p.hat[step] === 2) {
        mel = Math.max(0, Math.min(SCALE.length * 2 - 1, mel + pickOf(info.rnd, [-2, -1, 1, 1, 2])));
        play(55 + 12 * Math.floor(mel / SCALE.length) + SCALE[mel % SCALE.length] + (dark > 0.55 ? -3 : 0), dur * 8, t, 0.5, info);
      }
    },
    dispose: k.dispose,
  };
}
