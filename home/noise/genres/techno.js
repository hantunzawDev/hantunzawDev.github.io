// Four-on-the-floor builders: techno, dark techno, minimal, dub techno.
// Each is build(Tone, out, knobs) → { trigger(step, time, pattern, info), setKnob?, decorate?, dispose }.
// `pattern` comes from patterns.js genPattern (16 steps; bass = semitone+1).
// `info` = { bar, step, dur (s per 16th), knobs, rng(salt) (seeded per 16-bar block), rnd (Math.random) }.
import { kit, duck, kick, hat, snare, crusher, mtof, vel, lerp, xerp, pickOf } from "./kit.js";

// ---------------------------------------------------------------- techno
// F minor. Punchy kick, rolling off-kick bass, off-beat open hat over 16th closed
// hats, claps, and a 303-style acid line whose cutoff breathes over 32 bars.
export function techno(Tone, out, knobs) {
  const k = kit(Tone);
  const ROOT = 29; // F1
  const duckBus = k.n("Gain", 1); duckBus.connect(out);
  const verb = k.n("Reverb", { decay: 2.4, preDelay: 0.01, wet: 1 }); verb.connect(out);
  const send = k.n("Gain", 0.25); send.connect(verb);

  // Kick drive stays fixed; dark closes a lowpass after it instead of adding fizz.
  const kickDrive = k.n("Distortion", { distortion: 0.2, oversample: "2x", wet: 0.35 });
  const kickLp = k.n("Filter", { type: "lowpass", frequency: 12000, rolloff: -12 });
  kickDrive.chain(kickLp, out);
  const kk = kick(k, kickDrive, { note: mtof(ROOT), decay: 0.45, pitchDecay: 0.05, octaves: 5.5, volume: -1 });

  const bass = k.n("MonoSynth", {
    oscillator: { type: "sawtooth" },
    filter: { type: "lowpass", rolloff: -24, Q: 2 },
    envelope: { attack: 0.002, decay: 0.1, sustain: 0.2, release: 0.04 },
    filterEnvelope: { attack: 0.002, decay: 0.08, sustain: 0, release: 0.05, baseFrequency: 90, octaves: 2.4 },
    volume: -12,
  });
  bass.connect(duckBus);

  const acidDrive = k.n("Distortion", { distortion: 0.35, oversample: "2x", wet: 0.5 });
  const acidTone = k.n("Filter", { type: "lowpass", frequency: 9000, rolloff: -12 });
  const acidDelay = k.n("FeedbackDelay", { delayTime: "8n.", feedback: 0.32, wet: 0.2 });
  const acidGain = k.n("Gain", 0);
  const acid = k.n("MonoSynth", {
    oscillator: { type: "sawtooth" },
    filter: { type: "lowpass", rolloff: -24, Q: 11 },
    envelope: { attack: 0.002, decay: 0.22, sustain: 0.35, release: 0.05 },
    filterEnvelope: { attack: 0.002, decay: 0.17, sustain: 0.06, release: 0.08, baseFrequency: 260, octaves: 3.4, exponent: 2 },
    volume: -15,
  });
  acid.chain(acidDrive, acidTone, acidDelay, acidGain, duckBus);
  acidGain.connect(send);

  // hats / ride → hatBus (kick-ducked) → dark lowpass → level
  const hatBus = k.n("Gain", 1);
  const hatTone = k.n("Filter", { type: "lowpass", frequency: 16000, rolloff: -24 });
  const hatLevel = k.n("Gain", 1);
  hatBus.chain(hatTone, hatLevel, out);
  const ch = hat(k, hatBus, { decay: 0.028, hp: 8800, volume: -18, pan: 0.15 });
  const oh = hat(k, hatBus, { decay: 0.17, release: 0.05, hp: 7200, volume: -16, pan: -0.1 });
  const ride = k.n("MetalSynth", {
    envelope: { attack: 0.001, decay: 0.35, release: 0.05 },
    harmonicity: 5.1, modulationIndex: 30, resonance: 5200, octaves: 1.4, volume: -34,
  });
  ride.connect(hatBus);
  // clap + rim → dark lowpass → dry + reverb send
  const clapBus = k.n("Gain", 1);
  const clapTone = k.n("Filter", { type: "lowpass", frequency: 16000, rolloff: -12 });
  clapBus.connect(clapTone); clapTone.connect(out); clapTone.connect(send);
  const clap = snare(k, clapBus, { decay: 0.13, bp: 1500, Q: 1.1, volume: -12, body: false });
  const rim = k.n("MembraneSynth", { pitchDecay: 0.008, octaves: 2, envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 }, volume: -22 });
  const rimPan = k.n("Panner", 0.35); rim.chain(rimPan, clapBus);

  let acidSeq = null, acidBlock = -1, acidOn = false, sweep = 0.5, dark = knobs.dark;
  // slow filter tweak: cutoff + env amount ride a 32-bar sine; dark shifts the whole range down
  const applyAcid = () => {
    acid.filterEnvelope.baseFrequency = xerp(lerp(320, 90, dark), lerp(1100, 300, dark), sweep);
    acid.filterEnvelope.octaves = lerp(2.4, 1.8, dark) + lerp(1.8, 1.2, dark) * sweep;
  };
  const applyDark = (d) => {
    dark = d;
    kickLp.frequency.rampTo(xerp(12000, 2500, d), 0.2);
    hatTone.frequency.rampTo(xerp(16000, 4200, d), 0.2);
    clapTone.frequency.rampTo(xerp(16000, 3000, d), 0.2);
    hatLevel.gain.rampTo(lerp(1, 0.55, d), 0.2);
    ch.hp.frequency.rampTo(xerp(8800, 4500, d), 0.2);
    oh.hp.frequency.rampTo(xerp(7200, 3800, d), 0.2);
    oh.synth.envelope.decay = lerp(0.17, 0.32, d);
    acidTone.frequency.rampTo(xerp(9000, 1800, d), 0.2);
    bass.filterEnvelope.baseFrequency = lerp(120, 60, d);
    send.gain.rampTo(lerp(0.18, 0.4, d), 0.3);
    acid.oscillator.type = d > 0.7 ? "square" : "sawtooth";
    applyAcid();
  };
  applyDark(dark);

  // A 303 phrase per 16-bar block: notes, accents, slides, octave jumps.
  function makeAcid(rng, density) {
    const scale = [0, 0, 0, 12, 3, 7, 10, -2, 5];
    const gate = 0.5 + 0.35 * density;
    return Array.from({ length: 16 }, (_, i) => ({
      on: i === 0 || rng() < gate,
      note: pickOf(rng, scale),
      accent: rng() < 0.28,
      slide: rng() < 0.22,
      up: rng() < 0.15,
    }));
  }

  return {
    setKnob(name, v) { if (name === "dark") applyDark(v); },
    // The groove: 16th closed hats every step (the pattern's hats become accents,
    // its off-beat 2s open hats), a rolling bass on the three off-kick 16ths of
    // each beat (pattern picks the pitch, low density thins the first), and the
    // kick dropping out on the last beat of every 16 bars.
    decorate(p, info) {
      const fill = info.bar % 16 === 15;
      const thin = info.knobs.density < 0.3;
      return {
        ...p,
        kick: p.kick.map((v, i) => (fill && i >= 12 ? 0 : v)),
        hat: p.hat.map((v) => (v === 2 ? 2 : 1)),
        hatAcc: p.hat.map((v) => v === 1),
        bass: p.bass.map((v, i) => (i % 4 === 0 || (thin && i % 4 === 1) ? 0 : v || 1)),
      };
    },
    trigger(step, t, p, info) {
      const { bar, dur } = info;
      const block = bar >> 4, inBlock = bar % 16;
      if (step === 0) {
        if (block !== acidBlock) {
          acidBlock = block;
          const r = info.rng(11);
          acidSeq = makeAcid(r, info.knobs.density);
          acidOn = bar >= 8 && r() < 0.8;
        }
        acidGain.gain.rampTo(acidOn && inBlock !== 15 ? 1 : 0, dur * 4, t);
        sweep = 0.5 - 0.5 * Math.cos((2 * Math.PI * (bar % 32)) / 32);
        applyAcid();
      }
      const fill = inBlock === 15 && step >= 12; // breath before each new block
      if (p.kick[step]) { kk.hit(t, vel(p.kick[step])); duck(duckBus, t, 0.2, 0.06); duck(hatBus, t, 0.7, 0.05); }
      if (p.bass[step]) bass.triggerAttackRelease(mtof(ROOT + 12 + p.bass[step] - 1), dur * 0.7, t, step % 4 === 2 ? 0.95 : 0.78);
      // closed hat on every 16th; the open hat / fill roll layers on top
      if (p.hat[step]) ch.hit(t, (p.hatAcc?.[step] || p.hat[step] === 2 ? 0.72 : step % 2 ? 0.32 : 0.5) + 0.12 * info.rnd(), 0.02);
      if (fill && step % 2) oh.hit(t, 0.4 + 0.15 * (step - 12), 0.03);
      else if (p.hat[step] === 2) oh.hit(t, 0.85, 0.06);
      if (info.knobs.density > 0.55 && step % 4 === 2) ride.triggerAttackRelease(420, 0.1, t, 0.5);
      if ((step === 4 || step === 12) && (info.knobs.density > 0.3 || bar % 2)) clap.hit(t, 0.9);
      if (p.perc[step] && !p.kick[step]) rim.triggerAttackRelease(mtof(ROOT + 55 + (step % 3) * 7), 0.04, t, 0.6);
      const a = acidSeq && acidSeq[step];
      if (a && a.on && acidOn) {
        acid.portamento = a.slide ? dur * 0.6 : 0;
        acid.triggerAttackRelease(mtof(ROOT + 24 + a.note + (a.up ? 12 : 0)), a.slide ? dur * 1.1 : dur * 0.55, t, a.accent ? 1 : 0.6);
      }
    },
    dispose: k.dispose,
  };
}

