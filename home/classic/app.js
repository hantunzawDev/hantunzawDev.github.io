// hz/home · personal browser home page. Static, no build step, no backend.
import { createScene } from "./scene.js";
import { parseICS } from "./ical.js";

const $ = (s, el = document) => el.querySelector(s);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) if (k != null) n.append(k);
  return n;
};

/* ---------------- storage (per-browser conveniences) ---------------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem("hz." + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("hz." + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

const DEFAULT_LINKS = [
  "GitHub | https://github.com",
  "Gmail | https://mail.google.com",
  "Calendar | https://calendar.google.com",
  "Claude | https://claude.ai",
  "YouTube | https://www.youtube.com",
  "Portfolio | https://www.hantunzaw.dev",
].join("\n");

const settings = Object.assign(
  { name: "Han", city: "Yangon", h24: false, calMode: "off", calKey: "", calIds: "", icalUrl: "", proxy: "", links: DEFAULT_LINKS },
  store.get("settings", {}),
);

const fmtTime = (d, opts = {}) =>
  new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", hour12: !settings.h24, ...opts }).format(d);
const fmtHour = (d) => new Intl.DateTimeFormat(undefined, { hour: "numeric", hour12: !settings.h24 }).format(d);
const compact = (n) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* ---------------- scene + phase ---------------- */
const scene = createScene($("#scene"));
let sun = null; // { rise: Date, set: Date }
let rainChance = 0;

function currentPhase(now = new Date()) {
  if (sun) {
    const m = 60e3;
    if (now >= sun.rise - 45 * m && now < +sun.rise + 75 * m) return "dawn";
    if (now >= sun.set - 75 * m && now < +sun.set + 45 * m) return "dusk";
    if (now > sun.rise && now < sun.set) return "day";
    return "night";
  }
  const h = now.getHours();
  return h >= 5 && h < 8 ? "dawn" : h >= 8 && h < 17 ? "day" : h >= 17 && h < 20 ? "dusk" : "night";
}
function applyPhase() {
  const phase = currentPhase();
  document.body.dataset.phase = phase;
  scene?.setMood({ phase, rain: rainChance / 100 });
}

/* ---------------- clock + greeting ---------------- */
function greetingFor(h) {
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Good night";
}
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 864e5 + 1) / 7);
}
let lastClock = "";
let lastDay = dayKey();
function tick() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: !settings.h24 }).formatToParts(now);
  const h = parts.find((p) => p.type === "hour").value.replace(/^0(?=\d)/, settings.h24 ? "0" : "");
  const m = parts.find((p) => p.type === "minute").value;
  const ap = parts.find((p) => p.type === "dayPeriod")?.value;
  const key = h + m + (ap || "");
  if (key !== lastClock) {
    lastClock = key;
    const clock = $("#clock");
    clock.replaceChildren(h, el("span", { className: "colon", textContent: ":" }), m);
    if (ap) clock.append(el("span", { className: "ampm", textContent: ap }));
    clock.dateTime = now.toISOString();
    $("#greeting").textContent = `${greetingFor(now.getHours())}, ${settings.name || "friend"}.`;
    $("#date").textContent =
      new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(now) + ` · week ${isoWeek(now)}`;
    applyPhase();
    markAgendaNow();
    if (dayKey(now) !== lastDay) { lastDay = dayKey(now); renderQuote(); renderFocusCount(); loadCalendar(true); }
  }
  setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
}

