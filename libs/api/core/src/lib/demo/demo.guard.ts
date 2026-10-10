import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/current-user.decorator';
import { DemoService } from './demo.service';

/**
 * What a visitor of a demo may change. Everything can be read; of the writes only those that
 * stay inside the demo user's own data and make the server do nothing outside it. A path is
 * allowed when it starts with one of these.
 */
const ALLOWED_WRITES = [
  '/api/auth/logout',
  // The language, the theme, the layout of the home page, the time zone of the device.
  '/api/auth/me',
  '/api/tasks',
  '/api/diary/entries',
  '/api/diary/settings',
  '/api/birthdays',
  '/api/psychology',
  '/api/finance/transactions',
  '/api/finance/budgets',
  '/api/finance/goals',
  '/api/finance/recurring-payments',
  '/api/finance/subscriptions/dismiss',
  '/api/finance/settings',
  '/api/projects',
  '/api/life/goals',
  '/api/automations',
  '/api/activity/settings',
  '/api/activity/limits',
  '/api/activity/rules',
  '/api/activity/apps',
  '/api/activity/focus',
  '/api/weather',
  '/api/trash',
  '/api/achievements/recount',
];

/** Uploads are not for a demo, wherever they go: a file is the easiest thing to abuse. */
const FILE_PART = /\/(photos|receipts|attachments|import)(\/|$)/;
/** Asking the AI to draft a rule is asking an outside service. */
const AI_PART = /\/automations\/draft$/;

/** Whether the demo user may make this request. */
export function allowedInDemo(method: string, path: string): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }
  const clean = path.split('?')[0];
  return (
    !FILE_PART.test(clean) &&
    !AI_PART.test(clean) &&
    ALLOWED_WRITES.some((prefix) => clean === prefix || clean.startsWith(`${prefix}/`))
  );
}

/**
 * On a demo instance the shared user cannot change the account (password, two-factor, e-mail),
 * connect outside services (tokens, AI connections, monitored addresses, shop pages), upload
 * files or touch the instance itself (sync, import, the security agent). See ALLOWED_WRITES.
 * Runs after AuthGuard, which says who is asking.
 */
@Injectable()
export class DemoGuard implements CanActivate {
  constructor(private readonly demo: DemoService) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.demo.enabled) {
      return true;
    }
    const request = context.switchToHttp().getRequest<{
      user?: AuthUser;
      method: string;
      originalUrl?: string;
      url: string;
    }>();
    if (!request.user || !this.demo.isDemoUser(request.user.id)) {
      return true;
    }
    if (!allowedInDemo(request.method, request.originalUrl ?? request.url)) {
      throw new ForbiddenException('Not available in the demo');
    }
    return true;
  }
}
