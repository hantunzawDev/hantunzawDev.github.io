import test from "node:test";
import assert from "node:assert/strict";
import { STATIONS, VIBES, stationById } from "../stations.js";

test("24 stations, unique kebab ids", () => {
  assert.equal(STATIONS.length, 24);
  const ids = STATIONS.map((s) => s.id);
  assert.equal(new Set(ids).size, 24);
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
