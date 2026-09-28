import { Injectable, OnModuleInit } from '@nestjs/common';
import { AchievementsService, achievementTiers, AchievementTierTuple } from '@pd/api-core';
import { MusicHistoryStats, MusicHistoryStatsService } from './music-history.stats';

/**
 * Music achievements, all measured over the stored play history (`music_scrobbles`).
 *
 * Tiers added on top of an existing metric get an explicit rarity, and so do the tiers that were
 * there before: rarity follows the position from the top, so a new top tier would otherwise
 * demote achievements (and XP) the user already has.
 */
@Injectable()
export class MusicAchievements implements OnModuleInit {
  constructor(
    private readonly achievements: AchievementsService,
    private readonly history: MusicHistoryStatsService,
  ) {}

  onModuleInit(): void {
    this.registerVolume();
    this.registerVariety();
    this.registerHabit();
    this.registerFavourites();
  }

  /** How much is played: in total and in one day. */
  private registerVolume(): void {
    // Ids of existing metrics stay the same, so unlocked achievements are kept.
    this.metric('music.scrobbles', 'plays', [
      [1_000, '🎧', { en: 'Music lover', ru: 'Меломан' }, plays('1,000', '1 000'), 'common'],
      [
        10_000,
        '🎶',
        { en: 'Ten thousand tracks', ru: 'Десять тысяч треков' },
        plays('10,000', '10 000'),
        'rare',
      ],
      [50_000, '💿', { en: 'Collector', ru: 'Коллекционер' }, plays('50,000', '50 000'), 'epic'],
      [
        100_000,
        '🏆',
        { en: 'A hundred thousand', ru: 'Сто тысяч' },
        plays('100,000', '100 000'),
        'legendary',
      ],
      [
        250_000,
        '🌠',
        { en: 'Quarter of a million', ru: 'Четверть миллиона' },
        plays('250,000', '250 000'),
        'legendary',
      ],
      [
        500_000,
        '🪐',
        { en: 'Half a million', ru: 'Полмиллиона' },
        plays('500,000', '500 000'),
        'legendary',
      ],
    ]);
    this.metric('music.plays-in-day', 'maxPlaysInDay', [
      [
        50,
        '🎵',
        { en: 'Music day', ru: 'Музыкальный день' },
        { en: '50 tracks in a single day', ru: '50 треков за один день' },
        'rare',
      ],
      [
        100,
        '🔊',
        { en: 'Marathon', ru: 'Марафон' },
        { en: '100 tracks in a single day', ru: '100 треков за один день' },
        'epic',
      ],
      [
        200,
        '📻',
        { en: 'Non-stop', ru: 'Без остановки' },
        { en: '200 tracks in a single day', ru: '200 треков за один день' },
        'epic',
      ],
      [
        300,
        '🔥',
        { en: "Can't stop the music", ru: 'Музыку не остановить' },
        { en: '300 tracks in a single day', ru: '300 треков за один день' },
        'legendary',
      ],
    ]);
    this.metric('music.night-plays', 'nightPlays', [
      [
        100,
        '🦉',
        { en: 'Night owl', ru: 'Сова' },
        { en: '100 tracks between midnight and 5 am', ru: '100 треков с полуночи до 5 утра' },
      ],
      [
        1_000,
        '🌙',
        { en: 'Nocturne', ru: 'Ноктюрн' },
        { en: '1,000 tracks between midnight and 5 am', ru: '1 000 треков с полуночи до 5 утра' },
      ],
      [
        5_000,
        '📡',
        { en: 'Midnight radio', ru: 'Полуночное радио' },
        { en: '5,000 tracks between midnight and 5 am', ru: '5 000 треков с полуночи до 5 утра' },
      ],
    ]);
  }

  /** Different artists, tracks and albums. */
  private registerVariety(): void {
    this.metric('music.artists', 'artists', [
      [
        100,
        '🎤',
        { en: 'Explorer', ru: 'Исследователь' },
        { en: '100 different artists', ru: '100 разных исполнителей' },
        'common',
      ],
      [
        500,
        '🗺️',
        { en: 'Globetrotter', ru: 'Путешественник' },
        { en: '500 different artists', ru: '500 разных исполнителей' },
        'rare',
      ],
      [
        2_000,
        '🌌',
        { en: 'Music universe', ru: 'Музыкальная вселенная' },
        { en: '2,000 different artists', ru: '2 000 разных исполнителей' },
        'epic',
      ],
      [
        5_000,
        '📚',
        { en: 'Music encyclopedia', ru: 'Музыкальная энциклопедия' },
        { en: '5,000 different artists', ru: '5 000 разных исполнителей' },
        'legendary',
      ],
    ]);
    this.metric('music.tracks', 'tracks', [
      [
        1_000,
        '📀',
        { en: 'Playlist', ru: 'Плейлист' },
        { en: '1,000 different tracks', ru: '1 000 разных треков' },
      ],
      [
        5_000,
        '🗃️',
        { en: 'Music library', ru: 'Фонотека' },
        { en: '5,000 different tracks', ru: '5 000 разных треков' },
      ],
      [
        20_000,
        '♾️',
        { en: 'Endless playlist', ru: 'Бесконечный плейлист' },
        { en: '20,000 different tracks', ru: '20 000 разных треков' },
      ],
    ]);
    this.metric('music.albums', 'albums', [
      [
        100,
        '💽',
        { en: 'Album listener', ru: 'Слушатель альбомов' },
        { en: '100 different albums', ru: '100 разных альбомов' },
      ],
      [
        500,
        '🎚️',
        { en: 'Record shelf', ru: 'Полка с пластинками' },
        { en: '500 different albums', ru: '500 разных альбомов' },
      ],
      [
        2_000,
        '🏛️',
        { en: 'Vinyl vault', ru: 'Хранилище винила' },
        { en: '2,000 different albums', ru: '2 000 разных альбомов' },
      ],
    ]);
  }

