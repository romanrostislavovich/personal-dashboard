import {httpResource} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {LIFELOG_READS, lifelogApi} from '@pd/client-core';
import {LifelogNarrative, LifelogQuery, LifelogSettings} from '@pd/contracts';
import {DASHBOARD_CLIENT, fromCore} from '@pd/web-core';

@Injectable({providedIn: 'root'})
export class LifelogApi {
  private readonly lifelog = lifelogApi(inject(DASHBOARD_CLIENT).api);

  day(day: () => string) {
    return httpResource<LifelogNarrative | null>(() =>
      LIFELOG_READS.day(day()),
    );
  }

  list(query: () => LifelogQuery | undefined) {
    return httpResource<LifelogNarrative[]>(
      () => {
        const range = query();
        return range ? LIFELOG_READS.list(range) : undefined;
      },
      {defaultValue: []},
    );
  }

  settings() {
    return httpResource<LifelogSettings>(() => LIFELOG_READS.settings);
  }

  configure(enabled: boolean) {
    return fromCore(() => this.lifelog.configure({enabled}));
  }

  generate(day: string) {
    return fromCore(() => this.lifelog.generate(day));
  }

  note(day: string, note: string) {
    return fromCore(() => this.lifelog.note(day, {note}));
  }

  remove(day: string) {
    return fromCore(() => this.lifelog.remove(day));
  }
}
