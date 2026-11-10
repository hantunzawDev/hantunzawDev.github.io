// hzOS icon set: 12×12 pixel-grid strokes, drawn on whole/half pixels so they
// sit dead-centre in their box at 1×. Unicode glyphs (◎ ◱ ⧉ x) fell back to
// different fonts with their own baselines, which is what made them look offset.
const P = {
  close:   '<path d="M3 3l6 6M9 3L3 9"/>',
  float:   '<rect x="1.5" y="1.5" width="9" height="9"/><rect x="5.5" y="5.5" width="5" height="5" class="f"/>',
  tile:    '<rect x="1.5" y="1.5" width="9" height="9"/><path d="M6 1.5v9M6 6h4.5"/>',
  desktop: '<rect x="1.5" y="1.5" width="4" height="4"/><rect x="6.5" y="1.5" width="4" height="4"/><rect x="1.5" y="6.5" width="4" height="4"/><rect x="6.5" y="6.5" width="4" height="4"/>',
  focus:   '<circle cx="6" cy="6" r="4.5"/><circle cx="6" cy="6" r="1.5" class="f"/>',
  zen:     '<path d="M8.8 2.2A4.5 4.5 0 1 0 9.8 8.6 3.6 3.6 0 0 1 8.8 2.2z"/>',
  pop:     '<path d="M5 1.5h5.5V7M10.5 1.5L5.5 6.5"/><path d="M8.5 9v1.5h-7v-7H3"/>',
  check:   '<path d="M2.5 6.2l2.4 2.4 4.6-5"/>',
  dot:     '<circle cx="6" cy="6" r="2" class="f"/>',
  link:    '<path d="M5 7l2-2"/><path d="M6.5 3.5l1-1a2.1 2.1 0 0 1 3 3l-1 1M5.5 8.5l-1 1a2.1 2.1 0 0 1-3-3l1-1"/>',
  bento:   '<rect x="1.5" y="1.5" width="9" height="9"/><path d="M5.5 1.5v9M5.5 5h5M8 5v5.5"/>',
  layout:  '<rect x="1.5" y="1.5" width="9" height="9"/><path d="M1.5 4.5h9M5 4.5v6"/>',
  plus:    '<path d="M6 2v8M2 6h8"/>',
  up:      '<path d="M3 7.5l3-3 3 3"/>',
  down:    '<path d="M3 4.5l3 3 3-3"/>',
  trash:   '<path d="M2 3.5h8M4.5 3.5V2h3v1.5M3 3.5l.5 7h5l.5-7"/>',
  save:    '<path d="M1.5 1.5h7l2 2v7h-9z"/><path d="M3.5 1.5v3h4v-3M3.5 10.5V7h5v3.5"/>',
  play:    '<path d="M3.5 2v8l6-4z" class="f"/>',
  ext:     '<path d="M7 1.5h3.5V5M10.5 1.5L6 6"/><path d="M9 7.5v3H1.5V3h3"/>',
};
export const icon = (name, cls = "") =>
  `<svg class="ico${cls ? " " + cls : ""}" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">${P[name] || ""}</svg>`;
// fill every [data-icon] placeholder in a subtree
export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll("[data-icon]")) el.innerHTML = icon(el.dataset.icon);
}
