// Gallery front end: fetch the baked manifest, lay works out in justified rows,
// and drive a hash-routed detail viewer. The plate number (manifest position)
// is the shareable id, so #3 always resolves even when images repeat.

const grid = document.getElementById('grid');
const viewer = document.getElementById('viewer');
const viewerImg = viewer.querySelector('.viewer__img');
const viewerVideo = viewer.querySelector('.viewer__video');
const viewerTitle = viewer.querySelector('.viewer__title');
const viewerDate = viewer.querySelector('.viewer__date');
const viewerAttribution = viewer.querySelector('.viewer__attribution');
const viewerAlt = viewer.querySelector('[data-alt]');

// Gilt frame scaling. FRAME_TOP_SLICE must match the top border-image-slice in
// style.css; the frame's top molding renders at FRAME_HEIGHT_FRACTION of each
// image's height, so every framed work looks proportionally the same.
const FRAME_TOP_SLICE = 190;
const FRAME_HEIGHT_FRACTION = 0.108;

// Ceiling on a single work's rendered height, as a fraction of the viewport, so
// an extreme portrait sized by area can't tower over the procession.
const MAX_HEIGHT = 0.72;

// Title reported to analytics for the index (no work open).
const SITE_TITLE = document.title;

const state = {
  items: [],
  current: -1,
  rendition: 'main', // 'main' | 'alternate' — which rendition of `current` is shown
  lastFocus: null,
};

init();

async function init() {
  let items;
  try {
    const res = await fetch('manifest.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    items = await res.json();
  } catch {
    grid.innerHTML = '<p class="grid__message">Could not load the gallery.</p>';
    return;
  }

  state.items = items;
  render();

  window.addEventListener('resize', debounce(render, 150));
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

// ---- Asymmetric procession layout --------------------------------------

function render() {
  const width = grid.clientWidth;
  if (!width || state.items.length === 0) return;

  const small = width < 640;
  const vGap = small ? 144 : width < 1024 ? 220 : 300;
  const svh = svh100(); // 100svh in px; stable when the URL bar toggles

  grid.style.gap = `${vGap}px`;
  grid.textContent = '';

  let prevAlign = '';
  const maxH = MAX_HEIGHT * svh;
  for (const item of state.items) {
    const ar = item.width / item.height;
    // Landscapes and squares keep their height-based size, which already reads
    // well. Portraits are sized by area (the geometric mean of their sides)
    // instead, so a tall, narrow work grows to carry the same visual mass rather
    // than shrinking to a sliver. The two rules meet exactly at a square, so
    // there is no jump across the boundary.
    const size = sizeTier(item.index) * svh;
    let w, h;
    if (ar >= 1) {
      h = size;
      w = h * ar;
    } else {
      w = size * Math.sqrt(ar);
      h = size / Math.sqrt(ar);
    }
    if (w > width) {
      w = width; // a wide work can't exceed the column
      h = w / ar;
    }
    if (h > maxH) {
      h = maxH; // an extreme portrait can't tower over the procession
      w = h * ar;
    }
    const align = small ? 'center' : pickAlign(item.index, prevAlign);
    if (!small) prevAlign = align;
    grid.appendChild(work(item, Math.round(w), align));
  }
}

// 100svh in pixels, measured via a probe so it reflects the small viewport
// height (URL bar visible) and does NOT shift as the mobile URL bar shows or
// hides. Falls back to innerHeight where svh is unsupported.
function svh100() {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:100svh;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return h > 0 ? h : window.innerHeight;
}

// Deterministic pseudo-random in [0, 1) from an integer seed, so each work's
// size and placement stay put across reloads and resizes. `salt` distinguishes
// the independent draws we take per work.
function rand01(seed, salt) {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// A work's base size as a fraction of the viewport: for a landscape it is the
// rendered height, for a portrait the geometric mean of its sides (the two
// coincide at a square). A few discrete tiers give the procession large and
// small moments.
function sizeTier(index) {
  const tiers = [0.33, 0.413, 0.5];
  return tiers[Math.floor(rand01(index, 1) * tiers.length)];
}

// Left / center / right placement, never repeating the previous work's, so the
// column reads as a composed walk rather than a straight stack.
function pickAlign(index, prev) {
  const options = ['flex-start', 'center', 'flex-end'];
  const pick = options[Math.floor(rand01(index, 9) * options.length)];
  return pick === prev ? options[(options.indexOf(pick) + 1) % options.length] : pick;
}

function work(item, width, align) {
  const link = document.createElement('a');
  link.className = 'work';
  link.href = `#${item.slug}`;
  link.style.width = `${width}px`;
  link.style.alignSelf = align;

  const frame = document.createElement('div');
  frame.className = 'work__frame';
  // Scale the gilt molding proportionally to this image's height.
  const frameHeight = (width * item.height) / item.width;
  frame.style.setProperty('--frame', (FRAME_HEIGHT_FRACTION * frameHeight / FRAME_TOP_SLICE).toFixed(4));

  const img = document.createElement('img');
  img.className = 'work__img';
  // Aspect ratio on the image (not the bordered frame) reserves space without
  // the gilt border throwing off the ratio and cropping via object-fit.
  img.style.aspectRatio = `${item.width} / ${item.height}`;
  img.src = encodeURI(item.thumb);
  img.alt = item.title;
  img.loading = 'lazy';
  img.decoding = 'async';
  frame.appendChild(img);

  // A video entry shows its poster here with a quiet play badge; the clip only
  // plays in the close-up view. The badge is decorative — the tile is the link.
  if (item.video) {
    const play = document.createElement('div');
    play.className = 'work__play';
    play.setAttribute('aria-hidden', 'true');
    frame.appendChild(play);
  }

  const caption = document.createElement('div');
  caption.className = 'tile__caption';

  const title = document.createElement('span');
  title.className = 'tile__title';
  title.textContent = `"${item.title}"`;

  caption.append(title);
  link.append(frame, caption);
  return link;
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

// ---- utility ------------------------------------------------------------

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
