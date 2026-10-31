import {DatePipe} from '@angular/common';
import {ChangeDetectionStrategy, Component, input} from '@angular/core';
import {TranslocoPipe} from '@jsverse/transloco';

/**
 * "Edited 31 Oct, 14:32" under a form: when the user (or the assistant for them) last changed
 * the thing. The last save wins, so this is how a change made elsewhere — in another tab, by the
 * assistant — shows. Nothing while it was never edited.
 *
 *   <pd-edited-at [at]="task.updatedAt" />
 */
@Component({
  selector: 'pd-edited-at',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, TranslocoPipe],
  template: `
    @if (at(); as time) {
      {{ 'core.editedAt' | transloco: {time: time | date: 'd MMM, HH:mm'} }}
    }
  `,
  styles: `
    :host {
      display: block;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class EditedAtComponent {
  readonly at = input<string | null | undefined>(null);
}
