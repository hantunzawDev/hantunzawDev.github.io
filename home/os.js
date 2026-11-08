// hzOS shell: window manager, modes, apps, command line.
import {
  store, settings, saveSettings, links, pad, dayKey, hhmm, hourLabel, ago, isoWeek, spark, bar,
  currentQuote, fetchWeather, FEEDS, fetchFeed, getJSON,
} from "./data.js";
import { createMap, subsolar } from "./map.js";
import { PACK_NAMES, ROTATIONS, parseLine, formatLine, contextLabel, slotKey } from "./quotes.js";
import { snake, typer } from "./games.js";
import { cowsay, neofetch, eightBall, HACK, TRAIN, matrix, calc } from "./fun.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) if (k != null && k !== false) n.append(k);
  return n;
};
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const small = () => matchMedia("(max-width: 900px)").matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const css = (name) => getComputedStyle(document.body).getPropertyValue(name).trim();
const VERSION = "2.7.0";
const bootedAt = Date.now();

/* =========================================================
   window manager: open/close, drag, resize, maximize
   ========================================================= */
const APPS = ["clock", "wx", "todo", "notes", "focus", "map", "fortune", "feed", "game", "config"];
const FILES = { clock: "clock.app", wx: "wx.sh", todo: "todo.txt", notes: "notes.md", focus: "focus.exe", map: "world.map", fortune: "fortune", feed: "feed.rss", game: "game.exe", config: "config.ini" };
const ALIAS = { world: "map", globe: "map", weather: "wx", settings: "config", news: "feed", quote: "fortune", timer: "focus" };
const appName = (a) => ALIAS[a] || a;
// default layout as fractions of the desktop: x, y, w, h
const DEFAULT_LAYOUT = {
  clock:   [0.012, 0.025, 0.30, 0.40],
  wx:      [0.322, 0.025, 0.19, 0.40],
  map:     [0.522, 0.025, 0.245, 0.40],
  feed:    [0.777, 0.025, 0.211, 0.95],
  todo:    [0.012, 0.455, 0.215, 0.52],
  notes:   [0.237, 0.455, 0.20, 0.52],
  focus:   [0.447, 0.455, 0.32, 0.25],
  fortune: [0.447, 0.725, 0.32, 0.25],
  game:    [0.30, 0.06, 0.40, 0.88],
  config:  [0.30, 0.10, 0.36, 0.78],
};
const MIN_W = 220, MIN_H = 130;
const layout = Object.assign({}, DEFAULT_LAYOUT, store.get("layout.v2", {}));
const closed = new Set(store.get("closed.v2", ["config", "game"]));
const desktop = $("#desktop");
const win = (app) => $(`.win[data-app="${app}"]`);
let zTop = 10;

