import { pickMessages } from '@pd/api-core';
import { WowNews } from './wow/wow-news';

const MEDALS = {
  en: ['', 'Herald', 'Guardian', 'Crusader', 'Archon', 'Legend', 'Ancient', 'Divine', 'Immortal'],
  ru: ['', 'Рекрут', 'Страж', 'Рыцарь', 'Герой', 'Легенда', 'Властелин', 'Божество', 'Титан'],
};

/** Module notification texts; the language is picked by `user.locale`. */
const messages = {
  en: {
    title: '🎮 Games',
    dotaRank: (player: string, from: number, to: number) =>
      `${to > from ? '📈 Rank up' : '📉 Rank down'} in Dota 2 (${player}): ` +
      `${medal(from, MEDALS.en)} → ${medal(to, MEDALS.en)}`,
    wowAchievement: (character: string, achievement: string) =>
      `🏆 ${character} earned the achievement “${achievement}”`,
    wowNews: (character: string, news: WowNews) =>
      wowNewsLine(character, news, {
        mythic: 'Mythic+ rating',
        killed: 'bosses killed',
        pvp: 'PvP rating',
        collection: {
          mounts: 'new mounts',
          pets: 'new pets',
          toys: 'new toys',
          titles: 'new titles',
        },
        total: 'in total',
      }),
  },
  ru: {
    title: '🎮 Игры',
    dotaRank: (player: string, from: number, to: number) =>
      `${to > from ? '📈 Повышение' : '📉 Понижение'} в Dota 2 (${player}): ` +
      `${medal(from, MEDALS.ru)} → ${medal(to, MEDALS.ru)}`,
    wowAchievement: (character: string, achievement: string) =>
      `🏆 ${character} получил достижение «${achievement}»`,
    wowNews: (character: string, news: WowNews) =>
      wowNewsLine(character, news, {
        mythic: 'рейтинг Mythic+',
        killed: 'убито боссов',
        pvp: 'рейтинг PvP',
        collection: {
          mounts: 'новый транспорт',
          pets: 'новые питомцы',
          toys: 'новые игрушки',
          titles: 'новые звания',
        },
        total: 'всего',
      }),
  },
};

export function gamesMessages(locale: string) {
  return pickMessages(messages, locale);
}

/** rank_tier = medal × 10 + stars. */
function medal(rankTier: number, names: string[]): string {
  const name = names[Math.floor(rankTier / 10)] ?? '?';
  const stars = rankTier % 10;
  return stars ? `${name} ${stars}` : name;
}

interface WowNewsLabels {
  mythic: string;
  killed: string;
  pvp: string;
  collection: Record<'mounts' | 'pets' | 'toys' | 'titles', string>;
  total: string;
}

/** One line of a notification about a WoW character. */
function wowNewsLine(character: string, news: WowNews, t: WowNewsLabels): string {
  switch (news.kind) {
    case 'mythic':
      return `🗝️ ${character}: ${t.mythic} ${news.from} → ${news.to}`;
    case 'raid':
      return `⚔️ ${character}: ${news.raid} (${news.difficulty}) — ${t.killed} ${news.killed}/${news.total}`;
    case 'pvp':
      return `🛡️ ${character}: ${t.pvp} ${news.bracket} ${news.from} → ${news.to}`;
    case 'collection':
      return `🎁 ${character}: ${t.collection[news.what]} +${news.added} (${t.total} ${news.total})`;
  }
}
