import { LocalDate, Task } from '@pd/contracts';

/** What the task list shows. `today` includes everything overdue. */
export const TASK_VIEWS = ['today', 'upcoming', 'all', 'done'] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

export interface TaskFilter {
  view: TaskView;
  /** `null` — every list; `'inbox'` — tasks without one. */
  listId: string | 'inbox' | null;
  tag: string | null;
}

export function filterTasks(tasks: Task[], filter: TaskFilter, today: LocalDate): Task[] {
  return tasks.filter(
    (task) =>
      inView(task, filter.view, today) &&
      (filter.listId === null ||
        (filter.listId === 'inbox' ? task.listId === null : task.listId === filter.listId)) &&
      (filter.tag === null || task.tags.includes(filter.tag)),
  );
}

function inView(task: Task, view: TaskView, today: LocalDate): boolean {
  if (view === 'done') {
    return task.completedAt !== null;
  }
  if (task.completedAt !== null) {
    return false;
  }
  switch (view) {
    case 'today':
      return task.dueDate !== null && task.dueDate <= today;
    case 'upcoming':
      return task.dueDate !== null && task.dueDate > today;
    case 'all':
      return true;
  }
}

/** Open tasks due before today. */
export function isOverdue(task: Task, today: LocalDate): boolean {
  return task.completedAt === null && task.dueDate !== null && task.dueDate < today;
}

/** Every tag in use, alphabetical — for the filter. */
export function allTags(tasks: Task[]): string[] {
  return [...new Set(tasks.flatMap((task) => task.tags))].sort();
}
