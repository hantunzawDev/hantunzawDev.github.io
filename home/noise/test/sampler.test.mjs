// Sample player runtime, driven by a fake AudioContext and a fake clock.
// No Web Audio in node: the fake records connections, source starts/stops and
// AudioParam events, and `advance(ms)` moves ctx.currentTime and the timers
// together, so scheduling can be checked deterministically.
import test from "node:test";
import assert from "node:assert/strict";
import { createSampler, defaultCacheCap } from "../sampler.js";
import { loopPlan } from "../looper.js";

// ---------------------------------------------------------------- fakes

function fakeParam(v = 0) {
  const p = {
    value: v, events: [],
    setValueAtTime(x, t) { p.events.push(["set", x, t]); p.value = x; return p; },
    linearRampToValueAtTime(x, t) { p.events.push(["lin", x, t]); p.value = x; return p; },
    setTargetAtTime(x, t, tc) { p.events.push(["target", x, t, tc]); p.value = x; return p; },
    setValueCurveAtTime(c, t, d) { p.events.push(["curve", c[c.length - 1], t, d]); p.value = c[c.length - 1]; return p; },
    cancelScheduledValues(t) { p.events.push(["cancel", t]); return p; },
  };
  return p;
}

function fakeCtx() {
  const ctx = { currentTime: 0, sampleRate: 48000, sources: [], gains: [], analysers: [] };
  const node = (extra = {}) => {
    const n = {
      outs: new Set(), ins: new Set(),
      connect(to) { n.outs.add(to); to.ins?.add(n); return to; },
      disconnect() { for (const o of n.outs) o.ins?.delete(n); n.outs.clear(); },
      ...extra,
    };
    return n;
  };
  ctx.node = node;
  ctx.createGain = () => { const g = node({ gain: fakeParam(1) }); ctx.gains.push(g); return g; };
  ctx.createAnalyser = () => {
    const a = node({ fftSize: 2048, getFloatTimeDomainData(buf) { buf.fill(0.1); } });
    ctx.analysers.push(a); return a;
  };
  ctx.createBufferSource = () => {
    const s = node({
      buffer: null, loop: false, onended: null, startAt: null, offset: 0, stopAt: Infinity,
      start(t = 0, off = 0) { if (s.startAt !== null) throw new Error("start twice"); s.startAt = Math.max(t, ctx.currentTime); s.offset = off; },
      stop(t = 0) { s.stopAt = Math.max(t, ctx.currentTime); },
    });
    ctx.sources.push(s); return s;
  };
  ctx.decodeAudioData = async (ab) => ({ duration: ab.dur, length: Math.round(ab.dur * 48000), numberOfChannels: 2, sampleRate: 48000 });
  // sources still sounding at the current time
  ctx.playing = () => ctx.sources.filter((s) => s.startAt !== null && s.stopAt > ctx.currentTime);
  return ctx;
}

function fakeClock(ctx) {
  let ms = 0, seq = 0;
  const timers = new Map();
  const add = (fn, d, every) => { const id = ++seq; timers.set(id, { fn, at: ms + Math.max(0, d), every }); return id; };
  const clk = {
    setTimeout: (fn, d) => add(fn, d, 0),
    setInterval: (fn, d) => add(fn, d, Math.max(1, d)),
    clearTimeout: (id) => timers.delete(id),
    clearInterval: (id) => timers.delete(id),
    now: () => ms,
    // move wall clock and audio clock together, firing due timers in order
    advance(d) {
      const end = ms + d;
      for (;;) {
        let next = null;
        for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
        if (!next) break;
        const [id, t] = next;
        ms = t.at; ctx.currentTime = ms / 1000;
        for (const s of ctx.sources) if (s.onended && s.stopAt <= ctx.currentTime) { const f = s.onended; s.onended = null; f(); }
        if (t.every) t.at += t.every; else timers.delete(id);
        t.fn();
      }
      ms = end; ctx.currentTime = ms / 1000;
      for (const s of ctx.sources) if (s.onended && s.stopAt <= ctx.currentTime) { const f = s.onended; s.onended = null; f(); }
    },
    pending: () => timers.size,
  };
  return clk;
}

