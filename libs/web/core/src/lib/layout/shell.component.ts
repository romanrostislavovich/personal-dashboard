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
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { errorStatus } from '../client/core-requests';
import { ToastService } from '../toast/toast.service';
import { map } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { RealtimeNotifier } from '../realtime/realtime-notifier';
import { ToastHostComponent } from '../toast/toast-host.component';
import { DASHBOARD_MODULES } from '../dashboard-module';
import { CommandPaletteComponent } from '../palette/command-palette.component';
import { OfflineService } from '../offline/offline.service';
import { LayoutService } from './layout.service';

interface NavItem {
  path: string;
  labelKey: string;
  icon: string;
}

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

  /** The sections the user did not hide (Settings → Appearance). */
  protected readonly mainNav = computed<NavItem[]>(() => [
    { path: '/', labelKey: 'core.nav.dashboard', icon: 'dashboard' },
    ...this.modules
      .filter((module) => !this.layout.isHidden(module.id))
      .map((module) => ({ path: `/${module.id}`, ...module.nav })),
  ]);

  protected readonly bottomNav: NavItem[] = [
    { path: '/projects', labelKey: 'core.nav.projects', icon: 'rocket_launch' },
    { path: '/settings', labelKey: 'core.nav.settings', icon: 'settings' },
  ];
}
