import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {TranslocoPipe} from '@jsverse/transloco';
import {CalmSettings, NO_CALM} from '@pd/contracts';
import {AuthService} from '../auth/auth.service';

/** Quiet hours as first offered: the evening and the night. */
const DEFAULT_HOURS = {from: '21:00', to: '09:00'};

/**
 * A calmer dashboard, for every device of the account (see CalmSettings): notifications wait
 * through the quiet hours and come in the morning as one message; overdue tasks are not red
 * and not named in the morning digest.
 */
@Component({
  selector: 'pd-calm-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSlideToggleModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>spa</mat-icon>
        <mat-card-title>{{
          'core.settings.calm.title' | transloco
        }}</mat-card-title>
        <mat-card-subtitle>{{
          'core.settings.calm.hint' | transloco
        }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content class="content">
        <mat-slide-toggle
          [checked]="!!calm().quietHours"
          (change)="toggleQuiet($event.checked)"
        >
          {{ 'core.settings.calm.quiet' | transloco }}
        </mat-slide-toggle>
        <p class="hint">{{ 'core.settings.calm.quietHint' | transloco }}</p>
        @if (calm().quietHours; as hours) {
          <div class="hours">
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ 'core.settings.calm.from' | transloco }}</mat-label>
              <input
                matInput
                type="time"
                [value]="hours.from"
                (change)="
                  setHours({from: $any($event.target).value, to: hours.to})
                "
              />
            </mat-form-field>
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ 'core.settings.calm.to' | transloco }}</mat-label>
              <input
                matInput
                type="time"
                [value]="hours.to"
                (change)="
                  setHours({from: hours.from, to: $any($event.target).value})
                "
              />
            </mat-form-field>
          </div>
        }
        <mat-slide-toggle
          [checked]="calm().softOverdue"
          (change)="save({softOverdue: $event.checked})"
        >
          {{ 'core.settings.calm.softOverdue' | transloco }}
        </mat-slide-toggle>
        <p class="hint">
          {{ 'core.settings.calm.softOverdueHint' | transloco }}
        </p>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .content {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-top: 12px;
    }
    .hours {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .hint {
      margin: 0 0 8px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class CalmSettingsComponent {
  private readonly auth = inject(AuthService);
  protected readonly calm = computed(() => this.auth.user()?.calm ?? NO_CALM);

  protected toggleQuiet(on: boolean): Promise<void> {
    return this.save({quietHours: on ? DEFAULT_HOURS : null});
  }

  protected setHours(hours: {from: string; to: string}): Promise<void> {
    // A cleared field or the same start and end: nothing to keep.
    if (!hours.from || !hours.to || hours.from === hours.to) {
      return Promise.resolve();
    }
    return this.save({quietHours: hours});
  }

  protected save(change: Partial<CalmSettings>): Promise<void> {
    return this.auth.updateProfile({calm: {...this.calm(), ...change}});
  }
}
