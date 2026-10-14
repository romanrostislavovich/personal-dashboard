import { Logger } from '@nestjs/common';
import sharp from 'sharp';

/** The longest side kept: a phone photo is 4000–8000 px, a page stays readable at this. */
const MAX_SIDE = 2560;
/** WebP quality: text of a document and a receipt stay sharp, a photo looks the same. */
const QUALITY = 82;
/** Pictures it takes; a PDF and anything else are kept as they came. */
const COMPRESSIBLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

const logger = new Logger('CompressImage');

export interface StoredFile {
  data: Buffer;
  mimeType: string;
}

/**
 * A picture made small before it is stored (and encrypted): turned upright by its EXIF,
 * shrunk to MAX_SIDE, its metadata — the place it was taken, the phone — dropped, and kept as
 * WebP. A phone photo of 4–8 MB becomes a few hundred KB, so years of receipts, diary photos
 * and medical scans do not swell the database and the copies of it.
 *
 * Every picture it can read is stored this way, even the odd one that comes out a little larger
 * than it was: the place and the phone must not stay in it. The original stays only when it is
 * not a picture this takes (a PDF) or cannot be read.
 */
export async function compressImage(file: StoredFile): Promise<StoredFile> {
  if (!COMPRESSIBLE.has(file.mimeType)) {
    return file;
  }
  try {
    const data = await sharp(file.data, { failOn: 'error' })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer();
    return { data, mimeType: 'image/webp' };
  } catch (error) {
    logger.warn(`A picture was kept as it came: ${error}`);
    return file;
  }
}
