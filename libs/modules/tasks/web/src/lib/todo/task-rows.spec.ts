import {Task} from '@pd/contracts';
import {parentChoices, taskRows} from './task-rows';

const task = (id: string, values: Partial<Task> = {}) =>
  ({
    id,
    title: id,
    parentId: null,
    completedAt: null,
    ...values,
  }) as Task;

describe('taskRows', () => {
  const move = task('move');
  const pack = task('pack', {parentId: 'move'});
  const contract = task('contract', {parentId: 'move'});
  const milk = task('milk');
  const all = [move, pack, milk, contract];

  it('puts the steps under their task, in the order they are shown', () => {
    expect(
      taskRows(all, all, new Set()).map(row => [row.task.id, row.step]),
    ).toEqual([
      ['move', false],
      ['pack', true],
      ['contract', true],
      ['milk', false],
    ]);
  });

  it('leaves out the steps of a collapsed task', () => {
    expect(
      taskRows(all, all, new Set(['move'])).map(row => row.task.id),
    ).toEqual(['move', 'milk']);
  });

  it("shows a step alone, with its task's title, when the task is not shown", () => {
    expect(taskRows([pack], all, new Set())).toEqual([
      {task: pack, step: false, parentTitle: 'move'},
    ]);
  });
});

describe('parentChoices', () => {
  it('offers open tasks that are not steps and not the task itself', () => {
    const all = [
      task('move'),
      task('pack', {parentId: 'move'}),
      task('old', {completedAt: '2026-10-01T00:00:00Z'}),
      task('milk'),
    ];
    expect(parentChoices(all, all[3]).map(choice => choice.id)).toEqual([
      'move',
    ]);
  });
});
