import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { OpenVaultItem } from '@pd/contracts';
import { ToastService } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { VaultItemDialog } from './vault-item.dialog';
import { VaultMasterDialog } from './vault-master.dialog';
import { VaultSession } from './vault-session.service';
import { VaultSetupComponent } from './vault-setup.component';
import { VaultUnlockComponent } from './vault-unlock.component';

/**
 * The password vault: set up, locked, or open with its items. What the vault holds is only ever
 * decrypted here, in the page; the search runs over the opened items.
 */
@Component({
  selector: 'pd-vault-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatTooltipModule,
    TranslocoPipe,
    VaultSetupComponent,
    VaultUnlockComponent,
  ],
  template: `
    <header class="page-header">
      <h1 class="page-title">{{ 'vault.title' | transloco }}</h1>
      @if (state() === 'open') {
        <span class="spacer"></span>
        <button matButton (click)="changeMaster()">
          <mat-icon>password</mat-icon> {{ 'vault.list.changeMaster' | transloco }}
        </button>
        <button matButton="tonal" (click)="session.lock()">
          <mat-icon>lock</mat-icon> {{ 'vault.list.lock' | transloco }}
        </button>
      }
    </header>
    <p class="about">{{ 'vault.about' | transloco }}</p>

    @switch (state()) {
      @case ('loading') {
        <mat-progress-bar mode="indeterminate" />
      }
      @case ('setup') {
        <pd-vault-setup (done)="justCreated.set(false)" />
      }
      @case ('locked') {
        <pd-vault-unlock />
      }
      @default {
        <div class="toolbar">
          <mat-form-field subscriptSizing="dynamic" class="search">
            <mat-icon matPrefix>search</mat-icon>
            <mat-label>{{ 'vault.list.search' | transloco }}</mat-label>
            <input matInput [ngModel]="query()" (ngModelChange)="query.set($event)" />
          </mat-form-field>
          <button matButton="filled" (click)="edit(null)">
            <mat-icon>add</mat-icon> {{ 'vault.list.add' | transloco }}
          </button>
        </div>
        <p class="hint">{{ 'vault.list.autoLock' | transloco }}</p>
        @if (session.unreadable(); as count) {
          <p class="error">{{ 'vault.list.unreadable' | transloco: { count } }}</p>
        }
        <div class="items">
          @for (item of shown(); track item.id) {
            <mat-card appearance="outlined" class="item">
              <mat-icon class="kind">{{ item.kind === 'note' ? 'sticky_note_2' : 'key' }}</mat-icon>
              <div class="body">
                <b>
                  @if (item.favorite) {
                    ⭐
                  }
                  {{ item.title }}
                </b>
                <span class="hint">{{ item.username || item.urls[0] || '' }}</span>
              </div>
              @if (item.kind === 'login') {
                <button
                  matIconButton
                  [matTooltip]="'vault.list.copyUser' | transloco"
                  [attr.aria-label]="'vault.list.copyUser' | transloco"
                  [disabled]="!item.username"
                  (click)="copy(item.username)"
                >
                  <mat-icon>person</mat-icon>
                </button>
                <button
                  matIconButton
                  [matTooltip]="'vault.list.copyPassword' | transloco"
                  [attr.aria-label]="'vault.list.copyPassword' | transloco"
                  [disabled]="!item.password"
                  (click)="copy(item.password)"
                >
                  <mat-icon>content_copy</mat-icon>
                </button>
              }
              <button
                matIconButton
                [attr.aria-label]="'vault.list.edit' | transloco"
                (click)="edit(item)"
              >
                <mat-icon>edit</mat-icon>
              </button>
              <button
                matIconButton
                [attr.aria-label]="'vault.list.delete' | transloco"
                (click)="remove(item)"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </mat-card>
          } @empty {
            <p class="hint">
              {{ (query() ? 'vault.list.nothing' : 'vault.list.empty') | transloco }}
            </p>
          }
        </div>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .page-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .spacer {
      flex: 1;
    }
    .about {
      margin: 0 0 16px;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-medium);
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
    }
    .search {
      flex: 1 1 260px;
    }
    .items {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 8px;
    }
    .item {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 8px;
      padding: 8px 8px 8px 16px;
    }
    .kind {
      color: var(--mat-sys-on-surface-variant);
    }
    .body {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .hint {
      margin: 8px 0 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .body .hint {
      margin: 0;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class VaultPage {
  protected readonly session = inject(VaultSession);
  private readonly dialog = inject(MatDialog);
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  protected readonly query = signal('');
  /** The recovery key of a vault just made is still on the screen. */
  protected readonly justCreated = signal(false);
  protected readonly state = computed(() => {
    const keys = this.session.keys();
    if (keys === undefined) {
      return 'loading';
    }
    if (keys === null || this.justCreated()) {
      return 'setup';
    }
    return this.session.unlocked() ? 'open' : 'locked';
  });
  protected readonly shown = computed(() => {
    const words = this.query().trim().toLowerCase();
    return this.session
      .sorted()
      .filter(
        (item) =>
          !words ||
          [item.title, item.username, item.notes, ...item.urls].some((text) =>
            text.toLowerCase().includes(words),
          ),
      );
  });

  constructor() {
    void this.session.load().then(() => {
      // A vault set up now shows its recovery key before it opens.
      if (this.session.keys() === null) {
        this.justCreated.set(true);
      }
    });
  }

  /** Using the page keeps the open vault from locking itself. */
  @HostListener('document:keydown')
  @HostListener('document:pointerdown')
  protected active(): void {
    this.session.touch();
  }

  protected async copy(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
    this.toasts.show({
      icon: 'content_copy',
      title: this.transloco.translate('vault.list.copied'),
    });
  }

  protected edit(item: OpenVaultItem | null): void {
    this.dialog.open(VaultItemDialog, { data: item, autoFocus: 'first-tabbable' });
  }

  protected changeMaster(): void {
    const ref = this.dialog.open(VaultMasterDialog, { autoFocus: 'first-tabbable' });
    void firstValueFrom(ref.afterClosed()).then((changed) => {
      if (changed) {
        this.toasts.show({
          icon: 'lock_reset',
          title: this.transloco.translate('vault.change.done'),
        });
      }
    });
  }

  protected async remove(item: OpenVaultItem): Promise<void> {
    if (confirm(this.transloco.translate('vault.list.confirmDelete', { title: item.title }))) {
      await this.session.remove(item.id);
    }
  }
}
