import {Inject, Injectable, Logger} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {AiService, AppConfig, DB, Database, UsersService} from '@pd/api-core';
import {
  buildHealthSummary,
  HealthShare,
  HealthShareCreated,
  healthShareInputSchema,
  HealthSummary,
  HealthSummaryOptions,
  zonedDateTime,
} from '@pd/contracts';
import {and, desc, eq, sql} from 'drizzle-orm';
import {createHash, randomBytes} from 'node:crypto';
import {z} from 'zod';
import {HealthShareRow, healthShares} from '../health.schema';
import {HealthService} from '../health.service';
import {found} from '../owned';
import {summaryBlocks} from './summary-blocks';
import {summaryDocx} from './summary-docx';
import {summaryHtml} from './summary-html';
import {
  parseTranslations,
  translatableTexts,
  translationInstruction,
  withTranslations,
} from './summary-translate';

export type ValidShareInput = z.output<typeof healthShareInputSchema>;

const DAY_MS = 86_400_000;

/**
 * The summary of a history for a new doctor: as a page to print, a Word document, or a link
 * the doctor opens without signing in for a few days. Translated by the AI — Health's own
 * connection when it has one — only when asked; if the AI fails, the texts stay as written and
 * the summary does not claim a translation.
 */
@Injectable()
export class SummaryService {
  private readonly logger = new Logger(SummaryService.name);
  private readonly publicUrl: string;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) config: AppConfig,
    private readonly health: HealthService,
    private readonly users: UsersService,
    private readonly ai: AiService,
  ) {
    this.publicUrl = config
      .get('PUBLIC_URL', {infer: true})
      .replace(/\/+$/, '');
  }

  async summary(
    userId: string,
    options: HealthSummaryOptions,
  ): Promise<HealthSummary> {
    const user = await this.users.findById(userId);
    const summary = buildHealthSummary(
      await this.health.record(userId),
      options,
      {
        patient: user?.displayName ?? '',
        today: zonedDateTime(new Date(), this.users.timeZoneOf(user)).date,
      },
    );
    return options.translate ? this.translate(userId, summary) : summary;
  }

  async html(userId: string, options: HealthSummaryOptions): Promise<string> {
    const summary = await this.summary(userId, options);
    return summaryHtml(summary.language, summaryBlocks(summary));
  }

  async docx(userId: string, options: HealthSummaryOptions): Promise<Buffer> {
    return summaryDocx(summaryBlocks(await this.summary(userId, options)));
  }

  // --- Links for a doctor ---

  async shares(userId: string): Promise<HealthShare[]> {
    const rows = await this.db
      .select(shareColumns)
      .from(healthShares)
      .where(eq(healthShares.userId, userId))
      .orderBy(desc(healthShares.createdAt));
    return rows.map(toShare);
  }

  /** The address is given once: only the hash of its token is kept. */
  async share(
    userId: string,
    input: ValidShareInput,
  ): Promise<HealthShareCreated> {
    const page = await this.html(userId, input.options);
    const token = randomBytes(24).toString('base64url');
    const [row] = await this.db
      .insert(healthShares)
      .values({
        userId,
        tokenHash: hash(token),
        note: input.note || null,
        language: input.options.language,
        page,
        expiresAt: new Date(Date.now() + input.days * DAY_MS),
      })
      .returning(shareColumns);
    return {
      share: toShare(row),
      url: `${this.publicUrl}/api/medical/shared/${token}`,
    };
  }

  /** The link stops working at once; it stays in the list as revoked. */
  async revoke(userId: string, id: string): Promise<void> {
    const [row] = await this.db
      .update(healthShares)
      .set({revokedAt: new Date()})
      .where(and(eq(healthShares.id, id), eq(healthShares.userId, userId)))
      .returning({id: healthShares.id});
    found(row, 'Link');
  }

  /** The page of a link that works; `null` — unknown, expired or revoked (all alike outside). */
  async open(token: string): Promise<string | null> {
    const [row] = await this.db
      .update(healthShares)
      .set({opened: sql`${healthShares.opened} + 1`, lastOpenedAt: new Date()})
      .where(
        and(
          eq(healthShares.tokenHash, hash(token)),
          sql`${healthShares.revokedAt} is null`,
          sql`${healthShares.expiresAt} > now()`,
        ),
      )
      .returning({page: healthShares.page});
    return row?.page ?? null;
  }

  private async translate(
    userId: string,
    summary: HealthSummary,
  ): Promise<HealthSummary> {
    const texts = translatableTexts(summary);
    if (!texts.length) {
      return summary;
    }
    try {
      const answer = await this.ai.complete(
        userId,
        translationInstruction(summary.language),
        JSON.stringify(texts),
        'health',
        {keepLanguage: true},
      );
      return withTranslations(summary, parseTranslations(texts, answer));
    } catch (error) {
      this.logger.warn(`The summary was not translated: ${error}`);
      return summary;
    }
  }
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Everything of a link but its page and the hash of its token. */
const shareColumns = {
  id: healthShares.id,
  note: healthShares.note,
  language: healthShares.language,
  createdAt: healthShares.createdAt,
  expiresAt: healthShares.expiresAt,
  revokedAt: healthShares.revokedAt,
  opened: healthShares.opened,
  lastOpenedAt: healthShares.lastOpenedAt,
};

function toShare(
  row: Pick<HealthShareRow, keyof typeof shareColumns>,
): HealthShare {
  return {
    id: row.id,
    note: row.note,
    language: row.language,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    opened: row.opened,
    lastOpenedAt: row.lastOpenedAt?.toISOString() ?? null,
  };
}
