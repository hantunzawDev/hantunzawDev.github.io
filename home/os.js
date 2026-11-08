// hzOS shell: window manager, apps, command line.
import {
  store, settings, saveSettings, links, pad, dayKey, hhmm, hourLabel, ago, isoWeek, spark, bar,
  QUOTES, dailyQuoteIndex, fetchWeather, calendarConfigured, fetchCalendar, FEEDS, fetchFeed,
} from "./data.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) if (k != null && k !== false) n.append(k);
  return n;
};
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const small = () => matchMedia("(max-width: 900px)").matches;

/* =========================================================
   window manager
   ========================================================= */
const APPS = ["clock", "wx", "cal", "todo", "focus", "globe", "fortune", "feed", "config"];
const TITLES = { clock: "clock", wx: "wx", cal: "cal", todo: "todo", focus: "focus", globe: "world", fortune: "fortune", feed: "feed", config: "config" };
// default layout as fractions of the desktop: x, y, w, h
const DEFAULT_LAYOUT = {
  clock:   [0.012, 0.025, 0.37, 0.40],
  wx:      [0.392, 0.025, 0.21, 0.40],
  globe:   [0.612, 0.025, 0.155, 0.40],
  feed:    [0.777, 0.025, 0.211, 0.95],
  cal:     [0.012, 0.455, 0.215, 0.52],
  todo:    [0.237, 0.455, 0.20, 0.52],
  focus:   [0.447, 0.455, 0.32, 0.25],
  fortune: [0.447, 0.725, 0.32, 0.25],
  config:  [0.30, 0.10, 0.36, 0.78],
};
const layout = Object.assign({}, DEFAULT_LAYOUT, store.get("layout.v1", {}));
const closed = new Set(store.get("closed.v1", ["config"]));
const desktop = $("#desktop");
const win = (app) => $(`.win[data-app="${app}"]`);
let zTop = 10;

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
  if (!APPS.includes(app)) return false;
  const el = win(app);
  const wasHidden = el.hidden;
  el.hidden = false;
  closed.delete(app);
  store.set("closed.v1", [...closed]);
  if (wasHidden && !reduce) { el.classList.remove("is-opening"); void el.offsetWidth; el.classList.add("is-opening"); }
  front(app);
  if (app === "config") fillConfig();
  if (focus) (el.querySelector("input, select, textarea") && app !== "clock" ? el.querySelector("input, select, textarea") : el.querySelector(".win__ctrl button"))?.focus({ preventScroll: false });
  renderDock();
  if (small()) el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  return true;
}
function closeApp(app) {
  const el = win(app);
  if (!el) return false;
  el.hidden = true;
  closed.add(app);
  store.set("closed.v1", [...closed]);
  renderDock();
  return true;
}
function renderDock() {
  const dock = $("#dock");
  dock.replaceChildren(...APPS.map((app) => {
    const b = h("button", { type: "button", textContent: TITLES[app] });
    b.setAttribute("aria-pressed", String(!win(app).hidden));
    b.addEventListener("click", () => (win(app).hidden || !win(app).classList.contains("is-front") ? openApp(app) : closeApp(app)));
    return b;
  }));
}

