import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {
  AuthUser,
  AutomationsService,
  CurrentUser,
  RateLimit,
  ServerActions,
  ZodValidationPipe,
} from '@pd/api-core';
import {
  HEALTH_DOCUMENT_MAX_BYTES,
  healthClinicInputSchema,
  healthDiagnosisInputSchema,
  healthDoctorInputSchema,
  healthDocumentInputSchema,
  healthDraftApplySchema,
  healthLabPanelInputSchema,
  healthStudyInputSchema,
  HealthTaskInput,
  healthTaskInputSchema,
  healthMedicationInputSchema,
  healthVisitInputSchema,
  ICD_FILE_MAX_BYTES,
  IcdDictionary,
  IcdImportInput,
  icdImportSchema,
  IcdLoadInput,
  icdLoadSchema,
  IcdSearchQuery,
  icdSearchSchema,
} from '@pd/contracts';
import {
  DocumentReaderService,
  ValidDraftApply,
} from './documents/document-reader.service';
import {HEALTH_ACTIONS} from './health.server-actions';
import {
  HealthService,
  ValidClinicInput,
  ValidDiagnosisInput,
  ValidDoctorInput,
  ValidDocumentInput,
  ValidMedicationInput,
  ValidVisitInput,
} from './health.service';
import {IcdDictionaryService} from './icd/icd-dictionary.service';
import {LabsService, ValidLabPanelInput, ValidStudyInput} from './labs.service';

interface UploadedDocument {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

/**
 * Health. `/api/medical`, since `/api/health` is the server's own health check.
 * Each kind of record has the same three routes: POST adds, PUT changes, DELETE removes.
 */
@Controller('medical')
export class HealthController {
  constructor(
    private readonly health: HealthService,
    private readonly labs: LabsService,
    private readonly reader: DocumentReaderService,
    private readonly icd: IcdDictionaryService,
    private readonly actions: ServerActions,
    private readonly automations: AutomationsService,
  ) {}

  @Get('record')
  record(@CurrentUser() user: AuthUser) {
    return this.health.record(user.id);
  }

  // --- Clinics ---

  @Post('clinics')
  addClinic(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(healthClinicInputSchema))
    input: ValidClinicInput,
  ) {
    return this.health.saveClinic(user.id, input);
  }

