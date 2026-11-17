// Pure view decisions for the radio tab (no DOM, node-testable).

// One station tile: [data-state, status line, now-playing line].
// `cur` is the id of radio.current; `r` = { status, engineState, analysed, np }.
export function tileView(st, cur, r) {
  if (cur !== st.id) return ["off", "tap to tune in", ""];
  if (r.status === "error") return ["failed", "offline · retry", ""];
  if (r.status === "loading" || r.engineState === "loading") return ["loading", "tuning in…", ""];
  if (r.status === "playing") {
    if (r.engineState === "paused") return ["paused", "paused", ""];
    const np = st.soma && r.np ? `♪ ${r.np}` : "";
    return ["on", r.analysed ? "on air" : "playing direct · no viz", np];
  }
  // selected but status idle: the instant after play() is a tune-in; an idle or errored engine is nothing playing
  if (r.engineState === "idle" || r.engineState === "error") return ["off", "tap to tune in", ""];
  return ["loading", "tuning in…", ""];
}

// Which vibe the tab shows: the user's pick, unless the station just changed.
export function vibeToShow({ chosenVibe, savedStationVibe, stationChanged }) {
  return stationChanged && savedStationVibe ? savedStationVibe : chosenVibe;
}
