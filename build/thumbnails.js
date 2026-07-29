// WebP rendering via sharp.

import sharp from 'sharp';

// Write a WebP copy of `input` to `output`, fitting inside a `maxEdge`×`maxEdge`
// box without enlarging. Returns the ORIGINAL image's pixel dimensions, which
// the grid layout uses to compute aspect ratios.
export async function renderWebp(input, output, { maxEdge, quality }) {
  const image = sharp(input);
  const meta = await image.metadata();

  await image
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toFile(output);

  return { width: meta.width, height: meta.height };
}
