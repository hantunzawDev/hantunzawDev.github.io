// hantunzaw.dev terminal home. No build step, no dependencies.
// Content lives in ME below: edit it there, the commands render from it.
import { PORTRAIT } from "./portrait.js";
import { sniff, bump, heat, reaction, applyHeat, consoleBait, MAX_HEAT } from "./eggs.js";

/* ---------- content ---------- */
const ME = {
  name: "Han Tun Zaw",
  role: "Software Engineer",
  base: "Bangkok, TH",
  tz: "Asia/Bangkok",
  since: new Date(2019, 7, 1), // first dev job, Aug 2019
  email: "dev.hantunzaw@gmail.com",
  github: "https://github.com/hantunzawDev",
  linkedin: "https://www.linkedin.com/in/hantunzaw/",
  resume: "Resume-HanTunZaw.pdf",
  about: [
    "I'm Han, a mobile developer based in Bangkok.",
    "Right now I'm at Orange Cap Innovative, working on TAGTHAi, a travel super app: passes and tickets, QR access, and the buying and payment flows behind them.",
    "Before that I built Flutter apps for Android and iOS, and did my share of full-stack web along the way: WordPress, WooCommerce, Odoo and Drupal.",
    "Most of my work is B2B and confidential, so the details live in conversations rather than public repos. Ask me about payment flows, screenshot protection, or wiring Flutter into an ERP.",
  ],
  education: { what: "Pearson BTEC HND in Computing", where: "EduClaas" },
  work: [
    { when: "Aug 2023 - Present", co: "Orange Cap Innovative", role: "Software Engineer (Mobile)", did: "TAGTHAi travel and merchant apps: passes, tickets, QR access and payments. Flutter project upkeep, code reviews, testing." },
    { when: "Jan 2023 - May 2023", co: "Ethical Digit", role: "Senior Flutter Developer", did: "E-book app with in-app purchases, screenshot protection and one-device login." },
    { when: "Jan 2022 - Jul 2023", co: "Asaygo", role: "Senior Flutter Developer", did: "Redesigned the app in Figma, then rebuilt it: responsive layouts, third-party APIs, code reviews." },
    { when: "Nov 2021 - Jan 2022", co: "eWhale Myanmar", role: "Flutter Developer", did: "Flutter e-commerce app on top of WooCommerce, with secure payment gateways." },
    { when: "Aug 2020 - Nov 2021", co: "7th Computing", role: "Full-stack Developer", did: "Flutter apps for Android and iOS, Odoo ERP customisation, WordPress integration." },
    { when: "Mar 2020 - Aug 2021", co: "Resonance Pte Ltd", role: "WordPress Developer", did: "Custom WordPress and WooCommerce sites and plugins." },
    { when: "Aug 2019 - Mar 2020", co: "Zino Tech", role: "Junior Web Developer", did: "Client sites in Drupal, PHP, Vue, jQuery and Twig." },
  ],
  projects: [
    { name: "TAGTHAi", at: "Orange Cap", tags: "Flutter · BLoC · Modular", did: "Travel super app. I work on the pass and ticket system and the buying and payment flows, making activation, QR access and checkout smoother and more reliable." },
    { name: "TAGTHAi Merchant", at: "Orange Cap", tags: "Flutter · GetX · Modular", did: "The partner side: managing tourist passes, validating tickets and confirming payments. I streamlined the flows and tuned performance for stores and service providers." },
    { name: "ChoChoLay Zay", at: "Asaygo", tags: "Flutter · GetX · Material UI · Figma", did: "C2C marketplace with maps and secure chat for local buyers and sellers." },
    { name: "DuDuZayWal", at: "eWhale", tags: "Flutter · WooCommerce · GetX · FlutterFlow", did: "Shopping app that connects to WordPress and WooCommerce, browsing several online stores in one place." },
    { name: "WB Work Day", at: "7th Computing", tags: "Flutter · Odoo · REST", did: "HR and ERP app for Win Brother on Odoo: people, HR and Odoo management in one platform." },
    { name: "BOC", at: "7th Computing", tags: "Flutter · Odoo · REST", did: "ERP client on Odoo covering HR, operations and fleet management." },
  ],
  stack: {
    mobile: "Dart, Flutter, Kotlin, Swift · BLoC, GetX, Modular",
    ui: "Material UI, GetX UI, Bootstrap",
    web: "TypeScript, JavaScript, HTML, CSS/SCSS, PHP, SQL",
    platforms: "WordPress, WooCommerce, Odoo, Drupal, Three.js",
    tools: "VS Code, Git, Sourcetree, Node.js",
    design: "Figma, Inkscape, Photoshop",
  },
};

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// look up typed input as an own key only, so `__proto__` or `constructor` never hit Object.prototype
const own = (o, k) => (Object.hasOwn(o, k) ? o[k] : undefined);
const store = {
  get(k, d) { try { const v = localStorage.getItem("hzsite." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("hzsite." + k, JSON.stringify(v)); } catch {} },
};
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const raf = () => new Promise((r) => requestAnimationFrame(r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GLYPHS = "!<>-_\\/[]{}=+*^?#01";

const screen = $("#screen"), log = $("#log"), input = $("#cmd"), form = $("#form");
const portraitEl = $("#portrait");

function fmtTime(d, opts) {
  return new Intl.DateTimeFormat(undefined, { timeZone: ME.tz, ...opts }).format(d);
}
function uptime() {
  const now = new Date();
  let m = (now.getFullYear() - ME.since.getFullYear()) * 12 + now.getMonth() - ME.since.getMonth();
  return `${Math.floor(m / 12)}y ${m % 12}mo building software`;
}

/* ---------- theme ---------- */
const THEMES = ["lime", "amber", "ice", "purple"];
function setTheme(t) {
  if (!THEMES.includes(t)) return false;
  if (t === "lime") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  $("#st-theme").textContent = t;
  store.set("theme", t);
  return true;
}
setTheme(store.get("theme", "lime"));

/* ---------- portrait ---------- */
let portraitSize = null;
// brightest glyphs render near-white so the face reads as light, not just as dense
const HOT = /[%#&@*o]+/g;
const paint = (lines) => { portraitEl.innerHTML = esc(lines.join("\n")).replace(/&amp;/g, "\u0000").replace(HOT, (m) => `<span class="hot">${m}</span>`).replace(/\u0000/g, (_) => "<span class=\"hot\">&amp;</span>"); };
const measure = (() => {
  const c = document.createElement("canvas").getContext("2d");
  return (px) => { c.font = `400 ${px}px "Martian Mono", ui-monospace, monospace`; return c.measureText("M".repeat(20)).width / 20; };
})();
function pickPortrait() {
  const hero = $(".hero");
  const narrow = innerWidth <= 860;
  const avail = narrow ? hero.clientWidth : Math.min(hero.clientWidth * 0.56, 640);
  const perPx = measure(100) / 100; // char width per 1px of font-size
  for (const key of ["lg", "md", "sm"]) {
    const cols = Math.max(...PORTRAIT[key].split("\n").map((l) => l.length));
    const rows = PORTRAIT[key].split("\n").length;
    const maxH = screen.clientHeight * (narrow ? 0.62 : 0.74); // keep the prompt in view
    const fs = Math.min(9, avail / (cols * perPx), maxH / (rows * 2 * perPx));
    if (fs >= 6 || key === "sm") return { key, fs: Math.max(4, fs), lines: PORTRAIT[key].split("\n") };
  }
}
function layoutPortrait(text = true) {
  const p = pickPortrait();
  portraitEl.style.setProperty("--pfs", p.fs.toFixed(2) + "px");
  portraitEl.style.setProperty("--rows", p.lines.length);
  if (text && p.key !== portraitSize) paint(p.lines);
  portraitSize = p.key;
  return p;
}
async function drawPortrait() {
  const p = layoutPortrait(false);
  if (reduced) { paint(p.lines); return; }
  const out = p.lines.map(() => "");
  const scramble = (l) => l.replace(/\S/g, () => GLYPHS[(Math.random() * GLYPHS.length) | 0]);
  const PER_FRAME = Math.max(2, Math.ceil(p.lines.length / 34)); // ~0.6s total
  for (let i = 0; i < p.lines.length + PER_FRAME; i += PER_FRAME) {
    for (let j = i; j < i + PER_FRAME && j < p.lines.length; j++) out[j] = scramble(p.lines[j]);
    for (let j = i - PER_FRAME; j < i && j >= 0; j++) out[j] = p.lines[j];
    portraitEl.textContent = out.join("\n");
    await raf();
  }
  paint(p.lines);
}
let rt;
addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { layoutPortrait(); sizeLabel(); }, 120); });

/* ---------- output ---------- */
function entry(cmd, html, { scroll = true } = {}) {
  const e = document.createElement("div");
  e.className = "entry";
  e.innerHTML = (cmd != null ? `<div class="cmdline"><span class="ps1">echo@hantunzaw.dev</span><span class="dim">:</span><span class="ps-path">~</span><span class="dim">$</span> ${esc(cmd)}</div>` : "") +
    (html ? `<div class="out">${html}</div>` : "");
  log.append(e);
  if (scroll) e.scrollIntoView({ block: "start" }); // instant: keyboard-driven, repeated many times
  return e;
}
const run = (c) => `<button type="button" class="inline" data-run="${esc(c)}">${esc(c)}</button>`;
const link = (href, label = href) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>`;

/* ---------- commands ---------- */
const FILES = { "about.txt": "about", "work.log": "work", "education.txt": "education", "projects/": "projects", "stack.json": "stack", "contact.vcf": "contact", "resume.pdf": "resume", "hzos/": "hzos" };
const HELP = [
  ["about", "who I am"], ["work", "where I've worked"], ["education", "where I studied"], ["projects", "things I've shipped"], ["stack", "languages and tools"],
  ["contact", "how to reach me"], ["resume", "open my resume (PDF)"], ["email", "copy my email address"],
  ["github", "open GitHub"], ["linkedin", "open LinkedIn"], ["hzos", "boot my browser home page OS"],
  ["ls · cat <file>", "browse the home dir"], ["theme lime|amber|ice|purple", "change phosphor"],
  ["banner", "redraw the portrait"], ["history · clear", "shell stuff"],
];

const COMMANDS = {
  help: () => `<div class="grid">${HELP.map(([c, d]) => `<span>${run(c.split(" ")[0])}${esc(c.slice(c.split(" ")[0].length))} <span class="dim">${esc(d)}</span></span>`).join("")}</div>\n<span class="dim">Some commands aren't listed. Poke around.</span>`,
  about: () => ME.about.map(esc).join("\n\n") + `\n\n<span class="dim">next:</span> ${run("work")} ${run("projects")} ${run("contact")}`,
  whoami: () => COMMANDS.about(),
  education: () => `<b>${esc(ME.education.what)}</b> <span class="dim">·</span> ${esc(ME.education.where)}\n<span class="dim">The rest I learned shipping apps since 2019:</span> ${run("work")}`,
  work: () => ME.work.map((j) => `<div class="job"><span class="when">${esc(j.when)}</span><span><b>${esc(j.co)}</b> <span class="acc">${esc(j.role)}</span>\n${esc(j.did)}</span></div>`).join("") +
    `\n<span class="dim">Full history in the</span> ${run("resume")}<span class="dim">.</span>`,
  projects: () => ME.projects.map((p) => `<div class="job"><span class="when">${esc(p.at)}</span><span><b>${esc(p.name)}</b> <span class="dim">${esc(p.tags)}</span>\n${esc(p.did)}</span></div>`).join("") +
    `\n<span class="warn">!</span> <span class="dim">These are client projects under NDA, so there are no public links. Happy to walk through them on a call:</span> ${run("contact")}`,
  stack: () => `<span class="dim">{</span>\n` + Object.entries(ME.stack).map(([k, v]) => `  <span class="acc">"${esc(k)}"</span>: "${esc(v)}"`).join(",\n") + `\n<span class="dim">}</span>`,
  contact: () => `<b>email</b>     ${link("mailto:" + ME.email, ME.email)} <span class="dim">or</span> ${run("email")} <span class="dim">to copy</span>\n<b>linkedin</b>  ${link(ME.linkedin, "in/hantunzaw")}\n<b>github</b>    ${link(ME.github, "hantunzawDev")}\n<b>based</b>     ${esc(ME.base)} · ${fmtTime(new Date(), { hour: "2-digit", minute: "2-digit" })} local`,
  email: async () => {
    try { await navigator.clipboard.writeText(ME.email); return `<span class="acc">copied</span> ${esc(ME.email)} to your clipboard.`; }
    catch { return `Clipboard is blocked here. It's ${link("mailto:" + ME.email, ME.email)}.`; }
  },
  resume: () => { open(ME.resume, "_blank", "noopener"); return `Opening ${link(ME.resume, "resume.pdf")} in a new tab.`; },
  github: () => { open(ME.github, "_blank", "noopener"); return `Opening ${link(ME.github)}`; },
  linkedin: () => { open(ME.linkedin, "_blank", "noopener"); return `Opening ${link(ME.linkedin)}`; },
  hzos: () => { pendingLaunch = true; return `<span class="dim">hzOS is the tiny operating system I use as my browser home page. Handing this session over…</span>`; },
  ls: () => Object.keys(FILES).map((f) => f.endsWith("/") ? `<span class="acc">${esc(f)}</span>` : esc(f)).join("   "),
  cat: (a) => {
    if (!a) return `<span class="err">cat: missing file.</span> Try ${run("ls")}`;
    const c = own(FILES, a) || own(FILES, a + "/");
    if (!c) return `<span class="err">cat: ${esc(a)}: No such file or directory</span>`;
    if (a.endsWith("/") || own(FILES, a + "/")) return `<span class="err">cat: ${esc(a)}: Is a directory.</span> Showing it anyway:\n\n` + COMMANDS[c]();
    return COMMANDS[c]();
  },
  cd: (a) => (!a || a === "~") ? "" : own(FILES, a) || own(FILES, a + "/") ? `<span class="dim">Nice try. This shell only has one room.</span> ${run(own(FILES, a) || own(FILES, a + "/"))}` : `<span class="err">cd: no such directory: ${esc(a)}</span>`,
  pwd: () => "/home/han",
  date: () => `${esc(fmtTime(new Date(), { dateStyle: "full", timeStyle: "long" }))} <span class="dim">(Han's time)</span>`,
  echo: (a) => esc(a),
  theme: (a) => !a ? `current: <span class="acc">${esc(store.get("theme", "lime"))}</span> · try ${THEMES.map((t) => run("theme " + t)).join(" ")}` :
    setTheme(a) ? `phosphor set to <span class="acc">${esc(a)}</span>` : `<span class="err">theme: unknown "${esc(a)}".</span> Pick ${THEMES.join(", ")}.`,
  banner: async () => { portraitSize = null; screen.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" }); await drawPortrait(); return ""; },
  neofetch: () => COMMANDS.banner(),
  history: () => hist.length ? hist.map((h, i) => `<span class="dim">${String(i + 1).padStart(3)}</span>  ${esc(h)}`).join("\n") : "<span class=\"dim\">empty</span>",
  clear: () => { log.innerHTML = ""; return null; },
  sudo: () => `<span class="err">han is the only user in the sudoers file.</span> This incident will be reported.\n` + heatHtml(),
  rm: (a) => /-rf?\s*\//.test(a) ? `<span class="warn">rm: refusing to remove "/".</span> I worked hard on this site.\n` + heatHtml() : `<span class="err">rm: permission denied</span>`,
  hack: () => heat() ? `<span class="warn">${heat()} attempt${heat() === 1 ? "" : "s"} this session. last thing I said: "${esc(reaction())}"</span>` +
    (heat() >= MAX_HEAT ? `\nYou've seen everything. Next step: ${run("contact")}` : `\n<span class="dim">Keep poking. There are more eggs in here.</span>`) :
    `<span class="dim">you haven't actually tried anything yet. go on, I patched it.</span>`,
  vim: () => `<span class="dim">You're now stuck in vim. Just kidding.</span> Type ${run("help")}.`,
  exit: () => `<span class="dim">There's no leaving.</span> But if you must: ${link(ME.linkedin, "say hi on LinkedIn")} first.`,
  hello: () => `Hey! Start with ${run("about")}.`,
  hi: () => COMMANDS.hello(),
  matrix: () => { matrix(); return `<span class="dim">wake up, visitor... (any key to exit)</span>`; },
};
const ALIASES = { "?": "help", man: "help", edu: "education", school: "education", study: "education", experience: "work", jobs: "work", skills: "stack", cv: "resume", mail: "email", home: "hzos", startx: "hzos", boot: "hzos", cls: "clear", ll: "ls", dir: "ls" };

// closest command by edit distance, for typos like "wrok" or "projcts"
function suggest(w) {
  const d = (a, b) => {
    const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) m[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return m[a.length][b.length];
  };
  let best = null, bd = 3;
  for (const c of [...Object.keys(COMMANDS), ...Object.keys(ALIASES)]) { const x = d(w, c); if (x < bd) { bd = x; best = ALIASES[c] || c; } }
  return best;
}

// one more hack attempt: a cheekier reaction each time, and the "let's talk" pitch once
function heatHtml() {
  const b = bump();
  return `<span class="acc">${esc(b.line)}</span>` + (b.maxed ? ` ${run("contact")}` : "");
}

const hist = [];
let hIdx = 0;

async function exec(raw, { record = true } = {}) {
  const line = raw.trim();
  if (record && line) { hist.push(line); hIdx = hist.length; }
  if (!line) { entry("", ""); return; }
  const egg = sniff(line);
  if (egg) { entry(line, `<span class="warn">${egg.lines.map(esc).join("\n")}</span>\n` + heatHtml()); return; }
  const [first, ...rest] = line.split(/\s+/);
  const name = own(ALIASES, first.toLowerCase()) || first.toLowerCase();
  const arg = rest.join(" ");
  const fn = own(COMMANDS, name);
  let html;
  if (!fn) {
    const guess = suggest(first.toLowerCase());
    html = `<span class="err">hzsh: command not found: ${esc(first)}</span>\n` + (guess ? `Did you mean ${run(guess)}? Or see ${run("help")}.` : `No worries. ${run("help")} lists everything.`);
  }
  else html = await fn(arg);
  if (html === null) return; // clear
  entry(line, html);
  if (pendingLaunch) { pendingLaunch = false; launchHzos(); return; }
  if (fn && ["about", "work", "education", "projects", "stack", "contact"].includes(name)) history.replaceState(null, "", "#" + name);
}

/* ---------- input ---------- */
form.addEventListener("submit", (e) => { e.preventDefault(); const v = input.value; input.value = ""; exec(v); });
input.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp") { if (hIdx > 0) input.value = hist[--hIdx]; e.preventDefault(); }
  else if (e.key === "ArrowDown") { hIdx = Math.min(hist.length, hIdx + 1); input.value = hist[hIdx] || ""; e.preventDefault(); }
  else if (e.key === "Tab") {
    e.preventDefault();
    const v = input.value;
    const parts = v.split(" ");
    const pool = parts.length > 1 ? (parts[0] === "theme" ? THEMES : Object.keys(FILES)) : Object.keys(COMMANDS);
    const cur = parts[parts.length - 1];
    const m = pool.filter((c) => c.startsWith(cur));
    if (m.length === 1) { parts[parts.length - 1] = m[0]; input.value = parts.join(" ") + (parts.length === 1 ? " " : ""); }
    else if (m.length > 1) entry(v, m.map(esc).join("   "));
  } else if (e.key === "l" && e.ctrlKey) { e.preventDefault(); log.innerHTML = ""; }
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-run]");
  if (b) { exec(b.dataset.run); if (matchMedia("(pointer: fine)").matches) input.focus({ preventScroll: true }); return; }
  if (e.target.closest("a, button, input")) return;
  if (!getSelection().toString() && matchMedia("(pointer: fine)").matches) input.focus({ preventScroll: true });
});
addEventListener("keydown", (e) => {
  if (document.documentElement.classList.contains("booting")) return;
  if (document.activeElement === input || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key.length === 1 || e.key === "/") { if (e.key === "/") e.preventDefault(); input.focus({ preventScroll: true }); }
});

