import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, DemoService } from '@pd/api-core';
import { diaryEntries } from './diary.schema';

const ENTRIES = [
  'Ran 8 km before work, the river was foggy. #running',
  'Shipped the new checkout of the shop. Tired but happy. #work',
  'Slow day. Read half a book and went to bed early.',
  'Dinner with Mia and Tom, talked until midnight. #friends',
  'Fixed the bug that ate my week. It was a rounding error, of course. #work',
  'Rain all day, did nothing useful and felt bad about it.',
  'Long walk, a new tea for the shop arrived. #tea',
];
/** A week of moods that repeats: mostly good, one bad day. */
const MOODS = [5, 4, 3, 5, 4, 2, 4];
const DAYS = 40;

/** The demo data of the diary: forty days in a row, each with a mood. */
@Injectable()
export class DiaryDemo implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly demo: DemoService,
  ) {}

  onModuleInit(): void {
    this.demo.register({
      module: 'diary',
      seed: async ({ userId, daysAgo }) => {
        await this.db.insert(diaryEntries).values(
          Array.from({ length: DAYS }, (_, index) => {
            const content = ENTRIES[index % ENTRIES.length];
            return {
              userId,
              day: daysAgo(index),
              content,
              mood: MOODS[index % MOODS.length],
              tags: [...content.matchAll(/#([\p{L}\d_-]+)/gu)].map((match) => match[1]),
            };
          }),
        );
      },
    });
  }
}
