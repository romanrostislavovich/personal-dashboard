import { httpResource } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Achievement } from '@pd/contracts';

/** Ачивки считает ядро (`/api/achievements`); каждый модуль добавляет свои метрики. */
@Injectable({ providedIn: 'root' })
export class AchievementsApi {
  list() {
    return httpResource<Achievement[]>(() => '/api/achievements', { defaultValue: [] });
  }
}
