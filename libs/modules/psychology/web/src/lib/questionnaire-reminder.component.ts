import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { PsychologySettingsInput, REMINDER_PERIODS } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { PsychologyApi } from './psychology.api';

/**
 * A questionnaire on a schedule: which one, how often, at what time — a message in Telegram
 * with the link, unless it was taken within the period anyway.
 */
@Component({
  selector: 'pd-questionnaire-reminder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule, TranslocoPipe],
  template: `
    @if (settings.value(); as current) {
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-card-title>⏰ {{ 'psychology.reminder.title' | transloco }}</mat-card-title>
          <mat-card-subtitle>{{ 'psychology.reminder.hint' | transloco }}</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content class="row">
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'psychology.reminder.test' | transloco }}</mat-label>
            <mat-select
              [value]="current.reminderTest"
              (selectionChange)="save({ reminderTest: $event.value })"
            >
              <mat-option [value]="null">{{ 'psychology.reminder.off' | transloco }}</mat-option>
              <mat-option value="who5">WHO-5</mat-option>
              <mat-option value="gad7">GAD-7</mat-option>
              <mat-option value="phq9">PHQ-9</mat-option>
            </mat-select>
          </mat-form-field>
          @if (current.reminderTest) {
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ 'psychology.reminder.every' | transloco }}</mat-label>
              <mat-select
                [value]="current.reminderEveryDays"
                (selectionChange)="save({ reminderEveryDays: $event.value })"
              >
                @for (days of periods; track days) {
                  <mat-option [value]="days">
                    {{ 'psychology.reminder.days' | transloco: { days } }}
                  </mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ 'psychology.reminder.at' | transloco }}</mat-label>
              <input
                matInput
                type="time"
                [value]="current.reminderAt"
                (change)="save({ reminderAt: $any($event.target).value })"
              />
            </mat-form-field>
          }
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: `
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      padding-top: 12px;
    }
  `,
})
export class QuestionnaireReminderComponent {
  private readonly api = inject(PsychologyApi);
  protected readonly settings = this.api.settings();
  protected readonly periods = REMINDER_PERIODS;

  protected async save(change: PsychologySettingsInput): Promise<void> {
    await firstValueFrom(this.api.saveSettings(change));
    this.settings.reload();
  }
}
