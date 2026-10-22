import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
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
 * Time from devices the desktop app does not run on, known from another service — a work laptop
 * that reports its time in an IDE to WakaTime, games from Steam. It is added to the time at the
 * computer, and each can be switched off here. A computer that has the tracker is left out by
 * itself (its time would be counted twice): it is only named under the list.
 */
@Component({
  selector: 'pd-activity-other-computers-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatIconModule, MatSlideToggleModule, TranslocoPipe, DurationPipe],
  template: `
    @if (computers.value().length) {
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-icon mat-card-avatar>devices_other</mat-icon>
          <mat-card-title>{{ 'activity.otherComputers.title' | transloco }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <p class="hint">{{ 'activity.otherComputers.hint' | transloco }}</p>
          @for (item of others(); track item.source + item.computer) {
            <div class="computer" [class.off]="!item.counted">
              <mat-icon>{{ icons[item.source] ?? 'laptop_mac' }}</mat-icon>
              <span class="body">
                <span>
                  {{
                    item.source === 'extension'
                      ? ('activity.otherComputers.browser' | transloco)
                      : item.computer
                  }}
                  ·
                  {{
                    'activity.otherComputers.recent'
                      | transloco: { time: (item.seconds | pdDuration), days: days }
                  }}
                </span>
                <span class="hint">
                  {{ 'activity.otherComputers.explain.' + item.source | transloco }}
                </span>
              </span>
              <mat-slide-toggle
                labelPosition="before"
                [checked]="item.counted"
                (change)="setCounted(item, $event.checked)"
                >{{ 'activity.otherComputers.count' | transloco }}</mat-slide-toggle
              >
            </div>
          }
          @if (tracked().length) {
            <p class="hint tracked">
              <mat-icon inline>check_circle</mat-icon>
              {{ 'activity.otherComputers.tracked' | transloco: { names: tracked().join(', ') } }}
            </p>
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
    .computer.off .body {
      opacity: 0.6;
    }
    .tracked {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 8px 0 0;
      padding-top: 8px;
      border-top: 1px solid var(--pd-border);
    }
  `,
})
export class OtherComputersSettingsComponent {
  protected readonly icons: Record<string, string> = {
    steam: 'sports_esports',
    extension: 'public',
  };
  private readonly api = inject(ActivityApi);
  private readonly settings = this.api.settings();
  protected readonly days = DAYS;
  protected readonly computers = this.api.otherComputers(() => lastDays(DAYS));
  /** What may be added; a computer with the tracker has nothing to choose, it is only named. */
  protected readonly others = computed(() =>
    this.computers.value().filter((item) => item.reason !== 'tracked'),
  );
  protected readonly tracked = computed(() => [
    ...new Set(
      this.computers
        .value()
        .filter((item) => item.reason === 'tracked')
        .map((item) => item.computer),
    ),
  ]);

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