// dragging by the title bar (pointer only; layout is saved as fractions so it survives resizes)
function enableDrag(el) {
  const bar = $(".win__bar", el);
  bar.addEventListener("pointerdown", (e) => {
    front(el.dataset.app);
    if (small() || e.button !== 0 || e.target.closest("button")) return;
    const rect = el.getBoundingClientRect();
    const area = desktop.getBoundingClientRect();
    const dx = e.clientX - rect.left, dy = e.clientY - rect.top;
    bar.setPointerCapture(e.pointerId);
    el.classList.add("is-dragging");
    const move = (ev) => {
      const x = Math.min(Math.max(ev.clientX - dx - area.left, -rect.width + 80), area.width - 80);
      const y = Math.min(Math.max(ev.clientY - dy - area.top, 0), area.height - 26);
      el.style.left = `${(x / area.width) * 100}%`;
      el.style.top = `${(y / area.height) * 100}%`;
    };
    const up = () => {
      bar.removeEventListener("pointermove", move);
      el.classList.remove("is-dragging");
      const r = el.getBoundingClientRect();
      const app = el.dataset.app;
      layout[app] = [(r.left - area.left) / area.width, (r.top - area.top) / area.height, layout[app][2], layout[app][3]];
      store.set("layout.v1", Object.fromEntries(Object.entries(layout).filter(([k, v]) => v !== DEFAULT_LAYOUT[k])));
    };
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", up, { once: true });
    bar.addEventListener("pointercancel", up, { once: true });
  });
  el.addEventListener("pointerdown", () => front(el.dataset.app));
  el.addEventListener("focusin", () => front(el.dataset.app));
  $$("[data-close]", el).forEach((b) => b.addEventListener("click", () => closeApp(el.dataset.app)));
}
function resetLayout() {
  store.del("layout.v1");
  Object.assign(layout, DEFAULT_LAYOUT);
  APPS.forEach(applyLayout);
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
  if (now.getMinutes() !== lastMinute) {
    lastMinute = now.getMinutes();
    const hrs = settings.h24 ? pad(now.getHours()) : String(now.getHours() % 12 || 12);
    $("#clock").textContent = `${hrs}:${pad(now.getMinutes())}`;
    $("#clock").dateTime = now.toISOString();
    $("#hello").textContent = `${greeting(now.getHours())}, ${(settings.name || "friend").toLowerCase()}.`;
    const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5);
    const days = (new Date(now.getFullYear() + 1, 0, 1) - new Date(now.getFullYear(), 0, 1)) / 864e5;
    $("#clock-date").textContent = `${fmtDay(now)} · w${isoWeek(now)} · day ${doy}/${days}`;
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
    markNow();
    if (dayKey(now) !== lastDay) { lastDay = dayKey(now); renderFortune(); renderTodo(); loadCal(true); renderFocusMeta(); }
  }
  setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
}

/* =========================================================
   wx.sh + world.3d
   ========================================================= */
let globe = null;
async function loadWx(force = false) {
  const box = $("#wx");
  try {
    const w = await fetchWeather(force);
    sun = w.sun; lastMinute = -1;
    const temps = w.hourly.map((x) => x.temp);
    const rains = w.hourly.map((x) => x.rain);
    const hours = w.hourly.filter((_, i) => i % 6 === 0).map((x) => hourLabel(x.time).padEnd(6)).join("");
    box.replaceChildren(
      h("p", { className: "prompt", textContent: `$ wx ${w.place.name.toLowerCase()}${w.stale ? " --offline" : ""}` }),
      h("div", { className: "wx__now" },
        h("span", { className: "wx__temp", textContent: `${Math.round(w.temp)}°` }),
        h("span", { className: "wx__desc", textContent: `${w.desc}\nH${Math.round(w.max)}° L${Math.round(w.min)}°` })),
      h("pre", { className: "wx__rows", innerHTML:
        `feels ${Math.round(w.feels)}° · hum ${Math.round(w.humidity)}% · wind ${Math.round(w.wind)}km/h\n` +
        `temp <b>${spark(temps)}</b> ${Math.round(Math.min(...temps))}-${Math.round(Math.max(...temps))}°\n` +
        `rain <b>${spark(rains, 0, 100)}</b> ${Math.max(...rains)}%\n` +
        `     ${hours}` }),
      h("p", { className: "wx__guess", textContent: `> ${w.guess}` }),
    );
    $(".wx__desc", box).style.whiteSpace = "pre";
    $("#st-wx").textContent = `wx:${Math.round(w.temp)}° ${w.rainy ? "rain" : w.desc.split(" ").pop()}`;
    globe?.setLocation(w.place.lat, w.place.lon);
    const night = globe?.isNight(w.place.lat, w.place.lon);
    $("#globe-label").innerHTML = "";
    $("#globe-label").append(
      h("b", { textContent: `● ${w.place.name.toLowerCase()}` }), "\n",
      `${Math.abs(w.place.lat).toFixed(2)}°${w.place.lat >= 0 ? "N" : "S"} ${Math.abs(w.place.lon).toFixed(2)}°${w.place.lon >= 0 ? "E" : "W"}\n${night ? "night side" : "day side"}`,
    );
    $("#globe-label").style.whiteSpace = "pre";
  } catch (err) {
    console.warn("wx", err);
    box.replaceChildren(h("p", { className: "prompt", textContent: "$ wx" }), h("p", { className: "dim", textContent: "error: weather unreachable. try `wx` again." }));
  }
}