const flush = () => new Promise((r) => setImmediate(r));

const ROWS = {
  x: { id: "x", kind: "sample", src: "rec/x.mp3", trim: 0.5 },
  y: { id: "y", kind: "sample", src: "rec/y.mp3", trim: 1 },
  short: { id: "short", kind: "sample", src: "rec/short.mp3", trim: 1 },
  tone: { id: "tone", kind: "tone", trim: 1 },
};
for (const id of "abcde") ROWS[id] = { id, kind: "sample", src: `rec/${id}.mp3`, trim: 1 };

function rig({ durs = { x: 30, y: 30, short: 1.2, a: 30, b: 30, c: 30, d: 30, e: 30 }, missing = new Set(), hold = false, cacheCap } = {}) {
  const ctx = fakeCtx(), clock = fakeClock(ctx), mix = ctx.node();
  const fetches = [];
  let release = null;
  const gate = hold ? new Promise((r) => { release = r; }) : null;
  const fetchStub = async (url) => {
    const u = String(url);
    fetches.push(u);
    const id = u.split("/").pop().replace(".mp3", "");
    if (gate && (hold === true || hold.has(id))) await gate;
    if (missing.has(id)) return { ok: false, status: 404, arrayBuffer: async () => { throw new Error("no body"); } };
    return { ok: true, status: 200, arrayBuffer: async () => ({ dur: durs[id] }) };
  };
  const toneBuilder = (h) => { h.osc("sine", 200, h.gain(0.2, h.dest)); return { mod: () => 1 }; };
  ctx.createOscillator = () => {
    const o = ctx.node({ type: "sine", frequency: fakeParam(440), start() { o.started = true; }, stop() { o.stopped = true; } });
    return o;
  };
  ctx.createBiquadFilter = () => ctx.node({ type: "", frequency: fakeParam(), Q: fakeParam() });
  let active = true;
  const s = createSampler({
    catalog: (id) => ROWS[id],
    builders: { tone: toneBuilder },
    fetch: fetchStub,
    base: "https://example.test/home/noise/layers.js",
    isActive: () => active,
    timers: clock,
    now: clock.now,
    random: () => 0,
    ...(cacheCap ? { cacheCap } : {}),
  });
  s.source.init(ctx, mix);
  s.source.start();
  return { s, L: s.api, ctx, clock, mix, fetches, release: () => release(), setActive: (v) => { active = v; } };
}

// gain nodes the sampler has connected to its bus (one per instance)
const busInputs = (s) => s._bus.ins.size;

// ---------------------------------------------------------------- tests

test("rapid set/off/set/off/set leaves one instance, no duplicate nodes", async () => {
  const { L, s, ctx, clock, fetches } = rig();
  L.set("x", 0.5); clock.advance(20);
  L.off("x"); clock.advance(20);
  L.set("x", 0.5); clock.advance(20);
  L.off("x"); clock.advance(20);
  L.set("x", 0.5);
  await flush(); await flush();
  clock.advance(3000); await flush();
  assert.deepEqual(L.liveCount(), { x: 1 });
  assert.equal(busInputs(s), 1, "exactly one instance gain on the bus");
  assert.equal(fetches.length, 1, "one fetch for the same sound");
  assert.ok(ctx.playing().length <= 2, `at most a crossfading pair sounds (${ctx.playing().length})`);
  assert.equal(L.status("x"), "playing");
  L.off("x");
  clock.advance(1000); await flush();
  assert.deepEqual(L.liveCount(), {});
  assert.equal(busInputs(s), 0, "fully disposed after the fade");
  assert.equal(ctx.playing().length, 0);
  assert.equal(L.status("x"), "idle");
});

test("toggling while the load is still pending never stacks instances", async () => {
  const r = rig({ hold: true });
  const { L, s, ctx, clock } = r;
  for (let i = 0; i < 4; i++) { L.set("x", 0.5); clock.advance(10); L.off("x"); clock.advance(10); }
  L.set("x", 0.5);
  assert.equal(L.status("x"), "loading");
  r.release(); await flush(); await flush(); await flush();
  clock.advance(3000); await flush();
  assert.deepEqual(L.liveCount(), { x: 1 });
  assert.equal(busInputs(s), 1);
  assert.equal(r.fetches.length, 1);
  assert.ok(ctx.playing().length <= 2);
});

