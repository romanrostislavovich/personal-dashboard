import { Inject, Injectable } from '@nestjs/common';
import { DB, Database } from '@pd/api-core';
import {
  EmergencyContact,
  emergencyContactSchema,
  HealthAllergy,
  healthAllergyInputSchema,
  HealthOperation,
  healthOperationInputSchema,
  HealthProfile,
  healthProfileInputSchema,
  HealthVaccination,
  healthVaccinationInputSchema,
} from '@pd/contracts';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  HealthAllergyRow,
  healthAllergies,
  HealthOperationRow,
  healthOperations,
  healthProfiles,
  HealthVaccinationRow,
  healthVaccinations,
} from '../health.schema';
import { found, removeOwned } from '../owned';

export type ValidProfileInput = z.output<typeof healthProfileInputSchema>;
export type ValidAllergyInput = z.output<typeof healthAllergyInputSchema>;
export type ValidVaccinationInput = z.output<typeof healthVaccinationInputSchema>;
export type ValidOperationInput = z.output<typeof healthOperationInputSchema>;

/** The profile of a user as one piece: the blood type, the notes and the three lists. */
/** The contacts as stored; a broken value is none, not an error on the page. */
function readContacts(stored: string | null): EmergencyContact[] {
  try {
    const parsed = z.array(emergencyContactSchema).safeParse(JSON.parse(stored ?? '[]'));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function readProfile(db: Database, userId: string): Promise<HealthProfile> {
  const [[profile], allergies, vaccinations, operations] = await Promise.all([
    db.select().from(healthProfiles).where(eq(healthProfiles.userId, userId)),
    db.select().from(healthAllergies).where(eq(healthAllergies.userId, userId)),
    db
      .select()
      .from(healthVaccinations)
      .where(eq(healthVaccinations.userId, userId))
      .orderBy(desc(healthVaccinations.givenOn)),
    db
      .select()
      .from(healthOperations)
      .where(eq(healthOperations.userId, userId))
      .orderBy(desc(healthOperations.performedOn)),
  ]);
  return {
    bloodType: profile?.bloodType ?? null,
    notes: profile?.notes ?? null,
    emergencyContacts: readContacts(profile?.emergencyContacts ?? null),
    // The substances are encrypted: sorted here, a severe allergy first.
    allergies: allergies.map(toAllergy).sort(bySeverity),
    vaccinations: vaccinations.map(toVaccination),
    operations: operations.map(toOperation),
  };
}

/**
 * What a doctor asks first: the blood type, the allergies, the vaccinations, the operations,
 * and notes for an emergency.
 */
@Injectable()
export class ProfileService {
  constructor(@Inject(DB) private readonly db: Database) {}

  profile(userId: string): Promise<HealthProfile> {
    return readProfile(this.db, userId);
  }

  async saveProfile(userId: string, input: ValidProfileInput): Promise<HealthProfile> {
    const values = {
      bloodType: input.bloodType ?? null,
      notes: input.notes || null,
      ...(input.emergencyContacts
        ? { emergencyContacts: JSON.stringify(input.emergencyContacts) }
        : {}),
    };
    await this.db
      .insert(healthProfiles)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: healthProfiles.userId, set: values });
    return this.profile(userId);
  }

  async saveAllergy(userId: string, input: ValidAllergyInput, id?: string): Promise<HealthAllergy> {
    const values = {
      substance: input.substance,
      reaction: input.reaction || null,
      severity: input.severity ?? null,
      since: input.since ?? null,
    };
    const [row] = id
      ? await this.db
          .update(healthAllergies)
          .set(values)
          .where(and(eq(healthAllergies.id, id), eq(healthAllergies.userId, userId)))
          .returning()
      : await this.db
          .insert(healthAllergies)
          .values({ userId, ...values })
          .returning();
    return toAllergy(found(row, 'Allergy'));
  }

  removeAllergy(userId: string, id: string): Promise<void> {
    return removeOwned(this.db, userId, healthAllergies, id, 'Allergy');
  }

  async saveVaccination(
    userId: string,
    input: ValidVaccinationInput,
    id?: string,
  ): Promise<HealthVaccination> {
    const values = {
      vaccine: input.vaccine,
      dose: input.dose || null,
      givenOn: input.givenOn,
      country: input.country ?? null,
      nextDueOn: input.nextDueOn ?? null,
      notes: input.notes || null,
    };
    const [row] = id
      ? await this.db
          .update(healthVaccinations)
          .set(values)
          .where(and(eq(healthVaccinations.id, id), eq(healthVaccinations.userId, userId)))
          .returning()
      : await this.db
          .insert(healthVaccinations)
          .values({ userId, ...values })
          .returning();
    return toVaccination(found(row, 'Vaccination'));
  }

  removeVaccination(userId: string, id: string): Promise<void> {
    return removeOwned(this.db, userId, healthVaccinations, id, 'Vaccination');
  }

  async saveOperation(
    userId: string,
    input: ValidOperationInput,
    id?: string,
  ): Promise<HealthOperation> {
    const values = {
      title: input.title,
      performedOn: input.performedOn,
      clinic: input.clinic || null,
      notes: input.notes || null,
    };
    const [row] = id
      ? await this.db
          .update(healthOperations)
          .set(values)
          .where(and(eq(healthOperations.id, id), eq(healthOperations.userId, userId)))
          .returning()
      : await this.db
          .insert(healthOperations)
          .values({ userId, ...values })
          .returning();
    return toOperation(found(row, 'Operation'));
  }

  removeOperation(userId: string, id: string): Promise<void> {
    return removeOwned(this.db, userId, healthOperations, id, 'Operation');
  }
}

const SEVERITY = { severe: 0, moderate: 1, mild: 2 } as const;

function bySeverity(a: HealthAllergy, b: HealthAllergy): number {
  const rank = (allergy: HealthAllergy) => (allergy.severity ? SEVERITY[allergy.severity] : 3);
  return rank(a) - rank(b) || a.substance.localeCompare(b.substance);
}

function toAllergy(row: HealthAllergyRow): HealthAllergy {
  return {
    id: row.id,
    substance: row.substance,
    reaction: row.reaction,
    severity: row.severity,
    since: row.since,
  };
}

function toVaccination(row: HealthVaccinationRow): HealthVaccination {
  return {
    id: row.id,
    vaccine: row.vaccine,
    dose: row.dose,
    givenOn: row.givenOn,
    country: row.country,
    nextDueOn: row.nextDueOn,
    notes: row.notes,
  };
}

function toOperation(row: HealthOperationRow): HealthOperation {
  return {
    id: row.id,
    title: row.title,
    performedOn: row.performedOn,
    clinic: row.clinic,
    notes: row.notes,
  };
}
