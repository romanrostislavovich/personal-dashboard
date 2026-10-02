import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/** Subsections of Activity: each is a child route, so a tab has its own address. */
const TABS = [
  { path: 'overview', labelKey: 'activity.tabs.overview' },
  { path: 'settings', labelKey: 'activity.tabs.settings' },
] as const;

/** The Activity section: a title, the tabs and the subsection under them. */
@Component({
  selector: 'pd-activity-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTabsModule, RouterLink, RouterLinkActive, RouterOutlet, TranslocoPipe],
  template: `
    <header class="page-header">
      <h1 class="page-title">{{ 'activity.title' | transloco }}</h1>
    </header>

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
  `,
})
export class ActivityPage {
  protected readonly tabs = TABS;
}
