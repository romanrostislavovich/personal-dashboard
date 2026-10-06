import { httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CORE_READS, lifeApi } from '@pd/client-core';
import { LifeGoal, LifeGoalInput, LifeMetric, LifeStory } from '@pd/contracts';
import { DASHBOARD_CLIENT, fromCore } from '@pd/web-core';

/** The Life requests of the client core (`@pd/client-core`) for Angular. */
@Injectable({ providedIn: 'root' })
export class LifeApi {
  private readonly life = lifeApi(inject(DASHBOARD_CLIENT).api);

  goals(year: () => number) {
    return httpResource<LifeGoal[]>(() => CORE_READS.lifeGoals(year()), { defaultValue: [] });
  }

  metrics() {
    return httpResource<LifeMetric[]>(() => CORE_READS.lifeMetrics(), { defaultValue: [] });
  }

  story(period: () => string) {
    return httpResource<{ story: LifeStory | null }>(() => CORE_READS.lifeStory(period()));
  }

  saveGoal(input: LifeGoalInput, id?: string) {
    return fromCore(() => this.life.saveGoal(input, id));
  }

  setProgress(id: string, value: number) {
    return fromCore(() => this.life.setProgress(id, value));
  }

  removeGoal(id: string) {
    return fromCore(() => this.life.removeGoal(id));
  }

  writeStory(period: string) {
    return fromCore(() => this.life.writeStory(period));
  }

  ask(question: string) {
    return fromCore(() => this.life.ask(question));
  }
}
