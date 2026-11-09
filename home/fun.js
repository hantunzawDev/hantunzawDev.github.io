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

// safe arithmetic: a small recursive-descent parser (the page CSP forbids eval/Function)
const CALC_HELP = "only numbers and + - * / % ^ ( ) sqrt abs round floor ceil min max sin cos tan log ln pi e";
const CALC_CONSTS = { pi: Math.PI, e: Math.E };
const CALC_FNS = {
  sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  min: Math.min, max: Math.max, sin: Math.sin, cos: Math.cos, tan: Math.tan, log: Math.log10, ln: Math.log,
};
export function calc(expr) {
  const src = String(expr).replace(/\*\*/g, "^").replace(/×/g, "*").replace(/÷/g, "/").toLowerCase();
  const toks = src.match(/\d*\.?\d+(?:e[+-]?\d+)?|[a-z]+|[-+*/%^(),]|\S/g) || [];
  if (!toks.length) throw new Error(CALC_HELP);
  if (toks.length > 400) throw new Error("expression too long");
  let i = 0;
  const peek = () => toks[i];
  const take = (t) => { if (toks[i] !== t) throw new Error(t ? `expected "${t}"` : CALC_HELP); i++; };
  const expr_ = () => { let v = term(); while (peek() === "+" || peek() === "-") v = toks[i++] === "+" ? v + term() : v - term(); return v; };
  const term = () => {
    let v = unary();
    while (peek() === "*" || peek() === "/" || peek() === "%") { const op = toks[i++], r = unary(); v = op === "*" ? v * r : op === "/" ? v / r : v % r; }
    return v;
  };
  const unary = () => (peek() === "-" ? (i++, -unary()) : peek() === "+" ? (i++, unary()) : power());
  const power = () => { const b = primary(); return peek() === "^" ? (i++, b ** unary()) : b; };
  const primary = () => {
    const t = toks[i++];
    if (t === undefined) throw new Error("unexpected end");
    if (/^\d*\.?\d+(?:e[+-]?\d+)?$/.test(t)) return parseFloat(t);
    if (t === "(") { const v = expr_(); take(")"); return v; }
    if (Object.hasOwn(CALC_CONSTS, t)) return CALC_CONSTS[t];
    if (Object.hasOwn(CALC_FNS, t)) {
      take("(");
      const args = [expr_()];
      while (peek() === ",") { i++; args.push(expr_()); }
      take(")");
      return CALC_FNS[t](...args);
    }
    throw new Error(CALC_HELP);
  };
  const v = expr_();
  if (i < toks.length) throw new Error(CALC_HELP);
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("not a finite number");
  return +v.toPrecision(12);
}
