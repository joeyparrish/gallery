// Thumbnail generation via sharp.

import sharp from 'sharp';

// Write a WebP thumbnail of `input` to `output`, fitting inside a
// `maxEdge`×`maxEdge` box without enlarging. Returns the ORIGINAL image's
// pixel dimensions, which the grid layout uses to compute aspect ratios.
export async function generateThumbnail(input, output, maxEdge = 900) {
  const image = sharp(input);
  const meta = await image.metadata();

  await image
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(output);

  return { width: meta.width, height: meta.height };
}
