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
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatSnackBar} from '@angular/material/snack-bar';
import {ActivatedRoute, Router} from '@angular/router';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {IntegrationGuideComponent, errorStatus} from '@pd/web-core';
import {firstValueFrom} from 'rxjs';
import {BattlenetAccountComponent} from './battlenet-account.component';
import {GamesApi} from './games.api';

/**
 * Battle.net keys (needed only for World of Warcraft) and the account's sign-in, in Settings →
 * Integrations (see `integrations` in games.module.ts). The sign-in comes back here with
 * `?battlenet=connected|error`.
 */
@Component({
  selector: 'pd-battle-net-integration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    IntegrationGuideComponent,
    BattlenetAccountComponent,
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
        <mat-card-title>Battle.net</mat-card-title>
        <mat-card-subtitle>{{
          'games.wow.credentialsTitle' | transloco
        }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (settings.value()?.wowCredentials) {
          <p class="ok">
            <mat-icon inline>check_circle</mat-icon>
            {{ 'games.wow.credentialsSaved' | transloco }}
          </p>
        } @else {
          <p class="hint">{{ 'games.wow.credentialsHint' | transloco }}</p>
          <form class="form" [formGroup]="form" (ngSubmit)="save()">
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>Client ID</mat-label>
              <input matInput formControlName="clientId" autocomplete="off" />
            </mat-form-field>
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>Client Secret</mat-label>
              <input
                matInput
                type="password"
                formControlName="clientSecret"
                autocomplete="off"
              />
            </mat-form-field>
            <button
              matButton="filled"
              type="submit"
              [disabled]="form.invalid || busy()"
            >
              {{ 'core.actions.save' | transloco }}
            </button>
          </form>
        }
        @if (settings.value()?.battlenetAccount; as account) {
          <pd-battlenet-account
            [state]="account"
            (changed)="settings.reload()"
          />
        }
        <pd-integration-guide
          guide="games.wow.guide"
          [steps]="3"
          link="https://develop.battle.net/access/clients"
        />
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
      flex: 1 1 200px;
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
export class BattleNetIntegration {
  private readonly api = inject(GamesApi);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly settings = this.api.settings();
  protected readonly busy = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    clientId: ['', [Validators.required, Validators.minLength(10)]],
    clientSecret: ['', [Validators.required, Validators.minLength(10)]],
  });

  constructor() {
    this.showSignInResult();
  }

  async save(): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.api.saveWowCredentials(this.form.getRawValue()),
      );
      this.form.reset();
      this.settings.reload();
    } catch (error) {
      const key =
        errorStatus(error) === 400
          ? 'games.errors.invalidCredentials'
          : 'games.errors.generic';
      this.snackBar.open(
        this.transloco.translate(key),
        this.transloco.translate('core.actions.ok'),
        {duration: 6000},
      );
    } finally {
      this.busy.set(false);
    }
  }

  private showSignInResult(): void {
    const route = inject(ActivatedRoute);
    const result = route.snapshot.queryParamMap.get('battlenet');
    if (result !== 'connected' && result !== 'error') {
      return;
    }
    this.snackBar.open(
      this.transloco.translate(`games.wow.account.${result}`),
      this.transloco.translate('core.actions.ok'),
      {duration: 6000},
    );
    // Remove the parameter so the message does not repeat on reload; the tab stays.
    void inject(Router).navigate([], {
      queryParams: {battlenet: null},
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
