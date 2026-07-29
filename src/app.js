// Gallery front end: fetch the baked manifest, lay works out in justified rows,
// and drive a hash-routed detail viewer. The plate number (manifest position)
// is the shareable id, so #3 always resolves even when images repeat.

const grid = document.getElementById('grid');
const viewer = document.getElementById('viewer');
const viewerImg = viewer.querySelector('.viewer__img');
const viewerTitle = viewer.querySelector('.viewer__title');
const viewerDate = viewer.querySelector('.viewer__date');
const viewerAttribution = viewer.querySelector('.viewer__attribution');

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

// ---- Justified-rows layout ---------------------------------------------

function render() {
  const width = grid.clientWidth;
  if (!width || state.items.length === 0) return;

  const small = width < 640;
  const mid = width >= 640 && width < 1024;
  const targetHeight = small ? 240 : mid ? 300 : 340;
  const colGap = small ? 20 : mid ? 36 : 52;
  const rowGap = small ? 48 : mid ? 76 : 104;

  const rows = layoutRows(state.items, width, targetHeight, colGap);

  grid.style.rowGap = `${rowGap}px`;
  grid.textContent = '';
  for (const row of rows) {
    const rowEl = document.createElement('div');
    rowEl.className = 'grid__row';
    rowEl.style.gap = `${colGap}px`;
    for (const cell of row) {
      rowEl.appendChild(tile(cell.item, cell.width, cell.height));
    }
    grid.appendChild(rowEl);
  }
}

// Group items into rows, scaling each row to fill the container width. The last
// row keeps the target height (left-aligned) rather than stretching.
function layoutRows(items, containerWidth, targetHeight, gap) {
  const rows = [];
  let row = [];
  let arSum = 0;

  const flush = (isLast) => {
    const gaps = gap * (row.length - 1);
    const naturalWidth = arSum * targetHeight + gaps;
    let height;
    if (isLast && naturalWidth <= containerWidth) {
      height = targetHeight;
    } else {
      height = (containerWidth - gaps) / arSum;
    }
    rows.push(
      row.map((item) => ({
        item,
        width: (item.width / item.height) * height,
        height,
      })),
    );
    row = [];
    arSum = 0;
  };

  for (const item of items) {
    row.push(item);
    arSum += item.width / item.height;
    const rowWidth = arSum * targetHeight + gap * (row.length - 1);
    if (rowWidth >= containerWidth) flush(false);
  }
  if (row.length) flush(true);

  return rows;
}

function tile(item, width, height) {
  const link = document.createElement('a');
  link.className = 'tile';
  link.href = `#${item.index}`;
  link.style.width = `${width}px`;

  const frame = document.createElement('div');
  frame.className = 'tile__frame';
  frame.style.height = `${height}px`;

  const img = document.createElement('img');
  img.className = 'tile__img';
  img.src = encodeURI(item.thumb);
  img.alt = item.title;
  img.loading = 'lazy';
  img.decoding = 'async';
  frame.appendChild(img);

  const caption = document.createElement('div');
  caption.className = 'tile__caption';

  const title = document.createElement('span');
  title.className = 'tile__title';
  title.textContent = item.title;

  const plate = document.createElement('span');
  plate.className = 'tile__plate';
  plate.textContent = String(item.index).padStart(2, '0');

  caption.append(title, plate);
  link.append(frame, caption);
  return link;
}

// ---- Detail viewer (hash-routed) ---------------------------------------

function indexFromHash() {
  const raw = decodeURIComponent(location.hash.slice(1));
  if (!raw) return -1;
  return state.items.findIndex((it) => String(it.index) === raw);
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
  viewerTitle.textContent = item.title;
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
  location.hash = String(state.items[nextIdx].index);
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