test("a load that lands after the sound was switched off starts nothing", async () => {
  const r = rig({ hold: true });
  const { L, s, ctx, clock } = r;
  L.set("x", 0.5); L.off("x");
  clock.advance(1000); // disposed before the fetch returns
  r.release(); await flush(); await flush(); await flush();
  clock.advance(1000);
  assert.equal(ctx.sources.length, 0, "no orphan sources");
  assert.equal(busInputs(s), 0);
  assert.equal(L.status("x"), "idle");
});

test("a 404 fails only that sound; has() ignores failed layers; toggling retries", async () => {
  const missing = new Set(["y"]);
  const { L, s, clock, fetches } = rig({ missing });
  L.set("x", 0.5); L.set("y", 0.5);
  assert.equal(L.status("y"), "loading");
  await flush(); await flush(); await flush();
  clock.advance(500);
  assert.equal(L.status("y"), "failed");
  assert.equal(L.status("x"), "playing");
  assert.ok("y" in L.active(), "a failed sound stays selected");
  assert.equal(s.source.has(), true, "x can still sound");
  L.off("x");
  assert.equal(s.source.has(), false, "only a failed layer left: nothing can sound");
  L.set("y", 0.7); await flush(); // volume change on a still-selected failed sound: no refetch storm
  assert.equal(L.status("y"), "failed");
  assert.equal(fetches.filter((u) => u.endsWith("y.mp3")).length, 1);
  L.off("y");
  assert.equal(L.status("y"), "idle", "turning it off clears the failure");
  missing.delete("y");
  L.set("y", 0.5);
  assert.equal(L.status("y"), "loading");
  await flush(); await flush(); await flush();
  assert.equal(L.status("y"), "playing", "a later set retries the fetch");
  assert.equal(fetches.filter((u) => u.endsWith("y.mp3")).length, 2);
});

test("1.2 s buffer: fade <= 0.4, second copy starts one period after the first", async () => {
  const { L, ctx, clock } = rig();
  L.set("short", 0.5);
  await flush(); await flush(); await flush();
  clock.advance(400);
  const { fade, period } = loopPlan(1.2);
  assert.ok(fade <= 0.4 + 1e-9);
  const starts = ctx.sources.map((s) => s.startAt).sort((a, b) => a - b);
  assert.ok(starts.length >= 2, `scheduled ahead: ${starts.length}`);
  assert.ok(Math.abs(starts[1] - starts[0] - period) < 1e-6, `second at +${starts[1] - starts[0]}`);
  // each copy ends exactly `fade` after its successor starts (overlap crossfade)
  const first = ctx.sources.find((s) => s.startAt === starts[0]);
  assert.ok(Math.abs(first.stopAt - (starts[1] + fade)) < 1e-6);
  // keep running for a while: copies stay one period apart and nothing piles up
  clock.advance(20000); await flush();
  const all = ctx.sources.map((s) => s.startAt).sort((a, b) => a - b);
  for (let i = 1; i < all.length; i++) assert.ok(Math.abs(all[i] - all[i - 1] - period) < 1e-6, `gap ${i}`);
  // sounding + queued copies are bounded by (duration + horizon + one tick) / period
  assert.ok(ctx.playing().length <= Math.ceil((1.2 + 1.5 + 0.2) / period) + 1, `queued ${ctx.playing().length}`);
});

test("short buffers never crossfade longer than a third of their length", async () => {
  for (const d of [0.6, 1, 2, 2.9]) {
    const { L, ctx, clock } = rig({ durs: { short: d } });
    L.set("short", 0.5);
    await flush(); await flush(); await flush();
    clock.advance(6000);
    const st = ctx.sources.map((s) => s).sort((a, b) => a.startAt - b.startAt);
    for (let i = 1; i < st.length; i++) {
      const overlap = st[i - 1].stopAt - st[i].startAt;
      assert.ok(overlap <= d / 3 + 1e-6, `d=${d} overlap ${overlap}`);
    }
  }
});

