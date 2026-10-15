import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { errorStatus } from '../client/core-requests';
import { ToastService } from '../toast/toast.service';
import { filter, map } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { RealtimeNotifier } from '../realtime/realtime-notifier';
import { ToastHostComponent } from '../toast/toast-host.component';
import { DASHBOARD_MODULES, NAV_GROUPS, NavGroupId } from '../dashboard-module';
import { CommandPaletteComponent } from '../palette/command-palette.component';
import { OfflineService } from '../offline/offline.service';
import { LayoutService } from './layout.service';

interface NavItem {
  path: string;
  labelKey: string;
  icon: string;
}

/** A group of the side menu: its sections under a heading that folds them. */
interface NavGroup {
  id: NavGroupId;
  icon: string;
  items: NavItem[];
}

/** The icons of the groups (their names are `core.nav.groups.<id>`). */
const GROUP_ICONS: Record<NavGroupId, string> = {
  things: 'checklist',
  me: 'self_improvement',
  work: 'work',
  leisure: 'sports_esports',
  safety: 'shield_lock',
  bottom: '',
};

/** The groups folded by the user, in this browser only. */
const FOLDED_KEY = 'pd.nav.folded';

@Component({
  selector: 'pd-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    TranslocoPipe,
    ToastHostComponent,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  /** A demo instance says so on every page: the data is made up and made anew every night. */
  protected readonly demo = signal(false);
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  constructor() {
    // Live events (new achievements, notifications) while the dashboard is open.
    void this.auth.config().then(
      (config) => this.demo.set(config.demo),
      () => undefined,
    );
    // In a demo some actions are refused by the server (403): say so instead of doing nothing.
    const refused = (event: PromiseRejectionEvent) => {
      if (this.demo() && errorStatus(event.reason) === 403) {
        event.preventDefault();
        this.toasts.show({
          icon: 'science',
          title: this.transloco.translate('core.demo.notAvailable'),
        });
      }
    };
    window.addEventListener('unhandledrejection', refused);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('unhandledrejection', refused));
    inject(RealtimeNotifier).start();
  }

  private readonly dialog = inject(MatDialog);
  protected readonly offline = inject(OfflineService);

  /** Ctrl+K (⌘K on a Mac) from anywhere opens the command palette. */
  @HostListener('document:keydown', ['$event'])
  protected onKey(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.openPalette();
    }
  }

  protected openPalette(): void {
    if (
      this.dialog.openDialogs.some((d) => d.componentInstance instanceof CommandPaletteComponent)
    ) {
      return;
    }
    this.dialog.open(CommandPaletteComponent, {
      width: '640px',
      maxWidth: '94vw',
      position: { top: '12vh' },
      autoFocus: 'first-tabbable',
      panelClass: 'pd-palette-panel',
    });
  }

  /** "Roman Rostislavovich" → "RR"; a single word gives its first two letters. */
  protected readonly initials = computed(() => {
    const words = (this.auth.user()?.displayName ?? '').trim().split(/\s+/).filter(Boolean);
    const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2);
    return letters.toUpperCase();
  });

  protected readonly isMobile = toSignal(
    inject(BreakpointObserver)
      .observe(Breakpoints.Handset)
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  private readonly modules = inject(DASHBOARD_MODULES);
  private readonly layout = inject(LayoutService);

  private readonly router = inject(Router);
  /** The address now, for the group of the open page: it is never folded. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  protected readonly folded = signal<ReadonlySet<NavGroupId>>(readFolded());

  /** The sections in the menu the user did not hide (Settings → Appearance). */
  private readonly visible = computed(() =>
    this.modules.filter((module) => module.nav.menu !== false && !this.layout.isHidden(module.id)),
  );

  /** Home and the sections without a group. */
  protected readonly mainNav = computed<NavItem[]>(() => [
    { path: '/', labelKey: 'core.nav.dashboard', icon: 'dashboard' },
    ...this.visible()
      .filter((module) => !module.nav.group)
      .map((module) => ({ path: `/${module.id}`, ...module.nav })),
  ]);

  /** The groups with something in them, in the order of NAV_GROUPS; Projects is in Work. */
  protected readonly groups = computed<NavGroup[]>(() =>
    NAV_GROUPS.filter((id) => id !== 'bottom')
      .map((id) => ({
        id,
        icon: GROUP_ICONS[id],
        items: [
          ...(id === 'work' ? [PROJECTS] : []),
          ...this.visible()
            .filter((module) => module.nav.group === id)
            .map((module) => ({ path: `/${module.id}`, ...module.nav })),
        ],
      }))
      .filter((group) => group.items.length > 0),
  );

  protected readonly bottomNav = computed<NavItem[]>(() => [
    ...this.visible()
      .filter((module) => module.nav.group === 'bottom')
      .map((module) => ({ path: `/${module.id}`, ...module.nav })),
    { path: '/settings', labelKey: 'core.nav.settings', icon: 'settings' },
  ]);

  /** A group is open unless folded — and always while one of its pages is open. */
  protected isOpen(group: NavGroup): boolean {
    return (
      !this.folded().has(group.id) || group.items.some((item) => this.url().startsWith(item.path))
    );
  }

  protected toggle(group: NavGroup): void {
    const folded = new Set(this.folded());
    if (this.isOpen(group)) {
      folded.add(group.id);
    } else {
      folded.delete(group.id);
    }
    this.folded.set(folded);
    try {
      localStorage.setItem(FOLDED_KEY, JSON.stringify([...folded]));
    } catch {
      // Storage blocked: the menu folds for this visit only.
    }
  }
}

const PROJECTS: NavItem = {
  path: '/projects',
  labelKey: 'core.nav.projects',
  icon: 'rocket_launch',
};

function readFolded(): ReadonlySet<NavGroupId> {
  try {
    const saved = JSON.parse(localStorage.getItem(FOLDED_KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(saved) ? (saved as NavGroupId[]) : []);
  } catch {
    return new Set();
  }
}
