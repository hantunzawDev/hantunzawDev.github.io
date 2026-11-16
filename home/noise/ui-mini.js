// noise.app mini player (focus + zen stage) and the spectrum bars it shares with
// the window header.
//
// A glass pill at the foot of the stage: transport, what is on (sound names or the
// radio station + now playing), a 24-bar spectrum, volume and a way back to the full
// window. It shows only while there is a selection, draws on ui.js's single rAF,
// and in zen it dims to 0.2 after 4 s without input.
import { bands } from "../audio.js";

const RM = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pct = (v) => String(Math.round(v * 100));
const mmss = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

export function rgba(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

export function readColors(el) {
  const cs = getComputedStyle(el);
  const v = (n) => cs.getPropertyValue(n).trim();
  return { accent: v("--lime"), hot: v("--amber"), line: v("--line"), lineHi: v("--line-hi"), dim: v("--dim"), glow: v("--glow") !== "none" };
}

// A bar spectrum from audio.js's 64 smoothed bands: gradient bars, hot tips, peak
// caps that fall back slowly; a dim standby row with one slow scanner light when
// nothing sounds. `S` keeps the per-canvas smoothing state ({ vals, peaks }).
export function spectrumState(n) { return { n, vals: new Float32Array(n), peaks: new Float32Array(n) }; }
export function drawSpectrum(S, cv, C, now, playing) {
  const w = cv.clientWidth, hh = cv.clientHeight;
  if (!w || !hh || !C) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hh * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
  const c = cv.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, hh);
  const plain = RM.matches, MB = S.n, vals = S.vals, peaks = S.peaks;
  const gap = 2, bw = (w - gap * (MB - 1)) / MB, base = hh - 1.5, top = 2, span = base - top;
  const step = Math.max(1, Math.floor(48 / MB)); // lower 48 of 64 bands (the top 16 are mostly air)

  c.fillStyle = C.line;
  c.fillRect(0, base + 0.5, w, 1);

  if (!playing) {
    const at = plain ? -1 : Math.floor(((now / 2400) % 1) * (MB + 6)) - 3;
    for (let i = 0; i < MB; i++) {
      vals[i] *= plain ? 0 : 0.86; peaks[i] *= 0.9;
      const x = i * (bw + gap), d = Math.abs(i - at);
      const tail = d < 3 ? 1 - d / 3 : 0;
      const bh = Math.max(1.5, vals[i] * span);
      c.fillStyle = tail ? rgba(C.accent, 0.25 + 0.55 * tail) : C.lineHi;
      c.fillRect(x, base - bh, bw, bh);
    }
    return;
  }

  const grad = c.createLinearGradient(0, top, 0, base);
  grad.addColorStop(0, C.accent);
  grad.addColorStop(1, rgba(C.accent, 0.28));
  if (C.glow && !plain) { c.shadowColor = rgba(C.accent, 0.6); c.shadowBlur = 6; }
  for (let i = 0; i < MB; i++) {
    let sum = 0;
    for (let k = 0; k < step; k++) sum += bands[i * step + k];
    const t = Math.min(1, Math.pow(sum / step, 1.4) * 1.2); // a little expansion so loud and quiet bands part
    if (plain) vals[i] = t;
    else vals[i] += (t - vals[i]) * (t > vals[i] ? 0.6 : 0.16);
    const v = vals[i];
    if (v > peaks[i]) peaks[i] = v; else peaks[i] = Math.max(0, peaks[i] - (plain ? 1 : 0.011));
    const x = i * (bw + gap), bh = Math.max(1.5, v * span);
    c.fillStyle = grad;
    c.fillRect(x, base - bh, bw, bh);
    if (v > 0.78 && !plain) { c.fillStyle = C.hot; c.fillRect(x, base - bh, bw, Math.min(3, bh)); }
  }
  c.shadowBlur = 0;
  if (!plain) {
    c.fillStyle = C.accent;
    for (let i = 0; i < MB; i++) {
      if (peaks[i] < 0.06) continue;
      c.globalAlpha = 0.4 + 0.5 * peaks[i];
      c.fillRect(i * (bw + gap), Math.round(base - 3 - peaks[i] * span), bw, 1);
    }
    c.globalAlpha = 1;
  }
}

