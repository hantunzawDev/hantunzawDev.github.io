// Shared audio input for viz.app and the stage backdrop. One stream, one
// AudioContext, one analyser, so the mic prompt shows once no matter how many
// things are listening. The analyser is never routed to the speakers.
//
// Consumers call retain() while they want audio and release() when done; the
// stream stops when nobody holds it. read(t) refreshes the shared bands /
// waveform / level / bass and is cheap to call twice in one frame.

export const SOURCES = ["mic", "sys", "noise", "off"];
export const BANDS = 64;

export const bands = new Float32Array(BANDS); // 0..1, smoothed per band
export const waveF = new Float32Array(256);   // -1..1, downsampled waveform

let ctx = null, analyser = null, srcNode = null, stream = null;
let tapNode = null, tapCtx = null; // noise.app's master tap (attachNode)
let freq = null, wave = null, bandRanges = [];
let holders = 0, lastT = -1, avgBass = 0, lastBeat = 0;
const listeners = new Set();

export const audio = {
  source: "off",
  level: 0,
  bass: 0,
  high: 0, // mean of the top ~40% of bands
  beat: 0, // 1 on a detected kick, decays toward 0
  retain() { holders++; },
  release() {
    holders = Math.max(0, holders - 1);
    if (!holders) { stopStream(); setState("off"); }
  },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  setSource,
  attachNode,
  read,
};

function setState(src) {
  if (audio.source === src) return;
  audio.source = src;
  for (const fn of listeners) fn(src);
}

// noise.app hands over its master tap and AudioContext. The analyser has to live
// on that context to hear it, so a previous (mic-only) context is retired.
function attachNode(node, c) {
  if (tapNode === node && tapCtx === c) return;
  const wasNoise = audio.source === "noise";
  if (wasNoise) stopStream();
  tapNode = node; tapCtx = c;
  if (wasNoise) { // rebuild on the new context, or fall back if it vanished
    ensureAnalyser(c);
    if (node) { srcNode = node; node.connect(analyser); } else setState("off");
  }
}

function ensureAnalyser(c) {
  if (ctx && ctx !== c) { // retire the old context: it only ever held a stopped mic node
    srcNode?.disconnect(); srcNode = null;
    analyser?.disconnect(); analyser = null;
    ctx.close?.().catch(() => {});
    ctx = null;
  }
  ctx ??= c ?? new AudioContext();
  if (!analyser) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    freq = new Uint8Array(analyser.frequencyBinCount);
    wave = new Uint8Array(analyser.fftSize);
    bandRanges = makeBandRanges(ctx.sampleRate, analyser.frequencyBinCount);
  }
}

async function setSource(next, log = () => {}) {
  if (!SOURCES.includes(next)) return false;
  stopStream();
  setState("off");
  if (next === "off") return true;
  try {
    if (next === "noise") {
      if (!tapNode) throw new Error("noise.app isn't playing. start it first");
    } else if (next === "mic") {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("this browser has no microphone access");
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } else {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("screen/tab audio capture isn't supported here");
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true, systemAudio: "include" });
      stream.getVideoTracks().forEach((t) => { t.stop(); stream.removeTrack(t); });
      if (!stream.getAudioTracks().length) {
        stopStream();
        throw new Error('no audio was shared. pick a tab or screen and tick "share audio" (chrome/edge only)');
      }
    }
    if (!holders) { stopStream(); return false; } // everyone left while the prompt was up
    if (next === "noise") {
      ensureAnalyser(tapCtx); // the engine's context: no resume here, the engine owns its transport
      srcNode = tapNode;      // analyser only: the tap feeds the analyser, never the speakers
      srcNode.connect(analyser);
      setState("noise");
      log("audio: listening to noise.app.", "ok");
      return true;
    }
    ensureAnalyser(ctx ?? tapCtx);
    if (ctx.state === "suspended") await ctx.resume();
    srcNode = ctx.createMediaStreamSource(stream); // analyser only: never connected to ctx.destination
    srcNode.connect(analyser);
    const track = stream.getAudioTracks()[0];
    track.addEventListener("ended", () => { if (stream?.getAudioTracks()[0] === track) { stopStream(); setState("off"); log("audio: sharing ended."); } });
    setState(next);
    log(`audio: listening to ${next === "mic" ? "the microphone" : "shared audio"}.`, "ok");
    return true;
  } catch (err) {
    const msg = err?.name === "NotAllowedError" ? "permission denied" : err?.message || String(err);
    log(`audio: ${msg}`, "err");
    return false;
  }
}

function stopStream() {
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

function read(t) {
  if (t === lastT) return; // a second consumer in the same frame: already fresh
  const dt = lastT < 0 ? 1 / 60 : Math.min(0.1, Math.max(0, t - lastT));
  lastT = t;
  let level = audio.level;
  if (audio.source !== "off" && analyser) {
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
    // idle: a slow breathing pattern so scenes aren't dead before a source is picked
    for (let i = 0; i < BANDS; i++) bands[i] = 0.12 + 0.1 * Math.sin(t * 1.1 + i * 0.35) * Math.sin(t * 0.4 + i * 0.07);
    for (let i = 0; i < waveF.length; i++) waveF[i] = 0.08 * Math.sin((i / waveF.length) * Math.PI * 6 + t * 2);
    level += (0.1 - level) * 0.05;
  }
  audio.level = Math.min(1, level);
  let b = 0, hi = 0;
  for (let i = 0; i < 6; i++) b += bands[i];
  for (let i = 38; i < BANDS; i++) hi += bands[i];
  audio.bass = b / 6;
  audio.high = hi / (BANDS - 38);
  // kick detector: bass jumping well above its own recent average
  avgBass += (audio.bass - avgBass) * Math.min(1, dt * 1.5);
  if (audio.source !== "off") {
    if (audio.bass > avgBass * 1.25 + 0.04 && t - lastBeat > 0.22) { audio.beat = 1; lastBeat = t; }
  } else if (t - lastBeat > 1.2) { audio.beat = 0.35; lastBeat = t; } // idle: a slow resting pulse
  audio.beat *= Math.exp(-dt * 5);
}
