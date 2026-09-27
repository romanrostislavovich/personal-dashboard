import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuthUser } from '../auth/current-user.decorator';
import { UserActivityService } from './user-activity.service';

/** Reports successful changes (POST/PUT/PATCH/DELETE) of a signed-in user. */
@Injectable()
export class UserActivityInterceptor implements NestInterceptor {
  constructor(private readonly activity: UserActivityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ method: string; user?: AuthUser }>();
    const user = request.user;
    if (request.method === 'GET' || !user) {
      return next.handle();
    }
    return next.handle().pipe(tap({ complete: () => this.activity.touched(user.id) }));
  }
}
