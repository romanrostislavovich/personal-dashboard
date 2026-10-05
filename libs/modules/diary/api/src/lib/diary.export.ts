import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataExportService, ReadableFile } from '@pd/api-core';
import { DiaryService } from './diary.service';

/** The diary in an archive of one's data: a Markdown file a day, as it is written. */
@Injectable()
export class DiaryExport implements OnModuleInit {
  constructor(
    private readonly diary: DiaryService,
    private readonly exporter: DataExportService,
  ) {}

  onModuleInit(): void {
    this.exporter.register({ module: 'diary', files: (userId) => this.files(userId) });
  }

  private async *files(userId: string): AsyncGenerator<ReadableFile> {
    const entries = await this.diary.list(userId, { from: '0001-01-01', to: '9999-12-31' });
    for (const entry of entries) {
      // Mood and tags go on top the way note apps keep them (front matter).
      const head = [
        '---',
        `date: ${entry.day}`,
        ...(entry.mood === null ? [] : [`mood: ${entry.mood}`]),
        ...(entry.tags.length ? [`tags: [${entry.tags.join(', ')}]`] : []),
        '---',
      ];
      yield { path: `${entry.day}.md`, content: `${head.join('\n')}\n\n${entry.content}\n` };
    }
  }
}
