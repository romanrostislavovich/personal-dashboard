import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {TranslocoPipe} from '@jsverse/transloco';
import {
  AI_PROVIDER_PRESETS,
  AI_PROVIDERS,
  AiConnection,
  AiProvider,
  AiSettings,
} from '@pd/contracts';
import {firstValueFrom} from 'rxjs';
import {errorStatus} from '@pd/web-core';
import {AiApi} from './ai.api';

/** Provider names for a new connection's default name. */
const PROVIDER_NAMES: Record<AiProvider, string> = {
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  ollama: 'Ollama',
  custom: 'AI',
};

/**
 * Adds or edits an AI connection. Saving checks it with a short request, so the dialog stays
 * open with an error if the URL, model or key is wrong. Closes with the new settings.
 */
@Component({
  selector: 'pd-ai-connection-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{
        (connection ? 'ai.connections.edit' : 'ai.connections.add') | transloco
      }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form">
        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'ai.settings.provider' | transloco }}</mat-label>
            <mat-select
              formControlName="provider"
              (selectionChange)="applyPreset($event.value)"
            >
              @for (provider of providers; track provider) {
                <mat-option [value]="provider">
                  {{ 'ai.settings.providers.' + provider | transloco }}
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'ai.connections.name' | transloco }}</mat-label>
            <input matInput formControlName="name" />
          </mat-form-field>
        </div>
        <mat-form-field>
          <mat-label>{{ 'ai.settings.model' | transloco }}</mat-label>
          <input matInput formControlName="model" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'ai.settings.baseUrl' | transloco }}</mat-label>
          <input matInput formControlName="baseUrl" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'ai.settings.apiKey' | transloco }}</mat-label>
          <input
            matInput
            type="password"
            formControlName="apiKey"
            autocomplete="off"
            [placeholder]="
              connection?.hasApiKey
                ? ('ai.settings.apiKeySaved' | transloco)
                : ''
            "
          />
          <mat-hint>{{ 'ai.settings.apiKeyHint' | transloco }}</mat-hint>
        </mat-form-field>
        <p class="hint">{{ 'ai.usage.pricesHint' | transloco }}</p>
        <div class="row three">
          <mat-form-field>
            <mat-label>{{ 'ai.usage.priceInput' | transloco }}</mat-label>
            <input
              matInput
              type="number"
              min="0"
              step="0.01"
              formControlName="priceInput"
            />
            <span matTextPrefix>$&nbsp;</span>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'ai.usage.priceOutput' | transloco }}</mat-label>
            <input
              matInput
              type="number"
              min="0"
              step="0.01"
              formControlName="priceOutput"
            />
            <span matTextPrefix>$&nbsp;</span>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'ai.usage.monthlyLimit' | transloco }}</mat-label>
            <input
              matInput
              type="number"
              min="0"
              step="1"
              formControlName="monthlyLimit"
            />
            <span matTextPrefix>$&nbsp;</span>
          </mat-form-field>
        </div>
        @if (limitWithoutPrices()) {
          <p class="error">{{ 'ai.usage.limitNeedsPrices' | transloco }}</p>
        }
        @if (error(); as key) {
          <p class="error">{{ key | transloco }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>
          {{ 'core.actions.cancel' | transloco }}
        </button>
        <button
          matButton="filled"
          type="submit"
          [disabled]="form.invalid || limitWithoutPrices() || busy()"
        >
          {{
            (busy() ? 'ai.connections.checking' : 'ai.settings.save')
              | transloco
          }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: min(480px, 80vw);
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .row.three {
      grid-template-columns: 1fr 1fr 1fr;
    }
    .hint {
      margin: 4px 0 8px;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      margin: 0;
      color: var(--mat-sys-error);
    }
    @media (max-width: 600px) {
      .row.three {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class AiConnectionFormDialog {
  private readonly api = inject(AiApi);
  private readonly dialogRef = inject(
    MatDialogRef<AiConnectionFormDialog, AiSettings>,
  );
  protected readonly connection = inject<AiConnection | null>(MAT_DIALOG_DATA);

  protected readonly providers = AI_PROVIDERS;
  protected readonly busy = signal(false);
  /** A translation key. */
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    provider: [this.connection?.provider ?? ('deepseek' as AiProvider)],
    name: [
      this.connection?.name ?? PROVIDER_NAMES.deepseek,
      Validators.required,
    ],
    baseUrl: [
      this.connection?.baseUrl ?? AI_PROVIDER_PRESETS.deepseek.baseUrl,
      Validators.required,
    ],
    model: [
      this.connection?.model ?? AI_PROVIDER_PRESETS.deepseek.model,
      Validators.required,
    ],
    apiKey: [''],
    priceInput: [this.connection?.priceInput ?? null, Validators.min(0)],
    priceOutput: [this.connection?.priceOutput ?? null, Validators.min(0)],
    monthlyLimit: [this.connection?.monthlyLimit ?? null, Validators.min(0)],
  });

  /** A limit is in money: it is counted from both prices. */
  protected readonly limitWithoutPrices = () => {
    const {priceInput, priceOutput, monthlyLimit} = this.form.getRawValue();
    return (
      Boolean(monthlyLimit) && (priceInput === null || priceOutput === null)
    );
  };

  /** A provider was selected — fill in its default address, model and name. */
  applyPreset(provider: AiProvider): void {
    const {baseUrl, model} = AI_PROVIDER_PRESETS[provider];
    const nameUntouched = Object.values(PROVIDER_NAMES).includes(
      this.form.value.name ?? '',
    );
    this.form.patchValue({
      baseUrl,
      model,
      ...(nameUntouched ? {name: PROVIDER_NAMES[provider]} : {}),
    });
  }

  async save(): Promise<void> {
    const {apiKey, monthlyLimit, ...rest} = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    try {
      const settings = await firstValueFrom(
        this.api.saveConnection(
          {
            ...rest,
            monthlyLimit: monthlyLimit || null,
            apiKey: apiKey || undefined,
          },
          this.connection?.id,
        ),
      );
      this.dialogRef.close(settings);
    } catch (error) {
      this.error.set(
        errorStatus(error) === 400
          ? 'ai.settings.connectionFailed'
          : 'ai.errors.generic',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
