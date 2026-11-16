import test from "node:test";
import assert from "node:assert/strict";
import { PRESETS, DEFAULT_STATE, sanitizeState } from "../presets.js";
import { LAYERS, CATEGORIES } from "../catalog.js";

const known = {
  layers: LAYERS.map((l) => l.id), presets: PRESETS.map((p) => p.id),
  stations: ["soma-defcon", "drone"], cats: CATEGORIES.map((c) => c.id || c),
};

test("presets", () => {
  const ids = PRESETS.map((p) => p.id);
  for (const id of ["deep-work", "cafe", "sleep", "village-morning", "yangon", "monsoon-night", "metta"]) assert.ok(ids.includes(id), id);
  for (const id of ["night-coding", "acid-hour", "flow", "space"]) assert.ok(!ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(PRESETS.find((p) => p.id === "deep-work").layers, { "brown-noise": 0.35, alpha: 0.15 });
  assert.equal(PRESETS.find((p) => p.id === "sleep").sleep, 30);
  for (const p of PRESETS) {
    assert.ok(!("genre" in p) && !("knobs" in p), p.id);
    assert.ok(Object.keys(p.layers).length > 0, p.id);
    for (const [id, v] of Object.entries(p.layers)) {
      assert.ok(known.layers.includes(id), `${p.id}: ${id}`);
      assert.ok(v > 0 && v <= 1, `${p.id}: ${id} vol`);
    }
  }
  assert.ok(!("night-village" in PRESETS.find((p) => p.id === "village-morning").layers));
});

test("default state", () => {
  assert.deepEqual(DEFAULT_STATE, { vol: 0.7, layers: {}, station: null, tab: "sounds", cat: "rain", vibe: "myanmar" });
});

test("sanitize: garbage falls back", () => {
  for (const g of [null, undefined, [], "x", 5, true]) assert.deepEqual(sanitizeState(g, known), DEFAULT_STATE);
  const s = sanitizeState({ layers: { "light-rain": 2, nope: 0.5 }, vol: NaN }, known);
  assert.deepEqual(s.layers, { "light-rain": 1 });
  assert.equal(s.vol, DEFAULT_STATE.vol);
});

test("sanitize: station, tab, cat, vol", () => {
  const s = sanitizeState({ station: "soma-defcon", tab: "radio", cat: "nature", vol: 5 }, known);
  assert.deepEqual(s, { vol: 1, layers: {}, station: "soma-defcon", tab: "radio", cat: "nature", vibe: "myanmar" });
  const bad = sanitizeState({ station: "gone", tab: "zzz", cat: "zzz" }, known);
  assert.equal(bad.station, null);
  assert.equal(bad.tab, "sounds");
  assert.equal(bad.cat, "rain");
  assert.deepEqual(sanitizeState({ layers: { "light-rain": 0 } }, known).layers, {});
  assert.equal(sanitizeState({ vibe: "lofi" }, known).vibe, "lofi");
  assert.equal(sanitizeState({ vibe: "zzz" }, known).vibe, "myanmar");
  assert.equal(sanitizeState({ cat: "nature" }, { layers: [], stations: [] }).cat, "nature"); // cats default to CATEGORIES
});

test("sanitize: old saved state migrates silently", () => {
  const old = { vol: 0.5, genre: "techno", knobs: { bpm: 130, dark: 0.4, density: 0.5 }, layers: { rooster: 0.5, rain: 0.4, brown: 0.3 }, station: "soma-defcon", tab: "music" };
  const out = sanitizeState(old, known);
  assert.deepEqual(out, { vol: 0.5, layers: {}, station: "soma-defcon", tab: "sounds", cat: "rain", vibe: "myanmar" });
  assert.ok(!("genre" in out) && !("knobs" in out));
  // an old id that still exists in the catalogue is kept
  const mixed = sanitizeState({ ...old, layers: { rooster: 0.5, cafe: 0.4, wind: 0.2 } }, known);
  assert.deepEqual(mixed.layers, { cafe: 0.4, wind: 0.2 });
  assert.equal(mixed.tab, "sounds");
});
