import { httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { achievementsApi, CORE_READS } from '@pd/client-core';
import { Achievement } from '@pd/contracts';
import { DASHBOARD_CLIENT, fromCore } from '@pd/web-core';

/** Achievements are computed by the core (`/api/achievements`); each module adds its own metrics. */
@Injectable({ providedIn: 'root' })
export class AchievementsApi {
  private readonly achievements = achievementsApi(inject(DASHBOARD_CLIENT).api);

  list() {
    return httpResource<Achievement[]>(() => CORE_READS.achievements(), { defaultValue: [] });
  }

  /** Counts a section again; what is not earned today is taken back. */
  recount(module: string) {
    return fromCore(() => this.achievements.recount(module));
  }
}
