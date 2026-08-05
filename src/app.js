// Gallery front end: drive the hash-routed detail viewer over the works baked
// into the page. The index grid is static HTML generated at build time; this
// script only powers the close-up viewer and reports views to analytics.

const viewer = document.getElementById('viewer');
const viewerImg = viewer.querySelector('.viewer__img');
const viewerVideo = viewer.querySelector('.viewer__video');
const viewerTitle = viewer.querySelector('.viewer__title');
const viewerDate = viewer.querySelector('.viewer__date');
const viewerAttribution = viewer.querySelector('.viewer__attribution');
const viewerAlt = viewer.querySelector('[data-alt]');

// Title reported to analytics for the index (no work open).
const SITE_TITLE = document.title;

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
  window.addEventListener('hashchange', onHashChange);

  viewer.querySelector('[data-close]').addEventListener('click', close);
  viewer.querySelector('[data-prev]').addEventListener('click', () => step(-1));
  viewer.querySelector('[data-next]').addEventListener('click', () => step(1));
  viewerAlt.addEventListener('click', toggleRendition);
  viewer.addEventListener('click', (e) => {
    if (e.target === viewer) close();
  });
  document.addEventListener('keydown', onKeydown);

  onHashChange(); // honor a deep link on load
}

// ---- Detail viewer (hash-routed) ---------------------------------------

// Resolve the hash to a work and a rendition. A hash may match a work's main
// slug or an alternate's own slug, so both are searched; the alternate makes the
// same work reachable as a distinct deep link (#alien-poster).
function resolveHash() {
  const raw = decodeURIComponent(location.hash.slice(1));
  if (!raw) return null;
  const main = state.items.findIndex((it) => it.slug === raw);
  if (main >= 0) return { index: main, rendition: 'main' };
  const alt = state.items.findIndex((it) => it.alternate && it.alternate.slug === raw);
  if (alt >= 0) return { index: alt, rendition: 'alternate' };
  return null;
}

function onHashChange() {
  const target = resolveHash();
  if (target) {
    open(target.index, target.rendition);
    trackView(state.items[target.index].title);
  } else {
    hide();
    trackView(SITE_TITLE);
  }
}

// Report the current view to Google Analytics. Hash routing never reloads the
// page, so the tag's automatic page_view is disabled (see index.html) and we
// send one per route ourselves. A no-op if the tag is absent or blocked.
function trackView(title) {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', 'page_view', {
    page_location: location.href,
    page_title: title,
  });
}

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

  if (item.video) {
    // Video entry: `full` is the poster still, shown until the viewer plays.
    // preload="none" (in the markup) means no clip bytes load until then. The
    // poster's dimensions size the box so the still is not letterboxed.
    viewerVideo.poster = encodeURI(item.full);
    viewerVideo.src = item.video;
    viewerVideo.style.aspectRatio = `${item.width} / ${item.height}`;
    viewerVideo.setAttribute('aria-label', item.title);
    viewerVideo.hidden = false;
    viewerImg.hidden = true;
  } else {
    viewerImg.src = encodeURI(showingAlt ? item.alternate.full : item.full);
    viewerImg.alt = item.title;
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

  viewer.hidden = false;
  document.body.classList.add('viewer-open');
  viewer.querySelector('[data-close]').focus();
}

// Swap between the main rendition and the alternate by navigating the hash to
// the other rendition's slug, which re-opens the viewer in place. Routing
// through the hash keeps the URL truthful and the back button working.
function toggleRendition() {
  if (state.current === -1) return;
  const item = state.items[state.current];
  if (!item.alternate) return;
  location.hash = state.rendition === 'main' ? item.alternate.slug : item.slug;
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

// Close by stripping the hash without leaving a trailing '#'; hide directly
// since replaceState does not emit a hashchange.
function close() {
  const wasOpen = state.current !== -1;
  if (location.hash) {
    history.replaceState(null, '', location.pathname + location.search);
  }
  hide();
  // replaceState fires no hashchange, so record the return to the index here.
  if (wasOpen) trackView(SITE_TITLE);
}

// Move to a neighbor (wrapping) by navigating the hash, which re-opens.
function step(delta) {
  if (state.current === -1) return;
  const count = state.items.length;
  const nextIdx = (state.current + delta + count) % count;
  location.hash = state.items[nextIdx].slug;
}

function onKeydown(e) {
  if (state.current === -1) return;
  if (e.key === 'Escape') close();
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'ArrowRight') step(1);
}
