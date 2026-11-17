import test from "node:test";
import assert from "node:assert/strict";
import { tileView, vibeToShow } from "../radio-view.js";

const st = { id: "a", soma: "a" }, plain = { id: "b" };
const R = (o) => ({ status: "idle", engineState: "idle", analysed: true, np: "", ...o });

test("tileView: other station is off", () => {
  assert.deepEqual(tileView(st, "zzz", R({ status: "playing", engineState: "playing" })), ["off", "tap to tune in", ""]);
  assert.equal(tileView(st, null, R())[0], "off");
});
test("tileView: loading, playing, direct, error, paused", () => {
  assert.equal(tileView(st, "a", R({ status: "loading", engineState: "loading" }))[0], "loading");
  assert.deepEqual(tileView(st, "a", R({ status: "playing", engineState: "playing", np: "X – Y" })), ["on", "on air", "♪ X – Y"]);
  assert.deepEqual(tileView(plain, "b", R({ status: "playing", engineState: "playing", np: "X – Y" })), ["on", "on air", ""]);
  assert.equal(tileView(st, "a", R({ status: "playing", engineState: "playing", analysed: false }))[1], "playing direct · no viz");
  assert.equal(tileView(st, "a", R({ status: "error", engineState: "playing" }))[0], "failed");
  assert.equal(tileView(st, "a", R({ status: "playing", engineState: "paused" }))[0], "paused");
});
test("tileView: selected but status idle is never 'on'", () => {
  assert.equal(tileView(st, "a", R({ status: "idle", engineState: "playing" }))[0], "loading"); // right after play()
  assert.equal(tileView(st, "a", R({ status: "idle", engineState: "idle" }))[0], "off");
  assert.equal(tileView(st, "a", R({ status: "idle", engineState: "error" }))[0], "off");
});
test("vibeToShow", () => {
  assert.equal(vibeToShow({ chosenVibe: "lofi", savedStationVibe: "myanmar", stationChanged: false }), "lofi");
  assert.equal(vibeToShow({ chosenVibe: "lofi", savedStationVibe: "myanmar", stationChanged: true }), "myanmar");
  assert.equal(vibeToShow({ chosenVibe: "lofi", savedStationVibe: null, stationChanged: true }), "lofi");
});
