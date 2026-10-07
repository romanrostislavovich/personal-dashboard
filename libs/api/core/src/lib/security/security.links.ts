import { Injectable, OnModuleInit } from '@nestjs/common';
import { LinksService, ProjectRef } from '../links/links.service';
import { SecurityService } from './security.service';

/** A name shorter than this would be found inside any other word. */
const MIN_NAME = 4;
const TITLES = 3;

/**
 * Whether a finding is about a project: its text names the project, one of its other names
 * (a repository) or the host of its site.
 */
export function isAbout(
  finding: { key: string; title: string; details: string },
  project: Pick<ProjectRef, 'name' | 'url' | 'aliases'>,
): boolean {
  const text = `${finding.key}\n${finding.title}\n${finding.details}`.toLowerCase();
  const names = [project.name, ...project.aliases].map((name) => name.trim().toLowerCase());
  let host: string | null = null;
  try {
    host = project.url ? new URL(project.url).host.toLowerCase() : null;
  } catch {
    host = null;
  }
  return [...names, host ?? ''].some((name) => name.length >= MIN_NAME && text.includes(name));
}

/**
 * The security agent on the page of a project (see LinksService): the open findings that are
 * about it — its repository, its site.
 */
@Injectable()
export class SecurityLinks implements OnModuleInit {
  constructor(
    private readonly links: LinksService,
    private readonly security: SecurityService,
  ) {}

  onModuleInit(): void {
    this.links.registerProject({
      module: 'security',
      facts: async (userId, project) => {
        const open = (await this.security.known(userId)).filter(
          (finding) => finding.status === 'open' && isAbout(finding, project),
        );
        return open.length
          ? [
              {
                module: 'security',
                labelKey: 'security.links.findings',
                value: open.length,
                unit: 'count',
                link: '/security',
                note: open
                  .slice(0, TITLES)
                  .map((finding) => finding.title)
                  .join('; '),
              },
            ]
          : [];
      },
    });
    this.links.registerPages([
      { module: 'security', path: '/security', description: 'findings of the security agent' },
    ]);
  }
}
