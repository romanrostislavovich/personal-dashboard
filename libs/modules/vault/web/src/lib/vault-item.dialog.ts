import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatSliderModule} from '@angular/material/slider';
import {TranslocoPipe} from '@jsverse/transloco';
import {
  DEFAULT_PASSWORD_OPTIONS,
  generatePassword,
  passwordStrength,
} from '@pd/client-core';
import {OpenVaultItem, VaultItem, VaultItemKind} from '@pd/contracts';
import {VaultSession} from './vault-session.service';

/** A login or a secure note: added, or changed (`data` is the item). Closes with `true` when saved. */
@Component({
  selector: 'pd-vault-item-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSliderModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ (data ? 'vault.item.edit' : 'vault.item.add') | transloco }}
    </h2>
    <mat-dialog-content class="form">
      <mat-button-toggle-group
        hideSingleSelectionIndicator
        [value]="kind()"
        (change)="kind.set($event.value)"
      >
        <mat-button-toggle value="login">{{
          'vault.item.kinds.login' | transloco
        }}</mat-button-toggle>
        <mat-button-toggle value="note">{{
          'vault.item.kinds.note' | transloco
        }}</mat-button-toggle>
      </mat-button-toggle-group>

      <mat-form-field>
        <mat-label>{{ 'vault.item.title' | transloco }}</mat-label>
        <input
          matInput
          maxlength="200"
          [ngModel]="title()"
          (ngModelChange)="title.set($event)"
        />
      </mat-form-field>

      @if (kind() === 'login') {
        <mat-form-field>
          <mat-label>{{ 'vault.item.url' | transloco }}</mat-label>
          <textarea
            matInput
            rows="1"
            [ngModel]="urls()"
            (ngModelChange)="urls.set($event)"
          ></textarea>
          <mat-hint>{{ 'vault.item.urlHint' | transloco }}</mat-hint>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'vault.item.username' | transloco }}</mat-label>
          <input
            matInput
            autocomplete="off"
            [ngModel]="username()"
            (ngModelChange)="username.set($event)"
          />
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'vault.item.password' | transloco }}</mat-label>
          <input
            matInput
            autocomplete="new-password"
            [type]="shown() ? 'text' : 'password'"
            [ngModel]="password()"
            (ngModelChange)="password.set($event)"
          />
          <button
            matIconButton
            matSuffix
            type="button"
            [attr.aria-label]="
              (shown() ? 'vault.item.hide' : 'vault.item.show') | transloco
            "
            (click)="shown.set(!shown())"
          >
            <mat-icon>{{ shown() ? 'visibility_off' : 'visibility' }}</mat-icon>
          </button>
          @if (password()) {
            <mat-hint>{{
              'vault.strength.' + strength() | transloco
            }}</mat-hint>
          }
        </mat-form-field>
        <div class="generator">
          <button matButton="tonal" type="button" (click)="generate()">
            <mat-icon>casino</mat-icon> {{ 'vault.item.generate' | transloco }}
          </button>
          <span class="hint">{{
            'vault.item.length' | transloco: {length: length()}
          }}</span>
          <mat-slider min="12" max="64" step="1" discrete>
            <input
              matSliderThumb
              [value]="length()"
              (valueChange)="length.set($event)"
            />
          </mat-slider>
          <mat-checkbox
            [checked]="digits()"
            (change)="digits.set($event.checked)"
          >
            {{ 'vault.item.digits' | transloco }}
          </mat-checkbox>
          <mat-checkbox
            [checked]="symbols()"
            (change)="symbols.set($event.checked)"
          >
            {{ 'vault.item.symbols' | transloco }}
          </mat-checkbox>
        </div>
      }

      <mat-form-field>
        <mat-label>{{ 'vault.item.notes' | transloco }}</mat-label>
        <textarea
          matInput
          [rows]="kind() === 'note' ? 8 : 3"
          [ngModel]="notes()"
          (ngModelChange)="notes.set($event)"
        ></textarea>
      </mat-form-field>
      <mat-checkbox
        [checked]="favorite()"
        (change)="favorite.set($event.checked)"
      >
        {{ 'vault.item.favorite' | transloco }}
      </mat-checkbox>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>
        {{ 'core.actions.cancel' | transloco }}
      </button>
      <button
        matButton="filled"
        [disabled]="!title().trim() || busy()"
        (click)="save()"
      >
        {{ 'core.actions.save' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: min(520px, 80vw);
    }
    /* Taller than the dialog, the content scrolls: nothing in it may be squeezed instead. */
    .form > * {
      flex-shrink: 0;
    }
    mat-button-toggle-group {
      align-self: flex-start;
      margin-bottom: 12px;
    }
    .generator {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class VaultItemDialog {
  protected readonly data = inject<OpenVaultItem | null>(MAT_DIALOG_DATA);
  private readonly session = inject(VaultSession);
  private readonly ref = inject(MatDialogRef<VaultItemDialog, boolean>);

  protected readonly kind = signal<VaultItemKind>(this.data?.kind ?? 'login');
  protected readonly title = signal(this.data?.title ?? '');
  protected readonly urls = signal((this.data?.urls ?? []).join('\n'));
  protected readonly username = signal(this.data?.username ?? '');
  protected readonly password = signal(this.data?.password ?? '');
  protected readonly notes = signal(this.data?.notes ?? '');
  protected readonly favorite = signal(this.data?.favorite ?? false);
  protected readonly shown = signal(!this.data);
  protected readonly busy = signal(false);
  protected readonly length = signal(DEFAULT_PASSWORD_OPTIONS.length);
  protected readonly digits = signal(DEFAULT_PASSWORD_OPTIONS.digits);
  protected readonly symbols = signal(DEFAULT_PASSWORD_OPTIONS.symbols);
  protected readonly strength = computed(
    () => passwordStrength(this.password()).strength,
  );

  protected generate(): void {
    this.password.set(
      generatePassword({
        length: this.length(),
        digits: this.digits(),
        symbols: this.symbols(),
      }),
    );
    this.shown.set(true);
  }

  protected async save(): Promise<void> {
    const login = this.kind() === 'login';
    const item: VaultItem = {
      ...(this.data?.source ? {source: this.data.source} : {}),
      kind: this.kind(),
      title: this.title().trim(),
      urls: login
        ? this.urls()
            .split('\n')
            .map(url => url.trim())
            .filter(Boolean)
        : [],
      username: login ? this.username().trim() : '',
      password: login ? this.password() : '',
      notes: this.notes(),
      favorite: this.favorite(),
    };
    this.busy.set(true);
    try {
      await this.session.save(item, this.data?.id);
      this.ref.close(true);
    } finally {
      this.busy.set(false);
    }
  }
}
