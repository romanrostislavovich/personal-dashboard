import { Module } from '@nestjs/common';
import { DevelopmentLife } from './development.life';
import { OpenSourceSearch } from './open-source/open-source.search';
import { AccountTokensService } from './accounts/account-tokens.service';
import { AccountsAchievements } from './accounts/accounts.achievements';
import { AccountsAiTools } from './accounts/accounts.ai-tools';
import { AccountsController } from './accounts/accounts.controller';
import { AccountsDigest } from './accounts/accounts.digest';
import { AccountsJob } from './accounts/accounts.job';
import { AccountsServerActions } from './accounts/accounts.server-actions';
import { AccountsService } from './accounts/accounts.service';
import { CodeAccountsService } from './accounts/code-accounts.service';
import { GithubController } from './github/github.controller';
import { GithubTokenService } from './github/github-token.service';
import { GithubProfileAchievements } from './github-profile/github-profile.achievements';
import { GithubProfileAiTools } from './github-profile/github-profile.ai-tools';
import { GithubProfileController } from './github-profile/github-profile.controller';
import { GithubProfileDigest } from './github-profile/github-profile.digest';
import { GithubProfileJob } from './github-profile/github-profile.job';
import { GithubProfileServerActions } from './github-profile/github-profile.server-actions';
import { GithubProfileService } from './github-profile/github-profile.service';
import { OpenSourceAchievements } from './open-source/open-source.achievements';
import { OpenSourceAiTools } from './open-source/open-source.ai-tools';
import { OpenSourceController } from './open-source/open-source.controller';
import { OpenSourceDigest } from './open-source/open-source.digest';
import { OpenSourceServerActions } from './open-source/open-source.server-actions';
import { RepoSyncJob } from './open-source/repo-sync.job';
import { RepoSourcesService } from './open-source/repo-sources.service';
import { RepoSyncService } from './open-source/repo-sync.service';
import { ReposService } from './open-source/repos.service';
import { WakatimeAchievements } from './wakatime/wakatime.achievements';
import { WakatimeAiTools } from './wakatime/wakatime.ai-tools';
import { WakatimeController } from './wakatime/wakatime.controller';
import { WakatimeDigest } from './wakatime/wakatime.digest';
import { WakatimeJob } from './wakatime/wakatime.job';
import { WakatimeServerActions } from './wakatime/wakatime.server-actions';
import { WakatimeService } from './wakatime/wakatime.service';

/**
 * Everything about coding, one folder per subsection:
 * - `open-source/` — tracked repositories of every connected service: stars, forks, issues, PRs,
 *   releases, npm downloads;
 * - `github-profile/` — the GitHub account of the token's owner: contributions, streaks, languages;
 * - `accounts/` — the GitLab and Bitbucket accounts, and all accounts as one (the summary);
 * - `gitlab/`, `bitbucket/` — the clients of these services: the account and the repositories;
 * - `wakatime/` — coding time from WakaTime, copied day by day;
 * - `github/` — the GitHub token and client the subsections share.
 *
 * API: `/api/development/*`.
 */
@Module({
  controllers: [
    AccountsController,
    GithubController,
    GithubProfileController,
    OpenSourceController,
    WakatimeController,
  ],
  providers: [
    DevelopmentLife,
    OpenSourceSearch,
    GithubTokenService,
    AccountTokensService,
    AccountsService,
    CodeAccountsService,
    AccountsJob,
    AccountsAchievements,
    AccountsAiTools,
    AccountsDigest,
    AccountsServerActions,
    RepoSourcesService,
    ReposService,
    RepoSyncService,
    RepoSyncJob,
    OpenSourceAchievements,
    OpenSourceAiTools,
    OpenSourceDigest,
    OpenSourceServerActions,
    GithubProfileService,
    GithubProfileJob,
    GithubProfileAchievements,
    GithubProfileAiTools,
    GithubProfileDigest,
    GithubProfileServerActions,
    WakatimeService,
    WakatimeJob,
    WakatimeAchievements,
    WakatimeAiTools,
    WakatimeDigest,
    WakatimeServerActions,
  ],
})
export class DevelopmentModule {}
