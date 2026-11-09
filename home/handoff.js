// Runs before first paint: when arriving from the hzsh terminal, hide the desktop
// so the CRT power-on starts from black instead of flashing the windows first.
// os.js removes the class when boot finishes; the timeout is a failsafe if it never does.
if (/[?&]via=hzsh\b/.test(location.search) && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document.documentElement.classList.add("handoff");
  setTimeout(() => document.documentElement.classList.remove("handoff"), 8000);
}
