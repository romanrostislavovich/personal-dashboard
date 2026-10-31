import {
  BadRequestException,
  BadGatewayException,
  Controller,
  Get,
  Header,
  Inject,
  Injectable,
  Param,
  ParseIntPipe,
  StreamableFile,
} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {AppConfig} from '../config/env';

/** The tiles kept in memory: a few days of looking at the same city, ~20 KB each. */
const CACHE_TILES = 2000;
const MAX_ZOOM = 19;
const TIMEOUT_MS = 10_000;

/**
 * OpenStreetMap's tiles through the dashboard (the owner's choice, 2026-10-30): the browser and
 * the phone ask only their own server, so OpenStreetMap sees the server, never the user's address
 * or which streets the user looks at from where. Kept in memory and in the browser for a week;
 * OSM's tile policy asks for an identifying User-Agent and for the tiles to be cached.
 */
@Injectable()
export class MapTilesService {
  private readonly cache = new Map<string, Buffer>();
  private readonly userAgent: string;

  constructor(@Inject(ConfigService) config: AppConfig) {
    this.userAgent = `PersonalDashboard/1.0 (+${config.get('PUBLIC_URL', {infer: true})})`;
  }

  async tile(z: number, x: number, y: number): Promise<Buffer> {
    const side = 2 ** z;
    if (z < 0 || z > MAX_ZOOM || x < 0 || y < 0 || x >= side || y >= side) {
      throw new BadRequestException('No such tile');
    }
    const key = `${z}/${x}/${y}`;
    const known = this.cache.get(key);
    if (known) {
      // Used again: to the end of the line, the oldest go first.
      this.cache.delete(key);
      this.cache.set(key, known);
      return known;
    }
    const response = await fetch(`https://tile.openstreetmap.org/${key}.png`, {
      headers: {'User-Agent': this.userAgent},
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => null);
    if (!response?.ok) {
      throw new BadGatewayException('OpenStreetMap did not give the tile');
    }
    const tile = Buffer.from(await response.arrayBuffer());
    this.cache.set(key, tile);
    if (this.cache.size > CACHE_TILES) {
      this.cache.delete(this.cache.keys().next().value as string);
    }
    return tile;
  }
}

/** `GET /api/map/tiles/:z/:x/:y` — for the signed-in user only (the server is not a free proxy). */
@Controller('map')
export class MapTilesController {
  constructor(private readonly tiles: MapTilesService) {}

  @Get('tiles/:z/:x/:y')
  @Header('Cache-Control', 'private, max-age=604800')
  async tile(
    @Param('z', ParseIntPipe) z: number,
    @Param('x', ParseIntPipe) x: number,
    @Param('y', ParseIntPipe) y: number,
  ): Promise<StreamableFile> {
    const tile = await this.tiles.tile(z, x, y);
    return new StreamableFile(tile, {type: 'image/png', length: tile.length});
  }
}