test("instance gain is vol * trim, ramped with setTargetAtTime", async () => {
  const { L, s, clock } = rig();
  L.set("x", 0.8);
  await flush(); await flush(); await flush();
  clock.advance(100);
  const g = [...s._bus.ins][0];
  const tgt = g.gain.events.filter((e) => e[0] === "target").pop();
  assert.ok(Math.abs(tgt[1] - 0.4) < 1e-9, `target ${tgt[1]}`);
  L.set("x", 0.2);
  const t2 = g.gain.events.filter((e) => e[0] === "target").pop();
  assert.ok(Math.abs(t2[1] - 0.1) < 1e-9);
  assert.equal(t2[3], 0.08);
  // the start never steps: the first event on the instance gain is a glide from 0
  assert.equal(g.gain.events[0][0], "target");
});

test("level: 0 for non-live ids, positive for a live one", async () => {
  const { L, clock } = rig();
  assert.equal(L.level("nope"), 0);
  assert.equal(L.level("x"), 0);
  L.set("x", 0.5);
  await flush(); await flush(); await flush();
  clock.advance(300); L.level("x"); clock.advance(300);
  assert.ok(L.level("x") > 0);
  L.off("x");
  assert.equal(L.level("x"), 0);
});

test("selection survives engine stop/start; nothing live while inactive", async () => {
  const r = rig();
  const { L, s, clock } = r;
  L.set("x", 0.5); L.set("tone", 0.3);
  await flush(); await flush(); await flush();
  assert.deepEqual(L.liveCount(), { x: 1, tone: 1 });
  assert.equal(L.status("tone"), "playing");
  r.setActive(false); s.source.stop();
  clock.advance(1000);
  assert.deepEqual(L.liveCount(), {});
  assert.equal(busInputs(s), 0);
  assert.deepEqual(L.active(), { x: 0.5, tone: 0.3 });
  r.setActive(true); s.source.start();
  await flush(); await flush();
  assert.deepEqual(L.liveCount(), { x: 1, tone: 1 });
  assert.equal(r.fetches.length, 1, "decoded buffer is cached per context");
});

// ---------------------------------------------------------------- memory

// a 30 s stereo fake buffer decodes to 30 * 48000 * 2 * 4 = 11.52 MB
const BUF30 = 30 * 48000 * 2 * 4;
const settle = async (clock, ms = 1000) => { for (let i = 0; i < 4; i++) await flush(); clock.advance(ms); await flush(); };
const names = (s) => s._cached().map((u) => u.split("/").pop().replace(".mp3", ""));

test("default cache cap: 48 MB, 24 MB on low-memory or touch devices, safe in node", () => {
  const cap = defaultCacheCap();
  assert.ok(cap === 48 * 2 ** 20 || cap === 24 * 2 ** 20, String(cap));
  const nav = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const mm = globalThis.matchMedia;
  try {
    Object.defineProperty(globalThis, "navigator", { value: { deviceMemory: 4 }, configurable: true });
    assert.equal(defaultCacheCap(), 24 * 2 ** 20);
    Object.defineProperty(globalThis, "navigator", { value: { deviceMemory: 8 }, configurable: true });
    globalThis.matchMedia = () => ({ matches: true });
    assert.equal(defaultCacheCap(), 24 * 2 ** 20);
    globalThis.matchMedia = () => ({ matches: false });
    assert.equal(defaultCacheCap(), 48 * 2 ** 20);
    globalThis.matchMedia = () => { throw new Error("boom"); };
    assert.equal(defaultCacheCap(), 48 * 2 ** 20);
  } finally {
    if (nav) Object.defineProperty(globalThis, "navigator", nav); else delete globalThis.navigator;
    if (mm) globalThis.matchMedia = mm; else delete globalThis.matchMedia;
  }
});

