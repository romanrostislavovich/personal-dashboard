import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TranslocoPipe } from '@jsverse/transloco';
import { MovieSearchResult, MovieView } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { MovieSearchComponent } from './movie-search.component';
import { MoviesApi } from './movies.api';

const ACTIONS = [{ id: 'assign', icon: 'check', labelKey: 'movies.unknown.thisOne' }];

/** "Find it": the film or show a view not found by itself was, searched by its page's name. */
@Component({
  selector: 'pd-assign-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, TranslocoPipe, MovieSearchComponent],
  template: `
    <h2 mat-dialog-title>{{ 'movies.unknown.find' | transloco }}</h2>
    <mat-dialog-content>
      <p class="sub">{{ view.name }} · {{ view.site }}</p>
      <pd-movie-search [actions]="actions" [initial]="view.name" (picked)="assign($event.result)" />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>{{ 'core.actions.cancel' | transloco }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .sub {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class AssignDialog {
  private readonly api = inject(MoviesApi);
  private readonly ref = inject(MatDialogRef<AssignDialog>);
  protected readonly view = inject<MovieView>(MAT_DIALOG_DATA);
  protected readonly actions = ACTIONS;

  async assign(result: MovieSearchResult): Promise<void> {
    await firstValueFrom(
      this.api.assign(this.view.id, { tmdbId: result.tmdbId, kind: result.kind }),
    );
    this.ref.close(true);
  }
}
