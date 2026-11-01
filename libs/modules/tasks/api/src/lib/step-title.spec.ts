import {Task} from '@pd/contracts';
import {stepTitles} from './step-title';

const task = (id: string, title: string, parentId: string | null = null) =>
  ({id, title, parentId}) as Task;

describe('stepTitles', () => {
  it('names a step with its task, and the rest by their own title', () => {
    const move = task('1', 'Переезд');
    const pack = task('2', 'Собрать вещи', '1');
    const milk = task('3', 'Молоко');
    const title = stepTitles([move, pack, milk]);

    expect(title(pack)).toBe('Переезд › Собрать вещи');
    expect(title(move)).toBe('Переезд');
    expect(title(milk)).toBe('Молоко');
  });

  it('names a step alone when its task is not in the list', () => {
    expect(stepTitles([])(task('2', 'Собрать вещи', '1'))).toBe('Собрать вещи');
  });
});
