// Easter eggs for visitors who try to hack the site. Shared by the landing terminal (hzsh),
// hzOS and the 404 honeypot page.
// Rules: every reply is obviously a joke, nothing typed is ever executed, nothing is logged or
// sent anywhere. The "hacker meter" lives in sessionStorage and resets when the tab closes.

/* ---------- hacker meter ---------- */
const KEY = "hzsite.heat";
const RANKS = [
  [0, "visitor"],
  [1, "script kiddie"],
  [3, "pentester"],
  [5, "l33t"],
  [8, "please just apply"],
];
export const MAX_HEAT = RANKS[RANKS.length - 1][0];
const RED_AT = 3; // the prompt turns red from "pentester" up

export function heat() {
  try { return Math.max(0, parseInt(sessionStorage.getItem(KEY), 10) || 0); } catch { return 0; }
}
export function rankOf(n = heat()) {
  let r = RANKS[0][1];
  for (const [at, name] of RANKS) if (n >= at) r = name;
  return r;
}
export function meter(n = heat()) {
  const full = n >= MAX_HEAT ? 5 : n > 0 ? Math.min(4, Math.max(1, Math.round((n / MAX_HEAT) * 5))) : 0; // full only at the top rank
  return `threat level ${"▮".repeat(full)}${"▯".repeat(5 - full)} ${rankOf(n)}`;
}
// marks <html> so each shell's CSS can turn its prompt red
export function applyHeat(n = heat()) { document.documentElement.classList.toggle("hacker", n >= RED_AT); }

// one more attempt: returns the new count and whether the visitor just reached a new rank
export function bump() {
  const before = heat(), n = before + 1;
  try { sessionStorage.setItem(KEY, String(n)); } catch { /* private mode: the meter just won't persist */ }
  applyHeat(n);
  return { n, rankUp: rankOf(n) !== rankOf(before) ? rankOf(n) : null, maxed: n === MAX_HEAT };
}

// the lines a shell prints after a joke: the meter, a rank-up, and the pitch at the top rank
export function meterLines({ n, rankUp, maxed }) {
  const lines = [meter(n)];
  if (rankUp && !maxed) lines.push(`rank up: ${rankUp}.`);
  if (maxed) lines.push("rank up: please just apply.", "you clearly like breaking things. I build things that don't break. let's talk:");
  return lines;
}

/* ---------- detector ---------- */
const RECON = new Set(["nmap", "sqlmap", "hydra", "nikto", "ssh", "nc", "netcat", "telnet", "ftp", "msfconsole", "metasploit", "burp", "burpsuite", "john", "hashcat", "gobuster", "dirb", "wpscan", "masscan", "aircrack-ng"]);
const LOGIN = new Set(["login", "admin", "root", "password", "passwd", "su", "logon"]);

// each rule: [kind, test(line, first), lines(line)]; first match wins, most specific first
const RULES = [
  ["forkbomb", (l) => /:\s*\(\s*\)\s*\{[^}]*:\s*\|\s*:\s*&[^}]*\}\s*;?\s*:/.test(l),
    () => ["fork bomb detected.", "I'm a static site. I have no forks, only spoons. 🥄"]],
  ["xss", (l) => /<\s*\/?\s*(script|img|svg|iframe|body|object|embed|style|a)\b|\bon(error|load|click|mouseover|focus)\s*=|javascript\s*:|document\.cookie/i.test(l),
    () => ["nice try. that <script> got escaped faster than I escape meetings.", "everything here is rendered as plain text. no scripts were harmed."]],
  ["sqli", (l) => /['"]\s*(or|and)\s+['"]?\w+['"]?\s*=\s*['"]?\w+|\bunion\s+(all\s+)?select\b|\bdrop\s+(table|database)\b|;\s*--/i.test(l),
    () => ["there's no database here. just vibes and static files.", "little bobby tables would be proud, though."]],
  ["traversal", (l) => /\.\.[/\\]|\/etc\/(passwd|shadow)|%2e%2e/i.test(l),
    () => ["root:x:0:0:han:/home/han:/bin/coffee", "you:x:1000:1000:curious visitor:/dev/null:/bin/nope", "# that's the whole file. it's a static site."]],
  ["proto", (l) => /__proto__|\bprototype\b|\bconstructor\b/.test(l),
    () => ["prototype pollution? this shell is gluten-free and pollution-free."]],
  ["pipe", (l) => /\b(curl|wget)\b.*\|\s*(sudo\s+)?(ba|z)?sh\b/i.test(l),
    () => ["piping curl into sh, on a stranger's website? bold.", "request denied by the department of good decisions."]],
  ["chmod", (l) => /\bchmod\s+(-R\s+)?777\b/i.test(l),
    () => ["chmod 777: permissions granted to everyone, including the cat.", "the cat said no."]],
  ["eval", (l) => /\beval\s*\(|\bnew\s+Function\b|\balert\s*\(/i.test(l),
    () => ["eval? in this economy?", "this terminal reads your input. it never runs it."]],
  ["recon", (l, f) => RECON.has(f),
    (l) => [`starting ${l.split(/\s+/)[0]} against hantunzaw.dev …`, "PORT      STATE  SERVICE", "443/tcp   open   portfolio", "1337/tcp  open   hiring-manager", "scan complete. the only open port leads to my inbox."]],
  ["login", (l, f) => LOGIN.has(f) && l.split(/\s+/).length <= 3,
    () => ["there's no login here. nothing to brute-force but my patience.", "hint: the password is 'please'. it still won't work."]],
  ["overflow", (l) => l.length > 500,
    (l) => ["buffer overflow attempt detected.", `buffer: fine. me: impressed. that was ${l.length.toLocaleString()} characters.`]],
];

// returns { kind, lines } when the input looks like an attack, otherwise null
export function sniff(raw) {
  const line = String(raw).trim();
  if (!line) return null;
  const first = line.split(/\s+/)[0].toLowerCase();
  for (const [kind, test, lines] of RULES) if (test(line, first)) return { kind, lines: lines(line) };
  return null;
}

// calculator input that is really JavaScript (hzOS `= alert(1)`)
export function calcJoke(expr) {
  const m = /\b(alert|prompt|confirm|eval|fetch|document|window|constructor|import|require|process)\b/i.exec(expr);
  return m ? [`this calculator only does math. ${m[1]}(…) = 0 ${m[1]}s.`] : null;
}

/* ---------- devtools ---------- */
export function consoleBait() {
  console.log(
    '%cconst SECRET_API_KEY = "hz_nope_this_is_not_a_key";%c\n// if you went looking for this, you\'d fit right in. say hi: https://www.hantunzaw.dev/#contact',
    "font: 600 12px ui-monospace, monospace; color: #ff6b57",
    "font: 12px ui-monospace, monospace; color: inherit",
  );
}
