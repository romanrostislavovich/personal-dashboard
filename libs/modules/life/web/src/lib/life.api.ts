import {httpResource} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {CORE_READS, lifeApi} from '@pd/client-core';
import {
  ExperimentDayInput,
  ExperimentInput,
  ExperimentUpdate,
  LifeStory,
  LinksForecasts,
  LinksHourAfter,
  LinksInsights,
  LinksLab,
  LinksOverload,
  LinksQuestions,
  LinksRhythm,
  LinksSeen,
  LinksWindow,
  QuestionInput,
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

  /** The question cards answered, and what a new one may be made of. */
  questions() {
    return httpResource<LinksQuestions>(() => CORE_READS.questions());
  }

  addQuestion(input: QuestionInput) {
    return fromCore(() => this.life.addQuestion(input));
  }

  removeQuestion(id: string) {
    return fromCore(() => this.life.removeQuestion(id));
  }

  draftQuestion(text: string) {
    return fromCore(() => this.life.draftQuestion(text));
  }

  /** The latest week's findings, and which is today's. */
  insights() {
    return httpResource<LinksInsights>(() => CORE_READS.insights());
  }

  /** The overload score of the last days and whether its warning is sent. */
  overload() {
    return httpResource<LinksOverload>(() => CORE_READS.overload());
  }

  setOverloadEnabled(enabled: boolean) {
    return fromCore(() => this.life.setOverloadEnabled(enabled));
  }

  /** The personal lab: the experiments with their days and results. */
  experiments() {
    return httpResource<LinksLab>(() => CORE_READS.experiments());
  }

  startExperiment(input: ExperimentInput) {
    return fromCore(() => this.life.startExperiment(input));
  }

  updateExperiment(id: string, input: ExperimentUpdate) {
    return fromCore(() => this.life.updateExperiment(id, input));
  }

  removeExperiment(id: string) {
    return fromCore(() => this.life.removeExperiment(id));
  }

  markExperimentDay(id: string, input: ExperimentDayInput) {
    return fromCore(() => this.life.markExperimentDay(id, input));
  }

  refreshInsights() {
    return fromCore(() => this.life.refreshInsights());
  }

  /** The numbers forecast beyond the default ones. */
  setForecastTargets(targets: string[]) {
    return fromCore(() => this.life.setForecastTargets({targets}));
  }
}