function saveLayout() {
  store.set("layout.v2", Object.fromEntries(Object.entries(layout).filter(([k, v]) => v !== DEFAULT_LAYOUT[k])));
}
function applyLayout(app) {
  const el = win(app);
  if (small()) { el.style.cssText = ""; return; }
  const [x, y, w, hh] = layout[app];
  Object.assign(el.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${hh * 100}%` });
}
function front(app) {
  $$(".win.is-front").forEach((w) => w.classList.remove("is-front"));
  const el = win(app);
  el.classList.add("is-front");
  el.style.zIndex = ++zTop;
}
function openApp(app, { focus = true } = {}) {
  app = appName(app);
  if (!APPS.includes(app)) return false;
  if (document.body.dataset.mode !== "desktop") setMode("desktop");
  const el = win(app);
  const wasHidden = el.hidden;
  el.hidden = false;
  closed.delete(app);
  store.set("closed.v2", [...closed]);
  if (wasHidden && !reduce) { el.classList.remove("is-opening"); void el.offsetWidth; el.classList.add("is-opening"); }
  front(app);
  if (app === "config") fillConfig();
  if (focus) (el.querySelector("textarea, input, select") || el.querySelector(".win__ctrl button"))?.focus();
  renderDock();
  if (small()) el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  return true;
}
function closeApp(app) {
  app = appName(app);
  const el = win(app);
  if (!el) return false;
  el.hidden = true;
  el.classList.remove("is-max");
  closed.add(app);
  store.set("closed.v2", [...closed]);
  if (app === "game") stopGame();
  renderDock();
  return true;
}
function toggleMax(app) {
  app = appName(app);
  const el = win(app);
  if (!el || small()) return false;
  if (el.hidden) openApp(app);
  el.classList.toggle("is-max");
  front(app);
  return true;
}
function renderDock() {
  $("#dock").replaceChildren(...APPS.filter((a) => a !== "game").map((app) => {
    const b = h("button", { type: "button", textContent: app });
    b.setAttribute("aria-pressed", String(!win(app).hidden));
    b.addEventListener("click", () => (win(app).hidden || !win(app).classList.contains("is-front") ? openApp(app) : closeApp(app)));
    return b;
  }));
}

function pointerTrack(handle, el, onMove, onEnd) {
  handle.addEventListener("pointerdown", (e) => {
    if (small() || e.button !== 0 || e.target.closest("button") || el.classList.contains("is-max")) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const area = desktop.getBoundingClientRect();
    handle.setPointerCapture(e.pointerId);
    const move = (ev) => onMove(ev, e, rect, area);
    const up = () => {
      handle.removeEventListener("pointermove", move);
      onEnd(el.getBoundingClientRect(), area);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up, { once: true });
    handle.addEventListener("pointercancel", up, { once: true });
  });
}
function enableWindow(el) {
  const app = el.dataset.app;
  const bar = $(".win__bar", el);
  const grip = h("span", { className: "win__grip", title: "resize" });
  grip.setAttribute("aria-hidden", "true");
  el.append(grip);
  const commit = (r, area) => {
    layout[app] = [(r.left - area.left) / area.width, (r.top - area.top) / area.height, r.width / area.width, r.height / area.height];
    saveLayout();
  };
  // move by title bar
  pointerTrack(bar, el, (ev, e0, rect, area) => {
    el.classList.add("is-dragging");
    const x = Math.min(Math.max(ev.clientX - (e0.clientX - rect.left) - area.left, -rect.width + 80), area.width - 80);
    const y = Math.min(Math.max(ev.clientY - (e0.clientY - rect.top) - area.top, 0), area.height - 26);
    el.style.left = `${(x / area.width) * 100}%`;
    el.style.top = `${(y / area.height) * 100}%`;
  }, (r, area) => { el.classList.remove("is-dragging"); commit(r, area); });
  // resize by corner grip
  pointerTrack(grip, el, (ev, e0, rect, area) => {
    el.classList.add("is-resizing");
    const w = Math.min(Math.max(rect.width + ev.clientX - e0.clientX, MIN_W), area.right - rect.left);
    const hh = Math.min(Math.max(rect.height + ev.clientY - e0.clientY, MIN_H), area.bottom - rect.top);
    el.style.width = `${(w / area.width) * 100}%`;
    el.style.height = `${(hh / area.height) * 100}%`;
  }, (r, area) => { el.classList.remove("is-resizing"); commit(r, area); });
  bar.addEventListener("dblclick", (e) => { if (!e.target.closest("button")) toggleMax(app); });
  el.addEventListener("pointerdown", () => front(app));
  el.addEventListener("focusin", () => front(app));
  $$("[data-close]", el).forEach((b) => b.addEventListener("click", () => closeApp(app)));
}
function resetLayout() {
  store.del("layout.v2");
  Object.assign(layout, DEFAULT_LAYOUT);
  APPS.forEach((a) => { win(a).classList.remove("is-max"); applyLayout(a); });
}

/* =========================================================
   modes: desktop · focus · zen
   ========================================================= */
const MODES = ["desktop", "focus", "zen"];
function setMode(mode) {
  if (!MODES.includes(mode)) return false;
  document.body.dataset.mode = mode;
  store.set("mode", mode);
  $("#stage-focus").hidden = mode !== "focus";
  $("#stage-zen").hidden = mode !== "zen";
  $$(".menubar__modes button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.mode === mode)));
  if (mode === "focus") { renderStageTask(); $("#stage-focus [data-focus-start]").focus(); }
  if (mode === "zen") renderZen();
  if (mode !== "desktop" && !reduce && window.gsap && !document.hidden) {
    gsap.from(`#stage-${mode} > *`, { opacity: 0, y: 8, duration: 0.3, stagger: 0.05, ease: "power2.out", clearProps: "opacity,transform" });
  }
  return true;
}
$$(".menubar__modes button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
$$("[data-mode-go]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.modeGo)));

let stageTask = 0;
function renderStageTask() {
  const open = todos.filter((t) => !t.done);
  const el = $("#stage-task");
  if (!open.length) { el.textContent = "no open task. add one: t <task>"; return; }
  stageTask %= open.length;
  el.textContent = `working on: ${open[stageTask].text}`;
}
$("#stage-next-task").addEventListener("click", () => { stageTask++; renderStageTask(); });
function renderZen() {
  if (quote) $("#zen-quote").textContent = `${quote.text}  -- ${quote.by}`;
}

/* =========================================================
   clock.app + menubar
   ========================================================= */
let sun = null;
function greeting(hr) {
  if (hr < 5) return "still up";
  if (hr < 12) return "good morning";
  if (hr < 17) return "good afternoon";
  if (hr < 22) return "good evening";
  return "good night";
}
const fmtDay = (d) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(d).toLowerCase().replace(/,/g, "");
let lastMinute = -1;
let lastDay = dayKey();
function tick() {
  const now = new Date();
  $("#st-time").textContent = settings.h24 ? `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` : hhmm(now);
  $("#clock-s").textContent = pad(now.getSeconds());
  renderTimers();
  if (now.getMinutes() !== lastMinute) {
    lastMinute = now.getMinutes();
    const hrs = settings.h24 ? pad(now.getHours()) : String(now.getHours() % 12 || 12);
    const time = `${hrs}:${pad(now.getMinutes())}`;
    $("#clock").textContent = time;
    $("#zen-time").textContent = time;
    renderMapInfo();
    const slot = slotKey(settings.qRotation, now);
    if (slot && slot !== qSlot) { qSlot = slot; qSalt = 0; renderFortune(); }
    $("#clock").dateTime = now.toISOString();
    $("#hello").textContent = `${greeting(now.getHours())}, ${(settings.name || "friend").toLowerCase()}.`;
    const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5);
    const days = (new Date(now.getFullYear() + 1, 0, 1) - new Date(now.getFullYear(), 0, 1)) / 864e5;
    $("#clock-date").textContent = `${fmtDay(now)} · w${isoWeek(now)} · day ${doy}/${days}`;
    $("#zen-date").textContent = `${greeting(now.getHours())}, ${(settings.name || "friend").toLowerCase()} · ${fmtDay(now)}`;
    $("#st-date").textContent = fmtDay(now).split(" ").slice(0, 3).join(" ");
    const dayFrac = (now.getHours() * 60 + now.getMinutes()) / 1440;
    const yearFrac = doy / days;
    const lines = [
      `day  ${bar(dayFrac, 24)} <b>${Math.round(dayFrac * 100)}%</b>`,
      `year ${bar(yearFrac, 24)} <b>${Math.round(yearFrac * 100)}%</b>`,
    ];
    if (sun) {
      const toSet = sun.set - now, toRise = sun.rise - now;
      const fmtDur = (ms) => `${Math.floor(ms / 36e5)}h${pad(Math.floor((ms % 36e5) / 6e4))}m`;
      lines.push(`sun  ${hhmm(sun.rise)} ↑ ${hhmm(sun.set)} ↓ <b>${toRise > 0 ? `rises in ${fmtDur(toRise)}` : toSet > 0 ? `sets in ${fmtDur(toSet)}` : "down"}</b>`);
    }
    $("#clock-bars").innerHTML = lines.join("\n"); // only our own strings
    if (dayKey(now) !== lastDay) { lastDay = dayKey(now); renderFortune(); renderTodo(); renderFocusMeta(); }
  }
  setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
}

/* =========================================================
   wx.sh + world.map
   ========================================================= */
let worldMap = null;
async function loadWx(force = false) {
  const box = $("#wx");
  try {
    const w = await fetchWeather(force);
    sun = w.sun; lastMinute = -1;
    const temps = w.hourly.map((x) => x.temp);
    const rains = w.hourly.map((x) => x.rain);
    const hours = w.hourly.filter((_, i) => i % 6 === 0).map((x) => hourLabel(x.time).padEnd(6)).join("");
    const desc = h("span", { className: "wx__desc", textContent: `${w.desc}\nH${Math.round(w.max)}° L${Math.round(w.min)}°` });
    desc.style.whiteSpace = "pre";
    box.replaceChildren(
      h("p", { className: "prompt", textContent: `$ wx ${w.place.name.toLowerCase()}${w.stale ? " --offline" : ""}` }),
      h("div", { className: "wx__now" }, h("span", { className: "wx__temp", textContent: `${Math.round(w.temp)}°` }), desc),
      h("pre", { className: "wx__rows", innerHTML:
        `feels ${Math.round(w.feels)}° · hum ${Math.round(w.humidity)}% · wind ${Math.round(w.wind)}km/h\n` +
        `temp <b>${spark(temps)}</b> ${Math.round(Math.min(...temps))}-${Math.round(Math.max(...temps))}°\n` +
        `rain <b>${spark(rains, 0, 100)}</b> ${Math.max(...rains)}%\n` +
        `     ${hours}` }),
      h("p", { className: "wx__guess", textContent: `> ${w.guess}` }),
    );
    $("#st-wx").textContent = `wx:${Math.round(w.temp)}° ${w.rainy ? "rain" : w.desc.split(" ").pop()}`;
    worldMap?.setLocation(w.place.lat, w.place.lon);
    renderMapInfo(w);
    return w;
  } catch (err) {
    console.warn("wx", err);
    box.replaceChildren(h("p", { className: "prompt", textContent: "$ wx" }), h("p", { className: "dim", textContent: "error: weather unreachable. try `wx` again." }));
    return null;
  }
}

const fmtLat = (v) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? "N" : "S"}`;
const fmtLon = (v) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? "E" : "W"}`;
let lastPlace = null;
function renderMapInfo(w = lastPlace) {
  if (!w) return;
  lastPlace = w;
  const night = worldMap?.isNight(w.place.lat, w.place.lon);
  const s = subsolar();
  $("#map-info").replaceChildren(
    h("b", { textContent: `● ${w.place.name.toLowerCase()}` }), ` ${fmtLat(w.place.lat)} ${fmtLon(w.place.lon)} · ${night ? "night" : "day"} side\n`,
    `sun ↑${hhmm(w.sun.rise)} ↓${hhmm(w.sun.set)} · overhead at ${fmtLat(s.lat)} ${fmtLon(s.lon)}`,
  );
}

