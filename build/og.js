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

// Composite `workPath` fit-centered onto `bgPath` and write a 1200x630 JPEG to
// `outPath`. `inset` is the fraction of the card the work may occupy (the rest
// is visible wall); tune it to taste. Returns the output dimensions.
export async function renderOgCard(bgPath, workPath, outPath, { inset, quality }) {
  const boxW = Math.round(CARD_W * inset);
  const boxH = Math.round(CARD_H * inset);

  // Resize the work to fit within the centered content box (never enlarged).
  const work = await sharp(workPath)
    .resize({ width: boxW, height: boxH, fit: 'inside', withoutEnlargement: true })
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
