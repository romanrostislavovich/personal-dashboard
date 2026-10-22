import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { GENTLE_DAY_MAX_STEPS, GentleDayStep, GentleStepState } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { PsychologyApi, today } from '../psychology.api';

/** Ready steps to start from when one's own library is empty: keys of `psychology.gentle.ideas`. */
const IDEAS = ['water', 'eat', 'outside', 'shower', 'message', 'window'] as const;

/** A step offered for the day: from the library, an idea, or typed for this day only. */
interface Choice {
  text: string;
  smaller: string | null;
}

/**
 * The gentle day itself: off — one button to turn it on and a few steps to pick; on — the
 * steps of the day, each with "done", "smaller", "not today" and "rest", all equally fine.
 * Nothing is counted, nothing is carried over, and leaving the mode is one click.
 */
@Component({
  selector: 'pd-gentle-day',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    TranslocoPipe,
  ],
  template: `
    @if (day.value(); as plan) {
      @if (plan.on && !picking()) {
        <ul class="steps">
          @for (step of plan.steps; track $index) {
            <li [class.settled]="step.state !== 'open'">
              <span class="text">
                @if (step.state === 'smaller' && step.smaller) {
                  {{ step.smaller }}
                } @else {
                  {{ step.text }}
                }
                @if (step.state !== 'open') {
                  <span class="state">{{
                    'psychology.gentle.states.' + step.state | transloco
                  }}</span>
                }
              </span>
              <span class="actions">
                <button matButton (click)="mark($index, 'done')">
                  {{ 'psychology.gentle.done' | transloco }}
                </button>
                @if (step.smaller) {
                  <button matButton (click)="mark($index, 'smaller')">
                    {{ 'psychology.gentle.smaller' | transloco }}
                  </button>
                }
                <button matButton (click)="mark($index, 'notToday')">
                  {{ 'psychology.gentle.notToday' | transloco }}
                </button>
                <button matButton (click)="mark($index, 'rest')">
                  {{ 'psychology.gentle.rest' | transloco }}
                </button>
              </span>
            </li>
          } @empty {
            <li class="hint">{{ 'psychology.gentle.noSteps' | transloco }}</li>
          }
        </ul>
        <p class="hint">
          {{
            (allSettled() ? 'psychology.gentle.enough' : 'psychology.gentle.nothingIsFine')
              | transloco
          }}
        </p>
        <div class="row">
          @if (!compact()) {
            <button matButton (click)="startPicking(plan.steps)">
              {{ 'psychology.gentle.change' | transloco }}
            </button>
          }
          <button matButton (click)="leave()">{{ 'psychology.gentle.leave' | transloco }}</button>
        </div>
      } @else if (picking()) {
        <p class="hint">{{ 'psychology.gentle.pick' | transloco: { max: max } }}</p>
        <mat-chip-listbox
          multiple
          [attr.aria-label]="'psychology.gentle.pick' | transloco: { max: max }"
        >
          @for (choice of choices(); track choice.text) {
            <mat-chip-option
              [selected]="isPicked(choice)"
              [disabled]="!isPicked(choice) && picked().length >= max"
              (selectionChange)="toggle(choice, $event.selected)"
            >
              {{ choice.text }}
            </mat-chip-option>
          }
        </mat-chip-listbox>
        <mat-form-field subscriptSizing="dynamic" class="own">
          <mat-label>{{ 'psychology.gentle.ownStep' | transloco }}</mat-label>
          <input
            #own
            matInput
            maxlength="200"
            [disabled]="picked().length >= max"
            (keydown.enter)="addOwn(own)"
          />
          <button
            matIconButton
            matSuffix
            [attr.aria-label]="'core.actions.add' | transloco"
            (click)="addOwn(own)"
          >
            <mat-icon>add</mat-icon>
          </button>
        </mat-form-field>
        <div class="row">
          <button matButton (click)="picking.set(false)">
            {{ 'core.actions.cancel' | transloco }}
          </button>
          <button matButton="filled" [disabled]="busy()" (click)="start()">
            {{ (plan.on ? 'core.actions.save' : 'psychology.gentle.begin') | transloco }}
          </button>
        </div>
      } @else {
        <p class="hint">{{ 'psychology.gentle.offAbout' | transloco }}</p>
        <div class="row">
          <button matButton="tonal" (click)="startPicking([])">
            {{ 'psychology.gentle.turnOn' | transloco }}
          </button>
        </div>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .steps {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .steps li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 4px 12px;
      padding: 8px 12px;
      border-radius: 12px;
      background: var(--mat-sys-surface-container);
    }
    .steps li.settled .text {
      color: var(--mat-sys-on-surface-variant);
    }
    .text {
      display: flex;
      flex-direction: column;
      font: var(--mat-sys-body-large);
      overflow-wrap: anywhere;
    }
    .state {
      font: var(--mat-sys-body-small);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
    }
    .own {
      width: min(100%, 420px);
    }
    .hint {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-medium);
    }
  `,
})
export class GentleDayComponent {
  private readonly api = inject(PsychologyApi);
  private readonly transloco = inject(TranslocoService);

