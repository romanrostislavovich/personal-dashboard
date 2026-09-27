import { pickMessages } from '@pd/api-core';

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
  },
  ru: {
    title: '🎮 Игры',
    dotaRank: (player: string, from: number, to: number) =>
      `${to > from ? '📈 Повышение' : '📉 Понижение'} в Dota 2 (${player}): ` +
      `${medal(from, MEDALS.ru)} → ${medal(to, MEDALS.ru)}`,
    wowAchievement: (character: string, achievement: string) =>
      `🏆 ${character} получил достижение «${achievement}»`,
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
