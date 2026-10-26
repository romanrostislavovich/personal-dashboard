import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { INTEGRATIONS_LINK } from '@pd/web-core';
import { MoviesApi } from './movies.api';

/** Subsections of Movies: each is a child route, so a tab has its own address. */
const TABS = [
  { path: 'history', labelKey: 'movies.tabs.history' },
  { path: 'want', labelKey: 'movies.tabs.want' },
  { path: 'unknown', labelKey: 'movies.tabs.unknown' },
  { path: 'videos', labelKey: 'movies.tabs.videos' },
] as const;

/** The Movies section: a title, the tabs and the subsection under them. */
@Component({
  selector: 'pd-movies-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatIconModule,
    MatTabsModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    TranslocoPipe,
  ],
  template: `
    <header class="page-header">
      <h1 class="page-title">{{ 'movies.title' | transloco }}</h1>
    </header>

    @if (status.value(); as s) {
      @if (!s.tmdb) {
        <p class="hint">
          <mat-icon>info</mat-icon>
          <span>
            {{ 'movies.noTmdb' | transloco }}
            <a [routerLink]="integrations.path" [queryParams]="integrations.queryParams">{{
              'movies.connect' | transloco
            }}</a>
          </span>
        </p>
      }
    }

    <nav mat-tab-nav-bar mat-stretch-tabs="false" [tabPanel]="panel">
      @for (tab of tabs; track tab.path) {
        <a
          mat-tab-link
          [routerLink]="tab.path"
          routerLinkActive
          #link="routerLinkActive"
          [active]="link.isActive"
        >
          {{ tab.labelKey | transloco }}
          @if (tab.path === 'unknown' && status.value()?.unknown) {
            <span class="count">{{ status.value()?.unknown }}</span>
          }
        </a>
      }
    </nav>
    <mat-tab-nav-panel #panel class="panel">
      <router-outlet />
    </mat-tab-nav-panel>
  `,
  styles: `
    .panel {
      display: block;
      padding-top: 16px;
    }
    .hint {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--mat-sys-on-surface-variant);
    }
    .count {
      margin-left: 6px;
      padding: 0 6px;
      border-radius: 10px;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
      font: var(--mat-sys-label-small);
    }
  `,
})
export class MoviesPage {
  protected readonly tabs = TABS;
  protected readonly integrations = INTEGRATIONS_LINK;
  protected readonly status = inject(MoviesApi).status();
}
