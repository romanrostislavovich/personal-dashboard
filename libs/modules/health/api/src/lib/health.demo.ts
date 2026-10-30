import {Injectable, OnModuleInit} from '@nestjs/common';
import {DemoService} from '@pd/api-core';
import {HealthService} from './health.service';
import {LabsService} from './labs.service';
import {ProfileService} from './profile/profile.service';

/**
 * The demo data of Health: a made-up history across two countries — a family doctor in Kyiv,
 * a clinic in Warsaw — with a condition in remission, a current one, medications, glucose from
 * both labs in different units, and an ultrasound. Nothing of the mind: a demo stays light.
 */
@Injectable()
export class HealthDemo implements OnModuleInit {
  constructor(
    private readonly demo: DemoService,
    private readonly health: HealthService,
    private readonly labs: LabsService,
    private readonly profiles: ProfileService,
  ) {}

  onModuleInit(): void {
    this.demo.register({
      module: 'health',
      seed: context => this.seed(context.userId, context.daysAgo),
    });
  }

  private async seed(
    userId: string,
    daysAgo: (days: number) => string,
  ): Promise<void> {
    await this.profiles.saveProfile(userId, {bloodType: 'A+'});
    await this.profiles.saveAllergy(userId, {
      substance: 'Пеніцилін',
      reaction: 'Кропив’янка',
      severity: 'moderate',
    });
    await this.profiles.saveVaccination(userId, {
      vaccine: 'Tetanus, diphtheria (Td)',
      givenOn: daysAgo(3400),
      country: 'UA',
      nextDueOn: daysAgo(-250),
    });
    await this.profiles.saveOperation(userId, {
      title: 'Апендектомія',
      performedOn: daysAgo(6200),
      clinic: 'Міська лікарня №1, Київ',
    });
    const kyiv = await this.health.saveClinic(userId, {
      name: 'Сімейна клініка «Добробут»',
      country: 'UA',
      city: 'Київ',
    });
    const warsaw = await this.health.saveClinic(userId, {
      name: 'Medicover Warszawa',
      country: 'PL',
      city: 'Warszawa',
    });
    const gp = await this.health.saveDoctor(userId, {
      name: 'лікар Олена Коваль',
      speciality: 'general',
      clinicId: kyiv.id,
    });
    const gastro = await this.health.saveDoctor(userId, {
      name: 'lek. Piotr Nowak',
      speciality: 'gastroenterologist',
      clinicId: warsaw.id,
    });

    const old = await this.health.saveVisit(userId, {
      visitedOn: daysAgo(1460),
      clinicId: kyiv.id,
      doctorId: gp.id,
      complaints: 'Задишка при фізичному навантаженні.',
      recommendations: 'Сальбутамол за потреби.\nКонтроль через 3 місяці.',
      language: 'uk',
    });
    await this.health.saveDiagnosis(userId, {
      system: 'icd10',
      code: 'J45.0',
      title: 'Бронхіальна астма, алергічна',
      status: 'remission',
      diagnosedOn: daysAgo(1460),
      visitId: old.id,
    });
    await this.health.saveMedication(userId, {
      name: 'Сальбутамол',
      substance: 'salbutamol',
      dose: '100 мкг',
      schedule: 'за потреби',
      startedOn: daysAgo(1460),
      stoppedOn: daysAgo(900),
      stopReason: 'Без нападів пів року',
      visitId: old.id,
      reminderTimes: [],
    });

    const recent = await this.health.saveVisit(userId, {
      visitedOn: daysAgo(20),
      clinicId: warsaw.id,
      doctorId: gastro.id,
      complaints: 'Ból w nadbrzuszu po posiłkach od miesiąca.',
      findings: 'Brzuch miękki, tkliwy w nadbrzuszu.',
      recommendations:
        'Pantoprazol 20 mg rano przez 4 tygodnie.\nUSG jamy brzusznej.',
      nextVisitOn: daysAgo(-10),
      language: 'pl',
    });
    await this.health.saveDiagnosis(userId, {
      system: 'icd10',
      code: 'K29.7',
      title: 'Zapalenie żołądka, nieokreślone',
      status: 'confirmed',
      diagnosedOn: daysAgo(20),
      visitId: recent.id,
    });
    await this.health.saveMedication(userId, {
      name: 'Controloc',
      substance: 'pantoprazole',
      dose: '20 mg',
      schedule: 'rano, przed śniadaniem',
      startedOn: daysAgo(20),
      visitId: recent.id,
      reminderTimes: ['07:30'],
    });

    await this.labs.savePanel(userId, {
      takenOn: daysAgo(1450),
      laboratory: 'Сінево',
      country: 'UA',
      visitId: old.id,
      values: [
        {
          name: 'Глюкоза',
          analyte: 'glucose',
          value: 5.9,
          unit: 'ммоль/л',
          refLow: 3.9,
          refHigh: 5.8,
        },
        {
          name: 'Гемоглобін',
          analyte: 'hemoglobin',
          value: 148,
          unit: 'г/л',
          refLow: 130,
          refHigh: 170,
        },
        {
          name: 'ТТГ',
          analyte: 'tsh',
          value: 2.1,
          unit: 'мМО/л',
          refLow: 0.4,
          refHigh: 4,
        },
      ],
    });
    await this.labs.savePanel(userId, {
      takenOn: daysAgo(18),
      laboratory: 'Diagnostyka',
      country: 'PL',
      visitId: recent.id,
      values: [
        {
          name: 'Glukoza',
          analyte: 'glucose',
          value: 97,
          unit: 'mg/dl',
          refLow: 70,
          refHigh: 99,
        },
        {
          name: 'Hemoglobina',
          analyte: 'hemoglobin',
          value: 14.6,
          unit: 'g/dl',
          refLow: 13.5,
          refHigh: 17.5,
        },
        {name: 'CRP', analyte: 'crp', value: 6.2, unit: 'mg/l', refHigh: 5},
      ],
    });
    await this.labs.saveStudy(userId, {
      kind: 'ultrasound',
      area: 'Jama brzuszna',
      performedOn: daysAgo(12),
      conclusion:
        'Wątroba, trzustka i śledziona bez zmian ogniskowych. Pęcherzyk żółciowy bez złogów.',
      visitId: recent.id,
    });
  }
}
