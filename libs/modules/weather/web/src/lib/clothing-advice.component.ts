import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ClothingAdvice } from '@pd/contracts';
import { EXTRA_EMOJI } from './weather-emoji';

/** What to wear today: the outfit and what to take with you. */
@Component({
  selector: 'pd-clothing-advice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    <p class="outfit">👕 {{ 'weather.outfit.' + advice().outfit | transloco }}</p>
    @if (advice().extras.length) {
      <ul class="extras">
        @for (extra of advice().extras; track extra) {
          <li>{{ emoji[extra] }} {{ 'weather.extra.' + extra | transloco }}</li>
        }
      </ul>
    }
  `,
  styles: `
    .outfit {
      margin: 0;
      font-weight: 600;
    }
    .extras {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 10px 0 0;
      padding: 0;
      list-style: none;
    }
    .extras li {
      padding: 4px 10px;
      border: 1px solid var(--pd-border);
      border-radius: 999px;
      font-size: 0.85rem;
    }
  `,
})
export class ClothingAdviceComponent {
  readonly advice = input.required<ClothingAdvice>();
  protected readonly emoji = EXTRA_EMOJI;
}
