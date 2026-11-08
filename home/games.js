// game.exe: snake and a typing test. Each game mounts into a container and
// returns { stop } so the window can tear it down when closed or swapped.
import { store, QUOTES } from "./data.js";

const css = (name) => getComputedStyle(document.body).getPropertyValue(name).trim();
const h = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) if (k != null) n.append(k);
  return n;
};

/* ---------------- snake ---------------- */
export function snake(root, { setMeta, log }) {
  const N = 22; // grid cells per side
  const canvas = h("canvas", { tabIndex: 0, ariaLabel: "Snake game. Arrow keys or WASD to move, space to pause." });
  const hud = h("p", { className: "game__hud" });
  const board = h("div", { className: "game__board" }, canvas);
  root.replaceChildren(hud, board);
  const ctx = canvas.getContext("2d");
  let best = store.get("snake.best", 0);
  let s, dir, next, food, score, alive, paused, timer;

  function reset() {
    s = [{ x: 8, y: 11 }, { x: 7, y: 11 }, { x: 6, y: 11 }];
    dir = { x: 1, y: 0 }; next = dir; score = 0; alive = true; paused = false;
    placeFood(); loop();
  }
  function placeFood() {
    do food = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) };
    while (s.some((p) => p.x === food.x && p.y === food.y));
  }
  const speed = () => Math.max(55, 130 - score * 3);
  function loop() { clearTimeout(timer); timer = setTimeout(step, speed()); }
  function step() {
    if (!alive) return;
    if (paused || document.hidden) return loop();
    dir = next;
    const head = { x: (s[0].x + dir.x + N) % N, y: (s[0].y + dir.y + N) % N };
    if (s.some((p) => p.x === head.x && p.y === head.y)) return die();
    s.unshift(head);
    if (head.x === food.x && head.y === food.y) { score++; placeFood(); } else s.pop();
    draw(); loop();
  }
  function die() {
    alive = false;
    if (score > best) { best = score; store.set("snake.best", best); log?.(`snake: new best ${best}!`, "ok"); }
    draw();
  }
  function draw() {
    const px = Math.max(120, Math.floor(Math.min(board.clientWidth, board.clientHeight)));
    canvas.style.width = canvas.style.height = `${px}px`;
    const size = Math.floor(px * devicePixelRatio);
    if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
    const c = size / N;
    ctx.fillStyle = css("--win"); ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = css("--line");
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) ctx.fillRect(i * c + c / 2 - 1, j * c + c / 2 - 1, 2, 2);
    ctx.fillStyle = css("--amber");
    ctx.fillRect(food.x * c + 2, food.y * c + 2, c - 4, c - 4);
    ctx.fillStyle = css("--lime");
    s.forEach((p, i) => { ctx.globalAlpha = i ? 0.85 : 1; ctx.fillRect(p.x * c + 1, p.y * c + 1, c - 2, c - 2); });
    ctx.globalAlpha = 1;
    if (!alive || paused) {
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, size / 2 - c * 2, size, c * 4);
      ctx.fillStyle = css("--text"); ctx.font = `${Math.round(c * 0.9)}px "Martian Mono", monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(alive ? "paused · space" : "game over · space", size / 2, size / 2);
    }
    hud.replaceChildren(h("span", {}, "score ", h("b", { textContent: score })), h("span", {}, "best ", h("b", { textContent: best })), h("span", { className: "dim", textContent: "arrows/wasd · space" }));
    setMeta?.(`${score}`);
  }
  const KEYS = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] };
  function onKey(e) {
    if (document.activeElement !== canvas) return;
    if (e.key === " ") { e.preventDefault(); if (!alive) reset(); else { paused = !paused; draw(); } return; }
    const k = KEYS[e.key] || KEYS[e.key.toLowerCase()];
    if (!k) return;
    e.preventDefault();
    if (k[0] !== -dir.x || k[1] !== -dir.y) next = { x: k[0], y: k[1] };
  }
  // swipe on touch screens
  let t0 = null;
  canvas.addEventListener("pointerdown", (e) => { canvas.focus(); t0 = { x: e.clientX, y: e.clientY }; if (!alive) reset(); });
  canvas.addEventListener("pointerup", (e) => {
    if (!t0) return;
    const dx = e.clientX - t0.x, dy = e.clientY - t0.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) {
      const k = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
      if (k[0] !== -dir.x || k[1] !== -dir.y) next = { x: k[0], y: k[1] };
    }
    t0 = null;
  });
  addEventListener("keydown", onKey);
  const ro = new ResizeObserver(() => draw());
  ro.observe(board);
  reset();
  canvas.focus();
  return { stop() { clearTimeout(timer); removeEventListener("keydown", onKey); ro.disconnect(); } };
}

/* ---------------- typing test ---------------- */
export function typer(root, { setMeta, log }) {
  const [text, by] = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  const target = text;
  const textEl = h("p", { className: "typer__text" });
  const input = h("input", { type: "text", spellcheck: false, autocomplete: "off", ariaLabel: "Type the quote", placeholder: "start typing…" });
  input.setAttribute("autocapitalize", "off");
  const hud = h("p", { className: "game__hud" });
  root.replaceChildren(hud, textEl, input, h("p", { className: "dim", textContent: `  -- ${by} · esc: new quote` }));
  root.classList.add("typer");
  let start = 0, done = false, iv = 0;
  const best = store.get("typer.best", 0);

  function render() {
    const typed = input.value;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < target.length; i++) {
      const cls = i < typed.length ? (typed[i] === target[i] ? "ok" : "bad") : i === typed.length ? "cur" : "";
      frag.append(h("span", { className: cls, textContent: target[i] }));
    }
    textEl.replaceChildren(frag);
    const mins = start ? (Date.now() - start) / 60000 : 0;
    const correct = [...typed].filter((c, i) => c === target[i]).length;
    const wpm = mins > 0 ? Math.round(correct / 5 / mins) : 0;
    const acc = typed.length ? Math.round((correct / typed.length) * 100) : 100;
    hud.replaceChildren(h("span", {}, "wpm ", h("b", { textContent: wpm })), h("span", {}, "acc ", h("b", { textContent: `${acc}%` })), h("span", {}, "best ", h("b", { textContent: Math.max(best, store.get("typer.best", 0)) })));
    setMeta?.(`${wpm} wpm`);
    if (!done && typed.length >= target.length) {
      done = true; clearInterval(iv); input.disabled = true;
      if (wpm > store.get("typer.best", 0) && acc >= 90) { store.set("typer.best", wpm); log?.(`type: new best ${wpm} wpm!`, "ok"); }
      else log?.(`type: ${wpm} wpm at ${acc}% accuracy.`, "ok");
    }
  }
  input.addEventListener("input", () => {
    if (!start) { start = Date.now(); iv = setInterval(render, 500); }
    render();
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); clearInterval(iv); typer(root, { setMeta, log }); } });
  render();
  input.focus();
  return { stop() { clearInterval(iv); root.classList.remove("typer"); } };
}
