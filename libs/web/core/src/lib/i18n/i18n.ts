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
 * Builds one dictionary from the translations of the core and all enabled modules:
 * `{ core: {...}, birthdays: {...}, finance: {...} }`.
 * This way each module keeps its translations to itself, and templates use the usual
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
        // If a module lacks a translation, English is shown.
        fallbackLang: 'en',
        reRenderOnLangChange: true,
        missingHandler: { logMissingKey: true },
      },
      loader: DashboardTranslationLoader,
    }),
    // Load the dictionary before the first render so keys don't flash instead of text.
    provideAppInitializer(() => firstValueFrom(inject(TranslocoService).load(lang))),
  ];
}
