import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DB, Database } from '@pd/api-core';
import { DIARY_PHOTO_MAX_BYTES, DIARY_PHOTO_TYPES, DiaryPhoto, LocalDate } from '@pd/contracts';
import { and, asc, count, eq } from 'drizzle-orm';
import { diaryPhotos } from './diary.schema';

export interface PhotoUpload {
  data: Buffer;
  mimeType: string;
  caption?: string | null;
}

/** Everything except the binary data — lists stay light. */
const photoInfo = {
  id: diaryPhotos.id,
  day: diaryPhotos.day,
  mimeType: diaryPhotos.mimeType,
  size: diaryPhotos.size,
  caption: diaryPhotos.caption,
  createdAt: diaryPhotos.createdAt,
};

/** Photos of diary days, stored in PostgreSQL. */
@Injectable()
export class DiaryPhotosService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(userId: string, day: LocalDate): Promise<DiaryPhoto[]> {
    const rows = await this.db
      .select(photoInfo)
      .from(diaryPhotos)
      .where(and(eq(diaryPhotos.userId, userId), eq(diaryPhotos.day, day)))
      .orderBy(asc(diaryPhotos.createdAt));
    return rows.map((row) => ({
      id: row.id,
      day: row.day,
      mimeType: row.mimeType,
      size: row.size,
      caption: row.caption,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async add(userId: string, day: LocalDate, photo: PhotoUpload): Promise<DiaryPhoto> {
    if (!DIARY_PHOTO_TYPES.includes(photo.mimeType)) {
      throw new BadRequestException(`Unsupported image type: ${photo.mimeType}`);
    }
    if (photo.data.length > DIARY_PHOTO_MAX_BYTES) {
      throw new BadRequestException('The image is too large');
    }
    const [row] = await this.db
      .insert(diaryPhotos)
      .values({
        userId,
        day,
        mimeType: photo.mimeType,
        size: photo.data.length,
        caption: photo.caption?.trim() || null,
        data: photo.data,
      })
      .returning(photoInfo);
    return { ...row, createdAt: row.createdAt.toISOString() };
  }

  async file(userId: string, id: string): Promise<{ data: Buffer; mimeType: string }> {
    const [row] = await this.db
      .select({ data: diaryPhotos.data, mimeType: diaryPhotos.mimeType })
      .from(diaryPhotos)
      .where(and(eq(diaryPhotos.id, id), eq(diaryPhotos.userId, userId)));
    if (!row) {
      throw new NotFoundException();
    }
    return row;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.db
      .delete(diaryPhotos)
      .where(and(eq(diaryPhotos.id, id), eq(diaryPhotos.userId, userId)));
  }

  async count(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(diaryPhotos)
      .where(eq(diaryPhotos.userId, userId));
    return row?.value ?? 0;
  }
}
