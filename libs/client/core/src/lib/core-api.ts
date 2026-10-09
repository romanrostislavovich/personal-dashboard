import {
  Achievement,
  AuthClient as AuthClientKind,
  AuthConfig,
  AutomationRule,
  AutomationRuleInput,
  LifeGoal,
  LifeGoalInput,
  LifeStory,
  CurrentUser,
  LoginRequest,
  LoginResponse,
  LoginResult,
  NotificationSettings,
  PasswordChange,
  ProfileUpdate,
  Project,
  ProjectInput,
  RecoveryCodes,
  RegisterRequest,
  SessionInfo,
  SyncConflict,
  SyncParkedChange,
  SyncParkedKey,
  SyncStatus,
  SystemStatus,
  TelegramLinkResponse,
  TrashItem,
  DataImportReport,
  SecuritySettings,
  SecurityStatus,
  TwoFactorDisable,
  TwoFactorLogin,
  TwoFactorSetup,
  TwoFactorStatus,
  SearchHit,
} from '@pd/contracts';
import { ApiClient, apiRequest } from './api-client';

/**
 * Paths of the core API, in one place for every client. A client that reads through its own
 * machinery (Angular's `httpResource`) still takes the path from here.
 */
export const API_PATHS = {
  authConfig: '/api/auth/config',
  demo: '/api/auth/demo',
  login: '/api/auth/login',
  loginWithCode: '/api/auth/login/2fa',
  refresh: '/api/auth/refresh',
  logout: '/api/auth/logout',
  sessions: '/api/auth/sessions',
  session: (id: string) => `/api/auth/sessions/${encodeURIComponent(id)}`,
  revokeOtherSessions: '/api/auth/sessions/revoke-others',
  twoFactor: '/api/auth/2fa',
  register: '/api/auth/register',
  me: '/api/auth/me',
  password: '/api/auth/password',
  events: '/api/events',
  projects: '/api/projects',
  project: (id: string) => `/api/projects/${encodeURIComponent(id)}`,
  achievements: '/api/achievements',
  notificationSettings: '/api/notifications/settings',
  telegram: '/api/notifications/telegram',
  telegramLink: '/api/notifications/telegram/link',
  testNotification: '/api/notifications/test',
  syncStatus: '/api/sync/status',
  syncRun: '/api/sync/run',
  syncResync: '/api/sync/resync',
  syncBackupCopy: '/api/sync/backup/copy',
  syncConflicts: '/api/sync/conflicts',
  syncConflict: (id: string) => `/api/sync/conflicts/${encodeURIComponent(id)}`,
  syncParked: '/api/sync/parked',
  syncParkedDiscard: '/api/sync/parked/discard',
  search: '/api/search',
  systemStatus: '/api/system/status',
  systemLog: '/api/system/log',
  trash: '/api/trash',
  trashItem: (id: string) => `/api/trash/${encodeURIComponent(id)}`,
  security: '/api/security',
  dataExport: '/api/data/export',
  dataImport: '/api/data/import',
} as const;

/** Read requests of the core (see ApiRequest). */
export const CORE_READS = {
  security: () => apiRequest(API_PATHS.security),
  projects: () => apiRequest(API_PATHS.projects),
  /** A project across the sections: its hours, money, tasks, sites and latest changes. */
  projectOverview: (id: string, from: string, to: string) =>
    apiRequest(`${API_PATHS.project(id)}/overview`, { from, to }),
  /** Search across all modules (the command palette). */
  search: (q: string) => apiRequest(API_PATHS.search, { q }),
  achievements: () => apiRequest(API_PATHS.achievements),
  notificationSettings: () => apiRequest(API_PATHS.notificationSettings),
  syncStatus: () => apiRequest(API_PATHS.syncStatus),
  syncConflicts: () => apiRequest(API_PATHS.syncConflicts),
  syncParked: () => apiRequest(API_PATHS.syncParked),
  /** Background jobs and the log of errors; only the owner may read it. */
  systemStatus: () => apiRequest(API_PATHS.systemStatus),
  /** A day across every module (the life timeline). */
  lifeDay: (day: string) => apiRequest('/api/life/day', { day }),
  /** The numbers of every module for a period (a month, a year). */
  lifeSummary: (from: string, to: string) => apiRequest('/api/life/summary', { from, to }),
  /** A project month by month: its hours and its money. */
  projectMonths: (id: string, months: number) =>
    apiRequest(`${API_PATHS.project(id)}/months`, { months }),
  /** What goes with the days of a good mood and of a bad one, across the sections. */
  moodInsights: (from: string, to: string) => apiRequest('/api/life/mood-insights', { from, to }),
  lifeGoals: (year: number) => apiRequest('/api/life/goals', { year }),
  /** What a goal of a year can be counted from. */
  lifeMetrics: () => apiRequest('/api/life/metrics'),
  /** The AI's kept story of `YYYY-MM` or `YYYY`: `{ story: null }` — not written yet. */
  lifeStory: (period: string) => apiRequest('/api/life/story', { period }),
  /** Every connection to an outside service with its state. */
  integrations: () => apiRequest('/api/integrations'),
  automations: () => apiRequest('/api/automations'),
  /** The triggers and actions the modules registered. */
  automationsCatalog: () => apiRequest('/api/automations/catalog'),
};

