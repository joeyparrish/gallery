// Gallery front end: drive the path-routed detail viewer over the works baked
// into the page. The index grid and each work page are static HTML generated at
// build time; this script powers the close-up viewer, keeps the URL truthful as
// the visitor moves between works, and reports views to analytics.
//
// Routing is path based: each work lives at <root>/<slug>/, and a work's
// alternate rendition is the same page with a #alternate fragment. The index is
// the full grid; a work page is a lean, single-subject page that this script
// upgrades into the same interactive viewer.

import { parseRoute, locationAction, closeAction } from './routing.js';

const viewer = document.getElementById('viewer');
const viewerImg = viewer.querySelector('.viewer__img');
const viewerVideo = viewer.querySelector('.viewer__video');
const viewerTitle = viewer.querySelector('.viewer__title');
const viewerDate = viewer.querySelector('.viewer__date');
const viewerAttribution = viewer.querySelector('.viewer__attribution');
const viewerAlt = viewer.querySelector('[data-alt]');

// The site name (e.g. "Gallery"), baked into every page as a meta tag. Used as
// the document title for the index and as the suffix for a work's title.
const siteNameMeta = document.querySelector('meta[name="application-name"]');
const SITE_NAME = siteNameMeta ? siteNameMeta.content : document.title;

// The document title for a work, matching the format its dedicated page uses so
// the tab, bookmarks, and history read the same whether the work was opened in
// the SPA or loaded cold.
function workDocTitle(item) {
  return `"${item.title}" · ${SITE_NAME}`;
}

// The dist root as an absolute URL, derived from this module's own URL so it is
// correct at any page depth and under any base path (no hard-coded site path).
// index.html loads app.js as "app.js"; a work page loads it as "../../app.js";
// both resolve to <root>/app.js, so import.meta.url yields the same root.
const ROOT = new URL('.', import.meta.url);
const ROOT_PATH = ROOT.pathname;
const INDEX_URL = ROOT.href;

// The index document carries the grid; a work document does not. This tells the
// close control whether it can hide the overlay in place or must navigate.
const isIndexDoc = !!document.getElementById('grid');

const state = {
  items: readManifest(),
  current: -1,
  rendition: 'main', // 'main' | 'alternate' — which rendition of `current` is shown
  lastFocus: null,
};

init();

// The manifest is baked into the page as a JSON script element, so the viewer
// has its data with no fetch and no failure path.
function readManifest() {
  const el = document.getElementById('gallery-manifest');
  try {
    return JSON.parse(el.textContent);
  } catch {
    return [];
  }
}

function init() {
  window.addEventListener('popstate', onPopState);

  viewer.querySelector('[data-close]').addEventListener('click', close);
  viewer.querySelector('[data-prev]').addEventListener('click', () => step(-1));
  viewer.querySelector('[data-next]').addEventListener('click', () => step(1));
  viewerAlt.addEventListener('click', toggleRendition);
  viewer.addEventListener('click', (e) => {
    if (e.target === viewer) close();
  });
  document.addEventListener('keydown', onKeydown);

  // On the index, grid items are real links to work URLs; intercept clicks to
  // open the viewer in place instead of loading the standalone page.
  const grid = document.getElementById('grid');
  if (grid) grid.addEventListener('click', onGridClick);

  // Honor the current route on load: a work page opens straight into its work.
  syncToLocation();
}

// ---- URL helpers -------------------------------------------------------

function assetUrl(rel) {
  return new URL(rel, ROOT).href;
}

function workUrl(slug) {
  return new URL(encodeURIComponent(slug) + '/', ROOT).href;
}

function indexOfSlug(slug) {
  return state.items.findIndex((it) => it.slug === slug);
}

// ---- Neighbor preloading -----------------------------------------------

// Images already asked for, and a hold on the Image objects so the browser does
// not collect them before the responses are cached.
const preloaded = new Set();
const preloadHold = [];