/* ---------------- quote (rotates daily, shuffle on demand) ---------------- */
const QUOTES = [
  ["Simplicity is prerequisite for reliability.", "Edsger W. Dijkstra"],
  ["Make it work, make it right, make it fast.", "Kent Beck"],
  ["The best way to predict the future is to invent it.", "Alan Kay"],
  ["Programs must be written for people to read, and only incidentally for machines to execute.", "Abelson & Sussman"],
  ["Well begun is half done.", "Aristotle"],
  ["Nothing will work unless you do.", "Maya Angelou"],
  ["You do not rise to the level of your goals. You fall to the level of your systems.", "James Clear"],
  ["Every action you take is a vote for the type of person you wish to become.", "James Clear"],
  ["Talk is cheap. Show me the code.", "Linus Torvalds"],
  ["First, solve the problem. Then, write the code.", "John Johnson"],
  ["The impediment to action advances action. What stands in the way becomes the way.", "Marcus Aurelius"],
  ["Waste no more time arguing what a good man should be. Be one.", "Marcus Aurelius"],
  ["We suffer more often in imagination than in reality.", "Seneca"],
  ["The journey of a thousand miles begins with one step.", "Lao Tzu"],
  ["Stay hungry. Stay foolish.", "Whole Earth Catalog"],
  ["Real artists ship.", "Steve Jobs"],
  ["If you want to go fast, go alone. If you want to go far, go together.", "Proverb"],
  ["Discipline equals freedom.", "Jocko Willink"],
  ["Focus is a matter of deciding what things you're not going to do.", "John Carmack"],
  ["Clarity about what matters provides clarity about what does not.", "Cal Newport"],
  ["Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away.", "Antoine de Saint-Exupéry"],
  ["Small deeds done are better than great deeds planned.", "Peter Marshall"],
  ["Energy and persistence conquer all things.", "Benjamin Franklin"],
  ["Simple things should be simple, complex things should be possible.", "Alan Kay"],
  ["Done is better than perfect.", "Sheryl Sandberg"],
  ["It is not that we have a short time to live, but that we waste a lot of it.", "Seneca"],
];
let quoteIdx = -1;
function renderQuote(random = false) {
  const now = new Date();
  const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5);
  let i = random ? Math.floor(Math.random() * QUOTES.length) : doy % QUOTES.length;
  if (random && i === quoteIdx) i = (i + 1) % QUOTES.length;
  quoteIdx = i;
  const [text, author] = QUOTES[i];
  const run = () => { $("#quote-text").textContent = text; $("#quote-author").textContent = author; };
  if (random && window.gsap && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.to("#quote-text, #quote-author", { opacity: 0, y: -4, duration: 0.15, ease: "power2.in", onComplete() {
      run(); gsap.fromTo("#quote-text, #quote-author", { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.25, ease: "power2.out" });
    } });
  } else run();
}

/* ---------------- quick links ---------------- */
function renderLinks() {
  const nav = $("#links");
  nav.replaceChildren();
  for (const line of (settings.links || "").split("\n")) {
    const [name, raw] = line.split("|").map((s) => s && s.trim());
    if (!name || !raw) continue;
    let url;
    try { url = new URL(raw); } catch { continue; }
    if (!/^https?:$/.test(url.protocol)) continue;
    const img = el("img", { src: `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=32`, alt: "", width: 14, height: 14, loading: "lazy" });
    img.onerror = () => img.remove();
    nav.append(el("a", { href: url.href, rel: "noopener" }, img, name));
  }
}

/* ---------------- tasks (local) ---------------- */
let tasks = store.get("tasks", []);
function saveTasks() { store.set("tasks", tasks); renderTasks(); }
function renderTasks() {
  // drop tasks completed on a previous day
  const today = dayKey();
  tasks = tasks.filter((t) => !t.done || t.doneOn === today);
  const list = $("#task-list");
  list.replaceChildren();
  for (const t of tasks) {
    const cb = el("input", { type: "checkbox", checked: t.done });
    cb.addEventListener("change", () => { t.done = cb.checked; t.doneOn = cb.checked ? dayKey() : null; saveTasks(); });
    const del = el("button", { className: "text-btn del", type: "button", ariaLabel: `Delete task: ${t.text}` },
      el("iconify-icon", { icon: "solar:trash-bin-minimalistic-linear", width: 14 }));
    del.addEventListener("click", () => { tasks = tasks.filter((x) => x !== t); saveTasks(); });
    list.append(el("li", { className: t.done ? "done" : "" }, el("label", {}, cb, el("span", { textContent: t.text })), del));
  }
  const open = tasks.filter((t) => !t.done).length;
  $("#task-count").textContent = tasks.length ? `${open} open` : "";
  if (!tasks.length) list.append(el("li", { className: "empty", textContent: "Nothing yet. What's the one thing for today?" }));
}
$("#task-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("#task-input");
  const text = input.value.trim();
  if (!text) return;
  tasks.push({ id: Date.now(), text, done: false });
  input.value = "";
  saveTasks();
});

/* ---------------- fetch with cache ---------------- */
async function cached(key, ttlMin, loader, force = false) {
  const hit = store.get("cache." + key);
  if (!force && hit && Date.now() - hit.t < ttlMin * 60e3) return { data: hit.data, t: hit.t };
  try {
    const data = await loader();
    store.set("cache." + key, { t: Date.now(), data });
    return { data, t: Date.now() };
  } catch (err) {
    if (hit) return { data: hit.data, t: hit.t, stale: true };
    throw err;
  }
}
async function getJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60e3);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
};