/** Signing in and the profile. Signing in does not start the session — see `DashboardClient`. */
export function authApi(api: ApiClient) {
  return {
    /** Public server settings: whether sign-up is open. */
    config: () => api.get<AuthConfig>(API_PATHS.authConfig),
    login: (credentials: LoginRequest) => api.post<LoginResult>(API_PATHS.login, credentials),
    loginWithCode: (input: TwoFactorLogin) =>
      api.post<LoginResponse>(API_PATHS.loginWithCode, input),
    register: (input: RegisterRequest) => api.post<LoginResponse>(API_PATHS.register, input),
    /** A demo instance: a session of the shared demo user, without a password. */
    demo: (client: AuthClientKind) => api.post<LoginResponse>(API_PATHS.demo, { client }),
    me: () => api.get<CurrentUser>(API_PATHS.me),
    updateProfile: (changes: ProfileUpdate) => api.patch<CurrentUser>(API_PATHS.me, changes),
    /** Also signs every other device out. */
    changePassword: (input: PasswordChange) => api.put<void>(API_PATHS.password, input),

    /** Devices and browsers signed in. */
    sessions: () => api.get<SessionInfo[]>(API_PATHS.sessions),
    revokeSession: (id: string) => api.delete(API_PATHS.session(id)),
    revokeOtherSessions: () => api.post<void>(API_PATHS.revokeOtherSessions, {}),

    /** Two-factor sign-in: set up (a QR code), enable with the first code, disable. */
    twoFactorStatus: () => api.get<TwoFactorStatus>(API_PATHS.twoFactor),
    setupTwoFactor: () => api.post<TwoFactorSetup>(`${API_PATHS.twoFactor}/setup`, {}),
    enableTwoFactor: (code: string) =>
      api.post<RecoveryCodes>(`${API_PATHS.twoFactor}/enable`, { code }),
    disableTwoFactor: (input: TwoFactorDisable) =>
      api.post<void>(`${API_PATHS.twoFactor}/disable`, input),
  };
}

/** Rules "if X, then Y" across the modules. */
export function automationsApi(api: ApiClient) {
  return {
    save: (input: AutomationRuleInput, id?: string) =>
      id
        ? api.put<AutomationRule>(`/api/automations/${id}`, input)
        : api.post<AutomationRule>('/api/automations', input),
    remove: (id: string) => api.delete(`/api/automations/${id}`),
    /** A sentence → a rule filled in by the AI, to check and save (not saved). */
    draft: (text: string) => api.post<AutomationRuleInput>('/api/automations/draft', { text }),
  };
}

/** The Life section: goals of a year, the AI's stories, questions about one's own life. */
export function lifeApi(api: ApiClient) {
  return {
    saveGoal: (input: LifeGoalInput, id?: string) =>
      id
        ? api.put<LifeGoal>(`/api/life/goals/${id}`, input)
        : api.post<LifeGoal>('/api/life/goals', input),
    /** The progress of a goal counted by hand. */
    setProgress: (id: string, value: number) =>
      api.put<LifeGoal>(`/api/life/goals/${id}/progress`, { value }),
    removeGoal: (id: string) => api.delete(`/api/life/goals/${id}`),
    /** Writes (or writes again) the AI's story of `YYYY-MM` or `YYYY`. */
    writeStory: (period: string) =>
      api.post<{ story: LifeStory | null }>('/api/life/story', { period }),
  };
}

/** Search across the data of every module — what the command palette shows under "Found". */
export function searchApi(api: ApiClient) {
  return {
    search: (query: string) => api.read<SearchHit[]>(CORE_READS.search(query)),
  };
}

/** Projects: every module refers to them (finance wallets, monitored sites). */
export function projectsApi(api: ApiClient) {
  return {
    list: () => api.read<Project[]>(CORE_READS.projects()),
    create: (input: ProjectInput) => api.post<Project>(API_PATHS.projects, input),
    update: (id: string, input: ProjectInput) => api.put<Project>(API_PATHS.project(id), input),
    remove: (id: string) => api.delete(API_PATHS.project(id)),
  };
}

/** Achievements: computed by the core from the metrics every module registers. */
export function achievementsApi(api: ApiClient) {
  return {
    list: () => api.read<Achievement[]>(CORE_READS.achievements()),
    /** Counts all achievements again; what is not earned today is taken back. */
    recount: () => api.post<void>(`${API_PATHS.achievements}/recount`, {}),
  };
}

