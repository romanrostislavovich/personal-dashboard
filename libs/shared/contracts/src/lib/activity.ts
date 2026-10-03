import { z } from 'zod';
import {
  activityFocusSessionSchema,
  ActivityFocusSettings,
  activityFocusSettingsSchema,
  activityHealthSchema,
} from './activity-wellbeing';
import { LocalDate } from './local-date';

/** What a program is for: the groups the Activity section adds time up by. */
export const ACTIVITY_CATEGORIES = [
  'development',
  'browsing',
  'communication',
  'office',
  'design',
  'games',
  'media',
  'system',
  'other',
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

/** Where a tracker runs: the desktop shell today, a phone later. */
export const ACTIVITY_PLATFORMS = ['windows', 'macos', 'linux', 'android', 'ios'] as const;
export type ActivityPlatform = (typeof ACTIVITY_PLATFORMS)[number];

/** The category of a well-known program, by the name of its process (lower case). */
const KNOWN_APPS: Record<ActivityCategory, string[]> = {
  development: [
    'code',
    'cursor',
    'devenv',
    'idea64',
    'webstorm64',
    'pycharm64',
    'rider64',
    'goland64',
    'datagrip64',
    'windowsterminal',
    'powershell',
    'pwsh',
    'cmd',
    'wsl',
    'docker desktop',
    'postman',
    'insomnia',
    'gitkraken',
    'sublime_text',
    'notepad++',
  ],
  browsing: [
    'chrome',
    'msedge',
    'firefox',
    'opera',
    'brave',
    'browser',
    'vivaldi',
    'arc',
    'safari',
  ],
  communication: [
    'telegram',
    'discord',
    'slack',
    'teams',
    'ms-teams',
    'zoom',
    'whatsapp',
    'skype',
    'outlook',
    'olk',
    'thunderbird',
    'viber',
    'signal',
  ],
  office: [
    'winword',
    'excel',
    'powerpnt',
    'onenote',
    'notepad',
    'notion',
    'obsidian',
    'acrobat',
    'acrord32',
    'soffice',
  ],
  design: ['figma', 'photoshop', 'illustrator', 'blender', 'afterfx', 'premiere pro', 'gimp-2.10'],
  games: [
    'wow',
    'wowclassic',
    'dota2',
    'cs2',
    'steam',
    'steamwebhelper',
    'battle.net',
    'epicgameslauncher',
    'leagueclient',
    'valorant',
  ],
  media: ['vlc', 'mpv', 'potplayermini64', 'spotify', 'aimp', 'foobar2000', 'wmplayer', 'mpc-hc64'],
  system: [
    'explorer',
    'taskmgr',
    'systemsettings',
    'searchhost',
    'shellexperiencehost',
    'lockapp',
    'applicationframehost',
    'mmc',
    'regedit',
  ],
  other: [],
};

const CATEGORY_OF = new Map(
  ACTIVITY_CATEGORIES.flatMap((category) => KNOWN_APPS[category].map((app) => [app, category])),
);

/** Categories where a full-screen window without input is still the user at it: a film. */
export const ACTIVITY_WATCH_CATEGORIES: readonly ActivityCategory[] = ['media', 'browsing'];

/** The well-known programs of a category (process names, lower case). */
export function knownActivityApps(category: ActivityCategory): readonly string[] {
  return KNOWN_APPS[category];
}

/** The category of a program until the user gives it another: known programs, `other` for the rest. */
export function defaultActivityCategory(app: string): ActivityCategory {
  return CATEGORY_OF.get(app.toLowerCase()) ?? 'other';
}

// --- Devices ---

/** A tracker is registered by the signed-in user; it then reports with its own token. */
export const activityDeviceInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  platform: z.enum(ACTIVITY_PLATFORMS),
});
export type ActivityDeviceInput = z.infer<typeof activityDeviceInputSchema>;

export const activityDeviceUpdateSchema = z.object({ name: z.string().trim().min(1).max(60) });
export type ActivityDeviceUpdate = z.infer<typeof activityDeviceUpdateSchema>;

export interface ActivityDevice {
  id: string;
  name: string;
  platform: ActivityPlatform;
  /** When it last reported. */
  lastSeenAt: string | null;
  createdAt: string;
}

/** The token is shown once, right after the device is registered; the server keeps its hash. */
export interface ActivityDeviceCreated extends ActivityDevice {
  token: string;
}

// --- What a tracker sends ---

const moment = z.iso.datetime({ offset: true });

/** The longest window title kept; what a tracker sends beyond it is cut, not refused. */
export const ACTIVITY_TITLE_MAX = 500;

/**
 * Text cut to a length instead of being refused: one long window title must not stop a
 * tracker's whole queue (it would send the same batch again and again).
 */
const cut = (max: number) => z.string().transform((text) => text.slice(0, max));

