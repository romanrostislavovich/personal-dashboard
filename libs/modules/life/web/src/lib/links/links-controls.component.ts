import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatSelectModule} from '@angular/material/select';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {CorrelationPairs, ExtraMetric} from '@pd/contracts';

/**
 * The controls of Life → Links: the period, the digital filter, which pairs are compared and
 * the extra numbers switched on. The extra numbers are applied when their list closes, so
 * several can be ticked in one go (each change recounts every link on the server).
 */
@Component({
  selector: 'pd-links-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatSelectModule,
    TranslocoPipe,
  ],
  templateUrl: './links-controls.component.html',
  styleUrl: './links-controls.component.scss',
})
export class LinksControlsComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly language = toSignal(this.transloco.langChanges$);

  readonly periods = input.required<readonly number[]>();
  readonly days = input.required<number>();
  readonly digitalFilter = input.required<string>();
  readonly digitalMetrics = input.required<readonly string[]>();
  /** The keys of the numbers counted: a digital one without days cannot be chosen. */
  readonly known = input.required<ReadonlySet<string>>();
  readonly pairs = input.required<CorrelationPairs>();
  /** Every extra number of the last result, on or off. */
  readonly extras = input.required<ExtraMetric[]>();
  /** The extra numbers switched on now. */
  readonly extra = input.required<string[]>();

  readonly daysChange = output<number>();
  readonly digitalFilterChange = output<string>();
  readonly pairsChange = output<CorrelationPairs>();
  readonly extraChange = output<string[]>();

  /** What is ticked in the open list; applied when it closes. */
  protected readonly draft = linkedSignal(() => this.extra());

  protected readonly sorted = computed(() => {
    this.language();
    return [...this.extras()].sort((a, b) =>
      this.name(a).localeCompare(this.name(b)),
    );
  });
  protected readonly switchedOn = computed(
    () => this.extras().filter(item => item.on).length,
  );

  protected name(item: ExtraMetric): string {
    return item.label ?? this.transloco.translate(item.labelKey);
  }

  /** A name of the user's own ("TypeScript", "#sport") with what kind of number it is. */
  protected kind(item: ExtraMetric): string | null {
    return item.label ? this.transloco.translate(item.labelKey) : null;
  }

  protected opened(open: boolean): void {
    if (open) {
      return;
    }
    // Only the keys the server still knows: a tag or a game out of the top lists goes.
    const known = new Set(this.extras().map(item => item.key));
    const chosen = this.draft().filter(key => known.has(key));
    const now = this.extra();
    if (
      chosen.length !== now.length ||
      chosen.some(key => !now.includes(key))
    ) {
      this.extraChange.emit(chosen);
    }
  }

  protected reset(): void {
    this.draft.set([]);
    this.extraChange.emit([]);
  }
}
