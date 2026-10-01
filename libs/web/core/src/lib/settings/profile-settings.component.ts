import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Locale, SUPPORTED_LOCALES } from '@pd/contracts';
import { AuthService } from '../auth/auth.service';

/** Name, language and the time zone the device told. The language changes the UI, notifications and AI answers (the page reloads). */
@Component({
  selector: 'pd-profile-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{ 'core.settings.profile.title' | transloco }}</mat-card-title>
        <mat-card-subtitle>{{ auth.user()?.email }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <form class="form" [formGroup]="form" (ngSubmit)="save()">
          <mat-form-field>
            <mat-label>{{ 'core.settings.profile.displayName' | transloco }}</mat-label>
            <input matInput formControlName="displayName" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'core.settings.profile.language' | transloco }}</mat-label>
            <mat-select formControlName="locale">
              @for (locale of locales; track locale) {
                <mat-option [value]="locale">
                  {{ 'core.settings.languages.' + locale | transloco }}
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
          <p class="zone">
            {{ 'core.settings.profile.timeZone' | transloco }}: <b>{{ auth.user()?.timeZone }}</b>
            <span>{{ 'core.settings.profile.timeZoneHint' | transloco }}</span>
          </p>
          <button matButton="filled" type="submit" [disabled]="form.invalid || saving()">
            {{ 'core.settings.profile.save' | transloco }}
          </button>
        </form>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-top: 16px;
    }
    .zone {
      margin: 0 0 12px;
      font: var(--mat-sys-body-small);
    }
    .zone span {
      display: block;
      color: var(--mat-sys-on-surface-variant);
    }
    .form button {
      align-self: flex-end;
    }
  `,
})
export class ProfileSettingsComponent {
  protected readonly auth = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly locales = SUPPORTED_LOCALES;
  protected readonly saving = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    displayName: ['', Validators.required],
    locale: ['en' as Locale],
  });

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (user) {
        this.form.setValue({ displayName: user.displayName, locale: user.locale as Locale });
      }
    });
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      await this.auth.updateProfile(this.form.getRawValue());
      this.snackBar.open(this.transloco.translate('core.settings.profile.saved'), 'OK', {
        duration: 3000,
      });
    } finally {
      this.saving.set(false);
    }
  }
}
