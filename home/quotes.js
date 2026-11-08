// Quote engine: built-in packs + custom quotes, context tags, rotation slots.
// Pure module (no DOM, no storage) so it can be tested in node.
//
// Tags (all optional, written like @morning):
//   time of day   @morning (5-12h) @afternoon (12-17h) @evening (17-22h) @night (22-5h)
//   day           @mon @tue @wed @thu @fri @sat @sun @weekday @weekend
//   date          @12-25 (MM-DD)
//   hours         @9-12h (start inclusive, end exclusive; 22-6h wraps midnight)
// Tags in the same group are OR'd, groups are AND'd: "@mon @morning" = monday mornings,
// "@sat @sun" = either weekend day. A quote with no tags is "general".

export const PACKS = {
  dev: [
    ["Simplicity is prerequisite for reliability.", "Edsger W. Dijkstra"],
    ["Make it work, make it right, make it fast.", "Kent Beck"],
    ["The best way to predict the future is to invent it.", "Alan Kay"],
    ["Simple things should be simple, complex things should be possible.", "Alan Kay"],
    ["Programs must be written for people to read, and only incidentally for machines to execute.", "Abelson & Sussman"],
    ["Talk is cheap. Show me the code.", "Linus Torvalds"],
    ["First, solve the problem. Then, write the code.", "John Johnson"],
    ["Premature optimization is the root of all evil.", "Donald Knuth"],
    ["Any fool can write code that a computer can understand. Good programmers write code that humans can understand.", "Martin Fowler"],
    ["There are only two hard things in Computer Science: cache invalidation and naming things.", "Phil Karlton"],
    ["Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away.", "Antoine de Saint-Exupéry"],
    ["Real artists ship.", "Steve Jobs", "@fri"],
  ],
  stoic: [
    ["At dawn, when you have trouble getting out of bed, tell yourself: I have to go to work, as a human being.", "Marcus Aurelius", "@morning"],
    ["Begin at once to live, and count each separate day as a separate life.", "Seneca", "@morning"],
    ["The impediment to action advances action. What stands in the way becomes the way.", "Marcus Aurelius", "@afternoon"],
    ["Waste no more time arguing what a good man should be. Be one.", "Marcus Aurelius"],
    ["First say to yourself what you would be; and then do what you have to do.", "Epictetus", "@mon"],
    ["We suffer more often in imagination than in reality.", "Seneca", "@evening"],
    ["It is not that we have a short time to live, but that we waste a lot of it.", "Seneca", "@evening"],
    ["Let us prepare our minds as if we'd come to the very end of life.", "Seneca", "@night"],
  ],
  motivation: [
    ["Well begun is half done.", "Aristotle", "@morning"],
    ["Nothing will work unless you do.", "Maya Angelou", "@morning"],
    ["Discipline equals freedom.", "Jocko Willink", "@morning @weekday"],
    ["The journey of a thousand miles begins with one step.", "Lao Tzu", "@mon"],
    ["You do not rise to the level of your goals. You fall to the level of your systems.", "James Clear"],
    ["Every action you take is a vote for the type of person you wish to become.", "James Clear"],
    ["Focus is a matter of deciding what things you're not going to do.", "John Carmack", "@afternoon"],
    ["Clarity about what matters provides clarity about what does not.", "Cal Newport", "@afternoon"],
    ["Small deeds done are better than great deeds planned.", "Peter Marshall"],
    ["Energy and persistence conquer all things.", "Benjamin Franklin"],
    ["Stay hungry. Stay foolish.", "Whole Earth Catalog"],
    ["Write it on your heart that every day is the best day in the year.", "Ralph Waldo Emerson", "@01-01"],
  ],
  rest: [
    ["Rest is not idleness.", "John Lubbock", "@weekend"],
    ["Almost everything will work again if you unplug it for a few minutes, including you.", "Anne Lamott", "@night"],
    ["Tomorrow is another day.", "Margaret Mitchell", "@night"],
    ["If you want to go fast, go alone. If you want to go far, go together.", "Proverb", "@weekend"],
  ],
};
export const PACK_NAMES = Object.keys(PACKS);

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const TOD = ["morning", "afternoon", "evening", "night"];
const pad = (n) => String(n).padStart(2, "0");

export function timeOfDay(now) {
  const h = now.getHours();
  return h >= 5 && h < 12 ? "morning" : h >= 12 && h < 17 ? "afternoon" : h >= 17 && h < 22 ? "evening" : "night";
}

