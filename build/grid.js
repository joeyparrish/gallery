// Build-time index rendering.
//
// The gallery grid used to be constructed in the browser from manifest.json.
// It is now baked into index.html here, so the shipped page contains the full
// gallery (good for crawlers, social previews, and no-JS visitors) and the
// front-end script is left to power only the detail viewer.
//
// All the per-work layout math lives in this one module. It reproduces the
// deterministic, seeded pseudo-randomness the front end used, but evaluated once
// at build time. The browser then does no layout work: CSS sizes each work from
// the baked --wf (width factor), --ar (aspect ratio), and --align custom
// properties. Keep the math here so a later simplification pass has one place to
// change.

// Deterministic pseudo-random in [0, 1) from an integer seed, so each work's
// size and placement are stable. `salt` distinguishes the independent draws.
export function rand01(seed, salt) {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// A work's base size as a fraction of the viewport: a few discrete tiers so the
// procession has large and small moments.
const TIERS = [0.33, 0.413, 0.5];
export function sizeTier(index) {
  return TIERS[Math.floor(rand01(index, 1) * TIERS.length)];
}

// Left / center / right placement, never repeating the previous work's, so the
// column reads as a composed walk rather than a straight stack.
const ALIGNS = ['flex-start', 'center', 'flex-end'];
export function pickAlign(index, prev) {
  const pick = ALIGNS[Math.floor(rand01(index, 9) * ALIGNS.length)];
  return pick === prev ? ALIGNS[(ALIGNS.indexOf(pick) + 1) % ALIGNS.length] : pick;
}

// Width as a multiple of 100svh, before the column and height-cap clamps that
// CSS applies with min(). Landscapes and squares keep their height-based size;
// portraits are sized by area (the geometric mean of their sides), so the square
// root is taken here rather than in the browser.
export function widthFactor(index, ar) {
  const tier = sizeTier(index);
  return ar >= 1 ? tier * ar : tier * Math.sqrt(ar);
}

// Trim a computed number to a short, stable string for an inline style.
function num(x) {
  return String(Number(x.toFixed(4)));
}

// Escape text for use in HTML element content or a double-quoted attribute.
export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Render one work as a static anchor wrapping a figure. `--wf`, `--ar`, and
// `--align` are read by the CSS to size and place it; the image carries a real
// src so the work is visible without JavaScript. The href is the work's own page
// (works/<slug>/); app.js intercepts the click to open the viewer in place, but
// with no JavaScript the link loads that standalone page. `alt` describes the
// image (the work's description when it has one, else its title), while the title
// lives in the figcaption, so the two are associated rather than duplicated.
function renderWork(item, ar, wf, align, eager) {
  const alt = esc(item.description || item.title);
  const play = item.video ? '\n          <div class="work__play" aria-hidden="true"></div>' : '';
  // A tile's rendered width is dominated by wf * 100svh (capped at the column),
  // so that is the sizes hint; the browser then picks the right srcset candidate.
  const sizes = `min(${(wf * 100).toFixed(1)}svh, 100vw)`;
  // The first work is the likely LCP element: load it eagerly at high priority
  // rather than lazily, so it is not deprioritized behind the rest of the grid.
  const priority = eager ? 'fetchpriority="high"' : 'loading="lazy"';
  return `    <a class="work" href="works/${item.slug}/" style="--wf:${num(wf)};--ar:${num(ar)};--align:${align}">
      <figure class="work__figure">
        <div class="work__frame">
          <img class="work__img" src="${encodeURI(item.thumb)}"
               srcset="${item.thumbSrcset}" sizes="${sizes}" alt="${alt}"
               width="${item.width}" height="${item.height}" ${priority} decoding="async"
               style="aspect-ratio:${item.width} / ${item.height}">${play}
        </div>
        <figcaption class="tile__caption"><span class="tile__title">"${esc(item.title)}"</span></figcaption>
      </figure>
    </a>`;
}

// Render the whole grid: the works in manifest order, with alignment resolved
// across the sequence (so no two neighbors share a side).
export function renderGrid(manifest) {
  let prev = '';
  return manifest
    .map((item, i) => {
      const ar = item.width / item.height;
      const align = pickAlign(item.index, prev);
      prev = align;
      return renderWork(item, ar, widthFactor(item.index, ar), align, i === 0);
    })
    .join('\n');
}
