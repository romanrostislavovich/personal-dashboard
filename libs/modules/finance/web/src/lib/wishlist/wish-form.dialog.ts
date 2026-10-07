import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import { MatSelectModule } from '@angular/material/select';
import { SavingsGoal, Wish, WishInput } from '@pd/contracts';

export interface WishFormData {
  wish: Wish | null;
  /** The currency of a price typed in by hand. */
  currency: string;
  /** The savings goals a wish can be saved for. */
  goals: SavingsGoal[];
}

/** A new wish or changes to one. Only the link is needed: the rest comes from the page. */
@Component({
  selector: 'pd-wish-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ (data.wish ? 'finance.wishlist.edit' : 'finance.wishlist.add') | transloco }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form">
        <mat-form-field>
          <mat-label>{{ 'finance.wishlist.url' | transloco }}</mat-label>
          <input matInput type="url" formControlName="url" placeholder="https://" cdkFocusInitial />
          <mat-hint>{{ 'finance.wishlist.urlHint' | transloco }}</mat-hint>
        </mat-form-field>

        <mat-form-field>
          <mat-label>{{ 'finance.wishlist.name' | transloco }}</mat-label>
          <input matInput formControlName="name" maxlength="200" />
          <mat-hint>{{ 'finance.wishlist.nameHint' | transloco }}</mat-hint>
        </mat-form-field>

        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'finance.wishlist.price' | transloco }}</mat-label>
            <input matInput type="number" min="0" step="0.01" formControlName="price" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'finance.currency' | transloco }}</mat-label>
            <input matInput formControlName="currency" maxlength="3" />
          </mat-form-field>
        </div>
        <p class="hint">{{ 'finance.wishlist.priceHint' | transloco }}</p>

        @if (data.goals.length) {
          <mat-form-field>
            <mat-label>{{ 'finance.wishlist.goal' | transloco }}</mat-label>
            <mat-select formControlName="goalId">
              <mat-option [value]="null">{{ 'finance.wishlist.noGoal' | transloco }}</mat-option>
              @for (goal of data.goals; track goal.id) {
                <mat-option [value]="goal.id">{{ goal.name }}</mat-option>
              }
            </mat-select>
            <mat-hint>{{ 'finance.wishlist.goalHint' | transloco }}</mat-hint>
          </mat-form-field>
        }

        <mat-form-field>
          <mat-label>{{ 'finance.wishlist.recipient' | transloco }}</mat-label>
          <input matInput formControlName="recipient" maxlength="100" />
          <mat-hint>{{ 'finance.wishlist.recipientHint' | transloco }}</mat-hint>
        </mat-form-field>

        <mat-form-field>
          <mat-label>{{ 'finance.wishlist.note' | transloco }}</mat-label>
          <textarea matInput formControlName="note" rows="2" maxlength="500"></textarea>
        </mat-form-field>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>
          {{ 'core.actions.cancel' | transloco }}
        </button>
        <button matButton="filled" type="submit" [disabled]="form.invalid">
          {{ 'core.actions.save' | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: min(480px, 80vw);
    }
    .row {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 8px;
    }
    .hint {
      margin: -12px 0 12px;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class WishFormDialog {
  protected readonly data = inject<WishFormData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<WishFormDialog, WishInput>);

  private readonly wish = this.data.wish;
  protected readonly form = inject(NonNullableFormBuilder).group({
    url: [this.wish?.url ?? '', [Validators.required, Validators.pattern(/^https?:\/\/\S+$/i)]],
    name: [this.wish?.name ?? ''],
    price: [this.wish?.price ?? (null as number | null), Validators.min(0.01)],
    currency: [
      this.wish?.currency ?? this.data.currency,
      [Validators.required, Validators.pattern(/^[A-Za-z]{3}$/)],
    ],
    note: [this.wish?.note ?? ''],
    goalId: [this.wish?.goalId ?? (null as string | null)],
    recipient: [this.wish?.recipient ?? ''],
  });

  save(): void {
    const value = this.form.getRawValue();
    // An empty number field gives null (or '' in some browsers): no price typed in.
    const price = value.price ? Number(value.price) : null;
    this.dialogRef.close({
      url: value.url.trim(),
      name: value.name || null,
      note: value.note || null,
      price,
      currency: price === null ? null : value.currency.toUpperCase(),
      goalId: value.goalId,
      recipient: value.recipient.trim() || null,
    });
  }
}
