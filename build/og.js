// Per-work social preview cards (og:image).
//
// Each card is the shared 1200x630 background (src/og-background.webp, the lit
// wall) with the work composited, fit and centered, on top. Nothing is cropped,
// so every work reads whole in a social unfurl. Output is JPEG, since scrapers
// don't reliably render WebP.

import sharp from 'sharp';

const CARD_W = 1200;
const CARD_H = 630;

// Report a background image's pixel dimensions, so the build can warn when the
// card background is not authored at the expected 1200x630.
export async function backgroundSize(bgPath) {
  const meta = await sharp(bgPath).metadata();
  return { width: meta.width, height: meta.height };
}

// The content box (in card pixels) a work of the given source dimensions should
// occupy: the work fit (aspect preserved, never enlarged) inside the card less a
// `minMargin` frame on every side. Pure, so it can be tested and inspected
// without rendering. A work touches the margin on its binding axis and leaves a
// wider margin on the other, so wide works sit shorter and tall works narrower.
export function contentBox({ width, height }, { minMargin }) {
  const maxW = CARD_W - 2 * minMargin;
  const maxH = CARD_H - 2 * minMargin;
  const scale = Math.min(maxW / width, maxH / height, 1);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// Composite `workPath` fit-centered onto `bgPath` and write a 1200x630 JPEG to
// `outPath`, sizing the work with contentBox() above. Returns the output size.
export async function renderOgCard(bgPath, workPath, outPath, { minMargin, quality }) {
  const meta = await sharp(workPath).metadata();
  const box = contentBox(meta, { minMargin });

  // Resize the work to fit the box (never enlarged past its source pixels).
  const work = await sharp(workPath)
    .resize({ width: box.width, height: box.height, fit: 'inside', withoutEnlargement: true })
    .toBuffer();

  // Cover-resize the background to exactly 1200x630 as a safety net, then lay the
  // work over its center.
  const info = await sharp(bgPath)
    .resize(CARD_W, CARD_H, { fit: 'cover' })
    .composite([{ input: work, gravity: 'center' }])
    .jpeg({ quality, mozjpeg: true })
    .toFile(outPath);

  return { width: info.width, height: info.height };
}
