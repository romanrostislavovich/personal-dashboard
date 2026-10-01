import { Module } from '@nestjs/common';
import { GithubController } from './github/github.controller';
import { GithubTokenService } from './github/github-token.service';
import { OpenSourceAchievements } from './open-source/open-source.achievements';
import { OpenSourceAiTools } from './open-source/open-source.ai-tools';
import { OpenSourceController } from './open-source/open-source.controller';
import { OpenSourceDigest } from './open-source/open-source.digest';
import { OpenSourceServerActions } from './open-source/open-source.server-actions';
import { RepoSyncJob } from './open-source/repo-sync.job';
import { RepoSyncService } from './open-source/repo-sync.service';
import { ReposService } from './open-source/repos.service';

/**
 * Everything about coding, one folder per subsection:
 * - `open-source/` — tracked repositories: GitHub stars, forks, issues, PRs, releases, npm downloads;
 * - `github/` — the GitHub token and client the subsections share.
 *
 * API: `/api/development/*`.
 */
@Module({
  controllers: [GithubController, OpenSourceController],
  providers: [
    GithubTokenService,
    ReposService,
    RepoSyncService,
    RepoSyncJob,
    OpenSourceAchievements,
    OpenSourceAiTools,
    OpenSourceDigest,
    OpenSourceServerActions,
  ],
})
export class DevelopmentModule {}
