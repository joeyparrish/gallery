// Gallery front end: fetch the baked manifest, lay works out in justified rows,
// and drive a hash-routed detail viewer. The plate number (manifest position)
// is the shareable id, so #3 always resolves even when images repeat.

const grid = document.getElementById('grid');
const viewer = document.getElementById('viewer');
const viewerImg = viewer.querySelector('.viewer__img');
const viewerTitle = viewer.querySelector('.viewer__title');
const viewerDate = viewer.querySelector('.viewer__date');
const viewerAttribution = viewer.querySelector('.viewer__attribution');

// Gilt frame scaling. FRAME_TOP_SLICE must match the top border-image-slice in
// style.css; the frame's top molding renders at FRAME_HEIGHT_FRACTION of each
// image's height, so every framed work looks proportionally the same.
const FRAME_TOP_SLICE = 190;
const FRAME_HEIGHT_FRACTION = 0.108;

const state = {
  items: [],
  current: -1,
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
  for (const item of state.items) {
    const ar = item.width / item.height;
    let h = heightTier(item.index) * svh; // capped at 33svh by the tiers
    let w = h * ar;
    if (w > width) {
      w = width; // a wide work can't exceed the column
      h = w / ar;
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

// A work's height as a fraction of the viewport, capped at 33svh: a few
// discrete sizes so the procession has large and small moments.
function heightTier(index) {
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

function indexFromHash() {
  const raw = decodeURIComponent(location.hash.slice(1));
  if (!raw) return -1;
  return state.items.findIndex((it) => it.slug === raw);
}

function onHashChange() {
  const idx = indexFromHash();
  if (idx >= 0) open(idx);
  else hide();
}

function open(idx) {
  const item = state.items[idx];
  if (!item) return;

  if (state.current === -1) {
    state.lastFocus = document.activeElement;
  }
  state.current = idx;

  viewerImg.src = encodeURI(item.full);
  viewerImg.alt = item.title;
  viewerTitle.textContent = `"${item.title}"`;
  viewerDate.textContent = item.date;
  viewerAttribution.textContent = item.attribution || '';

  viewer.hidden = false;
  document.body.classList.add('viewer-open');
  viewer.querySelector('[data-close]').focus();
}

function hide() {
  if (state.current === -1) return;
  state.current = -1;
  viewer.hidden = true;
  document.body.classList.remove('viewer-open');
  viewerImg.removeAttribute('src');
  if (state.lastFocus && document.contains(state.lastFocus)) {
    state.lastFocus.focus();
  }
  state.lastFocus = null;
}

// Close by stripping the hash without leaving a trailing '#'; hide directly
// since replaceState does not emit a hashchange.
function close() {
  if (location.hash) {
    history.replaceState(null, '', location.pathname + location.search);
  }
  hide();
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
