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
import { transform, build as esbuildBundle } from 'esbuild';

import { parseManifest, formatDate, slugify } from './manifest.js';
import { renderWebp, renderWidth, renderJpeg } from './thumbnails.js';
import { renderGrid } from './grid.js';
import { renderJsonLd } from './jsonld.js';
import { renderOgCard, backgroundSize } from './og.js';
import { renderSitemap, renderRobots } from './sitemap.js';
import { renderWorkMeta, renderWorkMain, workPath, RESERVED_SLUGS } from './pages.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'images');
const SRC_DIR = path.join(ROOT, 'src');
const DIST_DIR = path.join(ROOT, 'dist');
const MANIFEST_FILE = path.join(ROOT, 'gallery.yaml');

// Only frame.webp is copied verbatim. index.html is generated, style.css is
// minified and inlined into it, and app.js is minified to dist/ (all below).
const STATIC_FILES = ['frame.webp'];

// Full-size detail image: near-lossless, capped for safety (originals are
// expected to be <= 2k).
const FULL = { maxEdge: 2560, quality: 90 };

// Responsive index thumbnails: a ladder of widths (capped per work at the source
// width, no upscaling) emitted as a srcset, so each display/DPR downloads an
// appropriately sized image instead of one oversized thumbnail.
const THUMB_WIDTHS = [480, 768, 1152, 1600];
const THUMB_QUALITY = 82;

// Per-work social cards: the work composited onto src/og-background.webp, fit
// inside the 1200x630 card less a `minMargin` frame on every side.
const OG = { minMargin: 50, quality: 85 };

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

