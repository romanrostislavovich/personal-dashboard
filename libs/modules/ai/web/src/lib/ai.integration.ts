import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AiApi } from './ai.api';
import { AiSettingsComponent } from './ai-settings.component';

/**
 * AI connections (DeepSeek, OpenAI, Ollama…), what the AI may see and its action log, in
 * Settings → Integrations (see `integrations` in ai.module.ts).
 */
@Component({
  selector: 'pd-ai-integration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AiSettingsComponent],
  template: `
    @if (settings.value(); as s) {
      <pd-ai-settings [settings]="s" (changed)="settings.set($event)" />
    }
  `,
})
export class AiIntegration {
  protected readonly settings = inject(AiApi).settings();
}
