// Build orchestrator.
//
//   gallery.yaml + images/ + src/  ->  dist/
//
// Reads the manifest, validates it, generates thumbnails, records each image's
// real dimensions, and writes dist/manifest.json alongside the copied static
// shell and originals. Fails loudly (non-zero exit) on any bad entry so a
// broken manifest never deploys.

import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

import { parseManifest, formatDate } from './manifest.js';
import { renderWebp } from './thumbnails.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'images');
const SRC_DIR = path.join(ROOT, 'src');
const DIST_DIR = path.join(ROOT, 'dist');
const MANIFEST_FILE = path.join(ROOT, 'gallery.yaml');

const STATIC_FILES = ['index.html', 'style.css', 'app.js'];

// Full-size detail image: near-lossless, capped for safety (originals are
// expected to be <= 2k). Thumbnail: light, for the grid.
const FULL = { maxEdge: 2560, quality: 90 };
const THUMB = { maxEdge: 900, quality: 80 };

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

    manifest.push({
      index,
      title: entry.title,
      date: formatDate(entry.date),
      attribution: entry.attribution,
      full: `full/${name}`,
      thumb: `thumbs/${name}`,
      width,
      height,
    });
  }

  await fs.writeFile(
    path.join(DIST_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );

  console.log(`Built ${manifest.length} entries -> dist/`);
}

build().catch((err) => {
  console.error(`\nBuild failed: ${err.message}\n`);
  process.exit(1);
});
