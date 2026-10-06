import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  LOCALE_ID,
  signal,
} from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { searchApi } from '@pd/client-core';
import { SearchHit } from '@pd/contracts';
import { AuthService } from '../auth/auth.service';
import { DASHBOARD_CLIENT } from '../client/dashboard-client';
import { DASHBOARD_MODULES, DashboardCommand } from '../dashboard-module';
import { LayoutService } from '../layout/layout.service';
import { ThemeService } from '../theme/theme.service';
import { ToastService } from '../toast/toast.service';

/** One line of the palette. */
interface PaletteItem {
  id: string;
  group: 'actions' | 'pages' | 'found';
  icon: string;
  label: string;
  /** A second line: where it is, what it holds. */
  hint: string | null;
  run: () => void | Promise<void>;
}

/** The server is asked this long after the last key press. */
const SEARCH_DELAY_MS = 220;
const MIN_QUERY = 2;

/** Icons of what the modules find (`SearchHit.kind`); anything else gets a plain search icon. */
const HIT_ICONS: Record<string, string> = {
  task: 'task_alt',
  'task-done': 'check_circle',
  reminder: 'notifications',
  entry: 'menu_book',
  income: 'trending_up',
  expense: 'trending_down',
  recurring: 'autorenew',
  birthday: 'cake',
  monitor: 'monitor_heart',
  account: 'sports_esports',
  game: 'sports_esports',
  track: 'music_note',
  soundcloud: 'cloud',
  repository: 'code',
  project: 'rocket_launch',
};

/**
 * The command palette (Ctrl+K): one field that opens any page, runs a quick action and searches
 * the data of every module. Pages and commands are filtered here; the data is searched on the
 * server (`/api/search`), where each module answers for its own.
 */
