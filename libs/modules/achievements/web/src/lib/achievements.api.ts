import { httpResource } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Achievement } from '@pd/contracts';

/** Achievements are computed by the core (`/api/achievements`); each module adds its own metrics. */
@Injectable({ providedIn: 'root' })
export class AchievementsApi {
  list() {
    return httpResource<Achievement[]>(() => '/api/achievements', { defaultValue: [] });
  }
}
