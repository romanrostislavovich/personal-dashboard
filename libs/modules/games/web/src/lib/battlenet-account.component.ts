import {DatePipe, UpperCasePipe} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatSnackBar} from '@angular/material/snack-bar';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {BattlenetAccountState} from '@pd/contracts';
import {firstValueFrom} from 'rxjs';
import {GamesApi} from './games.api';

/**
 * The Battle.net account inside the Battle.net card: sign in once and the characters of every
 * region and version are found by themselves. The sign-in comes back to Settings with
 * `?battlenet=connected|error` (see BattleNetIntegration).
 */
@Component({
  selector: 'pd-battlenet-account',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    UpperCasePipe,
    MatButtonModule,
    MatIconModule,
    TranslocoPipe,
  ],
  template: `
    <section class="account">
      <h3>{{ 'games.wow.account.title' | transloco }}</h3>
      <p class="hint">{{ 'games.wow.account.hint' | transloco }}</p>
      <p class="hint">
        {{ 'games.wow.account.redirect' | transloco }}
        <code>{{ state().redirectUri }}</code>
      </p>

      @if (signedIn()) {
        <p class="ok">
          <mat-icon inline>check_circle</mat-icon>
          {{
            'games.wow.account.until'
              | transloco: {time: state().expiresAt | date: 'short'}
          }}
        </p>
      } @else if (state().expiresAt) {
        <p class="hint">{{ 'games.wow.account.expired' | transloco }}</p>
      }

      <div class="actions">
        @if (signedIn()) {
          <button matButton="filled" [disabled]="busy()" (click)="find()">
            <mat-icon>person_search</mat-icon>
            {{ 'games.wow.account.find' | transloco }}
          </button>
        } @else {
          <button matButton="filled" [disabled]="busy()" (click)="signIn()">
            <mat-icon>login</mat-icon>
            {{ 'games.wow.account.signIn' | transloco }}
          </button>
        }
        @if (state().expiresAt) {
          <button matButton [disabled]="busy()" (click)="signOut()">
            {{ 'games.wow.account.signOut' | transloco }}
          </button>
        }
      </div>

      @if (state().discoveredAt) {
        @if (state().characters.length) {
          <p>
            {{
              'games.wow.account.found'
                | transloco: {count: state().characters.length}
            }}
          </p>
          <ul class="characters">
            @for (c of state().characters; track c.key) {
              <li [class.dim]="c.status !== 'added'">
                <strong
                  >{{ c.name }}
                  @if (c.surname) {
                    {{ c.surname }}
                  }
                </strong>
                · {{ 'games.wow.versions.' + c.version | transloco }} ·
                {{ c.region | uppercase }}
                @if (c.realm) {
                  · {{ c.realm }}
                }
                · {{ 'games.wow.account.level' | transloco: {level: c.level} }}
                @if (c.className) {
                  · {{ c.className }}
                }
                ·
                @switch (c.status) {
                  @case ('added') {
                    {{ 'games.wow.account.statusAdded' | transloco }}
                  }
                  @case ('hidden') {
                    {{ 'games.wow.account.statusHidden' | transloco }}
                  }
                  @case ('removed') {
                    {{ 'games.wow.account.statusRemoved' | transloco }}
                  }
                }
                @if (c.status !== 'added') {
                  <button matButton [disabled]="busy()" (click)="add(c.key)">
                    {{ 'games.wow.account.add' | transloco }}
                  </button>
                }
              </li>
            }
          </ul>
        } @else {
          <p class="hint">{{ 'games.wow.account.none' | transloco }}</p>
        }
      }
    </section>
  `,
  styles: `
    .account {
      margin-top: 16px;
      border-top: 1px solid var(--mat-sys-outline-variant);
      padding-top: 8px;
    }
    h3 {
      font: var(--mat-sys-title-small);
      margin: 8px 0;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
    code {
      word-break: break-all;
    }
    .ok {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--mat-sys-primary);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .characters {
      margin: 8px 0 0;
      padding-left: 20px;
    }
    .characters li.dim {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class BattlenetAccountComponent {
  private readonly api = inject(GamesApi);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  readonly state = input.required<BattlenetAccountState>();
  readonly changed = output();

  protected readonly busy = signal(false);
  protected readonly signedIn = computed(() => {
    const expiresAt = this.state().expiresAt;
    return expiresAt !== null && new Date(expiresAt).getTime() > Date.now();
  });

  async signIn(): Promise<void> {
    await this.run(async () => {
      const {url} = await firstValueFrom(this.api.battlenetConnectUrl());
      window.location.href = url;
    });
  }

  async find(): Promise<void> {
    await this.run(async () => {
      await firstValueFrom(this.api.battlenetDiscover());
      this.changed.emit();
    });
  }

  async add(key: string): Promise<void> {
    await this.run(async () => {
      await firstValueFrom(this.api.addBattlenetCharacter(key));
      this.snackBar.open(
        this.transloco.translate('games.wow.account.added'),
        this.transloco.translate('core.actions.ok'),
        {duration: 4000},
      );
      this.changed.emit();
    });
  }

  async signOut(): Promise<void> {
    await this.run(async () => {
      await firstValueFrom(this.api.disconnectBattlenet());
      this.changed.emit();
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } catch {
      this.snackBar.open(
        this.transloco.translate('games.errors.generic'),
        this.transloco.translate('core.actions.ok'),
        {duration: 6000},
      );
    } finally {
      this.busy.set(false);
    }
  }
}
