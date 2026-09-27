import { Controller, Sse } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { RealtimeService } from './realtime.service';

/**
 * `GET /api/events` — Server-Sent Events for the open dashboard.
 * The web client reads it with `fetch` (EventSource cannot send the auth header).
 */
@Controller('events')
export class RealtimeController {
  constructor(private readonly realtime: RealtimeService) {}

  @Sse()
  events(@CurrentUser() user: AuthUser) {
    return this.realtime.stream(user.id);
  }
}
