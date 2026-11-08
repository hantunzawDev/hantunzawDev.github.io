// world.3d: a dotted wireframe Earth. Its one job: show where you are and
// which side of the day/night line you're on, from the real sun position.
import * as THREE from "three";

const LIME = new THREE.Color("#c6f432");
const AMBER = new THREE.Color("#ffb547");

function sunDirection(date) {
  // subsolar point: declination from day of year, longitude from UTC time
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const doy = (date - start) / 864e5;
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (doy + 10));
  const utcH = date.getUTCHours() + date.getUTCMinutes() / 60;
  const lon = (12 - utcH) * 15;
  return latLonToVec(decl, lon, 1);
}
function latLonToVec(lat, lon, r) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

const vert = /* glsl */ `
  uniform vec3 uSun;
  uniform float uPixel;
  varying float vLight;
  varying float vFacing;
  void main() {
    vec3 n = normalize(position);
    vLight = smoothstep(-0.12, 0.18, dot(n, uSun));
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vFacing = clamp(dot(normalize(normalMatrix * n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
    gl_PointSize = uPixel * mix(1.4, 2.6, vLight);
    gl_Position = projectionMatrix * mv;
  }
`;
const frag = /* glsl */ `
  uniform vec3 uColor;
  varying float vLight;
  varying float vFacing;
  void main() {
    if (length(gl_PointCoord - 0.5) > 0.5) discard;
    float a = mix(0.18, 1.0, vLight) * mix(0.15, 1.0, vFacing);
    gl_FragColor = vec4(uColor * mix(0.45, 1.0, vLight), a);
  }
`;

export function createGlobe(canvas) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" }); }
  catch { return null; }
  const dpr = Math.min(devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.set(0, 0, 3.6);
  const world = new THREE.Group();
  scene.add(world);

  // fibonacci-sphere dots
  const N = 2600;
  const pos = new Float32Array(N * 3);
  const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(g * i) * r; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(g * i) * r;
  }
  const dotsGeo = new THREE.BufferGeometry();
  dotsGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const uniforms = { uSun: { value: new THREE.Vector3(1, 0, 0) }, uPixel: { value: dpr }, uColor: { value: LIME } };
  const dotsMat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, transparent: true, depthWrite: false });
  world.add(new THREE.Points(dotsGeo, dotsMat));

  // graticule every 30 degrees
  const grat = [];
  for (let lat = -60; lat <= 60; lat += 30) for (let lon = 0; lon < 360; lon += 4) grat.push(latLonToVec(lat, lon, 1.002), latLonToVec(lat, lon + 4, 1.002));
  for (let lon = 0; lon < 180; lon += 30) for (let lat = -90; lat < 90; lat += 4) {
    grat.push(latLonToVec(lat, lon, 1.002), latLonToVec(lat + 4, lon, 1.002));
    grat.push(latLonToVec(lat, lon + 180, 1.002), latLonToVec(lat + 4, lon + 180, 1.002));
  }
  const gratGeo = new THREE.BufferGeometry().setFromPoints(grat);
  const gratMat = new THREE.LineBasicMaterial({ color: LIME, transparent: true, opacity: 0.14 });
  world.add(new THREE.LineSegments(gratGeo, gratMat));

  // terminator ring (day/night line)
  const termGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 129 }, (_, i) => {
    const a = (i / 128) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * 1.01, Math.sin(a) * 1.01, 0);
  }));
  const termMat = new THREE.LineDashedMaterial({ color: AMBER, transparent: true, opacity: 0.6, dashSize: 0.05, gapSize: 0.04 });
  const term = new THREE.Line(termGeo, termMat);
  term.computeLineDistances();
  world.add(term);

  // you-are-here marker: core + pulsing ring
  const marker = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 12), new THREE.MeshBasicMaterial({ color: AMBER }));
  const ringMat = new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.04, 0.05, 32), ringMat);
  marker.add(core, ring);
  world.add(marker);

  let target = { lat: 16.84, lon: 96.17 };
  let baseYaw = 0;
  function place() {
    const p = latLonToVec(target.lat, target.lon, 1.0);
    marker.position.copy(p);
    marker.lookAt(p.clone().multiplyScalar(2));
    // rotate the world so the marker faces the camera, tilted a little
    baseYaw = -Math.atan2(p.x, p.z);
    world.rotation.x = THREE.MathUtils.degToRad(target.lat) * 0.6;
  }
  function updateSun() {
    const s = sunDirection(new Date());
    uniforms.uSun.value.copy(s);
    term.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s);
  }
  place(); updateSun();

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the whole sphere (plus marker ring) in frame whatever the window shape
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.z = 1.22 / (half * Math.min(1, camera.aspect));
    camera.updateProjectionMatrix();
    if (reduce) render(0);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  let visible = true;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); });
  io.observe(canvas);

  let raf = 0, t0 = performance.now(), lastSun = 0;
  function render(t) {
    world.rotation.y = baseYaw + Math.sin(t * 0.00012) * 0.35;
    const k = (t * 0.0008) % 1;
    ring.scale.setScalar(1 + k * 2.2);
    ringMat.opacity = 0.8 * (1 - k);
    renderer.render(scene, camera);
  }
  function frame(now) {
    const t = now - t0;
    if (now - lastSun > 60e3) { updateSun(); lastSun = now; }
    render(t);
    raf = requestAnimationFrame(frame);
  }
  function start() { if (!raf && !reduce && visible && !document.hidden) raf = requestAnimationFrame(frame); }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener("visibilitychange", onVis);
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); stop(); });
  canvas.addEventListener("webglcontextrestored", () => { resize(); start(); });
  resize();
  reduce ? render(0) : start();

  return {
    setLocation(lat, lon) { target = { lat, lon }; place(); updateSun(); if (reduce) render(0); },
    setColors(accent, alert) {
      uniforms.uColor.value = new THREE.Color(accent);
      gratMat.color.set(accent);
      termMat.color.set(alert); core.material.color.set(alert); ringMat.color.set(alert);
      if (reduce) render(0);
    },
    isNight(lat, lon) { return latLonToVec(lat, lon, 1).dot(uniforms.uSun.value) < 0; },
    dispose() {
      stop(); ro.disconnect(); io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      [dotsGeo, gratGeo, termGeo, dotsMat, gratMat, termMat, ringMat].forEach((o) => o.dispose());
      renderer.dispose();
    },
  };
}
