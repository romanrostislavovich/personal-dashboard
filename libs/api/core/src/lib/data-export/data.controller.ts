import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DataImportReport } from '@pd/contracts';
import type { Response } from 'express';
import { tmpdir } from 'node:os';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { DataExportService } from './data-export.service';
import { DataImportService } from './data-import.service';

/** A history of years with its photos; anything larger is not an archive of one person. */
const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;

/** The part of a multer upload kept on the disk that we use. */
interface UploadedArchive {
  path: string;
}

/** One's data as an archive, and an archive brought back: `/api/data`. */
@Controller('data')
export class DataController {
  constructor(
    private readonly exporter: DataExportService,
    private readonly importer: DataImportService,
  ) {}

  /** Everything of the signed-in user as a ZIP, written as it is read from the database. */
  @Get('export')
  async export(@CurrentUser() user: AuthUser, @Res() response: Response): Promise<void> {
    const day = new Date().toISOString().slice(0, 10);
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Disposition', `attachment; filename="dashboard-${day}.zip"`);
    try {
      await this.exporter.write(user.id, response);
    } catch (error) {
      // The headers are sent: the only way to say "this is not the whole file" is to cut it.
      response.destroy(error instanceof Error ? error : undefined);
    }
  }

  /** Uploads an archive and tells what it would add; nothing is changed yet. */
  @Post('import')
  @UseInterceptors(
    // Kept on the disk, not in memory: an archive with photos is large.
    FileInterceptor('file', { dest: tmpdir(), limits: { fileSize: MAX_ARCHIVE_BYTES } }),
  )
  preview(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedArchive | undefined,
  ): Promise<DataImportReport> {
    if (!file) {
      throw new BadRequestException('Expected an archive in the "file" field');
    }
    return this.importer.preview(user.id, file.path);
  }

  /** Adds what the uploaded archive has and the dashboard does not. */
  @Post('import/:id')
  @HttpCode(200)
  apply(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DataImportReport> {
    return this.importer.apply(user.id, id);
  }

  /** "Cancel": the uploaded archive is not needed. */
  @Delete('import/:id')
  @HttpCode(204)
  discard(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.importer.discard(user.id, id);
  }
}
