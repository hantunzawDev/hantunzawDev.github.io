/*
 * ascii.js: the art behind the home stage.
 * Plays pieces from the self-hosted ascii-magic-art library (vendor/ascii-magic-art, MIT),
 * scaled to cover the stage, plus two kinds of art you bring yourself:
 *   textPiece()  pasted ascii, one frame or several split by a line of ---
 *   imageToArt() a picture read in the browser and redrawn as halftone cells
 * A stage only draws while it is on screen; stop() tears the player down.
 */
import { play, withParams } from "./vendor/ascii-magic-art/runtime/player.js";
import { CELL_W, cellAspect } from "./vendor/ascii-magic-art/runtime/canvas.js";
import { imagePiece } from "./vendor/ascii-magic-art/lib/image.js";

const BASE = new URL("./vendor/ascii-magic-art/", import.meta.url).href;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Character sets a piece can be redrawn in. */
export const LOOKS = [
  ["original", "original"], ["dots", "halftone dots"], ["ascii", "ascii"], ["dense", "dense ascii"],
  ["numbers", "numbers"], ["binary", "binary"], ["letters", "letters"], ["blocks", "blocks"],
  ["squares", "squares"], ["lines", "lines"], ["dither", "dither"],
];
/** Calm, dark, full-frame pieces that sit well behind a clock. */
export const FEATURED = [
  "marine-drive-necklace", "moonlit-sea", "northern-lights", "aurora-curtains", "nebula-drift", "snowfall", "arctic-icebergs",
  "water-caustics", "river-lantern-festival", "white-salt-desert-moon",
  "desert-camp-milky-way", "aurora-cabin-snowfall", "fireflies", "jellyfish", "flow-field", "rainy-window",
];

let indexP = null;
/** { cats: Map(id -> name), pieces: [{ slug, name, cat, cols, rows, square, tags }] }, fetched once. */
export function loadIndex() {
  indexP ||= fetch(`${BASE}index.json`).then((r) => { if (!r.ok) throw new Error(`art index: ${r.status}`); return r.json(); }).then((j) => ({
    cats: new Map(j.cats),
    pieces: j.pieces.map(([slug, name, cat, cols, rows, square, tags]) => ({ slug, name, cat, cols, rows, square: !!square, tags })),
  })).catch((e) => { indexP = null; throw e; });
  return indexP;
}
const loadPiece = (slug) => import(`${BASE}pieces/${String(slug).replace(/[^a-z0-9-]/g, "")}.js`);

/* ---------- your own text ---------- */
const MAX_COLS = 320, MAX_ROWS = 160, MAX_FRAMES = 240;
/**
 * Pasted ascii as a piece. Frames are split by a line holding only ---.
 * fx: "glint" sweeps a band of light across, "wave" sways the rows, "none" plays it straight.
 * Returns null when there is nothing to draw.
 */
