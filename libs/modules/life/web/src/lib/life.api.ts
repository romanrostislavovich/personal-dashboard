import {httpResource} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {CORE_READS, lifeApi} from '@pd/client-core';
import {LifeStory, LinksSeen} from '@pd/contracts';
import {DASHBOARD_CLIENT, fromCore} from '@pd/web-core';

/** The Life requests of the client core (`@pd/client-core`) for Angular. */
@Injectable({providedIn: 'root'})
export class LifeApi {
  private readonly life = lifeApi(inject(DASHBOARD_CLIENT).api);

  story(period: () => string) {
    return httpResource<{story: LifeStory | null}>(() =>
      CORE_READS.lifeStory(period()),
    );
  }

  writeStory(period: string) {
    return fromCore(() => this.life.writeStory(period));
  }

  /** Something of Links opened (a change point, a pair's chart): for the achievements. */
  seen(item: LinksSeen) {
    return fromCore(() => this.life.seen(item));
  }
}
