// hzOS data layer: storage, caching, weather, news, quotes.
// UI-free so any shell can render it.

/* ---------- storage ---------- */
export const store = {
  get(k, d) { try { const v = localStorage.getItem("hz." + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("hz." + k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem("hz." + k); } catch {} },
};

export const DEFAULT_LINKS = [
  "github | https://github.com",
  "mail | https://mail.google.com",
  "cal | https://calendar.google.com",
  "claude | https://claude.ai",
  "yt | https://www.youtube.com",
  "site | https://www.hantunzaw.dev",
].join("\n");

export const settings = Object.assign(
  { name: "Han", city: "Yangon", h24: true, theme: "lime", links: DEFAULT_LINKS },
  store.get("settings", {}),
);
for (const k of ["calMode", "calKey", "calIds", "icalUrl", "proxy"]) delete settings[k];
export function saveSettings() { store.set("settings", settings); }

export function links() {
  const out = [];
  for (const line of (settings.links || "").split("\n")) {
    const [name, raw] = line.split("|").map((s) => s && s.trim());
    if (!name || !raw) continue;
    try {
      const url = new URL(raw);
      if (/^https?:$/.test(url.protocol)) out.push({ name, url: url.href, host: url.hostname });
    } catch {}
  }
  return out;
}

/* ---------- formatting ---------- */
export const pad = (n) => String(n).padStart(2, "0");
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hhmm = (d) => (settings.h24 ? `${pad(d.getHours())}:${pad(d.getMinutes())}` :
  new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", hour12: true }).format(d).toLowerCase().replace(/\s/g, ""));
export const hourLabel = (d) => (settings.h24 ? `${pad(d.getHours())}h` :
  new Intl.DateTimeFormat(undefined, { hour: "numeric", hour12: true }).format(d).toLowerCase().replace(/\s/g, ""));
export const compact = (n) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
export const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60e3);
  return m < 1 ? "now" : m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
};
export function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 864e5 + 1) / 7);
}
const BLOCKS = "▁▂▃▄▅▆▇█";
export const spark = (vals, lo = Math.min(...vals), hi = Math.max(...vals)) =>
  vals.map((v) => BLOCKS[Math.max(0, Math.min(7, Math.round(((v - lo) / (hi - lo || 1)) * 7)))]).join("");
export const bar = (frac, width = 20) => {
  const f = Math.max(0, Math.min(1, frac));
  const full = Math.round(f * width);
  return "█".repeat(full) + "░".repeat(width - full);
};

/* ---------- fetch with cache ---------- */
export async function getJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
export async function cached(key, ttlMin, loader, force = false) {
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

/* ---------- quotes (unix fortune style) ---------- */
export const QUOTES = [
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
  ["It is not that we have a short time to live, but that we waste a lot of it.", "Seneca"],
];
export function dailyQuoteIndex(now = new Date()) {
  return Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5) % QUOTES.length;
}

/* ---------- weather ---------- */
const WMO = {
  0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "freezing fog",
  51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 61: "light rain", 63: "rain", 65: "heavy rain",
  66: "freezing rain", 67: "freezing rain", 71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains",
  80: "showers", 81: "showers", 82: "violent showers", 85: "snow showers", 86: "snow showers",
  95: "thunderstorm", 96: "thunderstorm", 99: "thunderstorm",
};
const RAINY = [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99];

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
      return { ...pos, name: g.city || g.locality || g.principalSubdivision || "here" };
    }).catch(() => ({ data: { ...pos, name: "here" } }));
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

function guess(d, hourly) {
  const lines = [];
  const peak = hourly.reduce((a, h) => (h.rain > a.rain ? h : a), { rain: 0 });
  if (peak.rain >= 60) lines.push(`rain likely ~${hourLabel(peak.time)}. take an umbrella.`);
  else if (peak.rain >= 30) lines.push(`maybe showers ~${hourLabel(peak.time)}.`);
  else lines.push("dry for the next 12h.");
  const hot = hourly.reduce((a, h) => (h.temp > a.temp ? h : a), { temp: -99 });
  if (d.max >= 34) lines.push(`hot: peaks ${Math.round(d.max)}° ~${hourLabel(hot.time)}. hydrate.`);
  else if (d.max <= 12) lines.push(`cold: ${Math.round(d.max)}° max. layer up.`);
  else if (d.uv >= 8) lines.push(`uv ${Math.round(d.uv)} at midday. sunscreen.`);
  else lines.push(`comfortable, ${Math.round(d.min)}° to ${Math.round(d.max)}°.`);
  return lines.join(" ");
}

