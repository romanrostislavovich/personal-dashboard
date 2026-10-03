import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LifeGoal, LifeGoalInput } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { GoalFormData, GoalFormDialog } from './goal-form.dialog';
import { LifeApi } from './life.api';

/** Goals of a year counted from the modules ("300 diary days") or by hand ("read 20 books"). */
@Component({
  selector: 'pd-life-goals-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoPipe,
  ],
  template: `
    <header class="toolbar">
      <button
        matIconButton
        [attr.aria-label]="'life.previous' | transloco"
        (click)="year.set(year() - 1)"
      >
        <mat-icon>chevron_left</mat-icon>
      </button>
      <span class="year">{{ year() }}</span>
      <button
        matIconButton
        [attr.aria-label]="'life.next' | transloco"
        (click)="year.set(year() + 1)"
      >
        <mat-icon>chevron_right</mat-icon>
      </button>
      <span class="spacer"></span>
      <button matButton="filled" (click)="openForm()">
        <mat-icon>add</mat-icon> {{ 'life.goals.add' | transloco }}
      </button>
    </header>

    <div class="goals">
      @for (goal of goals.value(); track goal.id) {
        <mat-card appearance="outlined" [class]="goal.status">
          <mat-card-header>
            <mat-icon mat-card-avatar>{{ goal.icon }}</mat-icon>
            <mat-card-title>{{ goal.title }}</mat-card-title>
            <mat-card-subtitle>
              @if (goal.metric) {
                {{ goal.metric | transloco }}
              } @else {
                {{ 'life.goals.manual' | transloco }}
              }
              ·
              {{
                (goal.direction === 'atMost' ? 'life.goals.atMost' : 'life.goals.atLeast')
                  | transloco
              }}
            </mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="amounts">
              <span class="value">
                @if (goal.format === 'money') {
                  {{ goal.value | currency: goal.currency : 'symbol' : '1.0-0' }}
                } @else {
                  {{ goal.value | number: '1.0-1' }}
                }
              </span>
              <span class="target">
                /
                @if (goal.format === 'money') {
                  {{ goal.target | currency: goal.currency : 'symbol' : '1.0-0' }}
                } @else {
                  {{ goal.target | number: '1.0-1' }}
                }
              </span>
              <span class="status">{{ 'life.goals.status.' + goal.status | transloco }}</span>
            </div>
            <mat-progress-bar mode="determinate" [value]="percent(goal)" />
            @if (goal.status !== 'done' && goal.status !== 'failed') {
              <p class="hint">
                {{
                  'life.goals.expected' | transloco: { value: (goal.expected | number: '1.0-1') }
                }}
              </p>
            }
          </mat-card-content>
          <mat-card-actions align="end">
            @if (!goal.metric) {
              <button matButton (click)="add(goal, 1)">+1</button>
              <button matButton (click)="setProgress(goal)">
                {{ 'life.goals.setProgress' | transloco }}
              </button>
            }
            <button
              matIconButton
              [attr.aria-label]="'core.actions.edit' | transloco"
              (click)="openForm(goal)"
            >
              <mat-icon>edit</mat-icon>
            </button>
            <button
              matIconButton
              [attr.aria-label]="'core.actions.delete' | transloco"
              (click)="remove(goal)"
            >
              <mat-icon>delete</mat-icon>
            </button>
          </mat-card-actions>
        </mat-card>
      } @empty {
        @if (!goals.isLoading()) {
          <p class="hint">{{ 'life.goals.empty' | transloco }}</p>
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
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
    }
    .year {
      font: var(--mat-sys-title-large);
    }
    .spacer {
      flex: 1;
    }
    .goals {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr));
      gap: 16px;
    }
    mat-icon[mat-card-avatar] {
      display: grid;
      place-items: center;
      color: var(--mat-sys-primary);
    }
    .amounts {
      display: flex;
      align-items: baseline;
      gap: 6px;
      margin: 8px 0;
    }
    .value {
      font: var(--mat-sys-headline-small);
    }
    .target,
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
    .hint {
      font: var(--mat-sys-body-small);
    }
    .status {
      margin-left: auto;
      font: var(--mat-sys-label-large);
    }
    .done .status,
    .onTrack .status {
      color: var(--mat-sys-primary);
    }
    .behind .status,
    .failed .status {
      color: var(--mat-sys-error);
    }
  `,
})
export class GoalsPage {
  private readonly api = inject(LifeApi);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  protected readonly year = signal(
    Number(inject(ActivatedRoute).snapshot.queryParamMap.get('year')) || new Date().getFullYear(),
  );
  protected readonly goals = this.api.goals(this.year);
  private readonly metrics = this.api.metrics();

  protected percent(goal: LifeGoal): number {
    return Math.max(0, Math.min(100, Math.round((goal.value / goal.target) * 100)));
  }

  protected async openForm(goal?: LifeGoal): Promise<void> {
    const input = await firstValueFrom(
      this.dialog
        .open<GoalFormDialog, GoalFormData, LifeGoalInput>(GoalFormDialog, {
          data: {
            goal: goal ?? null,
            year: goal?.year ?? this.year(),
            metrics: this.metrics.value(),
          },
        })
        .afterClosed(),
    );
    if (input) {
      await firstValueFrom(this.api.saveGoal(input, goal?.id));
      this.goals.reload();
    }
  }

  protected async add(goal: LifeGoal, by: number): Promise<void> {
    await firstValueFrom(this.api.setProgress(goal.id, Math.max(0, goal.value + by)));
    this.goals.reload();
  }

  protected async setProgress(goal: LifeGoal): Promise<void> {
    const answer = prompt(this.transloco.translate('life.goals.setProgress'), String(goal.value));
    const value = Number(answer?.replace(',', '.'));
    if (answer !== null && Number.isFinite(value) && value >= 0) {
      await firstValueFrom(this.api.setProgress(goal.id, value));
      this.goals.reload();
    }
  }

  protected async remove(goal: LifeGoal): Promise<void> {
    if (confirm(this.transloco.translate('life.goals.confirmDelete', { title: goal.title }))) {
      await firstValueFrom(this.api.removeGoal(goal.id));
      this.goals.reload();
    }
  }
}