test("eviction drops unselected buffers oldest-first, never wanted ones", async () => {
  const { L, s, clock, fetches } = rig({ cacheCap: 2.5 * BUF30 });
  L.set("a", 0.5); L.set("b", 0.5); L.set("c", 0.5);
  await settle(clock);
  assert.deepEqual(names(s), ["a", "b", "c"], "selected buffers may exceed the cap");
  L.off("a"); L.off("b");
  await settle(clock);
  assert.deepEqual(names(s), ["b", "c"], "a (oldest unselected) went first; back under the cap");
  L.set("d", 0.5);
  await settle(clock);
  assert.deepEqual(names(s), ["c", "d"], "loading d pushed b out; wanted c and d stay");
  L.set("a", 0.5);
  await settle(clock);
  assert.equal(fetches.filter((u) => u.endsWith("/a.mp3")).length, 2, "an evicted sound refetches");
  assert.equal(L.status("a"), "playing");
  assert.deepEqual(names(s), ["c", "d", "a"], "all three wanted: none evicted");
});

test("eviction recency: re-requesting a buffer makes it the newest", async () => {
  const { L, s, clock } = rig({ cacheCap: 2.5 * BUF30 });
  L.set("a", 0.5); L.set("b", 0.5);
  await settle(clock);
  L.off("a"); L.off("b"); await settle(clock);
  L.set("a", 0.5); await settle(clock); L.off("a"); await settle(clock); // a used again after b
  L.set("c", 0.5); await settle(clock);
  assert.deepEqual(names(s), ["a", "c"], "b, the least recently requested, was dropped");
});

test("eviction never drops a fading or a still-loading sound", async () => {
  const r = rig({ cacheCap: 1.5 * BUF30, hold: new Set(["c"]) });
  const { L, s, clock } = r;
  L.set("a", 0.5); L.set("b", 0.5);
  await settle(clock);
  L.set("c", 0.5);                 // c's fetch is held: loading
  await flush();
  assert.equal(L.status("c"), "loading");
  L.off("a"); clock.advance(100);  // a is fading (disposal at 500 ms)
  L.set("d", 0.5);
  for (let i = 0; i < 4; i++) await flush(); // d decodes while a is still fading: over the cap
  assert.ok(names(s).includes("a"), "fading a kept");
  assert.ok(names(s).includes("b") && names(s).includes("d"), "wanted kept");
  clock.advance(1000); await flush(); // a disposed: now evictable
  assert.ok(!names(s).includes("a"), "a evicted once it stopped");
  r.release(); await settle(clock);
  assert.equal(L.status("c"), "playing", "the held load completed and was not dropped");
  assert.ok(names(s).includes("c"));
});

test("a live instance keeps looping after its buffer leaves the cache", async () => {
  const { L, s, ctx, clock, fetches } = rig({ durs: { short: 1.2 } });
  L.set("short", 0.5);
  await settle(clock, 400);
  const before = ctx.sources.length;
  s._dropCache();
  assert.deepEqual(s._cached(), []);
  clock.advance(5000); await flush();
  assert.equal(L.status("short"), "playing");
  assert.ok(ctx.sources.length > before + 4, "copies keep being scheduled from the instance's own buffer");
  assert.ok(ctx.sources.every((x) => x.buffer && x.buffer.duration === 1.2));
  assert.equal(fetches.length, 1, "no refetch while it plays");
});

test("an in-flight load is never evicted, even when nobody wants it any more", async () => {
  const r = rig({ cacheCap: 1.5 * BUF30, hold: new Set(["c"]) });
  const { L, s, clock, fetches } = r;
  L.set("c", 0.5); await flush();          // held: loading
  L.off("c"); clock.advance(1000);          // disposed while the fetch is still in flight
  L.set("a", 0.5); L.set("b", 0.5);
  await settle(clock);                      // over the cap: eviction runs with c pending
  L.set("c", 0.5);                          // re-select: must join the same in-flight load
  r.release(); await settle(clock);
  assert.equal(fetches.filter((u) => u.endsWith("/c.mp3")).length, 1, "deduped onto the pending load");
  assert.equal(L.status("c"), "playing");
});
