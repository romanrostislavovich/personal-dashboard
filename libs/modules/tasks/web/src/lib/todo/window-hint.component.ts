import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {TranslocoPipe} from '@jsverse/transloco';
import {TasksApi} from '../tasks.api';

/**
 * The productive window as a hint for tasks (Links v2, hours): today's on the list, the due
 * day's weekday in the form — "hard tasks fit 10–12". Shown only when the window is clear
 * enough; silent otherwise, never in the way.
 */
@Component({
  selector: 'pd-window-hint',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, TranslocoPipe],
  template: `
    @if (shown(); as hint) {
      <p class="hint" role="note">
        <mat-icon aria-hidden="true">wb_twilight</mat-icon>
        <span>{{
          (day() ? 'tasks.window.day' : 'tasks.window.today')
            | transloco: {hours: hint}
        }}</span>
      </p>
    }
  `,
  styles: `
    .hint {
      display: flex;
      gap: 8px;
      align-items: center;
      margin: 4px 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    mat-icon {
      flex: none;
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
  `,
})
export class WindowHintComponent {
  /** The due day (`YYYY-MM-DD`); none — today. */
  readonly day = input<string | null>(null);

  private readonly data = inject(TasksApi).productiveWindow();

  protected readonly shown = computed(() => {
    if (!this.data.hasValue()) {
      return null;
    }
    const {week, weekday} = this.data.value();
    const day = this.day();
    // 0 — Monday, as the window counts its weekdays.
    const of = day
      ? (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7
      : weekday;
    const window = week[of];
    return window && window.sure !== 'low' && window.windows.length
      ? window.windows.map(({from, to}) => `${from}–${to}`).join(', ')
      : null;
  });
}
