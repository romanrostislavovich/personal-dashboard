import { inject, Injectable, provideAppInitializer } from '@angular/core';
import {
  provideTransloco,
  Translation,
  TranslocoLoader,
  TranslocoService,
} from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { DASHBOARD_MODULES } from '../dashboard-module';

export const DEFAULT_LANG = 'ru';
export const AVAILABLE_LANGS = ['ru'];

const coreTranslations: Record<string, () => Promise<{ default: Translation }>> = {
  ru: () => import('./ru.json'),
};

/**
 * Собирает один словарь из переводов ядра и всех подключённых модулей:
 * `{ core: {...}, birthdays: {...}, finance: {...} }`.
 * Так каждый модуль хранит свои переводы у себя, а в шаблонах работает обычный
 * `{{ 'birthdays.title' | transloco }}`.
 */
@Injectable({ providedIn: 'root' })
class DashboardTranslationLoader implements TranslocoLoader {
  private readonly modules = inject(DASHBOARD_MODULES);

  async getTranslation(lang: string): Promise<Translation> {
    const core = await loadOrEmpty(coreTranslations[lang]);
    const modules = await Promise.all(
      this.modules.map(async (module) => [module.id, await loadOrEmpty(module.translations[lang])]),
    );
    return { core, ...Object.fromEntries(modules) };
  }
}

async function loadOrEmpty(load?: () => Promise<{ default: Translation }>): Promise<Translation> {
  return load ? (await load()).default : {};
}

export function provideI18n() {
  return [
    provideTransloco({
      config: {
        availableLangs: AVAILABLE_LANGS,
        defaultLang: DEFAULT_LANG,
        fallbackLang: DEFAULT_LANG,
        reRenderOnLangChange: true,
        missingHandler: { logMissingKey: true },
      },
      loader: DashboardTranslationLoader,
    }),
    // Грузим словарь до первого рендера, чтобы не мигали ключи вместо текста.
    provideAppInitializer(() => firstValueFrom(inject(TranslocoService).load(DEFAULT_LANG))),
  ];
}
