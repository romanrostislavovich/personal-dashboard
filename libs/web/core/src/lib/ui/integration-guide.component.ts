import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * "How to connect": the steps of getting a key or a token, folded under an integration card.
 * Every integration has one — where to click on the other service is never obvious.
 *
 * ```html
 * <pd-integration-guide guide="music.guide.lastfm" [steps]="3" link="https://www.last.fm/api" />
 * ```
 *
 * The steps are the module's translations `<guide>.1` … `<guide>.<steps>`.
 */
@Component({
  selector: 'pd-integration-guide',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, TranslocoPipe],
  template: `
    <details>
      <summary>
        <mat-icon inline>help_outline</mat-icon>
        {{ title() || ('core.settings.guide.title' | transloco) }}
      </summary>
      <ol>
        @for (key of keys(); track key) {
          <li>{{ key | transloco }}</li>
        }
      </ol>
      @if (link(); as url) {
        <a [href]="url" target="_blank" rel="noopener">
          {{ 'core.settings.guide.open' | transloco: { site: host() } }}
          <mat-icon inline>open_in_new</mat-icon>
        </a>
      }
    </details>
  `,
  styles: `
    :host {
      display: block;
      margin: 8px 0;
      font: var(--mat-sys-body-small);
    }
    summary {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      color: var(--mat-sys-primary);
    }
    ol {
      margin: 8px 0;
      padding-left: 20px;
      color: var(--mat-sys-on-surface-variant);
    }
    li {
      margin-bottom: 4px;
    }
    a {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--mat-sys-primary);
      text-decoration: none;
    }
  `,
})
export class IntegrationGuideComponent {
  /** The prefix of the steps' translation keys. */
  readonly guide = input.required<string>();
  /** How many steps there are: `<guide>.1` … `<guide>.<steps>`. */
  readonly steps = input.required<number>();
  /** The page where the key is made. */
  readonly link = input<string>();
  /** Shown instead of "How to connect" when a card has several guides (one per service). */
  readonly title = input<string>();

  protected readonly keys = computed(() =>
    Array.from({ length: this.steps() }, (_, index) => `${this.guide()}.${index + 1}`),
  );

  /** `https://www.last.fm/api/account/create` → `last.fm`. */
  protected readonly host = computed(() => {
    try {
      return new URL(this.link() ?? '').hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  });
}
