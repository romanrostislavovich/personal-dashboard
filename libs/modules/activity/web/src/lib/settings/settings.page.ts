import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ACTIVITY_CATEGORIES, ActivityApp, ActivityCategory } from '@pd/contracts';
import { ProjectsApi } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { ActivityApi } from '../activity.api';
import { TrackerCardComponent } from '../tracker-card.component';

const IDLE_MINUTES = [1, 2, 3, 5, 10, 15, 30, 60];

/**
 * How the time is recorded: the trackers, when the user counts as away, what each program is
 * for, which programs are never recorded, and what window titles belong to which project.
 */
@Component({
  selector: 'pd-activity-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule,
    TranslocoPipe,
    TrackerCardComponent,
  ],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPage {
  private readonly api = inject(ActivityApi);
  private readonly transloco = inject(TranslocoService);

  protected readonly categories = ACTIVITY_CATEGORIES;
  protected readonly idleOptions = IDLE_MINUTES;
  protected readonly settings = this.api.settings();
  protected readonly apps = this.api.apps();
  protected readonly rules = this.api.rules();
  protected readonly projects = inject(ProjectsApi).list();

  /** The new rule being typed. */
  protected readonly ruleProject = signal<string | null>(null);
  protected readonly rulePattern = signal('');
  protected readonly canAddRule = computed(
    () => !!this.ruleProject() && this.rulePattern().trim().length >= 2,
  );

  protected readonly rulesShown = computed(() => {
    const names = new Map(this.projects.value().map((project) => [project.id, project.name]));
    return this.rules
      .value()
      .map((rule) => ({ ...rule, project: names.get(rule.projectId) ?? '—' }));
  });

  protected async setIdle(idleMinutes: number): Promise<void> {
    await firstValueFrom(this.api.saveSettings({ idleMinutes }));
    this.settings.reload();
  }

  protected async setCategory(app: ActivityApp, category: ActivityCategory): Promise<void> {
    await firstValueFrom(this.api.updateApp(app.app, { category }));
    this.apps.reload();
  }

  /** Excluding deletes what was recorded for the program, so it is confirmed first. */
  protected async setExcluded(app: ActivityApp, excluded: boolean): Promise<void> {
    const question = this.transloco.translate('activity.apps.confirmExclude', { name: app.name });
    if (excluded && !confirm(question)) {
      this.apps.reload(); // Puts the switch back.
      return;
    }
    await firstValueFrom(this.api.updateApp(app.app, { excluded }));
    this.apps.reload();
  }

  protected async addRule(): Promise<void> {
    const projectId = this.ruleProject();
    if (!projectId || !this.canAddRule()) {
      return;
    }
    await firstValueFrom(this.api.addRule({ projectId, pattern: this.rulePattern().trim() }));
    this.rulePattern.set('');
    this.rules.reload();
  }

  protected async removeRule(id: string): Promise<void> {
    await firstValueFrom(this.api.removeRule(id));
    this.rules.reload();
  }
}