  /** On the home page: no changing of the steps, only marking them. */
  readonly compact = input(false);

  protected readonly max = GENTLE_DAY_MAX_STEPS;
  private readonly date = signal(today());
  protected readonly day = this.api.gentleDay(this.date);
  private readonly library = this.api.gentleSteps();

  protected readonly picking = signal(false);
  protected readonly picked = signal<Choice[]>([]);
  protected readonly busy = signal(false);

  /** One's own steps first; the ideas only while the library is empty, so it never nags. */
  protected readonly choices = computed<Choice[]>(() => {
    const own = this.library.value().map((step) => ({ text: step.text, smaller: step.smaller }));
    const ideas = own.length
      ? []
      : IDEAS.map((key) => ({
          text: this.transloco.translate(`psychology.gentle.ideas.${key}`),
          smaller: null,
        }));
    // A step typed for the day only stays among the choices while picking.
    const extra = this.picked().filter(
      (choice) =>
        !own.some((item) => item.text === choice.text) &&
        !ideas.some((item) => item.text === choice.text),
    );
    return [...own, ...ideas, ...extra];
  });

  protected readonly allSettled = computed(() => {
    const steps = this.day.value()?.steps ?? [];
    return steps.length > 0 && steps.every((step) => step.state !== 'open');
  });

  protected isPicked(choice: Choice): boolean {
    return this.picked().some((item) => item.text === choice.text);
  }

  protected startPicking(steps: GentleDayStep[]): void {
    this.library.reload();
    this.picked.set(steps.map((step) => ({ text: step.text, smaller: step.smaller })));
    this.picking.set(true);
  }

  protected toggle(choice: Choice, selected: boolean): void {
    this.picked.update((list) =>
      selected
        ? list.length < this.max && !list.some((item) => item.text === choice.text)
          ? [...list, choice]
          : list
        : list.filter((item) => item.text !== choice.text),
    );
  }

  protected addOwn(field: HTMLInputElement): void {
    const text = field.value.trim();
    if (text) {
      this.toggle({ text, smaller: null }, true);
      field.value = '';
    }
  }

  /** Turns the mode on with the picked steps; a step kept from before keeps its state. */
  protected async start(): Promise<void> {
    const before = this.day.value()?.steps ?? [];
    await this.save(
      this.picked().map((choice) => ({
        ...choice,
        state: before.find((step) => step.text === choice.text)?.state ?? 'open',
      })),
    );
    this.picking.set(false);
  }

  /** A second click on the same state takes it back. */
  protected async mark(index: number, state: GentleStepState): Promise<void> {
    const steps = (this.day.value()?.steps ?? []).map((step, i) =>
      i === index ? { ...step, state: step.state === state ? ('open' as const) : state } : step,
    );
    await this.save(steps);
  }

  protected async leave(): Promise<void> {
    await firstValueFrom(this.api.leaveGentleDay(this.date()));
    this.day.reload();
  }

  private async save(steps: GentleDayStep[]): Promise<void> {
    this.busy.set(true);
    try {
      const plan = await firstValueFrom(this.api.saveGentleDay({ date: this.date(), steps }));
      this.day.set(plan);
    } finally {
      this.busy.set(false);
    }
  }
}
