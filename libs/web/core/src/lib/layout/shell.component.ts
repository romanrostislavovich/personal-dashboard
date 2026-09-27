import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { DASHBOARD_MODULES } from '../dashboard-module';

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
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);

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

  protected readonly mainNav: NavItem[] = [
    { path: '/', labelKey: 'core.nav.dashboard', icon: 'dashboard' },
    ...inject(DASHBOARD_MODULES).map((module) => ({ path: `/${module.id}`, ...module.nav })),
  ];

  protected readonly bottomNav: NavItem[] = [
    { path: '/projects', labelKey: 'core.nav.projects', icon: 'rocket_launch' },
    { path: '/settings', labelKey: 'core.nav.settings', icon: 'settings' },
  ];
}
