// Runs before first paint. Until os.js has placed every window, the page shows a blank
// boot screen: without it the windows paint unpositioned, stacked in the top-left corner,
// for as long as the network takes to deliver gsap and the modules (long on a cold
// browser start, when hzOS is the home page). os.js lifts the cover once it's ready.
(function () {
  var root = document.documentElement;
  root.classList.add("preboot");
  // arriving from the hzsh terminal: CRT power-on starts from black
  if (/[?&]via=hzsh\b/.test(location.search) && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.classList.add("handoff");
  }
  // failsafe if os.js never runs: count only time the page is actually on screen
  var left = 6000;
  (function tick() {
    if (!root.classList.contains("preboot") && !root.classList.contains("handoff")) return;
    if (!document.hidden) left -= 500;
    if (left <= 0) { root.classList.remove("preboot", "handoff"); return; }
    setTimeout(tick, 500);
  })();
})();