@Component({
  selector: 'pd-command-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatProgressBarModule, TranslocoPipe],
  template: `
    <div class="field">
      <mat-icon>search</mat-icon>
      <input
        #input
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="pd-palette-list"
        [attr.aria-expanded]="items().length > 0"
        [attr.aria-activedescendant]="activeItem()?.id"
        [placeholder]="'core.palette.placeholder' | transloco"
        [value]="query()"
        (input)="query.set(input.value)"
        (keydown)="onKey($event)"
        cdkFocusInitial
      />
      <kbd>Esc</kbd>
    </div>
    @if (searching()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <ul id="pd-palette-list" class="list" role="listbox">
      @for (item of items(); track item.id; let index = $index) {
        @if (index === 0 || items()[index - 1].group !== item.group) {
          <li class="group" role="presentation">
            {{ 'core.palette.groups.' + item.group | transloco }}
          </li>
        }
        <li role="presentation">
          <!-- The keyboard stays in the field (aria-activedescendant); the mouse clicks a line. -->
          <button
            type="button"
            class="item"
            role="option"
            tabindex="-1"
            [id]="item.id"
            [class.active]="index === active()"
            [attr.aria-selected]="index === active()"
            (mousemove)="active.set(index)"
            (click)="run(item)"
          >
            <mat-icon>{{ item.icon }}</mat-icon>
            <span class="text">
              <span class="label">{{ item.label }}</span>
              @if (item.hint) {
                <span class="hint">{{ item.hint }}</span>
              }
            </span>
          </button>
        </li>
      } @empty {
        <li class="empty" role="presentation">{{ 'core.palette.nothing' | transloco }}</li>
      }
    </ul>
  `,
  styleUrl: './command-palette.component.scss',
})
export class CommandPaletteComponent {
  private readonly dialogRef = inject(MatDialogRef<CommandPaletteComponent>);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);
  private readonly layout = inject(LayoutService);
  private readonly modules = inject(DASHBOARD_MODULES);
  private readonly api = searchApi(inject(DASHBOARD_CLIENT).api);
  private readonly datePipe = new DatePipe(inject(LOCALE_ID));

  protected readonly query = signal('');
  protected readonly active = signal(0);
  protected readonly searching = signal(false);
  private readonly hits = signal<SearchHit[]>([]);

  /** Pages and commands that do not depend on what is typed. */
  private readonly fixed = this.fixedItems();

  protected readonly items = computed<PaletteItem[]>(() => {
    const text = this.query().trim();
    const words = text.toLowerCase();
    const matching = this.fixed.filter(
      (item) => !words || `${item.label} ${item.hint ?? ''}`.toLowerCase().includes(words),
    );
    // What exists comes first, so Enter opens it; making something new out of the text is last.
    return [
      ...matching.filter((item) => item.group === 'pages'),
      ...this.hits().map((hit, index) => this.hitItem(hit, index)),
      ...matching.filter((item) => item.group === 'actions'),
      ...(text.length >= MIN_QUERY ? this.textActions(text) : []),
    ];
  });

  protected readonly activeItem = computed(() => this.items()[this.active()] ?? null);

  constructor() {
    // The search waits for a pause in typing; an answer to an older text is dropped.
    effect((onCleanup) => {
      const text = this.query().trim();
      this.active.set(0);
      if (text.length < MIN_QUERY) {
        this.hits.set([]);
        this.searching.set(false);
        return;
      }
      let current = true;
      const timer = setTimeout(async () => {
        this.searching.set(true);
        const found = await this.api.search(text).catch(() => []);
        if (current) {
          this.hits.set(found);
          this.searching.set(false);
        }
      }, SEARCH_DELAY_MS);
      onCleanup(() => {
        current = false;
        clearTimeout(timer);
      });
    });
  }

  protected onKey(event: KeyboardEvent): void {
    const count = this.items().length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (count > 0) {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        this.active.update((index) => (index + step + count) % count);
        // The active line may be below the fold of the list.
        queueMicrotask(() =>
          document
            .getElementById(this.activeItem()?.id ?? '')
            ?.scrollIntoView({ block: 'nearest' }),
        );
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = this.activeItem();
      if (item) {
        void this.run(item);
      }
    }
  }

  protected async run(item: PaletteItem): Promise<void> {
    this.dialogRef.close();
    try {
      await item.run();
    } catch {
      this.toast.show({
        icon: 'error',
        title: this.transloco.translate('core.palette.failed'),
        text: item.label,
      });
    }
  }

  private go(url: string, queryParams?: Record<string, string>): () => void {
    return () => void this.router.navigate([url], { queryParams });
  }

  private fixedItems(): PaletteItem[] {
    const t = (key: string) => this.transloco.translate(key);
    const page = (id: string, icon: string, label: string, run: () => void, hint: string | null) =>
      ({ id: `pd-palette-${id}`, group: 'pages', icon, label, hint, run }) satisfies PaletteItem;
    const action = (id: string, icon: string, label: string, run: () => void | Promise<void>) =>
      ({
        id: `pd-palette-${id}`,
        group: 'actions',
        icon,
        label,
        hint: null,
        run,
      }) satisfies PaletteItem;

    const settings = t('core.nav.settings');
    const modules = this.modules.filter((module) => !this.layout.isHidden(module.id));
    return [
      page('home', 'dashboard', t('core.nav.dashboard'), this.go('/'), null),
      ...modules.flatMap((module) => [
        page(module.id, module.nav.icon, t(module.nav.labelKey), this.go(`/${module.id}`), null),
        ...(module.commands ?? [])
          .filter((command) => command.url)
          .map((command) =>
            page(
              command.id,
              command.icon,
              t(command.labelKey),
              this.go(command.url ?? '/'),
              t(module.nav.labelKey),
            ),
          ),
      ]),
      page('projects', 'rocket_launch', t('core.nav.projects'), this.go('/projects'), null),
      page('settings', 'settings', settings, this.go('/settings'), null),
      ...(['appearance', 'integrations', 'data', 'system'] as const).map((tab) =>
        page(
          `settings-${tab}`,
          'settings',
          t(`core.settings.tabs.${tab}`),
          this.go('/settings', { tab }),
          settings,
        ),
      ),
      ...(['light', 'dark', 'system'] as const).map((mode) =>
        action(`mode-${mode}`, 'contrast', t(`core.palette.mode.${mode}`), () =>
          this.theme.update({ mode }),
        ),
      ),
      action('logout', 'logout', t('core.nav.logout'), () => this.auth.logout()),
    ];
  }

  /** What the modules can do with the typed text itself: "Add a task: buy milk". */
  private textActions(text: string): PaletteItem[] {
    return this.modules
      .filter((module) => !this.layout.isHidden(module.id))
      .flatMap((module) => module.commands ?? [])
      .filter((command): command is DashboardCommand & { loadAction: NonNullable<unknown> } =>
        Boolean(command.loadAction),
      )
      .map((command) => ({
        id: `pd-palette-${command.id}`,
        group: 'actions' as const,
        icon: command.icon,
        label: `${this.transloco.translate(command.labelKey)}: ${text}`,
        hint: null,
        run: async () => {
          const act = await command.loadAction?.();
          await act?.(text, this.injector);
          this.toast.show({
            icon: command.icon,
            title: this.transloco.translate(command.labelKey),
            text,
          });
        },
      }));
  }

  private hitItem(hit: SearchHit, index: number): PaletteItem {
    const module = this.modules.find((m) => m.id === hit.module);
    const section = module
      ? this.transloco.translate(module.nav.labelKey)
      : this.transloco.translate('core.nav.projects');
    return {
      id: `pd-palette-hit-${index}`,
      group: 'found',
      icon: HIT_ICONS[hit.kind] ?? 'search',
      label: hit.title,
      hint: [section, this.readable(hit.subtitle)].filter(Boolean).join(' · '),
      run: this.go(hit.url),
    };
  }

  /** A moment (`2026-12-01T10:00:00.000Z`) is shown the way the user reads dates. */
  private readable(subtitle: string | null): string | null {
    return subtitle && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(subtitle)
      ? this.datePipe.transform(subtitle, 'd MMM y, HH:mm')
      : subtitle;
  }
}
