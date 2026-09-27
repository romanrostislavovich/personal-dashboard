const MEDALS_RU = [
  '',
  'Рекрут',
  'Страж',
  'Рыцарь',
  'Герой',
  'Легенда',
  'Властелин',
  'Божество',
  'Титан',
];

/** Тексты уведомлений модуля; язык выбирается по `user.locale`. */
const messages = {
  ru: {
    title: '🎮 Игры',
    dotaRank: (player: string, from: number, to: number) => {
      const direction = to > from ? '📈 Повышение' : '📉 Понижение';
      return `${direction} в Dota 2 (${player}): ${medal(from)} → ${medal(to)}`;
    },
    wowAchievement: (character: string, achievement: string) =>
      `🏆 ${character} получил достижение «${achievement}»`,
  },
};

export function gamesMessages(locale: string) {
  return messages[locale as keyof typeof messages] ?? messages.ru;
}

function medal(rankTier: number): string {
  const name = MEDALS_RU[Math.floor(rankTier / 10)] ?? '?';
  const stars = rankTier % 10;
  return stars ? `${name} ${stars}` : name;
}
