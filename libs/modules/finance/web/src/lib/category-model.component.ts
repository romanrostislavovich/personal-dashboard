import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {TranslocoPipe} from '@jsverse/transloco';
import {FinanceApi} from './finance.api';

/**
 * The user's own category model in one line (in the bank's card): whether it already sorts a
 * new counterparty of an import on its own, and how good it is on ones it never saw.
 */
@Component({
  selector: 'pd-category-model',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    @if (expense(); as model) {
      <p class="model">
        <b>🧮 {{ 'finance.categoryModel.title' | transloco }}.</b>
        @if (model.trusted) {
          {{
            'finance.categoryModel.trusted'
              | transloco
                : {sure: percent(model.sureAccuracy), examples: model.examples}
          }}
        } @else if (model.examples) {
          {{
            'finance.categoryModel.learning'
              | transloco
                : {accuracy: percent(model.accuracy), examples: model.examples}
          }}
        } @else {
          {{ 'finance.categoryModel.empty' | transloco }}
        }
      </p>
    }
  `,
  styles: `
    .model {
      margin: 12px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class CategoryModelComponent {
  private readonly state = inject(FinanceApi).categoryModel();

  /** Spending is what a bank import sorts most; income is a few salaries. */
  protected readonly expense = computed(() =>
    this.state.hasValue()
      ? this.state.value().kinds.find(kind => kind.kind === 'expense')
      : null,
  );

  protected percent(share: number): number {
    return Math.round(share * 100);
  }
}
