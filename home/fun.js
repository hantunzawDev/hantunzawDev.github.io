// fun commands: pure functions returning text, plus the matrix screensaver.

export function cowsay(msg = "moo.") {
  const words = msg.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) { if ((cur + " " + w).trim().length > 36) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); }
  if (cur) lines.push(cur);
  const width = Math.max(...lines.map((l) => l.length));
  const top = " " + "_".repeat(width + 2);
  const bot = " " + "-".repeat(width + 2);
  const body = lines.length === 1
    ? [`< ${lines[0]} >`]
    : lines.map((l, i) => `${i === 0 ? "/" : i === lines.length - 1 ? "\\" : "|"} ${l.padEnd(width)} ${i === 0 ? "\\" : i === lines.length - 1 ? "/" : "|"}`);
  return [top, ...body, bot,
    "        \\   ^__^",
    "         \\  (oo)\\_______",
    "            (__)\\       )\\/\\",
    "                ||----w |",
    "                ||     ||"].join("\n");
}

const LOGO = [
  " _          ",
  "| |__  ____ ",
  "| '_ \\|_  / ",
  "| | | |/ /  ",
  "|_| |_/___| ",
  "  h z o s   ",
];
export function neofetch(info) {
  const rows = Object.entries(info).filter(([k]) => k !== "__title").map(([k, v]) => `${k}: ${v}`);
  const out = [];
  const n = Math.max(LOGO.length, rows.length + 2);
  for (let i = 0; i < n; i++) {
    const left = (LOGO[i] || "").padEnd(22);
    const right = i === 0 ? info.__title : i === 1 ? "-".repeat(info.__title.length) : rows[i - 2] || "";
    out.push(left + right);
  }
  return out.join("\n");
}

const EIGHT = ["it is certain.", "without a doubt.", "you may rely on it.", "yes, definitely.", "most likely.", "outlook good.",
  "signs point to yes.", "reply hazy, try again.", "ask again later.", "better not tell you now.", "cannot predict now.",
  "don't count on it.", "my reply is no.", "my sources say no.", "outlook not so good.", "very doubtful.", "ship it and see."];
export const eightBall = () => EIGHT[Math.floor(Math.random() * EIGHT.length)];

export const HACK = [
  "initializing exploit kit v0.0.1-alpha…",
  "bypassing mainframe firewall ████████░░ 80%",
  "decrypting rsa-4096 with a toaster… ok",
  "injecting sql into the cloud… ok",
  "rerouting through 7 proxies and a vpn in narnia… ok",
  "downloading more ram ██████████ 100%",
  "enhancing… enhancing… ENHANCE.",
  "access granted.",
  "just kidding. go back to work. ;)",
];

export const TRAIN = [
  "      ====        ________                ___________ ",
  "  _D _|  |_______/        \\__I_I_____===__|_________| ",
  "   |(_)---  |   H\\________/ |   |        =|___ ___|   ",
  "   /     |  |   H  |  |     |   |         ||_| |_||   ",
  "  |      |  |   H  |__--------------------| [___] |   ",
  "  | ________|___H__/__|_____/[][]~\\_______|       |   ",
  "  |/ |   |-----------I_____I [][] []  D   |=======|__ ",
  "__/ =| o |=-~~\\  /~~\\  /~~\\  /~~\\ ____Y___________|__ ",
  " |/-=|___|=    ||    ||    ||    |_____/~\\___/        ",
  "  \\_/      \\O=====O=====O=====O_/      \\_/            ",
];

export function matrix(canvas, color, bg) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return null;
  canvas.hidden = false;
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const glyphs = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ0123456789hzHZ<>/{}=+*";
  let cols, drops, fs, raf = 0, last = 0;
  function size() {
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    fs = 16 * dpr; cols = Math.ceil(canvas.width / fs);
    drops = Array.from({ length: cols }, () => Math.random() * -50);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  size();
  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (t - last < 50) return;
    last = t;
    ctx.fillStyle = bg + "22"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${fs}px monospace`;
    for (let i = 0; i < cols; i++) {
      const ch = glyphs[Math.floor(Math.random() * glyphs.length)];
      const y = drops[i] * fs;
      ctx.fillStyle = Math.random() < 0.04 ? "#ffffff" : color;
      ctx.fillText(ch, i * fs, y);
      if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i] += 1;
    }
  }
  raf = requestAnimationFrame(frame);
  addEventListener("resize", size);
  return () => { cancelAnimationFrame(raf); removeEventListener("resize", size); canvas.hidden = true; };
}

// safe arithmetic: only numbers, operators, parentheses and a few Math names
export function calc(expr) {
  const src = expr.replace(/\s+/g, "").replace(/\^/g, "**").replace(/×/g, "*").replace(/÷/g, "/");
  const allowed = /^(?:[\d.+\-*/%(),]|\*\*|pi|e|sqrt|abs|round|floor|ceil|min|max|sin|cos|tan|log|ln)+$/i;
  if (!src || !allowed.test(src)) throw new Error("only numbers and + - * / % ^ ( ) sqrt abs round floor ceil min max sin cos tan log ln pi e");
  const js = src
    .replace(/\bpi\b/gi, "Math.PI").replace(/\be\b/g, "Math.E").replace(/\blog\(/gi, "Math.log10(").replace(/\bln\(/gi, "Math.log(")
    .replace(/\b(sqrt|abs|round|floor|ceil|min|max|sin|cos|tan)\(/gi, (m, f) => `Math.${f.toLowerCase()}(`);
  const v = Function(`"use strict"; return (${js});`)();
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("not a finite number");
  return +v.toPrecision(12);
}
