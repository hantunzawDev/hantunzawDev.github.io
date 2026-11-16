import test from "node:test";
import assert from "node:assert/strict";
import { parseNoise, parseRadio, parseSleep } from "../cmd.js";

const known = {
  layers: ["light-rain", "brown-noise", "cafe"],
  presets: ["deep-work", "cafe"], stations: ["groove", "drone"],
};
const pn = (...a) => parseNoise(a, known);

test("noise", () => {
  assert.equal(pn().type, "toggle");
  assert.deepEqual(pn("light-rain", "60"), { type: "layer", id: "light-rain", vol: 0.6 });
  assert.deepEqual(pn("light-rain", "40"), { type: "layer", id: "light-rain", vol: 0.4 });
  assert.deepEqual(pn("light-rain"), { type: "layer", id: "light-rain", vol: 0.5 });
  assert.equal(pn("light-rain", "150").type, "error");
  assert.deepEqual(pn("vol", "70"), { type: "vol", vol: 0.7 });
  assert.equal(pn("vol", "x").type, "error");
  assert.deepEqual(pn("deep-work"), { type: "preset", id: "deep-work" });
  assert.deepEqual(pn("cafe"), { type: "preset", id: "cafe" });
  assert.deepEqual(pn("cafe", "40"), { type: "layer", id: "cafe", vol: 0.4 });
  assert.deepEqual(pn("off", "light-rain"), { type: "layerOff", id: "light-rain" });
  // a layer at 0 is the same as turning it off: no silent layer, nothing starts
  assert.deepEqual(pn("light-rain", "0"), pn("off", "light-rain"));
  assert.deepEqual(pn("cafe", "0"), { type: "layerOff", id: "cafe" });
  assert.equal(pn("light-rain", "-1").type, "error");
  assert.equal(pn("off", "nope").type, "error");
  assert.equal(pn("off").type, "error");
  assert.deepEqual(pn("save", "my", "mix"), { type: "save", name: "my mix" });
  assert.equal(pn("save").type, "error");
  assert.deepEqual(pn("list"), { type: "list" });
  assert.equal(pn("polka").type, "error");
});

test("genres and knobs are gone", () => {
  assert.deepEqual(pn("techno"), { type: "error", message: "unknown: techno" });
  assert.deepEqual(pn("dark-techno"), { type: "error", message: "unknown: dark-techno" });
  assert.deepEqual(pn("rain", "40"), { type: "error", message: "unknown: rain" });
  assert.deepEqual(pn("bpm", "120"), { type: "error", message: "unknown: bpm" });
  assert.equal(pn("dark", "0.8").type, "error");
  assert.equal(pn("density", "0.5").type, "error");
});

test("radio", () => {
  assert.deepEqual(parseRadio([], known), { type: "list" });
  assert.deepEqual(parseRadio(["off"], known), { type: "off" });
  assert.deepEqual(parseRadio(["groove"], known), { type: "play", id: "groove" });
  assert.equal(parseRadio(["nope"], known).type, "error");
});

test("sleep", () => {
  assert.deepEqual(parseSleep(["30m"]), { type: "set", minutes: 30 });
  assert.deepEqual(parseSleep(["1h"]), { type: "set", minutes: 60 });
  assert.deepEqual(parseSleep(["45"]), { type: "set", minutes: 45 });
  assert.deepEqual(parseSleep(["off"]), { type: "off" });
  assert.equal(parseSleep(["x"]).type, "error");
  assert.equal(parseSleep([]).type, "error");
  assert.equal(parseSleep(["0"]).type, "error");
  assert.equal(parseSleep(["11h"]).type, "error");
});
