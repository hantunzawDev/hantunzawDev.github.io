// Pure catalogue: no DOM, no Web Audio, no runtime manifest read.
// Sample rows were generated once from rec/manifest.json (id, category, file,
// dur, trim) and then hand-curated (names, icons). `src` is relative to this
// file. `trim` is a loudness-matching gain, `dur` seconds. `icon` is a key in
// glyphs.js. Optional `fade` (seconds, default 1.5 in sampler.js) is the loop
// crossfade, set only for a steady rhythm: `dur - fade` is a whole number of
// beats, so the next copy's beats land on the outgoing ones (clock: ticks every
// 1.0 s, tick/tock pairs every 2 s, 15.94 - 1.94 = 14.00 s = 7 pairs).
// The three myanmar rows are files supplied by the site owner (in the repo
// before this revamp, not from Moodist).
export const CARRIER_HZ = 200;
export const BRAINWAVE = { delta: 2, theta: 6, alpha: 10, beta: 18, gamma: 40 };

export const CATEGORIES = [
  { id: "rain", name: "rain", icon: "cat-rain" },
  { id: "nature", name: "nature", icon: "cat-nature" },
  { id: "animals", name: "animals", icon: "cat-animals" },
  { id: "urban", name: "urban", icon: "cat-urban" },
  { id: "transport", name: "transport", icon: "cat-transport" },
  { id: "places", name: "places", icon: "cat-places" },
  { id: "things", name: "things", icon: "cat-things" },
  { id: "noise", name: "noise", icon: "cat-noise" },
  { id: "myanmar", name: "myanmar", icon: "cat-myanmar" },
  { id: "brainwave", name: "brainwave", icon: "cat-brainwave" },
];