// ---------------------------------------------------------------- dark techno
// E phrygian. Distorted kick feeding a reverb "rumble" (LP + drive + kick-ducked),
// sub rumble bass, bit-crushed industrial hits, metallic perc, a detuned minor
// drone and the odd dissonant stab echoing out.
export function darkTechno(Tone, out, knobs) {
  const k = kit(Tone);
  const ROOT = 28; // E1
  const duckBus = k.n("Gain", 1); duckBus.connect(out);
  const verb = k.n("Reverb", { decay: 4.5, preDelay: 0.02, wet: 1 }); verb.connect(duckBus);
  const send = k.n("Gain", 0.3); send.connect(verb);

  const kickDrive = k.n("Distortion", { distortion: 0.5, oversample: "4x", wet: 0.6 });
  const kickLp = k.n("Filter", { type: "lowpass", frequency: 6000, rolloff: -12 });
  kickDrive.chain(kickLp, out);
  const kk = kick(k, kickDrive, { note: mtof(ROOT), decay: 0.6, pitchDecay: 0.06, octaves: 6, volume: -3, clickVolume: -20 });

  // rumble: kick → long reverb → lowpass → drive → lowpass → ducked between kicks
  const rumbleSend = k.n("Gain", 0.9);
  const rumbleVerb = k.n("Reverb", { decay: 3.2, preDelay: 0.008, wet: 1 });
  const rumbleLp1 = k.n("Filter", { type: "lowpass", frequency: 150, rolloff: -24 });
  const rumbleDrive = k.n("Distortion", { distortion: 0.7, oversample: "2x" });
  const rumbleLp2 = k.n("Filter", { type: "lowpass", frequency: 120, rolloff: -24 });
  const rumbleDuck = k.n("Gain", 1);
  const rumbleLevel = k.n("Gain", 0.55);
  kk.body.connect(rumbleSend);
  rumbleSend.chain(rumbleVerb, rumbleLp1, rumbleDrive, rumbleLp2, rumbleDuck, rumbleLevel, out);

  const bass = k.n("MonoSynth", {
    oscillator: { type: "triangle" },
    filter: { type: "lowpass", rolloff: -24, Q: 1 },
    envelope: { attack: 0.004, decay: 0.2, sustain: 0.3, release: 0.08 },
    filterEnvelope: { attack: 0.003, decay: 0.12, sustain: 0.1, release: 0.1, baseFrequency: 80, octaves: 1.6 },
    volume: -9,
  });
  bass.connect(duckBus);

  const crush = crusher(k, 5);
  const indHp = k.n("Filter", { type: "highpass", frequency: 300 });
  const indPan = k.n("Panner", 0);
  const ind = k.n("NoiseSynth", { noise: { type: "brown" }, envelope: { attack: 0.001, decay: 0.11, sustain: 0, release: 0.04 }, volume: -10 });
  const indLp = k.n("Filter", { type: "lowpass", frequency: 10000, rolloff: -12 });
  ind.chain(crush, indHp, indLp, indPan, out);
  indPan.connect(send);

  const metalPan = k.n("Panner", 0.2);
  const metalLp = k.n("Filter", { type: "lowpass", frequency: 14000, rolloff: -24 });
  const metal = k.n("MetalSynth", {
    envelope: { attack: 0.001, decay: 0.06, release: 0.02 },
    harmonicity: 5.1, modulationIndex: 40, resonance: 6200, octaves: 1.2, volume: -30,
  });
  metal.chain(metalLp, metalPan, out);

  const droneLp = k.n("Filter", { type: "lowpass", frequency: 500, rolloff: -24, Q: 2 });
  const droneLfo = k.n("LFO", { frequency: 0.035, min: 220, max: 700 });
  droneLfo.connect(droneLp.frequency).start();
  const drone = k.n("PolySynth", { maxPolyphony: 8, voice: Tone.Synth, options: {
    oscillator: { type: "fatsawtooth", count: 3, spread: 38 },
    envelope: { attack: 4, decay: 1, sustain: 0.85, release: 6 },
  }, volume: -24 });
  drone.chain(droneLp, duckBus);
  droneLp.connect(send);

  const stabDelay = k.n("FeedbackDelay", { delayTime: "8n.", feedback: 0.5, wet: 0.5 });
  const stabLp = k.n("Filter", { type: "lowpass", frequency: 6000, rolloff: -12 });
  const stab = k.n("FMSynth", {
    harmonicity: 1.41, modulationIndex: 9,
    envelope: { attack: 0.002, decay: 0.25, sustain: 0, release: 0.2 },
    modulationEnvelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 },
    volume: -25,
  });
  stab.chain(stabLp, stabDelay, duckBus);
  stabDelay.connect(send);

  let dark = knobs.dark, stabStep = -1;
  const applyDark = (d) => {
    dark = d;
    rumbleLp2.frequency.rampTo(lerp(150, 85, d), 0.4);
    rumbleDrive.distortion = lerp(0.5, 0.9, d); // sits behind a ≤150 Hz lowpass: weight, not fizz
    kickLp.frequency.rampTo(xerp(9000, 1800, d), 0.2);
    metalLp.frequency.rampTo(xerp(14000, 3500, d), 0.2);
    indLp.frequency.rampTo(xerp(10000, 2200, d), 0.2);
    stabLp.frequency.rampTo(xerp(6000, 1500, d), 0.2);
    bass.filterEnvelope.baseFrequency = lerp(100, 55, d);
    send.gain.rampTo(lerp(0.2, 0.5, d), 0.4);
    droneLfo.min = lerp(260, 120, d); droneLfo.max = lerp(900, 380, d);
    crush.setBits(Math.round(lerp(7, 4, d)));
  };
  applyDark(dark);

  // i, bVI, iv, ii° (diminished only once it is dark enough)
  const chords = (d) => [[0, 3, 7, 12], [-4, 0, 3, 8], [5, 8, 12, 17], ...(d > 0.55 ? [[2, 5, 8, 14]] : [])];

  return {
    setKnob(name, v) { if (name === "dark") applyDark(v); },
    // Rolling sub under the rumble: the three off-kick 16ths of every beat
    // (pattern picks the pitch, low density thins the first); one bar of only
    // rumble + hats every 32 bars.
    decorate(p, info) {
      const drop = info.bar % 32 === 31;
      const thin = info.knobs.density < 0.3;
      return {
        ...p,
        kick: drop ? p.kick.map(() => 0) : p.kick,
        bass: p.bass.map((v, i) => (i % 4 === 0 || (thin && i % 4 === 1) ? 0 : v || 1)),
      };
    },
    trigger(step, t, p, info) {
      const { bar, dur } = info;
      if (step === 0 && bar % 8 === 0) {
        const r = info.rng(23 + bar);
        const c = pickOf(r, chords(dark));
        drone.triggerAttackRelease(c.map((s) => mtof(ROOT + 24 + s)), dur * 16 * 8 - 0.5, t, 0.8);
        stabStep = r() < 0.6 ? pickOf(r, [6, 10, 14]) : -1;
      }
      if (p.kick[step]) {
        kk.hit(t, vel(p.kick[step]));
        duck(duckBus, t, 0.3, 0.07);
        duck(rumbleDuck, t, 0.02, 0.09);
      }
      if (p.bass[step]) bass.triggerAttackRelease(mtof(ROOT + 12 + p.bass[step] - 1), dur * 0.8, t, step % 4 === 2 ? 0.9 : 0.75);
      if (p.hat[step]) metal.triggerAttackRelease(p.hat[step] === 2 ? 300 : 520, p.hat[step] === 2 ? 0.08 : 0.03, t, p.hat[step] === 2 ? 0.9 : 0.4 + 0.3 * info.rnd());
      if (p.perc[step]) { indPan.pan.setValueAtTime(info.rnd() * 1.2 - 0.6, t); ind.triggerAttackRelease(0.06, t, 0.6 + 0.4 * info.rnd()); }
      if (step === stabStep && bar % 4 === 3) stab.triggerAttackRelease(mtof(ROOT + 36 + (dark > 0.5 ? 1 : 0)), dur, t, 0.7);
    },
    dispose: k.dispose,
  };
}