/* ---------- chrome: clock, size, last login ---------- */
function sizeLabel() {
  const cw = measure(13);
  $("#tb-size").textContent = `${Math.floor(screen.clientWidth / cw)}x${Math.floor(screen.clientHeight / (13 * 1.6))}`;
}
function tick() {
  const now = new Date();
  $("#clock").textContent = fmtTime(now, { hour: "2-digit", minute: "2-digit" });
  $("#st-time").textContent = fmtTime(now, { hour: "2-digit", minute: "2-digit", weekday: "short" }) + " ICT";
  $("#uptime").textContent = uptime() + " (since 2019)";
}
const last = store.get("last", null);
$("#last-login").textContent = last
  ? new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(last))
  : new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date());
$("#from").textContent = last ? "a previous visit. welcome back." : "your browser · first session";
store.set("last", Date.now());

/* ---------- matrix ---------- */
function matrix() {
  if (reduced) return;
  const cv = document.createElement("canvas");
  cv.className = "matrix"; cv.setAttribute("aria-hidden", "true");
  document.body.append(cv);
  const ctx = cv.getContext("2d");
  const dpr = Math.min(2, devicePixelRatio || 1);
  const fs = 14;
  let cols, drops;
  const size = () => { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.scale(dpr, dpr); cols = Math.ceil(innerWidth / fs); drops = Array.from({ length: cols }, () => Math.random() * -40); };
  size();
  const acc = getComputedStyle(document.documentElement).getPropertyValue("--acc").trim();
  const chars = "ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ012345789Z:.=*+-<>|HANTUNZAW";
  let alive = true, t = 0;
  const loop = (ts) => {
    if (!alive) return;
    if (ts - t > 50) {
      t = ts;
      ctx.fillStyle = "rgba(0,0,0,0.08)"; ctx.fillRect(0, 0, innerWidth, innerHeight);
      ctx.font = `${fs}px "Martian Mono", monospace`;
      for (let i = 0; i < cols; i++) {
        const y = drops[i] * fs;
        ctx.fillStyle = Math.random() > 0.96 ? "#fff" : acc;
        ctx.fillText(chars[(Math.random() * chars.length) | 0], i * fs, y);
        drops[i] = y > innerHeight && Math.random() > 0.975 ? 0 : drops[i] + 1;
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const stop = () => { alive = false; cv.remove(); removeEventListener("keydown", stop, true); input.focus({ preventScroll: true }); };
  setTimeout(() => { addEventListener("keydown", stop, true); cv.addEventListener("click", stop); }, 300);
}

/* ---------- hzOS hand-off ---------- */
// `hzos` stops this shell, collapses the window like a CRT switching off,
// and hzOS at /home/ picks up from the same dot with a power-on.
let pendingLaunch = false, launching = false;
const HANDOFF = [
  ["[ <span class=\"ok\">OK</span> ] stopping hzsh session", ""],
  ["[ <span class=\"ok\">OK</span> ] flushing scrollback", ""],
  ["loading hzOS kernel  ", "bar"],
  ["switching tty1 -> hzos", "dim"],
];
async function launchHzos() {
  if (launching) return;
  launching = true;
  const theme = store.get("theme", "lime");
  const url = "home/?via=hzsh" + (theme !== "lime" ? "&theme=" + theme : "");
  const pf = document.createElement("link"); pf.rel = "prefetch"; pf.href = "home/"; document.head.append(pf);
  input.disabled = true;
  if (reduced) { location.href = url; return; }

  let skip = false;
  const onSkip = () => { skip = true; };
  addEventListener("keydown", onSkip, { once: true });
  addEventListener("pointerdown", onSkip, { once: true });
  const out = entry(null, "").appendChild(Object.assign(document.createElement("div"), { className: "out handoff" }));
  for (const [txt, kind] of HANDOFF) {
    if (skip) break;
    const ln = document.createElement("div");
    if (kind === "dim") ln.className = "dim";
    ln.innerHTML = txt;
    out.append(ln);
    ln.scrollIntoView({ block: "end" });
    if (kind === "bar") {
      const b = document.createElement("span"); b.className = "acc"; ln.append(b);
      for (let i = 0; i <= 20 && !skip; i++) { b.textContent = "[" + "#".repeat(i) + ".".repeat(20 - i) + "]"; await sleep(16); }
    } else await sleep(90);
  }
  removeEventListener("keydown", onSkip); removeEventListener("pointerdown", onSkip);
  if (!skip) await sleep(180);
  document.documentElement.classList.add("powering-off");
  await sleep(760); // matches the crt-off keyframes
  location.href = url;
}
// coming back with the back button restores this page from bfcache mid-collapse
addEventListener("pageshow", (e) => {
  if (!e.persisted) return;
  document.documentElement.classList.remove("powering-off");
  launching = false; input.disabled = false;
});

/* ---------- boot ---------- */
const BOOT = [
  ["hzBIOS 3.0 (c) Han Tun Zaw", ""],
  ["cpu0: caffeine-powered @ 3.40GHz, 8 cores", "dim"],
  ["mem: 16384MB ok", "dim"],
  ["[ <span class=\"ok\">OK</span> ] mounted /home/han", ""],
  ["[ <span class=\"ok\">OK</span> ] started flutter-daemon.service", ""],
  ["[ <span class=\"ok\">OK</span> ] reached target network (bkk-1)", ""],
  ["[<span class=\"warn\">WARN</span>] coffee level low, continuing anyway", ""],
  ["decrypting profile.gpg  ", "bar"],
  ["establishing session with visitor@" + location.hostname.replace(/^www\./, "") + " ...", ""],
];
async function boot() {
  const box = $("#boot"), pre = $("#boot-log");
  let skip = false;
  const onSkip = () => { skip = true; };
  addEventListener("keydown", onSkip, { once: true });
  addEventListener("pointerdown", onSkip, { once: true });
  for (const [txt, kind] of BOOT) {
    if (skip) break;
    const ln = document.createElement("div");
    if (kind === "dim") ln.className = "dim";
    ln.innerHTML = txt;
    pre.append(ln);
    if (kind === "bar") {
      const b = document.createElement("span"); ln.append(b);
      for (let i = 0; i <= 24 && !skip; i++) { b.textContent = "[" + "#".repeat(i) + ".".repeat(24 - i) + "] " + Math.round(i / 24 * 100) + "%"; await sleep(22); }
    } else await sleep(70 + Math.random() * 70);
  }
  if (!skip) {
    const g = document.createElement("div"); g.innerHTML = '<span class="grant">ACCESS GRANTED</span>'; pre.append(g);
    await sleep(400);
  }
  removeEventListener("keydown", onSkip); removeEventListener("pointerdown", onSkip);
  box.classList.add("done");
  await sleep(skip ? 0 : 200);
  document.documentElement.classList.remove("booting");
}

/* ---------- start ---------- */
async function start() {
  try { sessionStorage.setItem("hzsite.booted", "1"); } catch {}
  await document.fonts?.ready;
  sizeLabel(); tick(); setInterval(tick, 15000);
  const hash = location.hash.slice(1);
  if (document.documentElement.classList.contains("booting")) await boot();

  await drawPortrait();
  const items = [...document.querySelectorAll(".fetch > *")];
  for (const el of items) { el.classList.add("in"); if (!reduced) await sleep(55); }
  document.documentElement.classList.remove("revealing");
  items.forEach((el) => el.classList.remove("in"));

  if (hash && (own(COMMANDS, hash) || own(ALIASES, hash))) await exec(hash, { record: false });
  else entry(null, `Welcome. I'm Han, and this is my terminal. Try ${run("about")}, ${run("work")} or ${run("projects")}, or type ${run("help")}.`, { scroll: false });
  if (matchMedia("(pointer: fine)").matches) input.focus({ preventScroll: true });
}

// for the curious who open devtools: say hi instead of blocking them
(() => {
  const acc = getComputedStyle(document.documentElement).getPropertyValue("--acc").trim() || "#b6f36a";
  console.log(`%chzOS%c  you found the console. 👋`, `font: 700 20px ui-monospace, monospace; color: ${acc}`, "font: 13px ui-monospace, monospace");
  console.log("%cCurious how it's built? Ask me instead of copying it:\n  github   https://github.com/hantunzawDev\n  linkedin https://www.linkedin.com/in/hantunzaw/\nFound a bug or a security issue? Type `contact` in the terminal.", "font: 12px ui-monospace, monospace; line-height: 1.6");
  consoleBait();
})();
applyHeat(); // keep the red prompt if they already earned it this session (on hzOS or the 404 page too)
start();
