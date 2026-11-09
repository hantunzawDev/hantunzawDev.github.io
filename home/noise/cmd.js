// Command-line parsers for noise / radio / sleep: pure, validate against `known`.
const err = (message) => ({ type: "error", message });
const KNOBS = ["bpm", "dark", "density"];
const numOf = (s) => (s !== undefined && s.trim() !== "" && Number.isFinite(Number(s)) ? Number(s) : null);

export function parseNoise(args, known) {
  const a = args || [];
  if (!a.length) return { type: "toggle" };
  const [head, ...rest] = a;
  if (head === "list") return { type: "list" };
  if (head === "save") {
    const name = rest.join(" ").trim();
    return name ? { type: "save", name } : err("usage: noise save <name>");
  }
  if (head === "off") {
    if (!rest[0]) return err("usage: noise off <layer>");
    return known.layers.includes(rest[0]) ? { type: "layerOff", id: rest[0] } : err(`unknown layer: ${rest[0]}`);
  }
  if (head === "vol") {
    const n = numOf(rest[0]);
    return n !== null && n >= 0 && n <= 100 ? { type: "vol", vol: n / 100 } : err("usage: noise vol <0-100>");
  }
  if (KNOBS.includes(head)) {
    const n = numOf(rest[0]);
    if (head === "bpm") return n !== null && n >= 40 && n <= 200 ? { type: "knob", knob: head, value: n } : err("bpm must be 40-200");
    return n !== null && n >= 0 && n <= 1 ? { type: "knob", knob: head, value: n } : err(`${head} must be 0-1`);
  }
  const isLayer = known.layers.includes(head);
  if (isLayer && rest.length) {
    const n = numOf(rest[0]);
    if (n === 0) return { type: "layerOff", id: head }; // `rain 0` is `off rain`: never adds a silent layer or starts playback
    return n !== null && n > 0 && n <= 100 ? { type: "layer", id: head, vol: n / 100 } : err("layer volume must be 0-100");
  }
  if (known.presets.includes(head)) return { type: "preset", id: head };
  if (known.genres.includes(head)) return { type: "genre", id: head };
  if (isLayer) return { type: "layer", id: head, vol: 0.5 };
  return err(`unknown: ${head}`);
}

export function parseRadio(args, known) {
  const a = args || [];
  if (!a.length) return { type: "list" };
  if (a[0] === "off") return { type: "off" };
  return known.stations.includes(a[0]) ? { type: "play", id: a[0] } : err(`unknown station: ${a[0]}`);
}

export function parseSleep(args) {
  const s = ((args && args[0]) || "").toLowerCase();
  if (!s) return err("usage: sleep <30m|1h|off>");
  if (s === "off") return { type: "off" };
  const m = /^(\d+)(m|h)?$/.exec(s);
  if (!m) return err("usage: sleep <30m|1h|off>");
  const minutes = Number(m[1]) * (m[2] === "h" ? 60 : 1);
  return minutes >= 1 && minutes <= 600 ? { type: "set", minutes } : err("sleep must be 1-600 minutes");
}
