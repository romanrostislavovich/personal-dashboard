import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AI_PROVIDER_PRESETS, AI_PROVIDERS, AiProvider, AiSettings } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { AiApi } from './ai.api';

/** AI connection: provider, address, model, key and the morning digest. */
@Component({
  selector: 'pd-ai-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{ 'ai.settings.title' | transloco }}</mat-card-title>
        <mat-card-subtitle>{{ 'ai.settings.privacy' | transloco }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <form class="form" [formGroup]="form" (ngSubmit)="save()">
          <div class="row">
            <mat-form-field>
              <mat-label>{{ 'ai.settings.provider' | transloco }}</mat-label>
              <mat-select formControlName="provider" (selectionChange)="applyPreset($event.value)">
                @for (provider of providers; track provider) {
                  <mat-option [value]="provider">
                    {{ 'ai.settings.providers.' + provider | transloco }}
                  </mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'ai.settings.model' | transloco }}</mat-label>
              <input matInput formControlName="model" />
            </mat-form-field>
          </div>
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
              [placeholder]="settings().hasApiKey ? ('ai.settings.apiKeySaved' | transloco) : ''"
            />
            <mat-hint>{{ 'ai.settings.apiKeyHint' | transloco }}</mat-hint>
          </mat-form-field>
          <mat-slide-toggle formControlName="morningDigest">
            {{ 'ai.settings.morningDigest' | transloco }}
          </mat-slide-toggle>
          <div class="actions">
            @if (settings().configured) {
              <button matButton type="button" (click)="disconnect()">
                {{ 'ai.settings.disconnect' | transloco }}
              </button>
            }
            <button matButton="filled" type="submit" [disabled]="form.invalid || busy()">
              {{ 'ai.settings.save' | transloco }}
            </button>
          </div>
        </form>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    }
  `,
})
export class AiSettingsComponent {
  readonly settings = input.required<AiSettings>();
  readonly changed = output<void>();

  private readonly api = inject(AiApi);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly providers = AI_PROVIDERS;
  protected readonly busy = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    provider: ['deepseek' as AiProvider],
    baseUrl: ['', Validators.required],
    model: ['', Validators.required],
    apiKey: [''],
    morningDigest: [false],
  });

  constructor() {
    // Saved settings → into the form (the key is not shown, only a "saved" flag).
    effect(() => {
      const { provider, baseUrl, model, morningDigest } = this.settings();
      this.form.patchValue({ provider, baseUrl, model, morningDigest, apiKey: '' });
    });
  }

  /** A provider was selected — fill in its default address and model. */
  applyPreset(provider: AiProvider): void {
    const preset = AI_PROVIDER_PRESETS[provider];
    this.form.patchValue({ baseUrl: preset.baseUrl, model: preset.model });
  }

  async save(): Promise<void> {
    const { apiKey, ...rest } = this.form.getRawValue();
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.saveSettings({ ...rest, apiKey: apiKey || undefined }));
      this.snackBar.open(this.transloco.translate('ai.settings.saved'), 'OK', { duration: 3000 });
      this.changed.emit();
    } catch (error) {
      const message =
        error instanceof HttpErrorResponse && error.status === 400
          ? 'ai.settings.connectionFailed'
          : 'ai.errors.generic';
      this.snackBar.open(this.transloco.translate(message), 'OK', { duration: 6000 });
    } finally {
      this.busy.set(false);
    }
  }

  async disconnect(): Promise<void> {
    await firstValueFrom(this.api.removeSettings());
    this.changed.emit();
  }
}
