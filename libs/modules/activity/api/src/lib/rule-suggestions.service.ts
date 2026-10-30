import {Inject, Injectable, Logger, NotFoundException} from '@nestjs/common';
import {
  AiService,
  DB,
  Database,
  OtherComputersService,
  ProjectsService,
} from '@pd/api-core';
import {
  ActivityRuleSuggestion,
  addDays,
  isProjectClosed,
  parseLocalDate,
  toLocalDate,
} from '@pd/contracts';
import {and, eq, gte} from 'drizzle-orm';
import {
  activityRuleSuggestions,
  activitySiteVisits,
  activitySpans,
} from './activity.schema';
import {ActivityService} from './activity.service';
import {projectTime} from './project-context';
import {ProjectTimeService} from './project-time.service';
import {
  NewSuggestion,
  parseSuggestions,
  patternShare,
  suggestionCandidates,
  sureSuggestions,
} from './rule-suggestions';
import {dayBounds} from './time-spans';

/** The days looked at: enough for a habit, short enough for what the user does now. */
const DAYS = 14;

const INSTRUCTION = `You help a personal dashboard tell which windows and sites belong to a
software project. You get the project (its name, other names, description) and "candidates":
windows (a program and its title) and sites (a host, a local one with its port) that were
open next to work on the project and mostly only then, with their time in seconds.

Pick the candidates that are really about this project: its running app (localhost with a
port), its admin pages, its repository, its docs, its issue tracker, a terminal or a window
titled after it. Leave out general tools used for any work: search engines, AI chats, mail,
messengers, generic documentation, a terminal or a page with a generic title.

For each one picked, give a "pattern": a short part of its title or site, written exactly as
in it, that would be found in that project's windows and not in others' — the folder or app
name, the host with its port. Never a whole long title with a file name in it.

Answer with JSON only, no other text:
{"suggestions": [{"label": "the candidate's label, exactly as given", "pattern": "…",
  "reason": "one short sentence for the user: why it is this project's"}]}
An empty list when nothing fits.`;

/**
 * Rules the dashboard offers: windows and sites that keep turning up in work on a project
 * (see rule-suggestions.ts). The AI picks the ones about the project and the part of a title
 * to look for; its answer is checked. Without the AI only a local app surely the project's is
 * offered. Nothing becomes a rule until the user accepts it.
 */
@Injectable()
export class RuleSuggestionsService {
  private readonly logger = new Logger(RuleSuggestionsService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly activity: ActivityService,
    private readonly projectTimes: ProjectTimeService,
    private readonly others: OtherComputersService,
    private readonly projects: ProjectsService,
    private readonly ai: AiService,
  ) {}

  /** The offers waiting for an answer, of the projects still going. */
  async list(userId: string): Promise<ActivityRuleSuggestion[]> {
    const today = await this.activity.today(userId);
    const open = new Map(
      (await this.projects.list(userId))
        .filter(project => !isProjectClosed(project, today))
        .map(project => [project.id, project.name]),
    );
    const s = activityRuleSuggestions;
    const rows = await this.db
      .select()
      .from(s)
      .where(and(eq(s.userId, userId), eq(s.rejected, false)));
    return rows
      .filter(row => open.has(row.projectId))
      .map(row => ({
        id: row.id,
        projectId: row.projectId,
        projectName: open.get(row.projectId) ?? '',
        pattern: row.pattern,
        kind: row.kind,
        seconds: row.seconds,
        reason: row.reason,
      }))
      .sort((a, b) => b.seconds - a.seconds);
  }

  /** The offer becomes a rule of its project. */
  async accept(userId: string, id: string): Promise<void> {
    const row = await this.own(userId, id);
    await this.activity.addRule(userId, {
      projectId: row.projectId,
      pattern: row.pattern,
    });
    await this.db
      .delete(activityRuleSuggestions)
      .where(eq(activityRuleSuggestions.id, row.id));
  }

