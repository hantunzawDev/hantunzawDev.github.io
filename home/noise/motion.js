// One place that answers "should JS-driven motion run?" for noise.app. The site's own
// motion setting (os.js puts body.motion-reduced / body.motion-full on <body>) wins;
// with it on "auto" we fall back to the OS prefers-reduced-motion query.
const MQ = matchMedia("(prefers-reduced-motion: reduce)");

export function reducedMotion() {
  const c = document.body.classList;
  if (c.contains("motion-reduced")) return true;
  if (c.contains("motion-full")) return false;
  return MQ.matches;
}

// fn() runs when either source changes; returns the unsubscribe function
export function onMotionChange(fn) {
  const mo = new MutationObserver((recs) => { if (recs.some((r) => r.attributeName === "class")) fn(); });
  mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  MQ.addEventListener("change", fn);
  return () => { mo.disconnect(); MQ.removeEventListener("change", fn); };
}
