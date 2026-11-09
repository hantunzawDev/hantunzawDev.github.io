import test from "node:test";
import assert from "node:assert/strict";
import { PRESETS, DEFAULT_STATE, sanitizeState } from "../presets.js";
import { GENRES } from "../patterns.js";
import { LAYERS } from "../catalog.js";

const known = {
  genres: GENRES.map((g) => g.id), layers: LAYERS.map((l) => l.id),
  presets: PRESETS.map((p) => p.id), stations: ["groove", "drone"],
};

test("presets", () => {
  assert.deepEqual(PRESETS.map((p) => p.id), ["deep-work", "night-coding", "acid-hour", "cafe", "flow", "sleep", "space"]);
  const dw = PRESETS[0];
  assert.equal(dw.genre, "dub-techno");
  assert.equal(dw.knobs.dark, 0.4);
  assert.deepEqual(dw.layers, { brown: 0.35, alpha: 0.15 });
  const sl = PRESETS.find((p) => p.id === "sleep");
  assert.equal(sl.genre, null);
  assert.equal(sl.sleep, 30);
  for (const p of PRESETS) {
    if (p.genre) assert.ok(known.genres.includes(p.genre));
    for (const id of Object.keys(p.layers)) assert.ok(known.layers.includes(id), id);
  }
});

test("default state", () => {
  assert.deepEqual(DEFAULT_STATE, { vol: 0.7, genre: "techno", knobs: { bpm: 130, dark: 0.5, density: 0.5 }, layers: {}, station: null, tab: "mix" });
});

test("sanitize: garbage falls back", () => {
  const s = sanitizeState({ genre: "polka", layers: { rain: 2, nope: 0.5 }, vol: NaN }, known);
  assert.equal(s.genre, DEFAULT_STATE.genre);
  assert.deepEqual(s.layers, { rain: 1 });
  assert.equal(s.vol, DEFAULT_STATE.vol);
  assert.deepEqual(sanitizeState(null, known), DEFAULT_STATE);
  assert.deepEqual(sanitizeState("x", known), DEFAULT_STATE);
});

test("sanitize: knobs, station, tab", () => {
  const s = sanitizeState({ genre: "dnb", knobs: { bpm: 999, dark: -3, density: "a" }, station: "groove", tab: "radio", vol: 5 }, known);
  assert.equal(s.knobs.bpm, 174);
  assert.equal(s.knobs.dark, 0);
  assert.equal(s.knobs.density, 0.5);
  assert.equal(s.station, "groove");
  assert.equal(s.tab, "radio");
  assert.equal(s.vol, 1);
  assert.equal(sanitizeState({ station: "gone", tab: "zzz" }, known).station, null);
  assert.equal(sanitizeState({ station: "gone", tab: "zzz" }, known).tab, "mix");
  assert.equal(sanitizeState({ genre: "ambient", knobs: { bpm: 130 } }, known).knobs.bpm, 60);
  assert.deepEqual(sanitizeState({ layers: { rain: 0 } }, known).layers, {});
});
