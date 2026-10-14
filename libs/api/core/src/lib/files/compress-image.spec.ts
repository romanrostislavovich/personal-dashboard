import sharp from 'sharp';
import { compressImage } from './compress-image';

/** A noisy picture (a photo compresses badly; a flat colour would be too easy). */
async function photo(width: number, height: number, format: 'jpeg' | 'png'): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = (i * 2654435761) % 251;
  }
  const image = sharp(pixels, { raw: { width, height, channels: 3 } });
  return (format === 'jpeg' ? image.jpeg({ quality: 95 }) : image.png()).toBuffer();
}

describe('compressImage', () => {
  it('shrinks a large photo to WebP within the longest side', async () => {
    const original = await photo(4000, 3000, 'jpeg');
    const result = await compressImage({ data: original, mimeType: 'image/jpeg' });
    expect(result.mimeType).toBe('image/webp');
    expect(result.data.length).toBeLessThan(original.length);
    const { width, height } = await sharp(result.data).metadata();
    expect([width, height]).toEqual([2560, 1920]);
  });

  it('drops the metadata: where the photo was taken does not go into the database', async () => {
    const withExif = await sharp(await photo(800, 600, 'jpeg'))
      .withExif({ IFD0: { Make: 'PhoneMaker', Model: 'Phone 1' } })
      .jpeg()
      .toBuffer();
    const result = await compressImage({ data: withExif, mimeType: 'image/jpeg' });
    expect((await sharp(result.data).metadata()).exif).toBeUndefined();
  });

  it('keeps only what it does not take or cannot read', async () => {
    const pdf = { data: Buffer.from('%PDF-1.4'), mimeType: 'application/pdf' };
    expect(await compressImage(pdf)).toBe(pdf);
    const broken = { data: Buffer.from('not a picture'), mimeType: 'image/jpeg' };
    expect(await compressImage(broken)).toBe(broken);
  });
});
