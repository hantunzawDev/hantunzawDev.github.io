// world.map: a flat dot-matrix world map. One job: show where you are and
// where the day/night line sits right now, from the real sun position.
// Coastlines come from Natural Earth (via world-atlas) once, then live in
// localStorage as a tiny land mask so later loads draw instantly and offline.

const LAND_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json";
const TOPO_URL = "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm";
const MASK_W = 360, MASK_H = 180; // 1 degree cells
const MASK_KEY = "hz.landmask.v1";
const RAD = Math.PI / 180;

/* ---------- land mask ---------- */
async function loadMask() {
  try { const s = localStorage.getItem(MASK_KEY); if (s && s.length === MASK_W * MASK_H) return s; } catch {}
  const [{ feature }, topo] = await Promise.all([import(TOPO_URL), fetch(LAND_URL).then((r) => r.json())]);
  const land = feature(topo, topo.objects.land);
  const c = document.createElement("canvas");
  c.width = MASK_W; c.height = MASK_H;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.beginPath();
  const ring = (pts) => pts.forEach(([lon, lat], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, lon + 180, 90 - lat));
  for (const f of land.features) {
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    for (const poly of polys) for (const r of poly) { ring(r); ctx.closePath(); }
  }
  ctx.fill("evenodd");
  const px = ctx.getImageData(0, 0, MASK_W, MASK_H).data;
  let s = "";
  for (let i = 0; i < MASK_W * MASK_H; i++) s += px[i * 4 + 3] > 100 ? "1" : "0";
  try { localStorage.setItem(MASK_KEY, s); } catch {}
  return s;
}

/* ---------- sun ---------- */
export function subsolar(date = new Date()) {
  const doy = (date - Date.UTC(date.getUTCFullYear(), 0, 0)) / 864e5;
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (doy + 10));
  const utcH = date.getUTCHours() + date.getUTCMinutes() / 60;
  let lon = (12 - utcH) * 15;
  if (lon < -180) lon += 360;
  if (lon > 180) lon -= 360;
  return { lat: decl, lon };
}
// cosine of the sun's zenith angle at a point: > 0 is day
function sunHeight(lat, lon, sun) {
  return Math.sin(lat * RAD) * Math.sin(sun.lat * RAD) + Math.cos(lat * RAD) * Math.cos(sun.lat * RAD) * Math.cos((lon - sun.lon) * RAD);
}

export function createMap(canvas, pin) {
  const ctx = canvas.getContext("2d");
  let mask = null, loc = null, timer = 0;
  const css = (n) => getComputedStyle(canvas).getPropertyValue(n).trim();

  function draw() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const accent = css("--lime"), alert = css("--amber"), grid = css("--line-hi");
    const sun = subsolar();
    const cols = Math.max(60, Math.min(180, Math.floor(w / 4.5)));
    const rows = Math.round(cols / 2);
    const cw = w / cols, ch = h / rows;
    const r = Math.max(0.8, Math.min(cw, ch) * 0.34);
    for (let j = 0; j < rows; j++) {
      const lat = 90 - ((j + 0.5) * 180) / rows;
      for (let i = 0; i < cols; i++) {
        const lon = -180 + ((i + 0.5) * 360) / cols;
        const mx = Math.min(MASK_W - 1, Math.floor(lon + 180)), my = Math.min(MASK_H - 1, Math.floor(90 - lat));
        const isLand = mask ? mask[my * MASK_W + mx] === "1" : false;
        const day = Math.max(0, Math.min(1, (sunHeight(lat, lon, sun) + 0.1) / 0.2));
        if (isLand) {
          ctx.globalAlpha = 0.28 + 0.72 * day;
          ctx.fillStyle = accent;
          ctx.fillRect(i * cw + cw / 2 - r, j * ch + ch / 2 - r, r * 2, r * 2);
        } else if ((i + j) % 2 === 0) {
          ctx.globalAlpha = 0.35 + 0.25 * day;
          ctx.fillStyle = grid;
          ctx.fillRect(i * cw + cw / 2 - 0.5, j * ch + ch / 2 - 0.5, 1, 1);
        }
      }
    }
    ctx.globalAlpha = 1;
    // terminator: where the sun sits on the horizon
    const tanD = Math.tan((Math.abs(sun.lat) < 0.5 ? 0.5 : sun.lat) * RAD);
    ctx.strokeStyle = alert; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.globalAlpha = 0.8;
    ctx.beginPath();
    for (let lon = -180; lon <= 180; lon += 2) {
      const lat = Math.atan(-Math.cos((lon - sun.lon) * RAD) / tanD) / RAD;
      const x = ((lon + 180) / 360) * w, y = ((90 - lat) / 180) * h;
      lon === -180 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // the sun
    const sx = ((sun.lon + 180) / 360) * w, sy = ((90 - sun.lat) / 180) * h;
    ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    if (loc) {
      pin.hidden = false;
      pin.style.left = `${((loc.lon + 180) / 360) * 100}%`;
      pin.style.top = `${((90 - loc.lat) / 180) * 100}%`;
    }
  }

  const ro = new ResizeObserver(draw);
  ro.observe(canvas);
  const tick = () => { if (!document.hidden) draw(); };
  timer = setInterval(tick, 60e3);
  document.addEventListener("visibilitychange", tick);
  loadMask().then((m) => { mask = m; draw(); }).catch((e) => { console.warn("map: coastlines unavailable", e); draw(); });
  draw();

  return {
    setLocation(lat, lon) { loc = { lat, lon }; draw(); },
    isNight(lat, lon) { return sunHeight(lat, lon, subsolar()) < 0; },
    setColors() { draw(); },
    dispose() { clearInterval(timer); ro.disconnect(); document.removeEventListener("visibilitychange", tick); },
  };
}
