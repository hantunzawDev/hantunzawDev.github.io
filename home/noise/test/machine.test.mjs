import test from "node:test";
import assert from "node:assert/strict";
import { transition, STATES, EVENTS } from "../machine.js";

test("exports", () => {
  assert.deepEqual(STATES, ["idle", "loading", "playing", "paused", "fading", "error"]);
  assert.deepEqual(EVENTS, ["PLAY", "READY", "FAIL", "PAUSE", "STOP", "TIMER_END_SOON", "TIMER_DONE"]);
});

const rows = [
  ["idle", "PLAY", "loading"],
  ["loading", "READY", "playing"],
  ["loading", "FAIL", "error"],
  ["playing", "PAUSE", "paused"],
  ["paused", "PLAY", "playing"],
  ["playing", "TIMER_END_SOON", "fading"],
  ["fading", "TIMER_DONE", "idle"],
  ["fading", "PLAY", "playing"],
  ["error", "PLAY", "loading"],
];
for (const [from, ev, to] of rows) {
  test(`${from} + ${ev} -> ${to}`, () => assert.equal(transition(from, ev), to));
}

test("invalid events keep state", () => {
  assert.equal(transition("loading", "PLAY"), "loading");
  assert.equal(transition("idle", "PAUSE"), "idle");
  assert.equal(transition("idle", "BOGUS"), "idle");
});

test("STOP from any state -> idle", () => {
  for (const s of STATES) assert.equal(transition(s, "STOP"), "idle");
});
