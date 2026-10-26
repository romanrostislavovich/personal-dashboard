import { Injectable, OnModuleInit } from '@nestjs/common';
import { ServerActions } from '@pd/api-core';
import {
  movieAddSchema,
  movieAssignSchema,
  movieSearchQuerySchema,
  tmdbKeySchema,
} from '@pd/contracts';
import { z } from 'zod';
import { MoviesMatchService } from './movies-match.service';

/** TMDB requests run on the server (see ServerActions). */
export const MOVIES_ACTIONS = {
  search: 'movies.search',
  add: 'movies.add',
  assign: 'movies.assign',
  setKey: 'movies.set-key',
} as const;

@Injectable()
export class MoviesServerActions implements OnModuleInit {
  constructor(
    private readonly actions: ServerActions,
    private readonly match: MoviesMatchService,
  ) {}

  onModuleInit(): void {
    this.actions.register(MOVIES_ACTIONS.search, (userId, args) =>
      this.match.search(userId, movieSearchQuerySchema.parse(args).q),
    );
    this.actions.register(MOVIES_ACTIONS.add, (userId, args) =>
      this.match.add(userId, movieAddSchema.parse(args)),
    );
    this.actions.register(MOVIES_ACTIONS.assign, (userId, args) => {
      const { viewId, ...input } = movieAssignSchema.extend({ viewId: z.uuid() }).parse(args);
      return this.match.assign(userId, viewId, input);
    });
    this.actions.register(MOVIES_ACTIONS.setKey, (userId, args) =>
      this.match.setKey(userId, tmdbKeySchema.parse(args).key),
    );
  }
}
