import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  ICD_FILE_MAX_BYTES,
  ICD_LANGUAGES,
  IcdDictionary,
  IcdImportInput,
  IcdSource,
} from '@pd/contracts';
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
    MatFormFieldModule,
    MatIconModule,
    MatProgressBarModule,
    MatSelectModule,
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

        <h3 class="section">{{ 'health.icd.fromFile' | transloco }}</h3>
        <p class="hint">{{ 'health.icd.fromFileHint' | transloco }}</p>
        <div class="file">
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'health.icd.language' | transloco }}</mat-label>
            <mat-select [value]="language()" (selectionChange)="language.set($event.value)">
              @for (code of languages; track code) {
                <mat-option [value]="code">{{ 'health.languages.' + code | transloco }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'health.diagnosis.system' | transloco }}</mat-label>
            <mat-select [value]="system()" (selectionChange)="system.set($event.value)">
              @for (code of systems; track code) {
                <mat-option [value]="code">{{ 'health.systems.' + code | transloco }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <button matButton="tonal" [disabled]="busy()" (click)="input.click()">
            <mat-icon>upload_file</mat-icon> {{ 'health.icd.chooseFile' | transloco }}
          </button>
          <input
            #input
            type="file"
            hidden
            accept=".csv,.txt,.xlsx"
            (change)="importFile($any($event.target).files?.[0]); input.value = ''"
          />
        </div>

        @if (busy()) {
          <mat-progress-bar mode="indeterminate" />
          <p class="hint">{{ 'health.icd.loading' | transloco }}</p>
        }
        @if (error()) {
          <p class="error" role="alert">{{ error() | transloco }}</p>
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
    .section {
      margin: 12px 0 0;
      font: var(--mat-sys-title-small);
    }
    .file {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
    }
    .file mat-form-field {
      width: 200px;
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
  /** The translation key of the last failure; `null` — none. */
  protected readonly error = signal<string | null>(null);

  protected readonly languages = ICD_LANGUAGES;
  protected readonly systems = ['icd10', 'icd10am', 'icd11'] as const;
  protected readonly language = signal<IcdImportInput['language']>('ru');
  protected readonly system = signal<IcdImportInput['system']>('icd10');

  protected load(source: IcdSource): Promise<void> {
    return this.run('health.icd.failed', () =>
      this.api.client.loadDictionary({ source, acceptTerms: true }),
    );
  }

  protected importFile(file: File | undefined): Promise<void> {
    if (!file) {
      return Promise.resolve();
    }
    if (file.size > ICD_FILE_MAX_BYTES) {
      this.error.set('health.icd.tooBig');
      return Promise.resolve();
    }
    return this.run('health.icd.noCodes', () =>
      this.api.client.importDictionary(
        { language: this.language(), system: this.system() },
        file,
        file.name,
      ),
    );
  }

  private async run(failure: string, request: () => Promise<IcdDictionary[]>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.dictionaries.set(await request());
    } catch {
      this.error.set(failure);
    } finally {
      this.busy.set(false);
    }
  }
}