/* =========================================================
   todo.txt
   ========================================================= */
let todos = store.get("tasks", []);
function saveTodo() { store.set("tasks", todos); renderTodo(); }
function renderTodo() {
  const today = dayKey();
  todos = todos.filter((t) => !t.done || t.doneOn === today);
  const list = $("#todo");
  list.replaceChildren(...todos.map((t, i) => {
    const box = h("button", { type: "button", className: "box", textContent: t.done ? "[x]" : "[ ]" });
    box.setAttribute("role", "checkbox");
    box.setAttribute("aria-checked", String(!!t.done));
    box.setAttribute("aria-label", t.text);
    box.addEventListener("click", () => toggleTodo(i + 1));
    const rm = h("button", { type: "button", className: "rm", textContent: "rm" });
    rm.setAttribute("aria-label", `Remove ${t.text}`);
    rm.addEventListener("click", () => removeTodo(i + 1));
    return h("li", { className: t.done ? "done" : "" }, h("span", { className: "n", textContent: pad(i + 1) }), box, h("span", { className: "txt", textContent: t.text }), rm);
  }));
  if (!todos.length) list.append(h("li", { className: "dim", textContent: "empty. what's the one thing today?" }));
  const open = todos.filter((t) => !t.done).length;
  $("#todo-meta").textContent = todos.length ? `${open}/${todos.length} open` : "";
  if (document.body.dataset.mode === "focus") renderStageTask();
}
function addTodo(text) { todos.push({ id: Date.now(), text, done: false }); saveTodo(); }
function toggleTodo(n) { const t = todos[n - 1]; if (!t) return false; t.done = !t.done; t.doneOn = t.done ? dayKey() : null; saveTodo(); return t; }
function removeTodo(n) { const t = todos[n - 1]; if (!t) return false; todos.splice(n - 1, 1); saveTodo(); return t; }
$("#todo-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#todo-input").value.trim();
  if (v) { addTodo(v); $("#todo-input").value = ""; }
});

/* =========================================================
   notes.md
   ========================================================= */
const notesEl = $("#notes");
notesEl.value = store.get("notes", "");
let notesTimer = 0;
function notesMeta(saved = true) { $("#notes-meta").textContent = `${notesEl.value.length} ch${saved ? "" : " · …"}`; }
notesEl.addEventListener("input", () => {
  notesMeta(false);
  clearTimeout(notesTimer);
  notesTimer = setTimeout(() => { store.set("notes", notesEl.value); notesMeta(); }, 400);
});
function appendNote(text) {
  notesEl.value = (notesEl.value.replace(/\s*$/, "") + `\n- ${text}`).replace(/^\n/, "");
  store.set("notes", notesEl.value); notesMeta();
}

/* =========================================================
   focus.exe (shared by the window and focus mode)
   ========================================================= */
const focus = { minutes: 25, mode: "focus", remaining: 25 * 60e3, endAt: 0, running: false, timer: 0 };
const mmss = (ms) => { const s = Math.ceil(ms / 1000); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
function renderFocus() {
  const total = (focus.mode === "focus" ? focus.minutes : 5) * 60e3;
  const ms = focus.running ? Math.max(0, focus.endAt - Date.now()) : focus.remaining;
  for (const view of $$("[data-focus-view]")) {
    $("[data-focus-time]", view).textContent = mmss(ms);
    $("[data-focus-bar]", view).textContent = `${bar(1 - ms / total, view.classList.contains("focus--stage") ? 40 : 26)} ${focus.mode}`;
    view.classList.toggle("is-running", focus.running && focus.mode === "focus");
    view.classList.toggle("is-break", focus.mode === "break");
    $("[data-focus-start]", view).textContent = focus.running ? "pause" : ms < total ? "resume" : "start";
  }
  document.title = focus.running ? `${mmss(ms)} ${focus.mode} · hzOS` : "hzOS";
  $$(".focus__len .key").forEach((b) => (b.disabled = focus.running));
  return ms;
}
function renderFocusMeta() {
  const n = store.get("focus." + dayKey(), 0);
  $("#focus-meta").textContent = n ? "■".repeat(Math.min(n, 8)) + ` ${n}` : "0 today";
  $("#stage-sessions").textContent = `sessions today: ${n ? "■".repeat(Math.min(n, 12)) : "none yet"}`;
}
function chime(notes = [523, 659, 784]) {
  try {
    const ctx = new AudioContext();
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "square"; o.frequency.value = f;
      const t = ctx.currentTime + i * 0.12;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.2);
    });
  } catch {}
}
function focusLoop() {
  if (renderFocus() <= 0) {
    focus.running = false; chime();
    if (focus.mode === "focus") {
      store.set("focus." + dayKey(), store.get("focus." + dayKey(), 0) + 1);
      renderFocusMeta();
      focus.mode = "break"; focus.remaining = 5 * 60e3;
      log("focus.exe: session done. take 5.", "ok");
    } else { focus.mode = "focus"; focus.remaining = focus.minutes * 60e3; log("focus.exe: break over.", "ok"); }
    renderFocus();
    return;
  }
  focus.timer = setTimeout(focusLoop, 250);
}
function focusStart(min) {
  if (min) setLength(min);
  if (focus.running) return;
  focus.endAt = Date.now() + focus.remaining; focus.running = true; focusLoop();
}
function focusPause() {
  if (!focus.running) return;
  focus.remaining = Math.max(0, focus.endAt - Date.now()); focus.running = false; clearTimeout(focus.timer); renderFocus();
}
function focusReset() { clearTimeout(focus.timer); focus.running = false; focus.mode = "focus"; focus.remaining = focus.minutes * 60e3; renderFocus(); }
function setLength(min) {
  clearTimeout(focus.timer); focus.running = false;
  focus.minutes = min; focus.mode = "focus"; focus.remaining = min * 60e3;
  $$(".focus__len .key").forEach((b) => b.setAttribute("aria-checked", String(+b.dataset.min === min)));
  renderFocus();
}
$$("[data-focus-start]").forEach((b) => b.addEventListener("click", () => (focus.running ? focusPause() : focusStart())));
$$("[data-focus-reset]").forEach((b) => b.addEventListener("click", focusReset));
$$(".focus__len .key").forEach((b) => b.addEventListener("click", () => setLength(+b.dataset.min)));

