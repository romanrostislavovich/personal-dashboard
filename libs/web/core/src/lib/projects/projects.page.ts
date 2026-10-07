import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Project, ProjectInput } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { ProjectFormDialog } from './project-form.dialog';
import { ProjectsApi } from './projects.api';
import { errorStatus } from '../client/core-requests';

@Component({
  selector: 'pd-projects-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatButtonModule, MatIconModule, RouterLink, TranslocoPipe],
  template: `
    <header class="page-header">
      <h1 class="page-title">{{ 'core.projects.title' | transloco }}</h1>
      <button matButton="filled" (click)="openForm()">
        <mat-icon>add</mat-icon> {{ 'core.projects.add' | transloco }}
      </button>
    </header>
    <p class="hint">{{ 'core.projects.hint' | transloco }}</p>

    <div class="cards">
      @for (project of projects.value(); track project.id) {
        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>
              <a class="name" [routerLink]="['/projects', project.id]">{{ project.name }}</a>
            </mat-card-title>
            @if (project.url) {
              <mat-card-subtitle>
                <a [href]="project.url" target="_blank" rel="noopener">{{ project.url }}</a>
              </mat-card-subtitle>
            }
          </mat-card-header>
          @if (project.description) {
            <mat-card-content>
              <p>{{ project.description }}</p>
            </mat-card-content>
          }
          <mat-card-actions align="end">
            <a matButton [routerLink]="['/projects', project.id]">
              {{ 'core.projects.open' | transloco }}
            </a>
            <button matIconButton (click)="openForm(project)"><mat-icon>edit</mat-icon></button>
            <button matIconButton (click)="remove(project)"><mat-icon>delete</mat-icon></button>
          </mat-card-actions>
        </mat-card>
      } @empty {
        <p class="empty">{{ 'core.projects.empty' | transloco }}</p>
      }
    </div>
  `,
  styles: `
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
      gap: 16px;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
      margin-top: 0;
    }
    .name {
      color: inherit;
      text-decoration: none;
    }
  `,
})
export class ProjectsPage {
  private readonly api = inject(ProjectsApi);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly projects = this.api.list();

  async openForm(project?: Project): Promise<void> {
    const input = await firstValueFrom(
      this.dialog
        .open<ProjectFormDialog, Project | null, ProjectInput>(ProjectFormDialog, {
          data: project ?? null,
        })
        .afterClosed(),
    );
    if (!input) {
      return;
    }
    await firstValueFrom(project ? this.api.update(project.id, input) : this.api.create(input));
    this.projects.reload();
  }

  async remove(project: Project): Promise<void> {
    if (!confirm(this.transloco.translate('core.projects.confirmDelete', { name: project.name }))) {
      return;
    }
    try {
      await firstValueFrom(this.api.remove(project.id));
      this.projects.reload();
    } catch (error) {
      if (errorStatus(error) === 409) {
        this.snackBar.open(this.transloco.translate('core.projects.inUse'), 'OK', {
          duration: 5000,
        });
        return;
      }
      throw error;
    }
  }
}
