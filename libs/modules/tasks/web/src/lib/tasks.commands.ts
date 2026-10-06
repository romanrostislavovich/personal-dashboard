import { Injector } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { todayLocal } from './local-time';
import { TasksApi } from './tasks.api';

/** "Add a task: …" of the command palette: a task for today with the typed text as its title. */
export async function addTask(text: string, injector: Injector): Promise<void> {
  await firstValueFrom(injector.get(TasksApi).create({ title: text, dueDate: todayLocal() }));
}

/** "Remind in an hour: …": a reminder with the text, an hour from now. */
export async function remindInHour(text: string, injector: Injector): Promise<void> {
  const remindAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await firstValueFrom(
    injector.get(TasksApi).createReminder({ text: text.slice(0, 500), remindAt }),
  );
}