function preload(url) {
  if (!url || preloaded.has(url)) return;
  preloaded.add(url);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  preloadHold.push(img);
}

// Warm the images the viewer is most likely to show next: the neighbors (which
// step to) and, for a work with an alternate, whichever rendition is not on
// screen (which the toggle swaps to). A neighbor that is a video contributes its
// poster still (`full`); clips themselves are never preloaded.
function preloadNeighbors(idx, rendition) {
  const n = state.items.length;
  if (n === 0) return;
  const cur = state.items[idx];
  preload(assetUrl(state.items[(idx + 1) % n].full));
  preload(assetUrl(state.items[(idx - 1 + n) % n].full));
  if (cur.alternate) {
    preload(assetUrl(rendition === 'main' ? cur.alternate.full : cur.full));
  }
}

// Run `cb` once the image has pixels: immediately if already cached, else on load.
function whenLoaded(img, cb) {
  if (img.complete && img.naturalWidth > 0) cb();
  else img.addEventListener('load', cb, { once: true });
}

// ---- Routing -----------------------------------------------------------

// Open or close the viewer to match the current location. On a work document
// that resolves to the index (e.g. the back button after the page was reloaded
// on a deep link, which fires popstate in this document instead of loading the
// index), there is no grid here to show, so load the real index rather than just
// hiding the overlay, which would strip back to the baked static figure.
function syncToLocation() {
  const { slug, rendition } = parseRoute(location.pathname, location.hash, ROOT_PATH);
  const idx = slug ? indexOfSlug(slug) : -1;
  const action = locationAction(idx >= 0, isIndexDoc);
  if (action === 'open') {
    open(idx, rendition);
    trackView();
  } else if (action === 'navigate') {
    location.replace(INDEX_URL); // replace, so the forward entry to the work survives
  } else {
    hide();
    trackView();
  }
}

function onPopState() {
  syncToLocation();
}

function onGridClick(e) {
  // Let the browser handle modified clicks (new tab/window) and non-primary buttons.
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
    return;
  }
  const a = e.target.closest('a.work');
  if (!a) return;
  const { slug } = parseRoute(new URL(a.href).pathname, '', ROOT_PATH);
  if (!slug) return;
  const idx = indexOfSlug(slug);
  if (idx < 0) return;

  e.preventDefault();
  // Tag this entry so close() knows the (live) index is directly behind it.
  history.pushState({ indexBehind: true }, '', workUrl(slug));
  open(idx, 'main');
  trackView();
}

// Report the current view to Google Analytics. Path routing via pushState never
// reloads the page, so the tag's automatic page_view is disabled (see the
// templates) and we send one per route ourselves, using the document title we
// just set. A no-op if the tag is absent.
function trackView() {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', 'page_view', {
    page_location: location.href,
    page_title: document.title,
  });
}

// ---- Detail viewer -----------------------------------------------------

