import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Put,
  Query,
  Redirect,
} from '@nestjs/common';
import { AuthUser, CurrentUser, Public, ZodValidationPipe } from '@pd/api-core';
import {
  LastfmSettingsInput,
  lastfmSettingsInputSchema,
  MUSIC_TOP_PERIODS,
  MusicSettings,
  MusicTopPeriod,
  NowPlaying,
} from '@pd/contracts';
import { z } from 'zod';
import { LastfmService } from './lastfm.service';
import { SpotifyService } from './spotify.service';

@Controller('music')
export class MusicController {
  constructor(
    private readonly lastfm: LastfmService,
    private readonly spotify: SpotifyService,
  ) {}

  @Get('settings')
  async settings(@CurrentUser() user: AuthUser): Promise<MusicSettings> {
    const lastfm = await this.lastfm.getSettings(user.id);
    return {
      lastfm: {
        username: lastfm?.lastfmUsername ?? null,
        lastSyncedAt: lastfm?.lastSyncedAt?.toISOString() ?? null,
        lastError: lastfm?.lastError ?? null,
      },
      spotify: {
        available: this.spotify.isAvailable,
        connected: await this.spotify.isConnected(user.id),
      },
    };
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.lastfm.stats(user.id);
  }

  @Get('tops')
  tops(
    @CurrentUser() user: AuthUser,
    @Query('period', new ZodValidationPipe(z.enum(MUSIC_TOP_PERIODS).default('7day')))
    period: MusicTopPeriod,
  ) {
    return this.lastfm.tops(user.id, period);
  }

  /** Spotify first (more precise, with progress); if it is not connected — Last.fm. */
  @Get('now-playing')
  async nowPlaying(@CurrentUser() user: AuthUser): Promise<NowPlaying | null> {
    return (await this.spotify.nowPlaying(user.id)) ?? (await this.lastfm.nowPlaying(user.id));
  }

  // --- Last.fm ---

  @Put('lastfm')
  @HttpCode(204)
  connectLastfm(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(lastfmSettingsInputSchema)) input: LastfmSettingsInput,
  ) {
    return this.lastfm.connect(user.id, input);
  }

  @Delete('lastfm')
  @HttpCode(204)
  disconnectLastfm(@CurrentUser() user: AuthUser) {
    return this.lastfm.disconnect(user.id);
  }

  @Post('lastfm/sync')
  @HttpCode(204)
  syncLastfm(@CurrentUser() user: AuthUser) {
    return this.lastfm.sync(user.id);
  }

  // --- Spotify ---

  @Post('spotify/connect')
  connectSpotify(@CurrentUser() user: AuthUser): { url: string } {
    return { url: this.spotify.connectUrl(user.id) };
  }

  /** Spotify returns the browser here after sign-in; the user is identified by `state`. */
  @Public()
  @Get('spotify/callback')
  @Redirect()
  async spotifyCallback(@Query('code') code?: string, @Query('state') state?: string) {
    return { url: await this.spotify.handleCallback(code, state) };
  }

  @Delete('spotify')
  @HttpCode(204)
  disconnectSpotify(@CurrentUser() user: AuthUser) {
    return this.spotify.disconnect(user.id);
  }
}