  @Put('clinics/:id')
  updateClinic(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(healthClinicInputSchema))
    input: ValidClinicInput,
  ) {
    return this.health.saveClinic(user.id, input, id);
  }

  @Delete('clinics/:id')
  @HttpCode(204)
  removeClinic(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.health.removeClinic(user.id, id);
  }

  // --- Doctors ---

  @Post('doctors')
  addDoctor(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(healthDoctorInputSchema))
    input: ValidDoctorInput,
  ) {
    return this.health.saveDoctor(user.id, input);
  }

  @Put('doctors/:id')
  updateDoctor(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(healthDoctorInputSchema))
    input: ValidDoctorInput,
  ) {
    return this.health.saveDoctor(user.id, input, id);
  }

  @Delete('doctors/:id')
  @HttpCode(204)
  removeDoctor(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.health.removeDoctor(user.id, id);
  }

  // --- Visits ---

  @Post('visits')
  addVisit(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(healthVisitInputSchema)) input: ValidVisitInput,
  ) {
    return this.health.saveVisit(user.id, input);
  }

  @Put('visits/:id')
  updateVisit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(healthVisitInputSchema)) input: ValidVisitInput,
  ) {
    return this.health.saveVisit(user.id, input, id);
  }

  @Delete('visits/:id')
  @HttpCode(204)
  removeVisit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.health.removeVisit(user.id, id);
  }

  /**
   * A recommendation becomes a task through the action Tasks registers (Health does not know
   * Tasks); 404 when Tasks is not enabled.
   */
  @Post('tasks')
  async addTask(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(healthTaskInputSchema)) input: HealthTaskInput,
  ) {
    const done = await this.automations.runAction(user.id, 'tasks.create', {
      title: input.title,
      due: 'none',
    });
    if (!done) {
      throw new NotFoundException('Tasks are not enabled');
    }
    return {created: true};
  }

  // --- Diagnoses ---

  @Post('diagnoses')
  addDiagnosis(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(healthDiagnosisInputSchema))
    input: ValidDiagnosisInput,
  ) {
    return this.health.saveDiagnosis(user.id, input);
  }

  @Put('diagnoses/:id')
  updateDiagnosis(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(healthDiagnosisInputSchema))
    input: ValidDiagnosisInput,
  ) {
    return this.health.saveDiagnosis(user.id, input, id);
  }

  @Delete('diagnoses/:id')
  @HttpCode(204)
  removeDiagnosis(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.health.removeDiagnosis(user.id, id);
  }

  // --- Medications ---

  @Post('medications')
  addMedication(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(healthMedicationInputSchema))
    input: ValidMedicationInput,
  ) {
    return this.health.saveMedication(user.id, input);
  }

  @Put('medications/:id')
  updateMedication(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(healthMedicationInputSchema))
    input: ValidMedicationInput,
  ) {
    return this.health.saveMedication(user.id, input, id);
  }

  @Delete('medications/:id')
  @HttpCode(204)
  removeMedication(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.health.removeMedication(user.id, id);
  }

  // --- Lab results: a report with its lines, saved as a whole ---

  @Post('labs')
  addLabPanel(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(healthLabPanelInputSchema))
    input: ValidLabPanelInput,
  ) {
    return this.labs.savePanel(user.id, input);
  }

  @Put('labs/:id')
  updateLabPanel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(healthLabPanelInputSchema))
    input: ValidLabPanelInput,
  ) {
    return this.labs.savePanel(user.id, input, id);
  }

  @Delete('labs/:id')
  @HttpCode(204)
  removeLabPanel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.labs.removePanel(user.id, id);
  }

  // --- Studies ---

  @Post('studies')
  addStudy(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(healthStudyInputSchema)) input: ValidStudyInput,
  ) {
    return this.labs.saveStudy(user.id, input);
  }

  @Put('studies/:id')
  updateStudy(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(healthStudyInputSchema)) input: ValidStudyInput,
  ) {
    return this.labs.saveStudy(user.id, input, id);
  }

  @Delete('studies/:id')
  @HttpCode(204)
  removeStudy(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.labs.removeStudy(user.id, id);
  }

  // --- Documents ---

  /** The file in `file`, its description in the other fields of the form. */
  @Post('documents')
  @UseInterceptors(
    FileInterceptor('file', {limits: {fileSize: HEALTH_DOCUMENT_MAX_BYTES}}),
  )
  addDocument(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(healthDocumentInputSchema))
    input: ValidDocumentInput,
    @UploadedFile() file: UploadedDocument | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('Expected a file in the "file" field');
    }
    return this.health.addDocument(user.id, input, {
      data: file.buffer,
      mimeType: file.mimetype,
    });
  }

  @Put('documents/:id')
  updateDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(healthDocumentInputSchema))
    input: ValidDocumentInput,
  ) {
    return this.health.updateDocument(user.id, id, input);
  }

  /** A page of the file (`?page=2`; the first without it); fetched with the auth header. */
  @Get('documents/:id/file')
  @Header('Cache-Control', 'private, no-store')
  async documentFile(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ) {
    const {data, mimeType} = await this.health.documentFile(user.id, id, page);
    return new StreamableFile(data, {type: mimeType});
  }

  /** One more photographed page, in `file`, at the end. */
  @Post('documents/:id/pages')
  @UseInterceptors(
    FileInterceptor('file', {limits: {fileSize: HEALTH_DOCUMENT_MAX_BYTES}}),
  )
  addPage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedDocument | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('Expected a file in the "file" field');
    }
    return this.health.addPage(user.id, id, {
      data: file.buffer,
      mimeType: file.mimetype,
    });
  }

  @Delete('documents/:id/pages/:page')
  removePage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('page', ParseIntPipe) page: number,
  ) {
    return this.health.removePage(user.id, id, page);
  }

  // --- A document read by the AI: a draft, checked and saved by the user ---

  /** Reads it now (a minute at most) and keeps the draft next to it. */
  @RateLimit(30, 3600)
  @Post('documents/:id/read')
  readDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reader.read(user.id, id);
  }

  /** The draft waiting to be checked; `null` — none. */
  @Get('documents/:id/draft')
  async documentDraft(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return {draft: await this.reader.draft(user.id, id)};
  }

  @Delete('documents/:id/draft')
  @HttpCode(204)
  dropDraft(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reader.dropDraft(user.id, id);
  }

  /** Saves a checked draft as one change (see DocumentReaderService.apply). */
  @Post('drafts/apply')
  applyDraft(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(healthDraftApplySchema)) input: ValidDraftApply,
  ) {
    return this.reader.apply(user.id, input);
  }

  @Delete('documents/:id')
  @HttpCode(204)
  removeDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.health.removeDocument(user.id, id);
  }

  // --- The ICD dictionary ---

  @Get('icd')
  dictionaries(@CurrentUser() user: AuthUser) {
    return this.icd.dictionaries(user.id);
  }

  @Get('icd/search')
  searchIcd(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(icdSearchSchema)) query: IcdSearchQuery,
  ) {
    return this.icd.search(user.id, query);
  }

  /** From a CSV or XLSX file of the user's (`file`), for its classification and language. */
  @Post('icd/import')
  @UseInterceptors(
    FileInterceptor('file', {limits: {fileSize: ICD_FILE_MAX_BYTES}}),
  )
  importIcd(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(icdImportSchema)) input: IcdImportInput,
    @UploadedFile() file: UploadedDocument | undefined,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Expected a CSV or XLSX file in the "file" field',
      );
    }
    return this.icd.import(user.id, input, {
      name: file.originalname,
      data: file.buffer,
    });
  }

  /** Downloads it from its publisher, on the server (a sync client asks the server). */
  @Post('icd/load')
  loadIcd(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(icdLoadSchema)) input: IcdLoadInput,
  ) {
    return this.actions.run<IcdDictionary[]>(
      user.id,
      HEALTH_ACTIONS.loadIcd,
      input,
    );
  }
}