/* ---------------- weather ---------------- */
const WMO = {
  0: ["Clear", "solar:sun-2-linear", "solar:moon-linear"],
  1: ["Mostly clear", "solar:cloud-sun-2-linear", "solar:moon-linear"],
  2: ["Partly cloudy", "solar:cloud-sun-2-linear", "solar:cloud-linear"],
  3: ["Overcast", "solar:clouds-linear"],
  45: ["Fog", "solar:fog-linear"], 48: ["Freezing fog", "solar:fog-linear"],
  51: ["Light drizzle", "solar:cloud-rain-linear"], 53: ["Drizzle", "solar:cloud-rain-linear"], 55: ["Heavy drizzle", "solar:cloud-rain-linear"],
  61: ["Light rain", "solar:cloud-rain-linear"], 63: ["Rain", "solar:cloud-rain-linear"], 65: ["Heavy rain", "solar:cloud-waterdrops-linear"],
  66: ["Freezing rain", "solar:cloud-rain-linear"], 67: ["Freezing rain", "solar:cloud-rain-linear"],
  71: ["Light snow", "solar:cloud-snowfall-linear"], 73: ["Snow", "solar:cloud-snowfall-linear"], 75: ["Heavy snow", "solar:cloud-snowfall-linear"], 77: ["Snow grains", "solar:cloud-snowfall-linear"],
  80: ["Showers", "solar:cloud-rain-linear"], 81: ["Showers", "solar:cloud-rain-linear"], 82: ["Violent showers", "solar:cloud-waterdrops-linear"],
  85: ["Snow showers", "solar:cloud-snowfall-linear"], 86: ["Snow showers", "solar:cloud-snowfall-linear"],
  95: ["Thunderstorm", "solar:cloud-storm-linear"], 96: ["Thunderstorm", "solar:cloud-storm-linear"], 99: ["Thunderstorm", "solar:cloud-storm-linear"],
};

