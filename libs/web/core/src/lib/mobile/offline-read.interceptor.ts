import {
  HttpErrorResponse,
  HttpEvent,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import {isCacheable} from '@pd/client-core';
import {Observable} from 'rxjs';
import {mobileReadCache} from './idb-read-cache';
import {apiBaseUrl, isMobileApp} from './mobile-app';

/** A weak signal (a train) answers late: after this the kept answer is shown, if there is one. */
const SLOW_MS = 8_000;

/**
 * Reads through HttpClient (`httpResource`) in the Android app, like the browser's service
 * worker does for the web app: every answer is kept (ReadCache), and a read the server does not
 * answer — no connection, or slower than SLOW_MS — gets the kept one. A slow read with nothing
 * kept just waits for the server. Elsewhere it does nothing.
 */
export const offlineReadInterceptor: HttpInterceptorFn = (request, next) => {
  if (
    !isMobileApp() ||
    request.method !== 'GET' ||
    request.responseType !== 'json'
  ) {
    return next(request);
  }
  const path = request.url.startsWith(apiBaseUrl())
    ? request.url.slice(apiBaseUrl().length)
    : request.url;
  if (!isCacheable(path)) {
    return next(request);
  }
  return withKeptAnswer(request, next(request));
};

function withKeptAnswer(
  request: HttpRequest<unknown>,
  network: Observable<HttpEvent<unknown>>,
): Observable<HttpEvent<unknown>> {
  const cache = mobileReadCache();
  const key = request.urlWithParams;
  const kept = (body: unknown) =>
    new HttpResponse({status: 200, body, url: key});

  return new Observable<HttpEvent<unknown>>(subscriber => {
    let answered = false;
    const answer = (event: HttpEvent<unknown>) => {
      if (!answered) {
        answered = true;
        subscriber.next(event);
        subscriber.complete();
      }
    };

    const slow = setTimeout(() => {
      void cache.get(key).then(hit => hit && answer(kept(hit.body)));
    }, SLOW_MS);

    // Not cut off when the kept answer is shown: a late reply still updates what is kept.
    const subscription = network.subscribe({
      next: event => {
        if (event instanceof HttpResponse) {
          clearTimeout(slow);
          if (event.ok) {
            void cache.put(key, event.body);
          }
          answer(event);
        } else if (!answered) {
          subscriber.next(event);
        }
      },
      error: (error: unknown) => {
        clearTimeout(slow);
        if (answered) {
          return;
        }
        // An error status is the server's answer; status 0 is no answer at all.
        const unreachable =
          error instanceof HttpErrorResponse && error.status === 0;
        if (!unreachable) {
          answered = true;
          subscriber.error(error);
          return;
        }
        void cache.get(key).then(hit => {
          if (hit) {
            answer(kept(hit.body));
          } else if (!answered) {
            answered = true;
            subscriber.error(error);
          }
        });
      },
    });

    return () => {
      clearTimeout(slow);
      // Leaving the page before any answer cancels the read; after one, it may finish.
      if (!answered) {
        subscription.unsubscribe();
      }
    };
  });
}
