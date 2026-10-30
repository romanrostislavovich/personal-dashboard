import {Injectable, OnModuleInit} from '@nestjs/common';
import {IntegrationsService, ServerKeysService} from '@pd/api-core';

/** Writing in the list of integrations: the LanguageTool server the owner set. */
@Injectable()
export class WritingIntegrations implements OnModuleInit {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly keys: ServerKeysService,
  ) {}

  onModuleInit(): void {
    this.integrations.register({
      id: 'writing.languagetool',
      module: 'writing',
      name: 'LanguageTool',
      reports: async () => {
        const url = await this.keys.get('writing.languagetool-url');
        return url ? [{name: 'LanguageTool', detail: url}] : [];
      },
    });
  }
}
