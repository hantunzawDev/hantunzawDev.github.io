import test from "node:test";
import assert from "node:assert/strict";
import { STATIONS, VIBES, stationById } from "../stations.js";

const myanmar = () => STATIONS.filter((s) => s.vibe === "myanmar");

test("every vibe has at least 3 stations, unique kebab ids", () => {
  for (const v of VIBES) assert.ok(STATIONS.filter((s) => s.vibe === v).length >= 3, v);
  const ids = STATIONS.map((s) => s.id);
  assert.equal(new Set(ids).size, STATIONS.length);
  for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.equal(stationById("soma-defcon").soma, "defcon");
});

test("all https, every vibe present, fields set", () => {
  for (const s of STATIONS) {
    assert.ok(s.name && VIBES.includes(s.vibe), s.id);
    assert.equal(new URL(s.url).protocol, "https:", s.id);
  }
  for (const v of VIBES) assert.ok(STATIONS.some((s) => s.vibe === v), v);
});

test("every SomaFM row has soma id matching its url", () => {
  const somas = STATIONS.filter((s) => s.url.includes("somafm.com"));
  assert.equal(somas.length, 11);
  for (const s of somas) assert.ok(s.soma && s.url.includes(`/${s.soma}-`), s.id);
  for (const s of STATIONS) if (s.soma) assert.ok(s.url.includes("somafm.com"));
});

test("myanmar group is listed first with at least 5 stations", () => {
  assert.equal(VIBES[0], "myanmar");
  assert.ok(myanmar().length >= 5);
  for (const id of ["padamyar-fm", "cherry-fm", "mandalay-fm", "dvb-digital", "dwg-radio-burmese"])
    assert.ok(stationById(id), id);
});