/* =========================================================
   timers (timer 10m tea)
   ========================================================= */
let timers = [];
function parseDur(s) {
  const m = /^(\d+(?:\.\d+)?)(s|m|h)?$/i.exec(s || "");
  if (!m) return 0;
  return +m[1] * { s: 1e3, m: 6e4, h: 36e5 }[(m[2] || "m").toLowerCase()];
}
function renderTimers() {
  const now = Date.now();
  for (const t of timers.filter((x) => x.end <= now)) { chime([784, 659, 784, 659]); log(`timer: "${t.label}" is up!`, "ok"); }
  timers = timers.filter((x) => x.end > now);
  const el = $("#st-timer");
  if (!timers.length) { el.hidden = true; return; }
  const t = timers.reduce((a, b) => (a.end < b.end ? a : b));
  el.hidden = false;
  el.textContent = `${t.label} ${mmss(t.end - now)}${timers.length > 1 ? ` +${timers.length - 1}` : ""}`;
}

/* =========================================================
   fortune (quote engine lives in quotes.js)
   ========================================================= */
let quote = null, why = "", qSalt = 0, qSlot = slotKey(settings.qRotation, new Date());
function renderFortune(again = false) {
  const prev = quote?.text;
  let r = currentQuote(new Date(), again ? ++qSalt : qSalt);
  // "again" should actually change the quote when the pool allows it
  for (let i = 0; again && r.quote.text === prev && i < 6; i++) r = currentQuote(new Date(), ++qSalt);
  quote = r.quote; why = r.why;
  const el = $("#fortune-text");
  $("#fortune-by").textContent = `  -- ${quote.by}`;
  $("#fortune-ctx").textContent = settings.qMatch ? contextLabel(new Date()) : "";
  if (again && !reduce) typeOut(el, quote.text); else { clearInterval(el._t); el.textContent = quote.text; }
  renderZen();
}
function typeOut(el, text) {
  clearInterval(el._t);
  let i = 0;
  el.textContent = "";
  el._t = setInterval(() => { i += 2; el.textContent = text.slice(0, i); if (i >= text.length) clearInterval(el._t); }, 16);
}
$("#fortune-next").addEventListener("click", () => renderFortune(true));
// custom quotes live in settings.qCustom, one per line
const customLines = () => (settings.qCustom || "").split("\n").filter((l) => parseLine(l));

/* =========================================================
   feed.rss
   ========================================================= */
let feedSrc = store.get("newsTab", "hn");
async function loadFeed(src = feedSrc, force = false) {
  const list = $("#feed");
  if (!store.get("cache.news." + src)) list.replaceChildren(h("li", { className: "loading", textContent: `fetching ${src}… ▍` }));
  try {
    const { data, t, stale } = await fetchFeed(src, force);
    if (src !== feedSrc) return;
    list.replaceChildren(...data.map((it) => h("li", {}, h("a", { href: safeUrl(it.url), target: "_blank", rel: "noopener" },
      h("div", {}, h("strong", { textContent: it.title }), h("span", { textContent: it.meta, title: it.meta }))))));
    $("#feed-meta").textContent = (stale ? "offline · " : "") + ago(t);
  } catch (err) {
    console.warn("feed", err);
    if (src !== feedSrc) return;
    list.replaceChildren(h("li", { className: "empty", textContent: `error: ${src} unreachable. run \`news ${src}\` to retry.` }));
  }
}
const tabs = $$(".feed__tabs [role=tab]");
function selectFeed(src, { focusTab = false, force = false } = {}) {
  if (!FEEDS[src]) return false;
  feedSrc = src; store.set("newsTab", src);
  for (const b of tabs) { const on = b.dataset.src === src; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; if (on && focusTab) b.focus(); }
  $("#feed").setAttribute("aria-labelledby", `tab-${src}`);
  loadFeed(src, force);
  return true;
}
tabs.forEach((b, i) => {
  b.addEventListener("click", () => selectFeed(b.dataset.src));
  b.addEventListener("keydown", (e) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (d) { e.preventDefault(); selectFeed(tabs[(i + d + tabs.length) % tabs.length].dataset.src, { focusTab: true }); }
  });
});

/* =========================================================
   game.exe
   ========================================================= */
let game = null;
const GAMES = { snake: [snake, "snake.exe"], type: [typer, "type.exe"] };
function startGame(name) {
  stopGame();
  const [fn, title] = GAMES[name];
  openApp("game", { focus: false });
  $("#game-title").textContent = title;
  game = fn($("#game"), { setMeta: (m) => ($("#game-meta").textContent = m), log });
}
function stopGame() { game?.stop(); game = null; $("#game").replaceChildren(); $("#game-meta").textContent = ""; }
let guess = null;

/* =========================================================
   themes + config.ini
   ========================================================= */
