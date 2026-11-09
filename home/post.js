// Post pass for the audio scenes: scenes draw plain intensity (white on
// black, additive), then this blooms it and maps intensity onto the current
// theme: background → accent → a hot near-white core on dark themes. Colour
// lives only here, so every scene follows the theme and paper mode works.
//
// Bloom is a dual-filter chain: 5 half-res downsamples, then tent upsamples
// added back up the chain. No three.js addons needed.

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export function createPost(THREE, renderer, col) {
  const LEVELS = 5;
  const sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const down = Array.from({ length: LEVELS }, () => new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, depthBuffer: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  }));
  const quadScene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  quadScene.add(quad);
  const pass = (frag, uniforms, extra = {}) => new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: frag, depthTest: false, depthWrite: false, ...extra,
  });

  // 5-tap downsample; the first pass also drops everything under the threshold
  const downMat = pass(/* glsl */`
    uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; varying vec2 vUv;
    void main() {
      vec2 o = uTexel;
      vec3 c = texture2D(tSrc, vUv).rgb * 4.0
        + texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb
        + texture2D(tSrc, vUv + vec2(-o.x,  o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x,  o.y)).rgb;
      c = max(c / 8.0 - uThreshold, 0.0);
      gl_FragColor = vec4(c, 1.0);
    }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0 } });

  // 9-tap tent upsample, added onto the next level up
  const upMat = pass(/* glsl */`
    uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
    vec3 s(float x, float y) { return texture2D(tSrc, vUv + vec2(x, y) * uTexel).rgb; }
    void main() {
      vec3 c = s(-1.0, -1.0) + s(1.0, -1.0) + s(-1.0, 1.0) + s(1.0, 1.0)
        + 2.0 * (s(0.0, -1.0) + s(0.0, 1.0) + s(-1.0, 0.0) + s(1.0, 0.0)) + 4.0 * s(0.0, 0.0);
      gl_FragColor = vec4(c / 16.0, 1.0);
    }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } }, { blending: THREE.AdditiveBlending });

  const hot = new THREE.Color(), white = new THREE.Color(1, 1, 1);
  const compMat = pass(/* glsl */`
    uniform sampler2D tScene; uniform sampler2D tBloom;
    uniform float uStrength; uniform float uHotAmt; uniform float uTime; uniform float uVignette;
    uniform vec3 uFg; uniform vec3 uBg; uniform vec3 uHot;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      float I = texture2D(tScene, vUv).r + texture2D(tBloom, vUv).r * uStrength;
      vec3 c = mix(uBg, uFg, 1.0 - exp(-I * 1.15));       // soft shoulder: lines never clip flat
      c = mix(c, uHot, smoothstep(1.3, 3.2, I) * uHotAmt); // overlaps burn toward white
      vec2 q = vUv - 0.5;
      c = mix(c, uBg, smoothstep(0.2, 0.9, dot(q, q) * 2.0) * uVignette);
      c += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * 0.014; // grain, kills banding
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`, {
    tScene: { value: sceneRT.texture }, tBloom: { value: down[0].texture },
    uStrength: { value: 1 }, uHotAmt: { value: 1 }, uTime: { value: 0 }, uVignette: { value: 0.55 },
    uFg: { value: col.fg }, uBg: { value: col.bg }, uHot: { value: hot },
  });

  const size = new THREE.Vector2(), prevClear = new THREE.Color();
  function setSize() {
    renderer.getDrawingBufferSize(size);
    const w = Math.max(1, size.x), h = Math.max(1, size.y);
    sceneRT.setSize(w, h);
    down.forEach((rt, i) => rt.setSize(Math.max(1, w >> (i + 1)), Math.max(1, h >> (i + 1))));
  }
  function blit(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quadScene, cam); }

  return {
    setSize,
    // vignette: the backdrop already has a CSS vignette, the viz window doesn't
    render(scene, camera, t, { vignette = 0.55 } = {}) {
      const light = col.bg.r * 0.2126 + col.bg.g * 0.7152 + col.bg.b * 0.0722 > 0.35;
      hot.copy(col.fg).lerp(white, 0.6);
      compMat.uniforms.uStrength.value = light ? 0.45 : 1.15;
      compMat.uniforms.uHotAmt.value = light ? 0 : 0.85;
      compMat.uniforms.uTime.value = t;
      compMat.uniforms.uVignette.value = vignette;

      const autoClear = renderer.autoClear, alpha = renderer.getClearAlpha();
      renderer.getClearColor(prevClear);
      renderer.autoClear = false;
      renderer.setClearColor(0x000000, 1);

      renderer.setRenderTarget(sceneRT);
      renderer.clear();
      renderer.render(scene, camera);

      let src = sceneRT;
      for (let i = 0; i < LEVELS; i++) {
        downMat.uniforms.tSrc.value = src.texture;
        downMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        downMat.uniforms.uThreshold.value = i === 0 ? 0.45 : 0;
        blit(downMat, down[i]);
        src = down[i];
      }
      for (let i = LEVELS - 1; i > 0; i--) {
        upMat.uniforms.tSrc.value = down[i].texture;
        upMat.uniforms.uTexel.value.set(1 / down[i].width, 1 / down[i].height);
        blit(upMat, down[i - 1]);
      }
      blit(compMat, null);

      renderer.setClearColor(prevClear, alpha);
      renderer.autoClear = autoClear;
    },
    dispose() {
      sceneRT.dispose(); down.forEach((rt) => rt.dispose());
      [downMat, upMat, compMat].forEach((m) => m.dispose());
      quad.geometry.dispose();
    },
  };
}
