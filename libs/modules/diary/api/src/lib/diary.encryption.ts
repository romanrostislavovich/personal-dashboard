import { Injectable, OnModuleInit } from '@nestjs/common';
import { EncryptExistingService } from '@pd/api-core';
import { countWords } from './diary-text';
import { diaryEntries, diaryPhotos, diarySettings } from './diary.schema';

/** The entries, photos and templates written before the diary was encrypted. */
@Injectable()
export class DiaryEncryption implements OnModuleInit {
  constructor(private readonly encryptExisting: EncryptExistingService) {}

  onModuleInit(): void {
    this.encryptExisting.register({
      table: diaryEntries,
      id: diaryEntries.id,
      columns: { content: diaryEntries.content },
      // Their words were counted by the database before; from now on on save.
      extra: (row) => ({ words: countWords(String(row['content'] ?? '')) }),
    });
    this.encryptExisting.register({
      table: diaryPhotos,
      id: diaryPhotos.id,
      columns: { caption: diaryPhotos.caption, data: diaryPhotos.data },
    });
    this.encryptExisting.register({
      table: diarySettings,
      id: diarySettings.userId,
      columns: { template: diarySettings.template },
    });
  }
}
