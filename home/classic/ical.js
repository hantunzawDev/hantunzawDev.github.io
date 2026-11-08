// Minimal iCalendar (RFC 5545) reader for "what's on today".
// Handles: line folding, all-day + UTC + TZID times, multi-day overlap,
// RRULE FREQ=DAILY|WEEKLY|MONTHLY|YEARLY with INTERVAL, UNTIL, COUNT (daily), BYDAY (weekly),
// EXDATE and RECURRENCE-ID overrides. Not handled: BYSETPOS, BYMONTHDAY lists, ordinal BYDAY (e.g. 2TU).

const DAY = 864e5;
const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function zoned(y, mo, d, h, mi, s, tz) {
  // wall-clock time in `tz` -> Date
  const guess = Date.UTC(y, mo, d, h, mi, s);
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
        .formatToParts(new Date(guess)).map((p) => [p.type, +p.value]),
    );
    const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return new Date(guess - (asUTC - guess));
  } catch {
    return new Date(y, mo, d, h, mi, s);
  }
}

function parseDate(value, params = {}) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h) return { date: new Date(+y, +mo - 1, +d), allDay: true };
  if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)), allDay: false };
  if (params.TZID) return { date: zoned(+y, +mo - 1, +d, +h, +mi, +s, params.TZID), allDay: false };
  return { date: new Date(+y, +mo - 1, +d, +h, +mi, +s), allDay: false };
}

const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const unescape = (s) => s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1");

function readEvents(text) {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = { exdates: [] }; continue; }
    if (line === "END:VEVENT") { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const [name, ...rawParams] = line.slice(0, idx).split(";");
    const params = Object.fromEntries(rawParams.map((p) => p.split("=")));
    const value = line.slice(idx + 1);
    switch (name) {
      case "SUMMARY": cur.title = unescape(value); break;
      case "LOCATION": cur.where = unescape(value); break;
      case "UID": cur.uid = value; break;
      case "STATUS": cur.status = value; break;
      case "DTSTART": cur.start = parseDate(value, params); break;
      case "DTEND": cur.end = parseDate(value, params); break;
      case "DURATION": cur.duration = value; break;
      case "RRULE": cur.rrule = Object.fromEntries(value.split(";").map((p) => p.split("="))); break;
      case "EXDATE": for (const v of value.split(",")) { const p = parseDate(v, params); if (p) cur.exdates.push(ymd(p.date)); } break;
      case "RECURRENCE-ID": cur.recurrenceId = parseDate(value, params); break;
    }
  }
  return events;
}

function durationMs(ev) {
  if (ev.end) return ev.end.date - ev.start.date;
  const m = /P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/.exec(ev.duration || "");
  if (m) return (((+m[1] || 0) * 7 + (+m[2] || 0)) * 24 * 3600 + (+m[3] || 0) * 3600 + (+m[4] || 0) * 60 + (+m[5] || 0)) * 1000 || (ev.start.allDay ? DAY : 0);
  return ev.start.allDay ? DAY : 0;
}

function occursOn(ev, day) {
  // day: local midnight Date. Returns occurrence start Date or null.
  const r = ev.rrule;
  const s = ev.start.date;
  const sDay = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  if (day < sDay) return null;
  const occ = new Date(day.getFullYear(), day.getMonth(), day.getDate(), s.getHours(), s.getMinutes(), s.getSeconds());
  if (r.UNTIL) { const u = parseDate(r.UNTIL); if (u && occ > u.date && ymd(occ) !== ymd(u.date)) return null; }
  const interval = +(r.INTERVAL || 1);
  const days = Math.round((day - sDay) / DAY);
  let ok = false;
  switch (r.FREQ) {
    case "DAILY":
      ok = days % interval === 0;
      if (ok && r.COUNT) ok = days / interval < +r.COUNT;
      break;
    case "WEEKLY": {
      const byday = r.BYDAY ? r.BYDAY.split(",").map((d) => WD[d.slice(-2)]) : [s.getDay()];
      const weekStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
      const weeks = Math.round((weekStart(day) - weekStart(sDay)) / (7 * DAY));
      ok = byday.includes(day.getDay()) && weeks % interval === 0;
      break;
    }
    case "MONTHLY": {
      const months = (day.getFullYear() - s.getFullYear()) * 12 + day.getMonth() - s.getMonth();
      ok = day.getDate() === s.getDate() && months % interval === 0;
      break;
    }
    case "YEARLY":
      ok = day.getMonth() === s.getMonth() && day.getDate() === s.getDate() && (day.getFullYear() - s.getFullYear()) % interval === 0;
      break;
  }
  if (!ok || ev.exdates.includes(ymd(occ))) return null;
  return occ;
}

export function parseICS(text, dayStart, dayEnd) {
  const events = readEvents(text).filter((e) => e.start && e.status !== "CANCELLED");
  // modified instances replace their recurring parent's occurrence
  const overridden = new Set(events.filter((e) => e.recurrenceId).map((e) => e.uid + ymd(e.recurrenceId.date)));
  const out = [];
  for (const ev of events) {
    const dur = durationMs(ev);
    const push = (start) => {
      const end = new Date(+start + dur);
      if (start < dayEnd && (end > dayStart || +end === +start && start >= dayStart)) {
        out.push({ title: ev.title || "(busy)", where: ev.where || "", allDay: ev.start.allDay, start, end });
      }
    };
    if (ev.rrule && !ev.recurrenceId) {
      // check today and, for multi-day spans, the days before it
      const span = Math.ceil(dur / DAY);
      for (let back = 0; back <= span; back++) {
        const day = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() - back);
        const occ = occursOn(ev, day);
        if (occ && !overridden.has(ev.uid + ymd(occ))) push(occ);
      }
    } else {
      push(ev.start.date);
    }
  }
  return out;
}
