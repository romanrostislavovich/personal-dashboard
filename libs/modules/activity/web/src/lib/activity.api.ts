import { httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { ACTIVITY_READS, activityApi, WORKSTATE_READS, workstatesApi } from '@pd/client-core';
import {
  ActivityApp,
  ActivityAppUpdate,
  ActivityDayQuery,
  ActivityDevice,
  ActivityDeviceInput,
  ActivityPeriod,
  ActivityProjectRule,
  ActivityProjectRuleInput,
  ActivityRuleSuggestion,
  ActivitySettings,
  ActivitySettingsUpdate,
  ActivitySiteTime,
  ActivityOtherComputer,
  ActivityStats,
  ActivityComputer,
  DiskReport,
  ActivityFocusMusic,
  ActivityFocusStats,
  ActivityLimit,
  ActivityLimitInput,
  ActivityTimelineEntry,
  WorkstateInput,
  WorkstatePage,
  WorkstateQuery,
} from '@pd/contracts';
import { DASHBOARD_CLIENT, fromCore } from '@pd/web-core';

/** The activity requests of the client core (`@pd/client-core`) for Angular. */
@Injectable({ providedIn: 'root' })
export class ActivityApi {
  private readonly activity = activityApi(inject(DASHBOARD_CLIENT).api);
  private readonly workstates = workstatesApi(inject(DASHBOARD_CLIENT).api);

  workstateTimeline(query: () => WorkstateQuery) {
    return httpResource<WorkstatePage>(() => WORKSTATE_READS.list(query()));
  }

  captureWorkstate(input: WorkstateInput) {
    return fromCore(() => this.workstates.capture(input));
  }

  restoreWorkstate(id: string) {
    return fromCore(() => this.workstates.restore(id));
  }

  removeWorkstate(id: string) {
    return fromCore(() => this.workstates.remove(id));
  }

  /** Reloads when the period changes. */
  stats(period: () => ActivityPeriod) {
    return httpResource<ActivityStats>(() => ACTIVITY_READS.stats(period()));
  }

  /** Computers other services know (WakaTime), with whether their time is counted. */
  otherComputers(period: () => ActivityPeriod) {
    return httpResource<ActivityOtherComputer[]>(() => ACTIVITY_READS.otherComputers(period()), {
      defaultValue: [],
    });
  }

  timeline(query: () => ActivityDayQuery) {
    return httpResource<ActivityTimelineEntry[]>(() => ACTIVITY_READS.timeline(query()), {
      defaultValue: [],
    });
  }

  devices() {
    return httpResource<ActivityDevice[]>(() => ACTIVITY_READS.devices(), { defaultValue: [] });
  }

  /** The token in the answer is given once: it goes straight to the tracker. */
  registerDevice(input: ActivityDeviceInput) {
    return fromCore(() => this.activity.registerDevice(input));
  }

  renameDevice(id: string, name: string) {
    return fromCore(() => this.activity.renameDevice(id, name));
  }

  removeDevice(id: string) {
    return fromCore(() => this.activity.removeDevice(id));
  }

  mergeDevice(id: string, into: string) {
    return fromCore(() => this.activity.mergeDevice(id, into));
  }

  settings() {
    return httpResource<ActivitySettings>(() => ACTIVITY_READS.settings());
  }

  saveSettings(settings: ActivitySettingsUpdate) {
    return fromCore(() => this.activity.saveSettings(settings));
  }

  apps() {
    return httpResource<ActivityApp[]>(() => ACTIVITY_READS.apps(), { defaultValue: [] });
  }

  updateApp(app: string, update: ActivityAppUpdate) {
    return fromCore(() => this.activity.updateApp(app, update));
  }

  rules() {
    return httpResource<ActivityProjectRule[]>(() => ACTIVITY_READS.rules(), {
      defaultValue: [],
    });
  }

  addRule(input: ActivityProjectRuleInput) {
    return fromCore(() => this.activity.addRule(input));
  }

  removeRule(id: string) {
    return fromCore(() => this.activity.removeRule(id));
  }

  ruleSuggestions() {
    return httpResource<ActivityRuleSuggestion[]>(() => ACTIVITY_READS.ruleSuggestions(), {
      defaultValue: [],
    });
  }

  refreshRuleSuggestions() {
    return fromCore(() => this.activity.refreshRuleSuggestions());
  }

  acceptRuleSuggestion(id: string) {
    return fromCore(() => this.activity.acceptRuleSuggestion(id));
  }

  rejectRuleSuggestion(id: string) {
    return fromCore(() => this.activity.rejectRuleSuggestion(id));
  }

  /** Focus with music against focus in silence. */
  focusMusic(period: () => ActivityPeriod) {
    return httpResource<ActivityFocusMusic>(() => ACTIVITY_READS.focusMusic(period()));
  }

  focus(period: () => ActivityPeriod) {
    return httpResource<ActivityFocusStats>(() => ACTIVITY_READS.focus(period()));
  }

  removeFocus(id: string) {
    return fromCore(() => this.activity.removeFocus(id));
  }

  limits() {
    return httpResource<ActivityLimit[]>(() => ACTIVITY_READS.limits(), { defaultValue: [] });
  }

  saveLimits(limits: ActivityLimitInput[]) {
    return fromCore(() => this.activity.saveLimits(limits));
  }

  /**
   * Replaces the limits of some kinds and keeps the others as the server has them now: two
   * cards of the settings (programs, sites) each change their own.
   */
  replaceLimits(kinds: ActivityLimitInput['kind'][], limits: ActivityLimitInput[]) {
    return fromCore(async () => {
      const kept = (await this.activity.limits())
        .filter((limit) => !kinds.includes(limit.kind))
        .map(({ kind, app, minutes }) => ({ kind, app, minutes }));
      await this.activity.saveLimits([...kept, ...limits]);
    });
  }

  diskAdvice(report: DiskReport) {
    return fromCore(() => this.activity.diskAdvice(report));
  }

  /** The time of each site, as the browser extension records it. */
  sites(period: () => ActivityPeriod) {
    return httpResource<ActivitySiteTime[]>(() => ACTIVITY_READS.sites(period()), {
      defaultValue: [],
    });
  }

  computers() {
    return httpResource<ActivityComputer[]>(() => ACTIVITY_READS.computers(), {
      defaultValue: [],
    });
  }
}
