import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatChipsModule} from '@angular/material/chips';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {TranslocoPipe} from '@jsverse/transloco';
import {
  siteDomainSchema,
  WRITING_LANGUAGES,
  WritingConfig,
  WritingSettingsUpdate,
} from '@pd/contracts';
import {firstValueFrom} from 'rxjs';
import {WritingApi} from './writing.api';

type ListField =
  'dictionary' | 'disabledRules' | 'ignoredSites' | 'ignoredApps';

/**
 * How the writing is checked, the same for the page, the browser extension and the desktop
 * app: the language, how strict, the dictionary, the rules switched off, what is left alone.
 */
@Component({
  selector: 'pd-writing-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    TranslocoPipe,
  ],
  template: `
    @let current = config();
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>tune</mat-icon>
        <mat-card-title>{{
          'writing.settings.title' | transloco
        }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        @if (!current.canCheck) {
          <p class="warning">
            {{ 'writing.settings.noLanguageTool' | transloco }}
          </p>
        }
        <mat-slide-toggle
          [checked]="current.enabled"
          (change)="save({enabled: $event.checked})"
        >
          {{ 'writing.settings.enabled' | transloco }}
        </mat-slide-toggle>
        <div class="row">
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'writing.settings.language' | transloco }}</mat-label>
            <mat-select
              [value]="current.language"
              (valueChange)="save({language: $event})"
            >
              @for (language of languages; track language) {
                <mat-option [value]="language">
                  {{ 'writing.languages.' + language | transloco }}
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'writing.settings.english' | transloco }}</mat-label>
            <mat-select
              [value]="current.englishVariant"
              (valueChange)="save({englishVariant: $event})"
            >
              <mat-option value="en-US">{{
                'writing.languages.en-US' | transloco
              }}</mat-option>
              <mat-option value="en-GB">{{
                'writing.languages.en-GB' | transloco
              }}</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
        <mat-slide-toggle
          [checked]="current.picky"
          (change)="save({picky: $event.checked})"
        >
          {{ 'writing.settings.picky' | transloco }}
        </mat-slide-toggle>

        @for (field of lists; track field) {
          <h3>{{ 'writing.settings.' + field + '.title' | transloco }}</h3>
          <p class="hint">
            {{ 'writing.settings.' + field + '.hint' | transloco }}
          </p>
          <mat-chip-set
            [attr.aria-label]="
              'writing.settings.' + field + '.title' | transloco
            "
          >
            @for (value of current[field]; track value) {
              <mat-chip (removed)="remove(field, value)">
                {{ value }}
                <button
                  matChipRemove
                  [attr.aria-label]="'core.actions.delete' | transloco"
                >
                  <mat-icon>cancel</mat-icon>
                </button>
              </mat-chip>
            } @empty {
              <span class="hint">{{
                'writing.settings.empty' | transloco
              }}</span>
            }
          </mat-chip-set>
          @if (field !== 'disabledRules') {
            <form class="row" (submit)="$event.preventDefault(); add(field)">
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>{{
                  'writing.settings.' + field + '.add' | transloco
                }}</mat-label>
                <input
                  matInput
                  [value]="drafts()[field]"
                  (input)="draft(field, $any($event.target).value)"
                />
              </mat-form-field>
              <button
                matButton="tonal"
                type="submit"
                [disabled]="!valueOf(field)"
              >
                {{ 'core.actions.add' | transloco }}
              </button>
            </form>
          }
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      margin: 12px 0;
    }
    .row mat-form-field {
      flex: 0 1 260px;
    }
    h3 {
      margin: 20px 0 4px;
      font: var(--mat-sys-title-small);
    }
    .hint {
      margin: 0 0 8px;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .warning {
      color: var(--mat-sys-error);
    }
  `,
})
export class WritingSettingsComponent {
  private readonly api = inject(WritingApi);

  readonly config = input.required<WritingConfig>();
  readonly changed = output<WritingConfig>();

  protected readonly languages = WRITING_LANGUAGES.filter(
    code => code !== 'en-GB',
  );
  protected readonly lists: ListField[] = [
    'dictionary',
    'disabledRules',
    'ignoredSites',
    'ignoredApps',
  ];
  protected readonly drafts = signal<Record<ListField, string>>({
    dictionary: '',
    disabledRules: '',
    ignoredSites: '',
    ignoredApps: '',
  });

  protected draft(field: ListField, value: string): void {
    this.drafts.update(drafts => ({...drafts, [field]: value}));
  }

  /** What would be added: a site as its domain, a program in lower case; null — nothing. */
  protected valueOf(field: ListField): string | null {
    const typed = this.drafts()[field].trim();
    if (!typed) {
      return null;
    }
    if (field === 'ignoredSites') {
      const site = siteDomainSchema.safeParse(typed);
      return site.success ? site.data : null;
    }
    return field === 'ignoredApps' ? typed.toLowerCase() : typed;
  }

  protected async save(update: WritingSettingsUpdate): Promise<void> {
    this.changed.emit(await firstValueFrom(this.api.saveSettings(update)));
  }

  protected add(field: ListField): void {
    const value = this.valueOf(field);
    const values = this.config()[field];
    if (value && !values.includes(value)) {
      void this.save({[field]: [...values, value]});
    }
    this.draft(field, '');
  }

  protected remove(field: ListField, value: string): void {
    void this.save({
      [field]: this.config()[field].filter(one => one !== value),
    });
  }
}
