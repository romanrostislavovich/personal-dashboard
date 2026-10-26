import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/** Subsections of Health: each is a child route, so a tab has its own address. */
const TABS = [
  { path: 'history', labelKey: 'health.tabs.history' },
  { path: 'profile', labelKey: 'health.tabs.profile' },
  { path: 'conditions', labelKey: 'health.tabs.conditions' },
  { path: 'results', labelKey: 'health.tabs.results' },
  { path: 'band', labelKey: 'health.tabs.band' },
  { path: 'medications', labelKey: 'health.tabs.medications' },
  { path: 'doctors', labelKey: 'health.tabs.doctors' },
  { path: 'summary', labelKey: 'health.tabs.summary' },
] as const;

/** The Health section: a title, what it is (and is not), the tabs and the subsection. */
@Component({
  selector: 'pd-health-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTabsModule, RouterLink, RouterLinkActive, RouterOutlet, TranslocoPipe],
  template: `
    <header class="page-header">
      <h1 class="page-title">{{ 'health.title' | transloco }}</h1>
    </header>
    <p class="about">{{ 'health.about' | transloco }}</p>

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
    .about {
      margin: 0 0 12px;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-medium);
    }
    .panel {
      display: block;
      padding-top: 16px;
    }
  `,
})
export class HealthPage {
  protected readonly tabs = TABS;
}
