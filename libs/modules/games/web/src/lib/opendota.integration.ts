import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { errorStatus } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { GamesApi } from './games.api';

/**
 * The OpenDota API key (optional, for Dota 2), in Settings → Integrations (see `integrations`
 * in games.module.ts). One key serves every Dota account of the user.
 */
@Component({
  selector: 'pd-opendota-integration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>sports_esports</mat-icon>
        <mat-card-title>OpenDota</mat-card-title>
        <mat-card-subtitle>{{ 'games.opendota.title' | transloco }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (settings.value()?.openDotaKey) {
          <p class="ok">
            <mat-icon inline>check_circle</mat-icon> {{ 'games.opendota.saved' | transloco }}
          </p>
          <button matButton (click)="remove()">{{ 'games.opendota.remove' | transloco }}</button>
        } @else {
          <p class="hint">{{ 'games.opendota.hint' | transloco }}</p>
          <form class="form" [formGroup]="form" (ngSubmit)="save()">
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ 'games.opendota.label' | transloco }}</mat-label>
              <input matInput type="password" formControlName="apiKey" autocomplete="off" />
            </mat-form-field>
            <button matButton="filled" type="submit" [disabled]="form.invalid || busy()">
              {{ 'core.actions.save' | transloco }}
            </button>
          </form>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .form {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .form mat-form-field {
      flex: 1 1 220px;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
    .ok {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--mat-sys-primary);
    }
  `,
})
export class OpenDotaIntegration {
  private readonly api = inject(GamesApi);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly settings = this.api.settings();
  protected readonly busy = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    apiKey: ['', [Validators.required, Validators.minLength(10)]],
  });

  async save(): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.saveOpenDotaKey(this.form.getRawValue().apiKey));
      this.form.reset();
      this.settings.reload();
    } catch (error) {
      const key = errorStatus(error) === 400 ? 'games.opendota.invalid' : 'games.errors.generic';
      this.snackBar.open(this.transloco.translate(key), 'OK', { duration: 6000 });
    } finally {
      this.busy.set(false);
    }
  }

  async remove(): Promise<void> {
    await firstValueFrom(this.api.removeOpenDotaKey());
    this.settings.reload();
  }
}
