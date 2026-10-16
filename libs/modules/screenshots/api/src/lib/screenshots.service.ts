import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DB, Database } from '@pd/api-core';
import {
  nextFreeName,
  Screenshot,
  SCREENSHOT_MAX_BYTES,
  screenshotNameSchema,
} from '@pd/contracts';
import { and, desc, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { ScreenshotRow, screenshots } from './screenshots.schema';

/** The pictures a folder may hold. */
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
/** The small picture of the lists. */
const THUMBNAIL_WIDTH = 360;

/** Everything except the files — lists stay light. */
const info = {
  id: screenshots.id,
  name: screenshots.name,
  mimeType: screenshots.mimeType,
  size: screenshots.size,
  width: screenshots.width,
  height: screenshots.height,
  hash: screenshots.hash,
  createdAt: screenshots.createdAt,
  updatedAt: screenshots.updatedAt,
};

export interface ScreenshotFile {
  data: Buffer;
  mimeType: string;
}

/** The screenshots of a user: the server's copy of the folders of their computers. */
@Injectable()
export class ScreenshotsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(userId: string): Promise<Screenshot[]> {
    const rows = await this.db
      .select(info)
      .from(screenshots)
      .where(eq(screenshots.userId, userId))
      .orderBy(desc(screenshots.createdAt));
    return rows.map(toScreenshot);
  }

  /** A new one; a name taken already gets a free one (`name (2).png`), told in the answer. */
  async add(userId: string, name: string, file: ScreenshotFile): Promise<Screenshot> {
    const wanted = checkedName(name);
    const facts = await describe(file);
    const taken = new Set(
      (
        await this.db
          .select({ name: screenshots.name })
          .from(screenshots)
          .where(eq(screenshots.userId, userId))
      ).map((row) => row.name),
    );
    const [row] = await this.db
      .insert(screenshots)
      .values({ userId, name: nextFreeName(wanted, (one) => taken.has(one)), ...facts })
      .returning(info);
    return toScreenshot(row);
  }

  /** The file changed in a folder (drawn on again): the same screenshot, a new picture. */
  async replace(userId: string, id: string, file: ScreenshotFile): Promise<Screenshot> {
    const facts = await describe(file);
    const [row] = await this.db
      .update(screenshots)
      .set({ ...facts, updatedAt: new Date() })
      .where(and(eq(screenshots.id, id), eq(screenshots.userId, userId)))
      .returning(info);
    if (!row) {
      throw new NotFoundException();
    }
    return toScreenshot(row);
  }

  async file(userId: string, id: string, thumbnail = false): Promise<ScreenshotFile> {
    const [row] = await this.db
      .select({
        data: screenshots.data,
        thumbnail: screenshots.thumbnail,
        mimeType: screenshots.mimeType,
      })
      .from(screenshots)
      .where(and(eq(screenshots.id, id), eq(screenshots.userId, userId)));
    if (!row) {
      throw new NotFoundException();
    }
    return thumbnail && row.thumbnail
      ? { data: row.thumbnail, mimeType: 'image/webp' }
      : { data: row.data, mimeType: row.mimeType };
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.db
      .delete(screenshots)
      .where(and(eq(screenshots.id, id), eq(screenshots.userId, userId)));
  }
}

function checkedName(name: string): string {
  const parsed = screenshotNameSchema.safeParse(name);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.issues[0]?.message ?? 'A bad name');
  }
  return parsed.data;
}

/** What is kept of a file: itself as it is, its hash, its size and a small picture. */
async function describe(file: ScreenshotFile) {
  if (!TYPES.includes(file.mimeType)) {
    throw new BadRequestException(`Unsupported image type: ${file.mimeType}`);
  }
  if (file.data.length > SCREENSHOT_MAX_BYTES) {
    throw new BadRequestException('The image is too large');
  }
  const image = sharp(file.data, { failOn: 'error' });
  const metadata = await image.metadata().catch(() => {
    throw new BadRequestException('Not a picture');
  });
  const thumbnail = await image
    .clone()
    .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer()
    .catch(() => null);
  return {
    mimeType: file.mimeType,
    size: file.data.length,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    hash: createHash('sha256').update(file.data).digest('hex'),
    data: file.data,
    thumbnail,
  };
}

function toScreenshot(row: Omit<ScreenshotRow, 'userId' | 'data' | 'thumbnail'>): Screenshot {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
