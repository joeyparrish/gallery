import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseEntry, parseManifest, formatDate, slugify } from '../build/manifest.js';

// A minimal valid entry (all required fields present) to spread and override.
const REQ = {
  file: 'a.png',
  title: 'A',
  date: '2026',
  'a11y-text': 'A goat at dinner.',
  'social-text': 'Dinner is served.',
};

test('parseEntry accepts a full valid entry', () => {
  const out = parseEntry({ ...REQ, date: '2026-03-14', attribution: 'Midjourney v6' }, 0);
  assert.deepEqual(out, {
    file: 'a.png',
    title: 'A',
    date: '2026-03-14',
    attribution: 'Midjourney v6',
    alternate: null,
    video: null,
    a11yText: 'A goat at dinner.',
    socialText: 'Dinner is served.',
  });
});

test('parseEntry makes attribution optional (null when absent or blank)', () => {
  assert.equal(parseEntry({ ...REQ }, 0).attribution, null);
  assert.equal(parseEntry({ ...REQ, attribution: '   ' }, 0).attribution, null);
});

test('parseEntry accepts and trims a valid alternate', () => {
  assert.equal(parseEntry({ ...REQ, alternate: ' a-poster.png ' }, 0).alternate, 'a-poster.png');
});

test('parseEntry makes alternate optional (null when absent or blank)', () => {
  assert.equal(parseEntry({ ...REQ }, 0).alternate, null);
  assert.equal(parseEntry({ ...REQ, alternate: '   ' }, 0).alternate, null);
});

test('parseEntry rejects non-string alternate', () => {
  assert.throws(
    () => parseEntry({ ...REQ, alternate: ['x'] }, 0),
    /alternate.*must be a single string/,
  );
});

test('parseEntry accepts and trims a valid video URL', () => {
  assert.equal(
    parseEntry({ ...REQ, file: 'poster.png', video: ' https://cdn.example/a.mp4 ' }, 0).video,
    'https://cdn.example/a.mp4',
  );
});

test('parseEntry makes video optional (null when absent or blank)', () => {
  assert.equal(parseEntry({ ...REQ }, 0).video, null);
  assert.equal(parseEntry({ ...REQ, video: '   ' }, 0).video, null);
});

test('parseEntry rejects non-string video', () => {
  assert.throws(() => parseEntry({ ...REQ, video: ['x'] }, 0), /video.*must be a single string/);
});

test('parseEntry trims a11y-text and social-text', () => {
  const out = parseEntry({ ...REQ, 'a11y-text': '  A goat.  ', 'social-text': '  A tease.  ' }, 0);
  assert.equal(out.a11yText, 'A goat.');
  assert.equal(out.socialText, 'A tease.');
});

test('parseEntry requires a11y-text', () => {
  assert.throws(
    () => parseEntry({ file: 'a.png', title: 'A', date: '2026', 'social-text': 'x' }, 0),
    /required field "a11y-text"/,
  );
  assert.throws(() => parseEntry({ ...REQ, 'a11y-text': '   ' }, 0), /required field "a11y-text"/);
});

test('parseEntry requires social-text', () => {
  assert.throws(
    () => parseEntry({ file: 'a.png', title: 'A', date: '2026', 'a11y-text': 'x' }, 0),
    /required field "social-text"/,
  );
  assert.throws(() => parseEntry({ ...REQ, 'social-text': '   ' }, 0), /required field "social-text"/);
});

test('parseEntry rejects an entry that sets both video and alternate', () => {
  assert.throws(
    () => parseEntry({ ...REQ, video: 'https://x/a.mp4', alternate: 'b.png' }, 0),
    /cannot set both "video" and "alternate"/,
  );
});

test('parseEntry trims whitespace on fields', () => {
  const out = parseEntry({ ...REQ, file: ' a.png ', title: '  A  ', date: ' 2026 ' }, 0);
  assert.equal(out.file, 'a.png');
  assert.equal(out.title, 'A');
  assert.equal(out.date, '2026');
});

test('parseEntry rejects a missing required field', () => {
  assert.throws(
    () => parseEntry({ file: 'a.png', title: 'A', 'a11y-text': 'x', 'social-text': 'y' }, 2),
    /entry 3.*required field "date"/s,
  );
});

test('parseEntry rejects an empty required field', () => {
  assert.throws(() => parseEntry({ ...REQ, file: '' }, 0), /required field "file"/);
});

test('parseEntry rejects a malformed date', () => {
  assert.throws(
    () => parseEntry({ ...REQ, date: 'March 2026' }, 0),
    /must be YYYY, YYYY-MM, or YYYY-MM-DD/,
  );
  assert.throws(() => parseEntry({ ...REQ, date: '2026-13-40' }, 0), /must be YYYY/);
});

test('parseEntry rejects non-string attribution', () => {
  assert.throws(
    () => parseEntry({ ...REQ, attribution: ['x'] }, 0),
    /attribution.*must be a single string/,
  );
});

test('parseEntry rejects a non-mapping entry', () => {
  assert.throws(() => parseEntry(['a.png'], 0), /expected a mapping.*got a list/s);
  assert.throws(() => parseEntry('a.png', 0), /expected a mapping.*got a string/s);
});

test('parseManifest preserves order and rejects a non-list / empty top level', () => {
  const out = parseManifest([
    { ...REQ, title: 'A' },
    { ...REQ, title: 'B', date: '2025' },
  ]);
  assert.deepEqual(out.map((e) => e.title), ['A', 'B']);
  assert.throws(() => parseManifest({}), /top level must be a list/);
  assert.throws(() => parseManifest([]), /no entries found/);
});

test('formatDate renders each granularity', () => {
  assert.equal(formatDate('2026'), '2026');
  assert.equal(formatDate('2026-03'), 'March 2026');
  assert.equal(formatDate('2026-03-14'), 'March 14, 2026');
  assert.equal(formatDate('2026-01-01'), 'January 1, 2026');
});

test('slugify lowercases and hyphenates a title', () => {
  assert.equal(slugify('Four More Years'), 'four-more-years');
  assert.equal(slugify('I Would Eat It With A Goat'), 'i-would-eat-it-with-a-goat');
});

test('slugify collapses punctuation and trims stray hyphens', () => {
  assert.equal(slugify('  Red Dunes!!  '), 'red-dunes');
  assert.equal(slugify('Study #7: Dawn'), 'study-7-dawn');
});

test('slugify strips accents', () => {
  assert.equal(slugify('Café Déjà Vu'), 'cafe-deja-vu');
});

test('slugify returns empty for a title with no alphanumerics', () => {
  assert.equal(slugify('—'), '');
});

test('identical titles slugify identically (duplicates)', () => {
  assert.equal(slugify('Four More Years'), slugify('Four More Years'));
});
