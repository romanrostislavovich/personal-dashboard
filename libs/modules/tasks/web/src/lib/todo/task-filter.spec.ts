import {Task} from '@pd/contracts';
import {allTags, filterTasks, isOverdue} from './task-filter';

const TODAY = '2026-10-31';

const task = (values: Partial<Task>): Task => ({
  id: crypto.randomUUID(),
  title: 'A task',
  notes: '',
  dueDate: null,
  priority: 0,
  horizon: 'normal',
  listId: null,
  projectId: null,
  tags: [],
  checklist: [],
  repeat: null,
  completedAt: null,
  createdAt: '2026-10-01T00:00:00Z',
  reminderAt: null,
  focusSeconds: 0,
  windowSeconds: 0,
  updatedAt: null,
  ...values,
});

describe('the task list', () => {
  const tasks = [
    task({title: 'overdue', dueDate: '2026-10-30', tags: ['work']}),
    task({title: 'today', dueDate: TODAY, listId: 'home', horizon: 'short'}),
    task({title: 'later', dueDate: '2026-11-02', tags: ['home', 'work']}),
    task({title: 'someday'}),
    task({title: 'done', dueDate: TODAY, completedAt: '2026-10-31T08:00:00Z'}),
  ];
  const titles = (filter: Parameters<typeof filterTasks>[1]) =>
    filterTasks(tasks, filter, TODAY).map(t => t.title);

  it('shows today with what is overdue, and the rest by its view', () => {
    const base = {listId: null, tag: null};
    expect(titles({...base, view: 'today'})).toEqual(['overdue', 'today']);
    expect(titles({...base, view: 'upcoming'})).toEqual(['later']);
    expect(titles({...base, view: 'all'})).toHaveLength(4);
    expect(titles({...base, view: 'done'})).toEqual(['done']);
  });

  it('narrows by list (the inbox too), tag and horizon', () => {
    expect(titles({view: 'all', listId: 'home', tag: null})).toEqual(['today']);
    expect(titles({view: 'all', listId: 'inbox', tag: null})).toHaveLength(3);
    expect(titles({view: 'all', listId: null, tag: 'work'})).toEqual([
      'overdue',
      'later',
    ]);
    expect(
      titles({view: 'all', listId: null, tag: null, horizon: 'short'}),
    ).toEqual(['today']);
  });

  it('tells what is overdue and lists the tags', () => {
    expect(isOverdue(tasks[0], TODAY)).toBe(true);
    expect(isOverdue(tasks[1], TODAY)).toBe(false);
    expect(allTags(tasks)).toEqual(['home', 'work']);
  });
});
