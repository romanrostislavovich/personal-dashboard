import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import { ACTIVITY_LOW_DISK_SHARE, ActivityComputer } from '@pd/contracts';
import { DurationPipe, SparklineComponent, SparklinePoint } from '@pd/web-core';
import { DiskAdvisorComponent } from './disk-advisor.component';

const GB = 1024 ** 3;
const MB = 1024 ** 2;

type Series = 'cpu' | 'memory' | 'gpu' | 'celsius' | 'battery';

/** One computer: what it reported last, the charts of the day, its system and processes. */
@Component({
  selector: 'pd-activity-computer-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    TranslocoPipe,
    DurationPipe,
    SparklineComponent,
    DiskAdvisorComponent,
  ],
  templateUrl: './computer-card.component.html',
  styleUrl: './computer-card.component.scss',
})
export class ComputerCardComponent {
  readonly computer = input.required<ActivityComputer>();
  /** The page is opened in the desktop app of this very computer: its disks can be cleaned. */
  readonly isThis = input(false);

  protected readonly gb = GB;
  protected readonly mb = MB;
  protected readonly lowShare = ACTIVITY_LOW_DISK_SHARE;

  protected readonly latest = computed(() => this.computer().latest);
  protected readonly system = computed(() => this.latest()?.system ?? null);

  /** The warmest thermal zone, and whether the system is cooling the processor down. */
  protected readonly heat = computed(() => {
    const zones = this.system()?.thermal ?? [];
    return zones.length
      ? {
          celsius: Math.max(...zones.map((zone) => zone.celsius)),
          throttling: zones.some((zone) => zone.throttling),
        }
      : null;
  });

  /** Capacity now against when new, percent. */
  protected readonly batteryHealth = computed(() => {
    const battery = this.system()?.battery;
    return battery?.designCapacity && battery.fullCapacity
      ? Math.round((battery.fullCapacity / battery.designCapacity) * 100)
      : null;
  });

  protected readonly charts = computed(() => {
    const history = this.computer().history;
    const series = (key: Series): SparklinePoint[] =>
      history.flatMap((point) => {
        const value = point[key];
        return value === null ? [] : [{ at: point.at, value }];
      });
    return {
      cpu: series('cpu'),
      memory: series('memory'),
      gpu: series('gpu'),
      celsius: series('celsius'),
      battery: series('battery'),
    };
  });
}