export function textPiece(src, { fps = 6, fx = "glint", hot = "#ffffff" } = {}) {
  const frames = String(src || "").replace(/\r/g, "").replace(/\t/g, "    ").split(/^[ ]*-{3,}[ ]*$/m)
    .map((f) => f.split("\n").map((l) => [...l.replace(/\s+$/, "")].slice(0, MAX_COLS)))
    .map((ls) => { while (ls.length && !ls[0].length) ls.shift(); while (ls.length && !ls.at(-1).length) ls.pop(); return ls.slice(0, MAX_ROWS); })
    .filter((ls) => ls.length).slice(0, MAX_FRAMES);
  if (!frames.length) return null;
  const rows = Math.max(...frames.map((f) => f.length)), cols = Math.max(1, ...frames.flatMap((f) => f.map((l) => l.length)));
  // every frame padded to the same grid, centred vertically so short frames do not jump
  const grid = frames.map((f) => {
    const top = Math.floor((rows - f.length) / 2);
    return Array.from({ length: rows }, (_, y) => { const l = f[y - top] || []; return l.concat(Array(cols - l.length).fill(" ")); });
  });
  // small art is repeated as a brick pattern so it fills the screen like a wallpaper,
  // each copy a frame or two ahead of its neighbour so an animation ripples across
  const tiled = cols < 64 || rows < 20;
  const px = cols + Math.max(3, Math.round(cols * 0.3)), py = rows + Math.max(1, Math.round(rows * 0.4));
  const COLS = tiled ? Math.min(MAX_COLS, Math.ceil(116 / px) * px) : cols, ROWS = tiled ? Math.min(MAX_ROWS, Math.ceil(42 / py) * py) : rows;
  const at = !tiled ? (f, x, y) => grid[f][y][x] : (f, x, y) => {
    const ty = Math.floor(y / py), ly = y - ty * py, X = x + (ty & 1) * (px >> 1), tx = Math.floor(X / px), lx = X - tx * px;
    return ly < rows && lx < cols ? grid[(f + tx + ty * 2) % grid.length][ly][lx] : " ";
  };
  const moving = grid.length > 1 || fx !== "none";
  const rate = clamp(fps, 1, 30), span = COLS + ROWS * 2, band = Math.max(5, Math.round(COLS * 0.06));
  const meta = { slug: "custom-text", name: "my art", category: "custom", cols: COLS, rows: ROWS, fps: fx === "none" ? rate : 20, palette: { h: hot }, still: !moving };
  function create() {
    return (t) => {
      const f = Math.floor(t * rate) % grid.length;
      const sweep = fx === "glint" ? ((t % 7) / 7) * 1.5 * span - span * 0.25 : -1e9;
      let text = "", color = "";
      for (let y = 0; y < ROWS; y++) {
        const sway = fx === "wave" ? Math.round(Math.sin(y * 0.32 + t * 1.6) * 1.6) : 0;
        for (let x = 0; x < COLS; x++) {
          const sx = tiled ? (((x - sway) % COLS) + COLS) % COLS : x - sway, ch = sx >= 0 && sx < COLS ? at(f, sx, y) : " ";
          text += ch;
          color += ch !== " " && Math.abs(x + y * 2 - sweep) < band ? "h" : " ";
        }
        if (y < ROWS - 1) { text += "\n"; color += "\n"; }
      }
      return { text, color };
    };
  }
  return { meta, default: create };
}

/* ---------- your own picture ---------- */
const KEYS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"; // same palette keys the library uses
const hex2 = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
/**
 * Read a picture file and reduce it to a grid of palette keys and ink levels 0-7,
 * the same shape the library's photo scenes use. Nothing leaves the browser.
 */
