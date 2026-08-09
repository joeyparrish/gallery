// Build-time rendering of standalone work pages.
//
// Each work is served from its own directory (<slug>/index.html) with a
// lean, single-subject body and fully per-work head metadata. This module builds
// the two variable pieces the work template needs: the head metadata block
// (<!--WORK_META-->) and the main content (<!--WORK_MAIN-->). Both are pure
// string builders so they can be unit-tested without the filesystem.

import { esc } from './grid.js';
import { renderWorkJsonLd } from './jsonld.js';

// Assets live at the dist root; a work page is one level below it.
export const ASSET_PREFIX = '../';

// Output directories that sit at the dist root beside the work pages. Since each
// work becomes a root-level directory (works/<slug>/ was flattened to <slug>/), a
// work's slug must not collide with one of these; the build asserts it.
export const RESERVED_SLUGS = new Set(['og', 'full', 'thumbs']);

// The relative path (from the dist root) of a work's directory. Also the URL
// path a visitor sees, and the sitemap entry.
export function workPath(slug) {
  return `${slug}/`;
}

// The per-work <head> block: title, description, canonical, Open Graph, Twitter,
// and single-subject JSON-LD. `item` is a manifest entry augmented with `rawDate`
// (the ISO date the display `date` was formatted from), which the JSON-LD needs.
// `site` is the SITE config.
export function renderWorkMeta(item, site) {
  const slug = item.slug;
  const canonical = new URL(workPath(slug), site.baseUrl).href;
  const ogImage = new URL(`og/${slug}.jpg`, site.baseUrl).href;
  const desc = item.description || `${item.title}, from ${site.name} by ${site.author}.`;
  const alt = item.description || item.title;
  // The JSON-LD node builder keys off `name` and the raw ISO date; only "<" needs
  // neutralizing so the block cannot end its <script> early.
  const seo = {
    name: item.title,
    description: item.description,
    date: item.rawDate,
    full: item.full,
    thumb: item.thumb,
    video: item.video,
  };
  const jsonLd = renderWorkJsonLd(seo, site).replace(/</g, '\\u003c');

  return `<title>"${esc(item.title)}" · ${esc(site.name)}</title>
  <link rel="canonical" href="${esc(canonical)}">
  <meta name="description" content="${esc(desc)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="&quot;${esc(item.title)}&quot;">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:image" content="${esc(ogImage)}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${esc(alt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${esc(ogImage)}">
  <script type="application/ld+json">${jsonLd}</script>`;
}

// The <main> content: the work as a centered figure (crawlable, no-JS), plus a
// link back to the gallery. app.js opens the interactive viewer over this.
export function renderWorkMain(item) {
  const src = ASSET_PREFIX + encodeURI(item.full);
  const alt = esc(item.description || item.title);
  const title = esc(item.title);

  // For a video work, `full` is the poster still; offer a plain link to the clip
  // as the no-JS affordance (the interactive viewer plays it inline).
  const media = item.video
    ? `<img class="viewer__img" src="${src}" alt="${alt}" width="${item.width}" height="${item.height}"
             style="aspect-ratio:${item.width} / ${item.height}">
        <a class="work-detail__back" href="${esc(item.video)}">Play video</a>`
    : `<img class="viewer__img" src="${src}" alt="${alt}" width="${item.width}" height="${item.height}"
             style="aspect-ratio:${item.width} / ${item.height}">`;

  const attribution = item.attribution
    ? `\n        <p class="viewer__attribution">${esc(item.attribution)}</p>`
    : '';

  return `<h1 class="sr-only">"${title}"</h1>
    <figure class="viewer__figure">
        ${media}
      <figcaption class="viewer__caption">
        <h2 class="viewer__title">"${title}"</h2>
        <p class="viewer__date">${esc(item.date)}</p>${attribution}
      </figcaption>
    </figure>
    <a class="work-detail__back" href="${ASSET_PREFIX}">← Gallery</a>`;
}
