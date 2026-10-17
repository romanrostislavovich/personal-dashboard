import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { ServerKeyComponent, ServerKeyField } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { WritingApi } from './writing.api';

/**
 * LanguageTool, in Settings → Integrations (see `integrations` in writing.module.ts): whether
 * the writing is checked, and for the owner the address of the server that checks it.
 */
@Component({
  selector: 'pd-writing-integration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatIconModule, ServerKeyComponent, TranslocoPipe],
  template: `
    @if (config.value(); as c) {
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-icon mat-card-avatar>spellcheck</mat-icon>
          <mat-card-title>LanguageTool</mat-card-title>
          <mat-card-subtitle>{{ 'writing.integration.description' | transloco }}</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          @if (c.canCheck) {
            <p class="ok">
              <mat-icon inline>check_circle</mat-icon>
              {{ 'writing.integration.working' | transloco }}
            </p>
          } @else {
            <p class="hint">{{ 'writing.integration.notSet' | transloco }}</p>
          }
          @if (c.languageTool; as languageTool) {
            <pd-server-key
              [fields]="fields"
              [set]="c.canCheck"
              [summary]="languageTool.url"
              [initial]="{ url: languageTool.url }"
              [save]="save"
              [remove]="remove"
              (changed)="config.reload()"
            />
            <p class="hint">{{ 'writing.integration.hint' | transloco }}</p>
          }
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: `
    .ok {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--mat-sys-primary);
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class WritingIntegration {
  private readonly api = inject(WritingApi);
  protected readonly config = this.api.settings();
  protected readonly fields: ServerKeyField[] = [
    { name: 'url', label: 'writing.integration.url', placeholder: 'http://languagetool:8010' },
  ];
  protected readonly save = (values: Record<string, string>) =>
    firstValueFrom(this.api.setLanguageTool(values['url']));
  protected readonly remove = () => firstValueFrom(this.api.removeLanguageTool());
}
