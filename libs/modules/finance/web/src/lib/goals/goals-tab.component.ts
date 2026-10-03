import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { GoalContribution, Project, SavingsGoal, SavingsGoalInput } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { FinanceApi } from '../finance.api';
import { ContributionData, ContributionDialog } from './contribution.dialog';
import { GoalFormData, GoalFormDialog } from './goal-form.dialog';

/** Savings goals: how much is saved, how much to put aside a month, money added by hand. */
@Component({
  selector: 'pd-goals-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    TranslocoPipe,
  ],
  template: `
    <div class="actions">
      <p class="hint">{{ 'finance.goals.hint' | transloco }}</p>
      <button matButton="filled" (click)="openForm()">
        <mat-icon>add</mat-icon> {{ 'finance.goals.add' | transloco }}
      </button>
    </div>

    <div class="goals">
      @for (goal of goals.value(); track goal.id) {
        <mat-card appearance="outlined" [class.reached]="goal.saved >= goal.target">
          <mat-card-header>
            <mat-icon mat-card-avatar>{{
              goal.saved >= goal.target ? 'celebration' : 'savings'
            }}</mat-icon>
            <mat-card-title>{{ goal.name }}</mat-card-title>
            <mat-card-subtitle>
              {{ walletName(goal) }}
              @if (goal.deadline) {
                ·
                {{ 'finance.goals.until' | transloco: { date: (goal.deadline | date: 'd MMM y') } }}
              }
            </mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="amounts">
              <span class="saved">{{
                goal.saved | currency: goal.currency : 'symbol' : '1.0-0'
              }}</span>
              <span class="target"
                >/ {{ goal.target | currency: goal.currency : 'symbol' : '1.0-0' }}</span
              >
              <span class="percent">{{ percent(goal) }}%</span>
            </div>
            <mat-progress-bar mode="determinate" [value]="percent(goal)" />
            <p class="pace">
              @if (goal.saved >= goal.target) {
                {{ 'finance.goals.done' | transloco }}
              } @else if (goal.neededPerMonth !== null) {
                <span [class.behind]="goal.pacePerMonth < goal.neededPerMonth">
                  {{
                    'finance.goals.needed'
                      | transloco
                        : {
                            amount:
                              (goal.neededPerMonth | currency: goal.currency : 'symbol' : '1.0-0'),
                          }
                  }}
                </span>
                ·
                {{
                  'finance.goals.pace'
                    | transloco
                      : {
                          amount:
                            (goal.pacePerMonth | currency: goal.currency : 'symbol' : '1.0-0'),
                        }
                }}
              } @else {
                {{
                  'finance.goals.pace'
                    | transloco
                      : {
                          amount:
                            (goal.pacePerMonth | currency: goal.currency : 'symbol' : '1.0-0'),
                        }
                }}
              }
            </p>
            @if (goal.wallet) {
              <p class="split">
                {{
                  'finance.goals.split'
                    | transloco
                      : {
                          wallet: (goal.fromWallet | currency: goal.currency : 'symbol' : '1.0-0'),
                          added: (goal.added | currency: goal.currency : 'symbol' : '1.0-0'),
                        }
                }}
              </p>
            }

            @if (open() === goal.id) {
              <ul class="history">
                @for (item of history.value(); track item.id) {
                  <li>
                    <span>{{ item.occurredOn | date: 'd MMM y' }}</span>
                    <span class="note">{{ item.note }}</span>
                    <span [class.out]="item.amount < 0">
                      {{ item.amount | currency: goal.currency }}
                    </span>
                    <button
                      matIconButton
                      [attr.aria-label]="'core.actions.delete' | transloco"
                      (click)="removeContribution(goal, item.id)"
                    >
                      <mat-icon>close</mat-icon>
                    </button>
                  </li>
                } @empty {
                  <li class="hint">{{ 'finance.goals.noHistory' | transloco }}</li>
                }
              </ul>
            }
          </mat-card-content>
          <mat-card-actions align="end">
            <button matButton (click)="contribute(goal)">
              <mat-icon>add_card</mat-icon> {{ 'finance.goals.contribute' | transloco }}
            </button>
            <button
              matIconButton
              [matTooltip]="'finance.goals.history' | transloco"
              [attr.aria-label]="'finance.goals.history' | transloco"
              (click)="toggleHistory(goal.id)"
            >
              <mat-icon>history</mat-icon>
            </button>
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
          <p class="hint">{{ 'finance.goals.empty' | transloco }}</p>
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding-top: 16px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .goals {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(340px, 100%), 1fr));
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
    .saved {
      font: var(--mat-sys-headline-small);
    }
    .target {
      color: var(--mat-sys-on-surface-variant);
    }
    .percent {
      margin-left: auto;
      font: var(--mat-sys-label-large);
    }
    .pace,
    .split,
    .hint {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .behind {
      color: var(--mat-sys-error);
    }
    .reached .saved {
      color: var(--mat-sys-primary);
    }
    .history {
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
    }
    .history li {
      display: flex;
      align-items: center;
      gap: 8px;
      font: var(--mat-sys-body-small);
    }
    .note {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--mat-sys-on-surface-variant);
    }
    .out {
      color: var(--mat-sys-error);
    }
  `,
})
export class GoalsTabComponent {
  readonly projects = input.required<Project[]>();
  /** New goals start in it. */
  readonly currency = input.required<string>();

  private readonly api = inject(FinanceApi);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  protected readonly goals = this.api.goals();
  /** The goal whose history is shown. */
  protected readonly open = signal<string | null>(null);
  protected readonly history = this.api.goalContributions(this.open);

  protected percent(goal: SavingsGoal): number {
    return Math.max(0, Math.min(100, Math.round((goal.saved / goal.target) * 100)));
  }

  protected walletName(goal: SavingsGoal): string {
    if (!goal.wallet) {
      return this.transloco.translate('finance.goals.byHand');
    }
    if (goal.wallet === 'personal') {
      return this.transloco.translate('finance.scope.personal');
    }
    return this.projects().find((project) => project.id === goal.wallet)?.name ?? '';
  }

  protected toggleHistory(id: string): void {
    this.open.update((current) => (current === id ? null : id));
  }

  protected async openForm(goal?: SavingsGoal): Promise<void> {
    const input = await firstValueFrom(
      this.dialog
        .open<GoalFormDialog, GoalFormData, SavingsGoalInput>(GoalFormDialog, {
          data: { goal: goal ?? null, projects: this.projects(), currency: this.currency() },
        })
        .afterClosed(),
    );
    if (input) {
      await firstValueFrom(this.api.saveGoal(input, goal?.id));
      this.goals.reload();
    }
  }

  protected async contribute(goal: SavingsGoal): Promise<void> {
    const input = await firstValueFrom(
      this.dialog
        .open<ContributionDialog, ContributionData, GoalContribution>(ContributionDialog, {
          data: { goalName: goal.name, currency: goal.currency },
        })
        .afterClosed(),
    );
    if (input) {
      await firstValueFrom(this.api.contribute(goal.id, input));
      this.goals.reload();
      this.history.reload();
    }
  }

  protected async removeContribution(goal: SavingsGoal, id: string): Promise<void> {
    await firstValueFrom(this.api.removeContribution(goal.id, id));
    this.goals.reload();
    this.history.reload();
  }

  protected async remove(goal: SavingsGoal): Promise<void> {
    if (confirm(this.transloco.translate('finance.goals.confirmDelete', { name: goal.name }))) {
      await firstValueFrom(this.api.removeGoal(goal.id));
      this.goals.reload();
    }
  }
}
