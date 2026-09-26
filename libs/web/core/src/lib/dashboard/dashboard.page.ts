import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal, Type } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { DASHBOARD_MODULES, DashboardWidget } from '../dashboard-module';

interface LoadedWidget extends DashboardWidget {
  component: Type<unknown>;
}

/** Главная: сетка виджетов от всех подключённых модулей. */
@Component({
  selector: 'pd-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet, TranslocoPipe],
  template: `
    <h1 class="page-title">{{ 'core.dashboard.title' | transloco }}</h1>
    <div class="grid">
      @for (widget of widgets(); track widget.id) {
        <section class="widget" [class]="widget.size ?? 'medium'">
          <ng-container *ngComponentOutlet="widget.component" />
        </section>
      }
    </div>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr));
      gap: 16px;
      /* Узкие виджеты заполняют пустоты, оставшиеся после широких. */
      grid-auto-flow: dense;
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
  protected readonly widgets = signal<LoadedWidget[]>([]);

  constructor() {
    const widgets = inject(DASHBOARD_MODULES).flatMap((module) => module.widgets ?? []);
    Promise.all(
      widgets.map(async (widget) => ({ ...widget, component: await widget.loadComponent() })),
    ).then((loaded) => this.widgets.set(loaded));
  }
}
