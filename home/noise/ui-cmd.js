// noise / radio / sleep commands for the hzOS command bar: parse with cmd.js,
// act through the controller ui.js passes in, return [text, cls] lines for os.js.
import { CATEGORIES, LAYERS, byGroup, layerOf } from "./catalog.js";
import { STATIONS, VIBES, stationById } from "./stations.js";
import { parseNoise, parseRadio, parseSleep } from "./cmd.js";

const pct = (v) => String(Math.round(v * 100));
const mmss = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

const USAGE = {
  noise: "usage: noise [sound [0-100]|preset] · noise off <sound> · noise vol <0-100> · noise save <name> · noise list",
  radio: "usage: radio [station|off] · radio lists the stations",
  sleep: "usage: sleep <1-600>m|<n>h|off",
};
const fail = (cmd, message) => (message.startsWith("usage:") ? [[`${cmd}: ${message}`, "err"]] : [[`${cmd}: ${message}`, "err"], [USAGE[cmd], "err"]]);
const LAYER_IDS = LAYERS.map((l) => l.id);
const STATION_IDS = STATIONS.map((s) => s.id);

// C: { engine, layers, radio, toggle, stopMode, isLive, hasSelection, nowLine,
//      presets(), activePreset(), presetTitle(p), applyPreset(id), save(name),
//      layerOn(id, vol), layerOff(id), radioOff(), radioPlay(id), setSleep(m) }
export function createCommands(C) {
  const known = () => ({ layers: LAYER_IDS, stations: STATION_IDS, presets: C.presets().map((p) => p.id) });

  function run(cmd, argStr = "") {
    const words = String(argStr).trim().split(/\s+/).filter(Boolean);
    const args = words[0]?.toLowerCase() === "save" ? ["save", ...words.slice(1)] : words.map((w) => w.toLowerCase());
    if (cmd === "noise") return runNoise(args);
    if (cmd === "radio") return runRadio(args);
    if (cmd === "sleep") return runSleep(args);
    return [[`${cmd}: unknown`, "err"]];
  }

  function runNoise(args) {
    const r = parseNoise(args, known());
    const act = C.layers.active();
    switch (r.type) {
      case "error": return fail("noise", r.message);
      case "toggle": {
        if (!C.hasSelection()) return [["noise: nothing selected · try noise light-rain or noise deep-work", "err"]];
        const was = C.stopMode();
        C.toggle();
        return was ? [["noise: stopped"]] : [[`noise: ▶ ${C.nowLine()}`, "ok"]];
      }
      case "list": {
        const e = C.engine, sel = C.activePreset();
        const st = e.state === "playing" ? "▶" : e.state === "idle" ? "■" : e.state;
        const w = Math.max(...CATEGORIES.map((c) => c.id.length)) + 2;
        return [
          [`now${" ".repeat(w - 3)}${st} ${C.nowLine()} · vol ${pct(e.vol)}${e.sleepLeft() ? ` · sleep ${mmss(e.sleepLeft())}` : ""}`, "ok"],
          ...CATEGORIES.map((c) => [`${c.id.padEnd(w)}${byGroup(c.id).map((l) => (l.id in act ? `[${l.id} ${pct(act[l.id])}]` : l.id)).join(" ")}`]),
          [`${"presets".padEnd(w)}${C.presets().map((p) => (p.id === sel ? `[${p.id}]` : p.id)).join(" ")}`],
          ["noise <sound> [0-100] adds a sound · noise off <sound> · radio lists the stations · sleep 30m fades out and stops", "dim"],
        ];
      }
      case "save": {
        const p = C.save(r.name);
        return p ? [[`noise: saved ${p.name} · play it with: noise ${p.id}`, "ok"]] : fail("noise", "usage: noise save <name>");
      }
      case "layerOff":
        return C.layerOff(r.id) ? [[`noise: ${layerOf(r.id).name} off`, "ok"]] : [[`noise: ${layerOf(r.id).name} is not on`]];
      case "vol":
        C.engine.setVol(r.vol);
        return [[`noise: vol ${pct(r.vol)}`, "ok"]];
      case "layer":
        C.layerOn(r.id, r.vol);
        return [[`noise: + ${layerOf(r.id).name} ${pct(r.vol)}`, "ok"]];
      case "preset": {
        C.applyPreset(r.id);
        const p = C.presets().find((x) => x.id === r.id);
        return [[`noise: ▶ ${p.name} · ${C.presetTitle(p)}`, "ok"]];
      }
    }
    return fail("noise", "usage");
  }

  function runRadio(args) {
    const r = parseRadio(args, known());
    if (r.type === "error") return fail("radio", r.message);
    if (r.type === "off") return C.radioOff() ? [["radio: off", "ok"]] : [["radio: already off"]];
    if (r.type === "play") {
      const st = stationById(r.id);
      C.radioPlay(r.id);
      return [[`radio: tuning in ${st.name} · ${st.vibe}`, "ok"]];
    }
    const w = Math.max(...STATIONS.map((s) => s.id.length));
    return [
      ...VIBES.flatMap((vibe) => STATIONS.filter((s) => s.vibe === vibe).map((s) => {
        const cur = C.radio.current?.id === s.id;
        return [`${cur ? "▶" : " "} ${s.id.padEnd(w)}  ${s.name} · ${s.vibe}`, cur ? "ok" : ""];
      })),
      ["radio <station> tunes in · radio off", "dim"],
    ];
  }

  function runSleep(args) {
    const r = parseSleep(args);
    if (r.type === "error") return fail("sleep", r.message);
    if (r.type === "off") { C.setSleep(0); return [["sleep: off", "ok"]]; }
    C.setSleep(r.minutes);
    const hrs = Math.floor(r.minutes / 60), m = r.minutes % 60;
    const len = hrs ? `${hrs}h${m ? ` ${m}m` : ""}` : `${m}m`;
    return [[`sleep: fades out over the last minute and stops in ${len}${C.isLive() ? "" : " (nothing is playing yet)"}`, "ok"]];
  }

  // tab completion pools for os.js
  function completions(cmd, prev) {
    if (cmd === "radio") return ["off", ...STATION_IDS];
    if (cmd === "sleep") return ["15m", "30m", "1h", "90m", "off"];
    const on = Object.keys(C.layers.active());
    if (cmd === "noise" && prev === "off") return on.length ? on : LAYER_IDS;
    if (cmd === "noise") return ["list", "save", "off", "vol", ...C.presets().map((p) => p.id), ...LAYER_IDS];
    return [];
  }

  return { run, completions };
}