/* =========================================================
   today.cal
   ========================================================= */
let events = [];
async function loadCal(force = false) {
  const list = $("#cal");
  if (!calendarConfigured()) {
    const b = h("button", { type: "button", className: "key", textContent: "cal setup" });
    b.addEventListener("click", () => openApp("config"));
    list.replaceChildren(h("li", { className: "empty" }, h("span", { textContent: "google calendar not linked." }), h("span", {}, b)));
    $("#cal-meta").textContent = "offline";
    return;
  }
  try {
    const { items, stale } = await fetchCalendar(force);
    events = items;
    renderCal();
    $("#cal-meta").textContent = `${items.length} ev${stale ? " · offline" : ""}`;
  } catch (err) {
    console.warn("cal", err);
    list.replaceChildren(h("li", { className: "empty", textContent: "error: calendar unreachable. check `config`." }));
  }
}
function renderCal() {
  const list = $("#cal");
  if (!events.length) {
    list.replaceChildren(h("li", { className: "empty", textContent: "no events. clear runway." }));
    return;
  }
  const now = new Date();
  const rows = [];
  let markerDone = false;
  for (const ev of events) {
    if (!ev.allDay && !markerDone && ev.s > now) {
      rows.push(h("li", { className: "marker", textContent: `── ${hhmm(now)} now ${"─".repeat(14)}` }));
      markerDone = true;
    }
    const t = ev.allDay ? "[all-day]" : `${hhmm(ev.s)}-${hhmm(ev.e)}`;
    const title = ev.url ? h("a", { href: ev.url, target: "_blank", rel: "noopener", textContent: ev.title }) : ev.title;
    const li = h("li", {}, h("span", { className: "t", textContent: t }),
      h("span", { className: "what" }, title, ev.where ? h("span", { className: "where", textContent: ev.where }) : null));
    li._ev = ev;
    rows.push(li);
  }
  list.replaceChildren(...rows);
  markNow();
}
function markNow() {
  const now = new Date();
  for (const li of $$("#cal li")) {
    const ev = li._ev;
    if (!ev || ev.allDay) continue;
    li.classList.toggle("now", ev.s <= now && now < ev.e);
    li.classList.toggle("past", ev.e <= now);
  }
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
}
function addTodo(text) { todos.push({ id: Date.now(), text, done: false }); saveTodo(); }
function toggleTodo(n) {
  const t = todos[n - 1]; if (!t) return false;
  t.done = !t.done; t.doneOn = t.done ? dayKey() : null; saveTodo(); return t;
}
function removeTodo(n) { const t = todos[n - 1]; if (!t) return false; todos.splice(n - 1, 1); saveTodo(); return t; }
$("#todo-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#todo-input").value.trim();
  if (v) { addTodo(v); $("#todo-input").value = ""; }
});

/* =========================================================
   focus.exe
   ========================================================= */
