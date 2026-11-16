// noise.app "sounds" tab: category rail, a grid of sound tiles for the selected
// category, presets, and the "now mixing" strip pinned under it.
//
// Design notes (kept inside the hzOS phosphor world: square corners, 1px rules,
// Martian Mono UI + Doto numerals, theme tokens only, glow only where a theme has it):
// - A tile is one big real <button aria-pressed> (the whole face is the hit area).
//   When on, a native range slider rises into the reserved bottom row above the
//   button, so the grid never reflows when a sound turns on.
// - The tile "breathes" with the sound's own loudness (layers.level), compressed
//   with a square root because raw levels differ a lot between recordings.
// - State is never colour alone: loading shows a spinner + "loading", failure a
//   red frame + "failed to load" + a retry button, muted is struck through.
// - The strip lists every sound in the mix in the order it was added, each with a
//   one-click mute (keeps its place and volume) and a remove, plus clear-all.
//
// buildSounds(R) → { el, render(), frame(now), destroy() }. R is the context from
// ui.js: dom helpers, the layer actions and the presets (see ui.js `soundsCtx`).
import { CATEGORIES, byGroup, layerOf } from "./catalog.js";
import { glyphSvg } from "./glyphs.js";
import { buildRail } from "./ui-rail.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pct = (v) => String(Math.round(v * 100));
const clock = (sec) => {
  sec = Math.max(0, Math.round(sec));
  const hh = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, ss = String(sec % 60).padStart(2, "0");
  return hh ? `${hh}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};
const STATE_TEXT = { failed: "failed", loading: "loading", muted: "muted" };

export function buildSounds(R) {
  const { h, icon } = R;
  const S = { tiles: new Map(), cat: null, chips: new Map(), stripKey: "", presetKey: "" };

  // ------------------------------------------------------------ rail + stage
  const PANEL = "nz-cat-panel";
  const rail = buildRail(R, {
    items: CATEGORIES.map((c) => ({ id: c.id, name: c.name, icon: c.icon })),
    active: R.cat(), label: "Sound categories", controls: PANEL,
    onSelect: (id) => R.setCat(id),
  });

  S.headIco = h("span", { class: "nz-cat__ico", "aria-hidden": "true" });
  S.headName = h("span", { class: "nz-cat__name" });
  S.headCount = h("span", { class: "nz-cat__count" });
  S.grid = h("div", { class: "nz-grid" });
  const head = h("h3", { class: "nz-cat" }, S.headIco, S.headName, h("span", { class: "nz-cat__rule", "aria-hidden": "true" }), S.headCount);

  // presets: a compact row under the grid
  S.presetRow = h("div", { class: "nz-chips" });
  S.saveInput = h("input", { type: "text", class: "nz-save__input", placeholder: "name this mix", maxlength: "24", "aria-label": "Preset name", spellcheck: "false", autocomplete: "off" });
  S.saveForm = h("form", { class: "nz-save", hidden: true }, S.saveInput, h("button", { type: "submit", class: "nz-chip nz-chip--go", text: "save" }));
  S.saveBtn = h("button", { type: "button", class: "nz-chip nz-chip--star", "aria-expanded": "false", "aria-label": "Save current mix as a preset" });
  S.saveBtn.innerHTML = `${icon("save")}<span>save</span>`;
  const closeSave = (refocus) => { S.saveForm.hidden = true; S.saveBtn.setAttribute("aria-expanded", "false"); if (refocus) S.saveBtn.focus(); };
  S.saveBtn.addEventListener("click", () => {
    const open = S.saveForm.hidden;
    S.saveForm.hidden = !open;
    S.saveBtn.setAttribute("aria-expanded", String(open));
    if (open) S.saveInput.focus();
  });
  S.saveForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const p = R.presets.save(S.saveInput.value);
    if (p) { S.saveInput.value = ""; closeSave(true); }
  });
  S.saveInput.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); closeSave(true); } });
  const presets = h("section", { class: "nz-presets", "aria-label": "Presets" },
    h("h3", { class: "nz-cat nz-cat--sub" }, h("span", { class: "nz-cat__name", text: "presets" }), h("span", { class: "nz-cat__rule", "aria-hidden": "true" })),
    S.presetRow, S.saveForm);

  S.stage = h("div", { class: "nz-stage", role: "tabpanel", id: PANEL }, head, S.grid, presets);

  // ------------------------------------------------------------ strip
  S.stripN = h("b", { class: "nz-strip__n" });
  S.stripList = h("ul", { class: "nz-strip__list", "aria-label": "Sounds in the mix" });
  S.stripEmpty = h("p", { class: "nz-strip__empty", text: "nothing in the mix yet · pick a sound or a preset" });
  S.clear = h("button", { type: "button", class: "nz-strip__clear", onclick: () => R.clear() });
  S.clear.innerHTML = `${icon("trash")}<span>clear</span>`;
  S.clear.setAttribute("aria-label", "Clear the mix");
  S.strip = h("section", { class: "nz-strip", "aria-label": "Now mixing" },
    h("span", { class: "nz-strip__lab" }, h("span", { text: "now mixing" }), S.stripN),
    S.stripList, S.stripEmpty, S.clear);

  const el = h("div", { class: "nz-sounds" }, h("div", { class: "nz-browse" }, rail.el, S.stage), S.strip);

  // ------------------------------------------------------------ tiles
  function buildTile(L) {
    const ico = h("span", { class: "nz-tile__ico", "aria-hidden": "true" });
    ico.innerHTML = glyphSvg(L.icon);
    const stateId = `nz-ts-${L.id}`;
    // aria-hidden: the text is read once, through the button's aria-describedby
    const stateTxt = h("span", { class: "nz-tile__state", id: stateId, "aria-hidden": "true" });
    const btn = h("button", { type: "button", class: "nz-tile__btn", "aria-pressed": "false", "aria-describedby": stateId, onclick: () => R.toggle(L.id) },
      ico, h("span", { class: "nz-tile__name", text: L.name }), stateTxt);
    if (L.desc) btn.title = L.desc;
    const num = h("span", { class: "nz-tile__pct", "aria-hidden": "true" });
    const spin = h("span", { class: "nz-tile__spin", "aria-hidden": "true" });
    const retry = h("button", { type: "button", class: "nz-tile__retry", hidden: true, "aria-label": `Retry ${L.name}`, text: "retry", onclick: () => R.retry(L.id) });
    const range = h("input", { type: "range", class: "nz-range", min: "1", max: "100", step: "1", "aria-label": `${L.name} volume` });
    range.addEventListener("input", () => {
      const v = clamp(+range.value / 100, 0.01, 1);
      range.style.setProperty("--v", v.toFixed(3));
      range.setAttribute("aria-valuetext", `${pct(v)} percent`);
      num.textContent = pct(v);
      R.setVol(L.id, v);
    });
    const vol = h("div", { class: "nz-tile__vol", hidden: true }, range); // starts hidden: no exit transition on build
    const streamed = R.progress(L.id) !== null;
    const pos = streamed ? h("span", { class: "nz-tile__pos", "aria-hidden": "true" }) : null;
    const tile = h("div", { class: "nz-tile" + (streamed ? " is-rec" : ""), "data-id": L.id, "data-state": "off" },
      btn, num, spin, retry, vol, pos, h("span", { class: "nz-tile__lv", "aria-hidden": "true" }));
    return { el: tile, btn, num, retry, range, vol, stateTxt, streamed, k: "", v: -1, lv: 0, posAt: -1, txt: "" };
  }

  function showCat(cat) {
    S.cat = cat;
    const c = CATEGORIES.find((x) => x.id === cat) || CATEGORIES[0];
    S.headIco.innerHTML = glyphSvg(c.icon);
    S.headName.textContent = c.name;
    S.tiles.clear();
    const kids = byGroup(c.id).map((L) => { const T = buildTile(L); S.tiles.set(L.id, T); return T.el; });
    S.grid.replaceChildren(...kids);
    S.stage.setAttribute("aria-labelledby", rail.tabId(c.id));
    S.stage.scrollTop = 0;
  }

  function tileState(id, act, muted) {
    const st = R.status(id);
    if (st === "failed") return "failed";
    if (id in act) return st === "loading" ? "loading" : "on";
    return muted.has(id) ? "muted" : "off";
  }

  function renderTiles(act, muted) {
    let on = 0;
    for (const [id, T] of S.tiles) {
      const k = tileState(id, act, muted), v = act[id] ?? muted.get(id) ?? 0;
      if (id in act) on++;
      if (k !== T.k) {
        T.k = k;
        T.el.dataset.state = k;
        T.btn.setAttribute("aria-pressed", String(k === "on" || k === "loading" || (k === "failed" && id in act)));
        T.retry.hidden = k !== "failed";
        T.vol.hidden = !(k === "on" || k === "loading");
        if (k !== "on" && T.lv) { T.lv = 0; T.el.style.setProperty("--lv", "0"); }
        T.posAt = -1;
      }
      const txt = STATE_TEXT[k] ?? (T.streamed && k === "on" ? T.txt : "");
      if (T.stateTxt.textContent !== txt) T.stateTxt.textContent = txt;
      if (v !== T.v) {
        T.v = v;
        T.num.textContent = k === "on" || k === "loading" ? pct(v) : "";
        if (document.activeElement !== T.range) {
          T.range.value = pct(Math.max(0.01, v));
          T.range.style.setProperty("--v", v.toFixed(3));
          T.range.setAttribute("aria-valuetext", `${pct(v)} percent`);
        }
      } else if (k !== "on" && k !== "loading" && T.num.textContent) T.num.textContent = "";
      else if ((k === "on" || k === "loading") && !T.num.textContent) T.num.textContent = pct(v);
    }
    const total = S.tiles.size;
    S.headCount.textContent = on ? `${on} of ${total} on` : `${total} sounds`;
    S.headCount.dataset.on = String(on > 0);
  }

  // ------------------------------------------------------------ strip
  function buildChip(id) {
    const L = layerOf(id);
    const ico = h("span", { class: "nz-mix__ico", "aria-hidden": "true" });
    ico.innerHTML = glyphSvg(L?.icon ?? id);
    const meter = h("span", { class: "nz-mix__lv", "aria-hidden": "true" }, h("i"), h("i"), h("i"));
    const flag = h("span", { class: "nz-mix__flag", "aria-hidden": "true" }); // "!" failed · "…" loading: a mark, not only a colour
    const mute = h("button", { type: "button", class: "nz-mix__mute", "aria-pressed": "false", "aria-label": `Mute ${L?.name ?? id}`, onclick: () => (R.muted().has(id) ? R.unmute(id) : R.mute(id)) },
      ico, h("span", { class: "nz-mix__name", text: L?.name ?? id }), flag, meter);
    const x = h("button", { type: "button", class: "nz-mix__x", "aria-label": `Remove ${L?.name ?? id}`, onclick: () => R.remove(id) });
    x.innerHTML = icon("close");
    const li = h("li", { class: "nz-mix", "data-id": id }, mute, x);
    return { li, mute, flag, name: L?.name ?? id, k: "", lv: 0 };
  }

  function renderStrip(act, muted) {
    const ids = R.order();
    const key = ids.join("|");
    if (key !== S.stripKey) {
      S.stripKey = key;
      const focused = document.activeElement;
      const fid = S.stripList.contains(focused) ? focused.closest(".nz-mix")?.dataset.id : null;
      const fx = focused?.classList?.contains("nz-mix__x");
      const next = new Map();
      for (const id of ids) next.set(id, S.chips.get(id) || buildChip(id));
      S.chips = next;
      S.stripList.replaceChildren(...[...next.values()].map((C) => C.li));
      if (fid) { // keep focus in the strip when a chip goes away
        const C = next.get(fid);
        if (C) (fx ? C.li.querySelector(".nz-mix__x") : C.mute).focus();
        else (next.size ? [...next.values()].at(-1).mute : S.clear.hidden ? null : S.clear)?.focus?.();
      }
    }
    for (const [id, C] of S.chips) {
      const k = R.status(id) === "failed" ? "failed" : muted.has(id) ? "muted" : id in act ? (R.status(id) === "loading" ? "loading" : "on") : "off";
      if (k === C.k) continue;
      C.k = k;
      C.li.dataset.state = k;
      C.mute.setAttribute("aria-pressed", String(k === "muted"));
      C.flag.textContent = k === "failed" ? "!" : k === "loading" ? "…" : "";
      C.mute.setAttribute("aria-label", k === "failed" ? `Mute ${C.name}, failed to load` : k === "loading" ? `Mute ${C.name}, loading` : `Mute ${C.name}`);
      if (k !== "on" && C.lv) { C.lv = 0; C.li.style.setProperty("--lv", "0"); }
    }
    const n = ids.length;
    S.stripN.textContent = n ? String(n) : "";
    S.strip.dataset.empty = String(!n);
    S.stripEmpty.hidden = n > 0;
    S.clear.hidden = n === 0;
  }

  // ------------------------------------------------------------ presets
  function renderPresets() {
    const all = R.presets.all(), cur = R.presets.active();
    const key = all.map((p) => p.id).join("|") + "#" + cur;
    if (S.presetKey === key) return;
    S.presetKey = key;
    const fid = document.activeElement?.dataset?.preset;
    S.presetRow.replaceChildren(...all.map((p) => h("button", {
      type: "button", class: "nz-chip" + (p.user ? " is-user" : ""), "data-preset": p.id,
      "aria-pressed": String(cur === p.id), title: R.presets.describe(p), onclick: () => R.presets.apply(p.id),
    }, p.name)), S.saveBtn);
    if (fid) S.presetRow.querySelector(`[data-preset="${CSS.escape(fid)}"]`)?.focus();
  }

  // ------------------------------------------------------------ render + frame
  function render() {
    const act = R.act(), muted = R.muted();
    const cat = R.cat();
    if (cat !== S.cat) showCat(cat);
    const counts = {};
    for (const id of Object.keys(act)) { const g = layerOf(id)?.group; if (g) counts[g] = (counts[g] || 0) + 1; }
    rail.update({ active: cat, counts });
    renderTiles(act, muted);
    renderStrip(act, muted);
    renderPresets();
  }

  // level glow on the shared rAF; streamed-recording progress at 2 Hz
  let lastPos = 0;
  function frame(now, plain) {
    for (const [id, T] of S.tiles) {
      if (T.k !== "on") continue;
      const lv = plain ? 0.55 : clamp(Math.sqrt(R.level(id)) * 1.25, 0, 1);
      if (Math.abs(lv - T.lv) > 0.008) { T.lv = lv; T.el.style.setProperty("--lv", lv.toFixed(3)); }
    }
    for (const [id, C] of S.chips) {
      if (C.k !== "on") continue;
      const lv = plain ? 0.5 : clamp(Math.sqrt(R.level(id)) * 1.25, 0, 1);
      if (Math.abs(lv - C.lv) > 0.02) { C.lv = lv; C.li.style.setProperty("--lv", lv.toFixed(3)); }
    }
    if (now - lastPos > 500) { lastPos = now; paintProgress(); }
  }

  function paintProgress() {
    for (const [id, T] of S.tiles) {
      if (!T.streamed) continue;
      const p = R.progress(id);
      if (!p || !p.dur || T.k !== "on") { if (T.posAt !== 0) { T.posAt = 0; T.el.style.setProperty("--pos", "0"); T.txt = ""; } continue; }
      const at = Math.floor(p.t);
      if (at === T.posAt) continue;
      T.posAt = at;
      T.el.style.setProperty("--pos", (p.t / p.dur).toFixed(4));
      T.txt = `${clock(p.dur - p.t)} left`;
      if (T.k === "on") T.stateTxt.textContent = T.txt;
    }
  }

  render();
  return { el, render, frame, destroy() { rail.destroy(); } };
}
