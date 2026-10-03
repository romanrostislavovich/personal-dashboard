import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { BUDGET_TOTAL, BudgetInput } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { FinanceApi } from '../finance.api';

/** A limit is "almost spent" from this share (the same as the server's warning). */
const WARN_SHARE = 0.8;

/**
 * Monthly limits of categories with what is spent of them; edited right in the card. The server
 * warns at 80% and tells when a limit is spent (budgets.service.ts).
 */
@Component({
  selector: 'pd-budgets-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{ 'finance.budgets.title' | transloco }}</mat-card-title>
        <mat-card-subtitle>{{ 'finance.budgets.subtitle' | transloco }}</mat-card-subtitle>
        <span class="spacer"></span>
        <button
          matIconButton
          [matTooltip]="(editing() ? 'core.actions.cancel' : 'core.actions.edit') | transloco"
          [attr.aria-label]="(editing() ? 'core.actions.cancel' : 'core.actions.edit') | transloco"
          (click)="toggleEdit()"
        >
          <mat-icon>{{ editing() ? 'close' : 'edit' }}</mat-icon>
        </button>
      </mat-card-header>
      <mat-card-content>
        @if (!editing()) {
          <ul class="budgets">
            @for (budget of budgets.value(); track budget.id) {
              @let share = budget.spent / budget.limit;
              <li [class.warn]="share >= warnShare && share < 1" [class.over]="share >= 1">
                <div class="head">
                  <span class="name">{{ nameOf(budget.category) }}</span>
                  <span class="numbers">
                    {{ budget.spent | number: '1.0-0' }} / {{ budget.limit | number: '1.0-0' }}
                    {{ budget.currency }}
                  </span>
                </div>
                <span class="track">
                  <span class="fill" [style.width.%]="share * 100 > 100 ? 100 : share * 100"></span>
                </span>
              </li>
            } @empty {
              <li class="hint">{{ 'finance.budgets.empty' | transloco }}</li>
            }
          </ul>
        } @else {
          <ul class="edit">
            @for (row of draft(); track $index) {
              <li>
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>{{ 'finance.budgets.category' | transloco }}</mat-label>
                  <input
                    matInput
                    maxlength="50"
                    [attr.list]="'pd-budget-categories'"
                    [value]="
                      row.category === total ? ('finance.budgets.total' | transloco) : row.category
                    "
                    [disabled]="row.category === total"
                    (input)="setCategory($index, $any($event.target).value)"
                  />
                </mat-form-field>
                <mat-form-field subscriptSizing="dynamic" class="limit">
                  <mat-label>{{ 'finance.budgets.limit' | transloco }}</mat-label>
                  <input
                    matInput
                    type="number"
                    min="1"
                    [value]="row.limit || ''"
                    (input)="setLimit($index, $any($event.target).valueAsNumber)"
                  />
                </mat-form-field>
                <button
                  matIconButton
                  [attr.aria-label]="'core.actions.delete' | transloco"
                  (click)="removeRow($index)"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </li>
            }
          </ul>
          <datalist id="pd-budget-categories">
            @for (category of categories(); track category) {
              <option [value]="category"></option>
            }
          </datalist>
          <div class="actions">
            <button matButton (click)="addRow('')">
              <mat-icon>add</mat-icon> {{ 'finance.budgets.add' | transloco }}
            </button>
            @if (!hasTotal()) {
              <button matButton (click)="addRow(total)">
                <mat-icon>add</mat-icon> {{ 'finance.budgets.addTotal' | transloco }}
              </button>
            }
            <span class="spacer"></span>
            <button matButton="filled" [disabled]="!valid()" (click)="save()">
              {{ 'core.actions.save' | transloco }}
            </button>
          </div>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    mat-card-header {
      align-items: center;
    }
    .spacer {
      flex: 1;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    ul {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin: 12px 0 0;
      padding: 0;
      list-style: none;
    }
    .head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font: var(--mat-sys-body-medium);
    }
    .numbers {
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
    }
    .track {
      display: block;
      height: 8px;
      margin-top: 4px;
      border-radius: 4px;
      background: color-mix(in srgb, var(--mat-sys-on-surface) 8%, transparent);
    }
    .fill {
      display: block;
      height: 100%;
      border-radius: 4px;
      background: var(--pd-success, var(--mat-sys-primary));
    }
    .warn .fill {
      background: var(--mat-sys-tertiary);
    }
    .over .fill {
      background: var(--mat-sys-error);
    }
    .over .numbers {
      color: var(--mat-sys-error);
    }
    .edit li {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .edit mat-form-field {
      flex: 1 1 160px;
    }
    .edit .limit {
      flex: 0 1 140px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
    }
  `,
})
export class BudgetsCardComponent {
  /** `YYYY-MM`. */
  readonly month = input.required<string>();
  /** Categories already used: suggested when a budget is added. */
  readonly categories = input<string[]>([]);

  private readonly api = inject(FinanceApi);
  private readonly transloco = inject(TranslocoService);
  protected readonly budgets = this.api.budgets(() => this.month());
  protected readonly total = BUDGET_TOTAL;
  protected readonly warnShare = WARN_SHARE;
  protected readonly editing = signal(false);
  protected readonly draft = signal<BudgetInput[]>([]);

  protected readonly hasTotal = computed(() =>
    this.draft().some((row) => row.category === BUDGET_TOTAL),
  );
  protected readonly valid = computed(() =>
    this.draft().every((row) => row.category.trim() && row.limit > 0),
  );

  protected nameOf(category: string): string {
    return category === BUDGET_TOTAL ? this.transloco.translate('finance.budgets.total') : category;
  }

  protected toggleEdit(): void {
    if (!this.editing()) {
      this.draft.set(this.budgets.value().map(({ category, limit }) => ({ category, limit })));
    }
    this.editing.update((editing) => !editing);
  }

  protected addRow(category: string): void {
    this.draft.update((rows) => [...rows, { category, limit: 0 }]);
  }

  protected removeRow(index: number): void {
    this.draft.update((rows) => rows.filter((_, i) => i !== index));
  }

  protected setCategory(index: number, category: string): void {
    this.draft.update((rows) => rows.map((row, i) => (i === index ? { ...row, category } : row)));
  }

  protected setLimit(index: number, limit: number): void {
    this.draft.update((rows) =>
      rows.map((row, i) =>
        i === index ? { ...row, limit: Number.isFinite(limit) ? limit : 0 } : row,
      ),
    );
  }

  protected async save(): Promise<void> {
    const budgets = this.draft().map((row) => ({
      category: row.category.trim(),
      limit: row.limit,
    }));
    await firstValueFrom(this.api.saveBudgets(budgets));
    this.editing.set(false);
    this.budgets.reload();
  }
}
