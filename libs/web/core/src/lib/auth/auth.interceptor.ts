import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Reads through `HttpClient` (`httpResource`): adds the access token of the client core's session.
 * A 401 means it expired — a new one is fetched with the refresh token and the request is sent
 * again, as the client core does for its own requests; if that fails, the session is over.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const withToken = (token: string | null): HttpRequest<unknown> =>
    token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;

  return next(withToken(auth.token())).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || isAuth(request.url)) {
        return throwError(() => error);
      }
      return from(auth.refreshToken()).pipe(
        switchMap((token) => (token ? next(withToken(token)) : throwError(() => error))),
      );
    }),
  );
};

function isAuth(url: string): boolean {
  return url.includes('/api/auth/');
}