function getPosition() {
  // an unanswered permission prompt never fires the geolocation timeout, so race it
  const last = store.get("lastPos", null);
  const geo = new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3) };
        store.set("lastPos", pos);
        resolve(pos);
      },
      () => resolve(null),
      { timeout: 6000, maximumAge: 30 * 60e3 },
    );
  });
  return Promise.race([geo, new Promise((r) => setTimeout(() => r(last), last ? 1200 : 3500))]);
}
async function resolvePlace(force) {
  const pos = await getPosition();
  if (pos) {
    const { data } = await cached(`place.${pos.lat},${pos.lon}`, 24 * 60, async () => {
      const g = await getJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${pos.lat}&longitude=${pos.lon}&localityLanguage=en`);
      return { ...pos, name: g.city || g.locality || g.principalSubdivision || "Here" };
    }, false).catch(() => ({ data: { ...pos, name: "Here" } }));
    return data;
  }
  const city = settings.city || "Yangon";
  const { data } = await cached(`city.${city.toLowerCase()}`, 7 * 24 * 60, async () => {
    const g = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
    const r = g.results?.[0];
    if (!r) throw new Error("city not found");
    return { lat: r.latitude, lon: r.longitude, name: r.name };
  }, force);
  return data;
}

function weatherGuess(d, hourly) {
  const lines = [];
  const peakRain = hourly.reduce((a, h) => (h.rain > a.rain ? h : a), { rain: 0 });
  if (peakRain.rain >= 60) lines.push(`Rain likely around ${fmtHour(peakRain.time)}. Take an umbrella.`);
  else if (peakRain.rain >= 30) lines.push(`Some chance of showers near ${fmtHour(peakRain.time)}.`);
  else lines.push("Dry for the next 12 hours.");
  const hot = hourly.reduce((a, h) => (h.temp > a.temp ? h : a), { temp: -99 });
  if (d.max >= 34) lines.push(`Hot, peaking at ${Math.round(d.max)}° around ${fmtHour(hot.time)}.`);
  else if (d.max <= 12) lines.push(`Cold day, only ${Math.round(d.max)}° at best. Layer up.`);
  else if (d.uv >= 8) lines.push(`UV is very high (${Math.round(d.uv)}) at midday.`);
  else lines.push(`Comfortable, ${Math.round(d.min)}° to ${Math.round(d.max)}°.`);
  return lines.join(" ");
}

function drawSpark(hourly) {
  const svg = $("#wx-spark");
  const W = 240, H = 48, n = hourly.length;
  if (!n) return svg.replaceChildren();
  const temps = hourly.map((h) => h.temp);
  const lo = Math.min(...temps) - 1, hi = Math.max(...temps) + 1;
  const x = (i) => (i / (n - 1)) * W;
  const y = (t) => H - 6 - ((t - lo) / (hi - lo)) * (H - 12);
  const ns = "http://www.w3.org/2000/svg";
  const frag = document.createDocumentFragment();
  const bw = W / n;
  hourly.forEach((h, i) => {
    const r = document.createElementNS(ns, "rect");
    const bh = (h.rain / 100) * H;
    r.setAttribute("x", (i * bw + 1).toFixed(1)); r.setAttribute("width", (bw - 2).toFixed(1));
    r.setAttribute("y", (H - bh).toFixed(1)); r.setAttribute("height", bh.toFixed(1));
    r.setAttribute("rx", 1.5); r.setAttribute("class", "rain");
    frag.append(r);
  });
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", temps.map((t, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(t).toFixed(1)}`).join(""));
  path.setAttribute("class", "temp");
  frag.append(path);
  svg.replaceChildren(frag);
  const axis = $("#wx-axis");
  axis.replaceChildren(...[0, Math.floor(n / 2), n - 1].map((i) => el("span", { textContent: fmtHour(hourly[i].time) })));
}

async function loadWeather(force = false) {
  try {
    const place = await resolvePlace(force);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}` +
      "&current=temperature_2m,weather_code,is_day,apparent_temperature" +
      "&hourly=temperature_2m,precipitation_probability" +
      "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset" +
      "&timezone=auto&forecast_days=2";
    const { data: w, t } = await cached(`wx.${place.lat},${place.lon}`, 20, () => getJSON(url), force);

    const code = w.current.weather_code;
    const [desc, dayIcon, nightIcon] = WMO[code] || ["-", "solar:cloud-linear"];
    $("#wx-place").textContent = place.name;
    $("#wx-temp").textContent = Math.round(w.current.temperature_2m);
    $("#wx-desc").textContent = desc;
    $("#wx-icon").setAttribute("icon", !w.current.is_day && nightIcon ? nightIcon : dayIcon);
    const d = { max: w.daily.temperature_2m_max[0], min: w.daily.temperature_2m_min[0], uv: w.daily.uv_index_max[0] };
    $("#wx-hilo").textContent = `H ${Math.round(d.max)}°  L ${Math.round(d.min)}°`;
    $("#wx-updated").textContent = ago(t);

    // next 12 hours, from the forecast's own "now"
    const nowStr = w.current.time.slice(0, 13);
    const start = Math.max(0, w.hourly.time.findIndex((s) => s.slice(0, 13) >= nowStr));
    const hourly = w.hourly.time.slice(start, start + 13).map((s, i) => ({
      time: new Date(s), temp: w.hourly.temperature_2m[start + i], rain: w.hourly.precipitation_probability[start + i] ?? 0,
    }));
    $("#wx-guess").textContent = weatherGuess(d, hourly);
    drawSpark(hourly);

    sun = { rise: new Date(w.daily.sunrise[0]), set: new Date(w.daily.sunset[0]) };
    rainChance = Math.max(...hourly.slice(0, 4).map((h) => h.rain), [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code) ? 80 : 0);
    applyPhase();
  } catch (err) {
    console.warn("weather", err);
    $("#wx-guess").textContent = "Weather is unavailable right now. Try refresh.";
  }
}

/* ---------------- news ---------------- */
const NEWS = {
  hn: {
    ttl: 15,
    async load() {
      const j = await getJSON("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=20");
      return j.hits.map((h) => {
        const url = h.url || `https://news.ycombinator.com/item?id=${h.objectID}`;
        let host = "news.ycombinator.com";
        try { host = new URL(url).hostname.replace(/^www\./, ""); } catch {}
        return { title: h.title, url, meta: `${h.points} pts · ${h.num_comments} comments · ${host}` };
      });
    },
  },
  dev: {
    ttl: 30,
    async load() {
      const j = await getJSON("https://dev.to/api/articles?top=1&per_page=20");
      return j.map((a) => ({ title: a.title, url: a.url, meta: `${a.user?.name || ""} · ${a.positive_reactions_count} reactions · ${a.reading_time_minutes} min` }));
    },
  },
  gh: {
    ttl: 60,
    async load() {
      const since = dayKey(new Date(Date.now() - 7 * 864e5));
      const j = await getJSON(`https://api.github.com/search/repositories?q=created:>${since}&sort=stars&order=desc&per_page=20`, { headers: { Accept: "application/vnd.github+json" } });
      return j.items.map((r) => ({
        title: r.full_name, url: r.html_url,
        meta: [`${compact(r.stargazers_count)} stars`, r.language, r.description].filter(Boolean).join(" · "),
      }));
    },
  },
  world: {
    ttl: 60,
    async load() {
      const d = new Date();
      const path = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
      const j = await getJSON(`https://en.wikipedia.org/api/rest_v1/feed/featured/${path}`);
      const strip = (html) => new DOMParser().parseFromString(html, "text/html").body.textContent.trim();
      const news = (j.news || []).map((n) => ({
        title: strip(n.story),
        url: n.links?.[0]?.content_urls?.desktop?.page || "https://en.wikipedia.org/wiki/Portal:Current_events",
        meta: `Wikipedia · In the news · ${n.links?.[0]?.normalizedtitle || ""}`,
      }));
      // today's most-read list is published with a lag; fall back to yesterday's
      let mostread = j.mostread?.articles;
      if (!mostread?.length) {
        const y = new Date(d - 864e5);
        const yp = `${y.getFullYear()}/${String(y.getMonth() + 1).padStart(2, "0")}/${String(y.getDate()).padStart(2, "0")}`;
        mostread = (await getJSON(`https://en.wikipedia.org/api/rest_v1/feed/featured/${yp}`).catch(() => ({}))).mostread?.articles || [];
      }
      const reads = mostread.filter((a) => a.namespace?.id !== -1 && a.normalizedtitle !== "Main Page").slice(0, 12).map((a) => ({
        title: a.normalizedtitle + (a.description ? `: ${a.description}` : ""),
        url: a.content_urls?.desktop?.page,
        meta: `Most read · ${compact(a.views)} views`,
      }));
      return [...news, ...reads];
    },
  },
};
let activeSrc = store.get("newsTab", "hn");
async function loadNews(src = activeSrc, force = false) {
  const list = $("#news-list");
  if (!store.get("cache.news." + src)) list.replaceChildren(...Array.from({ length: 7 }, () => el("li", { className: "skeleton", ariaHidden: "true" })));
  try {
    const { data, t, stale } = await cached("news." + src, NEWS[src].ttl, () => NEWS[src].load(), force);
    if (src !== activeSrc) return;
    list.replaceChildren(...data.map((it) =>
      el("li", {}, el("a", { href: it.url, target: "_blank", rel: "noopener" },
        el("div", {}, el("strong", { textContent: it.title }), el("span", { textContent: it.meta, title: it.meta }))))));
    $("#news-meta").textContent = (stale ? "offline · " : "") + ago(t);
  } catch (err) {
    console.warn("news", err);
    if (src !== activeSrc) return;
    const retry = el("button", { className: "btn", type: "button", textContent: "Retry" });
    retry.addEventListener("click", () => loadNews(src, true));
    list.replaceChildren(el("li", { className: "empty" }, "Couldn't load this feed. ", retry));
  }
}
function selectTab(btn, focus = false) {
  for (const b of document.querySelectorAll(".tabs [role=tab]")) {
    const on = b === btn;
    b.setAttribute("aria-selected", on);
    b.tabIndex = on ? 0 : -1;
  }
  if (focus) btn.focus();
  activeSrc = btn.dataset.src;
  store.set("newsTab", activeSrc);
  $("#news-list").setAttribute("aria-labelledby", btn.id);
  loadNews();
}
const tabs = [...document.querySelectorAll(".tabs [role=tab]")];
tabs.forEach((b, i) => {
  b.addEventListener("click", () => selectTab(b));
  b.addEventListener("keydown", (e) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (dir) { e.preventDefault(); selectTab(tabs[(i + dir + tabs.length) % tabs.length], true); }
  });
});

