import test from "node:test";
import assert from "node:assert/strict";
import { makeRng, fillNoise } from "../gen.js";

const COLORS = ["white", "pink", "brown", "blue", "grey"];
const N = 48000;
const make = (c) => fillNoise(c, new Float32Array(N), makeRng(42));

for (const c of COLORS) {
  test(`${c}: peak, DC`, () => {
    const o = make(c);
    let peak = 0, sum = 0;
    for (const v of o) { peak = Math.max(peak, Math.abs(v)); sum += v; }
    assert.ok(peak <= 0.9 + 1e-6, `peak ${peak}`);
    assert.ok(peak > 0.5, `peak ${peak}`);
    assert.ok(Math.abs(sum / N) < 0.05, `DC ${sum / N}`);
  });
  test(`${c}: no dip at loop ends`, () => {
    const o = make(c);
    // Brown/pink wander slowly, so raw RMS of a 256-sample window is dominated by
    // chance level; for them compare first-difference RMS (local energy) instead.
    const x = c === "brown" || c === "pink" ? o.map((v, i) => (i ? v - o[i - 1] : 0)) : o;
    const rms = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] ** 2; return Math.sqrt(s / (b - a)); };
    const all = rms(0, N);
    assert.ok(rms(1, 256) >= 0.8 * all, "head dip");
    assert.ok(rms(N - 256, N) >= 0.8 * all, "tail dip");
  });
  test(`${c}: wrap step is a normal step`, () => {
    const o = make(c);
    let d = 0;
    for (let i = 1; i < N; i++) d += Math.abs(o[i] - o[i - 1]);
    const wrap = Math.abs(o[0] - o[N - 1]);
    assert.ok(wrap < 4 * (d / N), `wrap ${wrap} vs mean step ${d / N}`);
    if (c === "brown" || c === "pink") assert.ok(wrap < 0.15);
  });
}

test("spectral tilt: brown < pink < white < blue", () => {
  const tilt = (c) => {
    const o = make(c);
    let d = 0, e = 0;
    for (let i = 1; i < N; i++) { d += (o[i] - o[i - 1]) ** 2; e += o[i] ** 2; }
    return d / e;
  };
  const [b, p, w, bl] = ["brown", "pink", "white", "blue"].map(tilt);
  assert.ok(b < p && p < w && w < bl, `${b} ${p} ${w} ${bl}`);
});

test("rng deterministic", () => {
  assert.equal(makeRng(1)(), makeRng(1)());
  assert.notEqual(makeRng(1)(), makeRng(2)());
  const r = makeRng(7);
  for (let i = 0; i < 1000; i++) { const v = r(); assert.ok(v >= 0 && v < 1); }
});
