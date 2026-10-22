import { Project } from '@pd/contracts';
import { pickableProjects } from './pickable-projects';

const project = (id: string, closedOn: string | null): Project => ({
  id,
  name: id,
  url: null,
  description: null,
  aliases: [],
  closedOn,
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('pickableProjects', () => {
  const projects = [
    project('open', null),
    project('closed', '2026-09-30'),
    project('planned', '2026-12-31'),
  ];

  it('leaves out the closed projects, not the ones closing later', () => {
    expect(pickableProjects(projects, null, '2026-10-22').map((p) => p.id)).toEqual([
      'open',
      'planned',
    ]);
  });

  it('keeps the closed project already chosen', () => {
    expect(pickableProjects(projects, 'closed', '2026-10-22').map((p) => p.id)).toEqual([
      'open',
      'closed',
      'planned',
    ]);
  });
});
