import test from "node:test";
import assert from "node:assert/strict";
import { GENRES, genPattern } from "../patterns.js";

const K = { dark: 0.5, density: 0.5 };
const sum = (a) => a.reduce((s, v) => s + (v ? 1 : 0), 0);

test("genre table matches spec", () => {
  const want = {
    techno: [128, 134], "dark-techno": [124, 132], minimal: [122, 126], "dub-techno": [116, 122],
    lofi: [70, 88], synthwave: [96, 112], ambient: [60, 60], dnb: [170, 174], classical: [60, 80],
  };
  assert.deepEqual(GENRES.map((g) => g.id), Object.keys(want));
  for (const g of GENRES) {
    assert.equal(g.bpm[0], want[g.id][0]);
    assert.equal(g.bpm[1], want[g.id][1]);
    assert.ok(g.bpm[2] >= g.bpm[0] && g.bpm[2] <= g.bpm[1]);
    assert.ok(g.name && g.mood);
  }
  assert.equal(GENRES.find((g) => g.id === "lofi").swing, 0.55);
  assert.equal(GENRES.find((g) => g.id === "ambient").drums, false);
  assert.equal(GENRES.find((g) => g.id === "classical").drums, false);
});

test("four-on-the-floor genres kick on 0,4,8,12", () => {
  for (const id of ["techno", "dark-techno", "minimal", "dub-techno"]) {
    for (const seed of [1, 7, 99]) for (const bar of [0, 3, 16, 40]) {
      const p = genPattern(id, K, bar, seed);
      for (const s of [0, 4, 8, 12]) assert.ok(p.kick[s] > 0, `${id} s${s}`);
      assert.equal(p.kick.length, 16);
    }
  }
});

test("dnb: kick on 0, snare-role perc on 4 and 12", () => {
  const p = genPattern("dnb", K, 5, 3);
  assert.ok(p.kick[0] > 0);
  assert.ok(p.perc[4] > 0 && p.perc[12] > 0);
});

test("ambient/classical have no drums", () => {
  for (const id of ["ambient", "classical"]) {
    const p = genPattern(id, { dark: 1, density: 1 }, 2, 5);
    for (const k of ["kick", "hat", "perc"]) assert.deepEqual(p[k], new Array(16).fill(0));
  }
});

test("density controls hats", () => {
  assert.ok(sum(genPattern("techno", { dark: 0.5, density: 0 }, 0, 7).hat) <= 4);
  assert.ok(sum(genPattern("techno", { dark: 0.5, density: 1 }, 0, 7).hat) >= 8);
});

test("deterministic and varies every 16 bars", () => {
  const a = genPattern("techno", K, 2, 7), b = genPattern("techno", K, 2, 7);
  assert.deepEqual(a, b);
  assert.deepEqual(genPattern("techno", K, 0, 7), genPattern("techno", K, 15, 7));
  assert.notDeepEqual(genPattern("techno", K, 0, 7), genPattern("techno", K, 16, 7));
});

test("values in range, all genres", () => {
  for (const g of GENRES) {
    const p = genPattern(g.id, K, 1, 11);
    for (const k of ["kick", "hat", "perc", "bass"]) {
      assert.equal(p[k].length, 16);
      for (const v of p[k]) assert.ok(Number.isInteger(v) && v >= 0 && (k === "bass" ? v <= 24 : v <= 2));
    }
  }
});
