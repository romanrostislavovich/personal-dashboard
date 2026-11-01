import {
  Reminder,
  ReminderInput,
  ReminderUpdate,
  Task,
  TaskDeleteSteps,
  TaskGroup,
  TaskInput,
  TaskList,
  TaskUpdate,
} from '@pd/contracts';
import {ApiClient, apiRequest} from '../api-client';

const BASE = '/api/tasks';

/** Read requests of the tasks section (see ApiRequest). */
export const TASKS_READS = {
  /** Open tasks and the ones done in the last month. */
  tasks: () => apiRequest(BASE),
  lists: () => apiRequest(`${BASE}/lists`),
  /** Waiting and sent reminders, and the ones answered lately. */
  reminders: () => apiRequest(`${BASE}/reminders`),
};

export function tasksApi(api: ApiClient) {
  return {
    tasks: () => api.read<Task[]>(TASKS_READS.tasks()),
    create: (input: TaskInput) => api.post<Task>(BASE, input),
    /** Only the fields sent change. */
    update: (id: string, changes: TaskUpdate) =>
      api.patch<void>(`${BASE}/${id}`, changes),
    /** A repeating task comes back as a new one on its next day. */
    complete: (id: string) => api.post<void>(`${BASE}/${id}/complete`, {}),
    reopen: (id: string) => api.post<void>(`${BASE}/${id}/reopen`, {}),
    /** With its steps, unless `keep` — then they stay as tasks of their own. */
    remove: (id: string, steps: TaskDeleteSteps = 'delete') =>
      api.delete(
        steps === 'keep' ? `${BASE}/${id}?steps=keep` : `${BASE}/${id}`,
      ),
    /** Makes the tasks steps of an existing task or of a new one; returns that task. */
    group: (group: TaskGroup) => api.post<Task>(`${BASE}/group`, group),

    lists: () => api.read<TaskList[]>(TASKS_READS.lists()),
    createList: (name: string) => api.post<void>(`${BASE}/lists`, {name}),
    renameList: (id: string, name: string) =>
      api.put<void>(`${BASE}/lists/${id}`, {name}),
    /** Its tasks go back to the inbox. */
    removeList: (id: string) => api.delete(`${BASE}/lists/${id}`),

    reminders: () => api.read<Reminder[]>(TASKS_READS.reminders()),
    /** `remindAt` is a moment (ISO): the client turns the user's local time into it. */
    createReminder: (input: ReminderInput) =>
      api.post<Reminder>(`${BASE}/reminders`, input),
    updateReminder: (id: string, changes: ReminderUpdate) =>
      api.patch<void>(`${BASE}/reminders/${id}`, changes),
    reminderDone: (id: string) =>
      api.post<void>(`${BASE}/reminders/${id}/done`, {}),
    /** Remind again at another moment. */
    snoozeReminder: (id: string, remindAt: string) =>
      api.post<void>(`${BASE}/reminders/${id}/snooze`, {remindAt}),
    removeReminder: (id: string) => api.delete(`${BASE}/reminders/${id}`),
  };
}
