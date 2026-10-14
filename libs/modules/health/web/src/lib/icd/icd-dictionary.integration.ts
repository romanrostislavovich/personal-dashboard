import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoPipe } from '@jsverse/transloco';
import { IcdSource } from '@pd/contracts';
import { HealthApi } from '../health.api';

/**
 * The ICD dictionary of Health, in Settings → Integrations. WHO does not let ICD-10 be shipped
 * with an open-source program, so the user accepts its terms and their own server downloads it.
 */
@Component({
  selector: 'pd-health-icd-integration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>menu_book</mat-icon>
        <mat-card-title>{{ 'health.icd.title' | transloco }}</mat-card-title>
        <mat-card-subtitle>{{ 'health.icd.subtitle' | transloco }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content class="content">
        @for (dictionary of loaded(); track dictionary.system + dictionary.language) {
          <p class="ok">
            <mat-icon>check_circle</mat-icon>
            {{
              'health.icd.loaded'
                | transloco
                  : {
                      system: ('health.systems.' + dictionary.system | transloco),
                      language: ('health.languages.' + dictionary.language | transloco),
                      count: dictionary.codes,
                    }
            }}
          </p>
        }
        <p class="hint">{{ 'health.icd.why' | transloco }}</p>
        <mat-checkbox [checked]="accepted()" (change)="accepted.set($event.checked)">
          {{ 'health.icd.accept' | transloco }}
          <a href="https://icdcdn.who.int/icd10/index.html" target="_blank" rel="noopener">
            WHO ICD-10
          </a>
        </mat-checkbox>
        <div>
          <button
            matButton="filled"
            [disabled]="!accepted() || busy()"
            (click)="load('who-icd10-en')"
          >
            <mat-icon>download</mat-icon>
            {{ (loaded().length ? 'health.icd.reload' : 'health.icd.load') | transloco }}
          </button>
        </div>
        @if (busy()) {
          <mat-progress-bar mode="indeterminate" />
          <p class="hint">{{ 'health.icd.loading' | transloco }}</p>
        }
        @if (error()) {
          <p class="error" role="alert">{{ 'health.icd.failed' | transloco }}</p>
        }
        <p class="attribution">{{ 'health.icd.attribution' | transloco }}</p>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .content {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ok {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      color: var(--mat-sys-primary);
    }
    .hint,
    .attribution {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }
    .attribution {
      font: var(--mat-sys-body-small);
    }
    .error {
      margin: 0;
      color: var(--mat-sys-error);
    }
  `,
})
export class IcdDictionaryIntegration {
  private readonly api = inject(HealthApi);

  protected readonly dictionaries = this.api.dictionaries();
  /** `value()` of a failed resource throws. */
  protected readonly loaded = computed(() =>
    this.dictionaries.hasValue() ? this.dictionaries.value() : [],
  );
  protected readonly accepted = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal(false);

  protected async load(source: IcdSource): Promise<void> {
    this.busy.set(true);
    this.error.set(false);
    try {
      this.dictionaries.set(await this.api.client.loadDictionary({ source, acceptTerms: true }));
    } catch {
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
