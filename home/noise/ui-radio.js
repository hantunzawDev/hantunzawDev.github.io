// noise.app "radio" tab: the same rail-and-tiles layout as the sounds tab, with the
// six vibes as categories (Myanmar first) and one tile per station.
//
// - A tile is a real <button aria-pressed>; the whole face tunes in, a playing station
//   stops on press, an offline one retries (retry also has its own visible button).
// - State is real text, never colour alone: "tap to tune in" · "tuning in…" with a
//   spinner · "on air" (+ "♪ artist – title" for SomaFM) · "playing direct · no viz"
//   when the stream could not be analysed · "offline · retry" · "paused".
// - The playing tile breathes with the master level on the shared rAF in ui.js
//   (frame()); there is no loop of its own and no scope canvas.
//
// buildRadio(R) → { el, render(), frame(now, plain), destroy() }. R comes from ui.js
// (see `radioCtx`): dom helper, the vibe selection and the radio actions.
import { STATIONS, VIBES } from "./stations.js";
import { glyphSvg } from "./glyphs.js";
import { buildRail } from "./ui-rail.js";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function buildRadio(R) {
  const { h } = R;
  const S = { tiles: new Map(), vibe: null };
  const byVibe = (v) => STATIONS.filter((s) => s.vibe === v);

  // ------------------------------------------------------------ rail + stage
  const PANEL = "nz-vibe-panel";
  const rail = buildRail(R, {
    items: VIBES.map((v) => ({ id: v, name: v, icon: `vibe-${v}` })),
    active: R.vibe(), label: "Radio vibes", controls: PANEL,
    onSelect: (id) => R.setVibe(id),
  });

  S.headIco = h("span", { class: "nz-cat__ico", "aria-hidden": "true" });
  S.headName = h("span", { class: "nz-cat__name" });
  S.headCount = h("span", { class: "nz-cat__count" });
  S.grid = h("div", { class: "nz-grid nz-grid--st" });
  const head = h("h3", { class: "nz-cat" }, S.headIco, S.headName, h("span", { class: "nz-cat__rule", "aria-hidden": "true" }), S.headCount);
  const hint = h("p", { class: "nz-hint", text: "internet radio · streams may drop · press a playing station to turn it off" });
  S.stage = h("div", { class: "nz-stage", role: "tabpanel", id: PANEL }, head, S.grid, hint);
  const el = h("div", { class: "nz-sounds" }, h("div", { class: "nz-browse" }, rail.el, S.stage));

  // ------------------------------------------------------------ tiles
  function buildTile(st) {
    const ico = h("span", { class: "nz-tile__ico", "aria-hidden": "true" });
    ico.innerHTML = glyphSvg(`vibe-${st.vibe}`);
    const sid = `nz-rs-${st.id}`, nid = `nz-rn-${st.id}`;
    // both lines are aria-hidden (read once, via aria-describedby on the button)
    const stateTxt = h("span", { class: "nz-tile__state", id: sid, "aria-hidden": "true" });
    const npTxt = h("span", { class: "nz-tile__np", id: nid, "aria-hidden": "true" });
    const btn = h("button", { type: "button", class: "nz-tile__btn", title: st.name, "aria-pressed": "false", "aria-describedby": `${sid} ${nid}`, onclick: () => R.click(st.id) },
      ico, h("span", { class: "nz-tile__name", text: st.name }), h("span", { class: "nz-tile__foot" }, stateTxt, npTxt));
    const spin = h("span", { class: "nz-tile__spin", "aria-hidden": "true" });
    const retry = h("button", { type: "button", class: "nz-tile__retry", hidden: true, "aria-label": `Retry ${st.name}`, text: "retry", onclick: () => R.click(st.id) });
    const tile = h("div", { class: "nz-tile nz-tile--st", "data-id": st.id, "data-state": "off" },
      btn, spin, retry, h("span", { class: "nz-tile__lv", "aria-hidden": "true" }));
    return { el: tile, btn, retry, stateTxt, npTxt, k: "", lv: 0, txt: "", np: "" };
  }

  function showVibe(v) {
    S.vibe = v;
    S.headIco.innerHTML = glyphSvg(`vibe-${v}`);
    S.headName.textContent = v;
    S.tiles.clear();
    S.grid.replaceChildren(...byVibe(v).map((st) => { const T = buildTile(st); S.tiles.set(st.id, T); return T.el; }));
    S.stage.setAttribute("aria-labelledby", rail.tabId(v));
    S.stage.scrollTop = 0;
  }

  // one tile's state from the radio engine: [data-state, status line, now-playing line]
  function tileView(st, cur) {
    if (cur !== st.id) return ["off", "tap to tune in", ""];
    const s = R.status();
    if (s === "error") return ["failed", "offline · retry", ""];
    if (s === "loading" || R.engineState() === "loading") return ["loading", "tuning in…", ""];
    if (R.engineState() === "paused") return ["paused", "paused", ""];
    const np = st.soma ? R.nowPlaying(st) : "";
    return ["on", R.analysed() ? "on air" : "playing direct · no viz", np ? `♪ ${np}` : ""];
  }

  function render() {
    const v = R.vibe(), cur = R.current();
    if (v !== S.vibe) showVibe(v);
    const curVibe = STATIONS.find((s) => s.id === cur)?.vibe;
    rail.update({ active: v, counts: curVibe ? { [curVibe]: 1 } : {} });
    for (const [id, T] of S.tiles) {
      const st = STATIONS.find((s) => s.id === id);
      const [k, txt, np] = tileView(st, cur);
      if (k !== T.k) {
        T.k = k;
        T.el.dataset.state = k;
        T.btn.setAttribute("aria-pressed", String(k !== "off"));
        T.retry.hidden = k !== "failed";
        if (k !== "on" && T.lv) { T.lv = 0; T.el.style.setProperty("--lv", "0"); }
      }
      if (txt !== T.txt) { T.txt = txt; T.stateTxt.textContent = txt; }
      if (np !== T.np) { T.np = np; T.npTxt.textContent = np; }
    }
    const on = cur && S.tiles.has(cur);
    S.headCount.textContent = on ? "on air" : `${S.tiles.size} stations`;
    S.headCount.dataset.on = String(!!on);
  }

  // the playing tile breathes with the master level (shared rAF; no loop here)
  function frame(now, plain) {
    for (const T of S.tiles.values()) {
      if (T.k !== "on") continue;
      const lv = plain || !R.analysed() ? 0.5 : clamp(R.level() * 1.5, 0, 1);
      if (Math.abs(lv - T.lv) > 0.01) { T.lv = lv; T.el.style.setProperty("--lv", lv.toFixed(3)); }
    }
  }

  render();
  return { el, render, frame, destroy() { rail.destroy(); } };
}
