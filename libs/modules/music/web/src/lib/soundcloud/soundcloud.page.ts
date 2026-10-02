import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { SoundcloudTrack } from '@pd/contracts';
import { errorBody, INTEGRATIONS_LINK, SparklineComponent } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { MusicApi } from '../music.api';

type SortColumn =
  'title' | 'plays' | 'playsWeek' | 'likes' | 'reposts' | 'comments' | 'publishedAt';

/** Sortable columns after the title; all of them are numbers except the date. */
const COLUMNS: { column: SortColumn; labelKey: string }[] = [
  { column: 'plays', labelKey: 'music.soundcloud.plays' },
  { column: 'playsWeek', labelKey: 'music.soundcloud.week' },
  { column: 'likes', labelKey: 'music.soundcloud.likes' },
  { column: 'reposts', labelKey: 'music.soundcloud.reposts' },
  { column: 'comments', labelKey: 'music.soundcloud.comments' },
  { column: 'publishedAt', labelKey: 'music.soundcloud.published' },
];

/**
 * The user's own tracks on SoundCloud: the totals, how plays grow and a table of the tracks.
 * A bell in a row switches the notifications of that track.
 */
@Component({
  selector: 'pd-soundcloud-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    RouterLink,
    TranslocoPipe,
    SparklineComponent,
  ],
  templateUrl: './soundcloud.page.html',
  styleUrl: './soundcloud.page.scss',
})
export class SoundcloudPage {
  private readonly api = inject(MusicApi);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly stats = this.api.soundcloud();
  protected readonly busy = signal(false);
  /** SoundCloud is connected in Settings → Integrations (soundcloud.integration.ts). */
  protected readonly integrations = INTEGRATIONS_LINK;
  protected readonly columns = COLUMNS;
  protected readonly sort = signal<{ column: SortColumn; descending: boolean }>({
    column: 'plays',
    descending: true,
  });

  protected readonly rows = computed(() => {
    const { column, descending } = this.sort();
    const value = (track: SoundcloudTrack): string | number =>
      column === 'playsWeek' ? track.playsDelta.week : track[column];
    return [...(this.stats.value()?.tracks ?? [])].sort((a, b) => {
      const [left, right] = [value(a), value(b)];
      const order =
        typeof left === 'string' ? left.localeCompare(String(right)) : left - Number(right);
      return descending ? -order : order;
    });
  });

  /** Plays of all tracks per day; a chart needs two days of history. */
  protected readonly playsPoints = computed(() =>
    (this.stats.value()?.history ?? []).map(({ day, plays }) => ({ at: day, value: plays })),
  );

  /** A second click on the same column turns the order around; text starts A→Z, numbers high→low. */
  protected sortBy(column: SortColumn): void {
    this.sort.update((sort) => ({
      column,
      descending: sort.column === column ? !sort.descending : column !== 'title',
    }));
  }

  protected ariaSort(column: SortColumn): 'ascending' | 'descending' | 'none' {
    const sort = this.sort();
    return sort.column !== column ? 'none' : sort.descending ? 'descending' : 'ascending';
  }

  protected async toggleNotify(track: SoundcloudTrack): Promise<void> {
    await firstValueFrom(this.api.updateSoundcloudTrack(track.id, { notify: !track.notify }));
    this.stats.reload();
  }

  async sync(): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.syncSoundcloud());
    } catch (error) {
      // SoundCloud explains itself (an expired token) — show its words.
      const message = (errorBody(error) as { message?: string } | null)?.message;
      this.snackBar.open(message ?? this.transloco.translate('music.connect.error'), 'OK', {
        duration: 8000,
      });
    } finally {
      this.stats.reload();
      this.busy.set(false);
    }
  }
}
