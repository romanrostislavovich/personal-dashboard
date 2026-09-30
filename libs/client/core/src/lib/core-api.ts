import {
  Achievement,
  AuthConfig,
  CurrentUser,
  LoginRequest,
  LoginResponse,
  NotificationSettings,
  PasswordChange,
  ProfileUpdate,
  Project,
  ProjectInput,
  RegisterRequest,
  SyncStatus,
  TelegramLinkResponse,
} from '@pd/contracts';
import { ApiClient, apiRequest } from './api-client';

/**
 * Paths of the core API, in one place for every client. A client that reads through its own
 * machinery (Angular's `httpResource`) still takes the path from here.
 */
export const API_PATHS = {
  authConfig: '/api/auth/config',
  login: '/api/auth/login',
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
} as const;

/** Read requests of the core (see ApiRequest). */
export const CORE_READS = {
  projects: () => apiRequest(API_PATHS.projects),
  achievements: () => apiRequest(API_PATHS.achievements),
  notificationSettings: () => apiRequest(API_PATHS.notificationSettings),
  syncStatus: () => apiRequest(API_PATHS.syncStatus),
};

/** Signing in and the profile. Signing in does not start the session — see `DashboardClient`. */
export function authApi(api: ApiClient) {
  return {
    /** Public server settings: whether sign-up is open. */
    config: () => api.get<AuthConfig>(API_PATHS.authConfig),
    login: (credentials: LoginRequest) => api.post<LoginResponse>(API_PATHS.login, credentials),
    register: (input: RegisterRequest) => api.post<LoginResponse>(API_PATHS.register, input),
    me: () => api.get<CurrentUser>(API_PATHS.me),
    updateProfile: (changes: ProfileUpdate) => api.patch<CurrentUser>(API_PATHS.me, changes),
    changePassword: (input: PasswordChange) => api.put<void>(API_PATHS.password, input),
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

/** Sync of a local instance with the server (see docs/sync.md). */
export function syncApi(api: ApiClient) {
  return {
    status: () => api.read<SyncStatus>(CORE_READS.syncStatus()),
    runNow: () => api.post<SyncStatus>(API_PATHS.syncRun, {}),
  };
}

export type AuthClient = ReturnType<typeof authApi>;
export type ProjectsClient = ReturnType<typeof projectsApi>;
