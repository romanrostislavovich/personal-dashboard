/**
 * Инструмент, через который AI получает данные модуля. Модуль регистрирует
 * инструменты в `onModuleInit` (файл `<модуль>.ai-tools.ts`):
 *
 * ```ts
 * ai.registerTool({
 *   name: 'diary_get_entries',
 *   module: 'diary',
 *   description: 'Записи дневника за период',
 *   parameters: { type: 'object', properties: { from: { type: 'string' } }, required: ['from'] },
 *   handler: (userId, args) => this.diary.list(userId, args),
 * });
 * ```
 *
 * Модель сама решает, какие инструменты вызвать, чтобы ответить на вопрос.
 */
export interface AiTool {
  /** Только латиница, цифры, `_` и `-`; с префиксом модуля. */
  name: string;
  /** id модуля — для подписи «посмотрел: дневник, финансы». */
  module: string;
  /** Описание для модели: что возвращает и когда полезно. */
  description: string;
  /** JSON Schema аргументов. */
  parameters: Record<string, unknown>;
  handler: (userId: string, args: Record<string, unknown>) => Promise<unknown>;
}

/** JSON Schema для инструмента без аргументов. */
export const NO_PARAMETERS = { type: 'object', properties: {} } as const;

/** Частый случай: период `from`–`to` в формате YYYY-MM-DD. */
export const PERIOD_PARAMETERS = {
  type: 'object',
  properties: {
    from: { type: 'string', description: 'Начало периода, YYYY-MM-DD' },
    to: { type: 'string', description: 'Конец периода включительно, YYYY-MM-DD' },
  },
  required: ['from', 'to'],
} as const;
