import {
  ActivityApp,
  ActivityAppUpdate,
  ActivityDayQuery,
  ActivityDevice,
  ActivityDeviceCreated,
  ActivityDeviceInput,
  ActivityPeriod,
  ActivityProjectRule,
  ActivityProjectRuleInput,
  ActivitySettings,
  ActivitySettingsUpdate,
  ActivityStats,
  ActivityComputer,
  DiskAdvice,
  DiskReport,
  ActivityFocusStats,
  ActivityLimit,
  ActivityLimitInput,
  ActivityTimelineEntry,
} from '@pd/contracts';
import { ApiClient, apiRequest } from '../api-client';

const BASE = '/api/activity';

/** Read requests of the Activity section (see ApiRequest). */
export const ACTIVITY_READS = {
  /** Time per day, program, category, project and device for a period. */
  stats: (period: ActivityPeriod) => apiRequest(`${BASE}/stats`, period),
  /** What was in front on one day, newest first. */
  timeline: (query: ActivityDayQuery) => apiRequest(`${BASE}/timeline`, query),
  devices: () => apiRequest(`${BASE}/devices`),
  settings: () => apiRequest(`${BASE}/settings`),
  /** Every program seen, with its category and whether it is recorded. */
  apps: () => apiRequest(`${BASE}/apps`),
  rules: () => apiRequest(`${BASE}/rules`),
  /** Focus sessions of a period with their totals. */
  focus: (period: ActivityPeriod) => apiRequest(`${BASE}/focus`, period),
  limits: () => apiRequest(`${BASE}/limits`),
  /** The computers with their latest state (disks, load) and the last day of it. */
  computers: () => apiRequest(`${BASE}/computers`),
};

export function activityApi(api: ApiClient) {
  return {
    stats: (period: ActivityPeriod) => api.read<ActivityStats>(ACTIVITY_READS.stats(period)),
    timeline: (query: ActivityDayQuery) =>
      api.read<ActivityTimelineEntry[]>(ACTIVITY_READS.timeline(query)),
    devices: () => api.read<ActivityDevice[]>(ACTIVITY_READS.devices()),
    /** Registers a tracker; the token in the answer is given once. */
    registerDevice: (input: ActivityDeviceInput) =>
      api.post<ActivityDeviceCreated>(`${BASE}/devices`, input),
    renameDevice: (id: string, name: string) => api.patch<void>(`${BASE}/devices/${id}`, { name }),
    /** Removes the device with everything it recorded. */
    removeDevice: (id: string) => api.delete(`${BASE}/devices/${id}`),

    settings: () => api.read<ActivitySettings>(ACTIVITY_READS.settings()),
    /** Only the fields sent change. */
    saveSettings: (settings: ActivitySettingsUpdate) => api.put<void>(`${BASE}/settings`, settings),
    apps: () => api.read<ActivityApp[]>(ACTIVITY_READS.apps()),
    /** The category of a program, or "do not record it" (what was recorded is deleted). */
    updateApp: (app: string, update: ActivityAppUpdate) =>
      api.patch<void>(`${BASE}/apps/${encodeURIComponent(app)}`, update),
    rules: () => api.read<ActivityProjectRule[]>(ACTIVITY_READS.rules()),
    addRule: (input: ActivityProjectRuleInput) => api.post<void>(`${BASE}/rules`, input),
    removeRule: (id: string) => api.delete(`${BASE}/rules/${id}`),

    focus: (period: ActivityPeriod) => api.read<ActivityFocusStats>(ACTIVITY_READS.focus(period)),
    removeFocus: (id: string) => api.delete(`${BASE}/focus/${id}`),
    limits: () => api.read<ActivityLimit[]>(ACTIVITY_READS.limits()),
    /** The whole set of daily limits at once. */
    saveLimits: (limits: ActivityLimitInput[]) => api.put<void>(`${BASE}/limits`, { limits }),
    computers: () => api.read<ActivityComputer[]>(ACTIVITY_READS.computers()),
    /** What to delete from a full disk, from what the desktop app's scan found. */
    diskAdvice: (report: DiskReport) => api.post<DiskAdvice>(`${BASE}/disk-advice`, report),
  };
}

export type ActivityClient = ReturnType<typeof activityApi>;
