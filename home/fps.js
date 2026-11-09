// bughunt.exe: a small raycasting shooter. Clear the bugs out of each sector,
// then walk into the exit. Mounts like the other games and returns { stop }.
import { store } from "./data.js";
import { sfx, score as soundtrack, place } from "./fpsaudio.js";

// # wall · % alt wall · X exit (opens when every bug is dead)
// P player · E bug · H patch (+hp) · A cells (+ammo) · everything else is floor
const LEVELS = [
  { name: "sector 1 · /boot", map: [
    "################",
    "#P....#.......E#",
    "#.....#..%%....#",
    "#..A.....%%....#",
    "#.....#........#",
    "###.######.#####",
    "#.......#.....H#",
    "#..E....#..E...#",
    "#.......%......#",
    "#..%%...#..%%..#",
    "#..%%.......%..#",
    "#A......#....E.X",
    "################",
  ] },
  { name: "sector 2 · /var/log", map: [
    "##################",
    "#P..#......#....E#",
    "#...#..E...#.....#",
    "#...%......%..A..#",
    "#...#..%%..#.....#",
    "#......%%........#",
    "#####.####.#######",
    "#H.......#.......#",
    "#..E.....#...E...#",
    "#...%%%..........#",
    "#........#..%%%..#",
    "#..A.....#....E..#",
    "######.#####.#####",
    "#E...........H...X",
    "##################",
  ] },
  { name: "sector 3 · /dev/null", map: [
    "####################",
    "#P.....%......%...E#",
    "#......%..E...%....#",
    "#..A...............#",
    "#......%......%..H.#",
    "#%%.%%%%%%..%%%%.%%#",
    "#.........E........#",
    "#..##..........##..#",
    "#..##...%%%%...##..#",
    "#E......%..%......E#",
    "#.......%.A%.......#",
    "#..##...%..%...##..#",
    "#..##..........##..#",
    "#H.......E........A#",
    "#%%%%%%%%%..%%%%%%%#",
    "#.........E........X",
    "####################",
  ] },
];

