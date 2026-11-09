// Pure genre table + seeded 16-step pattern generator: no DOM, no Web Audio.
import { makeRng } from "./gen.js";

const G = (id, name, mood, bpm, swing, drums, cfg) => ({ id, name, mood, bpm, swing, drums, cfg });

// cfg: kick style, hat/perc base probability (of 16 steps), bass base probability, bass scale (semitones)
const TABLE = [
  G("techno", "techno", "driving, acid", [128, 134, 130], 0, true, { kick: "four", hat: 0.6, perc: 0.2, bass: 0.7, scale: [0, 0, 3, 7, 10, 12] }),
  G("dark-techno", "dark techno", "industrial, brooding", [124, 132, 128], 0, true, { kick: "four", hat: 0.45, perc: 0.3, bass: 0.55, scale: [0, 0, 1, 3, 6, 7] }),
  G("minimal", "minimal", "sparse, clicky", [122, 126, 124], 0, true, { kick: "four", hat: 0.35, perc: 0.25, bass: 0.3, scale: [0, 0, 7, 12] }),
  G("dub-techno", "dub techno", "deep, spacious", [116, 122, 119], 0, true, { kick: "four", hat: 0.3, perc: 0.15, bass: 0.25, scale: [0, 0, 3, 7, 10] }),
  G("lofi", "lo-fi", "dusty, mellow", [70, 88, 78], 0.55, true, { kick: "lofi", hat: 0.5, perc: 0.1, bass: 0.3, scale: [0, 3, 5, 7, 10] }),
  G("synthwave", "synthwave", "neon, nostalgic", [96, 112, 104], 0, true, { kick: "backbeat", hat: 0.5, perc: 0.15, bass: 0.75, scale: [0, 0, 12, 12, 7, 3] }),
  G("ambient", "ambient", "drifting, weightless", [60, 60, 60], 0, false, { kick: "none", hat: 0, perc: 0, bass: 0, scale: [0] }),
  G("dnb", "drum & bass", "fast, rolling", [170, 174, 172], 0, true, { kick: "dnb", hat: 0.55, perc: 0.2, bass: 0.35, scale: [0, 0, 3, 5, 7, 10] }),
  G("classical", "classical", "gentle, piano", [60, 80, 70], 0, false, { kick: "none", hat: 0, perc: 0, bass: 0.2, scale: [0, 7, 12] }),
];

export const GENRES = TABLE.map(({ cfg, ...g }) => g);
const CFG = Object.fromEntries(TABLE.map((g) => [g.id, g.cfg]));

const clamp01 = (v) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.5));
const zeros = () => new Array(16).fill(0);
const OFFBEATS = [2, 6, 10, 14];

function pick(n, priority, rng) {
  // choose n distinct steps: priority list first, then the rest in rng order
  const rest = [];
  for (let i = 0; i < 16; i++) if (!priority.includes(i)) rest.push(i);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [...priority, ...rest].slice(0, n);
}

export function genPattern(genreId, knobs, bar, seed) {
  const cfg = CFG[genreId] || CFG.techno;
  const dark = clamp01(knobs && knobs.dark), density = clamp01(knobs && knobs.density);
  const block = Math.floor(Math.max(0, bar) / 16);
  const rng = makeRng((seed ^ Math.imul(block, 2654435761)) >>> 0);
  const kick = zeros(), hat = zeros(), perc = zeros(), bass = zeros();
  const dens = 0.4 + 0.6 * density;

  if (cfg.kick === "four") for (const s of [0, 4, 8, 12]) kick[s] = s === 0 ? 2 : 1;
  else if (cfg.kick === "backbeat") { kick[0] = 2; kick[8] = 1; perc[4] = 2; perc[12] = 2; }
  else if (cfg.kick === "lofi") { kick[0] = 2; kick[10] = 1; perc[4] = 2; perc[12] = 2; }
  else if (cfg.kick === "dnb") { kick[0] = 2; kick[10] = 1; perc[4] = 2; perc[12] = 2; if (rng() < dens) perc[7] = 1; if (rng() < dens) perc[15] = 1; }

  if (cfg.hat > 0) {
    const n = Math.round(16 * cfg.hat * dens);
    for (const s of pick(n, OFFBEATS, rng)) hat[s] = OFFBEATS.includes(s) ? 2 : 1;
  }
  if (cfg.perc > 0) {
    const n = Math.round(16 * cfg.perc * dens * (genreId === "dark-techno" ? 0.6 + 0.8 * dark : 1));
    const free = [];
    for (let i = 0; i < 16; i++) if (!perc[i] && !kick[i]) free.push(i);
    for (let i = free.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [free[i], free[j]] = [free[j], free[i]];
    }
    for (const s of free.slice(0, n)) perc[s] = 1;
  }
  if (cfg.bass > 0) {
    // dark narrows the scale to its low notes (lower pitch range)
    const scale = cfg.scale.slice(0, Math.max(1, Math.ceil(cfg.scale.length * (1 - 0.5 * dark))));
    const p = cfg.bass * dens;
    for (let i = 0; i < 16; i++) {
      if (i === 0 || rng() < p) bass[i] = scale[Math.floor(rng() * scale.length)] + 1;
    }
  }
  return { kick, hat, perc, bass };
}
