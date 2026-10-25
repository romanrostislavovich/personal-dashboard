import {
  ActivityApp,
  ActivityBrowserConfig,
  ActivitySiteTime,
  ActivitySiteVisitInput,
  ActivityAppUpdate,
  ActivityDayQuery,
  ActivityDevice,
  ActivityDeviceCreated,
  ActivityDeviceInput,
  ActivityPeriod,
  ActivityProjectRule,
  ActivityProjectRuleInput,
  ActivityRuleSuggestion,
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
  NamedPlace,
  PhoneNotificationsQuery,
  PlaceInput,
  PlacesQuery,
} from '@pd/contracts';
import { ApiClient, apiRequest } from '../api-client';

const BASE = '/api/activity';

/** Read requests of the Activity section (see ApiRequest). */
export const ACTIVITY_READS = {
  /** Time per day, program, category, project and device for a period. */
  stats: (period: ActivityPeriod) => apiRequest(`${BASE}/stats`, period),
  /** Computers other services know (WakaTime), with whether their time is counted. */
  otherComputers: (period: ActivityPeriod) => apiRequest(`${BASE}/other-computers`, period),
  /** What was in front on one day, newest first. */
  timeline: (query: ActivityDayQuery) => apiRequest(`${BASE}/timeline`, query),
  devices: () => apiRequest(`${BASE}/devices`),
  /** The phone's notifications: which apps, how many, in which hours (the Android app). */
  phoneNotifications: (query: PhoneNotificationsQuery) =>
    apiRequest(`${BASE}/notifications`, query),
  /** A day in places and trips, with the places of the last 30 days (the phone's location). */
  places: (query: PlacesQuery) => apiRequest(`${BASE}/places`, query),
  settings: () => apiRequest(`${BASE}/settings`),
  /** Every program seen, with its category and whether it is recorded. */
  apps: () => apiRequest(`${BASE}/apps`),
  rules: () => apiRequest(`${BASE}/rules`),
  /** Rules offered for the projects: windows and sites around work on them. */
  ruleSuggestions: () => apiRequest(`${BASE}/rule-suggestions`),
  /** Focus with music against focus in silence (the music comes from the Music section). */
  focusMusic: (period: ActivityPeriod) => apiRequest(`${BASE}/focus/music`, period),
  /** Focus sessions of a period with their totals. */
  focus: (period: ActivityPeriod) => apiRequest(`${BASE}/focus`, period),
  limits: () => apiRequest(`${BASE}/limits`),
  /** The computers with their latest state (disks, load) and the last day of it. */
  computers: () => apiRequest(`${BASE}/computers`),
  /** The time of each site in a period (the browser extension records it). */
  sites: (period: ActivityPeriod) => apiRequest(`${BASE}/sites`, period),
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
    /** Hands the device's records to `into`, then removes it. */
    mergeDevice: (id: string, into: string) =>
      api.post<void>(`${BASE}/devices/${id}/merge`, { into }),
    /** Names a place: the stays within its radius take the name. */
    addPlace: (input: PlaceInput) => api.post<NamedPlace>(`${BASE}/places`, input),
    renamePlace: (id: string, name: string) => api.patch<void>(`${BASE}/places/${id}`, { name }),
    /** Forgets the name; the fixes stay. */
    removePlace: (id: string) => api.delete(`${BASE}/places/${id}`),

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
    ruleSuggestions: () => api.read<ActivityRuleSuggestion[]>(ACTIVITY_READS.ruleSuggestions()),
    /** Looks at the latest days for rules to offer now. */
    refreshRuleSuggestions: () => api.post<void>(`${BASE}/rule-suggestions/refresh`, {}),
    /** The offer becomes a rule. */
    acceptRuleSuggestion: (id: string) =>
      api.post<void>(`${BASE}/rule-suggestions/${id}/accept`, {}),
    /** Not offered again. */
    rejectRuleSuggestion: (id: string) => api.delete(`${BASE}/rule-suggestions/${id}`),

    focus: (period: ActivityPeriod) => api.read<ActivityFocusStats>(ACTIVITY_READS.focus(period)),
    removeFocus: (id: string) => api.delete(`${BASE}/focus/${id}`),
    limits: () => api.read<ActivityLimit[]>(ACTIVITY_READS.limits()),
    /** The whole set of daily limits at once. */
    saveLimits: (limits: ActivityLimitInput[]) => api.put<void>(`${BASE}/limits`, { limits }),
    computers: () => api.read<ActivityComputer[]>(ACTIVITY_READS.computers()),
    /** What to delete from a full disk, from what the desktop app's scan found. */
    diskAdvice: (report: DiskReport) => api.post<DiskAdvice>(`${BASE}/disk-advice`, report),
    sites: (period: ActivityPeriod) => api.read<ActivitySiteTime[]>(ACTIVITY_READS.sites(period)),
    /**
     * The browser extension: the visits it recorded (none is fine); the answer is what it
     * follows — the focus session now, the sites to close, the limits.
     */
    recordSites: (visits: ActivitySiteVisitInput[]) =>
      api.post<ActivityBrowserConfig & { saved: number }>(`${BASE}/sites`, { visits }),
  };
}