const THEMES = ["lime", "amber", "ice", "purple", "paper"];
function applyTheme(name) {
  if (!THEMES.includes(name)) return false;
  if (name === "lime") delete document.body.dataset.theme; else document.body.dataset.theme = name;
  settings.theme = name;
  $('meta[name="theme-color"]').content = css("--bg") || "#0a0c08";
  worldMap?.setColors();
  return true;
}
const cfg = $("#config");
function fillConfig() {
  for (const [k, v] of Object.entries(settings)) {
    const f = cfg.elements[k];
    if (!f) continue;
    if (f.type === "checkbox") f.checked = !!v; else f.value = v;
  }
}
cfg.addEventListener("submit", (e) => {
  e.preventDefault();
  for (const k of Object.keys(settings)) {
    const f = cfg.elements[k];
    if (f) settings[k] = f.type === "checkbox" ? f.checked : f.value.trim();
  }
  saveSettings();
  applyTheme(settings.theme);
  qSlot = slotKey(settings.qRotation, new Date()); qSalt = 0; renderFortune();
  closeApp("config");
  log("config.ini saved.", "ok");
  lastMinute = -1;
  loadWx(true);
});

/* =========================================================
   command line
   ========================================================= */
const out = $("#cmd-out");
const input = $("#cmd-input");
let outTimer = 0;
function log(content, cls = "") {
  const node = typeof content === "string" ? h("span", { className: cls, textContent: content }) : content;
  out.append(node);
  while (out.childElementCount > 60) out.firstElementChild.remove();
  out.scrollTop = out.scrollHeight;
  armOutTimer();
  return node;
}
function art(text) { return log(h("span", { className: "art", textContent: text })); }
function armOutTimer(ms = 15000) {
  clearTimeout(outTimer);
  outTimer = setTimeout(function hide() {
    if (document.activeElement === input) { outTimer = setTimeout(hide, 4000); return; }
    out.replaceChildren();
  }, ms);
}
const history = store.get("history", []);
let hIdx = history.length;

