import { httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { ACTIVITY_READS, activityApi } from '@pd/client-core';
import {
  ActivityApp,
  ActivityAppUpdate,
  ActivityDayQuery,
  ActivityDevice,
  ActivityDeviceInput,
  ActivityPeriod,
  ActivityProjectRule,
  ActivityProjectRuleInput,
  ActivitySettings,
  ActivitySettingsUpdate,
  ActivityOtherComputer,
  ActivityStats,
  ActivityComputer,
  DiskReport,
  ActivityFocusMusic,
  ActivityFocusStats,
  ActivityLimit,
  ActivityLimitInput,
  ActivityTimelineEntry,
} from '@pd/contracts';
import { DASHBOARD_CLIENT, fromCore } from '@pd/web-core';

/** The activity requests of the client core (`@pd/client-core`) for Angular. */
@Injectable({ providedIn: 'root' })
export class ActivityApi {
  private readonly activity = activityApi(inject(DASHBOARD_CLIENT).api);

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

  diskAdvice(report: DiskReport) {
    return fromCore(() => this.activity.diskAdvice(report));
  }

  computers() {
    return httpResource<ActivityComputer[]>(() => ACTIVITY_READS.computers(), {
      defaultValue: [],
    });
  }
}
