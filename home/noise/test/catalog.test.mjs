import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync, readFileSync } from "node:fs";
import { CATEGORIES, LAYERS, BRAINWAVE, CARRIER_HZ, layerOf, byGroup } from "../catalog.js";
import { GLYPH, glyph } from "../glyphs.js";

const file = (rel) => new URL("../" + rel, import.meta.url);

test("categories in display order", () => {
  assert.deepEqual(CATEGORIES.map((c) => c.id), "rain nature animals urban transport places things noise myanmar brainwave".split(" "));
  for (const c of CATEGORIES) assert.ok(c.name && c.icon, c.id);
});

test("ids unique, groups valid, each category has >= 3 sounds", () => {
  const ids = LAYERS.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  const cats = new Set(CATEGORIES.map((c) => c.id));
  for (const l of LAYERS) assert.ok(cats.has(l.group), `${l.id} group ${l.group}`);
  for (const c of CATEGORIES) assert.ok(byGroup(c.id).length >= 3, c.id);
  assert.equal(layerOf("metta").id, "metta");
  assert.equal(layerOf("nope"), undefined);
});

test("every icon resolves to a glyph, glyphs distinct", () => {
  for (const o of [...CATEGORIES, ...LAYERS]) {
    assert.ok(GLYPH[o.icon], `${o.id} icon ${o.icon}`);
    assert.ok(glyph(o.icon).length > 0);
  }
  assert.equal(glyph("does-not-exist"), "");
  const used = LAYERS.map((l) => l.icon);
  assert.equal(new Set(used).size, used.length, "layer icons are unique");
  const markup = Object.values(GLYPH);
  assert.equal(new Set(markup).size, markup.length, "no two glyph keys share markup");
  for (const m of markup) assert.ok(!/[\u{1F000}-\u{1FFFF}☀-➿]/u.test(m));
});

test("samples have existing src matching the manifest, sane trim", () => {
  const manifest = JSON.parse(readFileSync(file("rec/manifest.json"), "utf8")).sounds;
  let bytes = 0;
  for (const l of LAYERS.filter((l) => l.kind === "sample")) {
    assert.ok(l.src && existsSync(file(l.src)), `${l.id} src`);
    assert.ok(l.trim >= 0.1 && l.trim <= 6, `${l.id} trim ${l.trim}`);
    if (manifest[l.id]) assert.equal(l.src, manifest[l.id].file, l.id);
    if (l.group !== "myanmar") bytes += statSync(file(l.src)).size;
  }
  assert.ok(bytes <= 30 * 1024 * 1024, `vendored samples ${bytes}`);
  assert.equal(Object.keys(manifest).length, LAYERS.filter((l) => manifest[l.id]).length);
});

test("optional loop fade is a number in (0, dur/3]", () => {
  for (const l of LAYERS.filter((l) => "fade" in l)) {
    assert.equal(typeof l.fade, "number", l.id);
    assert.ok(l.kind === "sample" && typeof l.dur === "number", `${l.id} needs a sample dur`);
    assert.ok(l.fade > 0 && l.fade <= l.dur / 3, `${l.id} fade ${l.fade}`);
  }
  // clock ticks every 1.0 s in tick/tock pairs: the next copy starts a whole number of pairs later
  const c = layerOf("clock");
  const gap = c.dur - c.fade;
  assert.ok(Math.abs(gap - 2 * Math.round(gap / 2)) < 0.03, `clock copy gap ${gap}`);
});

test("myanmar group", () => {
  const m = byGroup("myanmar");
  assert.deepEqual(m.map((l) => l.id), ["metta", "metta2", "monastery"]);
  assert.ok(layerOf("metta2").src.endsWith("chant-of-metta.mp3"));
  assert.equal(layerOf("monastery").horn, true);
});

test("brainwave", () => {
  const bw = byGroup("brainwave");
  assert.deepEqual(bw.map((l) => l.id), ["delta", "theta", "alpha", "beta", "gamma", "iso"]);
  for (const l of bw) assert.equal(l.kind, "tone");
  for (const l of bw.filter((l) => l.id !== "iso")) assert.equal(typeof BRAINWAVE[l.id], "number");
  assert.deepEqual(BRAINWAVE, { delta: 2, theta: 6, alpha: 10, beta: 18, gamma: 40 });
  assert.equal(CARRIER_HZ, 200);
});