// ---------------------------------------------------------------- minimal
// A minor, dry and clicky: short kick, noise clicks with micro-timing, rim,
// sparse sub, and a bleep now and then into a dotted-8th delay.
export function minimal(Tone, out, knobs) {
  const k = kit(Tone);
  const ROOT = 33; // A1
  const duckBus = k.n("Gain", 1); duckBus.connect(out);
  const kk = kick(k, out, { note: mtof(ROOT + 2), decay: 0.2, pitchDecay: 0.022, octaves: 4, clickDecay: 0.003, volume: -2 });
  const click = hat(k, out, { decay: 0.004, release: 0.002, hp: 4200, volume: -10 });
  const shaker = hat(k, out, { decay: 0.045, hp: 6500, volume: -26, pan: -0.25 });
  const rimBp = k.n("Filter", { type: "bandpass", frequency: 1700, Q: 2 });
  const rimPan = k.n("Panner", 0.3);
  const rim = k.n("MembraneSynth", { pitchDecay: 0.008, octaves: 2, envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 }, volume: -8 });
  rim.chain(rimBp, rimPan, out);
  const subLp = k.n("Filter", { type: "lowpass", frequency: 140 });
  const sub = k.n("Synth", { oscillator: { type: "sine" }, envelope: { attack: 0.005, decay: 0.3, sustain: 0.5, release: 0.12 }, volume: -6 });
  sub.chain(subLp, duckBus);
  const bleepDelay = k.n("FeedbackDelay", { delayTime: "8n.", feedback: 0.42, wet: 0.45 });
  const bleepLp = k.n("Filter", { type: "lowpass", frequency: 3000 });
  const bleepPan = k.n("AutoPanner", { frequency: 0.07, depth: 0.7 }).start();
  const bleep = k.n("FMSynth", {
    harmonicity: 2, modulationIndex: 4,
    envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 },
    modulationEnvelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.05 },
    volume: -22,
  });
  bleep.chain(bleepLp, bleepDelay, bleepPan, duckBus);

  let bleepSteps = [];
  const applyDark = (d) => { bleepLp.frequency.rampTo(lerp(4500, 900, d), 0.3); bleepDelay.feedback.rampTo(lerp(0.35, 0.6, d), 0.3); };
  applyDark(knobs.dark);

  return {
    setKnob(name, v) { if (name === "dark") applyDark(v); },
    trigger(step, t, p, info) {
      const { bar, dur, knobs: kn } = info;
      if (step === 0) {
        const r = info.rng(37 + (bar % 4));
        bleepSteps = [3, 7, 11, 14].filter(() => r() < 0.18 + 0.3 * kn.density);
      }
      if (p.kick[step]) { kk.hit(t, vel(p.kick[step]) * 0.95); duck(duckBus, t, 0.35, 0.05); }
      // clicks sit slightly late on odd 16ths: that tiny drag is the groove
      if (p.hat[step]) {
        click.pan.pan.setValueAtTime(info.rnd() * 0.8 - 0.4, t);
        click.hit(t + (step % 2 ? dur * 0.09 : 0), p.hat[step] === 2 ? 0.9 : 0.35 + 0.35 * info.rnd(), 0.005);
      }
      if (kn.density > 0.5) shaker.hit(t + (step % 2 ? dur * 0.06 : 0), 0.3 + 0.3 * (step % 4 === 2), 0.02);
      if (p.perc[step]) rim.triggerAttackRelease(step % 2 ? 820 : 640, 0.03, t, 0.7);
      if (p.bass[step]) sub.triggerAttackRelease(mtof(ROOT + p.bass[step] - 1 + 12), dur * 1.5, t, 0.9);
      if (bleepSteps.includes(step)) bleep.triggerAttackRelease(mtof(ROOT + 48 + pickOf(info.rng(41 + step), [0, 3, 7, 10, 12])), 0.05, t, 0.6);
    },
    dispose: k.dispose,
  };
}

