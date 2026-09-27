import { DatePipe, NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal, Type } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../auth/auth.service';
import { DASHBOARD_MODULES, DashboardWidget } from '../dashboard-module';
import { LevelCardComponent } from './level-card.component';

interface LoadedWidget extends DashboardWidget {
  component: Type<unknown>;
}

/** Home: a greeting with the player level and a grid of widgets from all enabled modules. */
@Component({
  selector: 'pd-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, NgComponentOutlet, TranslocoPipe, LevelCardComponent],
  template: `
    <header class="hero">
      <div>
        <p class="date">{{ today | date: 'EEEE, d MMMM' }}</p>
        <h1 class="greeting">
          {{ 'core.dashboard.greeting.' + partOfDay() | transloco: { name: firstName() } }}
        </h1>
      </div>
      <pd-level-card />
    </header>

    <div class="grid">
      @for (widget of widgets(); track widget.id) {
        <section class="widget" [class]="widget.size ?? 'medium'">
          <ng-container *ngComponentOutlet="widget.component" />
        </section>
      }
    </div>
  `,
  styles: `
    .hero {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 20px;
      margin-bottom: 28px;
    }
    .hero pd-level-card {
      flex: 0 1 340px;
    }
    .date {
      margin: 0 0 6px;
      font: 600 0.8rem / 1.2 var(--pd-font);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--mat-sys-primary);
    }
    .greeting {
      margin: 0;
      font: 800 clamp(1.6rem, 3vw, 2.3rem) / 1.15 var(--pd-font-heading);
      letter-spacing: -0.02em;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr));
      gap: 18px;
      /* Narrow widgets fill the gaps left by wide ones. */
      grid-auto-flow: dense;
    }
    .widget {
      display: flex;
      flex-direction: column;
    }
    /* Cards in a row share the same height. */
    .widget > ::ng-deep * {
      display: flex;
      flex-direction: column;
      flex: 1;
    }
    .widget > ::ng-deep * > .mat-mdc-card {
      flex: 1;
    }
    .widget.large {
      grid-column: 1 / -1;
    }
    @media (min-width: 1000px) {
      .widget.medium {
        grid-column: span 2;
      }
    }
  `,
})
export class DashboardPage {
  private readonly auth = inject(AuthService);

  protected readonly today = new Date();
  protected readonly widgets = signal<LoadedWidget[]>([]);

  protected readonly firstName = computed(
    () => this.auth.user()?.displayName.trim().split(/\s+/)[0] ?? '',
  );

  protected readonly partOfDay = computed(() => {
    const hour = this.today.getHours();
    if (hour < 5) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 18) return 'day';
    return 'evening';
  });

  constructor() {
    const widgets = inject(DASHBOARD_MODULES).flatMap((module) => module.widgets ?? []);
    Promise.all(
      widgets.map(async (widget) => ({ ...widget, component: await widget.loadComponent() })),
    ).then((loaded) => this.widgets.set(loaded));
  }
}
