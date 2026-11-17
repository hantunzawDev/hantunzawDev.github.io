// noise.app glyph set: 12x12 pixel-grid strokes, same drawing rules as
// ../icons.js (whole/half-pixel coordinates so 1px strokes land crisp; class "f"
// = filled). Markup only, no emoji. Sounds share a base shape only where they
// are true variants (the rain family reuses one cloud, noise colours one frame).
const CLOUD = "M3 6.5a2 2 0 0 1 .5-3.9 2.9 2.9 0 0 1 5.4.7 1.6 1.6 0 0 1-.4 3.2z";
const SMALL_CLOUD = "M2.5 5a1.6 1.6 0 0 1 .4-3.1 2.4 2.4 0 0 1 4.5.5 1.3 1.3 0 0 1-.3 2.6z";
const CAR = '<path d="M1.5 9.5v-2l1-2h5l1.5 2h1.5v2z"/><circle cx="3.5" cy="9.5" r=".9" class="f"/><circle cx="8.5" cy="9.5" r=".9" class="f"/>';
// sine of n half-periods drawn with smooth q/t segments across x0..x1 at row y, amplitude a
const wave = (x0, x1, y, a, n) => {
  const w = (x1 - x0) / n;
  return `M${x0} ${y}q${w / 2} ${-a} ${w} 0` + `t${w} 0`.repeat(n - 1);
};

