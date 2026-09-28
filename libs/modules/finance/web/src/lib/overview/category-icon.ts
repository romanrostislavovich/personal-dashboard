/**
 * An icon for a category the user typed freely ("Кафе", "Hosting"…). Keywords in English and
 * Russian; word stems so that "Продукты" and "продуктовый" both match. The first match wins.
 */
const CATEGORY_ICONS: [RegExp, string][] = [
  // `\b` knows only Latin letters, so short Russian words are matched as the whole category.
  [/salary|зарплат|^зп$|payroll|бонус|bonus|аванс/i, 'payments'],
  [/freelance|фриланс|invoice|клиент|client|заказ/i, 'work'],
  [/cashback|кешбэк|кэшбэк|refund|возврат/i, 'currency_exchange'],
  [/interest|процент|dividend|дивиденд|invest|инвест|deposit|вклад/i, 'savings'],
  [/grocer|продукт|супермаркет|food|еда|market|магазин/i, 'shopping_cart'],
  [
    /cafe|кафе|coffee|кофе|restaurant|ресторан|lunch|обед|bar\b|^бар$|delivery|доставк/i,
    'restaurant',
  ],
  [/taxi|такси|uber|bolt|yandex go/i, 'local_taxi'],
  [/fuel|бензин|топлив|petrol|gas station|азс/i, 'local_gas_station'],
  [
    /transport|транспорт|metro|метро|bus|автобус|train|поезд|проезд|parking|парковк/i,
    'directions_bus',
  ],
  [/car\b|авто|машин|repair|ремонт/i, 'directions_car'],
  [/hosting|хостинг|server|сервер|domain|домен|cloud|hetzner|vps/i, 'dns'],
  [/\bai\b|deepseek|openai|chatgpt|claude|llm/i, 'smart_toy'],
  [/subscri|подписк|spotify|netflix|youtube|apple|google one|icloud/i, 'subscriptions'],
  [/rent|аренд|квартир|mortgage|ипотек|housing|жиль/i, 'home'],
  [/utilit|коммунал|жкх|electric|электр|water|вода|heating|отоплен/i, 'bolt'],
  [/internet|интернет|phone|телефон|mobile|связь|сотов/i, 'wifi'],
  [/health|здоров|pharm|аптек|doctor|врач|medic|медиц|dent|стомат/i, 'medical_services'],
  [/sport|спорт|gym|фитнес|fitness|бассейн|pool/i, 'fitness_center'],
  [/cloth|одежд|обув|shoes|fashion/i, 'checkroom'],
  [/shop|покупк|marketplace|маркетплейс|ozon|wildberries|amazon|aliexpress/i, 'shopping_bag'],
  [/travel|путешеств|отпуск|vacation|hotel|отел|flight|авиа|билет|ticket/i, 'flight'],
  [/educat|обучен|образован|course|курс|book|книг|school|школ/i, 'school'],
  [/gift|подар|charity|благотвор|donat|донат/i, 'redeem'],
  [/entertain|развлеч|cinema|кино|game|игр|concert|концерт|hobby|хобби/i, 'sports_esports'],
  [/kid|child|дет|ребен|ребён/i, 'child_care'],
  [/pet|питом|собак|кошк|вет/i, 'pets'],
  [/cigarette|tobacco|vape|сигарет|табак|вейп/i, 'smoking_rooms'],
  [/alcohol|алкогол|beer|пиво|wine|вино/i, 'liquor'],
  [/beauty|красот|салон|barber|парикмах/i, 'content_cut'],
  [/cash|наличн|atm|банкомат/i, 'local_atm'],
  [/tax|налог|fee|комисси|fine|штраф|bank|банк/i, 'account_balance'],
  [/transfer|перевод/i, 'swap_horiz'],
];

export function categoryIcon(category: string | null, kind: 'income' | 'expense'): string {
  if (category) {
    const match = CATEGORY_ICONS.find(([pattern]) => pattern.test(category));
    if (match) {
      return match[1];
    }
  }
  return kind === 'income' ? 'savings' : 'sell';
}
