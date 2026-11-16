// Tone builders (binaural beats, isochronic pulse), extracted from the old
// layers.js. Builder signature: (h, t0) => ({ mod(now) → 0..1 }) where `h` is
// the sampler.js toolbox: { ctx, dest, srcs, nodes, keep, gain, filter, osc }.
// Builders take everything from `h` (h.ctx replaces the old module-level ctx).
import { CARRIER_HZ, BRAINWAVE } from "./catalog.js";

const TAU = Math.PI * 2;

export function binauralBuilder(beat) {
  return (h, t0) => {
    const merger = h.keep(h.ctx.createChannelMerger(2));
    const out = h.gain(0.22, h.dest);
    merger.connect(out);
    const l = h.osc("sine", CARRIER_HZ), r = h.osc("sine", CARRIER_HZ + beat);
    l.connect(merger, 0, 0); r.connect(merger, 0, 1); // hard-panned: left ear / right ear
    return { mod: (now) => 0.7 + 0.3 * Math.sin(TAU * 0.6 * (now - t0)) }; // slow breathing, not the real beat
  };
}

export function isochronicBuilder() {
  return (h, t0) => {
    const gate = h.gain(0.5, h.dest), tone = h.gain(0.3, gate);
    h.osc("sine", CARRIER_HZ, tone);
    // square LFO swings gate gain 0..1 at 10 Hz; the lowpass rounds the edges so it doesn't click
    const lfo = h.osc("square", BRAINWAVE.alpha), soft = h.filter("lowpass", 160, 0.5), amt = h.gain(0.5);
    lfo.connect(soft); soft.connect(amt); amt.connect(gate.gain);
    return { mod: (now) => 0.7 + 0.3 * Math.sin(TAU * 0.6 * (now - t0)) };
  };
}
