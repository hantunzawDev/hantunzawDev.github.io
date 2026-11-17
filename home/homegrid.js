/*
 * homegrid.js: the home screen as a 3×3 grid of zones, like a phone home screen.
 * Widgets (the clock and a few small read-outs) each sit in one zone, can be turned a quarter turn
 * at a time, and can be resized. The command bar is not a widget: it stays horizontal, under the
 * middle zone's widgets. Owns placement and the settings UI; os.js feeds the widgets their data.
 */
import { DEFAULT_WIDGETS } from "./data.js";

export const ZONES = ["tl", "tc", "tr", "ml", "c", "mr", "bl", "bc", "br"];
export const ROTS = [0, 90, 180, 270];
export const ALIGNS = ["auto", "start", "center", "end"];
const ZONE_NAME = { tl: "top left", tc: "top", tr: "top right", ml: "left", c: "middle", mr: "right", bl: "bottom left", bc: "bottom", br: "bottom right" };
const LABEL = { clock: "clock", todo: "todo", weather: "weather", quote: "quote", focus: "focus timer" };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Saved layout → a complete, valid one. Unknown widgets and bad values fall back to the defaults. */
export function normalize(raw) {
  const out = {};
  for (const [id, d] of Object.entries(DEFAULT_WIDGETS)) {
    const r = raw && typeof raw === "object" ? raw[id] : null;
    out[id] = {
      on: id === "clock" ? true : typeof r?.on === "boolean" ? r.on : d.on,
      z: ZONES.includes(r?.z) ? r.z : d.z,
      rot: ROTS.includes(r?.rot) ? r.rot : d.rot,
      size: Number.isFinite(+r?.size) && r?.size !== null ? clamp(+r.size, 0.5, 1.5) : d.size,
      ta: ALIGNS.includes(r?.ta) ? r.ta : d.ta, // title and subtitle align along the widget's own reading direction
      sa: ALIGNS.includes(r?.sa) ? r.sa : d.sa,
    };
  }
  return out;
}