const h = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) if (k != null) n.append(k);
  return n;
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const probe = document.createElement("canvas").getContext("2d");
function rgb(c) {
  probe.fillStyle = "#000"; probe.fillStyle = c || "#000";
  const v = probe.fillStyle;
  if (v[0] === "#") return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
  return v.match(/[\d.]+/g).slice(0, 3).map(Number);
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const str = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

export function bughunt(root, { setMeta, log }) {
  const canvas = h("canvas", { tabIndex: 0, ariaLabel: "bughunt. Click to play. WASD to move, arrows or mouse to turn, space or click to fire, M for map." });
  canvas.style.touchAction = "none";
  const hud = h("p", { className: "game__hud" });
  const board = h("div", { className: "game__board" }, canvas);
  root.replaceChildren(hud, board);
  const ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 320, H = 200, zbuf = new Float32Array(W);
  let pal, palKey = "", sprites = {};
  let best = store.get("fps.best", 0);

  // game state
  let state = "title"; // title | play | dead | won
  let lvl, grid, ents, P, keys = new Set(), score = 0, hp = 100, ammo = 30;
  let shootCd = 0, flash = 0, hurt = 0, banner = 0, bob = 0, showMap = false, msg = "", msgT = 0;
  let raf = 0, last = 0, dirty = true, focused = false;
  let touch = null, touchMove = 0;
  // feel: screen shake, hit markers, debris, enemy tracers, damage direction
  let shake = 0, shakeMag = 0, hitMark = 0, killMark = false, fade = 0;
  let parts = [], zaps = [], dmgDirs = [], stepIdx = 0, heartT = 0;

  /* ---------- palette + sprites follow the current theme ---------- */
  function readPalette() {
    const cs = getComputedStyle(document.body);
    const v = (n) => cs.getPropertyValue(n).trim();
    const key = ["--win", "--lime", "--amber", "--red", "--text", "--line", "--line-hi", "--muted", "--bg"].map(v).join("|");
    if (key === palKey) return;
    palKey = key;
    pal = { fog: rgb(v("--win")), bg: rgb(v("--bg")), wall: rgb(v("--lime")), alt: rgb(v("--amber")), red: rgb(v("--red")), text: rgb(v("--text")), line: rgb(v("--line")), hi: rgb(v("--line-hi")), muted: rgb(v("--muted")) };
    pal.light = (pal.fog[0] + pal.fog[1] + pal.fog[2]) / 3 > 128;
    buildSprites();
    dirty = true;
  }
  function sprite(draw) {
    const c = document.createElement("canvas"); c.width = c.height = 32;
    draw(c.getContext("2d")); return c;
  }
  function bug(g, body, eye) {
    g.fillStyle = str(mix(body, pal.bg, 0.35));
    for (const [x, y] of [[6, 22], [10, 25], [21, 25], [25, 22]]) g.fillRect(x, y, 2, 6); // legs
    g.fillStyle = str(body); g.fillRect(8, 9, 16, 15); g.fillRect(6, 12, 20, 9); g.fillRect(11, 6, 10, 3); // shell
    g.fillRect(11, 3, 2, 3); g.fillRect(19, 3, 2, 3); // antennae
    g.fillStyle = str(eye); g.fillRect(11, 12, 10, 7);
    g.fillStyle = str(pal.bg); g.fillRect(14, 14, 4, 4);
    g.fillStyle = str(mix(body, pal.bg, 0.5)); g.fillRect(8, 21, 16, 2); // glitch line
  }
  function buildSprites() {
    sprites.bug = sprite((g) => bug(g, pal.red, pal.text));
    sprites.hit = sprite((g) => bug(g, pal.text, pal.red));
    sprites.charge = sprite((g) => { // windup tell: the eye goes hot before it fires
      bug(g, pal.red, pal.alt);
      g.fillStyle = str(pal.text); g.fillRect(14, 14, 4, 4);
      g.fillStyle = str(mix(pal.alt, pal.bg, 0.4)); g.fillRect(9, 10, 14, 2); g.fillRect(9, 19, 14, 2);
    });
    sprites.dead = sprite((g) => {
      g.fillStyle = str(mix(pal.red, pal.bg, 0.45)); g.fillRect(5, 26, 22, 4); g.fillRect(9, 24, 14, 2);
      g.fillStyle = str(mix(pal.red, pal.bg, 0.2)); g.fillRect(12, 25, 3, 2); g.fillRect(19, 27, 4, 2);
    });
    sprites.H = sprite((g) => {
      g.fillStyle = str(pal.hi); g.fillRect(8, 16, 16, 14);
      g.fillStyle = str(pal.wall); g.fillRect(14, 18, 4, 10); g.fillRect(11, 21, 10, 4);
    });
    sprites.A = sprite((g) => {
      g.fillStyle = str(pal.hi); g.fillRect(7, 18, 18, 12);
      g.fillStyle = str(pal.alt); for (let i = 0; i < 4; i++) g.fillRect(9 + i * 4, 14, 2, 14);
    });
  }

  /* ---------- levels ---------- */
  function load(i) {
    lvl = i;
    const L = LEVELS[i];
    ents = [];
    grid = L.map.map((row, y) => [...row].map((ch, x) => {
      if (ch === "P") P = { x: x + 0.5, y: y + 0.5, a: 0 };
      else if (ch === "E") ents.push({ kind: "bug", x: x + 0.5, y: y + 0.5, hp: 2 + Math.min(i, 2), cd: 1 + Math.random(), hit: 0, awake: false, ph: Math.random() * 6, wind: 0, chT: 1 + Math.random() * 2 });
      else if (ch === "H" || ch === "A") ents.push({ kind: ch, x: x + 0.5, y: y + 0.5, ph: Math.random() * 6 });
      return "#%X".includes(ch) ? ch : ".";
    }));
    // face the most open direction from the start
    let bestA = 0, bestD = 0;
    for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4, d = rayDist(P.x, P.y, a); if (d > bestD) { bestD = d; bestA = a; } }
    P.a = bestA;
    banner = 2.2; fade = 0.6; dirty = true;
    parts = []; zaps = []; dmgDirs = [];
  }
  const cell = (x, y) => grid[y | 0]?.[x | 0] ?? "#";
  const solid = (x, y) => cell(x, y) !== ".";
  const bugsLeft = () => ents.filter((e) => e.kind === "bug" && e.hp > 0).length;
  function rayDist(x, y, a) { let d = 0; while (d < 20 && !solid(x + Math.cos(a) * d, y + Math.sin(a) * d)) d += 0.1; return d; }
  function sight(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy), n = Math.ceil(d / 0.15);
    for (let i = 1; i < n; i++) if (solid(ax + (dx * i) / n, ay + (dy * i) / n)) return false;
    return true;
  }
  function newGame() {
    score = 0; hp = 100; ammo = 30; load(0); state = "play";
    say("find and squash every bug, then take the exit.");
    sfx.unlock(); sfx.start();
    soundtrack.sector(0);
  }
  function addShake(mag, secs) { if (reduce) return; shakeMag = shake > 0 ? Math.max(shakeMag, mag) : mag; shake = Math.max(shake, secs); }
  // debris in world space: z is height (0 floor, 1 ceiling)
  function spray(e, n, colors, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = (0.3 + Math.random() * 0.8) * power;
      parts.push({ x: e.x, y: e.y, z: 0.25 + Math.random() * 0.2, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 0.4 + Math.random() * 0.9 * power,
        life: 0.5 + Math.random() * 0.7, c: colors[i % colors.length], sz: 0.012 + Math.random() * 0.012 });
    }
    if (parts.length > 160) parts.splice(0, parts.length - 160);
  }
  function say(t) { msg = t; msgT = 3; }

  /* ---------- movement ---------- */
  const R = 0.22;
  function tryMove(e, dx, dy) {
    let bumped = null;
    const nx = e.x + dx, ny = e.y + dy, sx = Math.sign(dx) * R, sy = Math.sign(dy) * R;
    if (!solid(nx + sx, e.y - R + 0.01) && !solid(nx + sx, e.y + R - 0.01)) e.x = nx; else bumped = cell(nx + sx, e.y);
    if (!solid(e.x - R + 0.01, ny + sy) && !solid(e.x + R - 0.01, ny + sy)) e.y = ny; else bumped = bumped || cell(e.x, ny + sy);
    return bumped;
  }

  function update(dt) {
    const k = (n) => keys.has(n);
    const turn = (k("arrowright") || k("e") ? 1 : 0) - (k("arrowleft") || k("q") ? 1 : 0);
    P.a += turn * 2.6 * dt;
    const fwd = (k("w") || k("arrowup") ? 1 : 0) - (k("s") || k("arrowdown") ? 1 : 0) + touchMove;
    const str8 = (k("d") ? 1 : 0) - (k("a") ? 1 : 0);
    const sp = (k("shift") ? 4.2 : 2.8) * dt;
    const cx = Math.cos(P.a), cy = Math.sin(P.a);
    let mx = (cx * fwd - cy * str8) * sp, my = (cy * fwd + cx * str8) * sp;
    const len = Math.hypot(fwd, str8);
    if (len > 1) { mx /= len; my /= len; }
    if (mx || my) {
      bob += dt * (k("shift") ? 11 : 9);
      const si = Math.floor(bob / Math.PI);
      if (si !== stepIdx) { stepIdx = si; sfx.step(si & 1); }
      if (tryMove(P, mx, my) === "X") {
        const left = bugsLeft();
        if (left) { if (msgT < 1) { say(`exit locked · ${left} bug${left > 1 ? "s" : ""} left`); sfx.locked(); } }
        else return nextLevel();
      }
    }
    if ((k(" ") || k("f")) && shootCd <= 0) fire();
    shootCd -= dt; flash -= dt; hurt -= dt; banner -= dt; msgT -= dt; hitMark -= dt; fade -= dt;
    if (shake > 0) { shake -= dt; shakeMag *= Math.exp(-dt * 6); }

    // only two bugs may be winding up a shot at once: a crowd is pressure, not a firing squad
    let committed = 0, near = 0;
    for (const e of ents) if (e.kind === "bug" && e.hp > 0 && e.wind > 0) committed++;
    for (const e of ents) {
      if (e.kind !== "bug") {
        e.ph += dt * 3;
        if (!e.taken && Math.hypot(e.x - P.x, e.y - P.y) < 0.55) {
          if (e.kind === "H" && hp < 100) { hp = Math.min(100, hp + 25); e.taken = true; say("+25 hp · patch applied"); sfx.pickupHp(); spray(e, 8, [pal.wall, pal.text], 0.5); }
          if (e.kind === "A") { ammo += 12; e.taken = true; say("+12 cells"); sfx.pickupAmmo(); spray(e, 8, [pal.alt, pal.text], 0.5); }
        }
        continue;
      }
      if (e.hp <= 0) continue;
      e.hit -= dt; e.ph += dt * (e.wind > 0 ? 14 : 4);
      const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy);
      const see = d < 11 && sight(e.x, e.y, P.x, P.y);
      if (see && !e.awake) { e.awake = true; e.cd = 0.6 + Math.random() * 0.6; sfx.alert(place(P, e.x, e.y)); }
      if (!e.awake) continue;
      if (d < 8) near++;
      if (d < 7 && (e.chT -= dt) <= 0) { e.chT = 1.4 + Math.random() * 1.8; if (e.wind <= 0) sfx.chitter(place(P, e.x, e.y)); }
      if (d > 0.9 && e.hit <= 0 && e.wind <= 0) tryMove(e, (dx / d) * 1.25 * dt, (dy / d) * 1.25 * dt);
      if (e.wind > 0) { // telegraphed attack resolves
        e.wind -= dt;
        if (e.wind <= 0) {
          e.cd = 1.1 + Math.random() * 0.9;
          const melee = d < 1.2;
          const chance = !see ? 0 : melee ? 0.9 : clamp(0.8 - d * 0.06, 0.25, 0.8);
          const landed = Math.random() < chance;
          sfx.zap(place(P, e.x, e.y));
          zaps.push({ e, t: 0.12, hit: landed, off: (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.35) });
          if (landed) damage(melee ? 12 : 6 + Math.floor(Math.random() * 6), e);
          if (state !== "play") return;
        }
        continue;
      }
      e.cd -= dt;
      if (e.cd <= 0 && see && committed < 2) {
        e.wind = d < 1.2 ? 0.28 : 0.42; committed++;
        sfx.charge(place(P, e.x, e.y), e.wind);
      }
    }

    // debris physics
    for (const p of parts) {
      p.life -= dt; p.vz -= 4.5 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (solid(p.x, p.y)) { p.x -= p.vx * dt; p.y -= p.vy * dt; p.vx *= -0.4; p.vy *= -0.4; }
      if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; }
    }
    parts = parts.filter((p) => p.life > 0);
    for (const z of zaps) z.t -= dt;
    zaps = zaps.filter((z) => z.t > 0);
    for (const dd of dmgDirs) dd.t -= dt;
    dmgDirs = dmgDirs.filter((dd) => dd.t > 0);

    if (hp <= 30 && (heartT -= dt) <= 0) { heartT = 0.55 + hp / 60; sfx.heartbeat(); }
    soundtrack.intensity(clamp(near / 3, 0, 1), clamp((50 - hp) / 50, 0, 1), dt);
    dirty = true;
  }
  function damage(n, from) {
    hp -= n; hurt = 0.25;
    addShake(n >= 12 ? 5 : 3, 0.3);
    sfx.hurt(n >= 12);
    if (from) dmgDirs.push({ a: Math.atan2(from.y - P.y, from.x - P.x), t: 0.8 });
    if (hp <= 0) {
      hp = 0; state = "dead"; document.exitPointerLock?.();
      sfx.death(); soundtrack.release(1.6);
      record();
    }
  }
  function record() {
    if (score > best) { best = score; store.set("fps.best", best); log?.(`bughunt: new best ${best}!`, "ok"); }
  }
  function nextLevel() {
    score += 500 + hp;
    if (lvl + 1 >= LEVELS.length) {
      state = "won"; document.exitPointerLock?.(); record();
      sfx.win(); soundtrack.sector(0, true);
      return;
    }
    load(lvl + 1);
    ammo += 10;
    sfx.clear(); soundtrack.sector(lvl);
    log?.(`bughunt: ${LEVELS[lvl - 1].name} clear.`, "ok");
  }
  function fire() {
    if (state !== "play") return;
    if (ammo <= 0) { if (msgT < 1) say("out of cells · find ammo"); sfx.dry(); shootCd = 0.4; return; }
    ammo--; shootCd = 0.3; flash = 0.08;
    sfx.shoot(); addShake(1.2, 0.08);
    const cx = W / 2;
    let target = null, tDepth = Infinity;
    for (const e of ents) {
      if (e.kind !== "bug" || e.hp <= 0) continue;
      const p = project(e);
      if (!p || p.depth > zbuf[cx | 0]) continue;
      if (Math.abs(p.sx - cx) < p.size * 0.32 && p.depth < tDepth) { target = e; tDepth = p.depth; }
    }
    if (target) {
      target.hp--; target.hit = 0.15; target.awake = true;
      const at = place(P, target.x, target.y);
      hitMark = 0.14; killMark = target.hp <= 0;
      if (target.hp <= 0) {
        target.wind = 0; score += 100;
        sfx.kill(at); spray(target, 16, [pal.red, pal.text, pal.alt], 1.1);
        const left = bugsLeft();
        say(left ? `bug squashed · ${left} left` : "sector clean · exit is open");
        if (!left) setTimeout(() => { if (raf && state === "play") sfx.exitOpen(); }, 260);
      } else { sfx.hit(at, target.hp); spray(target, 5, [pal.red, pal.text], 0.6); }
    }
  }

  /* ---------- rendering ---------- */
  function project(e) {
    const dirX = Math.cos(P.a), dirY = Math.sin(P.a), plX = -dirY * 0.66, plY = dirX * 0.66;
    const dx = e.x - P.x, dy = e.y - P.y, inv = 1 / (plX * dirY - dirX * plY);
    const tx = inv * (dirY * dx - dirX * dy), depth = inv * (-plY * dx + plX * dy);
    if (depth < 0.15) return null;
    return { sx: (W / 2) * (1 + tx / depth), depth, size: H / depth };
  }
  function render() {
    readPalette();
    const { fog } = pal;
    const horizon = H / 2 + (reduce ? 0 : Math.sin(bob) * 1.6);
    // ceiling + floor
    const cg = ctx.createLinearGradient(0, 0, 0, horizon);
    cg.addColorStop(0, str(mix(fog, pal.bg, 0.6))); cg.addColorStop(1, str(fog));
    ctx.fillStyle = cg; ctx.fillRect(0, 0, W, horizon);
    const fg = ctx.createLinearGradient(0, horizon, 0, H);
    fg.addColorStop(0, str(fog)); fg.addColorStop(1, str(mix(fog, pal.line, 0.9)));
    ctx.fillStyle = fg; ctx.fillRect(0, horizon, W, H - horizon);

    const dirX = Math.cos(P.a), dirY = Math.sin(P.a), plX = -dirY * 0.66, plY = dirX * 0.66;
    const exitOpen = !bugsLeft(), pulse = 0.5 + 0.5 * Math.sin(performance.now() / 220);
    const mortar = pal.light ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)";
    const muzzle = flash > 0 ? flash / 0.08 : 0; // the shot lights up the nearby walls
    for (let x = 0; x < W; x++) {
      const cam = (2 * x) / W - 1, rx = dirX + plX * cam, ry = dirY + plY * cam;
      let mx = P.x | 0, my = P.y | 0;
      const ddx = Math.abs(1 / rx), ddy = Math.abs(1 / ry);
      const stx = rx < 0 ? -1 : 1, sty = ry < 0 ? -1 : 1;
      let sdx = (rx < 0 ? P.x - mx : mx + 1 - P.x) * ddx, sdy = (ry < 0 ? P.y - my : my + 1 - P.y) * ddy;
      let side = 0, t = "#";
      for (let i = 0; i < 64; i++) {
        if (sdx < sdy) { sdx += ddx; mx += stx; side = 0; } else { sdy += ddy; my += sty; side = 1; }
        t = cell(mx, my);
        if (t !== ".") break;
      }
      const dist = Math.max(0.05, side ? sdy - ddy : sdx - ddx);
      zbuf[x] = dist;
      let wx = side ? P.x + dist * rx : P.y + dist * ry; wx -= Math.floor(wx);
      const lh = H / dist, top = horizon - lh / 2;
      let base = t === "%" ? pal.alt : t === "X" ? (exitOpen ? mix(pal.text, pal.wall, pulse) : pal.hi) : pal.wall;
      base = mix(base, pal.light ? [255, 255, 255] : [0, 0, 0], side ? 0.3 : 0.08);
      if (muzzle) base = mix(base, pal.alt, muzzle * 0.45 * clamp(1 - dist / 6, 0, 1) * (1 - Math.abs(cam) * 0.5));
      ctx.fillStyle = str(mix(base, fog, clamp(dist / 9, 0, 0.92)));
      ctx.fillRect(x, top, 1, lh + 1);
      if (dist < 7) {
        ctx.fillStyle = mortar;
        if (t === "X") {
          if (wx < 0.08 || wx > 0.92) ctx.fillRect(x, top, 1, lh); // door frame
          ctx.fillRect(x, top + lh * 0.1, 1, Math.max(1, lh / 50));
        } else {
          const rows = 4, rh = lh / rows;
          for (let r = 0; r < rows; r++) {
            if (r) ctx.fillRect(x, top + r * rh, 1, Math.max(1, lh / 60));
            const f = (wx * 2 + (r % 2) * 0.5) % 1;
            if (f < 0.045) ctx.fillRect(x, top + r * rh, 1, rh);
          }
        }
      }
    }

    // sprites, far to near
    const list = [];
    for (const e of ents) {
      if (e.taken) continue;
      const p = project(e);
      if (p) list.push([e, p]);
    }
    list.sort((a, b) => b[1].depth - a[1].depth);
    for (const [e, p] of list) {
      const winding = e.kind === "bug" && e.hp > 0 && e.wind > 0;
      const img = e.kind === "bug" ? (e.hp <= 0 ? sprites.dead : e.hit > 0 ? sprites.hit : winding && Math.sin(e.ph) > -0.3 ? sprites.charge : sprites.bug) : sprites[e.kind];
      const scale = e.kind === "bug" ? (winding ? 0.86 : 0.8) : 0.45;
      const size = p.size * scale, floorY = horizon + p.size / 2;
      const hover = reduce ? 0 : e.kind === "bug" ? (e.hp > 0 ? Math.sin(e.ph) * p.size * (winding ? 0.012 : 0.03) : 0) : (Math.sin(e.ph) - 1) * p.size * 0.04;
      const y = floorY - size + hover, x0 = Math.round(p.sx - size / 2);
      const shade = clamp(p.depth / 9, 0, 0.85);
      for (let sx = Math.max(0, x0); sx < Math.min(W, x0 + size); sx++) {
        if (p.depth >= zbuf[sx]) continue;
        const tx = clamp(((sx - x0) / size) * 32, 0, 31) | 0;
        ctx.drawImage(img, tx, 0, 1, 32, sx, y, 1, size);
      }
      if (shade > 0.05) { // fog over the sprite
        ctx.globalAlpha = shade; ctx.fillStyle = str(fog);
        for (let sx = Math.max(0, x0); sx < Math.min(W, x0 + size); sx++) if (p.depth < zbuf[sx]) ctx.fillRect(sx, y, 1, size);
        ctx.globalAlpha = 1;
      }
    }

    drawParts(horizon);
    drawZaps(horizon);
    drawWeapon();
    drawCrosshair();
    if (hurt > 0) { ctx.fillStyle = `rgba(${pal.red.join(",")},${0.3 * (hurt / 0.25)})`; ctx.fillRect(0, 0, W, H); }
    drawDamageDirs();
    if (state === "play" && hp <= 30) { // low hp: the edges bleed in time with the heartbeat
      const beat = reduce ? 0.6 : 0.5 + 0.5 * Math.sin(performance.now() / (120 + hp * 6));
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, `rgba(${pal.red.join(",")},${(0.18 + 0.22 * beat) * (1 - hp / 40)})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }
    if (fade > 0 && state === "play") { ctx.fillStyle = `rgba(${pal.bg.join(",")},${clamp(fade / 0.6, 0, 1)})`; ctx.fillRect(0, 0, W, H); }
    if (showMap) drawMap();
    // shake is a temporary offset on the whole view, never on the aim
    canvas.style.transform = state === "play" && focused && shake > 0 && shakeMag > 0.2 ? `translate(${((Math.random() * 2 - 1) * shakeMag).toFixed(1)}px,${((Math.random() * 2 - 1) * shakeMag).toFixed(1)}px)` : "";
    text(banner > 0 && state === "play" ? LEVELS[lvl].name : "", H * 0.22, 11);
    if (msgT > 0 && state === "play") text(msg, H - 10, 8, 0.85);
    if (state !== "play" || !focused) overlay();
    hudUpdate();
  }
  function drawWeapon() {
    const sway = reduce ? 0 : Math.sin(bob * 0.5) * 4, lift = reduce ? 0 : Math.abs(Math.cos(bob * 0.5)) * 3;
    // recoil: snaps back on the shot, eases home over the cooldown
    const kick = shootCd > 0 ? Math.pow(shootCd / 0.3, 2) * 7 : 0;
    const x = Math.round(W / 2 + sway - 14), y = Math.round(H - 34 + lift + kick);
    if (flash > 0) {
      const f = flash / 0.08;
      const glow = ctx.createRadialGradient(x + 14, y - 6, 0, x + 14, y - 6, 34 * f + 6);
      glow.addColorStop(0, `rgba(${pal.alt.join(",")},${0.55 * f})`); glow.addColorStop(1, `rgba(${pal.alt.join(",")},0)`);
      ctx.fillStyle = glow; ctx.fillRect(x - 30, y - 50, 88, 70);
      ctx.fillStyle = str(pal.alt); ctx.fillRect(x + 7, y - 13, 14, 11); ctx.fillRect(x + 4, y - 9, 20, 4);
      ctx.fillStyle = str(pal.text); ctx.fillRect(x + 11, y - 10, 6, 6);
    }
    ctx.fillStyle = str(pal.hi); ctx.fillRect(x + 6, y, 16, 34);
    ctx.fillStyle = str(pal.muted); ctx.fillRect(x + 10, y - 2, 8, 30);
    // cell meter on the barrel: the gun tells you when it's running dry
    const cells = clamp(Math.ceil(ammo / 6), 0, 5);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < cells ? str(ammo <= 5 ? pal.red : pal.wall) : str(mix(pal.muted, pal.bg, 0.5));
      ctx.fillRect(x + 12, y + 14 - i * 3, 4, 2);
    }
    ctx.fillStyle = str(pal.line); ctx.fillRect(x, y + 18, 28, 16);
    ctx.fillStyle = str(mix(pal.line, pal.hi, 0.5)); ctx.fillRect(x, y + 18, 28, 1);
  }
  function drawCrosshair() {
    const gap = 2 + (shootCd > 0 ? (shootCd / 0.3) * 3 : 0), cx = W / 2, cy = H / 2;
    ctx.fillStyle = str(pal.text);
    ctx.fillRect(cx - gap - 3, cy, 3, 1); ctx.fillRect(cx + gap + 1, cy, 3, 1);
    ctx.fillRect(cx, cy - gap - 3, 1, 3); ctx.fillRect(cx, cy + gap + 1, 1, 3);
    if (hitMark > 0) { // hit marker: diagonal ticks, red and wider on a kill
      const r = killMark ? 7 : 5, s = killMark ? 3 : 2;
      ctx.fillStyle = str(killMark ? pal.red : pal.text);
      for (let i = 0; i < s; i++) for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.fillRect(cx + dx * (r - i) - (dx < 0 ? 1 : 0), cy + dy * (r - i) - (dy < 0 ? 1 : 0), 1, 1);
    }
  }
  function drawParts(horizon) {
    for (const p of parts) {
      const q = project(p);
      if (!q || q.depth < 0.35) continue;
      const sx = q.sx | 0;
      if (sx < 0 || sx >= W || q.depth >= zbuf[sx]) continue;
      const sz = clamp(Math.round(q.size * p.sz), 1, 3);
      ctx.globalAlpha = clamp(p.life * 2, 0, 1) * (1 - clamp(q.depth / 9, 0, 0.8));
      ctx.fillStyle = str(p.c);
      ctx.fillRect(sx, Math.round(horizon + (0.5 - p.z) * q.size), sz, sz);
    }
    ctx.globalAlpha = 1;
  }
  // bug shots: a short beam from the eye, into the view on a hit, past you on a miss
  function drawZaps(horizon) {
    for (const z of zaps) {
      const q = project(z.e);
      const a = clamp(z.t / 0.12, 0, 1);
      let x0, y0;
      if (q && q.depth < zbuf[clamp(q.sx | 0, 0, W - 1)]) { x0 = q.sx; y0 = horizon + q.size * 0.5 - q.size * 0.8 * 0.55; }
      else continue; // fired from out of view: the damage arc tells you where
      const x1 = z.hit ? W / 2 + (x0 - W / 2) * 0.15 : W / 2 + z.off * W, y1 = H + 4;
      ctx.globalAlpha = a;
      ctx.strokeStyle = str(pal.red); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = str(pal.text); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  function drawDamageDirs() {
    for (const dd of dmgDirs) {
      let rel = dd.a - P.a; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      const ang = -Math.PI / 2 + rel, r = Math.min(W, H) * 0.36;
      ctx.globalAlpha = clamp(dd.t / 0.8, 0, 1) * 0.9;
      ctx.strokeStyle = str(pal.red); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, r, ang - 0.32, ang + 0.32); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  function drawMap() {
    const s = Math.max(2, Math.floor(Math.min(W, H) * 0.45 / Math.max(grid.length, grid[0].length))), ox = 6, oy = 6;
    ctx.globalAlpha = 0.85;
    for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[y].length; x++) {
      const t = grid[y][x];
      ctx.fillStyle = t === "." ? str(pal.bg) : t === "X" ? str(pal.text) : t === "%" ? str(pal.alt) : str(pal.hi);
      ctx.fillRect(ox + x * s, oy + y * s, s, s);
    }
    for (const e of ents) if (!e.taken && (e.kind !== "bug" || e.hp > 0)) { ctx.fillStyle = str(e.kind === "bug" ? pal.red : pal.wall); ctx.fillRect(ox + e.x * s - 1, oy + e.y * s - 1, 2, 2); }
    ctx.fillStyle = str(pal.wall); ctx.fillRect(ox + P.x * s - 1.5, oy + P.y * s - 1.5, 3, 3);
    ctx.fillRect(ox + (P.x + Math.cos(P.a)) * s - 0.5, oy + (P.y + Math.sin(P.a)) * s - 0.5, 1, 1);
    ctx.globalAlpha = 1;
  }
  function text(t, y, px, alpha = 1) {
    if (!t) return;
    ctx.font = `${px}px "Martian Mono", monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.globalAlpha = alpha;
    ctx.fillStyle = str(pal.bg); ctx.fillText(t, W / 2 + 1, y + 1);
    ctx.fillStyle = str(pal.text); ctx.fillText(t, W / 2, y);
    ctx.globalAlpha = 1;
  }
  function overlay() {
    ctx.fillStyle = pal.light ? "rgba(242,239,230,0.75)" : "rgba(0,0,0,0.6)";
    ctx.fillRect(0, H / 2 - 30, W, 60);
    const lines = {
      title: ["BUGHUNT.EXE", "click or space to start"],
      dead: ["segfault · you died", `score ${score} · space to retry`],
      won: ["all sectors clean", `score ${score} · best ${best} · space`],
    }[state] || ["paused", "click to resume"];
    text(lines[0], H / 2 - 12, 12);
    text(lines[1], H / 2 + 6, 8, 0.85);
    text(soundLabel(), H / 2 + 19, 6, 0.55);
  }
  function soundLabel() {
    if (sfx.muted && soundtrack.muted) return "sound off · n to turn on";
    if (soundtrack.muted) return "sfx only · n to cycle sound";
    return "score by noise.app · n to cycle sound";
  }
  // n cycles: music + sfx → sfx only → silent → music + sfx
  function cycleSound() {
    if (!soundtrack.muted) { soundtrack.setMuted(true); say("music off · sfx on"); }
    else if (!sfx.muted) { sfx.setMuted(true); say("sound off"); }
    else {
      sfx.setMuted(false); soundtrack.setMuted(false); sfx.unlock(); sfx.start(); say("sound on · score by noise.app");
      if (state === "play") soundtrack.sector(lvl);
      else if (state === "won") soundtrack.sector(0, true);
    }
    dirty = true;
  }
  function hudUpdate() {
    const snd = soundtrack.muted ? (sfx.muted ? "off" : "sfx") : "on";
    const cur = `${hp}|${ammo}|${bugsLeft()}|${score}|${lvl}|${snd}`;
    if (hud.dataset.v === cur) return;
    hud.dataset.v = cur;
    const warn = (on) => (on ? "warn" : "");
    hud.replaceChildren(
      h("span", { className: warn(hp <= 30) }, "hp ", h("b", { textContent: hp })),
      h("span", { className: warn(ammo <= 5) }, "cells ", h("b", { textContent: ammo })),
      h("span", {}, "bugs ", h("b", { textContent: bugsLeft() })),
      h("span", {}, "score ", h("b", { textContent: score })),
      h("span", { className: "dim", textContent: `m map · n ♪ ${snd}` }),
    );
    setMeta?.(`${LEVELS[lvl].name.split(" · ")[0]} · ${score}`);
  }

  /* ---------- loop + sizing ---------- */
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (document.hidden) { last = 0; return; }
    const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 0;
    last = now;
    if (state === "play" && focused) update(dt);
    if (dirty || state === "play") { render(); dirty = false; }
  }
  function resize() {
    const bw = board.clientWidth, bh = board.clientHeight;
    if (!bw || !bh) return;
    const aspect = clamp(bw / bh, 1.25, 2);
    W = 320; H = Math.round(W / aspect);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; zbuf = new Float32Array(W); }
    let cw = bw, ch = bw / aspect;
    if (ch > bh) { ch = bh; cw = bh * aspect; }
    canvas.style.width = `${Math.floor(cw)}px`; canvas.style.height = `${Math.floor(ch)}px`;
    ctx.imageSmoothingEnabled = false;
    dirty = true;
  }

  /* ---------- input ---------- */
  const start = () => { if (state !== "play") newGame(); };
  function onKey(e) {
    if (document.activeElement !== canvas) return;
    const k = e.key.toLowerCase();
    if (k === " " && state !== "play") { e.preventDefault(); start(); dirty = true; return; }
    if (k === "m") { showMap = !showMap; dirty = true; }
    if (k === "n" && !e.repeat) cycleSound();
    if ((k === " " || k === "f") && !e.repeat && shootCd <= 0) fire(); // quick taps can land between frames
    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
    keys.add(k);
  }
  const onKeyUp = (e) => keys.delete(e.key.toLowerCase());
  const onMouse = (e) => { if (document.pointerLockElement === canvas && state === "play") P.a += e.movementX * 0.0025; };
  canvas.addEventListener("focus", () => { focused = true; dirty = true; if (state === "play") soundtrack.resume(); });
  canvas.addEventListener("blur", () => { focused = false; keys.clear(); dirty = true; if (state === "play") soundtrack.pause(); });
  canvas.addEventListener("pointerdown", (e) => {
    canvas.focus();
    if (state !== "play") { start(); dirty = true; }
    if (e.pointerType === "touch") { touch = { x: e.clientX, y: e.clientY, lx: e.clientX, t: performance.now() }; canvas.setPointerCapture(e.pointerId); return; }
    if (document.pointerLockElement === canvas) fire();
    else canvas.requestPointerLock?.()?.catch?.(() => {});
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!touch || e.pointerType !== "touch" || state !== "play") return;
    P.a += (e.clientX - touch.lx) * 0.008; touch.lx = e.clientX;
    touchMove = clamp(-(e.clientY - touch.y) / 60, -1, 1);
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!touch) return;
    if (Math.hypot(e.clientX - touch.x, e.clientY - touch.y) < 10 && performance.now() - touch.t < 300) fire();
    touch = null; touchMove = 0;
  });
  canvas.addEventListener("pointercancel", () => { touch = null; touchMove = 0; });
  addEventListener("keydown", onKey);
  addEventListener("keyup", onKeyUp);
  document.addEventListener("mousemove", onMouse);
  const ro = new ResizeObserver(resize);
  ro.observe(board);

  load(0);
  resize();
  raf = requestAnimationFrame(frame);
  canvas.focus();
  return {
    stop() {
      cancelAnimationFrame(raf); raf = 0; ro.disconnect();
      soundtrack.release(0.8); sfx.close();
      removeEventListener("keydown", onKey); removeEventListener("keyup", onKeyUp);
      document.removeEventListener("mousemove", onMouse);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },
  };
}

export const FPS_LEVELS = LEVELS; // exported for sanity checks
