import test from "node:test";
import assert from "node:assert/strict";
import { loopPlan, gains } from "../looper.js";

const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

test("loopPlan: long buffers get the wanted fade", () => {
  assert.deepEqual(loopPlan(60, 1.5), { fade: 1.5, period: 58.5 });
  assert.deepEqual(loopPlan(60), { fade: 1.5, period: 58.5 });
});

test("loopPlan: short buffers clamp the fade to a third of the duration", () => {
  const p = loopPlan(2, 1.5);
  assert.ok(near(p.fade, 2 / 3), `fade ${p.fade}`);
  assert.ok(near(p.period, 4 / 3), `period ${p.period}`);
  for (const d of [0.3, 0.5, 1, 1.2, 2, 2.9]) {
    const { fade, period } = loopPlan(d, 1.5);
    assert.ok(fade <= d / 3 + 1e-9, `d=${d} fade=${fade}`);
    assert.ok(near(fade + period, d, 1e-9), `d=${d}`);
  }
  assert.ok(loopPlan(1.2).fade <= 0.4 + 1e-9);
});

test("gains: equal power with exact endpoints", () => {
  assert.deepEqual(gains(0), [1, 0]);
  assert.deepEqual(gains(1), [0, 1]);
  for (let i = 0; i <= 10; i++) {
    const [o, n] = gains(i / 10);
    assert.ok(near(o * o + n * n, 1), `x=${i / 10}`);
    assert.ok(o >= 0 && n >= 0);
  }
  assert.ok(gains(0.3)[0] > gains(0.6)[0], "out falls");
  assert.ok(gains(0.3)[1] < gains(0.6)[1], "in rises");
});
