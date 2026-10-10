import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/** Subsections of Psychology: each is a child route, so a tab has its own address. */
const TABS = [
  { path: 'patterns', labelKey: 'psychology.tabs.patterns' },
  { path: 'reflection', labelKey: 'psychology.tabs.reflection' },
  { path: 'notes', labelKey: 'psychology.tabs.notes' },
  { path: 'checkups', labelKey: 'psychology.tabs.checkups' },
  { path: 'events', labelKey: 'psychology.tabs.events' },
] as const;

/** The Psychology section: a title, what it is not, the tabs and the subsection under them. */
@Component({
  selector: 'pd-psychology-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTabsModule, RouterLink, RouterLinkActive, RouterOutlet, TranslocoPipe],
  template: `
    <header class="page-header">
      <h1 class="page-title">{{ 'psychology.title' | transloco }}</h1>
    </header>
    <p class="about">{{ 'psychology.about' | transloco }}</p>

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
export class PsychologyPage {
  protected readonly tabs = TABS;
}
