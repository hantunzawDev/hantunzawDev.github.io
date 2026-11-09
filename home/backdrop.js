// Backdrop for the focus and zen stages. One fixed layer behind both stages:
// a three.js canvas for the 3D themes (audio, drift, aurora) and plain CSS for
// the rest (grid, scan, glow). Each mode remembers its own theme. three.js is
// only imported the first time a 3D theme is shown, and nothing renders while
// the desktop is up or the tab is hidden.
import { store } from "./data.js";
import { audio, SOURCES } from "./audio.js";
import { MAKERS, AUDIO_SCENES } from "./scenes.js";
import { createPost } from "./post.js";

export const BG_THEMES = ["off", "audio", "drift", "aurora", "grid", "scan", "glow"];
const GL_THEMES = ["audio", "drift", "aurora"];
const STAGES = ["focus", "zen"];
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

const h = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) if (k != null) n.append(k);
  return n;
};
const cssVar = (name) => getComputedStyle(document.body).getPropertyValue(name).trim();

export function backdrop({ log = () => {} } = {}) {
  const pick = (v, list, dflt) => (list.includes(v) ? v : dflt);
  const theme = Object.fromEntries(STAGES.map((m) => [m, pick(store.get(`bg.${m}`), BG_THEMES, "off")]));
  let scene = pick(store.get("bg.scene"), AUDIO_SCENES, "orb");
  let mode = "desktop";
  let THREE = null, renderer = null, post = null, loading = null, raf = 0, holding = false;
  let live = null, liveKey = "";
  const col = { fg: null, bg: null };
  const pointer = { px: 0, py: 0 };

  // ---------- dom ----------
  const canvas = h("canvas");
  const layer = h("div", { className: "backdrop" }, canvas);
  layer.setAttribute("aria-hidden", "true");
  layer.hidden = true;
  document.querySelector("#stage-focus").before(layer);

  const keyGroup = (label, items, onPick) => {
    const g = h("span", { className: "bgbar__group" });
    g.setAttribute("role", "radiogroup");
    g.setAttribute("aria-label", label);
    for (const it of items) {
      const b = h("button", { type: "button", className: "key", textContent: it });
      b.setAttribute("role", "radio");
      b.dataset.v = it;
      b.addEventListener("click", () => onPick(it));
      g.append(b);
    }
    return g;
  };
  // one control bar per stage; both are kept in sync
  const bars = STAGES.map((m) => {
    const themes = keyGroup("Background", BG_THEMES, (v) => setTheme(v, m));
    const scenes = keyGroup("Audio scene", AUDIO_SCENES, (v) => setScene(v));
    const sources = keyGroup("Audio source", SOURCES, (v) => setSource(v));
    const extra = h("span", { className: "bgbar__extra" }, scenes, sources);
    const bar = h("div", { className: "bgbar" }, h("span", { className: "bgbar__label dim", textContent: "bg" }), themes, extra);
    document.querySelector(`#stage-${m}`).append(bar);
    return { m, themes, scenes, sources, extra };
  });
  function syncUi() {
    const check = (g, v) => g.querySelectorAll("button").forEach((b) => {
      const on = b.dataset.v === v;
      b.setAttribute("aria-checked", String(on));
      b.classList.toggle("key--on", on);
    });
    for (const b of bars) {
      check(b.themes, theme[b.m]);
      check(b.scenes, scene);
      check(b.sources, audio.source);
      b.extra.hidden = theme[b.m] !== "audio";
    }
  }
  audio.onChange(syncUi);

  // ---------- state ----------
  function setTheme(next, m = STAGES.includes(mode) ? mode : "zen") {
    if (!BG_THEMES.includes(next) || !STAGES.includes(m)) return false;
    const swap = m === mode && theme[m] !== next;
    theme[m] = next;
    store.set(`bg.${m}`, next);
    apply();
    if (swap) fadeIn();
    return true;
  }
  // a short cross-fade so switching themes doesn't jump-cut
  function fadeIn() {
    if (reduce || layer.hidden) return;
    layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "cubic-bezier(0.23, 1, 0.32, 1)" });
  }
  function cycle(d) {
    if (!STAGES.includes(mode)) return;
    const i = BG_THEMES.indexOf(theme[mode]);
    setTheme(BG_THEMES[(i + d + BG_THEMES.length) % BG_THEMES.length]);
  }
  function setScene(next) {
    if (!AUDIO_SCENES.includes(next)) return false;
    const swap = scene !== next && STAGES.includes(mode) && theme[mode] === "audio";
    scene = next;
    store.set("bg.scene", next);
    apply();
    if (swap) fadeIn();
    return true;
  }
  async function setSource(next) {
    if (!STAGES.includes(mode)) return false; // only listen while a stage is up
    return audio.setSource(next, log);
  }
  function setMode(next) {
    mode = next;
    const onStage = STAGES.includes(mode);
    // hold the audio stream while a stage is up; leaving lets it stop (unless viz.app holds it)
    if (onStage && !holding) { audio.retain(); holding = true; }
    if (!onStage && holding) { audio.release(); holding = false; }
    apply();
  }
  function setColors() {
    if (!THREE) return;
    (col.fg ??= new THREE.Color()).set(cssVar("--lime") || "#c6f432");
    (col.bg ??= new THREE.Color()).set(cssVar("--bg") || "#0a0c08");
    renderer?.setClearColor(col.bg);
  }

  // what should be drawn right now: "" for nothing, else a scene key
  function wanted() {
    if (!STAGES.includes(mode)) return "";
    const t = theme[mode];
    return t === "audio" ? scene : GL_THEMES.includes(t) ? t : "";
  }
  function apply() {
    const t = STAGES.includes(mode) ? theme[mode] : "off";
    layer.hidden = t === "off";
    layer.dataset.bg = t;
    syncUi();
    const key = wanted();
    canvas.hidden = !key;
    if (!key) { stopLoop(); return; }
    ensureGl().then((ok) => {
      if (!ok || wanted() !== key) return;
      if (liveKey !== key) {
        live?.dispose();
        live = MAKERS[key](THREE, col);
        liveKey = key;
        resize();
      }
      startLoop();
    });
  }
  function ensureGl() {
    return (loading ??= (async () => {
      try {
        THREE = await import("./vendor/three.module.min.js");
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
        setColors();
        post = createPost(THREE, renderer, col);
        new ResizeObserver(resize).observe(layer);
        return true;
      } catch (err) {
        log(`bg: webgl isn't available here (${err?.message || err}).`, "err");
        return false;
      }
    })());
  }

  // ---------- loop ----------
  function resize() {
    if (!renderer) return;
    const w = Math.max(1, layer.clientWidth), hh = Math.max(1, layer.clientHeight);
    renderer.setSize(w, hh, false);
    post?.setSize();
    if (live) { live.camera.aspect = w / hh; live.camera.updateProjectionMatrix(); live.resize?.(w, hh); }
  }
  let last = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (document.hidden || !live) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    const t = now / 1000;
    audio.read(t);
    live.update(dt, t, { px: pointer.px, py: pointer.py, aspect: layer.clientWidth / Math.max(1, layer.clientHeight) });
    if (live.post) post.render(live.scene, live.camera, t, { vignette: 0 }); // the layer has a css vignette
    else renderer.render(live.scene, live.camera);
  }
  function startLoop() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stopLoop() { cancelAnimationFrame(raf); raf = 0; }

  addEventListener("pointermove", (e) => {
    pointer.px = (e.clientX / innerWidth) * 2 - 1;
    pointer.py = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });
  // [ and ] cycle the background while a stage is up (not while typing)
  document.addEventListener("keydown", (e) => {
    if (!STAGES.includes(mode) || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
    if (e.key === "[") { e.preventDefault(); cycle(-1); }
    else if (e.key === "]") { e.preventDefault(); cycle(1); }
  });

  syncUi();
  return {
    setMode, setTheme, setScene, setSource, setColors,
    theme: (m) => theme[m],
    get scene() { return scene; },
  };
}
