import {CurrencyPipe} from '@angular/common';
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
import {MAT_DIALOG_DATA, MatDialogModule} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {TranslocoPipe} from '@jsverse/transloco';
import {Asset, ASSET_KINDS, AssetKind, LIQUID_ASSET_KINDS} from '@pd/contracts';
import {firstValueFrom} from 'rxjs';
import {FinanceApi} from '../finance.api';

/**
 * What one owns or owes besides the bank accounts: cash, another bank, a deposit, investments,
 * a flat, a loan. Each is typed in and updated by hand; the bank accounts count by themselves.
 */
@Component({
  selector: 'pd-assets-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'finance.assets.title' | transloco }}</h2>
    <mat-dialog-content>
      <p class="hint">{{ 'finance.assets.hint' | transloco }}</p>
      <ul class="list">
        @for (asset of assets.value(); track asset.id) {
          <li>
            <span class="name">
              {{ asset.name }}
              <small>{{
                'finance.assets.kinds.' + asset.kind | transloco
              }}</small>
            </span>
            <span class="amount">{{
              asset.amount | currency: asset.currency : 'symbol' : '1.0-2'
            }}</span>
            <button
              matIconButton
              [attr.aria-label]="'core.actions.edit' | transloco"
              (click)="startEdit(asset)"
            >
              <mat-icon>edit</mat-icon>
            </button>
            <button
              matIconButton
              [attr.aria-label]="'core.actions.delete' | transloco"
              (click)="remove(asset)"
            >
              <mat-icon>delete</mat-icon>
            </button>
          </li>
        }
      </ul>

      <form [formGroup]="form" (ngSubmit)="save()" class="form">
        <h3>
          {{
            (editing() ? 'finance.assets.editTitle' : 'finance.assets.addTitle')
              | transloco
          }}
        </h3>
        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'finance.assets.name' | transloco }}</mat-label>
            <input
              matInput
              formControlName="name"
              [placeholder]="'finance.assets.namePlaceholder' | transloco"
            />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'finance.assets.kind' | transloco }}</mat-label>
            <mat-select
              formControlName="kind"
              (valueChange)="kindChanged($event)"
            >
              @for (kind of kinds; track kind) {
                <mat-option [value]="kind">{{
                  'finance.assets.kinds.' + kind | transloco
                }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'finance.amount' | transloco }}</mat-label>
            <input
              matInput
              type="number"
              min="0"
              step="0.01"
              formControlName="amount"
            />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'finance.currency' | transloco }}</mat-label>
            <input matInput formControlName="currency" maxlength="3" />
          </mat-form-field>
        </div>
        <mat-slide-toggle formControlName="liquid">{{
          'finance.assets.liquid' | transloco
        }}</mat-slide-toggle>
        <div class="actions">
          @if (editing()) {
            <button matButton type="button" (click)="reset()">
              {{ 'core.actions.cancel' | transloco }}
            </button>
          }
          <button
            matButton="filled"
            type="submit"
            [disabled]="form.invalid || busy()"
          >
            {{
              (editing() ? 'core.actions.save' : 'core.actions.add') | transloco
            }}
          </button>
        </div>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>
        {{ 'finance.letter.close' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .hint {
      margin-top: 0;
      color: var(--mat-sys-on-surface-variant);
    }
    .list {
      margin: 0 0 8px;
      padding: 0;
      list-style: none;
    }
    .list li {
      display: grid;
      grid-template-columns: 1fr auto auto auto;
      align-items: center;
      gap: 4px;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .name small {
      display: block;
      color: var(--mat-sys-on-surface-variant);
    }
    .amount {
      font-variant-numeric: tabular-nums;
    }
    .form {
      display: flex;
      flex-direction: column;
      min-width: min(480px, 80vw);
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
      margin-top: 12px;
    }
  `,
})
export class AssetsDialog {
  private readonly api = inject(FinanceApi);
  private readonly currency = inject<string>(MAT_DIALOG_DATA);

  protected readonly kinds = ASSET_KINDS;
  protected readonly assets = this.api.assets();
  protected readonly editing = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', Validators.required],
    kind: ['cash' as AssetKind],
    amount: [null as number | null, [Validators.required, Validators.min(0)]],
    currency: [
      this.currency,
      [Validators.required, Validators.pattern(/^[A-Za-z]{3}$/)],
    ],
    liquid: [true],
  });

  /** Cash, an account and a deposit are money at hand; the rest is not, unless said so. */
  kindChanged(kind: AssetKind): void {
    this.form.controls.liquid.setValue(LIQUID_ASSET_KINDS.includes(kind));
  }

  startEdit(asset: Asset): void {
    this.editing.set(asset.id);
    this.form.setValue({
      name: asset.name,
      kind: asset.kind,
      amount: asset.amount,
      currency: asset.currency,
      liquid: asset.liquid,
    });
  }

  reset(): void {
    this.editing.set(null);
    this.form.reset({
      kind: 'cash',
      currency: this.currency,
      liquid: true,
      name: '',
      amount: null,
    });
  }

  async save(): Promise<void> {
    const value = this.form.getRawValue();
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.api.saveAsset(
          {
            ...value,
            amount: Number(value.amount),
            currency: value.currency.toUpperCase(),
          },
          this.editing() ?? undefined,
        ),
      );
      this.reset();
      this.assets.reload();
    } finally {
      this.busy.set(false);
    }
  }

  async remove(asset: Asset): Promise<void> {
    await firstValueFrom(this.api.removeAsset(asset.id));
    if (this.editing() === asset.id) {
      this.reset();
    }
    this.assets.reload();
  }
}
