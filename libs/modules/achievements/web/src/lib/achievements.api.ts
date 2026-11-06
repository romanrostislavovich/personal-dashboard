import {HttpResourceRef, httpResource} from '@angular/common/http';
import {inject, Injectable, linkedSignal} from '@angular/core';
import {achievementsApi, CORE_READS} from '@pd/client-core';
import {Achievement} from '@pd/contracts';
import {DASHBOARD_CLIENT, fromCore} from '@pd/web-core';

/** Achievements are computed by the core (`/api/achievements`); each module adds its own metrics. */
@Injectable({providedIn: 'root'})
export class AchievementsApi {
  private readonly achievements = achievementsApi(inject(DASHBOARD_CLIENT).api);

  list() {
    return httpResource<Achievement[]>(() => CORE_READS.achievements(), {
      defaultValue: [],
    });
  }

  /** Counts all achievements again; what is not earned today is taken back. */
  recount() {
    return fromCore(() => this.achievements.recount());
  }
}

/**
 * The achievements last loaded: kept while a reload runs or fails, empty before the first load.
 * A failed request must not read as "0 of 0" — the caller tells it apart by `error()`.
 */
export function lastLoaded(achievements: HttpResourceRef<Achievement[]>) {
  return linkedSignal<Achievement[] | undefined, Achievement[]>({
    source: () => (achievements.hasValue() ? achievements.value() : undefined),
    computation: (loaded, previous) => loaded ?? previous?.value ?? [],
  });
}
