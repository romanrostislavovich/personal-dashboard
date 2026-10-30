import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {DB, Database, decodeText} from '@pd/api-core';
import {
  IcdDictionary,
  IcdEntry,
  IcdImportInput,
  IcdSearchQuery,
  IcdSource,
  IcdSystem,
} from '@pd/contracts';
import {and, asc, count, eq, ilike, or, sql} from 'drizzle-orm';
import {unzipSync} from 'fflate';
import {healthIcdCodes} from '../health.schema';
import readXlsxFile from 'read-excel-file/node';
import {ClamlCode, clamlCodes} from './claml';
import {csvRows, icdTable} from './icd-table';

/** Where each source is downloaded from, and what it holds. */
const SOURCES: Record<
  IcdSource,
  {url: string; system: IcdSystem; language: string}
> = {
  // ICD-10, 2019, the English ClaML of WHO (https://icdcdn.who.int/icd10/index.html).
  'who-icd10-en': {
    url: 'https://icdcdn.who.int/icd10/claml/icd102019en.xml.zip',
    system: 'icd10',
    language: 'en',
  },
};

const DOWNLOAD_TIMEOUT_MS = 180_000;
const ROWS_AT_A_TIME = 1000;

/**
 * The ICD dictionary of a user. WHO does not let ICD-10 be shipped with an open-source program,
 * so the dashboard holds none of it: the user accepts the publisher's terms and their own
 * server downloads it (docs/health.md). Loading again replaces what was loaded.
 */
@Injectable()
export class IcdDictionaryService {
  private readonly logger = new Logger(IcdDictionaryService.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  async dictionaries(userId: string): Promise<IcdDictionary[]> {
    const rows = await this.db
      .select({
        system: healthIcdCodes.system,
        language: healthIcdCodes.language,
        codes: count(),
      })
      .from(healthIcdCodes)
      .where(eq(healthIcdCodes.userId, userId))
      .groupBy(healthIcdCodes.system, healthIcdCodes.language);
    return rows.map(row => ({...row, codes: Number(row.codes)}));
  }

  /** Downloads a source and replaces the codes of its system and language. */
  async load(userId: string, source: IcdSource): Promise<IcdDictionary[]> {
    const {url, system, language} = SOURCES[source];
    const codes = [...clamlCodes(await this.download(url))];
    if (!codes.length) {
      throw new BadGatewayException(
        'The dictionary has no codes: the file may have changed',
      );
    }
    await this.replace(userId, system, language, codes);
    this.logger.log(`ICD ${source}: ${codes.length} codes loaded`);
    return this.dictionaries(userId);
  }

  /**
   * A dictionary from a table the user downloaded themselves (CSV or XLSX): no list in Russian
   * or Ukrainian may be shipped either, but anyone may load the one they have.
   */
  async import(
    userId: string,
    {system, language}: IcdImportInput,
    file: {name: string; data: Buffer},
  ): Promise<IcdDictionary[]> {
    const rows = file.name.toLowerCase().endsWith('.xlsx')
      ? (await readXlsxFile(file.data)).flatMap(sheet => sheet.data)
      : csvRows(decodeText(file.data));
    const codes = icdTable(rows);
    if (!codes.length) {
      throw new BadRequestException(
        'No column of ICD codes was found in the file',
      );
    }
    await this.replace(userId, system, language, codes);
    this.logger.log(
      `ICD ${system}/${language}: ${codes.length} codes imported from a file`,
    );
    return this.dictionaries(userId);
  }

  private async replace(
    userId: string,
    system: IcdSystem,
    language: string,
    codes: ClamlCode[],
  ): Promise<void> {
    await this.db.transaction(async tx => {
      await tx
        .delete(healthIcdCodes)
        .where(
          and(
            eq(healthIcdCodes.userId, userId),
            eq(healthIcdCodes.system, system),
            eq(healthIcdCodes.language, language),
          ),
        );
      for (let start = 0; start < codes.length; start += ROWS_AT_A_TIME) {
        await tx
          .insert(healthIcdCodes)
          .values(
            codes.slice(start, start + ROWS_AT_A_TIME).map(({code, title}) => ({
              userId,
              system,
              language,
              code,
              title,
            })),
          )
          .onConflictDoNothing();
      }
    });
  }

  /** By the start of a code (`F41`) or by a word of the title, codes first. */
  async search(
    userId: string,
    {q, limit}: IcdSearchQuery,
  ): Promise<IcdEntry[]> {
    const pattern = q.replace(/[\\%_]/g, char => `\\${char}`);
    return this.db
      .select({
        system: healthIcdCodes.system,
        code: healthIcdCodes.code,
        language: healthIcdCodes.language,
        title: healthIcdCodes.title,
      })
      .from(healthIcdCodes)
      .where(
        and(
          eq(healthIcdCodes.userId, userId),
          or(
            ilike(healthIcdCodes.code, `${pattern.replace(/\s+/g, '')}%`),
            ilike(healthIcdCodes.title, `%${pattern}%`),
          ),
        ),
      )
      .orderBy(
        sql`${healthIcdCodes.code} ILIKE ${`${pattern}%`} DESC`,
        asc(healthIcdCodes.code),
        asc(healthIcdCodes.language),
      )
      .limit(limit);
  }

  /** The titles a code has in the loaded dictionaries, one a language. */
  async titles(
    userId: string,
    system: IcdSystem,
    code: string,
  ): Promise<IcdEntry[]> {
    return this.db
      .select({
        system: healthIcdCodes.system,
        code: healthIcdCodes.code,
        language: healthIcdCodes.language,
        title: healthIcdCodes.title,
      })
      .from(healthIcdCodes)
      .where(
        and(
          eq(healthIcdCodes.userId, userId),
          eq(healthIcdCodes.system, system),
          eq(healthIcdCodes.code, code),
        ),
      );
  }

  private async download(url: string): Promise<string> {
    let archive: Uint8Array;
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      archive = new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      this.logger.warn(`ICD download from ${url} failed: ${error}`);
      throw new BadGatewayException('The dictionary could not be downloaded');
    }
    const files = unzipSync(archive, {
      filter: file => file.name.endsWith('.xml'),
    });
    const xml = Object.values(files)[0];
    if (!xml) {
      throw new BadGatewayException(
        'The archive has no XML: the file may have changed',
      );
    }
    return new TextDecoder().decode(xml);
  }
}