export const GLYPH = {
  // ---- categories
  "cat-rain": '<path d="M1.5 6.5a4.5 4.5 0 0 1 9 0z"/><path d="M6 6.5v3a1 1 0 0 1-2 0"/><path d="M6 1.5v1"/>',
  "cat-nature": '<path d="M1 10.5l3.5-5.5 2.2 3 1.3-1.5 3 4z"/><circle cx="8.8" cy="3" r="1.3"/>',
  "cat-animals": '<path d="M6 10c-2 0-3-1-3-2.2S4.5 6 6 6s3 .6 3 1.8S8 10 6 10z"/><circle cx="2.2" cy="5" r=".9" class="f"/><circle cx="4.6" cy="2.8" r=".9" class="f"/><circle cx="7.4" cy="2.8" r=".9" class="f"/><circle cx="9.8" cy="5" r=".9" class="f"/>',
  "cat-urban": '<path d="M1.5 10.5v-6h3v6M4.5 10.5v-9h3v9M7.5 10.5v-5h3v5M.5 10.5h11"/><path d="M5.5 3.5h1M5.5 5.5h1M5.5 7.5h1"/>',
  "cat-transport": '<rect x="1.5" y="2.5" width="9" height="6.5"/><path d="M1.5 6h9M6 2.5V6"/><circle cx="3.5" cy="9.5" r=".9" class="f"/><circle cx="8.5" cy="9.5" r=".9" class="f"/>',
  "cat-places": '<path d="M6 10.8C3.4 7.8 2.5 6.4 2.5 4.8a3.5 3.5 0 0 1 7 0c0 1.6-.9 3-3.5 6z"/><circle cx="6" cy="4.8" r="1.2"/>',
  "cat-things": '<path d="M6 1.5l4.5 2.2v4.6L6 10.5 1.5 8.3V3.7z"/><path d="M1.5 3.7L6 6l4.5-2.3M6 6v4.5"/>',
  "cat-noise": '<path d="M1 6h1l1-3 1.5 6 1.5-7 1.5 8 1.2-6 .8 2h2"/>',
  "cat-myanmar": '<path d="M6 1v1.5M5 3.5h2M4.5 5h3M3.5 6.5h5M2.5 8.5h7v2h-7z"/><path d="M4.5 5L3.5 6.5M7.5 5l1 1.5M3.5 6.5L2.5 8.5M8.5 6.5l1 2"/>',
  "cat-brainwave": '<circle cx="6" cy="6" r="4.5"/><path d="M2.5 6q1.2-2.5 2.4 0t2.4 0 2.2 0"/>',

  // ---- radio vibes
  "vibe-myanmar": '<path d="M6 .5v2M5 3h2"/><path d="M6 3.5c1.6 0 2.2 1.600 2.500 3.500l1 2h-7l1-2C3.800 5.100 4.400 3.500 6 3.500z"/><path d="M2 9.500h8M1 11h10"/>',
  "vibe-techno": '<path d="M1.500 4.500v3M3.500 2.500v7M5.500 5v2M7.500 1.500v9M9.500 3.500v5M11 5.500v1"/>',
  "vibe-coding": '<path d="M4 2.500L1 6l3 3.500M8 2.500L11 6 8 9.500"/><rect x="5.500" y="4.500" width="1" height="3" class="f"/>',
  "vibe-ambient": '<circle cx="6" cy="6" r="1" class="f"/><path d="M3.800 3.800a3.100 3.100 0 0 0 0 4.400M8.200 3.800a3.100 3.100 0 0 1 0 4.400M2 2a5.600 5.600 0 0 0 0 8M10 2a5.600 5.600 0 0 1 0 8"/>',
  "vibe-lofi": '<path d="M2 8V6a4 4 0 0 1 8 0v2"/><rect x="1.500" y="7.500" width="2.500" height="3.500"/><rect x="8" y="7.500" width="2.500" height="3.500"/>',
  "vibe-classical": '<path d="M6 4V.800M6 4c-1.800 0-2 1.200-1.200 2C3.600 6.800 3.500 8 4 9s1.600 1.500 2 1.500S7.600 10 8 9s.4-2.200-.8-3C8 5.200 7.800 4 6 4z"/><path d="M5 8h2M5.200 6.200v1M6.800 6.200v1"/>',

  // ---- rain
  "light-rain": `<path d="${CLOUD}"/><path d="M4.5 8.5v1M7.5 9v1"/>`,
  "heavy-rain": `<path d="${CLOUD}"/><path d="M3.5 8l-.5 2M5.5 8l-.5 2.5M7.5 8l-.5 2M9.5 8l-.5 2.5"/>`,
  "rain-on-window": '<rect x="1.5" y="1.5" width="9" height="9"/><path d="M6 1.5v9M1.5 6h9"/><path d="M3.5 3v1.5M8.5 7.5V9M3 7.5l.5 1M8.5 3l.5 1"/>',
  "rain-on-leaves": '<path d="M2 10C1.5 5.5 4.5 2.5 10 2.5c0 5-2.5 8-8 7.5z"/><path d="M2 10l5-5"/><path d="M9 .5v1M11 .5v1" />',
  "rain-on-tent": '<path d="M1 10.5L6 4l5 6.5zM6 4v6.5"/><path d="M3 .5v1.5M6 .5v1.5M9 .5v1.5"/>',
  "rain-on-car-roof": `${CAR}<path d="M2.5 1v1.5M5 .5V2M7.5 1v1.5"/>`,
  "thunder": `<path d="${CLOUD}"/><path d="M6.5 6L4.8 8.5h2l-1.3 2.5" />`,

  // ---- nature
  "waves": `<path d="${wave(1, 11, 4, 1.6, 4)}"/><path d="${wave(1, 11, 7, 1.6, 4)}"/><path d="${wave(1, 11, 10, 1.6, 4)}"/>`,
  "river": '<path d="M3.5 1.5c3 2-2.500 3.500.5 5s1 3.500 1 4"/><path d="M8.500 1.5c3 2-2.500 3.500.5 5s1 3.500 1 4"/>',
  "waterfall": '<path d="M1.5 2.500h4v1h-4zM8.500 2.500h2v1h-2z" class="f"/><path d="M5.500 3.500v5M7 3.500v5M8.500 3.500v5"/><path d="M3.500 10.500q1-1.500 2 0t2 0 2 0"/>',
  "campfire": '<path d="M6 1.500c.5 1.500 2.500 2.500 2.500 4.500a2.500 2.500 0 0 1-5 0c0-1 .5-1.500 1-2 0 .8.500 1.200.8 1.200C5.300 4 6 3 6 1.500z"/><path d="M1.500 10.500l9-1.500M10.500 10.500l-9-1.500"/>',
  "wind-in-trees": '<path d="M3.500 10.500V8M3.500 1.500L1.500 5h4zM3.500 4L1 8h5z"/><path d="M7.500 3.500h2.500a1 1 0 1 0-1-1M7 6.500h3.500M7.500 9h1.500a.9.900 0 1 1-.9.9"/>',
  "wind": '<path d="M1 4h6.500a1.700 1.700 0 1 0-1.700-1.700M1 6.500h8.500a1.700 1.700 0 1 1-1.700 1.700M1 9h4.500"/>',
  "jungle": '<path d="M5.500 10.500c0-3 0-5 .5-7.500"/><path d="M6 3C4 1.500 2 2 1 4c1.500-.5 3 0 5 0 1-1.500 3.500-1.500 5 .5-2 0-3.500 1-5 1.500zM6 5.500C4.500 5 3 6 2.500 7.500c1.500-1 2.500-.5 3.500 0M6 5.500c1.500-.5 3 .5 3.500 2-1.500-1-2.500-.5-3.500 0"/>',
  "droplets": '<path d="M6 1l2 3.500a2.300 2.300 0 1 1-4 0z"/><path d="M1.500 10.500q1.500-1 2.500 0t2.500 0 2.500 0 1.500 0"/>',

  // ---- animals
  "birds": '<path d="M1.500 5q1.500-2 2.500 0 1-2 2.500 0M6.500 9q1.200-1.700 2-.2 1-1.500 2 .2"/>',
  "crickets": '<path d="M3 7.500c0-1.500 1-2.500 3-2.500s3.500 1 4 2.500zM3 7.500L1.500 5M6 5L4.500 2M6.500 5l1-3"/><path d="M4.500 7.500l-1 3M7 7.500l1 3M9 7.500l1.500 3"/>',
  "frog": '<path d="M2 6.500a1.800 1.800 0 1 1 2.500-1.600h3A1.800 1.800 0 1 1 10 6.500c1 .8 1 3.500-4 3.500S1 7.300 2 6.500z"/><path d="M4 8q2 1.200 4 0"/><circle cx="3.500" cy="4.200" r=".5" class="f"/><circle cx="8.500" cy="4.200" r=".5" class="f"/>',
  "crows": '<path d="M1 3.500l2 .5C4 2.500 6 2.500 7 4l3 4-2.500 1c-1.500.5-3 .5-4.500-1L2 5.500z"/><path d="M5 9l-.5 2M7 9.200l.2 1.800M2 3.500L.5 3" /><circle cx="3.800" cy="4" r=".4" class="f"/>',
  "chickens": '<path d="M4 3.500a1.200 1.200 0 1 1 2.400-.2 1.200 1.200 0 0 1 .600.200M4.200 3.500c-.5 2 0 3.500-2.500 4 .5 2 2.500 2.500 4.500 2.500 2.500 0 4-1.500 4-3.500L7 5.500"/><path d="M4.500 10.500v1M6.500 10.500v1M3.200 4.700L2 5.200" />',
  "dog-barking": '<path d="M2 3l1.500.5L5 2.500h2.500L9 5v2.500H7L6 9H3.500L2 7.500z"/><circle cx="4" cy="4.800" r=".5" class="f"/><path d="M10 3q1 1.500 0 3M11 2q1.500 2.500 0 5"/>',
  "owl": '<path d="M2 1.500l2 1.500h4l2-1.500v6c0 2-1.500 3-4 3S2 9.500 2 7.500z"/><circle cx="4.200" cy="5.500" r="1.200"/><circle cx="7.800" cy="5.500" r="1.200"/><path d="M6 6.500l-.5 1h1z" class="f"/>',
  "seagulls": '<path d="M1 6q2.500-3.500 5 0 2.500-3.500 5 0M6 6v1"/><path d="M2 10q1-1 2 0t2 0 2 0 2 0"/>',
  "whale": '<path d="M1 7.500C1 5 3 4 5.500 4c2.500 0 3.500 1.500 4.500 3.500l1.500-1.500v3.500L10 9c-1 1-2 1.500-4 1.500-3 0-5-1.200-5-3z"/><circle cx="3" cy="6.500" r=".4" class="f"/><path d="M4.500 1.500v1.500M3 2l1.500 1.500L6 2"/>',

  // ---- urban
  "busy-street": '<path d="M2 1.500h5M4.500 1.500v9M9 4.500l-1.500 1M9 4.500v6"/><path d="M7.500 5.500h3M.5 10.500h11" /><path d="M5.500 6.500h1.500v1.500h-1.500z"/>',
  "traffic": '<path d="M1.500 9.500v-3l1-2h2l1 2v3zM6.500 9.500v-3l1-2h2l1 2v3z"/><path d="M1.500 7.500h4M6.500 7.500h4M1 10.500h10"/>',
  "crowd": '<circle cx="3" cy="3.500" r="1.200"/><circle cx="6" cy="3" r="1.300"/><circle cx="9" cy="3.500" r="1.200"/><path d="M1 9.500c0-2.500 1-3.500 2-3.500M11 9.500c0-2.500-1-3.500-2-3.500M3.500 10.500c0-3 .8-4.500 2.500-4.500s2.500 1.500 2.500 4.500z"/>',
  "highway": '<path d="M5 1.500L1.500 10.500M7 1.500l3.500 9"/><path d="M6 2v1.500M6 5v2M6 8.500v2" />',

  // ---- transport
  "inside-a-train": '<rect x="1.500" y="1.500" width="9" height="6"/><path d="M1.500 4.500h9M4.500 7.500v-6M7.500 7.500v-6"/><path d="M1 9.500h10M3 11h1M5.500 11h1M8 11h1"/>',
  "train": '<path d="M3 1.500h6l1 6.500v1.500H2V8z"/><path d="M3.500 3.500h5v2.500h-5z"/><circle cx="4" cy="8" r=".5" class="f"/><circle cx="8" cy="8" r=".5" class="f"/><path d="M1 10.500l1.500-1M11 10.500l-1.500-1M.5 10.500h11" />',
  "sailboat": '<path d="M6 1.500v6.500M6 1.800L2.500 7.500H6M6.500 3.500l2.500 4h-2.500"/><path d="M1.500 9h9l-1.500 1.500h-6z"/>',
  "airplane": '<path d="M6 1c.8 0 1 1 1 2v2.500l4 2.500v1l-4-1v1.500l1 .8v.7L6 10l-2 .5v-.7l1-.8V7.500l-4 1v-1l4-2.500V3c0-1 .2-2 1-2z"/>',

  // ---- places
  "cafe": '<path d="M2 5h6.500v2.500a3 3 0 0 1-3 3h-.5a3 3 0 0 1-3-3z"/><path d="M8.500 5.500h1a1.200 1.200 0 0 1 0 3h-1"/><path d="M4 1.500q-.8 1 0 2M6.500 1.500q-.8 1 0 2"/>',
  "library": '<path d="M1.500 10.500v-8h2v8zM3.500 10.500v-6h2v6zM5.500 10.500v-7.500l2-.5 2 7.700z" /><path d="M.5 10.500h11"/>',
  "office": '<rect x="3.500" y="1.500" width="5" height="9"/><path d="M5 3.500h2M5 5.500h2M5 7.500h2M5.500 10.500v-1.500h1v1.500M1.500 10.500h9"/>',
  "night-village": '<path d="M1.500 10.500v-3L4 5.500l2.500 2v3zM6.500 10.500h4V8.500L8.500 7l-2 1.500"/><path d="M9.500 1.500a2 2 0 1 0 1.500 3 2 2 0 0 1-1.500-3z"/><path d="M3.500 9h1v1.500h-1z"/>',
  "temple": '<path d="M6 .8v1.700M4.500 4.500l1.500-2 1.500 2zM3.500 6.500l2.500-2 2.500 2zM2 9l4-2.500L10 9zM3 9v1.500h6V9"/>',
  "restaurant": '<path d="M3 1.500v3.500M1.500 1.500V4a1.500 1.500 0 0 0 3 0V1.500M3 5v5.500"/><path d="M9 10.500V1.500C7.500 2 7 4 7 6h2"/>',
  "subway-station": '<path d="M1.500 10.500v-5a4.500 4.500 0 0 1 9 0v5"/><path d="M5 10.500l.5-4h1l.5 4"/><path d="M4 2.500h4"/><path d="M.5 10.500h11"/>',

  // ---- things
  "keyboard": '<rect x="1.500" y="2.500" width="9" height="7"/><path d="M3.500 4.500h1M5.500 4.500h1M7.500 4.500h1M3.500 6.500h1M5.500 6.500h1M7.500 6.500h1M4 8.500h4"/>',
  "clock": '<circle cx="6" cy="6" r="4.500"/><path d="M6 3.200V6l2 1.300"/>',
  "ceiling-fan": '<circle cx="6" cy="6" r="1" class="f"/><path d="M6 5C4.500 2 2 1.500 2 2.500c0 1.500 2 2 4 2.500zM7 6c3-1.500 3.500-4 2.500-4-1.500 0-2 2-2.500 4zM5 7c-3 1.500-3.500 4-2.500 4 1.500 0 2-2 2.500-4zM6.200 7c1.500 3 4 3.500 4 2.500 0-1.500-2-2-4-2.500z"/>',
  "vinyl-effect": '<circle cx="6" cy="6" r="4.500"/><circle cx="6" cy="6" r="1.500"/><circle cx="6" cy="6" r="3" stroke-dasharray="1 1"/>',
  "singing-bowl": '<path d="M1.500 5.500h9c0 3-2 5-4.500 5s-4.500-2-4.500-5z"/><path d="M8.500 1.500l-2.500 3.500"/><path d="M1 10.500h10"/>',
  "wind-chimes": '<path d="M2 1.500h8M6 1.500v2"/><path d="M3 1.500v3.500M5 3.500V8M7 3.500V9.500M9 1.500v5" /><path d="M2.500 5h1M4.500 8h1M6.500 9.500h1M8.500 6.500h1"/>',
  "typewriter": '<path d="M3 1.500h6v3H3zM1.500 4.500h9v4h-9z"/><path d="M3.500 6.500h5M2.500 10.500h7M3 8.500l-.5 2M9 8.500l.5 2"/>',

  // ---- noise colours
  "white-noise": '<path d="M2 2h1M5 1h1M9 2h1M3 4h1M7 3h1M10 5h1M1 6h1M5 5h1M8 6h1M3 8h1M6 7h1M10 8h1M2 10h1M7 9h1M5 10h1M9 10h1"/>',
  "pink-noise": '<path d="M2 10V2M4 10V3.500M6 10V5M8 10V6.500M10 10V8"/>',
  "brown-noise": '<path d="M1 6q2.500-5 5 0t5 0M1 9q2.500-3 5 0t5 0"/>',

  // ---- myanmar (owner's recordings)
  "metta": '<path d="M6 10.500C3.500 10 2 8 2 5.500 4 5.500 5.500 7 6 8.500 6.500 7 8 5.500 10 5.500c0 2.500-1.500 4.500-4 5z"/><path d="M6 8.500C4.500 7 4.500 4 6 1.500 7.500 4 7.500 7 6 8.500z"/>',
  "metta2": '<circle cx="6" cy="2" r=".9"/><circle cx="9.200" cy="3.300" r=".9"/><circle cx="10" cy="6.500" r=".9"/><circle cx="8.700" cy="9.500" r=".9"/><circle cx="5.500" cy="10.300" r=".9"/><circle cx="2.800" cy="8.300" r=".9"/><circle cx="2.500" cy="4.800" r=".9"/><path d="M5.500 11l-.3 1M6.500 11.200l.3.800"/>',
  "monastery": '<path d="M1 4.500l4 1v4l-4 1z"/><path d="M5 5.500l3.500-3v8L5 9.500"/><path d="M10 4q1 2 0 4"/>',

  // ---- brainwave: periods rise δ→γ but stay readable at 12px (≥1.25px per half-period)
  "delta": `<path d="${wave(1, 11, 6, 3.500, 2)}"/>`,
  "theta": `<path d="${wave(1, 11, 6, 3, 3)}"/>`,
  "alpha": `<path d="${wave(1, 11, 6, 2.500, 4)}"/>`,
  "beta": `<path d="${wave(1, 11, 6, 2, 6)}"/>`,
  "gamma": `<path d="${wave(1, 11, 6, 1.500, 8)}"/>`,
  "iso": '<path d="M1 8.500h1.500v-5h2.500v5h2v-5h2.500v5H11"/>',
};

export const glyph = (key) => GLYPH[key] ? GLYPH[key] : "";
// ready-to-insert <svg> wrapper (same shell as icons.js `icon`)
export const glyphSvg = (key, cls = "") =>
  `<svg class="ico${cls ? " " + cls : ""}" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">${glyph(key)}</svg>`;
