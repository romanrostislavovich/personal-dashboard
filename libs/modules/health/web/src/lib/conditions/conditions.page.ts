import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoPipe } from '@jsverse/transloco';
import { HealthCondition, HealthDiagnosis, healthConditions, HealthRecord } from '@pd/contracts';
import { HealthDialogs } from '../dialogs/health-dialogs.service';
import { HealthApi } from '../health.api';
import { CountryPipe, SpecialityPipe } from '../health-labels';

/**
 * Conditions: the diagnoses of one code over the years, from every clinic and country, as one
 * line with its history — when it was first set, who confirmed or changed it, when it came back.
 */
@Component({
  selector: 'pd-health-conditions-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CountryPipe,
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    SpecialityPipe,
    TranslocoPipe,
  ],
  template: `
    <div class="toolbar">
      <button matButton="filled" [disabled]="!data()" (click)="add()">
        <mat-icon>add</mat-icon> {{ 'health.diagnosis.add' | transloco }}
      </button>
    </div>
    @if (record.isLoading()) {
      <mat-progress-bar mode="indeterminate" />
    }
    @if (record.error()) {
      <p class="error" role="alert">{{ 'health.errors.load' | transloco }}</p>
    } @else if (data(); as data) {
      @for (condition of conditions(); track condition.key) {
        <mat-card appearance="outlined">
          <mat-card-content class="condition">
            <div class="head">
              @if (condition.code) {
                <span class="code">{{ condition.code }}</span>
              }
              <span class="title">{{ condition.title }}</span>
              <span class="status" [class.active]="isActive(condition.status)">
                {{ 'health.statuses.' + condition.status | transloco }}
              </span>
              @if (isActive(condition.status)) {
                <button matButton (click)="close(data, condition)">
                  <mat-icon>task_alt</mat-icon> {{ 'health.diagnosis.close' | transloco }}
                </button>
              }
            </div>
            <p class="hint">
              {{
                'health.conditions.since' | transloco: { day: (condition.firstOn | date: 'MMMM y') }
              }}
              @if (condition.diagnoses.length > 1) {
                · {{ 'health.conditions.times' | transloco: { count: condition.diagnoses.length } }}
              }
            </p>
            @for (diagnosis of condition.diagnoses; track diagnosis.id) {
              <div class="diagnosis">
                <span class="day">{{ diagnosis.diagnosedOn | date: 'd MMM y' }}</span>
                <span class="body">
                  <span>{{ diagnosis.title }}</span>
                  <span class="hint">
                    {{ 'health.statuses.' + diagnosis.status | transloco }}
                    @if (where(data, diagnosis); as where) {
                      · {{ where.speciality | pdSpeciality }}
                      @if (where.country) {
                        · {{ where.country | pdCountry }}
                      }
                    }
                  </span>
                  @if (diagnosis.notes) {
                    <span class="words">{{ diagnosis.notes }}</span>
                  }
                </span>
                <button
                  matIconButton
                  [attr.aria-label]="'core.actions.edit' | transloco"
                  (click)="edit(data, diagnosis)"
                >
                  <mat-icon>edit</mat-icon>
                </button>
                <button
                  matIconButton
                  [attr.aria-label]="'core.actions.delete' | transloco"
                  (click)="remove(diagnosis)"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            }
          </mat-card-content>
        </mat-card>
      } @empty {
        <p class="hint">{{ 'health.conditions.empty' | transloco }}</p>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .condition {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding-top: 12px;
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 8px;
    }
    .code {
      font: var(--mat-sys-title-medium);
      color: var(--mat-sys-primary);
    }
    .title {
      flex: 1;
      font: var(--mat-sys-title-medium);
      overflow-wrap: anywhere;
    }
    .status {
      padding: 2px 10px;
      border-radius: 12px;
      font: var(--mat-sys-label-medium);
      background: var(--mat-sys-surface-container-high);
    }
    .status.active {
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
    .diagnosis {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding-top: 6px;
      border-top: 1px solid var(--pd-border);
    }
    .day {
      flex-shrink: 0;
      width: 96px;
      padding-top: 10px;
      color: var(--mat-sys-on-surface-variant);
    }
    .body {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding-top: 10px;
      min-width: 0;
      overflow-wrap: anywhere;
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
export class ConditionsPage {
  private readonly api = inject(HealthApi);
  private readonly dialogs = inject(HealthDialogs);

  protected readonly record = this.api.record();
  protected readonly data = computed(() =>
    this.record.hasValue() ? this.record.value() : undefined,
  );
  protected readonly conditions = computed(() => healthConditions(this.data()?.diagnoses ?? []));

  protected isActive(status: string): boolean {
    return status === 'confirmed' || status === 'suspected';
  }

  /** The speciality and country of the visit a diagnosis was set at. */
  protected where(data: HealthRecord, diagnosis: HealthDiagnosis) {
    const visit = data.visits.find((v) => v.id === diagnosis.visitId);
    return visit?.speciality || visit?.country ? visit : null;
  }

  protected async add(): Promise<void> {
    const record = this.data();
    if (record && (await this.dialogs.diagnosis({ record }))) {
      this.record.reload();
    }
  }

  /** The diagnosis taken off: recovered, ruled out or in remission — kept in its history. */
  protected async close(record: HealthRecord, condition: HealthCondition): Promise<void> {
    const closing = { system: condition.system, code: condition.code, title: condition.title };
    if (await this.dialogs.diagnosis({ record, closing })) {
      this.record.reload();
    }
  }

  protected async edit(record: HealthRecord, diagnosis: HealthDiagnosis): Promise<void> {
    if (await this.dialogs.diagnosis({ record, diagnosis })) {
      this.record.reload();
    }
  }

  protected async remove(diagnosis: HealthDiagnosis): Promise<void> {
    if (
      await this.dialogs.remove(diagnosis.title, () =>
        this.api.client.removeDiagnosis(diagnosis.id),
      )
    ) {
      this.record.reload();
    }
  }
}
