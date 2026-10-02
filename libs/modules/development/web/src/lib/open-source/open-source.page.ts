import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { REPO_RELATIONS, TrackedRepo, TrackedRepoUpdate } from '@pd/contracts';
import { errorStatus, INTEGRATIONS_LINK } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { AccountsApi } from '../accounts/accounts.api';
import { PROVIDER_NAMES } from '../accounts/providers';
import { OpenSourceApi } from './open-source.api';
import { RepoDetailsComponent } from './repo-details.component';
import {
  DEFAULT_REPO_FILTER,
  filterRepos,
  RepoFilter,
  RepoKind,
  repoLanguages,
  repoProviders,
  RepoSort,
  RepoSortColumn,
  sortRepos,
} from './repo-filter';
import { RepoFormDialog } from './repo-form.dialog';

/** Sortable columns after the name; numbers are right-aligned. */
const COLUMNS: { column: RepoSortColumn; labelKey: string; numeric: boolean }[] = [
  { column: 'language', labelKey: 'development.oss.language', numeric: false },
  { column: 'stars', labelKey: 'development.oss.stars', numeric: true },
  { column: 'starsWeek', labelKey: 'development.oss.week', numeric: true },
  { column: 'forks', labelKey: 'development.oss.forks', numeric: true },
  { column: 'openIssues', labelKey: 'development.oss.issues', numeric: true },
  { column: 'openPulls', labelKey: 'development.oss.pulls', numeric: true },
  { column: 'npmWeeklyDownloads', labelKey: 'development.oss.npmWeekly', numeric: true },
  { column: 'pushedAt', labelKey: 'development.oss.lastPush', numeric: true },
];

/**
 * Open source repositories: the public ones of the GitHub account and its organizations appear
 * by themselves, any other is added by hand. A table with filters; a row opens into details.
 */
@Component({
  selector: 'pd-open-source-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    NgTemplateOutlet,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTooltipModule,
    RouterLink,
    TranslocoPipe,
    RepoDetailsComponent,
  ],
  templateUrl: './open-source.page.html',
  styleUrl: './open-source.page.scss',
})
export class OpenSourcePage {
  private readonly api = inject(OpenSourceApi);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  protected readonly repos = this.api.repos();
  protected readonly settings = inject(AccountsApi).settings();
  /** No service is connected: there is nothing to read repositories with. */
  protected readonly tokenMissing = computed(() => {
    const settings = this.settings.value();
    return Boolean(settings) && !Object.values(settings ?? {}).some(Boolean);
  });
  protected readonly busy = signal(false);
  /** The tokens live in Settings → Integrations (see `integrations` in development.module.ts). */
  protected readonly integrations = INTEGRATIONS_LINK;

  protected readonly columns = COLUMNS;
  protected readonly relations = REPO_RELATIONS;
  protected readonly kinds: RepoKind[] = ['forks', 'archived', 'hidden'];
  protected readonly filter = signal<RepoFilter>(DEFAULT_REPO_FILTER);
  protected readonly sort = signal<RepoSort>({ column: 'stars', descending: true });
  /** The row opened into details. */
  protected readonly expanded = signal<string | null>(null);

  protected readonly languages = computed(() => repoLanguages(this.repos.value()));
  /** The services the repositories come from — a filter once there is more than one. */
  protected readonly providers = computed(() => repoProviders(this.repos.value()));
  protected readonly providerNames = PROVIDER_NAMES;
  protected readonly rows = computed(() =>
    sortRepos(filterRepos(this.repos.value(), this.filter()), this.sort()),
  );
  /** Totals of the rows in the table: they follow the filters. */
  protected readonly totals = computed(() => {
    const repos = this.rows();
    return {
      repos: repos.length,
      stars: repos.reduce((sum, r) => sum + r.stars, 0),
      starsWeek: repos.reduce((sum, r) => sum + r.starsDelta.week, 0),
      issues: repos.reduce((sum, r) => sum + r.openIssues, 0),
      pulls: repos.reduce((sum, r) => sum + r.openPulls, 0),
      npmWeekly: repos.reduce((sum, r) => sum + (r.npmWeeklyDownloads ?? 0), 0),
    };
  });

  protected setFilter(change: Partial<RepoFilter>): void {
    this.filter.update((filter) => ({ ...filter, ...change }));
  }

  /** A second click on the same column turns the order around; text starts A→Z, numbers high→low. */
  protected sortBy(column: RepoSortColumn): void {
    this.sort.update((sort) =>
      sort.column === column
        ? { column, descending: !sort.descending }
        : { column, descending: column !== 'fullName' && column !== 'language' },
    );
  }

  protected ariaSort(column: RepoSortColumn): 'ascending' | 'descending' | null {
    const sort = this.sort();
    return sort.column === column ? (sort.descending ? 'descending' : 'ascending') : null;
  }

  protected toggle(repo: TrackedRepo): void {
    this.expanded.update((id) => (id === repo.id ? null : repo.id));
  }

  protected shortName(repo: TrackedRepo): { owner: string; name: string } {
    // A GitLab project may sit in nested groups: everything before the last part is the owner.
    const at = repo.fullName.lastIndexOf('/');
    return at < 0
      ? { owner: repo.fullName, name: repo.fullName }
      : { owner: repo.fullName.slice(0, at), name: repo.fullName.slice(at + 1) };
  }

  async add(): Promise<void> {
    await this.openForm(null);
  }

  async editNpm(repo: TrackedRepo): Promise<void> {
    await this.openForm(repo);
  }

  async update(repo: TrackedRepo, update: TrackedRepoUpdate): Promise<void> {
    await this.run(async () => {
      await firstValueFrom(this.api.updateRepo(repo.id, update));
      this.repos.reload();
    });
  }

  async remove(repo: TrackedRepo): Promise<void> {
    if (
      confirm(this.transloco.translate('development.oss.confirmDelete', { name: repo.fullName }))
    ) {
      await this.run(async () => {
        await firstValueFrom(this.api.removeRepo(repo.id));
        this.repos.reload();
      });
    }
  }

  async syncAll(): Promise<void> {
    await this.run(
      async () => {
        await firstValueFrom(this.api.syncAll());
        this.repos.reload();
      },
      { 400: 'development.errors.invalidToken' },
    );
  }

  private async openForm(repo: TrackedRepo | null): Promise<void> {
    const saved = await firstValueFrom(
      this.dialog
        .open<RepoFormDialog, TrackedRepo | null, boolean>(RepoFormDialog, { data: repo })
        .afterClosed(),
    );
    if (saved) {
      this.repos.reload();
    }
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
