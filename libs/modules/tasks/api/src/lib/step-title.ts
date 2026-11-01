import {Task} from '@pd/contracts';

/** Between a task and its step in a line of text: "Move › Pack the things". */
export const STEP_SEPARATOR = ' › ';

/**
 * Titles for a message (Telegram, the morning digest, an automation): a step is named with its
 * task, which may be missing from the list (done long ago) — then the step alone.
 */
export function stepTitles(list: Task[]): (task: Task) => string {
  const titles = new Map(list.map(task => [task.id, task.title]));
  return task => {
    const parent = task.parentId ? titles.get(task.parentId) : undefined;
    return parent ? `${parent}${STEP_SEPARATOR}${task.title}` : task.title;
  };
}
