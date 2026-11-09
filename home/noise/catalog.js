// Pure layer tables: no DOM, no Web Audio.
export const CARRIER_HZ = 200;
export const BRAINWAVE = { delta: 2, theta: 6, alpha: 10, beta: 18, gamma: 40 };

export const LAYERS = [
  { id: "white", group: "color", name: "white", glyph: "░" },
  { id: "pink", group: "color", name: "pink", glyph: "▒" },
  { id: "brown", group: "color", name: "brown", glyph: "▓" },
  { id: "blue", group: "color", name: "blue", glyph: "▏" },
  { id: "grey", group: "color", name: "grey", glyph: "▬" },
  { id: "rain", group: "nature", name: "rain", glyph: "🌧" },
  { id: "thunder", group: "nature", name: "thunder", glyph: "⚡" },
  { id: "wind", group: "nature", name: "wind", glyph: "🍃" },
  { id: "ocean", group: "nature", name: "ocean", glyph: "🌊" },
  { id: "stream", group: "nature", name: "stream", glyph: "💧" },
  { id: "fire", group: "nature", name: "fire", glyph: "🔥" },
  { id: "crickets", group: "nature", name: "crickets", glyph: "🦗" },
  { id: "cafe", group: "places", name: "café", glyph: "☕" },
  { id: "fan", group: "places", name: "fan", glyph: "✢" },
  { id: "train", group: "places", name: "train", glyph: "🚆" },
  { id: "keyboard", group: "places", name: "keyboard", glyph: "⌨" },
  { id: "vinyl", group: "places", name: "vinyl", glyph: "◉" },
  { id: "delta", group: "brainwave", name: "binaural δ", glyph: "δ" },
  { id: "theta", group: "brainwave", name: "binaural θ", glyph: "θ" },
  { id: "alpha", group: "brainwave", name: "binaural α", glyph: "α" },
  { id: "beta", group: "brainwave", name: "binaural β", glyph: "β" },
  { id: "gamma", group: "brainwave", name: "binaural γ", glyph: "γ" },
  { id: "iso", group: "brainwave", name: "isochronic", glyph: "◐" },
];