// A stable, url-safe basename (no extension) for an entry's generated assets,
// derived only from the source filename so it stays the same when works are
// reordered, keeping already-cached images valid. Uniqueness across all works is
// enforced in build() (see claimName).
function assetBase(file) {
  return file
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
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
  await fs.mkdir(path.join(DIST_DIR, 'og'), { recursive: true });

  // Static shell.
  for (const name of STATIC_FILES) {
    await fs.copyFile(path.join(SRC_DIR, name), path.join(DIST_DIR, name));
  }

  // Social preview image: hero.webp -> og.jpg. Scrapers don't reliably render
  // WebP, so the card image is JPEG; mozjpeg q85 is small and indistinguishable
  // at preview size. The meta tags in index.html expect 1200x630.
  const og = await renderJpeg(path.join(SRC_DIR, 'hero.webp'), path.join(DIST_DIR, 'og.jpg'), {
    quality: 85,
  });
  if (og.width !== 1200 || og.height !== 630) {
    console.warn(`Warning: src/hero.webp is ${og.width}x${og.height}; social cards expect 1200x630.`);
  }

  // Background for the per-work social cards. It is cover-resized to 1200x630 when
  // composited (a safety net), but warn if it is not authored at that size.
  const ogBg = path.join(SRC_DIR, 'og-background.webp');
  if (!(await fileExists(ogBg))) {
    throw new Error('src/og-background.webp not found; it is the base for per-work social cards.');
  }
  const bg = await backgroundSize(ogBg);
  if (bg.width !== 1200 || bg.height !== 630) {
    console.warn(`Warning: src/og-background.webp is ${bg.width}x${bg.height}; social cards expect 1200x630.`);
  }

  const manifest = [];

  // Generated filenames now come from the source stem, so two works whose source
  // files normalize to the same name would overwrite each other. Fail loudly
  // instead, pointing at the offending entry.
  const usedNames = new Set();
  const claimName = (base, index, title) => {
    if (usedNames.has(base)) {
      throw new Error(
        `gallery.yaml entry ${index} ("${title}"): generated filename "${base}.webp" collides with another work; rename the source file so its name is unique.`,
      );
    }
    usedNames.add(base);
    return base;
  };

  // A work's slug now names its top-level page directory and its social card, so
  // it must be unique and must not collide with a sibling output directory
  // (og/, full/, thumbs/). Fail loudly on either.
  const usedSlugs = new Set();
  const claimSlug = (slug, index, title) => {
    if (RESERVED_SLUGS.has(slug)) {
      throw new Error(
        `gallery.yaml entry ${index} ("${title}"): title slug "${slug}" collides with a reserved output directory (${[...RESERVED_SLUGS].join(', ')}); give it a distinct title.`,
      );
    }
    if (usedSlugs.has(slug)) {
      throw new Error(
        `gallery.yaml entry ${index} ("${title}"): title slug "${slug}" collides with another work; give one a distinct title.`,
      );
    }
    usedSlugs.add(slug);
    return slug;
  };

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const index = i + 1;
    const source = path.join(IMAGES_DIR, entry.file);

    if (!(await fileExists(source))) {
      throw new Error(
        `gallery.yaml entry ${index} ("${entry.title}"): image file not found at images/${entry.file}`,
      );
    }

    const base = claimName(assetBase(entry.file), index, entry.title);
    const { width, height } = await renderWebp(source, path.join(DIST_DIR, 'full', `${base}.webp`), FULL);

    // Responsive thumbnails: the width ladder capped at this work's source width
    // (no upscaling), plus the source width itself as the top candidate.
    const thumbWidths = THUMB_WIDTHS.filter((w) => w < width);
    thumbWidths.push(width);
    const srcset = [];
    for (const w of thumbWidths) {
      const out = await renderWidth(source, path.join(DIST_DIR, 'thumbs', `${base}-${w}.webp`), {
        width: w,
        quality: THUMB_QUALITY,
      });
      srcset.push(`thumbs/${base}-${w}.webp ${out.width}w`);
    }
    const thumb = `thumbs/${base}-${width}.webp`; // largest, used as the fallback src

    // Optional alternate rendition: same work, shown a different way. It only
    // ever appears in the close-up viewer as a toggle (the #alternate fragment on
    // the work's own page), so we render a full-size WebP but no thumbnail, and it
    // needs no slug of its own.
    let alternate = null;
    if (entry.alternate) {
      const altSource = path.join(IMAGES_DIR, entry.alternate);
      if (!(await fileExists(altSource))) {
        throw new Error(
          `gallery.yaml entry ${index} ("${entry.title}"): alternate file not found at images/${entry.alternate}`,
        );
      }
      const altName = `${claimName(assetBase(entry.alternate), index, entry.title)}.webp`;
      await renderWebp(altSource, path.join(DIST_DIR, 'full', altName), FULL);
      alternate = { full: `full/${altName}` };
    }

    // Per-work social card: the work (its poster still, for a video) composited
    // onto the shared background.
    const slug = claimSlug(slugify(entry.title) || `work-${index}`, index, entry.title);
    await renderOgCard(ogBg, source, path.join(DIST_DIR, 'og', `${slug}.jpg`), OG);

    manifest.push({
      index,
      slug,
      title: entry.title,
      date: formatDate(entry.date),
      attribution: entry.attribution,
      description: entry.description,
      full: `full/${base}.webp`,
      thumb,
      thumbSrcset: srcset.join(', '),
      width,
      height,
      alternate,
      // External clip URL, or null. `file` above is this entry's poster still,
      // which rides the normal image pipeline; the clip itself is never touched
      // by the build.
      video: entry.video,
    });
  }

  // Shared pieces baked into both the index and each work page: the inlined
  // manifest JSON the viewer reads, the minified CSS, and the viewer overlay.
  // JSON blocks escape "<" so they cannot end their <script> early.
  const inlineManifest = JSON.stringify(manifest).replace(/</g, '\\u003c');
  const css = await fs.readFile(path.join(SRC_DIR, 'style.css'), 'utf8');
  const minCss = (await transform(css, { loader: 'css', minify: true })).code.trim();
  const viewer = await fs.readFile(path.join(SRC_DIR, 'viewer.html'), 'utf8');

  // Bake into index.html: the visible grid, the manifest, the JSON-LD gallery
  // graph for search engines, the viewer overlay, and the styles.
  const template = await fs.readFile(path.join(SRC_DIR, 'index.html'), 'utf8');
  for (const marker of ['<!--WORKS-->', '<!--VIEWER-->', '/*MANIFEST*/', '/*JSONLD*/', '/*STYLE*/']) {
    if (!template.includes(marker)) {
      throw new Error(`src/index.html is missing the ${marker} placeholder`);
    }
  }
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
    .replace('<!--WORKS-->', () => renderGrid(manifest))
    .replace('<!--VIEWER-->', () => viewer)
    .replace('/*MANIFEST*/', () => inlineManifest)
    .replace('/*JSONLD*/', () => jsonLd)
    .replace('/*STYLE*/', () => minCss);
  await fs.writeFile(path.join(DIST_DIR, 'index.html'), html);

  // One lean, single-subject page per work at <slug>/index.html. It shares the
  // manifest, styles, and viewer with the index but carries per-work head
  // metadata and only its own work in the body.
  const workTemplate = await fs.readFile(path.join(SRC_DIR, 'work.html'), 'utf8');
  for (const marker of ['<!--WORK_META-->', '<!--WORK_MAIN-->', '<!--VIEWER-->', '/*MANIFEST*/', '/*STYLE*/']) {
    if (!workTemplate.includes(marker)) {
      throw new Error(`src/work.html is missing the ${marker} placeholder`);
    }
  }
  for (let i = 0; i < manifest.length; i++) {
    const item = manifest[i];
    const metaItem = { ...item, rawDate: entries[i].date };
    const workHtml = workTemplate
      .replace('<!--WORK_META-->', () => renderWorkMeta(metaItem, SITE))
      .replace('<!--WORK_MAIN-->', () => renderWorkMain(item))
      .replace('<!--VIEWER-->', () => viewer)
      .replace('/*MANIFEST*/', () => inlineManifest)
      .replace('/*STYLE*/', () => minCss);
    const dir = path.join(DIST_DIR, item.slug);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'index.html'), workHtml);
  }

  // Sitemap + robots: list the index and every work URL for crawlers.
  const paths = ['', ...manifest.map((m) => workPath(m.slug))];
  await fs.writeFile(path.join(DIST_DIR, 'sitemap.xml'), renderSitemap(SITE.baseUrl, paths));
  await fs.writeFile(path.join(DIST_DIR, 'robots.txt'), renderRobots(SITE.baseUrl));

  // Bundle app.js (it imports routing.js) and minify into dist/.
  const appBundle = await esbuildBundle({
    entryPoints: [path.join(SRC_DIR, 'app.js')],
    bundle: true,
    format: 'esm',
    minify: true,
    write: false,
  });
  await fs.writeFile(path.join(DIST_DIR, 'app.js'), appBundle.outputFiles[0].text);

  console.log(`Built ${manifest.length} entries -> dist/`);
}

build().catch((err) => {
  console.error(`\nBuild failed: ${err.message}\n`);
  process.exit(1);
});