/** How the instance is doing: background jobs and the log of errors (the owner only). */
export function systemApi(api: ApiClient) {
  return {
    status: () => api.read<SystemStatus>(CORE_READS.systemStatus()),
    clearLog: () => api.delete(API_PATHS.systemLog),
  };
}

/** Where notifications go: Telegram linking and a test message. */
export function notificationsApi(api: ApiClient) {
  return {
    settings: () => api.read<NotificationSettings>(CORE_READS.notificationSettings()),
    /** A one-time `t.me/…?start=` link that links the chat to this account. */
    linkTelegram: () => api.post<TelegramLinkResponse>(API_PATHS.telegramLink, {}),
    unlinkTelegram: () => api.delete(API_PATHS.telegram),
    sendTest: () => api.post<void>(API_PATHS.testNotification, {}),
  };
}

/** Deleted data, kept for 30 days: bring it back or delete it for good. */
export function trashApi(api: ApiClient) {
  return {
    list: () => api.get<TrashItem[]>(API_PATHS.trash),
    restore: (id: string) => api.post<void>(`${API_PATHS.trashItem(id)}/restore`, {}),
    remove: (id: string) => api.delete(API_PATHS.trashItem(id)),
  };
}

/** The security agent (the owner of the instance only): findings, checks, settings. */
export function securityApi(api: ApiClient) {
  return {
    status: () => api.read<SecurityStatus>(CORE_READS.security()),
    /** The rules look at everything again. */
    scan: () => api.post<SecurityStatus>(`${API_PATHS.security}/scan`, {}),
    /** The AI looks around and writes a report: a minute or two. */
    investigate: () => api.post<SecurityStatus>(`${API_PATHS.security}/investigate`, {}),
    saveSettings: (settings: SecuritySettings) =>
      api.put<void>(`${API_PATHS.security}/settings`, settings),
    /** The AI writes a step-by-step guide for the finding: up to a minute. */
    writeGuide: (id: string) =>
      api.post<SecurityStatus>(`${API_PATHS.security}/findings/${id}/guide`, {}),
    /** `ignored` — "I know, leave it"; `open` — report it again. */
    setFindingStatus: (id: string, status: 'open' | 'ignored') =>
      api.put<void>(`${API_PATHS.security}/findings/${id}`, { status }),
  };
}

/** One's data as a file: everything exported as one ZIP, and an archive brought back. */
export function dataApi(api: ApiClient) {
  return {
    /** The archive of everything the user keeps here. */
    export: () => api.blob(API_PATHS.dataExport),
    /** Uploads an archive and tells what it would add; nothing is changed yet. */
    previewImport: (archive: Blob) => {
      const form = new FormData();
      form.append('file', archive);
      return api.post<DataImportReport>(API_PATHS.dataImport, form);
    },
    /** Adds what the uploaded archive has and the dashboard does not. */
    applyImport: (id: string) => api.post<DataImportReport>(`${API_PATHS.dataImport}/${id}`, {}),
    discardImport: (id: string) => api.delete(`${API_PATHS.dataImport}/${id}`),
  };
}

/** Sync of a local instance with the server (see docs/sync.md). */
export function syncApi(api: ApiClient) {
  return {
    status: () => api.read<SyncStatus>(CORE_READS.syncStatus()),
    runNow: () => api.post<SyncStatus>(API_PATHS.syncRun, {}),
    /** Walks both change logs from the start: mends data that differs from the server's. */
    resyncEverything: () => api.post<SyncStatus>(API_PATHS.syncResync, {}),
    /** Copies the server's newest backup to this computer now. */
    copyBackup: () => api.post<SyncStatus>(API_PATHS.syncBackupCopy, {}),

    /** Versions of rows that lost a conflict, next to the current rows. */
    conflicts: () => api.read<SyncConflict[]>(CORE_READS.syncConflicts()),
    /** Keep the version that lost instead of the current row. */
    keepConflict: (id: string) => api.post<void>(`${API_PATHS.syncConflict(id)}/keep`, {}),
    /** Keep the current row. */
    dismissConflict: (id: string) => api.delete(API_PATHS.syncConflict(id)),
    dismissAllConflicts: () => api.delete(API_PATHS.syncConflicts),

    /** Incoming changes that could not be applied yet. */
    parked: () => api.read<SyncParkedChange[]>(CORE_READS.syncParked()),
    discardParked: (key: SyncParkedKey) => api.post<void>(API_PATHS.syncParkedDiscard, key),
  };
}

export type AuthClient = ReturnType<typeof authApi>;
export type ProjectsClient = ReturnType<typeof projectsApi>;
