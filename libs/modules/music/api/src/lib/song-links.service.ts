import { Injectable, Logger } from '@nestjs/common';
import { songLinks, SongLinks } from '@pd/contracts';
import { findOnYoutubeMusic } from './clients/youtube-music.client';
import { SpotifyService } from './spotify.service';

/** Songs remembered with their links (one song is shared again and again). */
const CACHE_SIZE = 2000;

/**
 * The links of a song straight to it on YouTube Music and Spotify (for "Share"): found by its
 * artist and title — Spotify through its API (the server's Spotify app), YouTube Music through
 * the search of its site. Not found, or a service not answering: a link to its search instead.
 */
@Injectable()
export class SongLinksService {
  private readonly logger = new Logger(SongLinksService.name);
  private readonly cache = new Map<string, SongLinks>();

  constructor(private readonly spotify: SpotifyService) {}

  async find(song: {
    track: string;
    artist: string | null;
    url?: string | null;
  }): Promise<SongLinks> {
    const key = `${song.artist ?? ''}\n${song.track}`.toLowerCase();
    const known = this.cache.get(key);
    if (known) {
      return known;
    }
    const search = songLinks(song);
    const query = [song.artist, song.track].filter(Boolean).join(' ');
    const [youtube, spotify] = await Promise.all([
      findOnYoutubeMusic(query).catch((error) => this.failed('YouTube Music', error)),
      search.spotifyExact
        ? Promise.resolve(search.spotify)
        : this.spotify
            .findTrack(song.track, song.artist)
            .catch((error) => this.failed('Spotify', error)),
    ]);
    const links: SongLinks = {
      youtubeMusic: youtube ?? search.youtubeMusic,
      spotify: spotify ?? search.spotify,
      youtubeMusicExact: Boolean(youtube),
      spotifyExact: Boolean(spotify),
    };
    // A song found nowhere is not remembered: the service may answer the next time.
    if (links.youtubeMusicExact || links.spotifyExact) {
      if (this.cache.size >= CACHE_SIZE) {
        this.cache.delete(this.cache.keys().next().value as string);
      }
      this.cache.set(key, links);
    }
    return links;
  }

  private failed(service: string, error: unknown): null {
    this.logger.warn(`${service} did not find a song: ${error}`);
    return null;
  }
}
