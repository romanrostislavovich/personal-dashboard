import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { AuthUser, CurrentUser, ZodValidationPipe } from '@pd/api-core';
import {
  HealthIntakeAnswer,
  healthIntakeAnswerSchema,
  healthAllergyInputSchema,
  healthOperationInputSchema,
  healthProfileInputSchema,
  healthVaccinationInputSchema,
} from '@pd/contracts';
import { IntakesService } from '../intakes/intakes.service';
import {
  ProfileService,
  ValidAllergyInput,
  ValidOperationInput,
  ValidProfileInput,
  ValidVaccinationInput,
} from './profile.service';

/**
 * The profile (blood type, allergies, vaccinations, operations) and the answers to the
 * reminders to take medications. Read with the rest of the history (`GET medical/record`).
 */
@Controller('medical')
export class ProfileController {
  constructor(
    private readonly profiles: ProfileService,
    private readonly intakes: IntakesService,
  ) {}

  @Put('profile')
  saveProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(healthProfileInputSchema)) input: ValidProfileInput,
  ) {
    return this.profiles.saveProfile(user.id, input);
  }

  // --- Allergies ---

  @Post('allergies')
  addAllergy(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(healthAllergyInputSchema)) input: ValidAllergyInput,
  ) {
    return this.profiles.saveAllergy(user.id, input);
  }

  @Put('allergies/:id')
  updateAllergy(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(healthAllergyInputSchema)) input: ValidAllergyInput,
  ) {
    return this.profiles.saveAllergy(user.id, input, id);
  }

  @Delete('allergies/:id')
  @HttpCode(204)
  removeAllergy(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.profiles.removeAllergy(user.id, id);
  }

  // --- Vaccinations ---

  @Post('vaccinations')
  addVaccination(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(healthVaccinationInputSchema)) input: ValidVaccinationInput,
  ) {
    return this.profiles.saveVaccination(user.id, input);
  }

  @Put('vaccinations/:id')
  updateVaccination(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(healthVaccinationInputSchema)) input: ValidVaccinationInput,
  ) {
    return this.profiles.saveVaccination(user.id, input, id);
  }

  @Delete('vaccinations/:id')
  @HttpCode(204)
  removeVaccination(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.profiles.removeVaccination(user.id, id);
  }

  // --- Operations ---

  @Post('operations')
  addOperation(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(healthOperationInputSchema)) input: ValidOperationInput,
  ) {
    return this.profiles.saveOperation(user.id, input);
  }

  @Put('operations/:id')
  updateOperation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(healthOperationInputSchema)) input: ValidOperationInput,
  ) {
    return this.profiles.saveOperation(user.id, input, id);
  }

  @Delete('operations/:id')
  @HttpCode(204)
  removeOperation(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.profiles.removeOperation(user.id, id);
  }

  // --- Reminders to take medications ---

  /** "Taken" or "skipped" from the page, as the buttons in Telegram do. */
  @Put('intakes/:id')
  answerIntake(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(healthIntakeAnswerSchema)) input: HealthIntakeAnswer,
  ) {
    return this.intakes.answer(user.id, id, input.status);
  }
}
