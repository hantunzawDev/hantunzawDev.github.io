// viz.app: a Three.js audio visualizer. Listens to the mic or to shared
// system/tab audio (getDisplayMedia, Chromium only) and draws one of three
// scenes: bars (frequency terrain), sphere (displaced wireframe), tunnel
// (waveform rings flying at you). The analyser is never routed to the
// speakers, so there is no feedback. Mounts into a container, returns
// { stop, setSource, setMode, setColors }.
import { store } from "./data.js";

const MODES = ["bars", "sphere", "tunnel"];
const SOURCES = ["mic", "sys", "off"];
const BANDS = 64;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const h = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) if (k != null) n.append(k);
  return n;
};
const cssVar = (name) => getComputedStyle(document.body).getPropertyValue(name).trim();

export function viz(root, { setMeta = () => {}, log = () => {} } = {}) {
  let THREE = null, renderer = null, raf = 0, ro = null, stopped = false;
  let mode = MODES.includes(store.get("viz.mode")) ? store.get("viz.mode") : "bars";
  let source = "off";
  const scenes = {};
  const accent = { lime: "#c6f432", bg: "#0a0c08" };
  let fg = null, bg = null; // THREE.Color, parsed once per theme change

  // ---------- audio ----------
  let ctx = null, analyser = null, srcNode = null, stream = null;
  let freq = null, wave = null, bandRanges = [];
  const bands = new Float32Array(BANDS);   // 0..1, smoothed per band
  const waveF = new Float32Array(256);     // -1..1, downsampled waveform
  let level = 0, bass = 0;

  // ---------- dom ----------
  const canvas = h("canvas", { tabIndex: 0 });
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Audio visualizer. Keys 1, 2, 3 switch scenes.");
  const hint = h("p", { className: "viz__hint", textContent: "loading three.js…" });
  const board = h("div", { className: "viz__board" }, canvas, hint);
  const keyRow = (label, items, current, onPick) => {
    const g = h("span", { className: "viz__group" });
    g.setAttribute("role", "radiogroup");
    g.setAttribute("aria-label", label);
    for (const it of items) {
      const b = h("button", { type: "button", className: "key", textContent: it });
      b.setAttribute("role", "radio");
      b.dataset.v = it;
      b.addEventListener("click", () => onPick(it));
      g.append(b);
    }
    const sync = (v) => g.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.v === v)));
    sync(current);
    return [g, sync];
  };
  const [srcGroup, syncSrc] = keyRow("Audio source", SOURCES, source, (v) => setSource(v));
  const [modeGroup, syncMode] = keyRow("Scene", MODES, mode, (v) => setMode(v));
  root.replaceChildren(board, h("div", { className: "viz__row" }, srcGroup, modeGroup));

  canvas.addEventListener("keydown", (e) => {
    const i = ["1", "2", "3"].indexOf(e.key);
    if (i >= 0) { e.preventDefault(); setMode(MODES[i]); }
  });

  function setHint(text) { hint.textContent = text; hint.hidden = !text; }

  // ---------- audio sources ----------
  async function setSource(next) {
    if (!SOURCES.includes(next)) return false;
    releaseStream();
    source = "off";
    syncSrc("off");
    if (next === "off") { setHint("pick a source: mic or sys"); return true; }
    try {
      if (next === "mic") {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("this browser has no microphone access");
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } else {
        if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("screen/tab audio capture isn't supported here");
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true, systemAudio: "include" });
        stream.getVideoTracks().forEach((t) => { t.stop(); stream.removeTrack(t); });
        if (!stream.getAudioTracks().length) {
          releaseStream();
          throw new Error('no audio was shared. pick a tab or screen and tick "share audio" (chrome/edge only)');
        }
      }
      if (stopped) { releaseStream(); return false; }
      ctx ??= new AudioContext();
      if (ctx.state === "suspended") await ctx.resume();
      if (!analyser) {
        analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;
        freq = new Uint8Array(analyser.frequencyBinCount);
        wave = new Uint8Array(analyser.fftSize);
        bandRanges = makeBandRanges(ctx.sampleRate, analyser.frequencyBinCount);
      }
      srcNode = ctx.createMediaStreamSource(stream); // analyser only: never connected to ctx.destination
      srcNode.connect(analyser);
      stream.getAudioTracks()[0].addEventListener("ended", () => { if (source === next) { setSource("off"); log("viz: audio sharing ended."); } });
      source = next;
      syncSrc(next);
      setHint("");
      log(`viz: listening to ${next === "mic" ? "the microphone" : "shared audio"}.`, "ok");
      return true;
    } catch (err) {
      const msg = err?.name === "NotAllowedError" ? "permission denied" : err?.message || String(err);
      log(`viz: ${msg}`, "err");
      setHint("pick a source: mic or sys");
      return false;
    }
  }
  function releaseStream() {
    srcNode?.disconnect(); srcNode = null;
    stream?.getTracks().forEach((t) => t.stop()); stream = null;
  }
  // 64 log-spaced bands from 30 Hz to 16 kHz, each at least one FFT bin wide
  function makeBandRanges(rate, bins) {
    const hz = rate / 2 / bins, out = [];
    const lo = Math.log(30), hi = Math.log(16000);
    let prev = Math.max(1, Math.round(30 / hz));
    for (let i = 0; i < BANDS; i++) {
      const end = Math.max(prev + 1, Math.min(bins, Math.round(Math.exp(lo + ((hi - lo) * (i + 1)) / BANDS) / hz)));
      out.push([prev, end]);
      prev = end;
    }
    return out;
  }
  function readAudio(t) {
    if (source !== "off" && analyser) {
      analyser.getByteFrequencyData(freq);
      analyser.getByteTimeDomainData(wave);
      for (let i = 0; i < BANDS; i++) {
        const [a, b] = bandRanges[i];
        let m = 0;
        for (let j = a; j < b && j < freq.length; j++) if (freq[j] > m) m = freq[j];
        const v = Math.min(1, Math.pow(m / 255, 1.6) * (1 + (i / BANDS) * 0.8)); // tilt: lift the quieter highs
        bands[i] += (v - bands[i]) * (v > bands[i] ? 0.6 : 0.18);              // fast attack, slow release
      }
      let sum = 0;
      const step = 2; // ~10 ms window: smooth enough to read as a shape
      for (let i = 0; i < waveF.length; i++) { const s = (wave[Math.floor(i * step)] - 128) / 128; waveF[i] = s; sum += s * s; }
      level += (Math.sqrt(sum / waveF.length) * 1.8 - level) * 0.3;
    } else {
      // idle: a slow breathing pattern so the scene isn't dead before a source is picked
      for (let i = 0; i < BANDS; i++) bands[i] = 0.12 + 0.1 * Math.sin(t * 1.1 + i * 0.35) * Math.sin(t * 0.4 + i * 0.07);
      for (let i = 0; i < waveF.length; i++) waveF[i] = 0.08 * Math.sin((i / waveF.length) * Math.PI * 6 + t * 2);
      level += (0.1 - level) * 0.05;
    }
    level = Math.min(1, level);
    let b = 0;
    for (let i = 0; i < 6; i++) b += bands[i];
    bass = b / 6;
  }

  // ---------- scenes ----------
  function makeBars() {
    const N = 32, C = (N - 1) / 2, RMAX = C * Math.SQRT2;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    const geo = new THREE.BoxGeometry(0.78, 1, 0.78).translate(0, 0.5, 0);
    // baked face shading (unlit, so no lights): bright tops, two tones of side
    const nrm = geo.attributes.normal, shade = new Float32Array(nrm.count * 3);
    for (let i = 0; i < nrm.count; i++) {
      const k = nrm.getY(i) > 0.5 ? 1 : Math.abs(nrm.getX(i)) > 0.5 ? 0.42 : 0.62;
      shade.set([k, k, k], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(shade, 3));
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
    const mesh = new THREE.InstancedMesh(geo, mat, N * N);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const cell = [], heights = new Float32Array(N * N);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const r = Math.hypot(x - C, z - C) / RMAX;
      cell.push({ x: x - C, z: z - C, band: Math.min(BANDS - 1, Math.floor(r * BANDS * 0.9)) });
    }
    const dummy = new THREE.Object3D(), col = new THREE.Color();
    mesh.setColorAt(0, col); // allocates instanceColor
    scene.add(mesh);
    let angle = 0.6;
    return {
      scene, camera,
      update(dt) {
        for (let i = 0; i < cell.length; i++) {
          const c = cell[i], v = bands[c.band];
          heights[i] += (0.08 + v * 5.5 - heights[i]) * 0.35;
          dummy.position.set(c.x, 0, c.z);
          dummy.scale.set(1, heights[i], 1);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          mesh.setColorAt(i, col.copy(bg).lerp(fg, 0.18 + 0.82 * Math.min(1, v * 1.2)));
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
        if (!reduce) angle += dt * 0.12;
        camera.position.set(Math.sin(angle) * 34, 22 + bass * 4, Math.cos(angle) * 34);
        camera.lookAt(0, 1.5, 0);
      },
      dispose() { geo.dispose(); mat.dispose(); mesh.dispose(); },
    };
  }

  function makeSphere() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 7);
    const data = new Uint8Array(BANDS);
    const tex = new THREE.DataTexture(data, BANDS, 1, THREE.RedFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    const uniforms = {
      uBands: { value: tex }, uTime: { value: 0 }, uLevel: { value: 0 },
      uColor: { value: fg }, uBg: { value: bg },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms, wireframe: true, transparent: false,
      vertexShader: /* glsl */`
        uniform sampler2D uBands; uniform float uTime; uniform float uLevel;
        varying float vAmp;
        void main() {
          vec3 n = normalize(position);
          float swirl = 0.5 + 0.5 * sin(n.x * 5.0 + uTime * 1.3) * sin(n.z * 5.0 - uTime * 0.9);
          float t = clamp(mix(abs(n.y), swirl, 0.4), 0.0, 1.0);
          float b = texture2D(uBands, vec2(t * 0.98 + 0.01, 0.5)).r;
          vAmp = b;
          vec3 p = n * (1.55 + b * 1.1 + uLevel * 0.35);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform vec3 uBg; varying float vAmp;
        void main() { gl_FragColor = vec4(mix(uBg, uColor, 0.3 + 0.7 * clamp(vAmp * 1.4, 0.0, 1.0)), 1.0); }`,
    });
    const geo = new THREE.IcosahedronGeometry(1, 14);
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    return {
      scene, camera,
      update(dt, t) {
        for (let i = 0; i < BANDS; i++) data[i] = Math.round(bands[i] * 255);
        tex.needsUpdate = true;
        uniforms.uTime.value = t;
        uniforms.uLevel.value = level;
        if (!reduce) { mesh.rotation.y += dt * (0.15 + bass * 0.8); mesh.rotation.x += dt * 0.05; }
      },
      dispose() { geo.dispose(); mat.dispose(); tex.dispose(); },
    };
  }

  function makeTunnel() {
    const RINGS = 64, SEG = 128, GAP = 0.7, DEPTH = RINGS * GAP;
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, 1, DEPTH * 0.9);
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
    camera.position.set(0, 0, 3);
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, fog: true });
    const rings = [];
    const shape = (geo, twist) => {
      const pos = geo.attributes.position;
      for (let i = 0; i < SEG; i++) {
        const a = (i / SEG) * Math.PI * 2 + twist;
        const s = waveF[Math.floor((i / SEG) * waveF.length)];
        const r = 1.9 + Math.tanh(s * 2.5) * 0.7; // soft-clip so loud input bends, not shatters
        pos.setXYZ(i, Math.cos(a) * r, Math.sin(a) * r, 0);
      }
      pos.needsUpdate = true;
    };
    for (let k = 0; k < RINGS; k++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SEG * 3), 3).setUsage(THREE.DynamicDrawUsage));
      shape(geo, 0);
      const line = new THREE.LineLoop(geo, mat);
      line.position.z = -k * GAP;
      scene.add(line);
      rings.push(line);
    }
    let twist = 0;
    return {
      scene, camera,
      update(dt, t) {
        mat.color.copy(fg);
        scene.fog.color.copy(bg);
        const speed = (reduce ? 1.5 : 3) + bass * 16;
        twist += dt * (reduce ? 0 : 0.35);
        for (const r of rings) {
          r.position.z += speed * dt;
          if (r.position.z > camera.position.z) { r.position.z -= DEPTH; shape(r.geometry, twist); }
        }
        if (!reduce) { camera.position.x = Math.sin(t * 0.4) * 0.3; camera.position.y = Math.cos(t * 0.3) * 0.3; }
        camera.lookAt(0, 0, -DEPTH);
      },
      dispose() { rings.forEach((r) => r.geometry.dispose()); mat.dispose(); },
    };
  }

  const MAKERS = { bars: makeBars, sphere: makeSphere, tunnel: makeTunnel };
  function setMode(next) {
    if (!MODES.includes(next)) return false;
    mode = next;
    store.set("viz.mode", next);
    syncMode(next);
    resize();
    return true;
  }
  function current() {
    if (!THREE) return null;
    return (scenes[mode] ??= MAKERS[mode]());
  }
  function setColors() {
    accent.lime = cssVar("--lime") || accent.lime;
    accent.bg = cssVar("--win") || cssVar("--bg") || accent.bg;
    if (!THREE) return;
    (fg ??= new THREE.Color()).set(accent.lime);
    (bg ??= new THREE.Color()).set(accent.bg);
    renderer?.setClearColor(bg);
  }

  // ---------- loop ----------
  function resize() {
    if (!renderer) return;
    const w = Math.max(1, board.clientWidth), hh = Math.max(1, board.clientHeight);
    renderer.setSize(w, hh, false);
    const s = current();
    if (s) { s.camera.aspect = w / hh; s.camera.updateProjectionMatrix(); }
  }
  let last = performance.now(), metaAt = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (canvas.offsetParent === null) { last = now; return; } // window hidden or another mode is up
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    readAudio(t);
    const s = current();
    s.update(dt, t);
    renderer.render(s.scene, s.camera);
    if (now - metaAt > 250) {
      metaAt = now;
      setMeta(`${source} · ${mode} · ${String(Math.round(level * 100)).padStart(3)}%`);
    }
  }

  (async () => {
    try {
      THREE = await import("./vendor/three.module.min.js");
      if (stopped) return;
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      setColors();
      ro = new ResizeObserver(resize);
      ro.observe(board);
      resize();
      setHint("pick a source: mic or sys");
      raf = requestAnimationFrame(frame);
    } catch (err) {
      setHint("webgl isn't available here.");
      log(`viz: ${err?.message || err}`, "err");
    }
  })();

  return {
    setSource, setMode, setColors,
    get mode() { return mode; }, get source() { return source; },
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      releaseStream();
      analyser?.disconnect();
      ctx?.close().catch(() => {});
      ctx = analyser = null;
      for (const k of Object.keys(scenes)) { scenes[k].dispose(); delete scenes[k]; }
      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer = null;
      root.replaceChildren();
      setMeta("");
    },
  };
}

export const VIZ_MODES = MODES;
export const VIZ_SOURCES = SOURCES;
