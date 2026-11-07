import {httpResource} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {CORE_READS, TASKS_READS, tasksApi} from '@pd/client-core';
import {
  LinksWindow,
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
import {DASHBOARD_CLIENT, fromCore} from '@pd/web-core';

/** The tasks requests of the client core (`@pd/client-core`) for Angular. */
@Injectable({providedIn: 'root'})
export class TasksApi {
  private readonly api = tasksApi(inject(DASHBOARD_CLIENT).api);

  tasks() {
    return httpResource<Task[]>(() => TASKS_READS.tasks(), {defaultValue: []});
  }

  lists() {
    return httpResource<TaskList[]>(() => TASKS_READS.lists(), {
      defaultValue: [],
    });
  }

  /** The productive window of every weekday (Links, through the core): the hint of the list. */
  productiveWindow() {
    return httpResource<LinksWindow>(() => CORE_READS.productiveWindow());
  }

  reminders() {
    return httpResource<Reminder[]>(() => TASKS_READS.reminders(), {
      defaultValue: [],
    });
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

  /** With its steps, unless `keep` — then they stay as tasks of their own. */
  remove(id: string, steps: TaskDeleteSteps = 'delete') {
    return fromCore(() => this.api.remove(id, steps));
  }

  /** Makes the tasks steps of an existing task or of a new one. */
  group(group: TaskGroup) {
    return fromCore(() => this.api.group(group));
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
