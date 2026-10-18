import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { DatePipe, NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  Type,
  Injector,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ArrangedWidget, arrangeWidgets, WIDGET_SIZES, WidgetSize } from '@pd/contracts';
import { AuthService } from '../auth/auth.service';
import { DASHBOARD_MODULES } from '../dashboard-module';
import { LayoutService } from '../layout/layout.service';
import { WidgetSetup } from './widget-setup';
import { LevelCardComponent } from './level-card.component';

interface ShownWidget extends ArrangedWidget {
  component: Type<unknown>;
  /** The widget's own injector: its WidgetSetup says whether it has anything to show. */
  injector: Injector;
  setup: WidgetSetup;
}

/** A widget with nothing to show yet: a link to its section in the line under the grid. */
interface PendingSection {
  id: string;
  labelKey: string;
  icon: string;
}

/**
 * Home: a greeting with the player level and a grid of widgets from all enabled modules.
 * "Edit" turns the grid into an editor: widgets are dragged into place, resized and hidden;
 * the result is the layout of this device (LayoutService).
 */
@Component({
  selector: 'pd-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    NgComponentOutlet,
    RouterLink,
    TranslocoPipe,
    LevelCardComponent,
  ],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage {
  private readonly auth = inject(AuthService);
  private readonly layout = inject(LayoutService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly today = new Date();
  protected readonly editing = signal(false);
  protected readonly busy = signal(false);
  protected readonly isOwn = this.layout.isOwn;
  protected readonly sizes = WIDGET_SIZES;

  private readonly injector = inject(Injector);
  private readonly modules = inject(DASHBOARD_MODULES);
  private readonly declared = this.modules.flatMap((module) => module.widgets ?? []);
  /** One WidgetSetup (and injector) per widget, kept while the page lives. */
  private readonly setups = new Map<string, { setup: WidgetSetup; injector: Injector }>();
  private readonly components = signal(new Map<string, Type<unknown>>());

  /** Every widget in the order of the layout, hidden ones included (the editor shows them). */
  private readonly arranged = computed<ShownWidget[]>(() => {
    const components = this.components();
    return arrangeWidgets(
      this.declared.map(({ id, size }) => ({ id, size: size ?? 'medium' })),
      this.layout.layout(),
    ).flatMap((widget) => {
      const component = components.get(widget.id);
      return component ? [{ ...widget, component, ...this.setupOf(widget.id) }] : [];
    });
  });

  /** What the grid shows: all widgets while editing, the visible ones otherwise. */
  protected readonly widgets = computed(() =>
    this.editing() ? this.arranged() : this.arranged().filter((widget) => !widget.hidden),
  );

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
    void Promise.all(
      this.declared.map(async (widget) => [widget.id, await widget.loadComponent()] as const),
    ).then((loaded) => this.components.set(new Map(loaded)));
  }

  /**
   * The sections whose widgets have nothing to show yet ("connect Last.fm"): one line of links
   * under the grid instead of their empty cards. While editing they are cards like the rest.
   */
  protected readonly pending = computed<PendingSection[]>(() => {
    const seen = new Set<string>();
    return this.arranged()
      .filter((widget) => !widget.hidden && widget.setup.needed())
      .flatMap((widget) => {
        const module = this.modules.find((item) => item.id === widget.id.split('.')[0]);
        if (!module || seen.has(module.id)) {
          return [];
        }
        seen.add(module.id);
        return [{ id: module.id, labelKey: module.nav.labelKey, icon: module.nav.icon }];
      });
  });

  private setupOf(id: string): { setup: WidgetSetup; injector: Injector } {
    let entry = this.setups.get(id);
    if (!entry) {
      const setup = new WidgetSetup();
      entry = {
        setup,
        injector: Injector.create({
          providers: [{ provide: WidgetSetup, useValue: setup }],
          parent: this.injector,
        }),
      };
      this.setups.set(id, entry);
    }
    return entry;
  }

  /** A widget of a hidden section is shown again by showing the section (Settings → Appearance). */
  protected sectionHidden(widget: ArrangedWidget): boolean {
    return this.layout.isHidden(widget.id.split('.')[0]);
  }

  protected drop(event: CdkDragDrop<unknown>): void {
    const widgets = [...this.arranged()];
    const [moved] = widgets.splice(event.previousIndex, 1);
    widgets.splice(event.currentIndex, 0, moved);
    this.save(widgets);
  }

  protected resize(widget: ArrangedWidget, size: WidgetSize): void {
    this.save(this.arranged().map((w) => (w.id === widget.id ? { ...w, size } : w)));
  }

  protected toggleHidden(widget: ArrangedWidget): void {
    this.save(this.arranged().map((w) => (w.id === widget.id ? { ...w, hidden: !w.hidden } : w)));
  }

  /** Back to the layout of the account (or the built-in one). */
  protected reset(): void {
    this.layout.useAccountLayout();
  }

  protected async applyEverywhere(): Promise<void> {
    this.busy.set(true);
    try {
      await this.layout.applyEverywhere();
      this.snackBar.open(this.transloco.translate('core.dashboard.edit.applied'), 'OK', {
        duration: 4000,
      });
    } catch {
      this.snackBar.open(this.transloco.translate('core.dashboard.edit.notApplied'), 'OK', {
        duration: 6000,
      });
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * The whole list goes into the layout. A widget hidden only because its section is hidden is
   * saved as shown: it comes back with the section.
   */
  private save(widgets: ArrangedWidget[]): void {
    const kept = new Map(this.layout.layout().widgets.map((widget) => [widget.id, widget]));
    const declared = new Map(this.declared.map((widget) => [widget.id, widget.size ?? 'medium']));
    this.layout.update({
      widgets: widgets.map((widget) => ({
        id: widget.id,
        hidden: this.sectionHidden(widget) ? (kept.get(widget.id)?.hidden ?? false) : widget.hidden,
        size: widget.size === declared.get(widget.id) ? null : widget.size,
      })),
    });
  }
}
