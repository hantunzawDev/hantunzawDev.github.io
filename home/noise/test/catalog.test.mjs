import test from "node:test";
import assert from "node:assert/strict";
import { LAYERS, BRAINWAVE, CARRIER_HZ } from "../catalog.js";

test("ids unique and complete", () => {
  const ids = LAYERS.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, "white pink brown blue grey rain thunder wind ocean stream fire crickets birds rooster chickens crows koel frogs dogs cars motorbike bicycle horns crowd market cafe fan train keyboard vinyl metta metta2 monastery delta theta alpha beta gamma iso".split(" "));
});

test("groups non-empty, fields present", () => {
  for (const g of ["color", "nature", "animals", "street", "places", "myanmar", "brainwave"]) {
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

test("recordings point at bundled files", async () => {
  const { existsSync } = await import("node:fs");
  const recs = LAYERS.filter((l) => l.rec);
  assert.deepEqual(recs.map((l) => l.id), ["metta", "metta2", "monastery"]);
  for (const l of recs) assert.ok(existsSync(new URL("../" + l.rec, import.meta.url)), l.rec);
});
