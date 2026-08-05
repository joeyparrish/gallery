import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderJsonLd } from '../build/jsonld.js';

const SITE = {
  baseUrl: 'https://example.com/gallery/',
  name: 'Gallery',
  author: 'Joey Parrish',
  copyrightNotice: '© Joey Parrish',
  license: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
  acquireLicensePage: 'https://example.com/contact.html',
};

test('renderJsonLd builds an ImageGallery of ImageObjects with absolute URLs and license metadata', () => {
  const items = [
    { name: 'A', description: 'A goat at dinner.', date: '2026-03-14', full: 'full/a.webp', thumb: 'thumbs/a.webp', video: null },
  ];
  const data = JSON.parse(renderJsonLd(items, SITE));
  assert.equal(data['@context'], 'https://schema.org');
  assert.equal(data['@type'], 'ImageGallery');
  assert.equal(data.author.name, 'Joey Parrish');

  const img = data.associatedMedia[0];
  assert.equal(img['@type'], 'ImageObject');
  assert.equal(img.name, 'A');
  assert.equal(img.description, 'A goat at dinner.');
  assert.equal(img.dateCreated, '2026-03-14');
  assert.equal(img.contentUrl, 'https://example.com/gallery/full/a.webp');
  assert.equal(img.thumbnailUrl, 'https://example.com/gallery/thumbs/a.webp');

  // Licensable-image metadata: credit line without ©, notice with ©.
  assert.deepEqual(img.creator, { '@type': 'Person', name: 'Joey Parrish' });
  assert.equal(img.creditText, 'Joey Parrish');
  assert.equal(img.copyrightNotice, '© Joey Parrish');
  assert.equal(img.license, SITE.license);
  assert.equal(img.acquireLicensePage, SITE.acquireLicensePage);
});

test('renderJsonLd maps a video work to a VideoObject with the external URL and license', () => {
  const items = [
    { name: 'Clip', description: 'A looping clip.', date: '2022-02-21', full: 'full/c.webp', thumb: 'thumbs/c.webp', video: 'https://cdn.example/c.mp4' },
  ];
  const vid = JSON.parse(renderJsonLd(items, SITE)).associatedMedia[0];
  assert.equal(vid['@type'], 'VideoObject');
  assert.equal(vid.contentUrl, 'https://cdn.example/c.mp4'); // external, untouched
  assert.equal(vid.thumbnailUrl, 'https://example.com/gallery/full/c.webp'); // the poster
  assert.equal(vid.uploadDate, '2022-02-21T12:00:00Z'); // full date -> midday-UTC datetime for Google
  assert.equal(vid.dateCreated, '2022-02-21'); // date-only, on the video too
  assert.equal(vid.license, SITE.license);
  assert.deepEqual(vid.creator, { '@type': 'Person', name: 'Joey Parrish' });
});

test('renderJsonLd leaves a partial video date as-is (cannot become a datetime)', () => {
  const items = [
    { name: 'Clip', description: null, date: '2026', full: 'full/c.webp', thumb: 'thumbs/c.webp', video: 'https://cdn.example/c.mp4' },
  ];
  const vid = JSON.parse(renderJsonLd(items, SITE)).associatedMedia[0];
  assert.equal(vid.uploadDate, '2026');
});

test('renderJsonLd omits description and date when absent; license fields always present', () => {
  const items = [
    { name: 'B', description: null, date: null, full: 'full/b.webp', thumb: 'thumbs/b.webp', video: null },
  ];
  const img = JSON.parse(renderJsonLd(items, SITE)).associatedMedia[0];
  assert.ok(!('description' in img));
  assert.ok(!('dateCreated' in img));
  assert.equal(img.creditText, 'Joey Parrish'); // always set
  assert.equal(img.license, SITE.license);
});