export const LAYERS = [
  { id: "light-rain", group: "rain", name: "light rain", icon: "light-rain", kind: "sample", src: "rec/rain/light-rain.mp3", trim: 0.966, dur: 149.87 },
  { id: "heavy-rain", group: "rain", name: "heavy rain", icon: "heavy-rain", kind: "sample", src: "rec/rain/heavy-rain.mp3", trim: 0.708, dur: 21.79 },
  { id: "rain-on-window", group: "rain", name: "window", icon: "rain-on-window", kind: "sample", src: "rec/rain/rain-on-window.mp3", trim: 0.49, dur: 33.14 },
  { id: "rain-on-leaves", group: "rain", name: "leaves", icon: "rain-on-leaves", kind: "sample", src: "rec/rain/rain-on-leaves.mp3", trim: 2.265, dur: 42.22 },
  { id: "rain-on-tent", group: "rain", name: "tent", icon: "rain-on-tent", kind: "sample", src: "rec/rain/rain-on-tent.mp3", trim: 0.851, dur: 82.57 },
  { id: "rain-on-car-roof", group: "rain", name: "car roof", icon: "rain-on-car-roof", kind: "sample", src: "rec/rain/rain-on-car-roof.mp3", trim: 1.445, dur: 10.02 },
  { id: "thunder", group: "rain", name: "thunder", icon: "thunder", kind: "sample", src: "rec/rain/thunder.mp3", trim: 0.767, dur: 68.55 },
  { id: "waves", group: "nature", name: "waves", icon: "waves", kind: "sample", src: "rec/nature/waves.mp3", trim: 2.371, dur: 98.66 },
  { id: "river", group: "nature", name: "river", icon: "river", kind: "sample", src: "rec/nature/river.mp3", trim: 1.862, dur: 113.43 },
  { id: "waterfall", group: "nature", name: "waterfall", icon: "waterfall", kind: "sample", src: "rec/nature/waterfall.mp3", trim: 0.902, dur: 23.49 },
  { id: "campfire", group: "nature", name: "campfire", icon: "campfire", kind: "sample", src: "rec/nature/campfire.mp3", trim: 0.668, dur: 125.41 },
  { id: "wind-in-trees", group: "nature", name: "trees", icon: "wind-in-trees", kind: "sample", src: "rec/nature/wind-in-trees.mp3", trim: 1.567, dur: 57.56 },
  { id: "wind", group: "nature", name: "wind", icon: "wind", kind: "sample", src: "rec/nature/wind.mp3", trim: 1.738, dur: 73.42 },
  { id: "jungle", group: "nature", name: "jungle", icon: "jungle", kind: "sample", src: "rec/nature/jungle.mp3", trim: 0.733, dur: 266.7 },
  { id: "droplets", group: "nature", name: "droplets", icon: "droplets", kind: "sample", src: "rec/nature/droplets.mp3", trim: 5.433, dur: 51.75 },
  { id: "birds", group: "animals", name: "birds", icon: "birds", kind: "sample", src: "rec/animals/birds.mp3", trim: 1.047, dur: 115.12 },
  { id: "crickets", group: "animals", name: "crickets", icon: "crickets", kind: "sample", src: "rec/animals/crickets.mp3", trim: 6, dur: 172.54 },
  { id: "frog", group: "animals", name: "frogs", icon: "frog", kind: "sample", src: "rec/animals/frog.mp3", trim: 1.396, dur: 78.65 },
  { id: "crows", group: "animals", name: "crows", icon: "crows", kind: "sample", src: "rec/animals/crows.mp3", trim: 3.09, dur: 58.08 },
  { id: "chickens", group: "animals", name: "chickens", icon: "chickens", kind: "sample", src: "rec/animals/chickens.mp3", trim: 0.776, dur: 202.08 },
  { id: "dog-barking", group: "animals", name: "dogs", icon: "dog-barking", kind: "sample", src: "rec/animals/dog-barking.mp3", trim: 0.432, dur: 16.18 },
  { id: "owl", group: "animals", name: "owl", icon: "owl", kind: "sample", src: "rec/animals/owl.mp3", trim: 2.483, dur: 12.94 },
  { id: "seagulls", group: "animals", name: "seagulls", icon: "seagulls", kind: "sample", src: "rec/animals/seagulls.mp3", trim: 2.512, dur: 43.47 },
  { id: "whale", group: "animals", name: "whale", icon: "whale", kind: "sample", src: "rec/animals/whale.mp3", trim: 0.813, dur: 30.01 },
  { id: "busy-street", group: "urban", name: "busy street", icon: "busy-street", kind: "sample", src: "rec/urban/busy-street.mp3", trim: 1.841, dur: 175.36 },
  { id: "traffic", group: "urban", name: "traffic", icon: "traffic", kind: "sample", src: "rec/urban/traffic.mp3", trim: 3.273, dur: 39.89 },
  { id: "crowd", group: "urban", name: "crowd", icon: "crowd", kind: "sample", src: "rec/urban/crowd.mp3", trim: 3.846, dur: 72.56 },
  { id: "highway", group: "urban", name: "highway", icon: "highway", kind: "sample", src: "rec/urban/highway.mp3", trim: 0.912, dur: 132.5 },
  { id: "inside-a-train", group: "transport", name: "train cabin", icon: "inside-a-train", kind: "sample", src: "rec/transport/inside-a-train.mp3", trim: 1.972, dur: 66.5 },
  { id: "train", group: "transport", name: "train", icon: "train", kind: "sample", src: "rec/transport/train.mp3", trim: 0.427, dur: 61.06 },
  { id: "sailboat", group: "transport", name: "sailboat", icon: "sailboat", kind: "sample", src: "rec/transport/sailboat.mp3", trim: 0.881, dur: 160.52 },
  { id: "airplane", group: "transport", name: "airplane", icon: "airplane", kind: "sample", src: "rec/transport/airplane.mp3", trim: 3.09, dur: 60.03 },
  { id: "cafe", group: "places", name: "cafe", icon: "cafe", kind: "sample", src: "rec/places/cafe.mp3", trim: 1.059, dur: 199.09 },
  { id: "library", group: "places", name: "library", icon: "library", kind: "sample", src: "rec/places/library.mp3", trim: 5.188, dur: 176.53 },
  { id: "office", group: "places", name: "office", icon: "office", kind: "sample", src: "rec/places/office.mp3", trim: 1.603, dur: 139.73 },
  { id: "night-village", group: "places", name: "night village", icon: "night-village", kind: "sample", src: "rec/places/night-village.mp3", trim: 4.217, dur: 106.42 },
  { id: "temple", group: "places", name: "temple", icon: "temple", kind: "sample", src: "rec/places/temple.mp3", trim: 0.543, dur: 91.62 },
  { id: "restaurant", group: "places", name: "restaurant", icon: "restaurant", kind: "sample", src: "rec/places/restaurant.mp3", trim: 2.291, dur: 170.89 },
  { id: "subway-station", group: "places", name: "subway", icon: "subway-station", kind: "sample", src: "rec/places/subway-station.mp3", trim: 2.239, dur: 171.03 },
  { id: "keyboard", group: "things", name: "keyboard", icon: "keyboard", kind: "sample", src: "rec/things/keyboard.mp3", trim: 0.653, dur: 12.15 },
  { id: "clock", group: "things", name: "clock", icon: "clock", kind: "sample", src: "rec/things/clock.mp3", trim: 5.129, dur: 15.94, fade: 1.94 },
  { id: "ceiling-fan", group: "things", name: "ceiling fan", icon: "ceiling-fan", kind: "sample", src: "rec/things/ceiling-fan.mp3", trim: 6, dur: 15.59 },
  { id: "vinyl-effect", group: "things", name: "vinyl", icon: "vinyl-effect", kind: "sample", src: "rec/things/vinyl-effect.mp3", trim: 6, dur: 65.9 },
  { id: "singing-bowl", group: "things", name: "singing bowl", icon: "singing-bowl", kind: "sample", src: "rec/things/singing-bowl.mp3", trim: 0.412, dur: 49.08 },
  { id: "wind-chimes", group: "things", name: "wind chimes", icon: "wind-chimes", kind: "sample", src: "rec/things/wind-chimes.mp3", trim: 1.122, dur: 83.01 },
  { id: "typewriter", group: "things", name: "typewriter", icon: "typewriter", kind: "sample", src: "rec/things/typewriter.mp3", trim: 1.023, dur: 21.78 },
  { id: "white-noise", group: "noise", name: "white", icon: "white-noise", kind: "sample", src: "rec/noise/white-noise.mp3", trim: 1.148, dur: 9.5 },
  { id: "pink-noise", group: "noise", name: "pink", icon: "pink-noise", kind: "sample", src: "rec/noise/pink-noise.mp3", trim: 0.589, dur: 9.51 },
  { id: "brown-noise", group: "noise", name: "brown", icon: "brown-noise", kind: "sample", src: "rec/noise/brown-noise.mp3", trim: 1.059, dur: 9.51 },
  { id: "metta", group: "myanmar", name: "myittar poe", icon: "metta", kind: "sample", src: "rec/myittar-poe.mp3", trim: 1, desc: "မေတ္တာပို့ · metta chant" },
  { id: "metta2", group: "myanmar", name: "metta chant", icon: "metta2", kind: "sample", src: "rec/chant-of-metta.mp3", trim: 1, desc: "the chant of metta" },
  { id: "monastery", group: "myanmar", name: "monastery", icon: "monastery", kind: "sample", src: "rec/mahapatthana.mp3", trim: 1, horn: true, desc: "အသံမစဲ · mahā paṭṭhāna over a horn speaker" },
  { id: "delta", group: "brainwave", name: "binaural δ", icon: "delta", kind: "tone", trim: 1 },
  { id: "theta", group: "brainwave", name: "binaural θ", icon: "theta", kind: "tone", trim: 1 },
  { id: "alpha", group: "brainwave", name: "binaural α", icon: "alpha", kind: "tone", trim: 1 },
  { id: "beta", group: "brainwave", name: "binaural β", icon: "beta", kind: "tone", trim: 1 },
  { id: "gamma", group: "brainwave", name: "binaural γ", icon: "gamma", kind: "tone", trim: 1 },
  { id: "iso", group: "brainwave", name: "isochronic", icon: "iso", kind: "tone", trim: 1 },
];

const BY_ID = new Map(LAYERS.map((l) => [l.id, l]));
export const layerOf = (id) => BY_ID.get(id);
export const byGroup = (group) => LAYERS.filter((l) => l.group === group);
