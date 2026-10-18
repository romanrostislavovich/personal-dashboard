import { effect, inject, Injectable, signal } from '@angular/core';

/**
 * Whether a home widget has anything to show yet: one given to every widget of the home page.
 * A widget that is only a "connect Last.fm" or "add a site" says so here, and the home page
 * gathers such widgets into one line instead of a grid of empty cards.
 */
@Injectable()
export class WidgetSetup {
  readonly needed = signal(false);
}

/**
 * Called in a widget's constructor: `needsSetup(() => !this.accounts.value().length)`. The
 * condition is followed as it changes; outside the home page (no WidgetSetup) it does nothing.
 */
export function needsSetup(condition: () => boolean): void {
  const setup = inject(WidgetSetup, { optional: true });
  if (setup) {
    effect(() => setup.needed.set(condition()));
  }
}
