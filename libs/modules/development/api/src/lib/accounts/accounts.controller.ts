import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AuthUser, CurrentUser, ServerActions, ZodValidationPipe } from '@pd/api-core';
import {
  BitbucketTokenInput,
  bitbucketTokenInputSchema,
  CodeAccount,
  CodeAccountsSettings,
  CodeAccountsSummary,
  CodeProvider,
  codeProviderSchema,
  GithubContributionDay,
  GitlabTokenInput,
  gitlabTokenInputSchema,
  githubYearSchema,
  TokenProvider,
  tokenProviderSchema,
} from '@pd/contracts';
import { AccountTokensService } from './account-tokens.service';
import { ACCOUNT_ACTIONS } from './accounts.server-actions';
import { AccountsService } from './accounts.service';
import { CodeAccountsService } from './code-accounts.service';

const provider = new ZodValidationPipe(codeProviderSchema);
const tokenProvider = new ZodValidationPipe(tokenProviderSchema);
const year = new ZodValidationPipe(githubYearSchema);

/** Accounts on GitHub, GitLab and Bitbucket, each on its own and all together. */
@Controller('development/accounts')
export class AccountsController {
  private readonly logger = new Logger(AccountsController.name);

  constructor(
    private readonly actions: ServerActions,
    private readonly accounts: AccountsService,
    private readonly stored: CodeAccountsService,
    private readonly tokens: AccountTokensService,
  ) {}

  /** Which services are connected. */
  @Get('settings')
  settings(@CurrentUser() user: AuthUser): Promise<CodeAccountsSettings> {
    return this.tokens.settings(user.id);
  }

  /** Every connected account as one; `null` — none is connected yet. */
  @Get('summary')
  summary(@CurrentUser() user: AuthUser): Promise<CodeAccountsSummary | null> {
    return this.accounts.summary(user.id);
  }

  /** The common calendar of a year. */
  @Get('summary/contributions')
  summaryContributions(
    @CurrentUser() user: AuthUser,
    @Query('year', year) of: number,
  ): Promise<GithubContributionDay[]> {
    return this.accounts.summaryContributions(user.id, `${of}-01-01`, `${of}-12-31`);
  }

  /** Saves the GitLab token and loads the account it belongs to right away. */
  @Put('gitlab/token')
  @HttpCode(204)
  async saveGitlabToken(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(gitlabTokenInputSchema)) input: GitlabTokenInput,
  ): Promise<void> {
    await this.actions.run(user.id, ACCOUNT_ACTIONS.saveGitlabToken, input);
    await this.firstSync(user.id, 'gitlab');
  }

  @Put('bitbucket/token')
  @HttpCode(204)
  async saveBitbucketToken(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(bitbucketTokenInputSchema)) input: BitbucketTokenInput,
  ): Promise<void> {
    await this.actions.run(user.id, ACCOUNT_ACTIONS.saveBitbucketToken, input);
    await this.firstSync(user.id, 'bitbucket');
  }

  /** Disconnects the service and forgets its account. */
  @Delete(':provider/token')
  @HttpCode(204)
  async removeToken(
    @CurrentUser() user: AuthUser,
    @Param('provider', tokenProvider) of: TokenProvider,
  ): Promise<void> {
    await this.tokens.remove(user.id, of);
    await this.stored.remove(user.id, of);
  }

  /** `null` until the first sync. */
  @Get(':provider/profile')
  account(
    @CurrentUser() user: AuthUser,
    @Param('provider', provider) of: CodeProvider,
  ): Promise<CodeAccount | null> {
    return this.accounts.account(user.id, of);
  }

  /** The calendar of a year. */
  @Get(':provider/contributions')
  contributions(
    @CurrentUser() user: AuthUser,
    @Param('provider', provider) of: CodeProvider,
    @Query('year', year) ofYear: number,
  ): Promise<GithubContributionDay[]> {
    return this.accounts.contributions(user.id, of, `${ofYear}-01-01`, `${ofYear}-12-31`);
  }

  /** Refresh now without waiting for the hourly sync. */
  @Post(':provider/sync')
  @HttpCode(204)
  async sync(
    @CurrentUser() user: AuthUser,
    @Param('provider', provider) of: CodeProvider,
  ): Promise<void> {
    await this.actions.run(user.id, ACCOUNT_ACTIONS.sync, { provider: of });
  }

  /** A token that reads only a part (no private projects, say) is still a valid one. */
  private async firstSync(userId: string, of: TokenProvider): Promise<void> {
    await this.actions
      .run(userId, ACCOUNT_ACTIONS.sync, { provider: of })
      .catch((error) => this.logger.warn(`${of} account of ${userId} was not loaded: ${error}`));
  }
}
