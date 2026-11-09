// Presets, default state and the persisted-state sanitiser: pure.
import { GENRES } from "./patterns.js";

export const PRESETS = [
  { id: "deep-work", name: "deep work", genre: "dub-techno", knobs: { dark: 0.4 }, layers: { brown: 0.35, alpha: 0.15 } },
  { id: "night-coding", name: "night coding", genre: "dark-techno", knobs: { dark: 0.8 }, layers: { rain: 0.4 } },
  { id: "acid-hour", name: "acid hour", genre: "techno", knobs: { dark: 0.3, density: 0.8 }, layers: {} },
  { id: "cafe", name: "café", genre: "lofi", layers: { cafe: 0.5, rain: 0.2 } },
  { id: "flow", name: "flow", genre: "dnb", layers: { pink: 0.2 } },
  { id: "sleep", name: "sleep", genre: null, layers: { brown: 0.5, ocean: 0.4, delta: 0.1 }, sleep: 30 },
  { id: "space", name: "space", genre: "ambient", layers: { wind: 0.3, theta: 0.1 } },
  { id: "village-morning", name: "village morning", genre: null, layers: { rooster: 0.55, chickens: 0.35, crows: 0.3, koel: 0.3, birds: 0.45, dogs: 0.12, bicycle: 0.25, monastery: 0.3 } },
  { id: "yangon", name: "yangon city", genre: null, layers: { cars: 0.5, horns: 0.4, motorbike: 0.22, crowd: 0.45, market: 0.3, crows: 0.45 } },
  { id: "monsoon-night", name: "monsoon night", genre: null, layers: { rain: 0.55, frogs: 0.55, crickets: 0.3, thunder: 0.22, dogs: 0.08, monastery: 0.12 } },
  { id: "metta", name: "metta", genre: null, layers: { metta: 0.7, rain: 0.18, birds: 0.12 } },
];

export const DEFAULT_STATE = {
  vol: 0.7, genre: "techno", knobs: { bpm: 130, dark: 0.5, density: 0.5 }, layers: {}, station: null, tab: "mix",
};

const TABS = ["mix", "music", "radio"];
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const isObj = (o) => o && typeof o === "object" && !Array.isArray(o);

export function sanitizeState(raw, known) {
  const D = DEFAULT_STATE;
  const r = isObj(raw) ? raw : {};
  const genres = (known && known.genres) || GENRES.map((g) => g.id);
  const genre = genres.includes(r.genre) ? r.genre : D.genre;
  const g = GENRES.find((x) => x.id === genre) || GENRES[0];

  const v = num(r.vol);
  const kn = isObj(r.knobs) ? r.knobs : {};
  const bpm = num(kn.bpm), dark = num(kn.dark), density = num(kn.density);
  const defBpm = genre === D.genre ? D.knobs.bpm : g.bpm[2];
  const knobs = {
    bpm: clamp(bpm ?? defBpm, g.bpm[0], g.bpm[1]),
    dark: dark === null ? D.knobs.dark : clamp(dark, 0, 1),
    density: density === null ? D.knobs.density : clamp(density, 0, 1),
  };

  const layers = {};
  if (isObj(r.layers)) {
    const ids = (known && known.layers) || [];
    for (const [id, val] of Object.entries(r.layers)) {
      const n = num(val);
      if (n !== null && ids.includes(id) && n > 0) layers[id] = clamp(n, 0, 1);
    }
  }
  return {
    vol: v === null ? D.vol : clamp(v, 0, 1),
    genre,
    knobs,
    layers,
    station: known && known.stations && known.stations.includes(r.station) ? r.station : null,
    tab: TABS.includes(r.tab) ? r.tab : D.tab,
  };
}
