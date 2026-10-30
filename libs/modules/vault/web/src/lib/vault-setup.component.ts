import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {TranslocoPipe} from '@jsverse/transloco';
import {passwordStrength} from '@pd/client-core';
import {VaultSession} from './vault-session.service';

const MIN_MASTER_LENGTH = 12;

/**
 * A new vault: the master password (twice, long and not weak), then the recovery key, shown
 * once — the vault opens only after the user says it is saved.
 */
@Component({
  selector: 'pd-vault-setup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined" class="card">
      @if (recoveryKey(); as key) {
        <mat-card-header>
          <mat-card-title
            >🔑 {{ 'vault.recovery.title' | transloco }}</mat-card-title
          >
        </mat-card-header>
        <mat-card-content class="content">
          <p>{{ 'vault.recovery.hint' | transloco }}</p>
          <code class="key">{{ key }}</code>
          <div class="actions">
            <button matButton="tonal" (click)="copy(key)">
              <mat-icon>content_copy</mat-icon>
              {{ 'vault.recovery.copy' | transloco }}
            </button>
            <button matButton="tonal" (click)="download(key)">
              <mat-icon>download</mat-icon>
              {{ 'vault.recovery.download' | transloco }}
            </button>
          </div>
          <mat-checkbox
            [checked]="saved()"
            (change)="saved.set($event.checked)"
          >
            {{ 'vault.recovery.saved' | transloco }}
          </mat-checkbox>
        </mat-card-content>
        <mat-card-actions align="end">
          <button
            matButton="filled"
            [disabled]="!saved()"
            (click)="done.emit()"
          >
            {{ 'vault.recovery.continue' | transloco }}
          </button>
        </mat-card-actions>
      } @else {
        <mat-card-header>
          <mat-card-title>{{ 'vault.setup.title' | transloco }}</mat-card-title>
        </mat-card-header>
        <mat-card-content class="content">
          <p class="hint">{{ 'vault.setup.hint' | transloco }}</p>
          <mat-form-field>
            <mat-label>{{ 'vault.setup.master' | transloco }}</mat-label>
            <input
              matInput
              type="password"
              autocomplete="new-password"
              [ngModel]="master()"
              (ngModelChange)="master.set($event)"
            />
            @if (master()) {
              <mat-hint [class]="strength()">
                {{ 'vault.strength.' + strength() | transloco }}
              </mat-hint>
            }
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'vault.setup.repeat' | transloco }}</mat-label>
            <input
              matInput
              type="password"
              autocomplete="new-password"
              [ngModel]="repeat()"
              (ngModelChange)="repeat.set($event)"
            />
          </mat-form-field>
          @if (problem(); as key) {
            <p class="hint">{{ key | transloco }}</p>
          }
          @if (busy()) {
            <p class="hint">{{ 'vault.setup.creating' | transloco }}</p>
            <mat-progress-bar mode="indeterminate" />
          }
        </mat-card-content>
        <mat-card-actions align="end">
          <button
            matButton="filled"
            [disabled]="!!problem() || busy()"
            (click)="create()"
          >
            {{ 'vault.setup.create' | transloco }}
          </button>
        </mat-card-actions>
      }
    </mat-card>
  `,
  styles: `
    .card {
      max-width: 560px;
    }
    .content {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-top: 12px;
    }
    .key {
      display: block;
      padding: 12px;
      border-radius: var(--pd-radius-small);
      background: var(--mat-sys-surface-container-high);
      font-size: 1.05rem;
      letter-spacing: 0.04em;
      overflow-wrap: anywhere;
      user-select: all;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .hint {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .weak {
      color: var(--mat-sys-error);
    }
    .strong {
      color: var(--pd-success);
    }
  `,
})
export class VaultSetupComponent {
  private readonly session = inject(VaultSession);
  readonly done = output<void>();

  protected readonly master = signal('');
  protected readonly repeat = signal('');
  protected readonly busy = signal(false);
  protected readonly recoveryKey = signal<string | null>(null);
  protected readonly saved = signal(false);
  protected readonly strength = computed(
    () => passwordStrength(this.master()).strength,
  );
  /** Why the vault cannot be made yet (a translation key); `null` — it can. */
  protected readonly problem = computed(() => {
    if (this.master().length < MIN_MASTER_LENGTH) {
      return 'vault.setup.short';
    }
    if (this.strength() === 'weak') {
      return 'vault.setup.weakMaster';
    }
    return this.master() === this.repeat() ? null : 'vault.setup.mismatch';
  });

  protected async create(): Promise<void> {
    this.busy.set(true);
    try {
      this.recoveryKey.set(await this.session.create(this.master()));
      this.master.set('');
      this.repeat.set('');
    } finally {
      this.busy.set(false);
    }
  }

  protected copy(key: string): Promise<void> {
    return navigator.clipboard.writeText(key);
  }

  protected download(key: string): void {
    const text = `Personal Dashboard — the recovery key of the password vault\n${location.origin}\n\n${key}\n`;
    const url = URL.createObjectURL(new Blob([text], {type: 'text/plain'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'personal-dashboard-recovery-key.txt';
    link.click();
    URL.revokeObjectURL(url);
  }
}
