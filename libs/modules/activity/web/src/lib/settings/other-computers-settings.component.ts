import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoPipe } from '@jsverse/transloco';
import { ActivityOtherComputer } from '@pd/contracts';
import { DurationPipe } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { lastDays } from '../activity-period';
import { ActivityApi } from '../activity.api';

/** How far back the list looks for computers. */
const DAYS = 30;

/**
 * Computers the desktop app does not run on, known from another service — a work laptop that
 * reports its time in an IDE to WakaTime. Their time is added to the time at the computer; a
 * computer that has the tracker is left out by itself (its time would be counted twice), and
 * any other can be switched off here.
 */
@Component({
  selector: 'pd-activity-other-computers-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatIconModule, MatSlideToggleModule, TranslocoPipe, DurationPipe],
  template: `
    @if (computers.value().length) {
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-icon mat-card-avatar>laptop_mac</mat-icon>
          <mat-card-title>{{ 'activity.otherComputers.title' | transloco }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <p class="hint">{{ 'activity.otherComputers.hint' | transloco }}</p>
          @for (item of computers.value(); track item.source + item.computer) {
            <div class="computer">
              <span class="body">
                <span>{{ item.computer }}</span>
                <span class="hint">
                  {{ 'activity.otherComputers.sources.' + item.source | transloco }} ·
                  {{
                    'activity.otherComputers.recent'
                      | transloco: { time: (item.seconds | pdDuration), days: days }
                  }}
                  @if (item.reason === 'tracked') {
                    · {{ 'activity.otherComputers.tracked' | transloco }}
                  }
                </span>
              </span>
              <mat-slide-toggle
                [checked]="item.counted"
                [disabled]="item.reason === 'tracked'"
                [attr.aria-label]="'activity.otherComputers.count' | transloco"
                (change)="setCounted(item, $event.checked)"
              />
            </div>
          }
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: `
    .hint {
      margin: 0 0 12px;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .computer {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
      border-top: 1px solid var(--pd-border);
    }
    .body {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .body .hint {
      margin: 0;
    }
  `,
})
export class OtherComputersSettingsComponent {
  private readonly api = inject(ActivityApi);
  private readonly settings = this.api.settings();
  protected readonly days = DAYS;
  protected readonly computers = this.api.otherComputers(() => lastDays(DAYS));

  /** Switched off, a computer goes to the list of the skipped ones; switched on, it leaves it. */
  protected async setCounted(item: ActivityOtherComputer, counted: boolean): Promise<void> {
    const skipped = (this.settings.value()?.skippedComputers ?? []).filter(
      (name) => name.toLowerCase() !== item.computer.toLowerCase(),
    );
    await firstValueFrom(
      this.api.saveSettings({ skippedComputers: counted ? skipped : [...skipped, item.computer] }),
    );
    this.settings.reload();
    this.computers.reload();
  }
}
