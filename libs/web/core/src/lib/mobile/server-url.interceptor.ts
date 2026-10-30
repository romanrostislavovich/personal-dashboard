import {HttpInterceptorFn} from '@angular/common/http';
import {apiBaseUrl} from './mobile-app';

/**
 * Reads through `HttpClient` (`httpResource`) ask for `/api/…`: in the Android app that is the
 * app's own address, so the server's is put in front. Elsewhere the base is empty and nothing
 * changes.
 */
export const serverUrlInterceptor: HttpInterceptorFn = (request, next) => {
  const base = apiBaseUrl();
  return base && request.url.startsWith('/api/')
    ? next(request.clone({url: `${base}${request.url}`}))
    : next(request);
};