const HELP = {
  todo:   "t <task> · done <n> · rm <n> · note <text> · cat todo.txt|notes.md",
  focus:  "f [min] · pause · reset · mode desktop|focus|zen · timer 10m [label] · timers",
  info:   "wx · news hn|dev|gh|world · define <word> · wiki <topic> · date · uptime",
  tools:  "= <math> · pass [len] · uuid · b64 <text> · unb64 <text> · g|yt|ddg|gh <query> · <link name>",
  quotes: "quote [now] · quote add <text> -- <author> @tags · quote ls · quote rm <n> · quote rotate visit|30m|hourly|daily · quote pack <name> on|off · quote match on|off · quote tags",
  fun:    "neofetch · cowsay <text> · fortune · joke · 8ball <q> · roll [2d6] · flip · hack · sl · matrix · coffee",
  games:  "snake · type · guess",
  system: "open|close|max <app> · ls · layout reset · theme lime|amber|ice|purple|paper · name|city <x> · 12h|24h · history · clear",
};
const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : "#"; } catch { return "#"; } }; // feed/calendar URLs are third-party data
const go = (url) => { location.href = safeUrl(url); };
const enc = encodeURIComponent;
const fmtUptime = (ms) => { const m = Math.floor(ms / 6e4); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`; };

const COMMANDS = {
  help: (a) => {
    if (a && HELP[a]) return log(`${a.padEnd(7)}${HELP[a]}`);
    log(`hzOS ${VERSION} · commands (anything else searches the web)`, "ok");
    for (const [k, v] of Object.entries(HELP)) log(`${k.padEnd(7)}${v}`);
  },
  "?": (a) => COMMANDS.help(a),
  clear: () => out.replaceChildren(),
  cls: () => out.replaceChildren(),
  echo: (a) => log(a || ""),

  // todo + notes
  t: (a) => (a ? (addTodo(a), log(`todo: added #${todos.length}`, "ok")) : log("usage: t <task>", "err")),
  todo: (a) => COMMANDS.t(a),
  done: (a) => { const t = toggleTodo(+a); t ? log(`todo: ${t.done ? "done" : "reopened"} "${t.text}"`, "ok") : log("usage: done <n>", "err"); },
  x: (a) => COMMANDS.done(a),
  rm: (a) => {
    if (/^-rf?\b/.test(a || "")) return log("rm: permission denied. hzOS is read-only for chaos.", "err");
    const t = removeTodo(+a); t ? log(`todo: removed "${t.text}"`, "ok") : log("usage: rm <n>", "err");
  },
  note: (a) => (a ? (appendNote(a), log("notes.md: appended.", "ok")) : openApp("notes")),
  cat: (a) => {
    if (/todo/.test(a)) return todos.length ? todos.forEach((t, i) => log(`${pad(i + 1)} ${t.done ? "[x]" : "[ ]"} ${t.text}`)) : log("todo.txt is empty.");
    if (/notes/.test(a)) return log(notesEl.value || "notes.md is empty.");
    if (/config/.test(a)) return log(`name=${settings.name}\ncity=${settings.city}\ntheme=${settings.theme}\nclock=${settings.h24 ? "24h" : "12h"}\nquotes.rotate=${settings.qRotation}\nquotes.match=${settings.qMatch ? "on" : "off"}\nquotes.packs=${PACK_NAMES.filter((p) => settings["qp_" + p]).join(",") || "none"}\nquotes.custom=${customLines().length}`);
    log(`cat: ${a || "?"}: no such file. try: ls`, "err");
  },

  // focus + timers + modes
  f: (a) => { const m = +a || focus.minutes; focusStart(m); log(`focus.exe: ${m} min. go.`, "ok"); },
  focus: (a) => COMMANDS.f(a),
  pomodoro: (a) => COMMANDS.f(a),
  pause: () => { focusPause(); log("focus.exe: paused."); },
  stop: () => COMMANDS.pause(),
  reset: () => { focusReset(); log("focus.exe: reset."); },
  mode: (a) => (setMode(a || "desktop") ? log(`mode: ${a || "desktop"}`, "ok") : log("usage: mode desktop|focus|zen", "err")),
  zen: () => COMMANDS.mode("zen"),
  desktop: () => COMMANDS.mode("desktop"),
  exit: () => (document.body.dataset.mode !== "desktop" ? setMode("desktop") : log("there is no exit. you live here now.")),
  timer: (a) => {
    const [d, ...rest] = (a || "").split(/\s+/);
    const ms = parseDur(d);
    if (!ms) return log("usage: timer 10m [label] · units s, m, h", "err");
    const label = rest.join(" ") || d;
    timers.push({ end: Date.now() + ms, label });
    renderTimers();
    log(`timer: "${label}" set for ${d}.`, "ok");
  },
  timers: () => (timers.length ? timers.forEach((t) => log(`${t.label.padEnd(16)} ${mmss(t.end - Date.now())}`)) : log("no timers. try: timer 10m tea")),
  untimer: () => { timers = []; renderTimers(); log("timers cleared."); },

  // info
  wx: async () => { openApp("wx", { focus: false }); const w = await loadWx(true); if (w) log(`${w.place.name.toLowerCase()}: ${Math.round(w.temp)}° ${w.desc}. ${w.guess}`, "ok"); },
  weather: () => COMMANDS.wx(),
  news: (a) => (selectFeed(a || "hn", { force: true }) ? (openApp("feed", { focus: false }), log(`feed.rss: ${a || "hn"}`, "ok")) : log("usage: news hn|dev|gh|world", "err")),
  hn: () => COMMANDS.news("hn"), dev: () => COMMANDS.news("dev"), world: () => COMMANDS.news("world"),
  define: async (a) => {
    if (!a) return log("usage: define <word>", "err");
    try {
      const j = await getJSON(`https://en.wiktionary.org/api/rest_v1/page/definition/${enc(a.trim().toLowerCase())}`);
      const strip = (s) => new DOMParser().parseFromString(s, "text/html").body.textContent.trim();
      const senses = (j.en || []).flatMap((p) => p.definitions.filter((d) => d.definition).slice(0, 1).map((d) => [p.partOfSpeech, strip(d.definition)])).slice(0, 3);
      if (!senses.length) throw new Error("none");
      log(a.toLowerCase(), "ok");
      senses.forEach(([pos, d]) => log(`  ${pos.toLowerCase()}: ${d}`));
    } catch { log(`define: no entry for "${a}".`, "err"); }
  },
  wiki: async (a) => {
    if (!a) return log("usage: wiki <topic>", "err");
    try {
      const j = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${enc(a.replace(/ /g, "_"))}`);
      log(j.title, "ok");
      log(j.extract.length > 420 ? j.extract.slice(0, 420) + "…" : j.extract);
      if (j.content_urls?.desktop?.page) log(h("a", { href: safeUrl(j.content_urls.desktop.page), target: "_blank", rel: "noopener", textContent: "→ read on wikipedia" }));
    } catch { log(`wiki: nothing found for "${a}".`, "err"); }
  },
  date: () => log(new Date().toString()),
  uptime: () => log(`up ${fmtUptime(Date.now() - bootedAt)} · focus today: ${store.get("focus." + dayKey(), 0)} · tasks open: ${todos.filter((t) => !t.done).length}`),

  // tools
  "=": (a) => { try { log(`= ${calc(a)}`, "ok"); } catch (e) { log(`calc: ${e.message}`, "err"); } },
  calc: (a) => COMMANDS["="](a),
  pass: (a) => {
    const n = Math.min(Math.max(+a || 20, 8), 64);
    const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*-_=+";
    const rnd = crypto.getRandomValues(new Uint32Array(n));
    const p = [...rnd].map((v) => chars[v % chars.length]).join("");
    log(p);
    navigator.clipboard?.writeText(p).then(() => log("pass: copied to clipboard.", "ok"), () => {});
  },
  uuid: () => { const u = crypto.randomUUID(); log(u); navigator.clipboard?.writeText(u).catch(() => {}); },
  b64: (a) => { try { log(btoa(unescape(enc(a || "")))); } catch { log("b64: could not encode.", "err"); } },
  unb64: (a) => { try { log(decodeURIComponent(escape(atob(a || "")))); } catch { log("unb64: not valid base64.", "err"); } },
  g: (a) => go(`https://www.google.com/search?q=${enc(a)}`),
  search: (a) => COMMANDS.g(a),
  yt: (a) => go(`https://www.youtube.com/results?search_query=${enc(a)}`),
  ddg: (a) => go(`https://duckduckgo.com/?q=${enc(a)}`),
  links: () => log(links().map((l) => l.name).join("  ") || "no links. add some in config."),

  // fun
  neofetch: () => {
    const ua = navigator.userAgent;
    const browser = /Edg\//.test(ua) ? "edge" : /Chrome\//.test(ua) ? "chrome" : /Firefox\//.test(ua) ? "firefox" : /Safari\//.test(ua) ? "safari" : "browser";
    art(neofetch({
      __title: `${(settings.name || "user").toLowerCase()}@hzos`,
      os: `hzOS ${VERSION}`, host: browser, resolution: `${screen.width}x${screen.height}`,
      uptime: fmtUptime(Date.now() - bootedAt), theme: settings.theme, tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      tasks: `${todos.filter((t) => !t.done).length} open`, focus: `${store.get("focus." + dayKey(), 0)} today`,
      snake: `best ${store.get("snake.best", 0)}`, typing: `best ${store.get("typer.best", 0)} wpm`,
    }));
  },
  cowsay: (a) => art(cowsay(a || quote?.text || "moo.")),
  fortune: () => { renderFortune(true); log(`${quote.text}  -- ${quote.by}`); },
  quote: (a) => quoteCmd(a),
  quotes: (a) => quoteCmd(a),
  joke: async () => {
    try { const j = await getJSON("https://icanhazdadjoke.com/", { headers: { Accept: "application/json" } }); log(j.joke); }
    catch { log("joke: the joke server is not laughing right now.", "err"); }
  },
  "8ball": (a) => log(a ? `8ball: ${eightBall()}` : "8ball: ask a question first.", a ? "ok" : "err"),
  roll: (a) => {
    const m = /^(\d*)d(\d+)$/i.exec(a || "d6");
    if (!m) return log("usage: roll 2d6", "err");
    const n = Math.min(+m[1] || 1, 20), sides = Math.max(2, Math.min(+m[2], 1000));
    const r = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * sides));
    log(`roll ${n}d${sides}: ${r.join(" + ")}${n > 1 ? ` = ${r.reduce((x, y) => x + y)}` : ""}`, "ok");
  },
  flip: () => log(`flip: ${Math.random() < 0.5 ? "heads" : "tails"}`, "ok"),
  hack: async () => { for (const l of HACK) { log(l, l.startsWith("access") ? "ok" : ""); await sleep(reduce ? 0 : 260); } },
  sl: async () => {
    if (reduce) return art(TRAIN.join("\n"));
    const node = art("");
    const width = 70;
    for (let off = width; off > -TRAIN[0].length; off -= 2) {
      node.textContent = TRAIN.map((l) => (off >= 0 ? " ".repeat(off) + l : l.slice(-off))).map((l) => l.slice(0, width + 20)).join("\n");
      await sleep(35);
    }
    node.remove();
    log("choo choo. you meant `ls`.");
  },
  matrix: () => {
    const bg = css("--bg");
    const stop = matrix($("#matrix"), css("--lime"), /^#[0-9a-f]{6}$/i.test(bg) ? bg : "#0a0c08");
    if (!stop) return log("matrix: disabled with reduced motion.", "err");
    input.blur();
    const end = () => { stop(); removeEventListener("keydown", end, true); $("#matrix").removeEventListener("pointerdown", end); };
    setTimeout(() => { addEventListener("keydown", end, true); $("#matrix").addEventListener("pointerdown", end); }, 250);
  },
  sudo: () => log(`${(settings.name || "user").toLowerCase()} is not in the sudoers file. this incident will be reported.`, "err"),
  whoami: () => log(`${(settings.name || "friend").toLowerCase()} @ hzOS ${VERSION}`),
  ping: async () => {
    const t = performance.now();
    try { await fetch("https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0&current=temperature_2m", { cache: "no-store" }); log(`pong · ${Math.round(performance.now() - t)}ms to open-meteo`, "ok"); }
    catch { log("ping: no route to host. are you offline?", "err"); }
  },
  coffee: () => art("   ( (\n    ) )\n  ........\n  |      |]\n  \\      /\n   `----'\nbrewing… done. drink some water too."),

  // games
  snake: () => { startGame("snake"); log("snake.exe: arrows/wasd, space to pause.", "ok"); },
  type: () => { startGame("type"); log("type.exe: type the quote. esc for a new one.", "ok"); },
  typing: () => COMMANDS.type(),
  guess: (a) => {
    if (!guess || a === "new") { guess = { n: 1 + Math.floor(Math.random() * 100), tries: 0 }; return log("guess: i picked a number 1-100. type a number.", "ok"); }
    if (a) return guessTry(a);
    log("guess: type a number 1-100.");
  },

  // system
  open: (a) => (openApp(a) ? log(`open ${a}`, "ok") : log(`no app "${a}". try: ls`, "err")),
  close: (a) => (closeApp(a) ? log(`close ${a}`) : log(`no app "${a}"`, "err")),
  max: (a) => (toggleMax(a || $(".win.is-front")?.dataset.app) ? log(`max ${a || "front window"}`) : log("usage: max <app>", "err")),
  ls: () => log(APPS.map((a) => FILES[a] + (win(a).hidden ? "" : "*")).join("  ") + "\n(* = open)"),
  layout: (a) => (a === "reset" ? (resetLayout(), APPS.filter((x) => !["config", "game"].includes(x)).forEach((x) => openApp(x, { focus: false })), log("layout: reset.", "ok")) : log("usage: layout reset", "err")),
  theme: (a) => (applyTheme(a) ? (saveSettings(), log(`theme: ${a}`, "ok")) : log(`usage: theme ${THEMES.join("|")}`, "err")),
  config: () => openApp("config"), settings: () => openApp("config"),
  name: (a) => { if (!a) return log("usage: name <x>", "err"); settings.name = a; saveSettings(); lastMinute = -1; log(`hello, ${a.toLowerCase()}.`, "ok"); },
  city: (a) => { if (!a) return log("usage: city <x>", "err"); settings.city = a; saveSettings(); loadWx(true); log(`fallback city: ${a}`, "ok"); },
  "12h": () => { settings.h24 = false; saveSettings(); lastMinute = -1; log("clock: 12h", "ok"); },
  "24h": () => { settings.h24 = true; saveSettings(); lastMinute = -1; log("clock: 24h", "ok"); },
  history: () => history.slice(-12).forEach((l, i, arr) => log(`${String(history.length - arr.length + i + 1).padStart(4)}  ${l}`)),
  refresh: () => refreshAll(),
  reboot: () => { store.del("bootDay"); location.reload(); },
};
function guessTry(v) {
  const n = +v;
  if (!Number.isInteger(n) || n < 1 || n > 100) return log("guess: 1-100 please.", "err");
  guess.tries++;
  if (n === guess.n) {
    const best = store.get("guess.best", 0);
    const isBest = !best || guess.tries < best;
    if (isBest) store.set("guess.best", guess.tries);
    log(`guess: ${n} is right! ${guess.tries} tries${isBest ? " · new best" : ` · best ${best}`}.`, "ok");
    guess = null;
  } else log(`guess: ${n} is too ${n < guess.n ? "low" : "high"}.`);
}

function quoteCmd(a = "") {
  const [sub = "now", ...rest] = a.trim().split(/\s+/);
  const arg = rest.join(" ");
  const save = () => { saveSettings(); renderFortune(); };
  switch (sub) {
    case "now": case "":
      log(`${quote.text}  -- ${quote.by}`, "ok");
      log(`why: ${why}${quote.tags?.length ? ` · tags ${quote.tags.map((x) => "@" + x).join(" ")}` : ""} · source ${quote.source || "?"}`);
      return;
    case "add": {
      const q = parseLine(arg);
      if (!q || !/\s--\s/.test(arg)) return log("usage: quote add Ship it. -- Han @fri @evening", "err");
      settings.qCustom = [...customLines(), formatLine(q)].join("\n");
      qSalt = 0; save();
      return log(`quote: added #${customLines().length}${q.tags.length ? ` (shows ${q.tags.map((x) => "@" + x).join(" ")})` : " (any time)"}`, "ok");
    }
    case "ls": case "list": {
      const lines = customLines();
      if (!lines.length) return log("no custom quotes yet. quote add <text> -- <author> @tags");
      return lines.forEach((l, i) => log(`${pad(i + 1)}  ${l}`));
    }
    case "rm": {
      const lines = customLines();
      const n = +arg;
      if (!n || !lines[n - 1]) return log("usage: quote rm <n> · see quote ls", "err");
      const [gone] = lines.splice(n - 1, 1);
      settings.qCustom = lines.join("\n"); save();
      return log(`quote: removed "${parseLine(gone).text}"`, "ok");
    }
    case "rotate":
      if (!ROTATIONS[arg]) return log(`usage: quote rotate ${Object.keys(ROTATIONS).join("|")} · now ${settings.qRotation}`, "err");
      settings.qRotation = arg; qSlot = slotKey(arg, new Date()); qSalt = 0; save();
      return log(`quote: rotates ${ROTATIONS[arg]}`, "ok");
    case "pack": {
      const [name, state] = rest;
      if (!PACK_NAMES.includes(name) || !["on", "off"].includes(state)) {
        return log(`packs: ${PACK_NAMES.map((p) => `${p}:${settings["qp_" + p] ? "on" : "off"}`).join("  ")} · quote pack <name> on|off`);
      }
      settings["qp_" + name] = state === "on"; save();
      return log(`quote: pack ${name} ${state}`, "ok");
    }
    case "match":
      if (!["on", "off"].includes(arg)) return log(`usage: quote match on|off · now ${settings.qMatch ? "on" : "off"}`, "err");
      settings.qMatch = arg === "on"; save();
      return log(`quote: time & day matching ${arg}`, "ok");
    case "tags":
      log("time   @morning @afternoon @evening @night");
      log("day    @mon @tue @wed @thu @fri @sat @sun @weekday @weekend");
      log("date   @12-25   hours  @9-12h (22-6h wraps midnight)");
      return log(`same group = or, different groups = and. right now: ${contextLabel(new Date())}`);
    default:
      log("usage: quote [now|add|ls|rm|rotate|pack|match|tags]", "err");
  }
}

function run(raw) {
  const line = raw.trim();
  if (!line) return;
  history.push(line); if (history.length > 100) history.shift(); store.set("history", history); hIdx = history.length;
  if (guess && /^\d+$/.test(line)) return guessTry(line);
  if (line.startsWith("=")) return COMMANDS["="](line.slice(1));
  const [cmd, ...rest] = line.split(/\s+/);
  const arg = rest.join(" ");
  const key = cmd.toLowerCase();
  if (key === "gh") return arg ? go(`https://github.com/search?q=${enc(arg)}`) : COMMANDS.news("gh");
  if (Object.hasOwn(COMMANDS, key)) return COMMANDS[key](arg);
  const link = links().find((l) => l.name.toLowerCase() === line.toLowerCase());
  if (link) return go(link.url);
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(line)) return go(`https://${line}`);
  COMMANDS.g(line);
}
$("#cmd-form").addEventListener("submit", (e) => { e.preventDefault(); const v = input.value; input.value = ""; log(`$ ${v}`, "dim"); run(v); });
input.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp" && history.length) { e.preventDefault(); hIdx = Math.max(0, hIdx - 1); input.value = history[hIdx]; }
  else if (e.key === "ArrowDown") { e.preventDefault(); hIdx = Math.min(history.length, hIdx + 1); input.value = history[hIdx] || ""; }
  else if (e.key === "Tab" && input.value) {
    const [c, ...r] = input.value.split(" ");
    let pool, prefix = "";
    if (r.length === 0) pool = [...Object.keys(COMMANDS), ...links().map((l) => l.name)];
    else if (["open", "close", "max"].includes(c)) { pool = APPS; prefix = c + " "; }
    else if (c === "theme") { pool = THEMES; prefix = c + " "; }
    else if (c === "mode") { pool = MODES; prefix = c + " "; }
    else if (c === "news") { pool = Object.keys(FEEDS); prefix = c + " "; }
    else if (c === "help") { pool = Object.keys(HELP); prefix = c + " "; }
    else if (c === "quote" && r.length === 1) { pool = ["now", "add", "ls", "rm", "rotate", "pack", "match", "tags"]; prefix = c + " "; }
    else if (c === "quote" && r[0] === "rotate") { pool = Object.keys(ROTATIONS); prefix = "quote rotate "; r.shift(); }
    else if (c === "quote" && r[0] === "pack") { pool = PACK_NAMES; prefix = "quote pack "; r.shift(); }
    if (!pool) return;
    const word = (r.length ? r.join(" ") : c).toLowerCase();
    const hits = pool.filter((p) => p.startsWith(word));
    e.preventDefault();
    if (hits.length === 1) input.value = prefix + hits[0] + " ";
    else if (hits.length > 1) log(hits.join("  "));
  } else if (e.key === "Escape") { input.blur(); if (!input.value && document.body.dataset.mode !== "desktop") setMode("desktop"); }
});
addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  const inGame = game && document.activeElement?.tagName === "CANVAS";
  if (e.key === "/" && !typing && !inGame) { e.preventDefault(); input.focus(); }
  if (e.key === "Escape" && !typing && document.body.dataset.mode !== "desktop") setMode("desktop");
});

