import { Injector } from '@angular/core';
import { Router } from '@angular/router';
import { searchText } from './search-text';

/** "To watch: …" — Movies → To watch opens with the text searched in TMDB, to pick the film. */
export async function searchToWatch(text: string, injector: Injector): Promise<void> {
  await injector.get(Router).navigate(['/movies/want'], { queryParams: { q: searchText(text) } });
}
