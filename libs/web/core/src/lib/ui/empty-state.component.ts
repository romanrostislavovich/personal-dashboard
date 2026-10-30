import {ChangeDetectionStrategy, Component, input} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';

/**
 * A section with nothing in it yet: what it is for and the one thing to do first, instead of a
 * line of grey text on an empty page. The action (a button or a link) goes inside.
 *
 *   <pd-empty-state icon="spa" [title]="…" [text]="…">
 *     <button matButton="filled">…</button>
 *   </pd-empty-state>
 */
@Component({
  selector: 'pd-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <span class="icon" aria-hidden="true"
      ><mat-icon>{{ icon() }}</mat-icon></span
    >
    <h2 class="title">{{ title() }}</h2>
    @if (text()) {
      <p class="text">{{ text() }}</p>
    }
    <div class="actions"><ng-content /></div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 40px 24px;
      text-align: center;
      border: 1px dashed var(--mat-sys-outline-variant);
      border-radius: var(--pd-radius);
    }
    .icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 64px;
      height: 64px;
      margin-bottom: 8px;
      border-radius: 50%;
      color: var(--mat-sys-on-primary-container);
      background: var(--mat-sys-primary-container);
    }
    .icon mat-icon {
      width: 32px;
      height: 32px;
      font-size: 32px;
    }
    .title {
      margin: 0;
      font: var(--mat-sys-title-large);
    }
    .text {
      max-width: 520px;
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
      margin-top: 8px;
    }
    .actions:empty {
      display: none;
    }
  `,
})
export class EmptyStateComponent {
  /** A Material Symbols name. */
  readonly icon = input.required<string>();
  readonly title = input.required<string>();
  readonly text = input('');
}
