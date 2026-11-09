import test from "node:test";
import assert from "node:assert/strict";
import { LAYERS, BRAINWAVE, CARRIER_HZ } from "../catalog.js";

test("ids unique and complete", () => {
  const ids = LAYERS.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, "white pink brown blue grey rain thunder wind ocean stream fire crickets cafe fan train keyboard vinyl delta theta alpha beta gamma iso".split(" "));
});

test("groups non-empty, fields present", () => {
  for (const g of ["color", "nature", "places", "brainwave"]) {
    assert.ok(LAYERS.some((l) => l.group === g), g);
  }
  for (const l of LAYERS) {
    assert.ok(l.name && l.glyph, l.id);
  }
});

test("brainwave entries", () => {
  for (const l of LAYERS.filter((l) => l.group === "brainwave" && l.id !== "iso")) {
    assert.ok(typeof BRAINWAVE[l.id] === "number", l.id);
  }
  assert.deepEqual(BRAINWAVE, { delta: 2, theta: 6, alpha: 10, beta: 18, gamma: 40 });
  assert.equal(CARRIER_HZ, 200);
});
