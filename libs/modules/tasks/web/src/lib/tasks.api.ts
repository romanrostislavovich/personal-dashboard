import { httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { TASKS_READS, tasksApi } from '@pd/client-core';
import {
  Reminder,
  ReminderInput,
  ReminderUpdate,
  Task,
  TaskInput,
  TaskList,
  TaskUpdate,
} from '@pd/contracts';
import { DASHBOARD_CLIENT, fromCore } from '@pd/web-core';

/** The tasks requests of the client core (`@pd/client-core`) for Angular. */
@Injectable({ providedIn: 'root' })
export class TasksApi {
  private readonly api = tasksApi(inject(DASHBOARD_CLIENT).api);

  tasks() {
    return httpResource<Task[]>(() => TASKS_READS.tasks(), { defaultValue: [] });
  }

  lists() {
    return httpResource<TaskList[]>(() => TASKS_READS.lists(), { defaultValue: [] });
  }

  reminders() {
    return httpResource<Reminder[]>(() => TASKS_READS.reminders(), { defaultValue: [] });
  }

  create(input: TaskInput) {
    return fromCore(() => this.api.create(input));
  }

  update(id: string, changes: TaskUpdate) {
    return fromCore(() => this.api.update(id, changes));
  }

  complete(id: string) {
    return fromCore(() => this.api.complete(id));
  }

  reopen(id: string) {
    return fromCore(() => this.api.reopen(id));
  }

  remove(id: string) {
    return fromCore(() => this.api.remove(id));
  }

  createList(name: string) {
    return fromCore(() => this.api.createList(name));
  }

  removeList(id: string) {
    return fromCore(() => this.api.removeList(id));
  }

  createReminder(input: ReminderInput) {
    return fromCore(() => this.api.createReminder(input));
  }

  updateReminder(id: string, changes: ReminderUpdate) {
    return fromCore(() => this.api.updateReminder(id, changes));
  }

  reminderDone(id: string) {
    return fromCore(() => this.api.reminderDone(id));
  }

  snoozeReminder(id: string, remindAt: string) {
    return fromCore(() => this.api.snoozeReminder(id, remindAt));
  }

  removeReminder(id: string) {
    return fromCore(() => this.api.removeReminder(id));
  }
}
