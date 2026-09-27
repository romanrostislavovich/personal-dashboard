import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

/**
 * "The user just changed something": fired after every non-GET request and after
 * Telegram bot commands. Achievements listen to it to unlock right away instead of hourly.
 */
@Injectable()
export class UserActivityService {
  private readonly activity = new Subject<string>();
  readonly activity$ = this.activity.asObservable();

  touched(userId: string): void {
    this.activity.next(userId);
  }
}
