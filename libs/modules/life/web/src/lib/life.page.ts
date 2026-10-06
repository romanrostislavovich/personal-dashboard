import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

const TABS = [
  { path: 'day', labelKey: 'life.tabs.day' },
  { path: 'summary', labelKey: 'life.tabs.summary' },
  { path: 'goals', labelKey: 'life.tabs.goals' },
  { path: 'ask', labelKey: 'life.tabs.ask' },
] as const;

/** The Life section: a title, the tabs and the subsection under them. */
@Component({
  selector: 'pd-life-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTabsModule, RouterLink, RouterLinkActive, RouterOutlet, TranslocoPipe],
  template: `
    <header class="page-header">
      <h1 class="page-title">{{ 'life.title' | transloco }}</h1>
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
export class LifePage {
  protected readonly tabs = TABS;
}