export function createHomeGrid({ stage, settings, save, onPlace = () => {} }) {
  const $ = (s, r = stage) => r.querySelector(s);
  const zoneList = (z) => $(`.hz[data-z="${z}"] .hz__list`);
  const els = Object.fromEntries(Object.keys(DEFAULT_WIDGETS).map((id) => [id, $(`.hw[data-w="${id}"]`)]));
  const layout = () => (settings.homeW = normalize(settings.homeW));

  /** Move every widget into its zone, apply its turn and size, and show only the zones that hold something. */
  function place() {
    const L = layout();
    for (const z of ZONES) zoneList(z).replaceChildren();
    for (const id of Object.keys(DEFAULT_WIDGETS)) {
      const el = els[id], c = L[id];
      el.hidden = !c.on;
      if (!c.on) { $("#hw-tray").append(el); continue; }
      el.dataset.rot = String(c.rot);
      el.dataset.ta = c.ta;
      el.dataset.sa = c.sa;
      el.style.setProperty("--hw-s", String(c.size)); // the subtitle and body text follow the slider too
      // away from the middle a widget starts smaller, so a corner clock is not a second headline
      el.style.setProperty("--hw-k", String((c.z === "c" ? 1 : 0.4) * c.size));
      zoneList(c.z).append(el);
    }
    for (const z of ZONES) $(`.hz[data-z="${z}"]`).dataset.empty = String(z !== "c" && !zoneList(z).children.length);
    onPlace();
  }
  function patch(id, change) {
    const L = layout(); // one copy: layout() re-normalizes into settings each call
    L[id] = { ...L[id], ...change };
    save();
    place();
  }
  function reset() {
    settings.homeW = normalize(null);
    save();
    place();
  }

  // ---- settings UI: one row per widget: on/off, a 3×3 position picker, a turn, a size
  function buildConfig(root) {
    const L = layout();
    root.replaceChildren();
    for (const id of Object.keys(DEFAULT_WIDGETS)) {
      const c = L[id];
      const row = document.createElement("fieldset");
      row.className = "hwrow";
      row.dataset.w = id;
      const head = id === "clock"
        ? `<legend class="hwrow__name">${LABEL[id]}</legend>`
        : `<legend class="sr-only">${LABEL[id]}</legend><label class="toggle hwrow__name"><input type="checkbox" data-k="on"${c.on ? " checked" : ""}><span class="toggle__ui"></span><span>${LABEL[id]}</span></label>`;
      const zones = ZONES.map((z) => `<label class="zonepick__cell" title="${ZONE_NAME[z]}"><input type="radio" name="hw-${id}-z" value="${z}" data-k="z"${c.z === z ? " checked" : ""}><span><b class="sr-only">${ZONE_NAME[z]}</b></span></label>`).join("");
      const aligns = (key, name) => ALIGNS.map((a) => `<label><input type="radio" name="hw-${id}-${key}" value="${a}" data-k="${key}"${c[key] === a ? " checked" : ""}><span>${a === "center" ? "centre" : a}</span></label>`).join("");
      const rots = ROTS.map((r) => `<label><input type="radio" name="hw-${id}-rot" value="${r}" data-k="rot"${c.rot === r ? " checked" : ""}><span>${r}°</span></label>`).join("");
      row.innerHTML = `${head}
        <div class="hwrow__body"${c.on ? "" : " hidden"}>
          <div class="field"><span class="field__label">position</span><div class="zonepick" role="radiogroup" aria-label="${LABEL[id]} position">${zones}</div></div>
          <div class="field"><span class="field__label">turn</span><div class="seg" role="radiogroup" aria-label="${LABEL[id]} rotation">${rots}</div></div>
          <div class="field"><span class="field__label">title align</span><div class="seg" role="radiogroup" aria-label="${LABEL[id]} title alignment">${aligns("ta")}</div></div>
          <div class="field"><span class="field__label">subtitle align</span><div class="seg" role="radiogroup" aria-label="${LABEL[id]} subtitle alignment">${aligns("sa")}</div></div>
          <div class="field"><label for="hw-${id}-size">size</label><div class="range"><input id="hw-${id}-size" type="range" min="50" max="150" step="10" value="${Math.round(c.size * 100)}" data-k="size"><output for="hw-${id}-size">${Math.round(c.size * 100)}%</output></div></div>
        </div>`;
      root.append(row);
      const size = row.querySelector('[data-k="size"]');
      size.style.setProperty("--p", `${((size.value - 50) / 100) * 100}%`);
    }
    const reset$ = document.createElement("button");
    reset$.type = "button";
    reset$.className = "key key--ghost";
    reset$.textContent = "reset layout";
    reset$.addEventListener("click", () => { reset(); buildConfig(root); });
    root.append(reset$);
  }
  // delegated on the root, so it keeps working while the pane is floated over home
  function bindConfig(root) {
    const handle = (e) => {
      const t = e.target, row = t.closest?.(".hwrow"), k = t.dataset?.k;
      if (!row || !k) return;
      const id = row.dataset.w;
      if (k === "on") { patch(id, { on: t.checked }); row.querySelector(".hwrow__body").hidden = !t.checked; }
      else if (k === "z") patch(id, { z: t.value });
      else if (k === "rot") patch(id, { rot: +t.value });
      else if (k === "ta" || k === "sa") patch(id, { [k]: t.value });
      else if (k === "size") {
        const v = +t.value;
        t.nextElementSibling.textContent = `${v}%`;
        t.style.setProperty("--p", `${((v - 50) / 100) * 100}%`);
        patch(id, { size: v / 100 });
      }
    };
    root.addEventListener("change", handle);
    root.addEventListener("input", (e) => { if (e.target.dataset?.k === "size") handle(e); });
  }

  // ---- data for the read-only widgets, fed by os.js
  const text = (sel, v) => { const n = $(sel); if (n && n.textContent !== v) n.textContent = v; };
  return {
    place, buildConfig, bindConfig,
    todo(todos) {
      const open = todos.filter((t) => !t.done).slice(0, 4);
      const ul = $("#hw-todo");
      ul.replaceChildren(...(open.length ? open : [{ text: "nothing open" }]).map((t) => { const li = document.createElement("li"); li.textContent = t.text; return li; }));
    },
    weather(w) { text("#hw-wx-temp", `${Math.round(w.temp)}°`); text("#hw-wx-desc", `${w.place.name.toLowerCase()} · ${w.desc}`); },
    quote(q) { text("#hw-quote", q.text); text("#hw-quote-by", `-- ${q.by}`); },
    focus(time, mode, running) { text("#hw-focus-time", time); text("#hw-focus-mode", `${mode}${running ? "" : " · paused"}`); },
  };
}
