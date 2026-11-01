import {Task} from '@pd/contracts';

/** A line of the task list: a task, or a step under its task. */
export interface TaskRow {
  task: Task;
  /** Shown under its task, indented. */
  step: boolean;
  /** A step shown on its own (its task is not in the view): the title of its task. */
  parentTitle: string | null;
}

/**
 * The shown tasks as lines: a step goes under its task when that task is shown too, and stands
 * on its own with the task's title otherwise (today's step of a task without a date). The steps
 * of a collapsed task are left out.
 */
export function taskRows(
  shown: Task[],
  all: Task[],
  collapsed: ReadonlySet<string>,
): TaskRow[] {
  const shownIds = new Set(shown.map(task => task.id));
  const titles = new Map(all.map(task => [task.id, task.title]));
  const steps = new Map<string, Task[]>();
  for (const task of shown) {
    if (task.parentId && shownIds.has(task.parentId)) {
      steps.set(task.parentId, [...(steps.get(task.parentId) ?? []), task]);
    }
  }
  return shown.flatMap(task => {
    if (task.parentId && shownIds.has(task.parentId)) {
      return [];
    }
    const row: TaskRow = {
      task,
      step: false,
      parentTitle: task.parentId ? (titles.get(task.parentId) ?? null) : null,
    };
    const children = collapsed.has(task.id) ? [] : (steps.get(task.id) ?? []);
    return [
      row,
      ...children.map(step => ({task: step, step: true, parentTitle: null})),
    ];
  });
}

/** The tasks a task can become a step of: open, not steps themselves, not the task itself. */
export function parentChoices(all: Task[], task: Task | null): Task[] {
  return all.filter(
    candidate =>
      candidate.completedAt === null &&
      candidate.parentId === null &&
      candidate.id !== task?.id,
  );
}
