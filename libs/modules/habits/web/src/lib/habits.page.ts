import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Habit, HabitInput, HabitKind } from '@pd/contracts';
import { firstValueFrom, Observable } from 'rxjs';
import { HabitCardAction, HabitCardComponent } from './habit-card.component';
import { HabitDialog, HabitDialogData } from './habit.dialog';
import { HABIT_ICONS, HabitsApi } from './habits.api';

/**
 * Habits: "I quit drinking", "I quit smoking", or one's own, each with its run of clean days.
 * The counter needs nothing every day: a day is clean unless it is marked — here, by the evening
 * question in Telegram or by telling the assistant.
 */
@Component({
  selector: 'pd-habits-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HabitCardComponent,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoPipe,
  ],
  template: `
    <h1 class="page-title">{{ 'habits.title' | transloco }}</h1>
    <p class="intro">{{ 'habits.intro' | transloco }}</p>
    <div class="start">
      @for (kind of kinds; track kind) {
        <button matButton="tonal" (click)="start(kind)">
          <span class="emoji">{{ icons[kind] }}</span> {{ 'habits.start.' + kind | transloco }}
        </button>
      }
    </div>
    @if (habits.isLoading()) {
      <mat-progress-bar mode="indeterminate" />
    }
    @if (habits.error()) {
      <p class="error" role="alert">{{ 'habits.errors.load' | transloco }}</p>
    }
    <div class="grid">
      @for (habit of habits.value(); track habit.id) {
        <pd-habit-card [habit]="habit" (action)="act(habit, $event)" />
      } @empty {
        @if (!habits.isLoading()) {
          <p class="empty">{{ 'habits.empty' | transloco }}</p>
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .intro {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }
    .start {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .emoji {
      margin-right: 4px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(380px, 100%), 1fr));
      gap: 16px;
      align-items: start;
    }
    .empty {
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class HabitsPage {
  private readonly api = inject(HabitsApi);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  protected readonly kinds: HabitKind[] = ['alcohol', 'smoking', 'custom'];
  protected readonly icons = HABIT_ICONS;
  protected readonly habits = this.api.list();

  protected async start(kind: HabitKind): Promise<void> {
    const input = await this.open({ kind });
    if (input) {
      await this.run(this.api.create(input));
    }
  }

  protected async act(habit: Habit, action: HabitCardAction): Promise<void> {
    switch (action.type) {
      case 'mark':
        await this.run(
          this.api.mark(habit.id, action.day, { status: 'used', amount: action.amount }),
        );
        break;
      case 'unmark':
        await this.run(this.api.unmark(habit.id, action.day));
        break;
      case 'edit': {
        const input = await this.open({ kind: habit.kind, habit });
        if (input) {
          await this.run(this.api.update(habit.id, input));
        }
        break;
      }
      case 'remove': {
        const name =
          habit.kind === 'custom'
            ? (habit.name ?? '')
            : this.transloco.translate(`habits.kinds.${habit.kind}`);
        if (confirm(this.transloco.translate('habits.confirmDelete', { name }))) {
          await this.run(this.api.remove(habit.id));
        }
        break;
      }
    }
  }

  private open(data: HabitDialogData): Promise<HabitInput | undefined> {
    return firstValueFrom(
      this.dialog
        .open<HabitDialog, HabitDialogData, HabitInput>(HabitDialog, { data })
        .afterClosed(),
    );
  }

  /** A change, then the list again with the numbers it moved. */
  private async run(request: Observable<unknown>): Promise<void> {
    await firstValueFrom(request);
    this.habits.reload();
  }
}
