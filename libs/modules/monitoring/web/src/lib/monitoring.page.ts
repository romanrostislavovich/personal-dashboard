import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Monitor } from '@pd/contracts';
import { ProjectsApi } from '@pd/web-core';
import { firstValueFrom, interval } from 'rxjs';
import { MonitorCardComponent } from './monitor-card.component';
import { MonitoringApi } from './monitoring.api';

/** Проверки идут раз в 5 минут — обновляем страницу раз в минуту, этого достаточно. */
const REFRESH_MS = 60_000;

@Component({
  selector: 'pd-monitoring-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    TranslocoPipe,
    MonitorCardComponent,
  ],
  template: `
    <header class="page-header">
      <h1 class="page-title">{{ 'monitoring.title' | transloco }}</h1>
    </header>

    <mat-card appearance="outlined" class="add">
      <mat-card-header>
        <mat-card-title>{{ 'monitoring.addTitle' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        @if (projects.value().length === 0) {
          <p class="hint">
            {{ 'monitoring.noProjects' | transloco }}
            <a routerLink="/projects">{{ 'core.nav.projects' | transloco }}</a>
          </p>
        } @else {
          <form class="add-form" [formGroup]="form" (ngSubmit)="add()">
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ 'monitoring.project' | transloco }}</mat-label>
              <mat-select formControlName="projectId">
                @for (project of projects.value(); track project.id) {
                  <mat-option [value]="project.id">{{ project.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field subscriptSizing="dynamic" class="url">
              <mat-label>{{ 'monitoring.url' | transloco }}</mat-label>
              <input matInput type="url" formControlName="url" placeholder="https://" />
            </mat-form-field>
            <button matButton="filled" type="submit" [disabled]="form.invalid || busy()">
              {{ 'core.actions.add' | transloco }}
            </button>
          </form>
        }
      </mat-card-content>
    </mat-card>

    <div class="cards">
      @for (monitor of monitors.value(); track monitor.id) {
        <pd-monitor-card
          [monitor]="monitor"
          [projectName]="projectNames().get(monitor.projectId) ?? ''"
          (remove)="remove($event)"
        />
      } @empty {
        <p class="empty">{{ 'monitoring.empty' | transloco }}</p>
      }
    </div>
  `,
  styles: `
    .add {
      margin-bottom: 16px;
    }
    .add-form {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      padding-top: 8px;
    }
    .add-form mat-form-field {
      flex: 1 1 200px;
    }
    .add-form .url {
      flex: 2 1 300px;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(420px, 100%), 1fr));
      gap: 16px;
    }
  `,
})
export class MonitoringPage {
  private readonly api = inject(MonitoringApi);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly monitors = this.api.monitors();
  protected readonly projects = inject(ProjectsApi).list();
  protected readonly busy = signal(false);

  protected readonly projectNames = computed(
    () => new Map(this.projects.value().map((project) => [project.id, project.name])),
  );

  protected readonly form = inject(NonNullableFormBuilder).group({
    projectId: ['', Validators.required],
    url: ['', Validators.required],
  });

  constructor() {
    // При выборе проекта подставляем его адрес — обычно мониторят именно его.
    this.form.controls.projectId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const project = this.projects.value().find((p) => p.id === id);
      if (project?.url && !this.form.controls.url.dirty) {
        this.form.controls.url.setValue(project.url);
      }
    });

    interval(REFRESH_MS)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.monitors.reload());
  }

  async add(): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.add(this.form.getRawValue()));
      this.form.reset();
      this.monitors.reload();
    } catch (error) {
      const key =
        error instanceof HttpErrorResponse && error.status === 409
          ? 'monitoring.errors.duplicate'
          : 'monitoring.errors.generic';
      this.snackBar.open(this.transloco.translate(key), 'OK', { duration: 5000 });
    } finally {
      this.busy.set(false);
    }
  }

  async remove(monitor: Monitor): Promise<void> {
    if (confirm(this.transloco.translate('monitoring.confirmDelete', { url: monitor.url }))) {
      await firstValueFrom(this.api.remove(monitor.id));
      this.monitors.reload();
    }
  }
}
