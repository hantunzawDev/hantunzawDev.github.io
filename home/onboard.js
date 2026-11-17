/*
 * onboard.js: first-visit hints for an empty desktop.
 * Shows a short welcome card and three elbow arrows (apps menu, mode switch, command line) while the
 * desktop is the current mode, no window is open, and the visitor has not dismissed it. Opening
 * any window counts as having found their way, so it is remembered as done. `tour` brings it back.
 */
const KEY = "onboard.desktop";

export function createOnboard({ root, store, windowsOpen, isDesktop, anchors, onApps, onHelp, reduce = () => false }) {
  const $ = (s) => root.querySelector(s);
  const tips = [...root.querySelectorAll(".ob__tip")];
  let forced = false; // `tour` shows it again even after it was dismissed
  let raf = 0;

  const eligible = () => isDesktop() && matchMedia("(min-width: 901px)").matches && (forced || (!store.get(KEY, false) && !windowsOpen()));

  /**
   * Each tip is a label with an elbow line to the thing it points at: out from the label sideways,
   * one right-angle bend, then along to a small arrowhead just short of the target.
   */
  const RUN = 56, RISE = 72, HEAD = 6, GAP = 8; // sideways run, vertical rise, arrowhead size, space before the target
  function layout() {
    const vw = innerWidth;
    for (const tip of tips) {
      const target = anchors[tip.dataset.t]?.(), path = root.querySelector(`.ob__lines path[data-t="${tip.dataset.t}"]`);
      if (!target) { tip.hidden = true; path.removeAttribute("d"); continue; }
      tip.hidden = false;
      const r = target.getBoundingClientRect(), cx = Math.round(r.left + r.width / 2), w = tip.offsetWidth, h = tip.offsetHeight;
      const up = tip.dataset.side === "up";
      // an arrow that points up leaves the label going away from it; one that points down, the other way
      let dir = tip.dataset.dir;
      if (dir === "right" && cx + RUN + w > vw - 12) dir = "left";
      if (dir === "left" && cx - RUN - w < 12) dir = "right";
      const cy = Math.round(up ? r.bottom + RISE : r.top - RISE), left = dir === "right" ? cx + RUN : cx - RUN - w;
      tip.style.left = `${left}px`;
      tip.style.top = `${cy - h / 2}px`;
      const sx = dir === "right" ? left - GAP : left + w + GAP, tipY = up ? r.bottom + GAP : r.top - GAP, s = up ? 1 : -1;
      path.setAttribute("d", `M${sx} ${cy}H${cx}V${tipY + s * HEAD}M${cx - HEAD} ${tipY + s * HEAD}L${cx} ${tipY}L${cx + HEAD} ${tipY + s * HEAD}`);
    }
  }
  function sync() {
    raf = 0;
    const on = eligible();
    if (on && root.hidden) {
      root.hidden = false;
      layout();
      if (!reduce()) root.classList.add("is-in");
    } else if (on) layout();
    else if (!on && !root.hidden) hide();
    // opening any window means they found their way: remember it
    if (!forced && isDesktop() && windowsOpen() && !store.get(KEY, false)) store.set(KEY, true);
  }
  function hide() { root.hidden = true; root.classList.remove("is-in"); }
  const queue = () => { if (!raf) raf = requestAnimationFrame(sync); };
  function dismiss() { forced = false; store.set(KEY, true); hide(); }

  $("#ob-done").addEventListener("click", dismiss);
  $("#ob-apps").addEventListener("click", () => { onApps(); });
  $("#ob-help").addEventListener("click", () => { onHelp(); dismiss(); });
  addEventListener("resize", queue);
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !root.hidden) dismiss(); });

  return {
    sync: queue,
    /** Show it again on request (the `tour` command). */
    show() { forced = true; queue(); },
  };
}