/** A stretch of time one window was in front. */
export const activitySpanSchema = z
  .object({
    /** The name of the process (`chrome`, `Code`): what a program is recognized by. */
    app: z.string().trim().min(1).pipe(cut(120)),
    /** The name people know it by ("Google Chrome"), when the system tells it. */
    appName: z.string().trim().pipe(cut(200)).nullish(),
    title: cut(ACTIVITY_TITLE_MAX),
    startedAt: moment,
    endedAt: moment,
  })
  .refine((span) => span.endedAt > span.startedAt, 'A span ends after it starts');
export type ActivitySpanInput = z.infer<typeof activitySpanSchema>;

export const activityIngestSchema = z.object({
  spans: z.array(activitySpanSchema).max(500),
  /** Focus sessions that ended since the last upload. */
  focus: z.array(activityFocusSessionSchema).max(50).optional(),
  /** The computer's state now (disks, load), every few minutes. */
  health: activityHealthSchema.optional(),
});
export type ActivityIngest = z.infer<typeof activityIngestSchema>;

/** What a tracker needs to know from the server; asked with every upload. */
export interface ActivityDeviceConfig {
  /** No input for this long means the user is away. */
  idleMinutes: number;
  /** Programs never recorded (process names, lower case). */
  excludedApps: string[];
  /**
   * Programs one watches (players, browsers — ACTIVITY_WATCH_CATEGORIES): a full-screen window
   * of one of them counts without input, for a few hours at most. A game is not among them:
   * a game without input is the user gone.
   */
  watchApps: string[];
  /** Remind to take a break after this long at the computer without one; `0` — never. */
  breakMinutes: number;
  /** The timer of the focus sessions. */
  focus: ActivityFocusSettings;
  /** Programs that count as a distraction during a focus session (games, messengers, video). */
  distractingApps: string[];
}

// --- Settings, programs, project rules ---

export const activitySettingsSchema = z
  .object({
    idleMinutes: z.number().int().min(1).max(60),
    /** Remind to take a break after this long without one; `0` — never. */
    breakMinutes: z.number().int().min(0).max(240),
  })
  .extend(activityFocusSettingsSchema.shape);
export type ActivitySettings = z.infer<typeof activitySettingsSchema>;

/** `PUT /api/activity/settings`: only the fields sent change. */
export const activitySettingsUpdateSchema = activitySettingsSchema.partial();
export type ActivitySettingsUpdate = z.infer<typeof activitySettingsUpdateSchema>;

/** Categories whose programs count as a distraction during a focus session. */
export const ACTIVITY_DISTRACTING_CATEGORIES: readonly ActivityCategory[] = [
  'games',
  'communication',
  'media',
];

/** `PATCH /api/activity/apps/:app`: only the fields sent change. */
export const activityAppUpdateSchema = z.object({
  category: z.enum(ACTIVITY_CATEGORIES).optional(),
  /** Never record the program again; what was recorded is deleted. */
  excluded: z.boolean().optional(),
});
export type ActivityAppUpdate = z.infer<typeof activityAppUpdateSchema>;

/** Time whose window title contains `pattern` belongs to the project. */
export const activityProjectRuleInputSchema = z.object({
  projectId: z.uuid(),
  pattern: z.string().trim().min(2).max(100),
});
export type ActivityProjectRuleInput = z.infer<typeof activityProjectRuleInputSchema>;

export interface ActivityProjectRule {
  id: string;
  projectId: string;
  pattern: string;
}

// --- What the section shows ---

const LOCAL_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const activityPeriodSchema = z.object({
  from: LOCAL_DATE,
  to: LOCAL_DATE,
  /** One device; all of them when left out. */
  deviceId: z.uuid().optional(),
});
export type ActivityPeriod = z.infer<typeof activityPeriodSchema>;

export interface ActivityAppUsage {
  app: string;
  name: string;
  category: ActivityCategory;
  seconds: number;
}

export interface ActivityStats {
  totalSeconds: number;
  /** Every day of the period, days without activity included. */
  days: { day: LocalDate; seconds: number }[];
  /** The most used first. */
  apps: ActivityAppUsage[];
  categories: { category: ActivityCategory; seconds: number }[];
  /** Time whose window title matched a project (its name or one of its rules). */
  projects: { projectId: string; name: string; seconds: number }[];
  devices: { id: string; name: string; seconds: number }[];
  /** The window titles that took the most time. */
  titles: { app: string; name: string; title: string; seconds: number }[];
}

/** A program as the settings list it: with its category and whether it is recorded. */
export interface ActivityApp {
  app: string;
  name: string;
  category: ActivityCategory;
  excluded: boolean;
}

export interface ActivityTimelineEntry {
  startedAt: string;
  endedAt: string;
  app: string;
  name: string;
  title: string;
  category: ActivityCategory;
  deviceId: string;
}

export const activityDaySchema = z.object({
  day: LOCAL_DATE,
  deviceId: z.uuid().optional(),
});
export type ActivityDayQuery = z.infer<typeof activityDaySchema>;
