// Build-time schema.org JSON-LD for the gallery.
//
// Search engines read this structured data to understand each work (its name,
// description, media URLs, credit, and date) without any of it being shown to a
// human viewer. It is emitted into a <script type="application/ld+json"> in the
// page head. Images become ImageObject, the clip becomes VideoObject, and the
// whole set is an ImageGallery.

// Build the JSON-LD graph. `items` carry the raw per-work fields; `site` is
// { baseUrl, name, author }. Relative asset paths are resolved to absolute URLs
// against baseUrl (search engines prefer absolute); an external video URL is
// already absolute and passes through untouched.
export function renderJsonLd(items, site) {
  const abs = (p) => new URL(p, site.baseUrl).href;

  const media = items.map((it) => {
    const node = { '@type': it.video ? 'VideoObject' : 'ImageObject', name: it.name };
    if (it.description) node.description = it.description;

    if (it.video) {
      node.contentUrl = it.video; // external clip URL, already absolute
      node.thumbnailUrl = abs(it.full); // the poster still
      if (it.date) node.uploadDate = it.date;
    } else {
      node.contentUrl = abs(it.full);
      node.thumbnailUrl = abs(it.thumb);
      if (it.date) node.dateCreated = it.date;
    }

    if (it.attribution) node.creditText = it.attribution;
    return node;
  });

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ImageGallery',
    name: site.name,
    url: site.baseUrl,
    author: { '@type': 'Person', name: site.author },
    associatedMedia: media,
  });
}