export async function fetchWeather(force = false) {
  const place = await resolvePlace(force);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}` +
    "&current=temperature_2m,weather_code,is_day,apparent_temperature,relative_humidity_2m,wind_speed_10m" +
    "&hourly=temperature_2m,precipitation_probability" +
    "&daily=temperature_2m_max,temperature_2m_min,uv_index_max,sunrise,sunset" +
    "&timezone=auto&forecast_days=2";
  const { data: w, t, stale } = await cached(`wx.${place.lat},${place.lon}`, 20, () => getJSON(url), force);
  const code = w.current.weather_code;
  const nowStr = w.current.time.slice(0, 13);
  const start = Math.max(0, w.hourly.time.findIndex((s) => s.slice(0, 13) >= nowStr));
  const hourly = w.hourly.time.slice(start, start + 12).map((s, i) => ({
    time: new Date(s), temp: w.hourly.temperature_2m[start + i], rain: w.hourly.precipitation_probability[start + i] ?? 0,
  }));
  const d = { max: w.daily.temperature_2m_max[0], min: w.daily.temperature_2m_min[0], uv: w.daily.uv_index_max[0] };
  return {
    place, t, stale, code,
    desc: WMO[code] || "unknown",
    temp: w.current.temperature_2m, feels: w.current.apparent_temperature,
    humidity: w.current.relative_humidity_2m, wind: w.current.wind_speed_10m,
    isDay: !!w.current.is_day, ...d, hourly,
    sun: { rise: new Date(w.daily.sunrise[0]), set: new Date(w.daily.sunset[0]) },
    rainy: RAINY.includes(code),
    guess: guess(d, hourly),
  };
}

/* ---------- news ---------- */
const ymdPath = (d) => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
export const FEEDS = {
  hn: {
    label: "hn", ttl: 15,
    async load() {
      const j = await getJSON("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=20");
      return j.hits.map((h) => {
        const url = h.url || `https://news.ycombinator.com/item?id=${h.objectID}`;
        let host = "news.ycombinator.com";
        try { host = new URL(url).hostname.replace(/^www\./, ""); } catch {}
        return { title: h.title, url, meta: `${h.points}pts ${h.num_comments}c ${host}` };
      });
    },
  },
  dev: {
    label: "dev", ttl: 30,
    async load() {
      const j = await getJSON("https://dev.to/api/articles?top=1&per_page=20");
      return j.map((a) => ({ title: a.title, url: a.url, meta: `${a.positive_reactions_count}rx ${a.reading_time_minutes}min @${a.user?.username || ""}` }));
    },
  },
  gh: {
    label: "gh", ttl: 60,
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
    label: "world", ttl: 60,
    async load() {
      const d = new Date();
      const j = await getJSON(`https://en.wikipedia.org/api/rest_v1/feed/featured/${ymdPath(d)}`);
      const strip = (html) => new DOMParser().parseFromString(html, "text/html").body.textContent.trim();
      const news = (j.news || []).map((n) => ({
        title: strip(n.story),
        url: n.links?.[0]?.content_urls?.desktop?.page || "https://en.wikipedia.org/wiki/Portal:Current_events",
        meta: `in the news · ${n.links?.[0]?.normalizedtitle || "wikipedia"}`,
      }));
      // today's most-read list is published with a lag; fall back to yesterday's
      let mostread = j.mostread?.articles;
      if (!mostread?.length) {
        mostread = (await getJSON(`https://en.wikipedia.org/api/rest_v1/feed/featured/${ymdPath(new Date(d - 864e5))}`).catch(() => ({}))).mostread?.articles || [];
      }
      const reads = mostread.filter((a) => a.normalizedtitle !== "Main Page").slice(0, 12).map((a) => ({
        title: a.normalizedtitle + (a.description ? `: ${a.description}` : ""),
        url: a.content_urls?.desktop?.page,
        meta: `most read · ${compact(a.views)} views`,
      }));
      return [...news, ...reads];
    },
  },
};
export function fetchFeed(src, force = false) {
  return cached("news." + src, FEEDS[src].ttl, () => FEEDS[src].load(), force);
}
