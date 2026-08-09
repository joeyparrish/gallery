// Pure routing helpers for the front end, kept free of the DOM and browser
// globals so they can be unit-tested in isolation (see tests/routing.test.js).
// app.js bundles these in and supplies the live location/history values.

// Resolve a location into the work it addresses and which rendition to show.
//   <root>/                     -> { slug: null,   rendition: 'main' }      (index)
//   <root>/works/alien/         -> { slug: 'alien', rendition: 'main' }
//   <root>/works/alien/#alternate -> { slug: 'alien', rendition: 'alternate' }
// `rootPath` is the site's base path with a trailing slash (e.g. "/gallery/").
export function parseRoute(pathname, hash, rootPath) {
  const prefix = rootPath + 'works/';
  let slug = null;
  if (pathname.startsWith(prefix)) {
    const seg = pathname.slice(prefix.length).split('/')[0];
    if (seg) slug = decodeURIComponent(seg);
  }
  const rendition = hash === '#alternate' ? 'alternate' : 'main';
  return { slug, rendition };
}

// Decide what the close control should do, given whether this document is the
// index (its grid is live in the DOM) and whether the index is the previous
// history entry (we arrived by clicking a grid item, tagged in history.state).
//   'navigate'  -> a real navigation to the index (cold-loaded work page)
//   'back'      -> history.back() to the live index entry
//   'pushIndex' -> push the index URL and hide the overlay in place
export function closeAction(isIndexDoc, indexBehind) {
  if (!isIndexDoc) return 'navigate';
  return indexBehind ? 'back' : 'pushIndex';
}
