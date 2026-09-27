import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, NO_PARAMETERS } from '@pd/api-core';
import { ReposService } from './repos.service';

/** Доступ AI к open source статистике. */
@Injectable()
export class GithubOssAiTools implements OnModuleInit {
  constructor(
    private readonly ai: AiService,
    private readonly repos: ReposService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'github_repos',
      module: 'github-oss',
      description:
        'Open source репозитории: звёзды и прирост за 7/30 дней, форки, открытые issues и PR, ' +
        'последний релиз, загрузки npm за неделю.',
      parameters: NO_PARAMETERS,
      handler: async (userId) =>
        (await this.repos.list(userId)).map((repo) => ({ ...repo, history: undefined })),
    });
  }
}