// ---------------------------------------------------------------- dub techno
// C minor. A minor-7th chord stab through a dotted-8th 0.55 feedback delay into
// a long reverb, filter breathing slowly; vinyl hiss + crackle bed; soft kick.
export function dubTechno(Tone, out, knobs) {
  const k = kit(Tone);
  const ROOT = 36; // C2
  const duckBus = k.n("Gain", 1); duckBus.connect(out);
  const verb = k.n("Reverb", { decay: 8, preDelay: 0.03, wet: 0.38 });
  const delay = k.n("FeedbackDelay", { delayTime: "8n.", feedback: 0.55, wet: 0.45 });
  const stabLp = k.n("Filter", { type: "lowpass", frequency: 900, Q: 2.5, rolloff: -24 });
  const stabLfo = k.n("LFO", { frequency: 0.025, min: 450, max: 1700 }).start();
  stabLfo.connect(stabLp.frequency);
  const stab = k.n("PolySynth", { maxPolyphony: 16, voice: Tone.Synth, options: {
    oscillator: { type: "fatsawtooth", count: 2, spread: 14 },
    envelope: { attack: 0.004, decay: 0.22, sustain: 0, release: 0.18 },
  }, volume: -20 });
  stab.chain(stabLp, delay, verb, duckBus);

  const kickLp = k.n("Filter", { type: "lowpass", frequency: 1200 });
  kickLp.connect(out);
  const kk = kick(k, kickLp, { note: mtof(31), decay: 0.5, pitchDecay: 0.035, octaves: 4, click: false, volume: -3 });

  const hiss = k.n("Noise", { type: "pink", volume: -40 });
  const hissHp = k.n("Filter", { type: "highpass", frequency: 3500 });
  hiss.chain(hissHp, out);
  hiss.start();
  const crackle = hat(k, out, { decay: 0.002, release: 0.001, hp: 2200, volume: -30 });
  const shaker = hat(k, duckBus, { decay: 0.05, hp: 6000, volume: -24, pan: 0.2 });
  const rimDelay = k.n("FeedbackDelay", { delayTime: "4n", feedback: 0.35, wet: 0.4 });
  const rim = k.n("MembraneSynth", { pitchDecay: 0.006, octaves: 1.5, envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 }, volume: -22 });
  rim.chain(rimDelay, verb);
  const subLp = k.n("Filter", { type: "lowpass", frequency: 130 });
  const sub = k.n("Synth", { oscillator: { type: "sine" }, envelope: { attack: 0.01, decay: 0.4, sustain: 0.5, release: 0.3 }, volume: -8 });
  sub.chain(subLp, duckBus);

  let stabSteps = [], chord = [0, 3, 7, 10];
  const applyDark = (d) => {
    stabLfo.min = lerp(600, 260, d); stabLfo.max = lerp(2200, 800, d);
    verb.wet.rampTo(lerp(0.3, 0.55, d), 0.5);
  };
  applyDark(knobs.dark);

  return {
    setKnob(name, v) { if (name === "dark") applyDark(v); },
    trigger(step, t, p, info) {
      const { bar, dur } = info;
      if (step === 0) {
        if (bar % 4 === 0) {
          const r = info.rng(53 + (bar % 16));
          stabSteps = r() < 0.5 ? [2] : r() < 0.6 ? [3, 10] : [6, 13];
          // i7 most of the time, iv7 (or bVII7) for a few bars
          chord = r() < 0.7 ? [0, 3, 7, 10] : r() < 0.5 ? [5, 8, 12, 15] : [-2, 2, 5, 8];
        }
      }
      if (p.kick[step]) { kk.hit(t, 0.85 * vel(p.kick[step])); duck(duckBus, t, 0.45, 0.08); }
      if (stabSteps.includes(step)) stab.triggerAttackRelease(chord.map((s) => mtof(ROOT + 12 + s)), dur * 0.8, t, 0.8 + 0.2 * info.rnd());
      if (p.hat[step]) shaker.hit(t, p.hat[step] === 2 ? 0.7 : 0.3, 0.03);
      if (p.perc[step] && info.rnd() < 0.5) rim.triggerAttackRelease(900, 0.03, t, 0.5);
      if (p.bass[step]) sub.triggerAttackRelease(mtof(ROOT + chord[0] + p.bass[step] - 1), dur * 2, t, 0.8);
      if (info.rnd() < 0.3) crackle.hit(t + info.rnd() * dur, 0.2 + 0.8 * info.rnd() ** 3, 0.002);
    },
    dispose: k.dispose,
  };
}
