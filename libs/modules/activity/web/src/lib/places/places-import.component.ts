import {DecimalPipe} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {TranslocoPipe} from '@jsverse/transloco';
import {
  parseGoogleTimeline,
  PhoneLocationInput,
  TimelinePlaceName,
} from '@pd/contracts';
import {firstValueFrom} from 'rxjs';
import {ActivityApi} from '../activity.api';

const BATCH = 500;
const NAMES_BATCH = 200;

/**
 * The old timeline of Google Maps, from a Takeout file (or the export of the phone's Maps): read
 * here, in the browser — a year of it is hundreds of megabytes — and sent in batches. A batch
 * sent twice is written once, so a file imported again adds only what is new.
 */
@Component({
  selector: 'pd-places-import',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>history</mat-icon>
        <mat-card-title>{{
          'activity.places.import.title' | transloco
        }}</mat-card-title>
        <mat-card-subtitle>{{
          'activity.places.import.hint' | transloco
        }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content class="content">
        <input
          #file
          type="file"
          accept=".json,application/json"
          multiple
          hidden
          (change)="read(file.files); file.value = ''"
        />
        <button matButton="tonal" [disabled]="busy()" (click)="file.click()">
          <mat-icon>upload_file</mat-icon>
          {{ 'activity.places.import.pick' | transloco }}
        </button>
        @if (busy()) {
          <mat-progress-bar mode="determinate" [value]="progress()" />
        }
        @if (result(); as r) {
          <p class="hint">
            {{
              'activity.places.import.done'
                | transloco
                  : {
                      saved: (r.saved | number),
                      read: (r.read | number),
                      names: r.names,
                    }
            }}
          </p>
        }
        @if (failed()) {
          <p class="error" role="alert">
            {{ 'activity.places.import.failed' | transloco }}
          </p>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .content {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      padding-top: 8px;
    }
    mat-progress-bar {
      width: 100%;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class PlacesImportComponent {
  private readonly api = inject(ActivityApi);

  /** The import is over: the page reads the day again. */
  readonly imported = output<void>();

  protected readonly busy = signal(false);
  protected readonly progress = signal(0);
  protected readonly failed = signal(false);
  protected readonly result = signal<{
    saved: number;
    read: number;
    names: number;
  } | null>(null);

  protected async read(files: FileList | null): Promise<void> {
    if (!files?.length) {
      return;
    }
    this.busy.set(true);
    this.failed.set(false);
    this.result.set(null);
    this.progress.set(0);
    try {
      const locations: PhoneLocationInput[] = [];
      const names: TimelinePlaceName[] = [];
      for (const file of Array.from(files)) {
        const parsed = parseGoogleTimeline(JSON.parse(await file.text()));
        locations.push(...parsed.locations);
        names.push(...parsed.names);
      }
      if (!locations.length) {
        this.failed.set(true);
        return;
      }
      const batches = Math.ceil(locations.length / BATCH);
      let saved = 0;
      for (let i = 0; i < batches; i++) {
        const answer = await firstValueFrom(
          this.api.importTimeline({
            locations: locations.slice(i * BATCH, (i + 1) * BATCH),
            names: names.slice(i * NAMES_BATCH, (i + 1) * NAMES_BATCH),
          }),
        );
        saved += answer.saved;
        this.progress.set(Math.round(((i + 1) / batches) * 100));
      }
      // Names beyond what the location batches carried.
      for (let i = batches * NAMES_BATCH; i < names.length; i += NAMES_BATCH) {
        await firstValueFrom(
          this.api.importTimeline({
            locations: [],
            names: names.slice(i, i + NAMES_BATCH),
          }),
        );
      }
      this.result.set({saved, read: locations.length, names: names.length});
      this.imported.emit();
    } catch {
      this.failed.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
