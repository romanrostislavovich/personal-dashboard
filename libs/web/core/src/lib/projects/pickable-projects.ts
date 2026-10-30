import {isProjectClosed, Project} from '@pd/contracts';
import {todayLocalDate} from '../utils/month';

/**
 * The projects to choose from in a form: the closed ones are left out — new work does not go
 * to them — except the one already chosen (`keep`), so editing an old record does not lose it.
 */
export function pickableProjects(
  projects: Project[],
  keep: string | null = null,
  today = todayLocalDate(),
): Project[] {
  return projects.filter(
    project => project.id === keep || !isProjectClosed(project, today),
  );
}
