import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/** Subsections of Development: each is a child route, so a tab has its own address. */
const TABS = [
  { path: 'open-source', labelKey: 'development.tabs.openSource' },
  { path: 'github', labelKey: 'development.tabs.github' },
] as const;

/** The Development section: a title, the tabs and the subsection under them. */
@Component({
  selector: 'pd-development-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTabsModule, RouterLink, RouterLinkActive, RouterOutlet, TranslocoPipe],
  template: `
    <header class="page-header">
      <h1 class="page-title">{{ 'development.title' | transloco }}</h1>
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
export class DevelopmentPage {
  protected readonly tabs = TABS;
}
