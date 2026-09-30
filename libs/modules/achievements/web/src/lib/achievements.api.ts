import { httpResource } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { CORE_READS } from '@pd/client-core';
import { Achievement } from '@pd/contracts';

/** Achievements are computed by the core (`/api/achievements`); each module adds its own metrics. */
@Injectable({ providedIn: 'root' })
export class AchievementsApi {
  list() {
    return httpResource<Achievement[]>(() => CORE_READS.achievements(), { defaultValue: [] });
  }
}
