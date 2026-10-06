import { goalPace } from './goal-math';

describe('goalPace', () => {
  const goal = { target: 3000, startedOn: '2026-01-01', deadline: '2026-12-31' };

  it('splits what is left over the months to the deadline', () => {
    // 1800 left, about 6 months to go.
    const pace = goalPace(goal, 1200, '2026-07-01');
    expect(pace.neededPerMonth).toBeGreaterThan(290);
    expect(pace.neededPerMonth).toBeLessThan(305);
    expect(pace.pacePerMonth).toBeCloseTo(201.7, 0);
  });

  it('asks for the rest at once in the last month and past the deadline', () => {
    expect(goalPace(goal, 2500, '2026-12-20').neededPerMonth).toBe(500);
    expect(goalPace(goal, 2500, '2027-02-01').neededPerMonth).toBe(500);
  });

  it('needs nothing without a deadline or once reached', () => {
    expect(goalPace({ ...goal, deadline: null }, 100, '2026-03-01').neededPerMonth).toBeNull();
    expect(goalPace(goal, 3100, '2026-03-01').neededPerMonth).toBeNull();
  });

  it('does not inflate the pace of a goal started days ago', () => {
    expect(goalPace(goal, 300, '2026-01-05').pacePerMonth).toBe(300);
  });
});
