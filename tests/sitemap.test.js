import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderSitemap, renderRobots } from '../build/sitemap.js';

const BASE = 'https://joeyparrish.github.io/gallery/';

test('renderSitemap resolves each path to an absolute loc', () => {
  const xml = renderSitemap(BASE, ['', 'alien/']);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<loc>https:\/\/joeyparrish\.github\.io\/gallery\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/joeyparrish\.github\.io\/gallery\/alien\/<\/loc>/);
});

test('renderSitemap emits one url element per path', () => {
  const xml = renderSitemap(BASE, ['', 'a/', 'b/']);
  assert.equal((xml.match(/<url>/g) || []).length, 3);
});

test('renderRobots allows all and points at the sitemap', () => {
  const txt = renderRobots(BASE);
  assert.match(txt, /User-agent: \*/);
  assert.match(txt, /Allow: \//);
  assert.match(txt, /Sitemap: https:\/\/joeyparrish\.github\.io\/gallery\/sitemap\.xml/);
});
