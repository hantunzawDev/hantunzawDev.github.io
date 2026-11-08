// Particle field: one job · a slow, living backdrop whose colour follows the sun
// and whose drift reacts to today's weather. Content never depends on it.
import * as THREE from "three";

const PHASE_COLORS = {
  dawn:  ["#f4b17a", "#7a3f2e"],
  day:   ["#86dccf", "#245a6e"],
  dusk:  ["#f59a8a", "#6a2a3a"],
  night: ["#8cc8ff", "#173a5c"],
};

const vert = /* glsl */ `
  uniform float uTime;
  uniform float uFall;
  uniform float uPixel;
  uniform vec2  uPointer;
  attribute float aSeed;
  attribute float aSize;
  varying float vSeed;
  varying float vDepth;

  void main() {
    vec3 p = position;
    float t = uTime * 0.04;
    // gentle swirling drift
    p.x += sin(t * 1.3 + aSeed * 6.283 + p.y * 0.35) * 0.55;
    p.y += cos(t * 1.1 + aSeed * 4.0 + p.x * 0.25) * 0.45;
    p.z += sin(t * 0.9 + aSeed * 9.0) * 0.6;
    // weather: rain makes the field fall, wrapping vertically
    p.y = mod(p.y - uTime * uFall * (0.6 + aSeed) + 9.0, 18.0) - 9.0;
    // pointer parallax: nearer particles move more
    p.xy += uPointer * (p.z + 6.0) * 0.06;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixel * (38.0 / -mv.z);
    vSeed = aSeed;
    vDepth = clamp((-mv.z - 4.0) / 16.0, 0.0, 1.0);
  }
`;

const frag = /* glsl */ `
  uniform vec3 uA;
  uniform vec3 uB;
  uniform float uTime;
  varying float vSeed;
  varying float vDepth;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    // bright core + soft halo
    float core = smoothstep(0.22, 0.0, d);
    float halo = smoothstep(0.5, 0.0, d) * 0.35;
    float a = core + halo;
    float twinkle = 0.7 + 0.3 * sin(uTime * (0.6 + vSeed) + vSeed * 40.0);
    vec3 col = mix(uA, uB, vDepth * 0.8 + vSeed * 0.2);
    gl_FragColor = vec4(col, a * twinkle * (1.0 - vDepth * 0.6) * 0.9);
  }
`;

export function createScene(canvas) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "low-power" });
  } catch {
    return null; // CSS poster on #scene stays visible
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  const small = Math.min(innerWidth, innerHeight) < 700;
  const COUNT = small ? 1400 : 2800;
  const pos = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT);
  const size = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 26;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 18;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 14 - 2;
    seed[i] = Math.random();
    size[i] = Math.random() < 0.04 ? 3.2 + Math.random() * 2.5 : 0.6 + Math.random() * 1.4;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));

  const uniforms = {
    uTime: { value: 0 },
    uFall: { value: 0 },
    uPixel: { value: dpr },
    uPointer: { value: new THREE.Vector2() },
    uA: { value: new THREE.Color(PHASE_COLORS.night[0]) },
    uB: { value: new THREE.Color(PHASE_COLORS.night[1]) },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  // targets eased toward each frame
  const target = { a: uniforms.uA.value.clone(), b: uniforms.uB.value.clone(), fall: 0, px: 0, py: 0 };

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (reduce) renderer.render(scene, camera);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  let pointerQueued = false;
  function onPointer(e) {
    if (pointerQueued || e.pointerType === "touch") return;
    pointerQueued = true;
    requestAnimationFrame(() => {
      target.px = (e.clientX / innerWidth - 0.5) * 2;
      target.py = -(e.clientY / innerHeight - 0.5) * 2;
      pointerQueued = false;
    });
  }
  function onLeave() { target.px = 0; target.py = 0; }
  if (!reduce) {
    addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    addEventListener("blur", onLeave);
  }

  let raf = 0, last = performance.now(), time = Math.random() * 100;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    time += dt;
    const k = 1 - Math.exp(-dt * 2.5);
    uniforms.uTime.value = time;
    uniforms.uA.value.lerp(target.a, k);
    uniforms.uB.value.lerp(target.b, k);
    uniforms.uFall.value += (target.fall - uniforms.uFall.value) * k;
    const p = uniforms.uPointer.value;
    p.x += (target.px - p.x) * k;
    p.y += (target.py - p.y) * k;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  function start() { if (!raf && !reduce) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  function onVis() { document.hidden ? stop() : start(); }
  document.addEventListener("visibilitychange", onVis);

  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); stop(); });
  canvas.addEventListener("webglcontextrestored", () => { resize(); start(); });

  resize();
  if (reduce) renderer.render(scene, camera); else start();

  return {
    setMood({ phase = "night", rain = 0 } = {}) {
      const [a, b] = PHASE_COLORS[phase] || PHASE_COLORS.night;
      target.a.set(a); target.b.set(b);
      target.fall = Math.max(0, Math.min(1, rain)) * 0.9;
      if (reduce) {
        uniforms.uA.value.copy(target.a); uniforms.uB.value.copy(target.b);
        renderer.render(scene, camera);
      }
    },
    dispose() {
      stop(); ro.disconnect();
      removeEventListener("pointermove", onPointer);
      document.removeEventListener("pointerleave", onLeave);
      removeEventListener("blur", onLeave);
      document.removeEventListener("visibilitychange", onVis);
      geo.dispose(); mat.dispose(); renderer.dispose();
    },
  };
}
