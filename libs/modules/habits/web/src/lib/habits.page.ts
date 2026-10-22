import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { EmptyStateComponent } from '@pd/web-core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Habit, HabitInput, HabitKind, isBuilding } from '@pd/contracts';
import { firstValueFrom, Observable } from 'rxjs';
import { HabitCardAction, HabitCardComponent } from './habit-card.component';
import { HabitDialog, HabitDialogData } from './habit.dialog';
import { BUILD_ICON, HABIT_ICONS, HabitsApi } from './habits.api';

/**
 * Habits: "I quit drinking", "I quit smoking", the gym, or one's own — to quit, with a run of
 * clean days, or to build, with the days done.
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
    NgTemplateOutlet,
    EmptyStateComponent,
    TranslocoPipe,
  ],
  template: `
    <h1 class="page-title">{{ 'habits.title' | transloco }}</h1>
    <p class="intro">{{ 'habits.intro' | transloco }}</p>
    <ng-template #starts>
      @for (kind of kinds; track kind) {
        <button matButton="tonal" (click)="start(kind)">
          <span class="emoji">{{ icons[kind] }}</span> {{ 'habits.start.' + kind | transloco }}
        </button>
      }
      <button matButton="tonal" (click)="start('gym', true)">
        <span class="emoji">{{ icons.gym }}</span> {{ 'habits.start.gym' | transloco }}
      </button>
      <button matButton="tonal" (click)="start('custom', true)">
        <span class="emoji">{{ buildIcon }}</span> {{ 'habits.start.build' | transloco }}
      </button>
    </ng-template>
    <!-- With habits the starts are a row on top; without, they are the empty page's action. -->
    @if (habits.value().length) {
      <div class="start"><ng-container *ngTemplateOutlet="starts" /></div>
    }
    @if (habits.isLoading()) {
      <mat-progress-bar mode="indeterminate" />
    }
    @if (habits.error()) {
      <p class="error" role="alert">{{ 'habits.errors.load' | transloco }}</p>
    }
    <div class="grid">
      @for (habit of habits.value(); track habit.id) {
        <pd-habit-card [habit]="habit" (action)="act(habit, $event)" />
      }
    </div>
    @if (!habits.isLoading() && !habits.error() && !habits.value().length) {
      <pd-empty-state
        icon="spa"
        [title]="'habits.emptyTitle' | transloco"
        [text]="'habits.empty' | transloco"
      >
        <ng-container *ngTemplateOutlet="starts" />
      </pd-empty-state>
    }
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

  /** The kinds to quit; the gym and one's own habit to build come after them. */
  protected readonly kinds: HabitKind[] = ['alcohol', 'smoking', 'custom'];
  protected readonly icons = HABIT_ICONS;
  protected readonly buildIcon = BUILD_ICON;
  protected readonly habits = this.api.list();

  protected async start(kind: HabitKind, build = false): Promise<void> {
    const input = await this.open({ kind, build });
    if (input) {
      await this.run(this.api.create(input));
    }
  }

  protected async act(habit: Habit, action: HabitCardAction): Promise<void> {
    switch (action.type) {
      case 'mark':
        await this.run(
          this.api.mark(habit.id, action.day, { status: action.status, amount: action.amount }),
        );
        break;
      case 'unmark':
        await this.run(this.api.unmark(habit.id, action.day));
        break;
      case 'edit': {
        const input = await this.open({ kind: habit.kind, habit, build: isBuilding(habit.goal) });
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
