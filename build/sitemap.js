// Build-time sitemap.xml and robots.txt.
//
// Work URLs are already reachable through the index grid's anchors; the sitemap
// makes that discovery explicit and reliable for crawlers. Both functions are
// pure (string in, string out) so they can be unit-tested without the filesystem.

// XML-escape a URL for text content (ampersands in query strings, etc.).
function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Render sitemap.xml. `paths` are relative to `baseUrl` (e.g. '' for the index,
// 'alien/' for a work); each is resolved to an absolute <loc>.
export function renderSitemap(baseUrl, paths) {
  const urls = paths
    .map((p) => `  <url><loc>${xmlEscape(new URL(p, baseUrl).href)}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

// Render robots.txt: allow everything and point crawlers at the sitemap.
export function renderRobots(baseUrl) {
  return `User-agent: *
Allow: /
Sitemap: ${new URL('sitemap.xml', baseUrl).href}
`;
}
