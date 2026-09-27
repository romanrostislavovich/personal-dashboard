import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Adds the JWT to API requests and logs out if the token has expired. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const token = auth.token();
  const authorized = token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authorized).pipe(
    catchError((error: unknown) => {
      const isLoginRequest = request.url.endsWith('/auth/login');
      if (error instanceof HttpErrorResponse && error.status === 401 && !isLoginRequest) {
        auth.logout();
      }
      return throwError(() => error);
    }),
  );
};
