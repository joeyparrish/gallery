import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseEntry, parseManifest, formatDate } from '../build/manifest.js';

test('parseEntry accepts a full valid entry', () => {
  const out = parseEntry(
    { file: 'a.png', title: 'A', date: '2026-03-14', attribution: 'Midjourney v6' },
    0,
  );
  assert.deepEqual(out, {
    file: 'a.png',
    title: 'A',
    date: '2026-03-14',
    attribution: 'Midjourney v6',
  });
});

test('parseEntry makes attribution optional (null when absent or blank)', () => {
  assert.equal(parseEntry({ file: 'a.png', title: 'A', date: '2026' }, 0).attribution, null);
  assert.equal(
    parseEntry({ file: 'a.png', title: 'A', date: '2026', attribution: '   ' }, 0).attribution,
    null,
  );
});

test('parseEntry trims whitespace on fields', () => {
  const out = parseEntry({ file: ' a.png ', title: '  A  ', date: ' 2026 ' }, 0);
  assert.equal(out.file, 'a.png');
  assert.equal(out.title, 'A');
  assert.equal(out.date, '2026');
});

test('parseEntry rejects a missing required field', () => {
  assert.throws(() => parseEntry({ file: 'a.png', title: 'A' }, 2), /entry 3.*required field "date"/s);
});

test('parseEntry rejects an empty required field', () => {
  assert.throws(() => parseEntry({ file: '', title: 'A', date: '2026' }, 0), /required field "file"/);
});

test('parseEntry rejects a malformed date', () => {
  assert.throws(
    () => parseEntry({ file: 'a.png', title: 'A', date: 'March 2026' }, 0),
    /must be YYYY, YYYY-MM, or YYYY-MM-DD/,
  );
  assert.throws(() => parseEntry({ file: 'a.png', title: 'A', date: '2026-13-40' }, 0), /must be YYYY/);
});

test('parseEntry rejects non-string attribution', () => {
  assert.throws(
    () => parseEntry({ file: 'a.png', title: 'A', date: '2026', attribution: ['x'] }, 0),
    /attribution.*must be a single string/,
  );
});

test('parseEntry rejects a non-mapping entry', () => {
  assert.throws(() => parseEntry(['a.png'], 0), /expected a mapping.*got a list/s);
  assert.throws(() => parseEntry('a.png', 0), /expected a mapping.*got a string/s);
});

test('parseManifest preserves order and rejects a non-list / empty top level', () => {
  const out = parseManifest([
    { file: 'a.png', title: 'A', date: '2026' },
    { file: 'b.png', title: 'B', date: '2025' },
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
