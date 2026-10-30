import {parseDurations} from './wakatime-durations';

describe('parseDurations', () => {
  it('reads the stretches of a project to the second', () => {
    expect(
      parseDurations(
        [{project: 'personal-dashboard', time: 1760000000.4, duration: 600.6}],
        'project',
      ),
    ).toEqual([
      {
        name: 'personal-dashboard',
        startedAt: new Date(1760000000 * 1000),
        endedAt: new Date((1760000000 + 601) * 1000),
      },
    ]);
  });

  it('names a computer by its machine name, and keeps an unknown one as it came', () => {
    const names = new Map([['m1', 'work-laptop']]);
    const spans = parseDurations(
      [
        {machine_name_id: 'm1', time: 100, duration: 60},
        {machine_name_id: 'm2', time: 200, duration: 60},
      ],
      'machine',
      names,
    );
    expect(spans.map(span => span.name)).toEqual(['work-laptop', 'm2']);
  });

  it('leaves out a stretch without a name or a length', () => {
    expect(
      parseDurations(
        [
          {project: null, time: 100, duration: 60},
          {project: 'a', time: 100, duration: 0},
        ],
        'project',
      ),
    ).toEqual([]);
  });
});
