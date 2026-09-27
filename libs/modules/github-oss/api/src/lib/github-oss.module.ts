import { Module } from '@nestjs/common';
import { GithubOssAchievements } from './github-oss.achievements';
import { GithubOssController } from './github-oss.controller';
import { GithubTokenService } from './github-token.service';
import { ReposService } from './repos.service';
import { GithubSyncJob } from './sync/github-sync.job';
import { RepoSyncService } from './sync/repo-sync.service';

/**
 * Аналитика open-source проектов: GitHub (stars, forks, issues, PR, релизы) + загрузки npm.
 * API: `/api/github-oss/*`.
 */
@Module({
  controllers: [GithubOssController],
  providers: [
    GithubTokenService,
    ReposService,
    RepoSyncService,
    GithubSyncJob,
    GithubOssAchievements,
  ],
})
export class GithubOssModule {}
