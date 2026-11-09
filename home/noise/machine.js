// Pure player state machine: no DOM, no Web Audio.
export const STATES = ["idle", "loading", "playing", "paused", "fading", "error"];
export const EVENTS = ["PLAY", "READY", "FAIL", "PAUSE", "STOP", "TIMER_END_SOON", "TIMER_DONE"];

const TABLE = {
  idle: { PLAY: "loading" },
  loading: { READY: "playing", FAIL: "error" },
  playing: { PAUSE: "paused", TIMER_END_SOON: "fading" },
  paused: { PLAY: "playing" },
  fading: { TIMER_DONE: "idle", PLAY: "playing" },
  error: { PLAY: "loading" },
};

export function transition(state, event) {
  if (event === "STOP") return "idle";
  return (TABLE[state] && TABLE[state][event]) || state;
}
