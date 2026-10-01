import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { AiConnectionsService } from './ai-connections.service';
import { CollectedSection, DigestChange, digestChanges } from './digest-changes';
import { DigestSection } from './digest-section';
import { morningDigestSnapshots } from './ai.schema';

/**
 * Sections of the morning digest (modules register them) and what changed in them since
 * the last sent digest. Sending is done by MorningDigestJob.
 */
@Injectable()
export class MorningDigestService {
  private readonly logger = new Logger(MorningDigestService.name);
  private readonly sections: DigestSection[] = [];

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly connections: AiConnectionsService,
  ) {}

  register(section: DigestSection): void {
    this.sections.push(section);
  }

  /** Sections a user may switch on in the AI settings. */
  optIns(): string[] {
    return this.sections.filter((section) => section.optIn).map((section) => section.id);
  }

  /** Sections for today's digest; empty — nothing new, the digest is not sent. */
  async changes(userId: string): Promise<DigestChange[]> {
    // The digest is written by the AI: modules switched off for it are left out.
    const hidden = new Set(await this.connections.disabledModules(userId));
    const optedIn = new Set(await this.connections.digestOptIns(userId));
    const visible = this.sections.filter(
      (section) => !hidden.has(section.module) && (!section.optIn || optedIn.has(section.id)),
    );
    const collected = await Promise.all(visible.map((section) => this.collect(userId, section)));
    return digestChanges(
      collected.filter((item) => item !== null),
      await this.lastSent(userId),
    );
  }

  /** Called after the digest is delivered, so a failed one is told again the next morning. */
  async markSent(userId: string, changes: DigestChange[]): Promise<void> {
    if (changes.length === 0) {
      return;
    }
    await this.db
      .insert(morningDigestSnapshots)
      .values(changes.map(({ section, facts }) => ({ userId, sectionId: section.id, facts })))
      .onConflictDoUpdate({
        target: [morningDigestSnapshots.userId, morningDigestSnapshots.sectionId],
        set: { facts: sql`excluded.facts`, sentAt: sql`excluded.sent_at` },
      });
  }

  private async collect(userId: string, section: DigestSection): Promise<CollectedSection | null> {
    try {
      return { section, facts: await section.collect(userId) };
    } catch (error) {
      // One broken section (an outside API is down) must not cancel the rest of the digest.
      this.logger.warn(`Digest section ${section.id} failed for ${userId}: ${error}`);
      return null;
    }
  }

  private async lastSent(userId: string): Promise<Map<string, unknown>> {
    const rows = await this.db
      .select()
      .from(morningDigestSnapshots)
      .where(eq(morningDigestSnapshots.userId, userId));
    return new Map(rows.map((row) => [row.sectionId, row.facts]));
  }
}
