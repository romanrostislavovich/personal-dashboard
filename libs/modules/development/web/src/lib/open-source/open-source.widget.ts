import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { OpenSourceApi } from './open-source.api';

const WIDGET_MAX_REPOS = 5;

/** Home widget: stars, weekly growth, open issues/PRs for the top repositories. */
@Component({
  selector: 'pd-open-source-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RouterLink, MatCardModule, MatButtonModule, TranslocoPipe],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>🐙 {{ 'development.oss.widget.title' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        @if (top().length > 0) {
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>⭐</th>
                  <th>{{ 'development.oss.widget.week' | transloco }}</th>
                  <th>{{ 'development.oss.issues' | transloco }}</th>
                  <th>{{ 'development.oss.pulls' | transloco }}</th>
                </tr>
              </thead>
              <tbody>
                @for (repo of top(); track repo.id) {
                  <tr>
                    <td class="name">
                      <a [href]="repo.htmlUrl" target="_blank" rel="noopener">{{
                        shortName(repo.fullName)
                      }}</a>
                    </td>
                    <td>{{ repo.stars | number }}</td>
                    <td [class.up]="repo.starsDelta.week > 0">
                      {{ repo.starsDelta.week > 0 ? '+' + repo.starsDelta.week : '—' }}
                    </td>
                    <td>{{ repo.openIssues }}</td>
                    <td>{{ repo.openPulls }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="empty">{{ 'development.oss.widget.empty' | transloco }}</p>
        }
      </mat-card-content>
      <mat-card-actions align="end">
        <a matButton routerLink="/development/open-source">{{
          'development.oss.widget.open' | transloco
        }}</a>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    .table-wrap {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font: var(--mat-sys-body-medium);
    }
    th {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
      text-align: right;
      padding: 4px 8px;
    }
    td {
      text-align: right;
      padding: 6px 8px;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }
    td.name,
    th:first-child {
      text-align: left;
      padding-left: 0;
    }
    td.name a {
      color: inherit;
      text-decoration: none;
    }
    .up {
      color: var(--mat-sys-primary);
    }
  `,
})
export class OpenSourceWidget {
  protected readonly repos = inject(OpenSourceApi).repos();
  /** By stars, as the server returns them; hidden and private ones are left out. */
  protected readonly top = computed(() =>
    this.repos
      .value()
      .filter((repo) => !repo.hidden && !repo.isPrivate)
      .slice(0, WIDGET_MAX_REPOS),
  );

  protected shortName(fullName: string): string {
    return fullName.split('/')[1] ?? fullName;
  }
}
