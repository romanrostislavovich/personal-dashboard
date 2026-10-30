import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {TranslocoPipe} from '@jsverse/transloco';
import {MovieTitle, MovieTitleUpdate} from '@pd/contracts';
import {firstValueFrom} from 'rxjs';
import {MoviesApi} from './movies.api';

const RATINGS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Today on this device, `YYYY-MM-DD`. */
function today(): string {
  return new Date().toLocaleDateString('sv');
}

/**
 * A film or a show: the rating (1–10), a note, seen or not, in the list to watch or not. The
 * list under it reloads when it closes, whatever was changed.
 */
@Component({
  selector: 'pd-title-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    TranslocoPipe,
  ],
  template: `
    @let t = title();
    <h2 mat-dialog-title>
      {{ t.title }}
      @if (t.year) {
        <span class="year">({{ t.year }})</span>
      }
    </h2>
    <mat-dialog-content>
      @if (t.originalTitle) {
        <p class="sub">{{ t.originalTitle }}</p>
      }
      @if (t.genres.length) {
        <p class="sub">{{ t.genres.join(', ') }}</p>
      }
      <p class="label">{{ 'movies.dialog.rating' | transloco }}</p>
      <div
        class="ratings"
        role="radiogroup"
        [attr.aria-label]="'movies.dialog.rating' | transloco"
      >
        @for (n of ratings; track n) {
          <button
            type="button"
            class="rate"
            role="radio"
            [class.on]="(rating() ?? 0) >= n"
            [attr.aria-checked]="rating() === n"
            (click)="rating.set(rating() === n ? null : n)"
          >
            {{ n }}
          </button>
        }
      </div>
      <mat-form-field class="note" subscriptSizing="dynamic">
        <mat-label>{{ 'movies.dialog.note' | transloco }}</mat-label>
        <textarea
          matInput
          rows="4"
          maxlength="2000"
          [(ngModel)]="note"
        ></textarea>
      </mat-form-field>
      <div class="actions">
        @if (t.watchedOn) {
          <button matButton (click)="patch({watchedOn: null})">
            <mat-icon>undo</mat-icon> {{ 'movies.dialog.notSeen' | transloco }}
          </button>
        } @else {
          <button matButton="tonal" (click)="patch({watchedOn: today})">
            <mat-icon>check</mat-icon> {{ 'movies.dialog.seen' | transloco }}
          </button>
        }
        @if (!t.watchedOn) {
          <button matButton (click)="patch({wanted: !t.wantedAt})">
            <mat-icon>{{
              t.wantedAt ? 'bookmark_remove' : 'bookmark_add'
            }}</mat-icon>
            {{
              (t.wantedAt ? 'movies.dialog.unwant' : 'movies.dialog.want')
                | transloco
            }}
          </button>
        }
        <button matButton class="danger" (click)="remove()">
          <mat-icon>delete</mat-icon> {{ 'movies.dialog.remove' | transloco }}
        </button>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>
        {{ 'core.actions.cancel' | transloco }}
      </button>
      <button matButton="filled" [disabled]="busy()" (click)="save()">
        {{ 'core.actions.save' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .year,
    .sub {
      color: var(--mat-sys-on-surface-variant);
    }
    .label {
      margin: 12px 0 4px;
      font: var(--mat-sys-label-large);
    }
    .ratings {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .rate {
      width: 36px;
      height: 36px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 50%;
      background: none;
      color: inherit;
      font: var(--mat-sys-label-large);
      cursor: pointer;
    }
    .rate.on {
      border-color: var(--mat-sys-primary);
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
    }
    .note {
      width: 100%;
      margin-top: 16px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    .danger {
      color: var(--mat-sys-error);
    }
  `,
})
export class TitleDialog {
  private readonly api = inject(MoviesApi);
  private readonly ref = inject(MatDialogRef<TitleDialog>);

  protected readonly title = signal(inject<MovieTitle>(MAT_DIALOG_DATA));
  protected readonly ratings = RATINGS;
  protected readonly today = today();
  protected readonly rating = signal<number | null>(this.title().rating);
  protected note = this.title().note ?? '';
  protected readonly busy = signal(false);

  async patch(patch: MovieTitleUpdate): Promise<void> {
    this.title.set(
      await firstValueFrom(this.api.update(this.title().id, patch)),
    );
  }

  async save(): Promise<void> {
    this.busy.set(true);
    try {
      await this.patch({rating: this.rating(), note: this.note.trim() || null});
      this.ref.close();
    } finally {
      this.busy.set(false);
    }
  }

  async remove(): Promise<void> {
    await firstValueFrom(this.api.remove(this.title().id));
    this.ref.close();
  }
}