// "Ship it. -- Me @fri @evening"  ->  { text, by, tags }
export function parseLine(line) {
  const raw = line.trim();
  if (!raw || raw.startsWith("#")) return null;
  const tags = (raw.match(/(^|\s)@[\w-]+/g) || []).map((t) => t.trim().slice(1).toLowerCase());
  const body = raw.replace(/(^|\s)@[\w-]+/g, "").trim();
  const [text, by] = body.split(/\s+--\s+/);
  if (!text) return null;
  return { text: text.trim(), by: (by || "unknown").trim(), tags };
}
export function formatLine(q) {
  return `${q.text} -- ${q.by}${q.tags.length ? " " + q.tags.map((t) => "@" + t).join(" ") : ""}`;
}

function group(tag) {
  if (TOD.includes(tag)) return "tod";
  if (DAYS.includes(tag) || tag === "weekday" || tag === "weekend") return "day";
  if (/^\d{2}-\d{2}$/.test(tag)) return "date";
  if (/^\d{1,2}-\d{1,2}h$/.test(tag)) return "hours";
  return null; // unknown tags are ignored
}
function tagHolds(tag, now) {
  const d = now.getDay(), h = now.getHours();
  switch (group(tag)) {
    case "tod": return timeOfDay(now) === tag;
    case "day": return tag === "weekday" ? d > 0 && d < 6 : tag === "weekend" ? d === 0 || d === 6 : DAYS[d] === tag;
    case "date": return `${pad(now.getMonth() + 1)}-${pad(now.getDate())}` === tag;
    case "hours": {
      const [a, b] = tag.slice(0, -1).split("-").map(Number);
      return a <= b ? h >= a && h < b : h >= a || h < b;
    }
    default: return true;
  }
}
// true / false for tagged quotes, null for general (untagged or only unknown tags)
export function matches(q, now) {
  const groups = {};
  for (const t of q.tags) { const g = group(t); if (g) (groups[g] ||= []).push(t); }
  const keys = Object.keys(groups);
  if (!keys.length) return null;
  return keys.every((g) => groups[g].some((t) => tagHolds(t, now)));
}

export function contextLabel(now) {
  return `${timeOfDay(now)} · ${DAY_NAMES[now.getDay()]}`;
}

export const ROTATIONS = { visit: "every visit", "30m": "every 30 min", hourly: "hourly", daily: "daily" };
export function slotKey(rotation, now) {
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (rotation === "daily") return day;
  if (rotation === "hourly") return `${day}T${pad(now.getHours())}`;
  if (rotation === "30m") return `${day}T${pad(now.getHours())}:${now.getMinutes() < 30 ? "00" : "30"}`;
  return null; // visit: not deterministic
}
// small deterministic PRNG from a string
function rng(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1e6) / 1e6; };
}

export function pool({ packs = PACK_NAMES, custom = "" } = {}) {
  const out = [];
  for (const p of packs) for (const [text, by, tags = ""] of PACKS[p] || []) out.push({ text, by, tags: tags ? tags.split(/\s+/).map((t) => t.slice(1)) : [], source: p });
  custom.split("\n").forEach((l) => { const q = parseLine(l); if (q) out.push({ ...q, source: "custom" }); });
  return out;
}

/**
 * Pick a quote for `now`.
 * opts: { rotation, match, packs, custom, salt }
 * returns { quote, why } where why explains the choice for `quote now`.
 */
export function pick(now = new Date(), opts = {}) {
  const { rotation = "hourly", match = true, salt = 0 } = opts;
  const all = pool(opts);
  if (!all.length) return { quote: { text: "No quotes enabled. Turn on a pack or add your own in config.", by: "hzOS", tags: [] }, why: "empty pool" };
  const slot = slotKey(rotation, now);
  const rand = slot ? rng(`${slot}#${salt}`) : Math.random;
  let fits, general;
  if (match) {
    fits = all.filter((q) => matches(q, now) === true);
    general = all.filter((q) => matches(q, now) === null);
  } else {
    fits = [];
    general = all;
  }
  let from, reason;
  if (fits.length && (!general.length || rand() < 0.7)) { from = fits; reason = `matches ${contextLabel(now)}`; }
  else { from = general.length ? general : all; reason = match ? "general (no time/day tags)" : "context matching off"; }
  const quote = from[Math.floor(rand() * from.length)];
  const rot = ROTATIONS[rotation] || rotation;
  return { quote, why: `${reason} · picked from ${from.length} of ${all.length} · rotates ${rot}` };
}

// flat list of every built-in quote, for the typing test
export const QUOTES = Object.values(PACKS).flat().map(([text, by]) => [text, by]);
