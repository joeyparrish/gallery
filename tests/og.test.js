import { test } from 'node:test';
import assert from 'node:assert/strict';

import { contentBox } from '../build/og.js';

const OPTS = { minMargin: 50 };

// The card is 1200x630; a 50px frame leaves a 1100x530 content area.
test('contentBox fits a landscape work against the height, leaving a 50px frame', () => {
  const box = contentBox({ width: 1408, height: 768 }, OPTS);
  assert.equal(box.height, 530); // binding axis touches the 50px margin
  assert.equal(box.width, 972); // 768 -> 530 scales 1408 to ~972
});

test('contentBox fits a tall work against the height too', () => {
  const box = contentBox({ width: 928, height: 1152 }, OPTS);
  assert.equal(box.height, 530);
  assert.equal(box.width, 427);
});

test('contentBox never enlarges a work smaller than the content area', () => {
  const box = contentBox({ width: 100, height: 100 }, OPTS);
  assert.deepEqual(box, { width: 100, height: 100 });
});

test('contentBox keeps the work within the min-margin bounds on both axes', () => {
  for (const dims of [{ width: 1408, height: 768 }, { width: 928, height: 1152 }, { width: 3000, height: 400 }]) {
    const box = contentBox(dims, OPTS);
    assert.ok(box.width <= 1100, `width ${box.width} within bounds`);
    assert.ok(box.height <= 530, `height ${box.height} within bounds`);
  }
});