  /** Music as a habit: days with music, streaks and years. */
  private registerHabit(): void {
    this.metric('music.listening-days', 'listeningDays', [
      [
        30,
        '📅',
        { en: 'Daily soundtrack', ru: 'Саундтрек каждого дня' },
        { en: 'Music on 30 different days', ru: 'Музыка в 30 разных дней' },
        'rare',
      ],
      [
        365,
        '🎧',
        { en: 'Year of music', ru: 'Год с музыкой' },
        { en: 'Music on 365 different days', ru: 'Музыка в 365 разных дней' },
        'epic',
      ],
      [
        1_000,
        '🗓️',
        { en: 'A thousand days of music', ru: 'Тысяча дней с музыкой' },
        { en: 'Music on 1,000 different days', ru: 'Музыка в 1 000 разных дней' },
        'epic',
      ],
      [
        3_650,
        '🏅',
        { en: 'Decade of music', ru: 'Десятилетие с музыкой' },
        { en: 'Music on 3,650 different days', ru: 'Музыка в 3 650 разных дней' },
        'legendary',
      ],
    ]);
    this.metric('music.listening-streak', 'longestStreak', [
      [
        7,
        '🔁',
        { en: 'A week of music', ru: 'Неделя с музыкой' },
        { en: 'Music 7 days in a row', ru: 'Музыка 7 дней подряд' },
      ],
      [
        30,
        '🎼',
        { en: 'A month without silence', ru: 'Месяц без тишины' },
        { en: 'Music 30 days in a row', ru: 'Музыка 30 дней подряд' },
      ],
      [
        100,
        '💯',
        { en: 'A hundred days of sound', ru: 'Сто дней звука' },
        { en: 'Music 100 days in a row', ru: 'Музыка 100 дней подряд' },
      ],
      [
        365,
        '🌍',
        { en: 'A year without silence', ru: 'Год без тишины' },
        { en: 'Music 365 days in a row', ru: 'Музыка 365 дней подряд' },
      ],
    ]);
    this.metric('music.years', 'yearsSinceFirstPlay', [
      [
        1,
        '🎂',
        { en: 'Anniversary', ru: 'Годовщина' },
        { en: 'A year since the first play', ru: 'Год с первого прослушивания' },
      ],
      [
        5,
        '🎸',
        { en: 'Five years on air', ru: 'Пять лет в эфире' },
        { en: '5 years since the first play', ru: '5 лет с первого прослушивания' },
      ],
      [
        10,
        '🎻',
        { en: 'Ten years on air', ru: 'Десять лет в эфире' },
        { en: '10 years since the first play', ru: '10 лет с первого прослушивания' },
      ],
      [
        15,
        '👑',
        { en: 'Music veteran', ru: 'Ветеран музыки' },
        { en: '15 years since the first play', ru: '15 лет с первого прослушивания' },
      ],
    ]);
  }

  /** Coming back to the same music. */
  private registerFavourites(): void {
    this.metric('music.artist-plays', 'maxArtistPlays', [
      [
        500,
        '⭐',
        { en: 'Fan', ru: 'Фанат' },
        { en: '500 plays of one artist', ru: '500 прослушиваний одного исполнителя' },
      ],
      [
        2_000,
        '🌟',
        { en: 'Superfan', ru: 'Суперфанат' },
        { en: '2,000 plays of one artist', ru: '2 000 прослушиваний одного исполнителя' },
      ],
      [
        5_000,
        '💖',
        { en: 'Devotee', ru: 'Преданный слушатель' },
        { en: '5,000 plays of one artist', ru: '5 000 прослушиваний одного исполнителя' },
      ],
    ]);
    this.metric('music.track-plays', 'maxTrackPlays', [
      [
        50,
        '🔂',
        { en: 'On repeat', ru: 'На повторе' },
        { en: 'One track played 50 times', ru: 'Один трек 50 раз' },
      ],
      [
        200,
        '🐛',
        { en: 'Earworm', ru: 'Навязчивая мелодия' },
        { en: 'One track played 200 times', ru: 'Один трек 200 раз' },
      ],
      [
        500,
        '🎺',
        { en: 'Anthem of my life', ru: 'Гимн моей жизни' },
        { en: 'One track played 500 times', ru: 'Один трек 500 раз' },
      ],
    ]);
  }

  private metric(id: string, field: keyof MusicHistoryStats, tiers: AchievementTierTuple[]): void {
    this.achievements.register({
      id,
      module: 'music',
      measure: async (userId) => (await this.history.stats(userId))[field],
      tiers: achievementTiers(...tiers),
    });
  }
}

function plays(en: string, ru: string) {
  return { en: `${en} plays`, ru: `${ru} прослушиваний` };
}