const focus = { minutes: 25, mode: "focus", remaining: 25 * 60e3, endAt: 0, running: false, timer: 0 };
const mmss = (ms) => { const s = Math.ceil(ms / 1000); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
function renderFocus() {
  const total = (focus.mode === "focus" ? focus.minutes : 5) * 60e3;
  const ms = focus.running ? Math.max(0, focus.endAt - Date.now()) : focus.remaining;
  $("#focus-time").textContent = mmss(ms);
  $("#focus-bar").textContent = `${bar(1 - ms / total, 26)} ${focus.mode}`;
  const box = $(".focus");
  box.classList.toggle("is-running", focus.running && focus.mode === "focus");
  box.classList.toggle("is-break", focus.mode === "break");
  $("#focus-start").textContent = focus.running ? "pause" : ms < total ? "resume" : "start";
  document.title = focus.running ? `${mmss(ms)} ${focus.mode} · hzOS` : "hzOS";
  $$(".focus__len .key").forEach((b) => (b.disabled = focus.running));
  return ms;
}
function renderFocusMeta() {
  const n = store.get("focus." + dayKey(), 0);
  $("#focus-meta").textContent = n ? "■".repeat(Math.min(n, 8)) + ` ${n}` : "0 today";
}
function chime() {
  try {
    const ctx = new AudioContext();
    [523, 659, 784].forEach((f, i) => {
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
$("#focus-start").addEventListener("click", () => (focus.running ? focusPause() : focusStart()));
$("#focus-reset").addEventListener("click", focusReset);
$$(".focus__len .key").forEach((b) => b.addEventListener("click", () => setLength(+b.dataset.min)));

/* =========================================================
   fortune
   ========================================================= */
let qi = dailyQuoteIndex();
function renderFortune(random = false) {
  if (random) { let n; do n = Math.floor(Math.random() * QUOTES.length); while (n === qi); qi = n; } else qi = dailyQuoteIndex();
  const [text, by] = QUOTES[qi];
  const el = $("#fortune-text");
  $("#fortune-by").textContent = `  -- ${by}`;
  if (random && !reduce) typeOut(el, text); else el.textContent = text;
}
function typeOut(el, text) {
  clearInterval(el._t);
  let i = 0;
  el.textContent = "";
  el._t = setInterval(() => { i += 2; el.textContent = text.slice(0, i); if (i >= text.length) clearInterval(el._t); }, 16);
}
$("#fortune-next").addEventListener("click", () => renderFortune(true));

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
    list.replaceChildren(...data.map((it) => h("li", {}, h("a", { href: it.url, target: "_blank", rel: "noopener" },
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
   config.ini
   ========================================================= */
const cfg = $("#config");
function syncCfg() { $$("[data-show]", cfg).forEach((d) => d.classList.toggle("is-on", d.dataset.show === cfg.calMode.value)); }
function fillConfig() {
  for (const [k, v] of Object.entries(settings)) {
    const f = cfg.elements[k];
    if (!f) continue;
    if (f.type === "checkbox") f.checked = !!v; else f.value = v;
  }
  syncCfg();
}
cfg.calMode.addEventListener("change", syncCfg);
cfg.addEventListener("submit", (e) => {
  e.preventDefault();
  for (const k of Object.keys(settings)) {
    const f = cfg.elements[k];
    if (f) settings[k] = f.type === "checkbox" ? f.checked : f.value.trim();
  }
  saveSettings();
  closeApp("config");
  log("config.ini saved.", "ok");
  lastMinute = -1;
  loadWx(true); loadCal(true);
});

/* =========================================================
   command line
   ========================================================= */
const out = $("#cmd-out");
const input = $("#cmd-input");
let outTimer = 0;
function log(text, cls = "") {
  out.append(h("span", { className: cls, textContent: text }));
  while (out.childElementCount > 6) out.firstElementChild.remove();
  clearTimeout(outTimer);
  outTimer = setTimeout(() => out.replaceChildren(), 12000);
}
const history = store.get("history", []);
let hIdx = history.length;

const HELP = [
  "t <task>  done <n>  rm <n>      · todo",
  "f [25|50|5]  pause  reset        · focus timer",
  "news hn|dev|gh|world  wx  cal    · data   open|close <app>  layout reset",
  "g|yt|ddg <query>  <link name>  fortune  config  name <x>  city <x>  12h|24h  clear",
];
const go = (url) => { location.href = url; };
const COMMANDS = {
  help: () => HELP.forEach((l) => log(l)),
  "?": () => COMMANDS.help(),
  clear: () => out.replaceChildren(),
  t: (a) => (a ? (addTodo(a), log(`todo: added #${todos.length}`, "ok")) : log("usage: t <task>", "err")),
  todo: (a) => COMMANDS.t(a),
  done: (a) => { const t = toggleTodo(+a); t ? log(`todo: ${t.done ? "done" : "reopened"} "${t.text}"`, "ok") : log("usage: done <n>", "err"); },
  x: (a) => COMMANDS.done(a),
  rm: (a) => { const t = removeTodo(+a); t ? log(`todo: removed "${t.text}"`, "ok") : log("usage: rm <n>", "err"); },
  f: (a) => { const m = +a || focus.minutes; focusStart(m); openApp("focus", { focus: false }); log(`focus.exe: ${m} min. go.`, "ok"); },
  focus: (a) => COMMANDS.f(a),
  pause: () => { focusPause(); log("focus.exe: paused."); },
  stop: () => COMMANDS.pause(),
  reset: () => { focusReset(); log("focus.exe: reset."); },
  news: (a) => (selectFeed(a || "hn", { force: true }) ? (openApp("feed", { focus: false }), log(`feed.rss: ${a || "hn"}`, "ok")) : log("usage: news hn|dev|gh|world", "err")),
  hn: () => COMMANDS.news("hn"), dev: () => COMMANDS.news("dev"), world: () => COMMANDS.news("world"),
  wx: () => { openApp("wx", { focus: false }); loadWx(true); log("wx.sh: refreshing…"); },
  cal: (a) => (a === "setup" ? openApp("config") : (openApp("cal", { focus: false }), loadCal(true), log("today.cal: refreshing…"))),
  fortune: () => { openApp("fortune", { focus: false }); renderFortune(true); },
  open: (a) => (openApp(a === "world" ? "globe" : a) ? log(`open ${a}`, "ok") : log(`no app "${a}". try: ${APPS.join(" ")}`, "err")),
  close: (a) => (closeApp(a === "world" ? "globe" : a) ? log(`close ${a}`) : log(`no app "${a}"`, "err")),
  layout: (a) => (a === "reset" ? (resetLayout(), APPS.filter((x) => x !== "config").forEach((x) => openApp(x, { focus: false })), log("layout: reset.", "ok")) : log("usage: layout reset", "err")),
  config: () => openApp("config"), settings: () => openApp("config"),
  name: (a) => { if (!a) return log("usage: name <x>", "err"); settings.name = a; saveSettings(); lastMinute = -1; log(`hello, ${a.toLowerCase()}.`, "ok"); },
  city: (a) => { if (!a) return log("usage: city <x>", "err"); settings.city = a; saveSettings(); loadWx(true); log(`fallback city: ${a}`, "ok"); },
  "12h": () => { settings.h24 = false; saveSettings(); lastMinute = -1; renderCal(); log("clock: 12h", "ok"); },
  "24h": () => { settings.h24 = true; saveSettings(); lastMinute = -1; renderCal(); log("clock: 24h", "ok"); },
  g: (a) => go(`https://www.google.com/search?q=${encodeURIComponent(a)}`),
  search: (a) => COMMANDS.g(a),
  yt: (a) => go(`https://www.youtube.com/results?search_query=${encodeURIComponent(a)}`),
  ddg: (a) => go(`https://duckduckgo.com/?q=${encodeURIComponent(a)}`),
  links: () => log(links().map((l) => l.name).join("  ") || "no links. add some in config."),
  refresh: () => refreshAll(),
  whoami: () => log(`${(settings.name || "friend").toLowerCase()} @ hzOS 2.6`),
  sudo: () => log("nice try.", "err"),
};
function run(raw) {
  const line = raw.trim();
  if (!line) return;
  history.push(line); if (history.length > 50) history.shift(); store.set("history", history); hIdx = history.length;
  const [cmd, ...rest] = line.split(/\s+/);
  const arg = rest.join(" ");
  const key = cmd.toLowerCase();
  if (key === "gh" && !arg) return COMMANDS.news("gh");
  if (key === "gh") return go(`https://github.com/search?q=${encodeURIComponent(arg)}`);
  if (COMMANDS[key]) return COMMANDS[key](arg);
  const link = links().find((l) => l.name.toLowerCase() === line.toLowerCase());
  if (link) return go(link.url);
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(line)) return go(`https://${line}`);
  COMMANDS.g(line);
}
$("#cmd-form").addEventListener("submit", (e) => { e.preventDefault(); const v = input.value; input.value = ""; log(`$ ${v}`, "dim"); run(v); });
input.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp" && history.length) { e.preventDefault(); hIdx = Math.max(0, hIdx - 1); input.value = history[hIdx]; }
  else if (e.key === "ArrowDown") { e.preventDefault(); hIdx = Math.min(history.length, hIdx + 1); input.value = history[hIdx] || ""; }
  else if (e.key === "Tab" && input.value && !input.value.includes(" ")) {
    const pool = [...Object.keys(COMMANDS), ...links().map((l) => l.name)];
    const hit = pool.find((c) => c.startsWith(input.value.toLowerCase()));
    if (hit) { e.preventDefault(); input.value = hit + " "; }
  } else if (e.key === "Escape") input.blur();
});
addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if (e.key === "/" && !typing) { e.preventDefault(); input.focus(); }
});

/* =========================================================
   status + refresh
   ========================================================= */
function net() { const on = navigator.onLine; $("#st-net").textContent = on ? "net:on" : "net:off"; $("#st-net").classList.toggle("off", !on); }
addEventListener("online", net); addEventListener("offline", net);
async function refreshAll() {
  log("refreshing wx, cal, feed…");
  await Promise.allSettled([loadWx(true), loadCal(true), loadFeed(feedSrc, true)]);
  log("done.", "ok");
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) { loadWx(); loadCal(); loadFeed(); } });

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
    `hzOS 2.6.0 · build ${dayKey().replace(/-/g, "")}`,
    "cpu .................... ok",
    `mount /home/${(settings.name || "user").toLowerCase()} ........ ok`,
    "net: open-meteo hn dev gh wiki .. ok",
    `cal: ${calendarConfigured() ? "google ........... ok" : "not linked ....... skip"}`,
    `todo: ${todos.filter((t) => !t.done).length} open`,
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
    await new Promise((r) => setTimeout(r, 110));
  }
  if (!skip) await new Promise((r) => setTimeout(r, 350));
  el.hidden = true;
}

async function start() {
  APPS.forEach((app) => { enableDrag(win(app)); applyLayout(app); win(app).hidden = closed.has(app); });
  addEventListener("resize", () => APPS.forEach(applyLayout));
  renderDock();
  front("clock");
  net();
  tick();
  renderTodo();
  renderFocus(); renderFocusMeta();
  renderFortune();
  selectFeed(feedSrc);
  loadCal();
  import("./globe.js").then(({ createGlobe }) => { globe = createGlobe($("#globe")); loadWx(); }).catch(() => loadWx());

  await boot();
  if (window.gsap && !reduce && !document.hidden && !small()) {
    gsap.from($$(".win:not([hidden])"), { opacity: 0, y: 10, duration: 0.35, stagger: 0.04, ease: "power2.out", clearProps: "opacity,transform" });
  }
  log("hzOS ready. type `help`.", "ok");
}
start();
