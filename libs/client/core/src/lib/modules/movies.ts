import {
  MovieAdd,
  MovieAssign,
  MovieSearchResult,
  MovieSettings,
  MoviesStatus,
  MovieTitle,
  MovieTitleUpdate,
  MovieView,
  MovieViewsQuery,
  WatchConfig,
  WatchViewInput,
} from '@pd/contracts';
import {ApiClient, apiRequest} from '../api-client';

const BASE = '/api/movies';

export const MOVIES_READS = {
  /** Whether TMDB is connected, the settings, how many views wait to be found. */
  status: () => apiRequest(BASE),
  /** `history` — what was watched; `want` — the list to watch. */
  titles: (list: 'history' | 'want') => apiRequest(`${BASE}/titles`, {list}),
  views: (query: MovieViewsQuery = {}) =>
    apiRequest(`${BASE}/views`, {...query}),
  /** Films and shows of TMDB by a name. */
  search: (q: string) => apiRequest(`${BASE}/search`, {q}),
};

export function moviesApi(api: ApiClient) {
  return {
    status: () => api.read<MoviesStatus>(MOVIES_READS.status()),
    titles: (list: 'history' | 'want') =>
      api.read<MovieTitle[]>(MOVIES_READS.titles(list)),
    views: (query: MovieViewsQuery = {}) =>
      api.read<MovieView[]>(MOVIES_READS.views(query)),
    search: (q: string) =>
      api.read<MovieSearchResult[]>(MOVIES_READS.search(q)),
    /** The browser extension's views; the answer says whether to go on and where not to. */
    recordWatching: (views: WatchViewInput[]) =>
      api.post<WatchConfig>(`${BASE}/watching`, {views}),
    add: (input: MovieAdd) => api.post<MovieTitle>(`${BASE}/titles`, input),
    update: (id: string, patch: MovieTitleUpdate) =>
      api.patch<MovieTitle>(`${BASE}/titles/${id}`, patch),
    remove: (id: string) => api.delete(`${BASE}/titles/${id}`),
    assign: (viewId: string, input: MovieAssign) =>
      api.post<MovieTitle>(`${BASE}/views/${viewId}/assign`, input),
    dismiss: (viewId: string) =>
      api.post<void>(`${BASE}/views/${viewId}/dismiss`, {}),
    setSettings: (settings: MovieSettings) =>
      api.put<MovieSettings>(`${BASE}/settings`, settings),
    ignoreSite: (site: string) =>
      api.post<MovieSettings>(`${BASE}/settings/ignore-site`, {site}),
    setTmdbKey: (key: string) => api.put<void>(`${BASE}/tmdb-key`, {key}),
    removeTmdbKey: () => api.delete(`${BASE}/tmdb-key`),
  };
}
