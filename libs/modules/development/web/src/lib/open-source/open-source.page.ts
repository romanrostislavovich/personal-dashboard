import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { TrackedRepo } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { errorStatus, INTEGRATIONS_LINK } from '@pd/web-core';
import { GithubApi } from '../github/github.api';
import { OpenSourceApi } from './open-source.api';
import { RepoCardComponent } from './repo-card.component';
import { RepoFormDialog } from './repo-form.dialog';

@Component({
  selector: 'pd-open-source-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    RouterLink,
    TranslocoPipe,
    RepoCardComponent,
  ],
  templateUrl: './open-source.page.html',
  styleUrl: './open-source.page.scss',
})
export class OpenSourcePage {
  private readonly api = inject(OpenSourceApi);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly repos = this.api.repos();
  protected readonly settings = inject(GithubApi).settings();
  protected readonly busy = signal(false);
  /** The GitHub token lives in Settings → Integrations (github/github-token.integration.ts). */
  protected readonly integrations = INTEGRATIONS_LINK;

  protected readonly totals = computed(() => {
    const repos = this.repos.value();
    return {
      stars: repos.reduce((sum, r) => sum + r.stars, 0),
      starsWeek: repos.reduce((sum, r) => sum + r.starsDelta.week, 0),
      issues: repos.reduce((sum, r) => sum + r.openIssues, 0),
      pulls: repos.reduce((sum, r) => sum + r.openPulls, 0),
      npmWeekly: repos.reduce((sum, r) => sum + (r.npmWeeklyDownloads ?? 0), 0),
    };
  });

  protected readonly addForm = this.fb.group({
    repo: ['', Validators.required],
    npmPackage: [''],
  });

  async addRepo(): Promise<void> {
    const { repo, npmPackage } = this.addForm.getRawValue();
    await this.run(
      async () => {
        await firstValueFrom(this.api.addRepo({ repo, npmPackage: npmPackage || null }));
        this.addForm.reset();
        this.repos.reload();
      },
      { 400: 'development.errors.notFound', 409: 'development.errors.duplicate' },
    );
  }

  async editRepo(repo: TrackedRepo): Promise<void> {
    const saved = await firstValueFrom(
      this.dialog
        .open<RepoFormDialog, TrackedRepo, boolean>(RepoFormDialog, { data: repo })
        .afterClosed(),
    );
    if (saved) {
      this.repos.reload();
    }
  }

  async removeRepo(repo: TrackedRepo): Promise<void> {
    if (confirm(this.transloco.translate('development.oss.confirmDelete', { name: repo.fullName }))) {
      await firstValueFrom(this.api.removeRepo(repo.id));
      this.repos.reload();
    }
  }

  async syncAll(): Promise<void> {
    await this.run(async () => {
      await firstValueFrom(this.api.syncAll());
      this.repos.reload();
    });
  }

  /**
   * Loading indicator + a clear error message.
   * `errorKeys` — translation keys for expected HTTP statuses.
   */
  private async run(
    action: () => Promise<void>,
    errorKeys: Record<number, string> = {},
  ): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } catch (error) {
      const key = errorKeys[errorStatus(error)];
      this.snackBar.open(this.transloco.translate(key ?? 'development.errors.generic'), 'OK', {
        duration: 6000,
      });
    } finally {
      this.busy.set(false);
    }
  }
}
