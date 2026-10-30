import {DatePipe} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {TranslocoPipe} from '@jsverse/transloco';
import {HealthIntake, HealthMedication, HealthRecord} from '@pd/contracts';
import {HealthDialogs} from '../dialogs/health-dialogs.service';
import {HealthApi} from '../health.api';
import {today} from '../health-labels';

/** What is taken now, and what was taken before: when, how much, why it was stopped. */
/** How far back "taken N of M" counts. */
const ADHERENCE_DAYS = 14;

@Component({
  selector: 'pd-health-medications-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoPipe,
  ],
  template: `
    <div class="toolbar">
      <button matButton="filled" [disabled]="!data()" (click)="add()">
        <mat-icon>add</mat-icon> {{ 'health.medication.add' | transloco }}
      </button>
    </div>
    @if (record.isLoading()) {
      <mat-progress-bar mode="indeterminate" />
    }
    @if (record.error()) {
      <p class="error" role="alert">{{ 'health.errors.load' | transloco }}</p>
    } @else if (data(); as data) {
      @for (group of groups(); track group.key) {
        @if (group.items.length) {
          <h2 class="section">{{ group.key | transloco }}</h2>
          @for (medication of group.items; track medication.id) {
            <mat-card appearance="outlined">
              <mat-card-content class="medication">
                <mat-icon>medication</mat-icon>
                <span class="body">
                  <span>
                    <b>{{ medication.name }}</b>
                    @if (medication.substance) {
                      <span class="hint">({{ medication.substance }})</span>
                    }
                  </span>
                  @if (medication.dose || medication.schedule) {
                    <span>
                      {{ medication.dose }}
                      @if (medication.dose && medication.schedule) {
                        ·
                      }
                      {{ medication.schedule }}
                    </span>
                  }
                  <span class="hint">
                    @if (medication.startedOn) {
                      {{ medication.startedOn | date: 'd MMM y' }}
                    }
                    @if (medication.stoppedOn) {
                      – {{ medication.stoppedOn | date: 'd MMM y' }}
                    } @else if (medication.startedOn) {
                      – {{ 'health.medication.now' | transloco }}
                    }
                  </span>
                  @if (medication.stopReason) {
                    <span class="hint">
                      {{ 'health.medication.stopReason' | transloco }}:
                      {{ medication.stopReason }}
                    </span>
                  }
                  @if (
                    medication.reminderTimes.length && !medication.stoppedOn
                  ) {
                    <span class="hint reminders">
                      <mat-icon>notifications</mat-icon>
                      {{ medication.reminderTimes.join(', ') }}
                      @if (adherence(data, medication); as taken) {
                        · {{ 'health.medication.adherence' | transloco: taken }}
                      }
                    </span>
                    @for (
                      intake of pending(data, medication);
                      track intake.id
                    ) {
                      <span class="intake">
                        {{
                          'health.medication.due'
                            | transloco: {time: intake.time}
                        }}
                        <button
                          matButton="tonal"
                          (click)="answer(intake, 'taken')"
                        >
                          {{ 'health.medication.taken' | transloco }}
                        </button>
                        <button matButton (click)="answer(intake, 'skipped')">
                          {{ 'health.medication.skip' | transloco }}
                        </button>
                      </span>
                    }
                  }
                  @if (medication.notes) {
                    <span class="words">{{ medication.notes }}</span>
                  }
                </span>
                <button
                  matIconButton
                  [attr.aria-label]="'core.actions.edit' | transloco"
                  (click)="edit(data, medication)"
                >
                  <mat-icon>edit</mat-icon>
                </button>
                <button
                  matIconButton
                  [attr.aria-label]="'core.actions.delete' | transloco"
                  (click)="remove(medication)"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </mat-card-content>
            </mat-card>
          }
        }
      }
      @if (!data.medications.length) {
        <p class="hint">{{ 'health.medication.empty' | transloco }}</p>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .section {
      margin: 8px 0 0;
      font: var(--mat-sys-title-small);
    }
    .medication {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding-top: 16px;
    }
    .medication > mat-icon {
      color: var(--mat-sys-primary);
    }
    .body {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .reminders {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .reminders mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .intake {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-top: 4px;
    }
    .words {
      white-space: pre-wrap;
    }
    .hint {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class MedicationsPage {
  private readonly api = inject(HealthApi);
  private readonly dialogs = inject(HealthDialogs);

  protected readonly record = this.api.record();
  protected readonly data = computed(() =>
    this.record.hasValue() ? this.record.value() : undefined,
  );
  /** The server sorts them: still taken first. */
  /** Today's reminders not answered yet: "taken" or "skipped" from the page too. */
  protected pending(
    data: HealthRecord,
    medication: HealthMedication,
  ): HealthIntake[] {
    const day = today();
    return data.intakes.filter(
      i =>
        i.medicationId === medication.id &&
        i.day === day &&
        i.status === 'pending',
    );
  }

  /** Of the answered reminders of the last two weeks, how many were taken. */
  protected adherence(
    data: HealthRecord,
    medication: HealthMedication,
  ): {taken: number; of: number} | null {
    const since = new Date(Date.now() - ADHERENCE_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const intakes = data.intakes.filter(
      i => i.medicationId === medication.id && i.day >= since,
    );
    return intakes.length
      ? {
          taken: intakes.filter(i => i.status === 'taken').length,
          of: intakes.length,
        }
      : null;
  }

  protected async answer(
    intake: HealthIntake,
    status: 'taken' | 'skipped',
  ): Promise<void> {
    await this.api.client.answerIntake(intake.id, {status});
    this.record.reload();
  }

  protected readonly groups = computed(() => {
    const medications = this.data()?.medications ?? [];
    return [
      {
        key: 'health.medication.current',
        items: medications.filter(m => !m.stoppedOn),
      },
      {
        key: 'health.medication.past',
        items: medications.filter(m => m.stoppedOn),
      },
    ];
  });

  protected async add(): Promise<void> {
    const record = this.data();
    if (record && (await this.dialogs.medication({record}))) {
      this.record.reload();
    }
  }

  protected async edit(
    record: HealthRecord,
    medication: HealthMedication,
  ): Promise<void> {
    if (await this.dialogs.medication({record, medication})) {
      this.record.reload();
    }
  }

  protected async remove(medication: HealthMedication): Promise<void> {
    if (
      await this.dialogs.remove(medication.name, () =>
        this.api.client.removeMedication(medication.id),
      )
    ) {
      this.record.reload();
    }
  }
}
