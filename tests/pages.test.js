import { test } from 'node:test';
import assert from 'node:assert/strict';

import { workPath, renderWorkMeta, renderWorkMain, RESERVED_SLUGS } from '../build/pages.js';

const SITE = {
  baseUrl: 'https://joeyparrish.github.io/gallery/',
  name: 'Gallery',
  author: 'Joey Parrish',
  copyrightNotice: '© Joey Parrish',
  license: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
  acquireLicensePage: 'https://joeyparrish.github.io/joeyparrish/contact.html',
};

const IMAGE = {
  slug: 'alien',
  title: 'Alien: The Way of Water',
  date: 'April 9, 2026',
  rawDate: '2026-04-09',
  attribution: 'Some tools',
  a11yText: 'A xenomorph surfing a whale.',
  socialText: 'The Alien franchise gets wet.',
  full: 'full/alien.webp',
  thumb: 'thumbs/alien-1408.webp',
  width: 1408,
  height: 768,
  alternate: { full: 'full/alien-poster.webp' },
  video: null,
};

const VIDEO = {
  slug: 'simulation-theory',
  title: 'Simulation Theory',
  date: 'February 21, 2022',
  rawDate: '2022-02-21',
  attribution: null,
  a11yText: 'Professor Willow asks a question.',
  socialText: 'A deeply unsettling research finding.',
  full: 'full/simulation-theory.webp',
  thumb: 'thumbs/simulation-theory-1080.webp',
  width: 1080,
  height: 2156,
  alternate: null,
  video: 'https://example.com/sim.mp4',
};

test('workPath is a trailing-slash directory at the root (no works/ prefix)', () => {
  assert.equal(workPath('alien'), 'alien/');
});

test('RESERVED_SLUGS covers the sibling output directories', () => {
  assert.ok(RESERVED_SLUGS.has('og'));
  assert.ok(RESERVED_SLUGS.has('full'));
  assert.ok(RESERVED_SLUGS.has('thumbs'));
});

test('renderWorkMeta emits a self-canonical, per-work title and og:image', () => {
  const meta = renderWorkMeta(IMAGE, SITE);
  assert.match(meta, /<title>"Alien: The Way of Water" · Gallery<\/title>/);
  assert.match(
    meta,
    /<link rel="canonical" href="https:\/\/joeyparrish\.github\.io\/gallery\/alien\/">/,
  );
  assert.match(
    meta,
    /<meta property="og:image" content="https:\/\/joeyparrish\.github\.io\/gallery\/og\/alien\.jpg">/,
  );
  assert.match(meta, /<meta property="og:image:width" content="1200">/);
});

test('renderWorkMeta emits single-subject JSON-LD (one ImageObject, not a gallery)', () => {
  const meta = renderWorkMeta(IMAGE, SITE);
  const json = meta.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1];
  const node = JSON.parse(json.replace(/\\u003c/g, '<'));
  assert.equal(node['@type'], 'ImageObject');
  assert.equal(node.name, 'Alien: The Way of Water');
  assert.equal(node.dateCreated, '2026-04-09');
  assert.equal(node.associatedMedia, undefined);
  assert.equal(node.description, 'A xenomorph surfing a whale.'); // JSON-LD uses the full a11y-text
});

test('renderWorkMeta shows social-text in the preview, a11y-text in the image alt', () => {
  const meta = renderWorkMeta(IMAGE, SITE);
  // Visible preview surfaces (social card + search snippet) show the teaser.
  assert.match(meta, /<meta name="description" content="The Alien franchise gets wet\.">/);
  assert.match(meta, /<meta property="og:description" content="The Alien franchise gets wet\.">/);
  // The image's alt keeps the full, spoiler-and-all a11y description.
  assert.match(meta, /<meta property="og:image:alt" content="A xenomorph surfing a whale\.">/);
});

test('renderWorkMain links assets one level up and back to the gallery', () => {
  const main = renderWorkMain(IMAGE);
  assert.match(main, /<h1 class="sr-only">"Alien: The Way of Water"<\/h1>/);
  assert.match(main, /src="\.\.\/full\/alien\.webp"/);
  assert.match(main, /<a class="work-detail__back" href="\.\.\/">← Gallery<\/a>/);
});

test('renderWorkMain offers a plain clip link for a video work', () => {
  const main = renderWorkMain(VIDEO);
  assert.match(main, /href="https:\/\/example\.com\/sim\.mp4">Play video<\/a>/);
});
