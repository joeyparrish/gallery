import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseRoute, closeAction } from '../src/routing.js';

const ROOT = '/gallery/';

test('parseRoute maps the index to no work', () => {
  assert.deepEqual(parseRoute('/gallery/', '', ROOT), { slug: null, rendition: 'main' });
});

test('parseRoute reads a work slug from the path', () => {
  assert.deepEqual(parseRoute('/gallery/works/alien/', '', ROOT), {
    slug: 'alien',
    rendition: 'main',
  });
});

test('parseRoute tolerates an index.html suffix', () => {
  assert.equal(parseRoute('/gallery/works/alien/index.html', '', ROOT).slug, 'alien');
});

test('parseRoute reads the alternate rendition from the fragment', () => {
  assert.deepEqual(parseRoute('/gallery/works/alien/', '#alternate', ROOT), {
    slug: 'alien',
    rendition: 'alternate',
  });
});

test('parseRoute ignores an unrelated fragment', () => {
  assert.equal(parseRoute('/gallery/works/alien/', '#other', ROOT).rendition, 'main');
});

test('parseRoute decodes a percent-encoded slug', () => {
  assert.equal(parseRoute('/gallery/works/a%20b/', '', ROOT).slug, 'a b');
});

test('closeAction navigates for real from a cold-loaded work page', () => {
  assert.equal(closeAction(false, false), 'navigate');
  assert.equal(closeAction(false, true), 'navigate');
});

test('closeAction pops back when the index is the previous entry', () => {
  assert.equal(closeAction(true, true), 'back');
});

test('closeAction hides in place when there is no index behind', () => {
  assert.equal(closeAction(true, false), 'pushIndex');
});
