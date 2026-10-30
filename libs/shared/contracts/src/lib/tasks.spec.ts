import {taskInputSchema, taskUpdateSchema} from './tasks';

describe('the horizon of a task', () => {
  it('is left out unless told, so the table keeps it normal', () => {
    expect(
      taskInputSchema.parse({title: 'Call the bank'}).horizon,
    ).toBeUndefined();
  });

  it('takes short, normal and long-running only', () => {
    expect(taskUpdateSchema.parse({horizon: 'long'}).horizon).toBe('long');
    expect(taskUpdateSchema.safeParse({horizon: 'forever'}).success).toBe(
      false,
    );
  });
});
