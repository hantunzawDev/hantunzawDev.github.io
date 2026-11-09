// 404 page, doubling as a joke honeypot for the paths scanners always try
// (/.env, /wp-admin, /.git/config ...). It never logs or sends anything: GitHub Pages has no
// server, and the goal is a laugh, not surveillance. Every value shown is an obvious fake.
import { bump, applyHeat } from "./eggs.js";

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls || "", textContent: text ?? "" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// keep the visitor's terminal phosphor
try { const t = JSON.parse(localStorage.getItem("hzsite.theme")); if (["amber", "ice", "purple"].includes(t)) document.documentElement.dataset.theme = t; } catch {}
applyHeat();

// /404.html?path=/.env previews a trap locally (python's http.server has no 404 fallback)
let path = location.pathname;
if (/\/404(\.html)?$/.test(path)) path = new URLSearchParams(location.search).get("path") || path;
const p = path.toLowerCase();

const TRAPS = [
  ["admin", /\/(wp-admin|wp-login\.php|administrator|phpmyadmin|pma|admin|login|user\/login|cpanel|manager\/html)(\/|\.php|$)/],
  ["env", /\/(\.env(\.[\w-]+)?|wp-config\.php(\.bak|\.old)?|config\.php|\.aws\/credentials|credentials\.json|secrets?\.(json|ya?ml))$/],
  ["git", /\/\.(git|svn|hg)(\/|$)/],
  ["backup", /\.(sql|bak|old|backup|tar\.gz|zip)$/],
];
const trap = TRAPS.find(([, re]) => re.test(p))?.[0] || null;

const out = $("#out");
const pre = (text, cls = "") => out.append(el("pre", cls, text));
const shown = path.length > 80 ? path.slice(0, 77) + "…" : path;

function meterOut() {
  const b = bump();
  pre(b.line, "acc");
  if (b.maxed) { const a = el("a", "", "→ contact"); a.href = "/#contact"; out.append(a); }
}

if (trap === "env") {
  $("#cmd").textContent = `cat ${shown}`;
  pre([
    "# production secrets. definitely real. please don't tell anyone.",
    "DB_HOST=localhost",
    "DB_USER=nice",
    "DB_PASS=try_buddy",
    "API_KEY=hz_nope_this_is_not_a_key",
    "AWS_SECRET=it_is_a_static_site_there_is_no_aws",
    "STRIPE_KEY=i_dont_even_sell_anything",
    "ADMIN_EMAIL=type `contact` on the homepage like a normal person",
  ].join("\n"), "box");
  meterOut();
} else if (trap === "git") {
  $("#cmd").textContent = `cat ${shown}`;
  pre([
    "[core]",
    "\trepositoryformatversion = 0",
    '[remote "origin"]',
    "\turl = https://github.com/hantunzawDev",
    "\t# it's public anyway. no need to sneak in through the back door.",
  ].join("\n"), "box");
  meterOut();
} else if (trap === "backup") {
  $("#cmd").textContent = `ls -la ${shown}`;
  pre(`-rw-r--r--  1 han  staff  0 B  ${shown}\n# 0 bytes. I back up to GitHub like a normal person.`, "box");
  meterOut();
} else if (trap === "admin") {
  $("#cmd").textContent = `open ${shown}`;
  const box = el("div", "box");
  box.append(
    el("pre", "warn", "ADMIN PANEL v1.0 · authorised personnel only"),
    Object.assign(el("p", "row"), {}),
  );
  const row = box.lastChild;
  row.append(el("label", "", "user"), el("span", "field", "admin"), el("label", "", "pass"), el("span", "field", "••••••••"));
  const btn = el("button", "", "brute force it");
  btn.type = "button";
  box.append(btn);
  const log = el("pre", "dim");
  box.append(log);
  out.append(box);
  const GUESSES = ["admin", "password", "123456", "hunter2", "letmein", "correct horse battery staple", "please"];
  let tried = false;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    log.textContent = "";
    for (const g of GUESSES) {
      log.textContent += `trying admin / ${g} ... denied\n`;
      await sleep(reduce ? 0 : 220);
    }
    log.textContent += "\n";
    log.append(el("span", "err", "access denied. also, this isn't wordpress.\n"));
    log.append(el("span", "", "there's no admin panel. it's a static site on GitHub Pages."));
    if (!tried) { tried = true; meterOut(); }
    btn.textContent = "try harder";
    btn.disabled = false;
  });
} else {
  $("#cmd").textContent = `cd ${shown}`;
  pre(`cd: ${shown}: No such file or directory`, "err");
  pre("That page doesn't exist. The terminal does, though.", "dim");
}
