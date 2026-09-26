import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
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
    MatToolbarModule,
    MatListModule,
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