// deps: { h, icon, engine, audio, toggle, stopMode, hasSelection, info, status, wake }
export function createMini(D) {
  const { h } = D;
  let M = null, off = [];
  const spec = spectrumState(24);

  function build() {
    const m = {};
    m.glyph = h("span", { class: "nz-mini__glyph", "aria-hidden": "true" });
    m.play = h("button", { type: "button", class: "nz-mini__play", "aria-label": "Play", onclick: () => { D.toggle(); poke(); } }, m.glyph);
    m.tag = h("span", { class: "nz-mini__tag" });
    m.name = h("span", { class: "nz-mini__name" });
    // only the description is announced; the sleep countdown stays out of the live region
    m.desc = h("span", { class: "nz-mini__desc", role: "status", "aria-live": "polite" });
    m.sleep = h("span", { class: "nz-mini__sleep", title: "sleep timer" });
    m.cv = h("canvas", { class: "nz-mini__spec", width: "120", height: "28", "aria-hidden": "true" });
    m.vol = h("input", { type: "range", class: "nz-mini__range", min: "0", max: "100", step: "1", "aria-label": "Volume" });
    m.volNum = h("span", { class: "nz-mini__num", "aria-hidden": "true" });
    m.vol.addEventListener("input", () => {
      const v = clamp(+m.vol.value / 100, 0, 1);
      m.vol.style.setProperty("--v", v.toFixed(3));
      m.volNum.textContent = pct(v);
      D.engine.setVol(v);
    });
    m.more = h("button", { type: "button", class: "nz-mini__more", "aria-label": "Open noise.app", title: "open noise.app", onclick: () => m.onExpand?.() });
    m.more.innerHTML = D.icon("pop");
    m.root = h("div", { class: "nz-mini", role: "region", "aria-label": "noise.app player" },
      m.play,
      h("div", { class: "nz-mini__info" },
        h("div", { class: "nz-mini__top" }, h("i", { class: "nz-mini__led", "aria-hidden": "true" }), m.tag, m.name),
        h("div", { class: "nz-mini__bot" }, m.desc, m.sleep)),
      m.cv,
      h("div", { class: "nz-mini__vol" }, m.vol, m.volNum),
      m.more);
    m.shown = false;
    m.lastSleep = -1;
    return m;
  }

  function render() {
    if (!M) return;
    const show = D.hasSelection();
    if (show !== M.shown) {
      M.shown = show;
      M.root.classList.toggle("is-on", show);
      M.root.inert = !show;
      if (show) poke();
    }
    const eng = D.engine;
    M.root.dataset.state = eng.state;
    const sm = D.stopMode();
    M.play.dataset.k = sm ? "stop" : "play";
    M.play.setAttribute("aria-label", sm ? "Stop" : eng.state === "fading" ? "Keep playing" : "Play");
    const info = D.info(), si = D.status();
    M.root.dataset.src = info.tag;
    M.tag.textContent = info.tag;
    M.name.textContent = info.name || "noise";
    M.root.dataset.k = si.cls;
    const desc = si.cls === "err" || si.cls === "load" ? si.text : info.desc;
    if (M.desc.textContent !== desc) M.desc.textContent = desc;
    M.root.title = `${info.name} · ${info.desc}`;
    if (document.activeElement !== M.vol) {
      M.vol.value = pct(eng.vol);
      M.vol.style.setProperty("--v", eng.vol.toFixed(3));
      M.volNum.textContent = pct(eng.vol);
    }
    sleep();
    D.wake();
  }

  function sleep() {
    const sl = D.engine.sleepLeft(), sec = Math.ceil(sl / 1000);
    if (sec === M.lastSleep) return;
    M.lastSleep = sec;
    M.sleep.textContent = sl ? `sleep ${mmss(sl)}` : "";
  }

  function visible() {
    return !!M && M.shown && !document.hidden && M.root.isConnected && document.body.dataset.mode !== "desktop";
  }

  // zen: fade to 0.2 after 4 s without pointer / key / focus; anything brings it back
  function poke() {
    if (!M) return;
    if (M.idle) { M.idle = false; M.root.classList.remove("is-idle"); }
    clearTimeout(M.idleT);
    if (M.zen) M.idleT = setTimeout(() => { if (M && M.zen) { M.idle = true; M.root.classList.add("is-idle"); } }, 4000);
  }

  function draw(now, playing) {
    if (now - (M.polled || 0) > 250) { M.polled = now; sleep(); }
    // the pill breathes with the sound: border glow follows the master level
    const lv = playing && !RM.matches ? clamp(D.audio.level * 1.4, 0, 1) : 0;
    if (Math.abs(lv - (M.lv || 0)) > 0.015) { M.lv = lv; M.root.style.setProperty("--lv", lv.toFixed(3)); }
    drawSpectrum(spec, M.cv, M.colors, now, playing); // the canvas is display:none on narrow screens
  }

  function mount(stageEl, opts = {}) {
    if (!stageEl) return;
    if (!M) {
      M = build();
      const onAny = () => poke();
      const onVis = () => D.wake();
      const evs = ["pointermove", "pointerdown", "keydown", "focusin", "wheel", "touchstart"];
      for (const ev of evs) addEventListener(ev, onAny, { passive: true, capture: true });
      document.addEventListener("visibilitychange", onVis);
      const mo = new MutationObserver(() => { if (M) M.colors = readColors(document.body); D.wake(); });
      mo.observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });
      const onRM = () => D.wake();
      RM.addEventListener("change", onRM);
      off = [
        () => { for (const ev of evs) removeEventListener(ev, onAny, { capture: true }); },
        () => document.removeEventListener("visibilitychange", onVis),
        () => mo.disconnect(),
        () => RM.removeEventListener("change", onRM),
      ];
    }
    if (opts.onExpand) M.onExpand = opts.onExpand;
    M.zen = stageEl.id === "stage-zen";
    if (M.root.parentNode !== stageEl) stageEl.append(M.root);
    M.colors = readColors(document.body);
    render();
    poke();
    D.wake();
  }

  function unmount() {
    if (!M) return;
    clearTimeout(M.idleT);
    for (const fn of off) fn();
    off = [];
    M.root.remove();
    M = null;
  }

  return { mount, unmount, render, visible, draw, get on() { return !!M; } };
}
