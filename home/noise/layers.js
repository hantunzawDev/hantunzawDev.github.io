// Layer runtime wiring: the `layers` object every caller uses (noise.app UI,
// commands, mini player), backed by the sample player in sampler.js.
//
//   kind "sample"   decoded once, looped by overlap-crossfade (sampler.js)
//   group myanmar   the three long recordings stream through an <audio>
//                   element instead (about 44 MB of mp3, too big to decode),
//                   resume where they were left, and report progress()
//   kind "tone"     binaural / isochronic oscillators from tones.js
//
// The selection model, fades, failure handling and level() live in sampler.js
// (pure enough to run under node with a fake AudioContext, see its header).
// This module only adds the browser bits: engine hook-up, fetch, <audio>.
import { engine } from "./engine.js";
import { LAYERS, BRAINWAVE, layerOf } from "./catalog.js";
import { binauralBuilder, isochronicBuilder } from "./tones.js";
import { createSampler } from "./sampler.js";
import { store } from "../data.js";

// ---------------------------------------------------------------- recordings
// A myanmar layer streams its file through a MediaElementSource. It plays the
// whole recording (nothing is trimmed), loops back to the start when it ends,
// and remembers where it was, so turning it off and on again carries on.

const recs = new Map(); // id → { el, an, buf } while live

const posKey = (id) => "noise.pos." + id;
function horn(h, input) {
  const ctx = h.ctx;
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
    const ctx = h.ctx;
    const el = new Audio();
    el.preload = "auto";
    el.src = new URL(L.src, import.meta.url).href;
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

const isStreamed = (L) => L?.group === "myanmar";

// ---------------------------------------------------------------- builders

const BUILD = {};
for (const L of LAYERS) if (isStreamed(L)) BUILD[L.id] = recorded(L);
for (const [id, beat] of Object.entries(BRAINWAVE)) BUILD[id] = binauralBuilder(beat);
BUILD.iso = isochronicBuilder();

// ---------------------------------------------------------------- runtime

const isActive = () => engine.ctx && ["playing", "paused", "fading"].includes(engine.state);

const core = createSampler({
  catalog: layerOf,
  builders: BUILD,
  fetch: (url) => fetch(url),
  base: import.meta.url,
  isActive,
});

export const layers = {
  ...core.api,
  // playback position of a streamed recording: { t, dur } in seconds, or null
  // (decoded samples loop forever and have no position)
  progress(id) {
    const r = recs.get(id);
    if (r) return { t: r.el.currentTime || 0, dur: Number.isFinite(r.el.duration) ? r.el.duration : 0 };
    return isStreamed(layerOf(id)) ? { t: +store.get(posKey(id), 0) || 0, dur: 0 } : null;
  },
};

engine.attachSource("layers", core.source);
