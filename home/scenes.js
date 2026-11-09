// Three.js scenes shared by viz.app and the stage backdrop. Each maker takes
// (THREE, col) and returns { scene, camera, post, update(dt, t, extra), resize?(w, h), dispose }.
//
// post: true scenes draw plain intensity (white on black, mostly additive);
// post.js blooms that and maps it onto the theme colours. post: false scenes
// (aurora) draw final colours straight to the screen using col.fg / col.bg.
// Audio comes from audio.js; the host calls audio.read(t) before update().
import { audio, bands, waveF, BANDS } from "./audio.js";

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Ashima/Stefan Gustavson 3D simplex noise (MIT)
const SNOISE = /* glsl */`
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }`;

// sample the 64 bands at 0..1 with linear interpolation
function bandAt(u) {
  const x = Math.min(BANDS - 1, Math.max(0, u * (BANDS - 1)));
  const i = Math.floor(x), f = x - i;
  return bands[i] * (1 - f) + bands[Math.min(BANDS - 1, i + 1)] * f;
}
// projection scale in px for a vertical fov, for gl_PointSize in world units
const projScale = (h, fov) => (h * 0.5) / Math.tan((fov * Math.PI) / 360);

// ---------------------------------------------------------------------------
// orb: ~26k soft particles on a sphere, pushed out by the spectrum and folded
// by simplex noise; sparks fly off with the highs; two waveform rings orbit it
// ---------------------------------------------------------------------------
function orb(THREE) {
  const N = 26000;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  const pos = new Float32Array(N * 3), rnd = new Float32Array(N);
  const ga = Math.PI * (3 - Math.sqrt(5)); // fibonacci sphere: even spacing, no pole clumps
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), a = ga * i;
    pos.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
    rnd[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aRand", new THREE.BufferAttribute(rnd, 1));
  const data = new Uint8Array(BANDS);
  const tex = new THREE.DataTexture(data, BANDS, 1, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  const uniforms = {
    uBands: { value: tex }, uTime: { value: 0 }, uLevel: { value: 0 }, uBeat: { value: 0 },
    uHigh: { value: 0 }, uScale: { value: 800 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform sampler2D uBands; uniform float uTime, uLevel, uBeat, uHigh, uScale;
      attribute float aRand;
      varying float vI;
      ${SNOISE}
      void main() {
        vec3 n = position;
        float sw = snoise(n * 1.6 + vec3(0.0, uTime * 0.12, 0.0));
        float t = clamp(mix(abs(n.y), 0.5 + 0.5 * sw, 0.45), 0.0, 1.0);
        float b = texture2D(uBands, vec2(t * 0.96 + 0.02, 0.5)).r;
        float fold = snoise(n * 2.2 + vec3(uTime * 0.21, -uTime * 0.17, uTime * 0.13));
        float r = 1.45 + b * 0.85 + fold * (0.1 + uLevel * 0.45) + uBeat * 0.16;
        // ~6% of particles are sparks that lift off with the treble
        float spark = step(0.94, aRand) * uHigh * (1.4 + 1.2 * fract(aRand * 37.0 + uTime * 0.35));
        vec3 p = n * (r + spark);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (0.016 + b * 0.03 + spark * 0.02) * uScale / -mv.z;
        vI = 0.22 + b * 1.25 + spark * 0.9 + uBeat * 0.25;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vI;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.05, d);
        gl_FragColor = vec4(vec3(vI), a);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);

  // waveform rings: line loops whose radius follows the live waveform
  const SEG = 256, rings = [];
  for (let k = 0; k < 2; k++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SEG * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.LineBasicMaterial({ color: new THREE.Color(0.85, 0.85, 0.85), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.LineLoop(g, m);
    line.rotation.x = k ? 1.25 : 1.75;
    line.rotation.y = k ? 0.5 : -0.3;
    scene.add(line);
    rings.push(line);
  }
  let angle = 0;
  return {
    scene, camera, post: true,
    resize(w, h) { uniforms.uScale.value = projScale(h * Math.min(devicePixelRatio, 1.5), camera.fov); },
    update(dt, t) {
      for (let i = 0; i < BANDS; i++) data[i] = Math.round(bands[i] * 255);
      tex.needsUpdate = true;
      uniforms.uTime.value = t;
      uniforms.uLevel.value = audio.level;
      uniforms.uBeat.value = audio.beat;
      uniforms.uHigh.value = audio.high;
      rings.forEach((line, k) => {
        const p = line.geometry.attributes.position;
        const R = 2.55 + k * 0.45 + audio.bass * 0.3;
        for (let i = 0; i < SEG; i++) {
          const a = (i / SEG) * Math.PI * 2;
          // read the waveform symmetric around the loop so the seam closes cleanly
          const s = waveF[Math.floor((0.5 - Math.abs(i / SEG - 0.5)) * 2 * (waveF.length - 1))];
          const r = R + Math.tanh(s * 3) * 0.32;
          p.setXYZ(i, Math.cos(a) * r, Math.sin(a) * r, 0);
        }
        p.needsUpdate = true;
        line.material.opacity = 0.35 + audio.level * 0.8;
        if (!reduce) line.rotation.z += dt * (k ? -0.12 : 0.09);
      });
      if (!reduce) { angle += dt * (0.1 + audio.bass * 0.25); pts.rotation.y += dt * 0.05; }
      const dist = 7.4 - audio.beat * 0.35;
      camera.position.set(Math.sin(angle) * dist, Math.sin(angle * 0.6) * 1.4, Math.cos(angle) * dist);
      camera.lookAt(0, 0, 0);
    },
    dispose() { geo.dispose(); mat.dispose(); tex.dispose(); rings.forEach((l) => { l.geometry.dispose(); l.material.dispose(); }); },
  };
}

// ---------------------------------------------------------------------------
// terrain: a scrolling spectrogram landscape. Each row of the ground is one
// moment of the spectrum (newest at your feet), mirrored so bass builds the
// valley walls and the middle stays a flat road; glowing grid lines, a
// slatted sun on the horizon that swells on the kick, and a few stars.
// ---------------------------------------------------------------------------
function terrain(THREE) {
  const ROWS = 112, COLS = 128, W = 46, D = 64, RATE = 12; // rows pushed per second
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 200);
  const hist = new Uint8Array(BANDS * ROWS);
  const tex = new THREE.DataTexture(hist, BANDS, ROWS, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapT = THREE.RepeatWrapping;
  const uniforms = {
    uHist: { value: tex }, uHead: { value: 0 }, uPhase: { value: 0 }, uTime: { value: 0 },
    uBeat: { value: 0 }, uCell: { value: D / (ROWS - 1) },
  };
  const geo = new THREE.PlaneGeometry(W, D, COLS, ROWS - 1).rotateX(-Math.PI / 2).translate(0, 0, -D / 2 + 6);
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      uniform sampler2D uHist; uniform float uHead, uPhase, uTime, uCell;
      varying vec2 vGrid; varying float vH; varying float vDist;
      ${SNOISE}
      void main() {
        float fx = abs(uv.x - 0.5) * 2.0;                       // 0 middle, 1 edge
        float row = (uHead - uv.y * ${(ROWS - 1).toFixed(1)} + 0.5) / ${ROWS.toFixed(1)};
        float v = texture2D(uHist, vec2((1.0 - fx) * 0.96 + 0.02, row)).r;
        float road = smoothstep(0.05, 0.24, fx);                // flat lane down the middle
        float h = pow(v, 1.35) * 7.5 * (0.3 + fx * 1.15) * road;
        h += (snoise(vec3(position.xz * 0.12, 0.0)) * 0.5 + 0.5) * 1.6 * fx * fx * road;
        vec3 p = position;
        p.y += h;
        p.z += uPhase * uCell;                                  // smooth scroll between row pushes
        vH = clamp(h / 7.0, 0.0, 1.0);
        vGrid = vec2(uv.x * ${COLS.toFixed(1)}, uv.y * ${(ROWS - 1).toFixed(1)});
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uBeat;
      varying vec2 vGrid; varying float vH; varying float vDist;
      void main() {
        vec2 gw = fwidth(vGrid);
        vec2 l = abs(fract(vGrid - 0.5) - 0.5) / max(gw, 1e-4);
        float line = 1.0 - min(min(l.x, l.y), 1.0);
        line *= 1.0 - smoothstep(0.35, 0.9, max(gw.x, gw.y));   // fade lines before they moire
        float fog = 1.0 - smoothstep(14.0, 62.0, vDist);
        float I = (line * (0.5 + vH * 0.9 + uBeat * 0.25) + 0.03 + vH * 0.1) * fog;
        gl_FragColor = vec4(vec3(I), 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(geo, mat));

  // sun: a disc with horizontal slats that slide down
  const sunU = { uTime: { value: 0 }, uBeat: { value: 0 } };
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShaderMaterial({
    uniforms: sunU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uBeat; varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float disc = smoothstep(0.62 + uBeat * 0.04, 0.6, r);
        float y = p.y;                                           // slats only on the lower half
        float slat = step(0.0, y) + (1.0 - step(0.0, y)) * step(0.5 + y * 0.9, fract(y * 9.0 + uTime * 0.3));
        float halo = exp(-max(r - 0.55, 0.0) * 6.0) * 0.16 * smoothstep(1.0, 0.75, r); // fade out before the quad edge
        gl_FragColor = vec4(vec3(disc * slat * (1.1 + uBeat * 0.9) + halo), 1.0);
      }`,
  }));
  sun.position.set(0, 7, -70);
  scene.add(sun);

  // stars: sparse, above the horizon only
  const SN = 500, sp = new Float32Array(SN * 3);
  for (let i = 0; i < SN; i++) sp.set([(Math.random() - 0.5) * 220, 6 + Math.random() * 70, -80 - Math.random() * 30], i * 3);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  const sm = new THREE.PointsMaterial({ color: new THREE.Color(0.35, 0.35, 0.35), size: 1.6, sizeAttenuation: false });
  scene.add(new THREE.Points(sg, sm));

  let head = 0, acc = 0;
  return {
    scene, camera, post: true,
    update(dt, t) {
      acc += dt * RATE;
      while (acc >= 1) {
        acc -= 1;
        head = (head + 1) % ROWS;
        for (let i = 0; i < BANDS; i++) hist[head * BANDS + i] = Math.round(bands[i] * 255);
        tex.needsUpdate = true;
      }
      uniforms.uHead.value = head;
      uniforms.uPhase.value = acc;
      uniforms.uTime.value = t;
      uniforms.uBeat.value = sunU.uBeat.value = audio.beat;
      sunU.uTime.value = t;
      const sway = reduce ? 0 : Math.sin(t * 0.23) * 1.2;
      camera.position.set(sway, 2.6 + audio.bass * 0.6, 9);
      camera.lookAt(sway * 0.4, 2.2, -40);
    },
    dispose() { geo.dispose(); mat.dispose(); tex.dispose(); sun.geometry.dispose(); sun.material.dispose(); sg.dispose(); sm.dispose(); },
  };
}

// ---------------------------------------------------------------------------
// pulsar: stacked spectrum ridgelines. The front line is live; every 1/9 s it
// freezes and the stack steps back and up, each ridge filled with black so it
// hides the ones behind it. Older ridges dim as they recede.
// ---------------------------------------------------------------------------
function pulsar(THREE) {
  const LINES = 64, PTS = 200, W = 11, GAP = 0.2, AMP = 2.4, RATE = 9, CAMZ = 12, STEP = 0.1;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const history = Array.from({ length: LINES }, () => new Float32Array(PTS));
  const jitter = new Float32Array(PTS);
  const ridges = [];
  const black = new THREE.MeshBasicMaterial({ color: 0x000000, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, side: THREE.DoubleSide });
  for (let k = 0; k < LINES; k++) {
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PTS * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const lm = new THREE.LineBasicMaterial({ color: 0xffffff });
    const line = new THREE.Line(lg, lm);
    // fill: a strip from the ridge down to its baseline
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PTS * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < PTS - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    fg.setIndex(idx);
    const fill = new THREE.Mesh(fg, black);
    const group = new THREE.Group();
    group.add(fill, line);
    scene.add(group);
    ridges.push({ group, line, fill, lm });
  }
  // shape one ridge from the current spectrum: mirrored low half of the bands,
  // under a soft window so peaks gather in the middle and the edges stay calm
  function sample(out) {
    for (let i = 0; i < PTS; i++) {
      const u = i / (PTS - 1), d = Math.abs(u - 0.5) * 2;
      const win = Math.exp(-Math.pow(d / 0.36, 2));
      jitter[i] += ((Math.random() - 0.5) - jitter[i]) * 0.5;
      out[i] = win * (bandAt(d * 0.62) * 1.25 + jitter[i] * (0.05 + audio.level * 0.22)) + (1 - win) * jitter[i] * 0.015;
    }
  }
  function write(r, vals) {
    const lp = r.line.geometry.attributes.position, fp = r.fill.geometry.attributes.position;
    for (let i = 0; i < PTS; i++) {
      const x = (i / (PTS - 1) - 0.5) * W, y = Math.max(0, vals[i]) * AMP;
      lp.setXYZ(i, x, y, 0);
      fp.setXYZ(i * 2, x, y, 0);
      fp.setXYZ(i * 2 + 1, x, -GAP * 0.5, 0);
    }
    lp.needsUpdate = fp.needsUpdate = true;
  }
  let head = 0, acc = 0;
  return {
    scene, camera, post: true,
    update(dt, t, { aspect = 1.6 } = {}) {
      const tanH = Math.tan((camera.fov * Math.PI) / 360);
      acc += dt * (reduce ? RATE * 0.4 : RATE);
      while (acc >= 1) { acc -= 1; head = (head + 1) % LINES; sample(history[head]); }
      sample(history[head]); // front ridge stays live between freezes
      for (let k = 0; k < LINES; k++) {
        const r = ridges[k];
        write(r, history[(head - k + LINES) % LINES]);
        const depth = k + acc;
        // full bleed: spread the ridges evenly from the bottom edge to the top
        // of the frame, and stretch each to the frame's width at its own depth
        const z = -depth * STEP, d = CAMZ - z;
        const ndcY = -0.94 + (depth / LINES) * 1.86;
        r.group.position.set(0, ndcY * tanH * d, z);
        r.group.scale.x = (2 * tanH * aspect * d * 1.02) / W;
        // fade the newest in and the oldest out so nothing pops
        const edge = k === LINES - 1 ? 1 - acc : 1;
        const fade = (0.35 + 0.65 * Math.pow(1 - depth / LINES, 1.2)) * edge;
        r.lm.color.setScalar(fade * (k === 0 ? 1.35 + audio.beat * 0.6 : 0.95));
      }
      camera.position.set(0, 0, CAMZ); // straight on, so the stack fills the frame edge to edge
      camera.lookAt(0, 0, 0);
    },
    dispose() {
      ridges.forEach((r) => { r.line.geometry.dispose(); r.fill.geometry.dispose(); r.lm.dispose(); });
      black.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// ambient scenes (no audio needed, but they lean on it a little when a source is on)
// ---------------------------------------------------------------------------

// drift: square motes (dot-matrix, like the clock) floating toward you, with
// the camera easing toward the pointer
function drift(THREE) {
  const COUNT = 2200, W = 40, H = 24, D = 60;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 4, D * 0.85);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 120);
  camera.position.set(0, 0, 6);
  const pos = new Float32Array(COUNT * 3), speed = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (Math.random() - 0.5) * W;
    pos[i * 3 + 1] = (Math.random() - 0.5) * H;
    pos[i * 3 + 2] = -Math.random() * D;
    speed[i] = 0.4 + Math.random() * 0.9;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.PointsMaterial({ color: new THREE.Color(0.9, 0.9, 0.9), size: 0.07, sizeAttenuation: true, fog: true });
  scene.add(new THREE.Points(geo, mat));
  const look = new THREE.Vector3(0, 0, -D);
  return {
    scene, camera, post: true,
    update(dt, t, { px = 0, py = 0 } = {}) {
      const boost = audio.source !== "off" ? audio.bass * 6 : 0;
      const k = (reduce ? 0.25 : 1) * (1 + boost);
      for (let i = 0; i < COUNT; i++) {
        const z = i * 3 + 2;
        pos[z] += speed[i] * dt * 2.2 * k;
        pos[i * 3] += Math.sin(t * 0.2 + i) * dt * 0.05 * k;
        if (pos[z] > camera.position.z) {
          pos[z] -= D;
          pos[i * 3] = (Math.random() - 0.5) * W;
          pos[i * 3 + 1] = (Math.random() - 0.5) * H;
        }
      }
      geo.attributes.position.needsUpdate = true;
      const ease = reduce ? 0 : Math.min(1, dt * 1.5);
      camera.position.x += (px * 1.6 - camera.position.x) * ease;
      camera.position.y += (-py * 1.0 - camera.position.y) * ease;
      camera.lookAt(look);
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

// aurora: one full-screen quad, layered value-noise ribbons in the accent
function aurora(THREE, col) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = {
    uTime: { value: 0 }, uLevel: { value: 0 }, uAspect: { value: 1 },
    uColor: { value: col.fg }, uBg: { value: col.bg },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, depthTest: false, depthWrite: false,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uLevel; uniform float uAspect;
      uniform vec3 uColor; uniform vec3 uBg;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
      void main() {
        vec2 p = vec2(vUv.x * uAspect, vUv.y);
        float t = uTime * 0.05;
        float glow = 0.0;
        for (int k = 0; k < 3; k++) {
          float fk = float(k);
          float y = 0.35 + fk * 0.14 + (fbm(vec2(p.x * 0.9 + t * (1.0 + fk * 0.4), fk * 3.1 + t)) - 0.5) * 0.45;
          float d = abs(p.y - y);
          float w = 0.035 + 0.05 * fbm(vec2(p.x * 2.0 - t * 2.0, fk));
          glow += (0.55 - fk * 0.12) * smoothstep(w * (3.0 + uLevel * 4.0), 0.0, d);
        }
        glow *= 0.75 + 0.25 * fbm(p * 3.0 + t * 3.0);
        // fine dither so the gradient doesn't band on 8-bit screens
        glow += (hash(gl_FragCoord.xy + uTime) - 0.5) * 0.02;
        gl_FragColor = vec4(mix(uBg, uColor, clamp(glow * 1.5, 0.0, 1.0) * 0.9), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const geo = new THREE.PlaneGeometry(2, 2);
  scene.add(new THREE.Mesh(geo, mat));
  let time = 40; // start mid-flow, not on the hash's flat origin
  return {
    scene, camera, post: false,
    update(dt, t, { aspect = 1 } = {}) {
      if (!reduce) time += dt;
      uniforms.uTime.value = time;
      uniforms.uAspect.value = aspect;
      uniforms.uLevel.value = audio.source !== "off" ? audio.level : 0;
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

export const AUDIO_SCENES = ["orb", "terrain", "pulsar"];
export const MAKERS = { orb, terrain, pulsar, drift, aurora };
