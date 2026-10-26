import { Injectable, OnModuleInit } from '@nestjs/common';
import { IntegrationsService, SecretsService } from '@pd/api-core';
import { TMDB_KEY_SECRET } from './movies.service';

/** TMDB in the list of integrations: the key that finds the titles. */
@Injectable()
export class MoviesIntegrations implements OnModuleInit {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly secrets: SecretsService,
  ) {}

  onModuleInit(): void {
    this.integrations.register({
      id: 'movies.tmdb',
      name: 'TMDB',
      module: 'movies',
      reports: async (userId) =>
        (await this.secrets.has(userId, TMDB_KEY_SECRET)) ? [{ name: 'TMDB' }] : [],
    });
  }
}
