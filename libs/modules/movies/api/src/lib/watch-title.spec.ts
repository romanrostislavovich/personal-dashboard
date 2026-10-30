import {matchKey, watchTitle} from './watch-title';

describe('watchTitle', () => {
  it('reads a film of a pirate site out of its advertising', () => {
    expect(
      watchTitle('kinogo.biz', {
        pageTitle:
          'Дюна: Часть вторая (2024) смотреть онлайн бесплатно в хорошем качестве HD 720 — Kinogo',
      }),
    ).toEqual({
      kind: 'title',
      name: 'Дюна: Часть вторая',
      year: 2024,
      season: null,
      episode: null,
    });
    // As the owner's Chrome showed it on 2026-10-25.
    expect(
      watchTitle('kinogo.ec', {
        pageTitle:
          'Моана (2026) смотреть онлайн бесплатно в хорошем качестве HD',
      }),
    ).toEqual({
      kind: 'title',
      name: 'Моана',
      year: 2026,
      season: null,
      episode: null,
    });
    expect(
      watchTitle('kinogo.biz', {
        pageTitle: 'Kinogo',
        heading: 'Фильм Оппенгеймер (2023) смотреть онлайн',
      }),
    ).toEqual({
      kind: 'title',
      name: 'Оппенгеймер',
      year: 2023,
      season: null,
      episode: null,
    });
  });

  it('reads a season and an episode however a site writes them', () => {
    const show = (pageTitle: string) => watchTitle('lordfilm.org', {pageTitle});
    expect(
      show('Сериал Ведьмак 2 сезон 5 серия смотреть онлайн - LordFilm'),
    ).toMatchObject({
      name: 'Ведьмак',
      season: 2,
      episode: 5,
    });
    expect(show('Во все тяжкие (2008-2013) Сезон 3 Серия 7')).toMatchObject({
      name: 'Во все тяжкие',
      year: 2008,
      season: 3,
      episode: 7,
    });
    expect(show('Severance S02E04 watch online')).toMatchObject({
      name: 'Severance',
      season: 2,
      episode: 4,
    });
    expect(show('Сёгун 4 серия')).toMatchObject({
      name: 'Сёгун',
      season: null,
      episode: 4,
    });
  });

  it("takes Netflix's player title with its episode line", () => {
    expect(
      watchTitle('netflix.com', {
        pageTitle: 'Netflix',
        playerTitle: 'Stranger Things',
        playerSubtitle: 'S4:E7 The Massacre at Hawkins Lab',
      }),
    ).toEqual({
      kind: 'title',
      name: 'Stranger Things',
      year: null,
      season: 4,
      episode: 7,
    });
  });

  it('keeps a video a video, without the notifications and the site', () => {
    expect(
      watchTitle('youtube.com', {
        pageTitle: '(3) How Transformers Work - YouTube',
      }),
    ).toEqual({
      kind: 'video',
      name: 'How Transformers Work',
      year: null,
      season: null,
      episode: null,
    });
  });

  it('finds nothing in a page that names only its site', () => {
    expect(watchTitle('netflix.com', {pageTitle: 'Netflix'})).toBeNull();
    expect(watchTitle('example.com', {})).toBeNull();
  });
});

describe('matchKey', () => {
  it('compares titles without case, punctuation and ё', () => {
    expect(matchKey('Сёгун: Часть 1!')).toBe(matchKey('сегун часть 1'));
  });
});
