import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rand01, sizeTier, pickAlign, widthFactor, renderGrid } from '../build/grid.js';

test('rand01 is deterministic and in [0, 1)', () => {
  const a = rand01(3, 1);
  assert.equal(a, rand01(3, 1)); // same seed/salt -> same value
  assert.ok(a >= 0 && a < 1);
  assert.notEqual(rand01(3, 1), rand01(3, 9)); // salt distinguishes draws
});

test('sizeTier returns one of the discrete tiers', () => {
  for (let i = 1; i <= 20; i++) {
    assert.ok([0.33, 0.413, 0.5].includes(sizeTier(i)));
  }
});

test('pickAlign never repeats the previous alignment and stays valid', () => {
  const valid = ['flex-start', 'center', 'flex-end'];
  let prev = '';
  for (let i = 1; i <= 30; i++) {
    const a = pickAlign(i, prev);
    assert.ok(valid.includes(a));
    assert.notEqual(a, prev);
    prev = a;
  }
});

test('widthFactor sizes landscapes by height and portraits by area', () => {
  assert.equal(widthFactor(2, 2), sizeTier(2) * 2); // landscape: tier * ar
  assert.equal(widthFactor(5, 0.5), sizeTier(5) * Math.sqrt(0.5)); // portrait: tier * sqrt(ar)
  assert.equal(widthFactor(7, 1), sizeTier(7)); // square: the two rules agree
});

test('renderGrid emits a figure per work with baked layout vars and alt', () => {
  const manifest = [
    { index: 1, slug: 'a', title: 'A', a11yText: 'A red painting.', thumb: 'thumbs/a-100.webp', thumbSrcset: 'thumbs/a-100.webp 100w', width: 100, height: 100, video: null },
    { index: 2, slug: 'b-clip', title: 'B', a11yText: 'B', thumb: 'thumbs/b-200.webp', thumbSrcset: 'thumbs/b-200.webp 200w', width: 200, height: 100, video: 'https://x/b.mp4' },
  ];
  const html = renderGrid(manifest);
  assert.equal((html.match(/<a class="work"/g) || []).length, 2);
  assert.equal((html.match(/<figure class="work__figure"/g) || []).length, 2);
  assert.equal((html.match(/<figcaption/g) || []).length, 2);
  assert.match(html, /href="a\/"/);
  assert.match(html, /--wf:/);
  assert.match(html, /--ar:/);
  assert.match(html, /--align:/);
  // Responsive thumbnails: baked srcset and a sizes hint.
  assert.match(html, /srcset="thumbs\/a-100\.webp 100w"/);
  assert.match(html, /sizes="min\(/);
  // The first work loads eagerly at high priority; the rest stay lazy.
  assert.match(html, /fetchpriority="high"/);
  assert.equal((html.match(/loading="lazy"/g) || []).length, 1);
  // alt describes the image: the description when present, else the title.
  assert.match(html, /alt="A red painting\."/);
  assert.match(html, /alt="B"/);
  // Only the video entry gets a play badge.
  assert.equal((html.match(/work__play/g) || []).length, 1);
});

test('renderGrid escapes HTML in titles', () => {
  const manifest = [
    { index: 1, slug: 'x', title: 'A <b>& "Q"', a11yText: 'A <b>& "Q"', thumb: 'thumbs/x.webp', width: 10, height: 10, video: null },
  ];
  const html = renderGrid(manifest);
  assert.doesNotMatch(html, /<b>/);
  assert.match(html, /&lt;b&gt;/);
  assert.match(html, /&amp;/);
});
