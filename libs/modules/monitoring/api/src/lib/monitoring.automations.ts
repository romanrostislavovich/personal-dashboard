import { Injectable, OnModuleInit } from '@nestjs/common';
import { AutomationsService } from '@pd/api-core';

/** "Only this site": a part of its name or address; empty — any site. */
const siteMatches = (params: Record<string, string>, vars: Record<string, string>) => {
  const site = (params['site'] ?? '').trim().toLowerCase();
  return !site || `${vars['site']} ${vars['url']}`.toLowerCase().includes(site);
};

const SITE = {
  name: 'site',
  type: 'text' as const,
  labelKey: 'monitoring.automations.site',
};

/** Monitoring in the rules "if X, then Y": a site went down, a site is back. */
@Injectable()
export class MonitoringAutomations implements OnModuleInit {
  constructor(private readonly automations: AutomationsService) {}

  onModuleInit(): void {
    this.automations.registerTrigger({
      id: 'monitoring.down',
      module: 'monitoring',
      labelKey: 'monitoring.automations.down',
      description:
        'A monitored site stopped answering (optionally only sites whose name or URL contains `site`)',
      params: [SITE],
      variables: ['site', 'url', 'error'],
      matches: siteMatches,
    });
    this.automations.registerTrigger({
      id: 'monitoring.up',
      module: 'monitoring',
      labelKey: 'monitoring.automations.up',
      description: 'A monitored site is back up after being down',
      params: [SITE],
      variables: ['site', 'url'],
      matches: siteMatches,
    });
  }
}