function open(idx, rendition) {
  const item = state.items[idx];
  if (!item) return;

  if (state.current === -1) {
    state.lastFocus = document.activeElement;
  }
  state.current = idx;
  state.rendition = rendition;

  // Stop and detach whatever was showing before swapping media in.
  resetViewerMedia();

  const showingAlt = rendition === 'alternate' && item.alternate;
  // Describe the media by the work's full a11y-text; the title is shown in the
  // caption below.
  const label = item.a11yText;

  if (item.video) {
    // Video entry: `full` is the poster still, shown until the viewer plays.
    // preload="none" (in the markup) means no clip bytes load until then. The
    // poster's dimensions size the box so the still is not letterboxed.
    viewerVideo.poster = assetUrl(item.full);
    viewerVideo.src = item.video;
    viewerVideo.style.aspectRatio = `${item.width} / ${item.height}`;
    viewerVideo.setAttribute('aria-label', label);
    viewerVideo.hidden = false;
    viewerImg.hidden = true;
  } else {
    viewerImg.src = assetUrl(showingAlt ? item.alternate.full : item.full);
    viewerImg.alt = label;
    viewerImg.hidden = false;
    viewerVideo.hidden = true;
  }

  viewerTitle.textContent = `"${item.title}"`;
  viewerDate.textContent = item.date;
  viewerAttribution.textContent = item.attribution || '';

  // The toggle only exists for works that declare an alternate (never a video).
  // Its label is fixed; aria-pressed and the active style say which is live.
  viewerAlt.hidden = !item.alternate;
  viewerAlt.setAttribute('aria-pressed', showingAlt ? 'true' : 'false');

  // Keep the tab/bookmark/history title in step with the shown work, matching
  // the format the work's dedicated page uses.
  document.title = workDocTitle(item);

  viewer.hidden = false;
  document.body.classList.add('viewer-open');
  viewer.querySelector('[data-close]').focus();

  // Once the focused media is ready, warm the neighbors so stepping and toggling
  // are instant, without competing with the focused image's own load. A video's
  // poster has no load event to wait on and is cheap, so warm immediately.
  if (item.video) preloadNeighbors(idx, rendition);
  else whenLoaded(viewerImg, () => preloadNeighbors(idx, rendition));
}

// Swap between the main rendition and the alternate by pushing a URL with (or
// without) the #alternate fragment, which re-opens the viewer in place. Pushing
// keeps the URL truthful and lets the back button undo the toggle. It does not
// carry the indexBehind tag, so close() still lands on the index rather than
// merely undoing the toggle.
function toggleRendition() {
  if (state.current === -1) return;
  const item = state.items[state.current];
  if (!item.alternate) return;
  const goingAlt = state.rendition === 'main';
  const url = new URL(location.href);
  url.hash = goingAlt ? 'alternate' : '';
  history.pushState({}, '', url.href);
  open(state.current, goingAlt ? 'alternate' : 'main');
  trackView();
}

// Stop and detach whichever medium was showing, so a clip never keeps playing
// or downloading once the viewer navigates away or closes.
function resetViewerMedia() {
  if (!viewerVideo.paused) viewerVideo.pause();
  viewerVideo.removeAttribute('src');
  viewerVideo.removeAttribute('poster');
  viewerVideo.load(); // flush the media element so buffering stops
  viewerImg.removeAttribute('src');
}

function hide() {
  document.title = SITE_NAME; // back to the index: restore the site title
  if (state.current === -1) return;
  state.current = -1;
  state.rendition = 'main';
  viewer.hidden = true;
  document.body.classList.remove('viewer-open');
  resetViewerMedia();
  if (state.lastFocus && document.contains(state.lastFocus)) {
    state.lastFocus.focus();
  }
  state.lastFocus = null;
}

// Close returns the visitor to the index. How depends on how they arrived
// (see closeAction): pop back to a live index entry, hide the overlay over the
// live grid, or navigate for real from a cold-loaded work page.
function close() {
  const action = closeAction(isIndexDoc, !!(history.state && history.state.indexBehind));
  if (action === 'navigate') {
    location.assign(INDEX_URL);
    return;
  }
  if (action === 'back') {
    history.back(); // onPopState hides the overlay and records the index view
    return;
  }
  if (location.href !== INDEX_URL) {
    history.pushState({}, '', INDEX_URL);
  }
  hide();
  trackView();
}

// Move to a neighbor (wrapping). Replace rather than push so the history depth
// stays flat while stepping and close() still returns straight to the index;
// preserve the indexBehind tag so that remains true after stepping.
function step(delta) {
  if (state.current === -1) return;
  const count = state.items.length;
  const nextIdx = (state.current + delta + count) % count;
  const carry = { indexBehind: !!(history.state && history.state.indexBehind) };
  history.replaceState(carry, '', workUrl(state.items[nextIdx].slug));
  open(nextIdx, 'main');
  trackView();
}

function onKeydown(e) {
  if (state.current === -1) return;
  if (e.key === 'Escape') close();
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'ArrowRight') step(1);
}