/* =========================================================
   status + refresh
   ========================================================= */
function net() { const on = navigator.onLine; $("#st-net").textContent = on ? "net:on" : "net:off"; $("#st-net").classList.toggle("off", !on); }
addEventListener("online", net); addEventListener("offline", net);
async function refreshAll() {
  log("refreshing wx and feed…");
  await Promise.allSettled([loadWx(true), loadFeed(feedSrc, true)]);
  log("done.", "ok");
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) { loadWx(); loadFeed(); } });

/* =========================================================
   boot
   ========================================================= */
async function boot() {
  const firstToday = store.get("bootDay") !== dayKey();
  store.set("bootDay", dayKey());
  if (!firstToday || reduce || document.hidden) return;
  const el = $("#boot"), pre = $("#boot-log");
  el.hidden = false;
  const lines = [
    `hzOS ${VERSION} · build ${dayKey().replace(/-/g, "")}`,
    "cpu .................... ok",
    `mount /home/${(settings.name || "user").toLowerCase()} ........ ok`,
    "net: open-meteo hn dev gh wiki .. ok",
    "games: snake type guess ......... ok",
    `todo: ${todos.filter((t) => !t.done).length} open · notes: ${notesEl.value.length} ch`,
    "",
    `${greeting(new Date().getHours())}, ${(settings.name || "friend").toLowerCase()}.`,
  ];
  let skip = false;
  const stop = () => { skip = true; };
  addEventListener("keydown", stop, { once: true });
  el.addEventListener("pointerdown", stop, { once: true });
  for (const l of lines) {
    if (skip) break;
    pre.textContent += l + "\n";
    await sleep(110);
  }
  if (!skip) await sleep(350);
  el.hidden = true;
}

async function start() {
  applyTheme(settings.theme || "lime");
  APPS.forEach((app) => { enableWindow(win(app)); applyLayout(app); win(app).hidden = closed.has(app); });
  if (!win("game").hidden) closeApp("game"); // games don't resume across reloads
  addEventListener("resize", () => APPS.forEach(applyLayout));
  renderDock();
  front("clock");
  net();
  renderTodo();
  notesMeta();
  renderFocus(); renderFocusMeta();
  renderFortune();
  tick();
  selectFeed(feedSrc);
  setMode(store.get("mode", "desktop"));
  worldMap = createMap($("#map"), $("#map-pin"));
  loadWx();

  await boot();
  if (window.gsap && !reduce && !document.hidden && !small() && document.body.dataset.mode === "desktop") {
    gsap.from($$(".win:not([hidden])"), { opacity: 0, y: 10, duration: 0.35, stagger: 0.04, ease: "power2.out", clearProps: "opacity,transform" });
  }
  log("hzOS ready. type `help`.", "ok");
  armOutTimer(4000);
}
start();