  /** Not this project's: kept, so it is not offered again. */
  async reject(userId: string, id: string): Promise<void> {
    const row = await this.own(userId, id);
    await this.db
      .update(activityRuleSuggestions)
      .set({rejected: true})
      .where(eq(activityRuleSuggestions.id, row.id));
  }

  /** Users with windows or sites recorded in the days looked at: the others have nothing new. */
  async activeUserIds(): Promise<string[]> {
    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
    const spans = await this.db
      .selectDistinct({userId: activitySpans.userId})
      .from(activitySpans)
      .where(gte(activitySpans.startedAt, since));
    const visits = await this.db
      .selectDistinct({userId: activitySiteVisits.userId})
      .from(activitySiteVisits)
      .where(gte(activitySiteVisits.startedAt, since));
    return [...new Set([...spans, ...visits].map(row => row.userId))];
  }

  /** Looks at the latest days again and saves what is new to offer, for every project going. */
  async refresh(userId: string): Promise<void> {
    const today = await this.activity.today(userId);
    const projects = (await this.projects.list(userId)).filter(
      project => !isProjectClosed(project, today),
    );
    if (!projects.length) {
      return;
    }
    const from = toLocalDate(addDays(parseLocalDate(today), -(DAYS - 1)));
    const bounds = dayBounds(
      {from, to: today},
      await this.activity.timeZone(userId),
    );
    const start = new Date(bounds[0].start);
    const end = new Date(bounds[bounds.length - 1].end);
    const pieces = await this.projectTimes.pieces(userId, start, end);
    const withAi =
      (await this.ai.isConfigured(userId)) &&
      (await this.ai.canSee(userId, 'activity'));
    // A rule of any project, or an offer made before (taken or not), is not offered again.
    const rules = (await this.activity.rules(userId)).map(rule =>
      rule.pattern.toLowerCase(),
    );
    const offered = await this.db
      .select({
        projectId: activityRuleSuggestions.projectId,
        pattern: activityRuleSuggestions.pattern,
      })
      .from(activityRuleSuggestions)
      .where(eq(activityRuleSuggestions.userId, userId));

    for (const project of projects) {
      const coding = await this.others.projectSpans(
        userId,
        project,
        start,
        end,
      );
      const time = projectTime(
        pieces,
        project.id,
        coding.map(span => ({
          start: span.startedAt.getTime(),
          end: span.endedAt.getTime(),
        })),
      );
      const candidates = suggestionCandidates(pieces, time);
      if (!candidates.length) {
        continue;
      }
      const taken = new Set([
        ...rules,
        ...offered
          .filter(item => item.projectId === project.id)
          .map(item => item.pattern.toLowerCase()),
      ]);
      let found: NewSuggestion[] | null = null;
      if (withAi) {
        try {
          const answer = await this.ai.complete(
            userId,
            INSTRUCTION,
            JSON.stringify({
              project: {
                name: project.name,
                otherNames: project.aliases,
                description: project.description,
              },
              candidates: candidates.map(({kind, app, label, nearSeconds}) => ({
                kind,
                program: app,
                label,
                seconds: nearSeconds,
              })),
            }),
            'activity',
            {light: true},
          );
          found = parseSuggestions(
            answer,
            candidates,
            taken,
            patternShare(pieces, time),
          );
        } catch (error) {
          this.logger.warn(
            `Rule suggestions from the AI failed: ${(error as Error).message}`,
          );
        }
      }
      const suggestions = found ?? sureSuggestions(candidates, taken);
      if (suggestions.length) {
        await this.db
          .insert(activityRuleSuggestions)
          .values(
            suggestions.map(item => ({userId, projectId: project.id, ...item})),
          )
          .onConflictDoNothing();
      }
    }
  }

  private async own(userId: string, id: string) {
    const s = activityRuleSuggestions;
    const [row] = await this.db
      .select()
      .from(s)
      .where(and(eq(s.id, id), eq(s.userId, userId)));
    if (!row) {
      throw new NotFoundException();
    }
    return row;
  }
}
