import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { relFromRoot } from './storage';

// =============================================================================
// Image service — the single home for cover-image processing (sharp/libvips).
// Every uploaded cover, whatever the source format (JPEG/PNG/WebP/GIF and HEIC/
// HEIF straight off an iPhone), is decoded, EXIF-rotated upright, and written as
// two normalized WebP files: a display cover and a small square thumbnail. This
// gives us one predictable on-disk shape and keeps browsers from having to deal
// with HEIC (which most can't render).
// =============================================================================

// Formats sharp/libvips can decode here. HEIC/HEIF are included — the prebuilt
// libvips ships libheif — so iPhone photos upload without a manual conversion.
export const SUPPORTED_COVER_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.tif', '.tiff', '.avif', '.heic', '.heif',
]);

const FULL_MAX = Number(process.env.COVER_MAX_PX || 1600); // longest edge of the display cover
const THUMB_PX = Number(process.env.COVER_THUMB_PX || 500); // square thumbnail edge
const WEBP_QUALITY = Number(process.env.COVER_WEBP_QUALITY || 82);

export interface ProcessedCover {
  coverRel: string; // storage-relative path to the display cover (.webp)
  thumbRel: string; // storage-relative path to the square thumbnail (.webp)
  width: number;
  height: number;
}

/** Remove any older cover files (from before normalization, or other formats). */
function cleanupOldCovers(outDir: string, keep: Set<string>): void {
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(outDir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (/^cover(_thumb)?\./i.test(name) && !keep.has(name)) {
      try {
        fs.unlinkSync(path.join(outDir, name));
      } catch {
        /* best effort */
      }
    }
  }
}

/**
 * Decode `inputAbs`, orient it upright, and write `cover.webp` (display) and
 * `cover_thumb.webp` (square) into `outDir`. Returns storage-relative paths.
 * Throws if the file isn't a decodable image.
 */
export async function processCover(inputAbs: string, outDir: string): Promise<ProcessedCover> {
  fs.mkdirSync(outDir, { recursive: true });

  // Validate + read dimensions up front; a non-image throws here (caught by caller).
  const base = sharp(inputAbs, { failOn: 'error' }).rotate(); // rotate() honours EXIF orientation
  const meta = await base.metadata();
  if (!meta.width || !meta.height) throw new Error('unreadable image');

  const coverAbs = path.join(outDir, 'cover.webp');
  const thumbAbs = path.join(outDir, 'cover_thumb.webp');

  // Display cover: fit within FULL_MAX (never upscale), normalized to WebP.
  const info = await sharp(inputAbs, { failOn: 'error' })
    .rotate()
    .resize({ width: FULL_MAX, height: FULL_MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toFile(coverAbs);

  // Thumbnail: square, center-cropped, for admin list/editor previews.
  await sharp(inputAbs, { failOn: 'error' })
    .rotate()
    .resize({ width: THUMB_PX, height: THUMB_PX, fit: 'cover', position: 'attention' })
    .webp({ quality: 80 })
    .toFile(thumbAbs);

  cleanupOldCovers(outDir, new Set(['cover.webp', 'cover_thumb.webp']));

  return {
    coverRel: relFromRoot(coverAbs),
    thumbRel: relFromRoot(thumbAbs),
    width: info.width,
    height: info.height,
  };
}
