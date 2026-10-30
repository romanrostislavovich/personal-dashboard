import {httpResource} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {MOVIES_READS, moviesApi} from '@pd/client-core';
import {
  MovieAdd,
  MovieAssign,
  MovieSearchResult,
  MovieSettings,
  MoviesStatus,
  MovieTitle,
  MovieTitleUpdate,
  MovieView,
} from '@pd/contracts';
import {DASHBOARD_CLIENT, fromCore} from '@pd/web-core';

/** The movie requests of the client core (`@pd/client-core`) for Angular. */
@Injectable({providedIn: 'root'})
export class MoviesApi {
  private readonly movies = moviesApi(inject(DASHBOARD_CLIENT).api);

  status() {
    return httpResource<MoviesStatus>(() => MOVIES_READS.status());
  }

  titles(list: 'history' | 'want') {
    return httpResource<MovieTitle[]>(() => MOVIES_READS.titles(list), {
      defaultValue: [],
    });
  }

  views(kind: 'unknown' | 'video') {
    return httpResource<MovieView[]>(
      () => MOVIES_READS.views({kind, limit: 200}),
      {
        defaultValue: [],
      },
    );
  }

  search(q: string) {
    return fromCore<MovieSearchResult[]>(() => this.movies.search(q));
  }

  add(input: MovieAdd) {
    return fromCore(() => this.movies.add(input));
  }

  update(id: string, patch: MovieTitleUpdate) {
    return fromCore(() => this.movies.update(id, patch));
  }

  remove(id: string) {
    return fromCore(() => this.movies.remove(id));
  }

  assign(viewId: string, input: MovieAssign) {
    return fromCore(() => this.movies.assign(viewId, input));
  }

  dismiss(viewId: string) {
    return fromCore(() => this.movies.dismiss(viewId));
  }

  setSettings(settings: MovieSettings) {
    return fromCore(() => this.movies.setSettings(settings));
  }

  ignoreSite(site: string) {
    return fromCore(() => this.movies.ignoreSite(site));
  }

  setTmdbKey(key: string) {
    return fromCore(() => this.movies.setTmdbKey(key));
  }

  removeTmdbKey() {
    return fromCore(() => this.movies.removeTmdbKey());
  }
}
