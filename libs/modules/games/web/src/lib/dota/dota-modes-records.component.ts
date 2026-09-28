import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { DotaOverview, DotaRecord } from '@pd/contracts';

const RECORD_ICONS: Record<DotaRecord['kind'], string> = {
  kills: 'swords',
  assists: 'handshake',
  goldPerMin: 'paid',
  heroDamage: 'local_fire_department',
  lastHits: 'agriculture',
  durationSec: 'hourglass_bottom',
};

/** Win rate per game mode and personal records (the best match per stat), side by side. */
@Component({
  selector: 'pd-dota-modes-records',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, PercentPipe, MatIconModule, TranslocoPipe],
  templateUrl: './dota-modes-records.component.html',
  styleUrl: './dota-modes-records.component.scss',
})
export class DotaModesRecordsComponent {
  readonly modes = input.required<DotaOverview['modes']>();
  readonly records = input.required<DotaOverview['records']>();

  protected readonly recordIcon = RECORD_ICONS;
}
