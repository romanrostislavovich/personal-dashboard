import {httpResource} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {CORE_READS, lifeApi} from '@pd/client-core';
import {
  LifeStory,
  LinksForecasts,
  LinksHourAfter,
  LinksRhythm,
  LinksSeen,
  LinksWindow,
} from '@pd/contracts';
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

  /** Today's forecasts of the numbers (tomorrow's too in the evening) and the kept ones. */
  forecasts() {
    return httpResource<LinksForecasts>(() => CORE_READS.forecasts());
  }

  /** An hourly number by weekday and hour (the day's rhythm). */
  rhythm(days: () => number, key: () => string | undefined) {
    return httpResource<LinksRhythm>(() => CORE_READS.rhythm(days(), key()));
  }

  /** Every event against every hourly number in the hour after it. */
  hourAfter(days: () => number) {
    return httpResource<LinksHourAfter>(() => CORE_READS.hourAfter(days()));
  }

  /** The productive window of every weekday. */
  productiveWindow() {
    return httpResource<LinksWindow>(() => CORE_READS.productiveWindow());
  }

  /** The numbers forecast beyond the default ones. */
  setForecastTargets(targets: string[]) {
    return fromCore(() => this.life.setForecastTargets({targets}));
  }
}
