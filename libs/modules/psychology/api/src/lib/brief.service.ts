import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DB, Database, UsersService } from '@pd/api-core';
import { AppointmentBrief, appointmentBriefInputSchema } from '@pd/contracts';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { briefBlocks } from './brief-document';
import { toDocxDocument } from './brief-export';
import { feelingText, psychologyMessages } from './psychology.messages';
import { PsychologyBriefRow, psychologyBriefs } from './psychology.schema';
import { PsychologyService } from './psychology.service';

export type ValidBriefInput = z.output<typeof appointmentBriefInputSchema>;

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Briefs for an appointment with a specialist: the user's own records of a period, picked one
 * by one, with what changed and the questions. Saved to come back to, exported by hand —
 * nothing is sent anywhere, and nothing is concluded from the records.
 */
@Injectable()
export class BriefService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly psychology: PsychologyService,
    private readonly users: UsersService,
  ) {}

  async list(userId: string): Promise<AppointmentBrief[]> {
    const rows = await this.db
      .select()
      .from(psychologyBriefs)
      .where(eq(psychologyBriefs.userId, userId))
      .orderBy(desc(psychologyBriefs.from), desc(psychologyBriefs.createdAt));
    return rows.map(toBrief);
  }

  async add(userId: string, input: ValidBriefInput): Promise<AppointmentBrief> {
    const [row] = await this.db
      .insert(psychologyBriefs)
      .values({ userId, ...stored(input) })
      .returning();
    return toBrief(row);
  }

  async update(userId: string, id: string, input: ValidBriefInput): Promise<AppointmentBrief> {
    const [row] = await this.db
      .update(psychologyBriefs)
      .set({ ...stored(input), updatedAt: new Date() })
      .where(and(eq(psychologyBriefs.id, id), eq(psychologyBriefs.userId, userId)))
      .returning();
    if (!row) {
      throw new NotFoundException();
    }
    return toBrief(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.db
      .delete(psychologyBriefs)
      .where(and(eq(psychologyBriefs.id, id), eq(psychologyBriefs.userId, userId)));
  }

  /** The brief as a Word document in the user's language. */
  async export(userId: string, id: string): Promise<{ file: Buffer; name: string; type: string }> {
    const [row] = await this.db
      .select()
      .from(psychologyBriefs)
      .where(and(eq(psychologyBriefs.id, id), eq(psychologyBriefs.userId, userId)));
    if (!row) {
      throw new NotFoundException();
    }
    const brief = toBrief(row);
    const user = await this.users.findById(userId);
    const [events, assessments] = await Promise.all([
      this.psychology.events(userId),
      this.psychology.assessments(userId),
    ]);
    const blocks = briefBlocks(
      brief,
      events,
      assessments,
      psychologyMessages(user?.locale),
      (event) => feelingText(user?.locale, event.feeling),
    );
    return {
      file: toDocxDocument(blocks),
      name: `brief-${brief.appointmentOn ?? brief.to}.docx`,
      type: DOCX,
    };
  }
}

function stored(input: ValidBriefInput) {
  return {
    title: input.title,
    appointmentOn: input.appointmentOn ?? null,
    from: input.from,
    to: input.to,
    eventIds: input.eventIds,
    assessmentIds: input.assessmentIds,
    changes: input.changes,
    // One question a line: a line break inside one would make two.
    questions: input.questions.map((question) => question.replace(/\s*\n\s*/g, ' ')).join('\n'),
    notes: input.notes,
  };
}

function toBrief(row: PsychologyBriefRow): AppointmentBrief {
  return {
    id: row.id,
    title: row.title,
    appointmentOn: row.appointmentOn,
    from: row.from,
    to: row.to,
    eventIds: row.eventIds,
    assessmentIds: row.assessmentIds,
    changes: row.changes,
    questions: row.questions ? row.questions.split('\n') : [],
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
