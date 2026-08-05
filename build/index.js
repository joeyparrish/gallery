// Build orchestrator.
//
//   gallery.yaml + images/ + src/  ->  dist/
//
// Reads the manifest, validates it, generates thumbnails, records each image's
// real dimensions, bakes the grid and the inlined manifest into index.html, and
// copies the remaining static shell. Fails loudly (non-zero exit) on any bad
// entry so a broken manifest never deploys.

import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

import { parseManifest, formatDate, slugify } from './manifest.js';
import { renderWebp } from './thumbnails.js';
import { renderGrid } from './grid.js';
import { renderJsonLd } from './jsonld.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'images');
const SRC_DIR = path.join(ROOT, 'src');
const DIST_DIR = path.join(ROOT, 'dist');
const MANIFEST_FILE = path.join(ROOT, 'gallery.yaml');

// index.html is generated (grid baked in, manifest inlined), not copied; see
// below. frame.png is the untouched high-res source and frame.webp (half-scale,
// lossy) is what ships, so the .png stays out of this list and never deploys.
const STATIC_FILES = ['style.css', 'app.js', 'frame.webp'];

// Full-size detail image: near-lossless, capped for safety (originals are
// expected to be <= 2k). Thumbnail: light, for the grid.
const FULL = { maxEdge: 2560, quality: 90 };
const THUMB = { maxEdge: 1600, quality: 82 };

// Canonical site identity, used for the absolute URLs in the JSON-LD (and the
// og:url / canonical link baked into index.html).
const SITE = {
  baseUrl: 'https://joeyparrish.github.io/gallery/',
  name: 'Gallery',
  author: 'Joey Parrish',        // creator / credit line (no ©)
  copyrightNotice: '© Joey Parrish', // formal copyright notice (with ©)
  // Every work is licensed CC BY-NC-ND 4.0 (attribution, non-commercial, no
  // derivatives); commercial or derivative use is arranged via the contact page.
  license: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
  acquireLicensePage: 'https://joeyparrish.github.io/joeyparrish/contact.html',
};

// A stable, url-safe basename (no extension) for an entry's generated assets.
function assetBase(file, index) {
  const stem = file
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${String(index).padStart(3, '0')}-${stem}`;
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readManifestText() {
  try {
    return await fs.readFile(MANIFEST_FILE, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        'gallery.yaml not found. Copy gallery.example.yaml to gallery.yaml and list your images.',
      );
    }
    throw err;
  }
}

async function build() {
  const yamlText = await readManifestText();
  // FAILSAFE_SCHEMA keeps every scalar a string, so unquoted values like
  // `date: 2026-03-14` (a YAML timestamp) or `title: 10` never surprise us.
  const raw = yaml.load(yamlText, { schema: yaml.FAILSAFE_SCHEMA });
  const entries = parseManifest(raw);

  // Fresh output tree.
  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await fs.mkdir(path.join(DIST_DIR, 'full'), { recursive: true });
  await fs.mkdir(path.join(DIST_DIR, 'thumbs'), { recursive: true });

  // Static shell.
  for (const name of STATIC_FILES) {
    await fs.copyFile(path.join(SRC_DIR, name), path.join(DIST_DIR, name));
  }

  const manifest = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const index = i + 1;
    const source = path.join(IMAGES_DIR, entry.file);

    if (!(await fileExists(source))) {
      throw new Error(
        `gallery.yaml entry ${index} ("${entry.title}"): image file not found at images/${entry.file}`,
      );
    }

    const name = `${assetBase(entry.file, index)}.webp`;
    const { width, height } = await renderWebp(source, path.join(DIST_DIR, 'full', name), FULL);
    await renderWebp(source, path.join(DIST_DIR, 'thumbs', name), THUMB);

    // Optional alternate rendition: same work, shown a different way. It only
    // ever appears in the close-up viewer, so we render a full-size WebP but no
    // thumbnail. Its slug comes from the alternate filename stem, making it an
    // independent deep-link target (#alien-poster).
    let alternate = null;
    if (entry.alternate) {
      const altSource = path.join(IMAGES_DIR, entry.alternate);
      if (!(await fileExists(altSource))) {
        throw new Error(
          `gallery.yaml entry ${index} ("${entry.title}"): alternate file not found at images/${entry.alternate}`,
        );
      }
      const altName = `${assetBase(entry.alternate, index)}.webp`;
      await renderWebp(altSource, path.join(DIST_DIR, 'full', altName), FULL);
      alternate = {
        slug: slugify(entry.alternate.replace(/\.[^.]+$/, '')) || `work-${index}-alternate`,
        full: `full/${altName}`,
      };
    }

    manifest.push({
      index,
      slug: slugify(entry.title) || `work-${index}`,
      title: entry.title,
      date: formatDate(entry.date),
      attribution: entry.attribution,
      description: entry.description,
      full: `full/${name}`,
      thumb: `thumbs/${name}`,
      width,
      height,
      alternate,
      // External clip URL, or null. `file` above is this entry's poster still,
      // which rides the normal image pipeline; the clip itself is never touched
      // by the build.
      video: entry.video,
    });
  }

  // Bake three things into index.html: the visible grid, the inlined manifest
  // JSON the viewer reads, and the JSON-LD that describes each work for search
  // engines. Both JSON blocks escape "<" so they cannot end their <script> early.
  const template = await fs.readFile(path.join(SRC_DIR, 'index.html'), 'utf8');
  for (const marker of ['<!--WORKS-->', '/*MANIFEST*/', '/*JSONLD*/']) {
    if (!template.includes(marker)) {
      throw new Error(`src/index.html is missing the ${marker} placeholder`);
    }
  }
  const grid = renderGrid(manifest);
  const inlineManifest = JSON.stringify(manifest).replace(/</g, '\\u003c');
  // The JSON-LD needs the raw ISO date and the description, which the manifest
  // does not carry, so pair each work with its parsed entry.
  const seoItems = manifest.map((m, i) => ({
    name: m.title,
    description: m.description,
    date: entries[i].date, // raw ISO date, which the manifest does not carry
    full: m.full,
    thumb: m.thumb,
    video: m.video,
  }));
  const jsonLd = renderJsonLd(seoItems, SITE).replace(/</g, '\\u003c');
  const html = template
    .replace('<!--WORKS-->', () => grid)
    .replace('/*MANIFEST*/', () => inlineManifest)
    .replace('/*JSONLD*/', () => jsonLd);
  await fs.writeFile(path.join(DIST_DIR, 'index.html'), html);

  console.log(`Built ${manifest.length} entries -> dist/`);
}

build().catch((err) => {
  console.error(`\nBuild failed: ${err.message}\n`);
  process.exit(1);
});
