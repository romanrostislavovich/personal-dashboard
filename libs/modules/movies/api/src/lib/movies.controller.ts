import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AuthUser, CurrentUser, RateLimit, ServerActions, ZodValidationPipe } from '@pd/api-core';
import {
  MovieAdd,
  movieAddSchema,
  MovieAssign,
  movieAssignSchema,
  MovieSearchResult,
  movieSearchQuerySchema,
  MovieSettings,
  movieSettingsSchema,
  MoviesStatus,
  MovieTitle,
  MovieTitleUpdate,
  movieTitleUpdateSchema,
  MovieView,
  MovieViewsQuery,
  movieViewsQuerySchema,
  tmdbKeySchema,
  WatchConfig,
  WatchIngest,
  watchIngestSchema,
} from '@pd/contracts';
import { z } from 'zod';
import { MoviesMatchService } from './movies-match.service';
import { MOVIES_ACTIONS } from './movies.server-actions';
import { MoviesService } from './movies.service';

const listSchema = z.object({ list: z.enum(['history', 'want']).default('history') });

/** Movies and TV shows: `/api/movies`. */
@Controller('movies')
export class MoviesController {
  constructor(
    private readonly movies: MoviesService,
    private readonly match: MoviesMatchService,
    private readonly actions: ServerActions,
  ) {}

  @Get()
  status(@CurrentUser() user: AuthUser): Promise<MoviesStatus> {
    return this.movies.status(user.id);
  }

  /** The browser extension's views; the answer is what it should go on doing. */
  @Post('watching')
  watching(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(watchIngestSchema)) input: WatchIngest,
  ): Promise<WatchConfig> {
    return this.movies.ingest(user.id, input.views);
  }

  @Get('titles')
  titles(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listSchema)) query: z.infer<typeof listSchema>,
  ): Promise<MovieTitle[]> {
    return this.movies.titles(user.id, query.list);
  }

  @Post('titles')
  add(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(movieAddSchema)) input: MovieAdd,
  ): Promise<MovieTitle> {
    return this.actions.run(user.id, MOVIES_ACTIONS.add, input);
  }

  @Patch('titles/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(movieTitleUpdateSchema)) patch: MovieTitleUpdate,
  ): Promise<MovieTitle> {
    return this.movies.update(user.id, id, patch);
  }

  @Delete('titles/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.movies.remove(user.id, id);
  }

  @Get('views')
  views(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(movieViewsQuerySchema)) query: MovieViewsQuery,
  ): Promise<MovieView[]> {
    return this.movies.views(user.id, query);
  }

  /** "This is it": the film or the show a view not found by itself was. */
  @Post('views/:id/assign')
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(movieAssignSchema)) input: MovieAssign,
  ): Promise<MovieTitle> {
    return this.actions.run(user.id, MOVIES_ACTIONS.assign, { viewId: id, ...input });
  }

  /** "Not a film". */
  @Post('views/:id/dismiss')
  @HttpCode(204)
  dismiss(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.movies.dismiss(user.id, id);
  }

  @Get('search')
  @RateLimit(30, 60)
  search(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(movieSearchQuerySchema)) query: { q: string },
  ): Promise<MovieSearchResult[]> {
    return this.actions.run(user.id, MOVIES_ACTIONS.search, query);
  }

  @Put('settings')
  setSettings(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(movieSettingsSchema)) input: MovieSettings,
  ): Promise<MovieSettings> {
    return this.movies.setSettings(user.id, input);
  }

  /** "Not on this site": the site is left alone and its views go. */
  @Post('settings/ignore-site')
  ignoreSite(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(z.object({ site: z.string().trim().min(1).max(253) })))
    input: { site: string },
  ): Promise<MovieSettings> {
    return this.movies.ignoreSite(user.id, input.site);
  }

  @Put('tmdb-key')
  @HttpCode(204)
  @RateLimit(10, 60)
  setKey(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(tmdbKeySchema)) input: { key: string },
  ): Promise<void> {
    return this.actions.run(user.id, MOVIES_ACTIONS.setKey, input);
  }

  @Delete('tmdb-key')
  @HttpCode(204)
  removeKey(@CurrentUser() user: AuthUser): Promise<void> {
    return this.match.removeKey(user.id);
  }
}