export async function imageToArt(file, { cols = 176, colors = 40 } = {}) {
  const bmp = await createImageBitmap(file);
  const rows = clamp(Math.round(cols * bmp.height / bmp.width), 24, 150);
  const cv = document.createElement("canvas"); cv.width = cols; cv.height = rows;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, cols, rows);
  bmp.close?.();
  const px = ctx.getImageData(0, 0, cols, rows).data, n = cols * rows;
  // split each pixel into a hue at full brightness (the palette colour) and how bright it is (the ink level)
  const Q = 6, bins = new Map(), binOf = new Uint16Array(n), lv = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const a = px[i * 4 + 3] / 255, r = px[i * 4] * a, g = px[i * 4 + 1] * a, b = px[i * 4 + 2] * a, mx = Math.max(r, g, b, 1), s = 255 / mx;
    lv[i] = Math.round(Math.pow(mx / 255, 0.85) * 7);
    const R = r * s, G = g * s, B = b * s, q = (v) => Math.min(Q - 1, Math.floor(v / 256 * Q)), id = (q(R) * Q + q(G)) * Q + q(B);
    binOf[i] = id;
    const e = bins.get(id) || [0, 0, 0, 0];
    e[0] += R * mx; e[1] += G * mx; e[2] += B * mx; e[3] += mx; bins.set(id, e);
  }
  const all = [...bins].map(([id, e]) => ({ id, w: e[3], c: [e[0] / e[3], e[1] / e[3], e[2] / e[3]] })).sort((p, q) => q.w - p.w);
  const top = all.slice(0, clamp(colors, 2, KEYS.length)), keyOf = new Map(), palette = {};
  top.forEach((b, i) => { keyOf.set(b.id, KEYS[i]); palette[KEYS[i]] = `#${hex2(b.c[0])}${hex2(b.c[1])}${hex2(b.c[2])}`; });
  for (const b of all.slice(top.length)) { // rarer colours join their nearest kept neighbour
    let best = 0, bd = Infinity;
    top.forEach((p, i) => { const d = (p.c[0] - b.c[0]) ** 2 + (p.c[1] - b.c[1]) ** 2 + (p.c[2] - b.c[2]) ** 2; if (d < bd) { bd = d; best = i; } });
    keyOf.set(b.id, KEYS[best]);
  }
  const color = [], level = [];
  for (let y = 0; y < rows; y++) {
    let c = "", l = "";
    for (let x = 0; x < cols; x++) { const i = y * cols + x; c += keyOf.get(binOf[i]); l += lv[i]; }
    color.push(c); level.push(l);
  }
  return { v: 1, name: String(file.name || "my image").slice(0, 60), cols, rows, palette, color, level };
}
/** A stored imageToArt() result as a piece, with slow light moving over it. Null when the data is not usable. */
export function imageArtPiece(d) {
  if (!d || d.v !== 1 || !Array.isArray(d.color) || !Array.isArray(d.level) || d.color.length !== d.rows || d.level.length !== d.rows) return null;
  if (!d.color.every((r) => typeof r === "string" && r.length === d.cols) || !d.level.every((r) => /^[0-7]+$/.test(r) && r.length === d.cols)) return null;
  const palette = {};
  for (const [k, v] of Object.entries(d.palette || {})) if (k.length === 1 && /^#[0-9a-f]{6}$/i.test(v)) palette[k] = v;
  if (!Object.keys(palette).length) return null;
  const meta = { slug: "custom-image", name: d.name || "my image", category: "custom", cols: d.cols, rows: d.rows, fps: 15, cell: "square", look: "dots", palette };
  return { meta, default: imagePiece(meta, { color: d.color, level: d.level }, { glint: { every: 11, width: 12 }, twinkle: 0.5, breathe: 0.3 }) };
}

/* ---------- the stage ---------- */
/**
 * Plays one piece inside `host`, scaled to cover it (or fit inside it).
 * show(source, opts): source is a slug or a piece module { meta, default }.
 * opts: look, mono (one colour: the host's css color), fit ("cover" | "fit"), speed, reduce,
 *   cell (largest character size in px, 0 = no cap),
 *   layout ("centre": one copy in the middle, edges fading by `fade` percent where it is smaller than the host |
 *           "tile": mirrored copies so a capped size still fills the host edge to edge).
 */
export function artStage(host, { onChange } = {}) {
  let wrap = null, pre = null, meta = null, stopPlay = null, cur = null, token = 0, ro = null, resizeT = 0, active = false, tileCv = null;
  const MAX_TILES = 49, FINE_PX = 11; // a piece has a fixed grid (192 columns at most), so fine characters mean a smaller piece
  const size = () => {
    if (!pre || !meta) return;
    const W = host.clientWidth, H = host.clientHeight;
    if (!W || !H) return;
    const o = cur.opts, tiled = o.layout === "tile", a = cellAspect(meta), cw = meta.cols * CELL_W, ch = meta.rows * CELL_W * a, fx = W / cw, fy = H / ch;
    // cover, but never blow a narrow strip up past ~2.4x the stage: the canvas would get huge for no gain
    let px = o.fit === "fit" && !tiled ? Math.min(fx, fy) * 0.9 : Math.min(Math.max(fx, fy), Math.min(fx, fy) * 2.4);
    if (o.layout !== "fill") px = Math.min(px, FINE_PX); // centred and tiled keep the fine size; only "fill" scales the piece up to the screen
    px = clamp(px, 3, 96);
    // tiles must stay few: past MAX_TILES the characters grow instead
    if (tiled) { const n = Math.ceil(W / (cw * px)) * Math.ceil(H / (ch * px)); if (n > MAX_TILES) px = clamp(px * Math.sqrt(n / MAX_TILES), 3, 96); }
    pre.style.fontSize = `${px.toFixed(2)}px`;
    wrap.classList.toggle("art--tiled", tiled);
    if (tiled) { sizeTiles(W, H, cw * px, ch * px); return; }
    // centred: where the piece is smaller than the stage its edges dissolve; where it overflows they stay put
    const f = clamp(o.fade ?? 0, 0, 100) / 2;
    wrap.style.setProperty("--fx", cw * px < W - 1 ? `${f}%` : "0%");
    wrap.style.setProperty("--fy", ch * px < H - 1 ? `${f}%` : "0%");
  };
  // one drawing of the piece, copied (and mirrored, so seams match) across the whole host
  function sizeTiles(W, H, tw, th) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (!tileCv) { tileCv = document.createElement("canvas"); tileCv.className = "art__tiles"; tileCv.setAttribute("aria-hidden", "true"); wrap.append(tileCv); }
    if (tileCv.width !== Math.round(W * dpr) || tileCv.height !== Math.round(H * dpr)) { tileCv.width = Math.round(W * dpr); tileCv.height = Math.round(H * dpr); }
    tileCv.style.width = `${W}px`; tileCv.style.height = `${H}px`;
    tileCv._g = { W, H, tw, th, dpr, bleed: clamp(cur.opts.bleed ?? 100, 0, 100) / 100 };
    blit();
  }
  function blit() {
    const src = pre?._canvas, g = tileCv?._g;
    if (!src || !g || !src.width) return;
    const ctx = tileCv.getContext("2d"), { W, H, tw, th, dpr, bleed } = g;
    // an odd count keeps one unmirrored copy in the middle; the overhang is cropped evenly
    const nx = Math.ceil(W / tw) | 1, ny = Math.ceil(H / th) | 1, ox = (W - nx * tw) / 2, oy = (H - ny * th) / 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = ox + i * tw, y = oy + j * th;
      if (x + tw < 0 || y + th < 0 || x > W || y > H) continue;
      ctx.save();
      // the middle copy is full strength; each ring outward gets dimmer, so the piece bleeds into the screen
      const ring = Math.max(Math.abs(i - (nx - 1) / 2), Math.abs(j - (ny - 1) / 2));
      ctx.globalAlpha = ring === 0 ? 1 : Math.min(1, bleed / ring);
      ctx.translate(x + (i & 1 ? tw : 0), y + (j & 1 ? th : 0));
      ctx.scale(i & 1 ? -1 : 1, j & 1 ? -1 : 1);
      ctx.drawImage(src, 0, 0, tw, th);
      ctx.restore();
    }
  }
  const drop = (el, stop, fade) => {
    if (!el) return;
    if (!fade) { stop?.(); el.remove(); return; }
    el.classList.add("is-out");
    setTimeout(() => { stop?.(); el.remove(); }, 320);
  };
  function mount(mod) {
    const o = cur.opts, old = wrap, oldStop = stopPlay;
    wrap = document.createElement("div");
    wrap.className = "art" + (o.reduce ? "" : " is-in");
    pre = document.createElement("pre");
    wrap.append(pre);
    host.append(wrap);
    tileCv = null;
    meta = mod.meta;
    wrap.dataset.ink = o.mono || meta.category === "custom" ? "theme" : "plain"; // which css colour un-coloured cells take
    size();
    stopPlay = play(pre, withParams(mod, {}), {
      speed: o.speed || 1, still: !!o.reduce, maxFps: 30,
      onFrame: o.layout === "tile" ? blit : undefined,
      look: { look: o.look && o.look !== "original" ? o.look : undefined, mono: !!o.mono },
    });
    drop(old, oldStop, !o.reduce);
    onChange?.(meta);
  }
  async function show(source, opts = {}) {
    const my = ++token;
    cur = { source, opts };
    if (!active) return true; // remembered; drawn on start()
    let mod;
    try { mod = typeof source === "string" ? await loadPiece(source) : source; }
    catch { return false; }
    if (my !== token || !active) return true;
    if (!mod?.meta || typeof mod.default !== "function") return false;
    try { mount(mod); } catch { return false; }
    return true;
  }
  function start() {
    if (active) return;
    active = true;
    ro = new ResizeObserver(() => {
      size();
      // a still frame has no loop to pick the new size up, so draw it again once resizing settles
      if (cur?.opts.reduce || meta?.still) { clearTimeout(resizeT); resizeT = setTimeout(() => cur && show(cur.source, cur.opts), 180); }
    });
    ro.observe(host);
    if (cur) show(cur.source, cur.opts);
  }
  function stop() {
    if (!active) return;
    active = false; token++;
    ro?.disconnect(); ro = null; clearTimeout(resizeT);
    stopPlay?.(); stopPlay = null;
    host.replaceChildren();
    wrap = pre = meta = tileCv = null;
  }
  return { show, start, stop, get running() { return active; }, get meta() { return meta; } };
}
