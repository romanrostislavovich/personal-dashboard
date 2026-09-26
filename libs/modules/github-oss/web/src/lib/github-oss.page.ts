import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { TrackedRepo } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { GithubOssApi } from './github-oss.api';
import { RepoCardComponent } from './repo-card.component';

@Component({
  selector: 'pd-github-oss-page',
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
    TranslocoPipe,
    RepoCardComponent,
  ],
  templateUrl: './github-oss.page.html',
  styleUrl: './github-oss.page.scss',
})
export class GithubOssPage {
  private readonly api = inject(GithubOssApi);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly repos = this.api.repos();
  protected readonly settings = this.api.settings();
  protected readonly busy = signal(false);

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
  protected readonly tokenForm = this.fb.group({ token: ['', Validators.required] });

  async addRepo(): Promise<void> {
    const { repo, npmPackage } = this.addForm.getRawValue();
    await this.run(
      async () => {
        await firstValueFrom(this.api.addRepo({ repo, npmPackage: npmPackage || null }));
        this.addForm.reset();
        this.repos.reload();
      },
      { 400: 'github-oss.errors.notFound', 409: 'github-oss.errors.duplicate' },
    );
  }

  async removeRepo(repo: TrackedRepo): Promise<void> {
    if (confirm(this.transloco.translate('github-oss.confirmDelete', { name: repo.fullName }))) {
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

  async saveToken(): Promise<void> {
    await this.run(
      async () => {
        await firstValueFrom(this.api.saveToken(this.tokenForm.getRawValue().token));
        this.tokenForm.reset();
        this.settings.reload();
      },
      { 400: 'github-oss.errors.invalidToken' },
    );
  }

  async removeToken(): Promise<void> {
    await firstValueFrom(this.api.removeToken());
    this.settings.reload();
  }

  /**
   * Индикатор загрузки + понятное сообщение об ошибке.
   * `errorKeys` — ключи переводов для ожидаемых HTTP-статусов.
   */
  private async run(
    action: () => Promise<void>,
    errorKeys: Record<number, string> = {},
  ): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } catch (error) {
      const key = error instanceof HttpErrorResponse ? errorKeys[error.status] : undefined;
      this.snackBar.open(this.transloco.translate(key ?? 'github-oss.errors.generic'), 'OK', {
        duration: 6000,
      });
    } finally {
      this.busy.set(false);
    }
  }
}
