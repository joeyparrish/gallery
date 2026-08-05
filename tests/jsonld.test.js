import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderJsonLd } from '../build/jsonld.js';

const SITE = { baseUrl: 'https://example.com/gallery/', name: 'Gallery', author: 'Joey Parrish' };

test('renderJsonLd builds an ImageGallery of ImageObjects with absolute URLs', () => {
  const items = [
    {
      name: 'A',
      description: 'A goat at dinner.',
      attribution: 'Midjourney',
      date: '2026-03-14',
      full: 'full/a.webp',
      thumb: 'thumbs/a.webp',
      video: null,
    },
  ];
  const data = JSON.parse(renderJsonLd(items, SITE));
  assert.equal(data['@context'], 'https://schema.org');
  assert.equal(data['@type'], 'ImageGallery');
  assert.equal(data.author.name, 'Joey Parrish');

  const img = data.associatedMedia[0];
  assert.equal(img['@type'], 'ImageObject');
  assert.equal(img.name, 'A');
  assert.equal(img.description, 'A goat at dinner.');
  assert.equal(img.creditText, 'Midjourney');
  assert.equal(img.dateCreated, '2026-03-14');
  assert.equal(img.contentUrl, 'https://example.com/gallery/full/a.webp');
  assert.equal(img.thumbnailUrl, 'https://example.com/gallery/thumbs/a.webp');
});

test('renderJsonLd maps a video work to a VideoObject with the external URL', () => {
  const items = [
    {
      name: 'Clip',
      description: 'A looping clip.',
      attribution: null,
      date: '2022-02-21',
      full: 'full/c.webp',
      thumb: 'thumbs/c.webp',
      video: 'https://cdn.example/c.mp4',
    },
  ];
  const vid = JSON.parse(renderJsonLd(items, SITE)).associatedMedia[0];
  assert.equal(vid['@type'], 'VideoObject');
  assert.equal(vid.contentUrl, 'https://cdn.example/c.mp4'); // external, untouched
  assert.equal(vid.thumbnailUrl, 'https://example.com/gallery/full/c.webp'); // the poster
  assert.equal(vid.uploadDate, '2022-02-21');
});

test('renderJsonLd omits description, creditText, and date when absent', () => {
  const items = [
    { name: 'B', description: null, attribution: null, date: null, full: 'full/b.webp', thumb: 'thumbs/b.webp', video: null },
  ];
  const img = JSON.parse(renderJsonLd(items, SITE)).associatedMedia[0];
  assert.ok(!('description' in img));
  assert.ok(!('creditText' in img));
  assert.ok(!('dateCreated' in img));
});
