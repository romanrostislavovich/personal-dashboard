import { inject, Injectable, provideAppInitializer } from '@angular/core';
import {
  provideTransloco,
  Translation,
  TranslocoLoader,
  TranslocoService,
} from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { SUPPORTED_LOCALES } from '@pd/contracts';
import { DASHBOARD_MODULES } from '../dashboard-module';
import { initialLanguage } from './language';

const coreTranslations: Record<string, () => Promise<{ default: Translation }>> = {
  en: () => import('./en.json'),
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
  const lang = initialLanguage();
  document.documentElement.lang = lang;
  return [
    provideTransloco({
      config: {
        availableLangs: [...SUPPORTED_LOCALES],
        defaultLang: lang,
        // Если в каком-то модуле нет перевода — показываем английский.
        fallbackLang: 'en',
        reRenderOnLangChange: true,
        missingHandler: { logMissingKey: true },
      },
      loader: DashboardTranslationLoader,
    }),
    // Грузим словарь до первого рендера, чтобы не мигали ключи вместо текста.
    provideAppInitializer(() => firstValueFrom(inject(TranslocoService).load(lang))),
  ];
}
