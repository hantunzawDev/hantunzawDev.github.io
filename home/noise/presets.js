// Presets, default state and the persisted-state sanitiser: pure.
import { CATEGORIES } from "./catalog.js";
import { VIBES } from "./stations.js";

export const PRESETS = [
  { id: "deep-work", name: "deep work", layers: { "brown-noise": 0.35, alpha: 0.15 } },
  { id: "cafe", name: "café", layers: { cafe: 0.5, "light-rain": 0.2 } },
  { id: "sleep", name: "sleep", layers: { "brown-noise": 0.5, waves: 0.4, delta: 0.1 }, sleep: 30 },
  { id: "village-morning", name: "village morning", layers: { birds: 0.45, chickens: 0.35, crows: 0.3, "dog-barking": 0.12, "wind-in-trees": 0.2, monastery: 0.3 } },
  { id: "yangon", name: "yangon city", layers: { "busy-street": 0.5, traffic: 0.4, crowd: 0.45, crows: 0.4 } },
  { id: "monsoon-night", name: "monsoon night", layers: { "heavy-rain": 0.55, frog: 0.55, crickets: 0.3, thunder: 0.22, monastery: 0.1 } },
  { id: "metta", name: "metta", layers: { metta: 0.7, "light-rain": 0.18, birds: 0.12 } },
  { id: "forest", name: "forest", layers: { "wind-in-trees": 0.4, birds: 0.4, river: 0.3, crickets: 0.15 } },
  { id: "ocean", name: "ocean", layers: { waves: 0.6, seagulls: 0.15, wind: 0.2 } },
  { id: "focus-rain", name: "focus rain", layers: { "rain-on-window": 0.5, "pink-noise": 0.12, alpha: 0.12 } },
];

export const DEFAULT_STATE = { vol: 0.7, layers: {}, station: null, tab: "sounds", cat: "rain", vibe: "myanmar" };

const TABS = ["sounds", "radio"];
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);

// Old saved state (genre, knobs, tab "music", removed layer ids) is ignored silently.
export function sanitizeState(raw, known) {
  const D = DEFAULT_STATE;
  const r = isObj(raw) ? raw : {};
  const v = num(r.vol);
  const layers = {};
  if (isObj(r.layers)) {
    const ids = (known && known.layers) || [];
    for (const [id, val] of Object.entries(r.layers)) {
      const n = num(val);
      if (n !== null && ids.includes(id) && n > 0) layers[id] = clamp(n, 0, 1);
    }
  }
  const cats = (known && known.cats) || CATEGORIES.map((c) => c.id || c);
  const vibes = (known && known.vibes) || VIBES;
  return {
    vol: v === null ? D.vol : clamp(v, 0, 1),
    layers,
    station: known && known.stations && known.stations.includes(r.station) ? r.station : null,
    tab: r.tab === "music" ? "sounds" : TABS.includes(r.tab) ? r.tab : D.tab,
    cat: cats.includes(r.cat) ? r.cat : D.cat,
    vibe: vibes.includes(r.vibe) ? r.vibe : D.vibe,
  };
}
