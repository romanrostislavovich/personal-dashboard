import {Injectable, OnModuleInit} from '@nestjs/common';
import {MorningDigestService, UsersService} from '@pd/api-core';
import {zonedDateTime} from '@pd/contracts';
import {HealthService} from './health.service';

/** How far ahead the digest looks for a visit. */
const DAYS_AHEAD = 14;

/**
 * The next visits to a doctor in the morning digest. Only when the user ticks it (`optIn`):
 * the digest is written by the shared AI, and Health keeps away from it by default.
 */
@Injectable()
export class HealthDigest implements OnModuleInit {
  constructor(
    private readonly digest: MorningDigestService,
    private readonly health: HealthService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.digest.register({
      id: 'health.nextVisit',
      module: 'health',
      optIn: true,
      description:
        'Visits to a doctor planned in the next two weeks (the date, the speciality, the ' +
        'clinic) and vaccinations due in that time. Mention one that is today or tomorrow, and ' +
        'one new to the list; nothing about why the visit is.',
      // Dates, not "days until": the facts change only when a visit is planned or comes.
      collect: async userId => {
        const user = await this.users.findById(userId);
        const today = zonedDateTime(
          new Date(),
          this.users.timeZoneOf(user),
        ).date;
        const until = new Date(Date.parse(today) + DAYS_AHEAD * 86_400_000)
          .toISOString()
          .slice(0, 10);
        const record = await this.health.record(userId);
        const visits = record.visits
          .filter(
            v =>
              v.nextVisitOn && v.nextVisitOn >= today && v.nextVisitOn <= until,
          )
          .map(v => ({
            date: v.nextVisitOn,
            speciality: v.speciality,
            clinic: record.clinics.find(c => c.id === v.clinicId)?.name ?? null,
          }))
          .sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const vaccinations = record.profile.vaccinations
          .filter(
            v => v.nextDueOn && v.nextDueOn >= today && v.nextDueOn <= until,
          )
          .map(v => ({date: v.nextDueOn, vaccine: v.vaccine}));
        return visits.length || vaccinations.length
          ? {today, visits, vaccinations}
          : null;
      },
    });
  }
}
