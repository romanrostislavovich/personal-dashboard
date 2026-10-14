import {
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Req,
} from '@nestjs/common';
import { Public } from '@pd/api-core';
import { SummaryService } from './summary.service';

/** How many opens one address gets in a window: a doctor's few, never a guesser's many. */
const OPENS_PER_WINDOW = 30;
const WINDOW_MS = 10 * 60_000;

/**
 * The page a doctor opens from a link — no account, no app: a summary frozen when the link was
 * made. An unknown, expired or revoked link is the same 404, and an address opening too many
 * is told to wait, so a token cannot be guessed.
 */
@Controller('medical/shared')
export class SharedSummaryController {
  private readonly opens = new Map<string, { count: number; since: number }>();

  constructor(private readonly summaries: SummaryService) {}

  @Public()
  @Get(':token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('X-Content-Type-Options', 'nosniff')
  // The page has no script; nothing may run in it, nothing loads from outside.
  @Header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
  async open(@Param('token') token: string, @Req() request: { ip?: string }): Promise<string> {
    this.throttle(request.ip ?? 'unknown');
    const page = /^[\w-]{20,64}$/.test(token) ? await this.summaries.open(token) : null;
    if (!page) {
      throw new NotFoundException();
    }
    return page;
  }

  private throttle(address: string): void {
    const now = Date.now();
    for (const [key, entry] of this.opens) {
      if (now - entry.since > WINDOW_MS) {
        this.opens.delete(key);
      }
    }
    const entry = this.opens.get(address) ?? { count: 0, since: now };
    entry.count++;
    this.opens.set(address, entry);
    if (entry.count > OPENS_PER_WINDOW) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
