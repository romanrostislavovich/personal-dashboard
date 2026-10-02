import { Injector } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { todayLocal } from './local-time';
import { TasksApi } from './tasks.api';

/** "Add a task: …" of the command palette: a task for today with the typed text as its title. */
export async function addTask(text: string, injector: Injector): Promise<void> {
  await firstValueFrom(injector.get(TasksApi).create({ title: text, dueDate: todayLocal() }));
}
