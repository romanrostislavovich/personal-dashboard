import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoPipe } from '@jsverse/transloco';
import { Habit, HabitGoal, HabitInput, HabitKind } from '@pd/contracts';
import { HABIT_ICONS, localToday } from './habits.api';

export interface HabitDialogData {
  kind: HabitKind;
  habit?: Habit;
}

/** The evening question asks at this time unless set otherwise. */
const DEFAULT_ASK_AT = '21:00';

/**
 * "I quit drinking", "I quit smoking", or a habit of one's own: the goal (not at all, or at most
 * a few days a week), from which day it counts, what a day with it is counted in, and the
 * evening question in Telegram.
 */
@Component({
  selector: 'pd-habit-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    ReactiveFormsModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ icon }}
      {{ (data.habit ? 'habits.dialog.edit' : 'habits.start.' + data.kind) | transloco }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form">
        @if (data.kind === 'custom') {
          <mat-form-field>
            <mat-label>{{ 'habits.dialog.name' | transloco }}</mat-label>
            <input matInput maxlength="100" formControlName="name" required cdkFocusInitial />
            <mat-hint>{{ 'habits.dialog.nameHint' | transloco }}</mat-hint>
          </mat-form-field>
        }

        <span class="label">{{ 'habits.dialog.goal' | transloco }}</span>
        <mat-button-toggle-group formControlName="goal" [hideSingleSelectionIndicator]="true">
          <mat-button-toggle value="quit">{{ 'habits.goals.quit' | transloco }}</mat-button-toggle>
          <mat-button-toggle value="less">{{ 'habits.goals.less' | transloco }}</mat-button-toggle>
        </mat-button-toggle-group>
        @if (form.controls.goal.value === 'less') {
          <mat-form-field>
            <mat-label>{{ 'habits.dialog.maxDays' | transloco }}</mat-label>
            <input matInput type="number" min="0" max="6" formControlName="maxDaysPerWeek" />
            <mat-hint>{{ 'habits.dialog.maxDaysHint' | transloco }}</mat-hint>
          </mat-form-field>
        }

        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'habits.dialog.startedOn' | transloco }}</mat-label>
            <input matInput type="date" formControlName="startedOn" required />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'habits.dialog.unit' | transloco }}</mat-label>
            <input matInput maxlength="30" formControlName="unit" />
            <mat-hint>{{ 'habits.dialog.unitHint.' + data.kind | transloco }}</mat-hint>
          </mat-form-field>
        </div>

        <mat-slide-toggle formControlName="ask">
          {{ 'habits.dialog.ask' | transloco }}
        </mat-slide-toggle>
        @if (form.controls.ask.value) {
          <mat-form-field class="time">
            <mat-label>{{ 'habits.dialog.askAt' | transloco }}</mat-label>
            <input matInput type="time" formControlName="askAt" required />
          </mat-form-field>
        }
        <p class="hint">{{ 'habits.dialog.askHint' | transloco }}</p>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>
          {{ 'core.actions.cancel' | transloco }}
        </button>
        <button matButton="filled" type="submit" [disabled]="form.invalid">
          {{ (data.habit ? 'core.actions.save' : 'habits.dialog.start') | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: min(460px, 80vw);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .row > * {
      flex: 1 1 180px;
    }
    .label {
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-on-surface-variant);
    }
    .time {
      max-width: 200px;
    }
    .hint {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class HabitDialog {
  protected readonly data = inject<HabitDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<HabitDialog, HabitInput>);
  protected readonly icon = HABIT_ICONS[this.data.kind];

  private readonly habit = this.data.habit;
  protected readonly form = inject(NonNullableFormBuilder).group({
    name: this.habit?.name ?? '',
    goal: (this.habit?.goal ?? 'quit') as HabitGoal,
    maxDaysPerWeek: this.habit?.maxDaysPerWeek ?? 2,
    unit: this.habit?.unit ?? '',
    startedOn: [this.habit?.startedOn ?? localToday(), Validators.required],
    ask: this.habit ? !!this.habit.askAt : true,
    askAt: this.habit?.askAt ?? DEFAULT_ASK_AT,
  });

  protected save(): void {
    const value = this.form.getRawValue();
    this.ref.close({
      kind: this.data.kind,
      name: this.data.kind === 'custom' ? value.name.trim() : null,
      goal: value.goal,
      maxDaysPerWeek: value.goal === 'less' ? Number(value.maxDaysPerWeek) : null,
      unit: value.unit.trim() || null,
      startedOn: value.startedOn,
      askAt: value.ask ? value.askAt : null,
    });
  }
}