/* ---------------- calendar (Google, read-only) ---------------- */
let agendaItems = [];
async function fetchEvents() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  if (settings.calMode === "api") {
    const ids = settings.calIds.split(",").map((s) => s.trim()).filter(Boolean);
    const all = await Promise.all(ids.map(async (id) => {
      const u = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events`);
      Object.entries({ key: settings.calKey, timeMin: start.toISOString(), timeMax: end.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "50" })
        .forEach(([k, v]) => u.searchParams.set(k, v));
      const j = await getJSON(u);
      return (j.items || []).filter((e) => e.status !== "cancelled").map((e) => ({
        title: e.summary || "(busy)", where: e.location || "",
        allDay: !!e.start.date,
        start: e.start.dateTime || e.start.date, end: e.end.dateTime || e.end.date,
        url: e.htmlLink,
      }));
    }));
    return all.flat();
  }
  if (settings.calMode === "ical") {
    const r = await fetch(settings.proxy + encodeURIComponent(settings.icalUrl));
    if (!r.ok) throw new Error("proxy " + r.status);
    return parseICS(await r.text(), start, end).map((e) => ({ ...e, start: e.start.toISOString(), end: e.end.toISOString() }));
  }
  return [];
}
async function loadCalendar(force = false) {
  const list = $("#agenda");
  if (settings.calMode === "off" || (settings.calMode === "api" && (!settings.calKey || !settings.calIds)) || (settings.calMode === "ical" && (!settings.icalUrl || !settings.proxy))) {
    const b = el("button", { className: "text-btn", type: "button", textContent: "Connect" });
    b.style.color = "var(--accent)";
    b.addEventListener("click", openSettings);
    list.replaceChildren(el("li", { className: "empty" }, "Google Calendar isn't connected.", b));
    $("#today-meta").textContent = "";
    return;
  }
  try {
    const sig = settings.calMode + settings.calIds + settings.icalUrl;
    const { data, t, stale } = await cached("cal." + dayKey() + "." + sig.length, 10, fetchEvents, force);
    agendaItems = data.map((e) => ({ ...e, s: new Date(e.start), e: new Date(e.end) }))
      .sort((a, b) => (b.allDay - a.allDay) || (a.s - b.s));
    renderAgenda();
    $("#today-meta").textContent = `${agendaItems.length} event${agendaItems.length === 1 ? "" : "s"}${stale ? " · offline" : ""}`;
  } catch (err) {
    console.warn("calendar", err);
    list.replaceChildren(el("li", { className: "empty", textContent: "Couldn't reach your calendar. Check settings." }));
  }
}
function renderAgenda() {
  const list = $("#agenda");
  if (!agendaItems.length) {
    list.replaceChildren(el("li", { className: "empty", textContent: "No events today. A clear runway." }));
    return;
  }
  list.replaceChildren(...agendaItems.map((ev) => {
    const time = ev.allDay
      ? el("span", { className: "t", textContent: "all day" })
      : el("span", { className: "t" }, fmtTime(ev.s).replace(/\s?[AP]M$/i, ""), el("small", { textContent: fmtTime(ev.e) }));
    const title = ev.url ? el("a", { href: ev.url, target: "_blank", rel: "noopener", textContent: ev.title }) : ev.title;
    const li = el("li", {}, time, el("div", { className: "what" }, el("strong", {}, title), ev.where ? el("span", { textContent: ev.where }) : null));
    li._ev = ev;
    return li;
  }));
  markAgendaNow();
}
function markAgendaNow() {
  const now = new Date();
  for (const li of document.querySelectorAll("#agenda li")) {
    const ev = li._ev;
    if (!ev || ev.allDay) continue;
    li.classList.toggle("is-now", ev.s <= now && now < ev.e);
    li.classList.toggle("is-past", ev.e <= now);
  }
}

/* ---------------- focus timer ---------------- */
const CIRC = 2 * Math.PI * 52;
const focus = { minutes: 25, mode: "focus", remaining: 25 * 60e3, endAt: 0, running: false, timer: 0 };
const fmtMs = (ms) => { const s = Math.ceil(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
function renderFocus() {
  const total = (focus.mode === "focus" ? focus.minutes : 5) * 60e3;
  const ms = focus.running ? Math.max(0, focus.endAt - Date.now()) : focus.remaining;
  $("#focus-time").textContent = fmtMs(ms);
  $("#focus-mode").textContent = focus.mode === "focus" ? "Focus" : "Break";
  $("#focus-ring").style.strokeDashoffset = (CIRC * (1 - ms / total)).toFixed(2);
  $("#focus-start").textContent = focus.running ? "Pause" : ms < total ? "Resume" : "Start";
  document.title = focus.running ? `${fmtMs(ms)} · ${focus.mode === "focus" ? "Focus" : "Break"}` : "Home · hantunzaw";
  document.querySelectorAll(".seg button").forEach((b) => (b.disabled = focus.running));
  return ms;
}
function renderFocusCount() {
  const n = store.get("focus." + dayKey(), 0);
  $("#focus-count").textContent = `${n} today`;
}
function chime() {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.6);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 0.65);
    });
  } catch {}
}
function focusLoop() {
  const ms = renderFocus();
  if (ms <= 0) {
    focus.running = false;
    chime();
    if (focus.mode === "focus") {
      store.set("focus." + dayKey(), store.get("focus." + dayKey(), 0) + 1);
      renderFocusCount();
      focus.mode = "break"; focus.remaining = 5 * 60e3;
    } else { focus.mode = "focus"; focus.remaining = focus.minutes * 60e3; }
    renderFocus();
    return;
  }
  focus.timer = setTimeout(focusLoop, 250);
}
$("#focus-start").addEventListener("click", () => {
  if (focus.running) {
    focus.remaining = Math.max(0, focus.endAt - Date.now());
    focus.running = false; clearTimeout(focus.timer); renderFocus();
  } else {
    focus.endAt = Date.now() + focus.remaining; focus.running = true; focusLoop();
  }
});
$("#focus-reset").addEventListener("click", () => {
  clearTimeout(focus.timer); focus.running = false; focus.mode = "focus"; focus.remaining = focus.minutes * 60e3; renderFocus();
});
document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-checked", x === b));
  focus.minutes = +b.dataset.min; focus.mode = "focus"; focus.remaining = focus.minutes * 60e3; renderFocus();
}));

/* ---------------- settings ---------------- */
const dlg = $("#settings");
const form = $("#settings-form");
function syncCalFields() {
  const mode = form.calMode.value;
  form.querySelectorAll("[data-show]").forEach((d) => d.classList.toggle("is-on", d.dataset.show === mode));
}
function openSettings() {
  for (const [k, v] of Object.entries(settings)) {
    const f = form.elements[k];
    if (!f) continue;
    if (f.type === "checkbox") f.checked = !!v; else f.value = v;
  }
  syncCalFields();
  dlg.showModal();
}
form.calMode.addEventListener("change", syncCalFields);
$("#btn-settings").addEventListener("click", openSettings);
dlg.addEventListener("close", () => {
  if (dlg.returnValue !== "save") return;
  for (const k of Object.keys(settings)) {
    const f = form.elements[k];
    if (!f) continue;
    settings[k] = f.type === "checkbox" ? f.checked : f.value.trim();
  }
  store.set("settings", settings);
  lastClock = "";
  renderLinks();
  loadWeather(true);
  loadCalendar(true);
});

/* ---------------- keyboard + refresh ---------------- */
addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if (e.key === "/" && !typing && !dlg.open) { e.preventDefault(); $("#q").focus(); }
  if (e.key === "Escape" && document.activeElement === $("#q")) $("#q").blur();
});
$("#btn-refresh").addEventListener("click", async (e) => {
  const b = e.currentTarget;
  b.classList.add("is-spinning"); b.disabled = true;
  await Promise.allSettled([loadWeather(true), loadNews(activeSrc, true), loadCalendar(true)]);
  b.classList.remove("is-spinning"); b.disabled = false;
});
$("#quote-next").addEventListener("click", () => renderQuote(true));
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) { loadWeather(); loadNews(); loadCalendar(); }
});

/* ---------------- boot ---------------- */
tick();
renderQuote();
renderLinks();
renderTasks();
renderFocus();
renderFocusCount();
selectTab(tabs.find((b) => b.dataset.src === activeSrc) || tabs[0]);
loadWeather();
loadCalendar();

// intro only when the tab is visible (a background-opened tab would sit mid-animation)
if (window.gsap && !document.hidden && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  gsap.from([".topbar", ".greeting", ".clock", ".quote", ".search", ".links", ".hero__cards .panel", ".today", ".news"], {
    opacity: 0, y: 12, duration: 0.6, stagger: 0.045, ease: "power3.out", clearProps: "opacity,transform",
  });
}
