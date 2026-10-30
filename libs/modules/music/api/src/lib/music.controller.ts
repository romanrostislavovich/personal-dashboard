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
import {
  AuthUser,
  CurrentUser,
  Public,
  ServerActions,
  ServerKeysService,
  ZodValidationPipe,
} from '@pd/api-core';
import {
  LastfmSettingsInput,
  lastfmSettingsInputSchema,
  MUSIC_TOP_PERIODS,
  MusicSettings,
  MusicTopPeriod,
  NowPlaying,
  SongLinks,
  SongLinksQuery,
  songLinksQuerySchema,
  SpotifyAppInput,
  spotifyAppInputSchema,
} from '@pd/contracts';
import {z} from 'zod';
import {LastfmHistoryImport} from './lastfm-history.import';
import {LastfmService} from './lastfm.service';
import {MusicGenresService} from './music-genres.service';
import {SoundcloudService} from './soundcloud/soundcloud.service';
import {SongLinksService} from './song-links.service';
import {SpotifyService} from './spotify.service';
import {MUSIC_ACTIONS} from './music.server-actions';

@Controller('music')
export class MusicController {
  constructor(
    private readonly actions: ServerActions,
    private readonly lastfm: LastfmService,
    private readonly genres: MusicGenresService,
    private readonly history: LastfmHistoryImport,
    private readonly spotify: SpotifyService,
    private readonly soundcloud: SoundcloudService,
    private readonly songLinks: SongLinksService,
    private readonly keys: ServerKeysService,
  ) {}

  @Get('settings')
  async settings(@CurrentUser() user: AuthUser): Promise<MusicSettings> {
    const lastfm = await this.lastfm.getSettings(user.id);
    const username = lastfm?.lastfmUsername ?? null;
    return {
      lastfm: {
        username,
        lastSyncedAt: lastfm?.lastSyncedAt?.toISOString() ?? null,
        lastError: lastfm?.lastError ?? null,
        history: username
          ? {
              ...(await this.history.status(user.id)),
              total: await this.lastfm
                .totalScrobbles(user.id)
                .catch(() => null),
            }
          : null,
      },
      spotify: {
        available: await this.spotify.isAvailable(),
        connected: await this.spotify.isConnected(user.id),
        app: (await this.keys.isOwner(user.id))
          ? {
              clientId: await this.spotify.clientId(),
              redirectUri: this.spotify.redirectUri,
            }
          : null,
      },
      soundcloud: await this.soundcloud.settings(user.id),
    };
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.lastfm.stats(user.id);
  }

  @Get('tops')
  async tops(
    @CurrentUser() user: AuthUser,
    @Query(
      'period',
      new ZodValidationPipe(z.enum(MUSIC_TOP_PERIODS).default('7day')),
    )
    period: MusicTopPeriod,
  ) {
    const tops = await this.lastfm.tops(user.id, period);
    return tops && this.genres.withGenres(user.id, tops);
  }

  /** Spotify first (more precise, with progress); if it is not connected — Last.fm. */
  @Get('now-playing')
  async nowPlaying(@CurrentUser() user: AuthUser): Promise<NowPlaying | null> {
    return (
      (await this.spotify.nowPlaying(user.id)) ??
      (await this.lastfm.nowPlaying(user.id))
    );
  }

  /** "Share" of a song: the links straight to it on YouTube Music and Spotify. */
  @Get('song-links')
  findSongLinks(
    @Query(new ZodValidationPipe(songLinksQuerySchema)) song: SongLinksQuery,
  ): Promise<SongLinks> {
    return this.songLinks.find({
      track: song.track,
      artist: song.artist ?? null,
      url: song.url,
    });
  }

  // --- Last.fm ---

  /** Connects and starts importing the whole history in the background. */
  @Put('lastfm')
  @HttpCode(204)
  async connectLastfm(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(lastfmSettingsInputSchema))
    input: LastfmSettingsInput,
  ) {
    await this.actions.run(user.id, MUSIC_ACTIONS.connectLastfm, input);
  }

  /** Imports the rest of the history now instead of in portions every 15 minutes. */
  @Post('lastfm/history')
  @HttpCode(202)
  importLastfmHistory(@CurrentUser() user: AuthUser) {
    return this.actions.run(user.id, MUSIC_ACTIONS.importHistory);
  }

  @Delete('lastfm')
  @HttpCode(204)
  disconnectLastfm(@CurrentUser() user: AuthUser) {
    return this.lastfm.disconnect(user.id);
  }

  @Post('lastfm/sync')
  @HttpCode(204)
  syncLastfm(@CurrentUser() user: AuthUser) {
    return this.actions.run(user.id, MUSIC_ACTIONS.syncLastfm);
  }

  // --- Spotify ---

  /** The owner sets the keys of the server's Spotify app (once for every user). */
  @Put('spotify/app')
  @HttpCode(204)
  async setSpotifyApp(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(spotifyAppInputSchema)) input: SpotifyAppInput,
  ): Promise<void> {
    await this.keys.assertOwner(user.id);
    await this.spotify.setApp(input.clientId, input.clientSecret);
  }

  @Delete('spotify/app')
  @HttpCode(204)
  async removeSpotifyApp(@CurrentUser() user: AuthUser): Promise<void> {
    await this.keys.assertOwner(user.id);
    await this.spotify.removeApp();
  }

  @Post('spotify/connect')
  async connectSpotify(@CurrentUser() user: AuthUser): Promise<{url: string}> {
    return {url: await this.spotify.connectUrl(user.id)};
  }

  /** Spotify returns the browser here after sign-in; the user is identified by `state`. */
  @Public()
  @Get('spotify/callback')
  @Redirect()
  async spotifyCallback(
    @Query('code') code?: string,
    @Query('state') state?: string,
  ) {
    return {url: await this.spotify.handleCallback(code, state)};
  }

  @Delete('spotify')
  @HttpCode(204)
  disconnectSpotify(@CurrentUser() user: AuthUser) {
    return this.spotify.disconnect(user.id);
  }
}
