// viz.app: a Three.js audio visualizer. Listens to the mic or to shared
// system/tab audio (getDisplayMedia, Chromium only) and draws one of three
// scenes: orb (particle sphere), terrain (scrolling spectrogram landscape),
// pulsar (stacked spectrum ridgelines), bloomed and themed by post.js. Audio capture lives in audio.js and the
// scenes in scenes.js, both shared with the focus/zen backdrop. Mounts into a
// container, returns { stop, setSource, setMode, setColors }.
import { store } from "./data.js";
import { audio, SOURCES } from "./audio.js";
import { MAKERS, AUDIO_SCENES as MODES } from "./scenes.js";
import { createPost } from "./post.js";

const h = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) if (k != null) n.append(k);
  return n;
};
const cssVar = (name) => getComputedStyle(document.body).getPropertyValue(name).trim();

export function viz(root, { setMeta = () => {}, log = () => {} } = {}) {
  let THREE = null, renderer = null, post = null, raf = 0, ro = null, stopped = false;
  let mode = MODES.includes(store.get("viz.mode")) ? store.get("viz.mode") : "orb";
  const scenes = {};
  const accent = { lime: "#c6f432", bg: "#0a0c08" };
  const col = { fg: null, bg: null }; // THREE.Color, updated in place on theme change
  audio.retain();

  // ---------- dom ----------
  const canvas = h("canvas", { tabIndex: 0 });
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Audio visualizer. Keys 1, 2, 3 switch scenes.");
  const hint = h("p", { className: "viz__hint", textContent: "loading three.js…" });
  const board = h("div", { className: "viz__board" }, canvas, hint);
  const keyRow = (label, items, current, onPick) => {
    const g = h("span", { className: "viz__group" });
    g.setAttribute("role", "radiogroup");
    g.setAttribute("aria-label", label);
    for (const it of items) {
      const b = h("button", { type: "button", className: "key", textContent: it });
      b.setAttribute("role", "radio");
      b.dataset.v = it;
      b.addEventListener("click", () => onPick(it));
      g.append(b);
    }
    const sync = (v) => g.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.v === v)));
    sync(current);
    return [g, sync];
  };
  const [srcGroup, syncSrc] = keyRow("Audio source", SOURCES, audio.source, (v) => setSource(v));
  const [modeGroup, syncMode] = keyRow("Scene", MODES, mode, (v) => setMode(v));
  root.replaceChildren(board, h("div", { className: "viz__row" }, srcGroup, modeGroup));
  const offAudio = audio.onChange((src) => { syncSrc(src); if (renderer) setHint(src === "off" ? "pick a source: mic or sys" : ""); });

  canvas.addEventListener("keydown", (e) => {
    const i = ["1", "2", "3"].indexOf(e.key);
    if (i >= 0) { e.preventDefault(); setMode(MODES[i]); }
  });

  function setHint(text) { hint.textContent = text; hint.hidden = !text; }
  const setSource = (next) => audio.setSource(next, log);

  function setMode(next) {
    if (!MODES.includes(next)) return false;
    mode = next;
    store.set("viz.mode", next);
    syncMode(next);
    resize();
    return true;
  }
  function current() {
    if (!THREE) return null;
    return (scenes[mode] ??= MAKERS[mode](THREE, col));
  }
  function setColors() {
    accent.lime = cssVar("--lime") || accent.lime;
    accent.bg = cssVar("--win") || cssVar("--bg") || accent.bg;
    if (!THREE) return;
    (col.fg ??= new THREE.Color()).set(accent.lime);
    (col.bg ??= new THREE.Color()).set(accent.bg);
    renderer?.setClearColor(col.bg);
  }

  // ---------- loop ----------
  function resize() {
    if (!renderer) return;
    const w = Math.max(1, board.clientWidth), hh = Math.max(1, board.clientHeight);
    renderer.setSize(w, hh, false);
    post?.setSize();
    const s = current();
    if (s) { s.camera.aspect = w / hh; s.camera.updateProjectionMatrix(); s.resize?.(w, hh); }
  }
  let last = performance.now(), metaAt = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    // window closed/minimised, or focus/zen is covering the desktop
    if (canvas.offsetParent === null || document.body.dataset.mode !== "desktop") { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    audio.read(t);
    const s = current();
    s.update(dt, t, { aspect: board.clientWidth / Math.max(1, board.clientHeight) });
    if (s.post) post.render(s.scene, s.camera, t); else renderer.render(s.scene, s.camera);
    if (now - metaAt > 250) {
      metaAt = now;
      setMeta(`${audio.source} · ${mode} · ${String(Math.round(audio.level * 100)).padStart(3)}%`);
    }
  }

  (async () => {
    try {
      THREE = await import("./vendor/three.module.min.js");
      if (stopped) return;
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      setColors();
      post = createPost(THREE, renderer, col);
      ro = new ResizeObserver(resize);
      ro.observe(board);
      resize();
      setHint(audio.source === "off" ? "pick a source: mic or sys" : "");
      raf = requestAnimationFrame(frame);
    } catch (err) {
      setHint("webgl isn't available here.");
      log(`viz: ${err?.message || err}`, "err");
    }
  })();

  return {
    setSource, setMode, setColors,
    get mode() { return mode; }, get source() { return audio.source; },
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      offAudio();
      audio.release(); // stops the stream only if the backdrop isn't listening too
      for (const k of Object.keys(scenes)) { scenes[k].dispose(); delete scenes[k]; }
      post?.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer = null;
      root.replaceChildren();
      setMeta("");
    },
  };
}

export const VIZ_MODES = MODES;
export const VIZ_SOURCES = SOURCES;
