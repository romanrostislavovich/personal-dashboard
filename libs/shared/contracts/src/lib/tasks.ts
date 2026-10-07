import { z } from 'zod';
import { LocalDate } from './local-date';
import { Repeat, repeatSchema } from './recurrence';

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

// --- Lists ---

export const taskListInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
});
export type TaskListInput = z.infer<typeof taskListInputSchema>;

/** A list of the user's own: "Home", "Work". A task without one is in the inbox. */
export interface TaskList {
  id: string;
  name: string;
  /** Tasks in it that are not done yet. */
  open: number;
}

// --- Tasks ---

/** 0 — none, then low, medium, high. */
export const TASK_PRIORITIES = [0, 1, 2, 3] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const checklistItemSchema = z.object({
  text: z.string().trim().min(1).max(200),
  done: z.boolean().default(false),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

/** A tag without `#` and spaces: `urgent`, `дом`. */
const tagSchema = z
  .string()
  .trim()
  .transform((tag) => tag.replace(/^#/, '').toLowerCase())
  .pipe(z.string().min(1).max(30).regex(/^\S+$/, 'A tag has no spaces'));

const taskFields = {
  title: z.string().trim().min(1).max(300),
  notes: z.string().trim().max(5000),
  /** The day the task is due, in the user's own calendar. */
  dueDate: localDateSchema.nullable(),
  priority: z
    .number()
    .int()
    .min(0)
    .max(3)
    .transform((value) => value as TaskPriority),
  listId: z.uuid().nullable(),
  projectId: z.uuid().nullable(),
  tags: z.array(tagSchema).max(20),
  checklist: z.array(checklistItemSchema).max(50),
  /** A repeating task needs a due date: once done, it comes back on the next one. */
  repeat: repeatSchema.nullable(),
};

/** Only the title is required. */
export const taskInputSchema = z
  .object(taskFields)
  .partial()
  .required({ title: true })
  .refine((task) => !task.repeat || task.dueDate, { message: 'A repeating task needs a due date' });
export type TaskInput = z.input<typeof taskInputSchema>;

/** `PATCH /api/tasks/:id`: only the fields sent change. */
export const taskUpdateSchema = z.object(taskFields).partial();
export type TaskUpdate = z.input<typeof taskUpdateSchema>;

export interface Task {
  id: string;
  title: string;
  notes: string;
  dueDate: LocalDate | null;
  priority: TaskPriority;
  listId: string | null;
  projectId: string | null;
  tags: string[];
  checklist: ChecklistItem[];
  repeat: Repeat | null;
  /** `null` — not done yet. */
  completedAt: string | null;
  createdAt: string;
  /** When its nearest reminder goes off; `null` — none is set. */
  reminderAt: string | null;
  /**
   * Time of the focus sessions whose note names the task (from the Activity section); `0` —
   * none, or the task was not asked about with the others.
   */
  focusSeconds: number;
}

// --- Reminders ---

/** `scheduled` — waits for its time; `fired` — was sent and waits for "done" or a snooze. */
export const REMINDER_STATUSES = ['scheduled', 'fired', 'done'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

const instantSchema = z.iso.datetime({ offset: true });

export const reminderInputSchema = z.object({
  text: z.string().trim().min(1).max(500),
  /** The moment to remind at (ISO): the client turns the user's local time into it. */
  remindAt: instantSchema,
  repeat: repeatSchema.nullable().optional(),
  /** The task to be reminded about. */
  taskId: z.uuid().nullable().optional(),
});
export type ReminderInput = z.input<typeof reminderInputSchema>;

/** `PATCH /api/tasks/reminders/:id`: only the fields sent change. */
export const reminderUpdateSchema = z.object({
  text: z.string().trim().min(1).max(500).optional(),
  remindAt: instantSchema.optional(),
  repeat: repeatSchema.nullable().optional(),
});
export type ReminderUpdate = z.input<typeof reminderUpdateSchema>;

/** `POST /api/tasks/reminders/:id/snooze`: remind again at this moment. */
export const reminderSnoozeSchema = z.object({ remindAt: instantSchema });
export type ReminderSnooze = z.infer<typeof reminderSnoozeSchema>;

export interface Reminder {
  id: string;
  text: string;
  remindAt: string;
  repeat: Repeat | null;
  status: ReminderStatus;
  taskId: string | null;
  /** When it was last sent. */
  firedAt: string | null;
  createdAt: string;
}
