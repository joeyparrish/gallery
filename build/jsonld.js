// Build-time schema.org JSON-LD for the gallery.
//
// Search engines read this structured data to understand each work (its name,
// description, media URLs, credit, and date) without any of it being shown to a
// human viewer. It is emitted into a <script type="application/ld+json"> in the
// page head. Images become ImageObject, the clip becomes VideoObject, and the
// whole set is an ImageGallery.

// Google's video rich result wants uploadDate as a full ISO 8601 datetime with a
// timezone, stricter than schema.org, which accepts a date alone. We only know
// the calendar date, so pin a full date to midday UTC, which keeps the calendar
// date the same across nearly every timezone. A partial date (year or
// year-month) can't become a datetime and is left as-is.
function asDateTime(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00Z` : date;
}

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
      if (it.date) node.uploadDate = asDateTime(it.date); // datetime, for Google's video result
    } else {
      node.contentUrl = abs(it.full);
      node.thumbnailUrl = abs(it.thumb);
    }

    // dateCreated (the work's creation date) applies to both images and video;
    // MediaObject inherits it from CreativeWork. Kept date-only and truthful.
    if (it.date) node.dateCreated = it.date;

    // Licensing metadata (Google's "licensable image" feature). creditText is a
    // credit line (the creator/owner name); copyrightNotice is the formal notice
    // (the name with ©); neither is the human-facing generation attribution.
    node.creator = { '@type': 'Person', name: site.author };
    node.creditText = site.author;
    node.copyrightNotice = site.copyrightNotice;
    node.license = site.license;
    node.acquireLicensePage = site.acquireLicensePage;
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
