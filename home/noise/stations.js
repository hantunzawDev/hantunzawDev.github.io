// Radio station table (pure data, no DOM). Checked 2026-11-09: each returns
// audio/* and CORS headers. `soma` is the SomaFM channel id (now-playing JSON).
const S = (id, vibe, name, url, soma) => (soma ? { id, vibe, name, url, soma } : { id, vibe, name, url });

export const VIBES = ["techno", "coding", "ambient", "lofi", "classical"];

export const STATIONS = [
  S("technolovers-techno", "techno", "Technolovers TECHNO", "https://stream.technolovers.fm/techno"),
  S("rautemusik-techno", "techno", "rautemusik TECHNO", "https://streams.rautemusik.fm/techno/mp3-192"),
  S("technothorium", "techno", "Technothorium (laut.fm)", "https://stream.laut.fm/technothorium"),
  S("esoterica-dark-electro", "techno", "Esoterica dark electro", "https://esoterica.servemp3.com:444/listen/darkclubbing_darkelectro/radio.mp3"),
  S("werave-underground", "techno", "WeRave dark & underground", "https://stream.zeno.fm/pjktyby8dn5tv"),
  S("technolovers-techhouse", "techno", "Technolovers TECH HOUSE", "https://stream.technolovers.fm/techhouse"),
  S("uzic-techno-minimal", "techno", "UZIC techno-minimal", "https://uzic.ice.infomaniak.ch/uzic-128.aac"),
  S("soma-defcon", "coding", "SomaFM DEF CON Radio", "https://ice2.somafm.com/defcon-128-mp3", "defcon"),
  S("soma-cliqhop", "coding", "SomaFM cliqhop idm", "https://ice2.somafm.com/cliqhop-128-mp3", "cliqhop"),
  S("soma-thetrip", "coding", "SomaFM The Trip", "https://ice2.somafm.com/thetrip-128-mp3", "thetrip"),
  S("soma-beatblender", "coding", "SomaFM Beat Blender", "https://ice2.somafm.com/beatblender-128-mp3", "beatblender"),
  S("soma-spacestation", "coding", "SomaFM Space Station Soma", "https://ice2.somafm.com/spacestation-128-mp3", "spacestation"),
  S("soma-groovesalad", "ambient", "SomaFM Groove Salad", "https://ice2.somafm.com/groovesalad-128-mp3", "groovesalad"),
  S("soma-dronezone", "ambient", "SomaFM Drone Zone", "https://ice2.somafm.com/dronezone-128-mp3", "dronezone"),
  S("soma-deepspaceone", "ambient", "SomaFM Deep Space One", "https://ice2.somafm.com/deepspaceone-128-mp3", "deepspaceone"),
  S("soma-darkzone", "ambient", "SomaFM The Dark Zone", "https://ice2.somafm.com/darkzone-128-mp3", "darkzone"),
  S("soma-synphaera", "ambient", "SomaFM Synphaera", "https://ice2.somafm.com/synphaera-128-mp3", "synphaera"),
  S("reyfm-lofi", "lofi", "REYFM #lofi", "https://listen.reyfm.de/lofi_128kbps.mp3"),
  S("laut-lofi", "lofi", "laut.fm lofi", "https://stream.laut.fm/lofi"),
  S("soma-fluid", "lofi", "SomaFM Fluid", "https://ice2.somafm.com/fluid-128-mp3", "fluid"),
  S("nightwave-plaza", "lofi", "Nightwave Plaza (vaporwave)", "https://radio.plaza.one/mp3"),
  S("radio-swiss-classic", "classical", "Radio Swiss Classic", "https://stream.srg-ssr.ch/m/rsc_de/mp3_128"),
  S("klassik-radio", "classical", "Klassik Radio", "https://live.streams.klassikradio.de/klassikradio-deutschland/stream/mp3"),
  S("epic-classical-sleep", "classical", "Epic Classical: for sleep", "https://stream.epic-classical.com/classical-music-for-sleep"),
];

export const stationById = (id) => STATIONS.find((s) => s.id === id) || null;
