// Pure loop math for the sample player (no Web Audio, node-testable).
//
// A recording loops by overlap-crossfade: the next copy starts `fade` seconds
// before the current one ends, and the two cross over on an equal-power curve,
// so the seam carries no dip in loudness. A short file never fades for more
// than a third of its length (otherwise most of it would be crossfade).

// { fade, period }: fade length and the gap between successive copy starts.
export function loopPlan(duration, fadeWanted = 1.5) {
  const d = Math.max(0, +duration || 0);
  const fade = Math.min(Math.max(0, fadeWanted), d / 3);
  return { fade, period: d - fade };
}

// Equal-power crossfade gains at position x in 0..1: [outgoing, incoming].
// out² + in² = 1 everywhere; the endpoints are exact.
export function gains(x) {
  if (!(x > 0)) return [1, 0];
  if (x >= 1) return [0, 1];
  const a = x * Math.PI / 2;
  return [Math.cos(a), Math.sin(a)];
}

// Sampled fade curves for AudioParam.setValueCurveAtTime, built once.
export function fadeCurves(n = 64) {
  const fadeIn = new Float32Array(n), fadeOut = new Float32Array(n);
  for (let i = 0; i < n; i++) { const [o, k] = gains(i / (n - 1)); fadeOut[i] = o; fadeIn[i] = k; }
  return { fadeIn, fadeOut };
}
