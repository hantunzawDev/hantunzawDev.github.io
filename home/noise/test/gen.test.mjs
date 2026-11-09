import test from "node:test";
import assert from "node:assert/strict";
import { makeRng, fillNoise } from "../gen.js";

const COLORS = ["white", "pink", "brown", "blue", "grey"];
const N = 48000;
const make = (c) => fillNoise(c, new Float32Array(N), makeRng(42));

for (const c of COLORS) {
  test(`${c}: peak, DC, seam`, () => {
    const o = make(c);
    let peak = 0, sum = 0;
    for (const v of o) { peak = Math.max(peak, Math.abs(v)); sum += v; }
    assert.ok(peak <= 0.9 + 1e-6, `peak ${peak}`);
    assert.ok(peak > 0.5, `peak ${peak}`);
    assert.ok(Math.abs(sum / N) < 0.05, `DC ${sum / N}`);
    assert.ok(Math.abs(o[0] - o[N - 1]) < 0.05, "seam");
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
