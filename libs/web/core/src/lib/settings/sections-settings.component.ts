import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoPipe } from '@jsverse/transloco';
import { DASHBOARD_MODULES } from '../dashboard-module';
import { LayoutService } from '../layout/layout.service';

/**
 * Which sections are in the menu. A hidden section also leaves the home page; its data keeps
 * coming, its pages still open by their address, and the assistant still sees it.
 */
@Component({
  selector: 'pd-sections-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatIconModule, MatSlideToggleModule, TranslocoPipe],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>view_sidebar</mat-icon>
        <mat-card-title>{{ 'core.settings.sections.title' | transloco }}</mat-card-title>
        <mat-card-subtitle>{{ 'core.settings.sections.hint' | transloco }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content class="list">
        @for (module of modules; track module.id) {
          <mat-slide-toggle
            [checked]="!layout.isHidden(module.id)"
            (change)="layout.setHidden(module.id, !$event.checked)"
          >
            <span class="name">
              <mat-icon inline>{{ module.nav.icon }}</mat-icon>
              {{ module.nav.labelKey | transloco }}
            </span>
          </mat-slide-toggle>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-top: 12px;
    }
    .name {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
  `,
})
export class SectionsSettingsComponent {
  protected readonly layout = inject(LayoutService);
  protected readonly modules = inject(DASHBOARD_MODULES);
}
