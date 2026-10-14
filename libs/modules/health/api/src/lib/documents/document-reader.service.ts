import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { AiService, DB, Database } from '@pd/api-core';
import {
  HealthDocumentDraft,
  healthDocumentDraftSchema,
  HealthDocumentKind,
  healthDraftApplySchema,
  HealthDraftApplied,
  HealthDraftKind,
} from '@pd/contracts';
import { and, eq } from 'drizzle-orm';
import { extractText } from 'unpdf';
import { z } from 'zod';
import { healthDocuments } from '../health.schema';
import { HealthService } from '../health.service';
import { LabsService } from '../labs.service';
import { assertOwnedId, found } from '../owned';
import { answerShape, DRAFT_INSTRUCTION, parseDraft } from './draft-parse';

export type ValidDraftApply = z.output<typeof healthDraftApplySchema>;

/** Why a document could not be read; the page tells it in the user's language. */
export type ReadFailure = 'scanned' | 'noAi' | 'noVision' | 'aiOff' | 'aiFailed' | 'unreadable';

/** A PDF with less text than this is a scan: its text has to be seen, not read. */
const MIN_PDF_TEXT = 40;

/** The kind a document gets from what the AI read in it, when it had none. */
const DOCUMENT_KIND: Record<HealthDraftKind, HealthDocumentKind> = {
  visit: 'consultation',
  labs: 'labResults',
  study: 'study',
  other: 'other',
};

/**
 * A document read by the AI into a draft: nothing is saved but the draft itself, next to the
 * document, until the user checks it and saves it (`apply`) or drops it. The AI is the
 * section's own connection when Health has one (Settings → AI), the document's text keeps its
 * language.
 */
@Injectable()
export class DocumentReaderService {
  private readonly logger = new Logger(DocumentReaderService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly ai: AiService,
  ) {}

  async read(userId: string, documentId: string): Promise<HealthDocumentDraft> {
    const [document] = await this.db
      .select({
        data: healthDocuments.data,
        mimeType: healthDocuments.mimeType,
        kind: healthDocuments.kind,
      })
      .from(healthDocuments)
      .where(and(eq(healthDocuments.id, documentId), eq(healthDocuments.userId, userId)));
    const { data, mimeType, kind } = found(document, 'Document');
    const answer = await this.ask(userId, data, mimeType);
    const draft = parseDraft(answer);
    // The shape only — keys and the length of the lists, never the document's words.
    this.logger.log(
      `A medical document read: ${answerShape(answer)} → ` +
        `${draft?.diagnoses.length ?? 0} diagnoses, ${draft?.medications.length ?? 0} medications`,
    );
    if (!draft) {
      throw failure('unreadable');
    }
    await this.db
      .update(healthDocuments)
      .set({
        draft: JSON.stringify(draft),
        ...(kind === 'other' ? { kind: DOCUMENT_KIND[draft.kind] } : {}),
      })
      .where(and(eq(healthDocuments.id, documentId), eq(healthDocuments.userId, userId)));
    return draft;
  }

  /** The draft waiting to be checked; `null` — none. */
  async draft(userId: string, documentId: string): Promise<HealthDocumentDraft | null> {
    const [row] = await this.db
      .select({ draft: healthDocuments.draft })
      .from(healthDocuments)
      .where(and(eq(healthDocuments.id, documentId), eq(healthDocuments.userId, userId)));
    const stored = found(row, 'Document').draft;
    return stored ? healthDocumentDraftSchema.parse(JSON.parse(stored)) : null;
  }

  async dropDraft(userId: string, documentId: string): Promise<void> {
    await assertOwnedId(this.db, userId, healthDocuments, documentId, 'Document');
    await this.db
      .update(healthDocuments)
      .set({ draft: null })
      .where(and(eq(healthDocuments.id, documentId), eq(healthDocuments.userId, userId)));
  }

  /**
   * Saves a checked draft as one change: the clinic and the doctor (new ones by name), a visit
   * with its diagnoses and medications, a lab report or a study; the document goes with what
   * was made, and its draft is gone. Nothing is saved if any of it fails.
   */
  async apply(userId: string, input: ValidDraftApply): Promise<HealthDraftApplied> {
    return this.db.transaction(async (tx) => {
      const db = tx as unknown as Database;
      const labs = new LabsService(db);
      const health = new HealthService(db, labs);
      await assertOwnedId(db, userId, healthDocuments, input.documentId, 'Document');

      const clinicId =
        input.clinicId ??
        (input.newClinic ? (await health.saveClinic(userId, input.newClinic)).id : null);
      const doctorId =
        input.doctorId ??
        (input.newDoctor
          ? (await health.saveDoctor(userId, { ...input.newDoctor, clinicId })).id
          : null);
      const visit = input.visit
        ? await health.saveVisit(userId, { ...input.visit, clinicId, doctorId })
        : null;
      const visitId = visit?.id ?? null;
      for (const diagnosis of input.diagnoses) {
        await health.saveDiagnosis(userId, { ...diagnosis, visitId });
      }
      for (const medication of input.medications) {
        await health.saveMedication(userId, { ...medication, visitId });
      }
      const documentId = input.documentId;
      const panel = input.labPanel
        ? await labs.savePanel(userId, { ...input.labPanel, visitId, documentId })
        : null;
      const study = input.study
        ? await labs.saveStudy(userId, { ...input.study, visitId, documentId })
        : null;

      await db
        .update(healthDocuments)
        .set({ draft: null, ...(visitId ? { visitId } : {}) })
        .where(and(eq(healthDocuments.id, documentId), eq(healthDocuments.userId, userId)));
      return { visitId, labPanelId: panel?.id ?? null, studyId: study?.id ?? null };
    });
  }

  /** The AI's answer about a picture or the text of a PDF. */
  private async ask(userId: string, data: Buffer, mimeType: string): Promise<string> {
    try {
      if (mimeType === 'application/pdf') {
        const text = await pdfText(data);
        if (text.replace(/\s+/g, '').length < MIN_PDF_TEXT) {
          throw failure('scanned');
        }
        return await this.ai.complete(userId, DRAFT_INSTRUCTION, text, 'health', {
          keepLanguage: true,
        });
      }
      const answer = await this.ai.completeWithImage(
        userId,
        DRAFT_INSTRUCTION,
        { data, mimeType },
        'health',
        { keepLanguage: true },
      );
      if (answer === null) {
        throw failure('noVision');
      }
      return answer;
    } catch (error) {
      if (error instanceof BadRequestException && isFailure(error)) {
        throw error;
      }
      if (error instanceof BadRequestException && /not configured/.test(error.message)) {
        throw failure('noAi');
      }
      if (error instanceof ForbiddenException) {
        throw failure('aiOff');
      }
      this.logger.warn(`A medical document could not be read: ${error}`);
      throw failure('aiFailed');
    }
  }
}

async function pdfText(data: Buffer): Promise<string> {
  try {
    const { text } = await extractText(new Uint8Array(data), { mergePages: true });
    return text;
  } catch {
    return '';
  }
}

/** A 400 with a `code` the page translates. */
function failure(code: ReadFailure): BadRequestException {
  return new BadRequestException({ statusCode: 400, code, message: `Not read: ${code}` });
}

function isFailure(error: BadRequestException): boolean {
  return typeof (error.getResponse() as { code?: unknown }).code === 'string';
}
