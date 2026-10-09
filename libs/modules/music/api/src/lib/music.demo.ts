import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, DemoService } from '@pd/api-core';
import { musicSettings, scrobbles } from './music.schema';

const MINUTE_MS = 60_000;
const PLAYS = 900;
const INSERT_CHUNK = 500;
/** Artist, track, album. */
const TRACKS: [string, string, string][] = [
  ['Bonobo', 'Kerala', 'Migration'],
  ['Tycho', 'Awake', 'Awake'],
  ['Khruangbin', 'Maria También', 'Con Todo el Mundo'],
  ['Bonobo', 'Cirrus', 'The North Borders'],
  ['Nils Frahm', 'Says', 'Spaces'],
  ['Tycho', 'A Walk', 'Dive'],
  ['Massive Attack', 'Teardrop', 'Mezzanine'],
  ['Bonobo', 'Kong', 'Black Sands'],
];

/**
 * The demo data of Music: a month of plays, as if the Last.fm history was imported. Nothing
 * is connected: the sync does not run on a demo.
 */
@Injectable()
export class MusicDemo implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly demo: DemoService,
  ) {}

  onModuleInit(): void {
    this.demo.register({
      module: 'music',
      seed: async ({ userId }) => {
        const now = Date.now();
        await this.db.insert(musicSettings).values({
          userId,
          lastfmUsername: 'alex-demo',
          lastSyncedAt: new Date(now),
          historyImportedAt: new Date(now),
        });
        // A play every 47 minutes, the tracks in turn with a skip, so some are heard more.
        const plays = Array.from({ length: PLAYS }, (_, index) => {
          const [artist, track, album] = TRACKS[(index + Math.floor(index / 5)) % TRACKS.length];
          return {
            userId,
            playedAt: new Date(now - (index * 47 + 6) * MINUTE_MS),
            artist,
            track,
            album,
          };
        });
        for (let i = 0; i < plays.length; i += INSERT_CHUNK) {
          await this.db.insert(scrobbles).values(plays.slice(i, i + INSERT_CHUNK));
        }
      },
    });
  }
}
