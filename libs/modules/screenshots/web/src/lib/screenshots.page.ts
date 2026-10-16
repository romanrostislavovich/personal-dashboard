import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { SCREENSHOTS_READS, screenshotsApi } from '@pd/client-core';
import { Screenshot } from '@pd/contracts';
import { DASHBOARD_CLIENT } from '@pd/web-core';
import { ScreenshotSyncService } from './screenshot-sync.service';

/** Thumbnails fetched at a time; "Show more" fetches the next ones. */
const PAGE = 48;

/**
 * Screenshots: every one the desktop apps took, by month, the same as in the folder of each
 * computer. In the desktop app the card on top tells where the folder is and how it syncs.
 */
@Component({
  selector: 'pd-screenshots-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
    TranslocoPipe,
  ],
  template: `
    <h1 class="page-title">{{ 'screenshots.title' | transloco }}</h1>
    <p class="intro">{{ 'screenshots.intro' | transloco }}</p>

    @if (sync.folder) {
      <mat-card appearance="outlined" class="folder">
        <mat-card-content>
          <mat-icon>folder</mat-icon>
          <span class="body">
            <span class="path">{{ folderPath() }}</span>
            <span class="meta">
              @if (sync.error(); as error) {
                <span class="error">{{ error }}</span>
              } @else if (sync.busy()) {
                {{ 'screenshots.syncing' | transloco }}
              } @else if (sync.lastSync(); as at) {
                {{ 'screenshots.synced' | transloco: { at: (at | date: 'HH:mm') } }}
              }
            </span>
          </span>
          <button matButton (click)="sync.folder.openFolder()">
            {{ 'screenshots.open' | transloco }}
          </button>
          <button matButton (click)="chooseFolder()">
            {{ 'screenshots.change' | transloco }}
          </button>
          <button
            matIconButton
            [disabled]="sync.busy()"
            [matTooltip]="'screenshots.syncNow' | transloco"
            [attr.aria-label]="'screenshots.syncNow' | transloco"
            (click)="sync.syncNow()"
          >
            <mat-icon>sync</mat-icon>
          </button>
        </mat-card-content>
      </mat-card>
    } @else {
      <p class="hint">{{ 'screenshots.desktopOnly' | transloco }}</p>
    }

    @for (month of months(); track month.name) {
      <h2>{{ month.date | date: 'LLLL y' }}</h2>
      <div class="grid">
        @for (shot of month.shots; track shot.id) {
          <button type="button" class="shot" (click)="open(shot)" [title]="fileName(shot)">
            @if (thumbnails()[shot.id]; as url) {
              <img [src]="url" [alt]="fileName(shot)" loading="lazy" />
            }
            <span class="caption">{{ shot.createdAt | date: 'd MMM, HH:mm' }}</span>
          </button>
        }
      </div>
    } @empty {
      @if (!list.isLoading()) {
        <p class="hint">{{ 'screenshots.empty' | transloco }}</p>
      }
    }
    @if (shown() < list.value().length) {
      <button matButton="tonal" class="more" (click)="shown.set(shown() + page)">
        {{ 'screenshots.more' | transloco }}
      </button>
    }

    @if (opened(); as view) {
      <div class="viewer" role="dialog" [attr.aria-label]="fileName(view.shot)">
        <button
          type="button"
          class="backdrop"
          [attr.aria-label]="'screenshots.close' | transloco"
          (click)="close()"
        ></button>
        <img [src]="view.url" [alt]="fileName(view.shot)" />
        <div class="viewer-bar">
          <span>{{ view.shot.name }}</span>
          <a matButton [href]="view.url" [download]="fileName(view.shot)">
            <mat-icon>download</mat-icon> {{ 'screenshots.download' | transloco }}
          </a>
          <button matButton (click)="remove(view.shot)">
            <mat-icon>delete</mat-icon> {{ 'core.actions.delete' | transloco }}
          </button>
          <button matButton (click)="close()">{{ 'screenshots.close' | transloco }}</button>
        </div>
      </div>
    }
  `,
  styleUrl: './screenshots.page.scss',
})
export class ScreenshotsPage {
  private readonly api = screenshotsApi(inject(DASHBOARD_CLIENT).api);
  private readonly transloco = inject(TranslocoService);
  protected readonly sync = inject(ScreenshotSyncService);
  protected readonly page = PAGE;

  protected readonly list = httpResource<Screenshot[]>(() => SCREENSHOTS_READS.list(), {
    defaultValue: [],
  });
  protected readonly shown = signal(PAGE);
  protected readonly thumbnails = signal<Record<string, string>>({});
  protected readonly opened = signal<{ shot: Screenshot; url: string } | null>(null);
  protected readonly folderPath = signal('');

  protected readonly months = computed(() => {
    const groups = new Map<string, Screenshot[]>();
    for (const shot of this.list.value().slice(0, this.shown())) {
      const month = shot.createdAt.slice(0, 7);
      groups.set(month, [...(groups.get(month) ?? []), shot]);
    }
    return [...groups].map(([name, shots]) => ({ name, date: `${name}-01`, shots }));
  });

  constructor() {
    const urls = new Map<string, string>();
    // A sync that changed something: the list again.
    effect(() => {
      if (this.sync.changes()) {
        this.list.reload();
      }
    });
    // The thumbnails need the auth header: fetched as blobs, shown through object URLs.
    effect(() => {
      for (const month of this.months()) {
        for (const shot of month.shots) {
          const key = `${shot.id}:${shot.hash}`;
          if (!urls.has(key)) {
            urls.set(key, '');
            void this.api.thumbnail(shot.id).then((blob) => {
              const url = URL.createObjectURL(blob);
              urls.set(key, url);
              this.thumbnails.update((all) => ({ ...all, [shot.id]: url }));
            });
          }
        }
      }
    });
    inject(DestroyRef).onDestroy(() => {
      urls.forEach((url) => url && URL.revokeObjectURL(url));
      this.close();
    });
    void this.sync.folder?.status().then(({ folder }) => this.folderPath.set(folder));
  }

  protected fileName(shot: Screenshot): string {
    return shot.name.split('/').pop() ?? shot.name;
  }

  protected async open(shot: Screenshot): Promise<void> {
    const url = URL.createObjectURL(await this.api.file(shot.id));
    this.close();
    this.opened.set({ shot, url });
  }

  protected close(): void {
    const view = this.opened();
    if (view) {
      URL.revokeObjectURL(view.url);
      this.opened.set(null);
    }
  }

  /** Deleted here, it goes from the folder of every computer at their next sync. */
  protected async remove(shot: Screenshot): Promise<void> {
    if (!confirm(this.transloco.translate('screenshots.confirmDelete'))) {
      return;
    }
    await this.api.remove(shot.id);
    this.close();
    this.list.reload();
    void this.sync.syncNow();
  }

  protected async chooseFolder(): Promise<void> {
    const status = await this.sync.folder?.chooseFolder();
    if (status) {
      this.folderPath.set(status.folder);
      void this.sync.syncNow();
    }
  }
}
