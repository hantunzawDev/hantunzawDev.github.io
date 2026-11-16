// A generic category rail for noise.app: a vertical list of tabs (icon, name and
// a count badge) that becomes a horizontal scroller when the window is narrow
// (container query in os.css). Used by the sounds tab and, later, the radio vibes,
// so nothing here knows about sounds.
//
// Semantics: role="tablist" + role="tab". Picking a category swaps the content of
// one panel next to it, which is what tabs are for (a radiogroup would announce a
// form value). Activation is automatic (arrows select as they move) because the
// swap is instant and cheap. Roving tabindex: only the selected tab is in the tab
// order; ↑↓ / ←→ step (wrapping), Home / End jump. aria-orientation follows the
// layout the CSS actually chose.
import { glyphSvg } from "./glyphs.js";

let uid = 0;

export function buildRail(R, { items, active, label, onSelect, controls = null }) {
  const { h } = R;
  const key = `nz-rail${++uid}`;
  const el = h("div", { class: "nz-rail", role: "tablist", "aria-label": label, "aria-orientation": "vertical" });
  const tabs = new Map();
  let cur = null;

  for (const it of items) {
    const ico = h("span", { class: "nz-rail__ico", "aria-hidden": "true" });
    ico.innerHTML = glyphSvg(it.icon);
    const badge = h("span", { class: "nz-rail__n", "aria-hidden": "true" });
    const sr = h("span", { class: "sr-only" });
    const b = h("button", {
      type: "button", role: "tab", id: `${key}-${it.id}`, class: "nz-rail__tab", "data-id": it.id,
      "aria-selected": "false", "aria-controls": controls, tabindex: "-1",
      onclick: () => pick(it.id, false),
    }, ico, h("span", { class: "nz-rail__name", text: it.name }), badge, sr);
    tabs.set(it.id, { b, badge, sr, n: -1 });
    el.append(b);
  }
  const ids = [...tabs.keys()];

  function pick(id, focus) {
    if (!tabs.has(id)) return;
    if (focus) tabs.get(id).b.focus({ preventScroll: true });
    if (id !== cur) onSelect(id);
  }

  el.addEventListener("keydown", (e) => {
    const i = ids.indexOf(document.activeElement?.dataset?.id ?? cur);
    const n = ids.length;
    const j = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: n - 1 }[e.key];
    if (j === undefined || e.altKey || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    pick(ids[(j + n) % n], true);
  });

  // keep the selected tab inside the rail's own scrollport (never scroll the page)
  function reveal(b) {
    const horiz = el.scrollWidth > el.clientWidth + 1;
    const pad = 12;
    if (horiz) {
      const a = b.offsetLeft - pad, z = b.offsetLeft + b.offsetWidth + pad;
      if (a < el.scrollLeft) el.scrollLeft = a;
      else if (z > el.scrollLeft + el.clientWidth) el.scrollLeft = z - el.clientWidth;
    } else if (el.scrollHeight > el.clientHeight + 1) {
      const a = b.offsetTop - pad, z = b.offsetTop + b.offsetHeight + pad;
      if (a < el.scrollTop) el.scrollTop = a;
      else if (z > el.scrollTop + el.clientHeight) el.scrollTop = z - el.clientHeight;
    }
  }

  function update({ active: a = cur, counts = {} } = {}) {
    const changed = a !== cur;
    cur = a;
    for (const [id, T] of tabs) {
      const on = id === cur;
      T.b.setAttribute("aria-selected", String(on));
      T.b.tabIndex = on ? 0 : -1;
      const n = counts[id] || 0;
      if (n !== T.n) {
        T.n = n;
        T.badge.textContent = n ? String(n) : "";
        T.badge.dataset.on = String(n > 0);
        T.sr.textContent = n ? `, ${n} on` : "";
      }
    }
    if (changed && tabs.has(cur)) reveal(tabs.get(cur).b);
  }

  // the stylesheet flips the rail to a row in narrow windows; mirror that for AT
  const ro = new ResizeObserver(() => {
    const row = getComputedStyle(el).flexDirection.startsWith("row");
    el.setAttribute("aria-orientation", row ? "horizontal" : "vertical");
    if (tabs.has(cur)) reveal(tabs.get(cur).b);
  });
  ro.observe(el);

  update({ active });
  return {
    el, update,
    tabId: (id) => tabs.get(id)?.b.id ?? null,
    destroy() { ro.disconnect(); },
  };
}
