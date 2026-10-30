import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
} from '@angular/core';
import {MatChipsModule} from '@angular/material/chips';
import {MatIconModule} from '@angular/material/icon';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {BandReaction, REACTION_FEELINGS, ReactionFeeling} from '@pd/contracts';
import {ToastService} from '@pd/web-core';
import {HealthApi} from '../health.api';
import {clock, minutesBetween} from './band-format';

/**
 * The body's reactions of a day (the pulse well above the owner's own at rest, without moving),
 * each with what it was — answered in the notification or here.
 */
@Component({
  selector: 'pd-band-reactions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatChipsModule, MatIconModule, TranslocoPipe],
  template: `
    @for (reaction of reactions(); track reaction.id) {
      <div class="reaction">
        <mat-icon>favorite</mat-icon>
        <div class="what">
          <span class="when">
            {{ clock(reaction.startAt) }} ·
            {{
              'health.band.reactions.minutes'
                | transloco: {count: length(reaction)}
            }}
          </span>
          <span class="pulse">
            {{
              'health.band.reactions.pulse'
                | transloco
                  : {peak: reaction.peakBpm, base: reaction.baselineBpm}
            }}
          </span>
          <mat-chip-listbox
            [value]="reaction.feeling"
            (change)="answer(reaction, $event.value)"
            [attr.aria-label]="'health.band.reactions.how' | transloco"
          >
            @for (feeling of feelings; track feeling) {
              <mat-chip-option [value]="feeling">
                {{ 'health.band.feelings.' + feeling | transloco }}
              </mat-chip-option>
            }
          </mat-chip-listbox>
        </div>
      </div>
    } @empty {
      <p class="hint">{{ 'health.band.reactions.none' | transloco }}</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .reaction {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }
    mat-icon {
      color: var(--mat-sys-error);
    }
    .what {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .when {
      font: var(--mat-sys-title-small);
    }
    .pulse,
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class BandReactionsComponent {
  private readonly api = inject(HealthApi);
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  readonly reactions = input.required<BandReaction[]>();
  /** An answer was saved: the day reads again. */
  readonly changed = output<void>();

  protected readonly feelings = REACTION_FEELINGS;
  protected readonly clock = clock;

  protected length(reaction: BandReaction): number {
    return minutesBetween(reaction.startAt, reaction.endAt);
  }

  protected async answer(
    reaction: BandReaction,
    feeling: ReactionFeeling | undefined,
  ) {
    if (!feeling || feeling === reaction.feeling) {
      return;
    }
    try {
      await this.api.client.setReactionFeeling(reaction.id, feeling);
      this.changed.emit();
    } catch {
      this.toasts.show({
        icon: '⚠️',
        title: this.transloco.translate('health.band.reactions.failed'),
      });
    }
  }
}
