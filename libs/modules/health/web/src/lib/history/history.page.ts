import {DatePipe} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatSelectModule} from '@angular/material/select';
import {MatTooltipModule} from '@angular/material/tooltip';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {todayLocalDate, ToastService} from '@pd/web-core';
import {
  HealthDocument,
  HealthLabPanel,
  HealthRecord,
  HealthVisit,
} from '@pd/contracts';
import {HealthDialogs} from '../dialogs/health-dialogs.service';
import {HealthApi} from '../health.api';
import {CountryPipe, SpecialityPipe} from '../health-labels';

interface Filters {
  country: string;
  speciality: string;
  doctorId: string;
}

const NO_FILTERS: Filters = {country: '', speciality: '', doctorId: ''};

/**
 * The whole history: every visit, the latest first, with what was diagnosed, prescribed and
 * kept at it; filtered by country, speciality or doctor.
 */
@Component({
  selector: 'pd-health-history-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CountryPipe,
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTooltipModule,
    SpecialityPipe,
    TranslocoPipe,
  ],
  templateUrl: './history.page.html',
  styleUrl: './history.page.scss',
})
export class HistoryPage {
  private readonly api = inject(HealthApi);
  private readonly dialogs = inject(HealthDialogs);
  private readonly route = inject(ActivatedRoute);
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);

  protected readonly record = this.api.record();
  /** The history once it is here (`value()` of a failed resource throws). */
  protected readonly data = computed(() =>
    this.record.hasValue() ? this.record.value() : undefined,
  );
  protected readonly texts = [
    'complaints',
    'findings',
    'recommendations',
    'notes',
  ] as const;
  protected readonly filters = signal<Filters>(NO_FILTERS);

  private readonly allVisits = computed(() => this.data()?.visits ?? []);
  protected readonly countries = computed(() =>
    distinct(this.allVisits().map(v => v.country)),
  );
  protected readonly specialities = computed(() =>
    distinct(this.allVisits().map(v => v.speciality)),
  );
  protected readonly doctors = computed(() => this.data()?.doctors ?? []);

  protected readonly visits = computed(() => {
    const {country, speciality, doctorId} = this.filters();
    return this.allVisits().filter(
      visit =>
        (!country || visit.country === country) &&
        (!speciality || visit.speciality === speciality) &&
        (!doctorId || visit.doctorId === doctorId),
    );
  });

  /** The nearest visit still ahead that a past visit set, with the days left until it. */
  protected readonly upcoming = computed(() => {
    const today = todayLocalDate();
    const next = this.allVisits()
      .filter(visit => visit.nextVisitOn && visit.nextVisitOn >= today)
      .sort((a, b) =>
        (a.nextVisitOn ?? '').localeCompare(b.nextVisitOn ?? ''),
      )[0];
    if (!next?.nextVisitOn) {
      return null;
    }
    const days = Math.round(
      (Date.parse(`${next.nextVisitOn}T12:00:00`) -
        Date.parse(`${today}T12:00:00`)) /
        86_400_000,
    );
    return {visit: next, days};
  });

  /** Documents the AI has read whose drafts wait to be checked. */
  protected readonly drafts = computed(() =>
    (this.data()?.documents ?? []).filter(document => document.hasDraft),
  );

  protected readonly looseDocuments = computed(() =>
    (this.data()?.documents ?? []).filter(document => !document.visitId),
  );

  constructor() {
    // `?draft=<document>`: the link of the Telegram reply opens that document's draft.
    effect(() => {
      const data = this.data();
      const id = this.route.snapshot.queryParamMap.get('draft');
      const document = data?.documents.find(d => d.id === id);
      if (data && id) {
        void this.router.navigate([], {
          queryParams: {draft: null},
          replaceUrl: true,
        });
        if (document) {
          void untracked(() => this.review(data, document));
        }
      }
    });
  }

  protected filter(change: Partial<Filters>): void {
    this.filters.update(filters => ({...filters, ...change}));
  }

  protected doctorName(
    data: HealthRecord,
    visit: HealthVisit,
  ): string | undefined {
    return data.doctors.find(doctor => doctor.id === visit.doctorId)?.name;
  }

  protected clinicName(
    data: HealthRecord,
    visit: HealthVisit,
  ): string | undefined {
    return data.clinics.find(clinic => clinic.id === visit.clinicId)?.name;
  }

  protected diagnosesOf(data: HealthRecord, visit: HealthVisit) {
    return data.diagnoses.filter(diagnosis => diagnosis.visitId === visit.id);
  }

  protected medicationsOf(data: HealthRecord, visit: HealthVisit) {
    return data.medications.filter(
      medication => medication.visitId === visit.id,
    );
  }

  protected panelsOf(data: HealthRecord, visit: HealthVisit) {
    return data.labPanels.filter(panel => panel.visitId === visit.id);
  }

  protected studiesOf(data: HealthRecord, visit: HealthVisit) {
    return data.studies.filter(study => study.visitId === visit.id);
  }

  /** How many lines are out of the laboratory's range; `0` is not shown. */
  protected outOfRange(panel: HealthLabPanel): number {
    return panel.values.filter(line => line.flag).length;
  }

  protected async addPanel(
    record: HealthRecord,
    visit: HealthVisit,
  ): Promise<void> {
    if (
      await this.dialogs.labPanel({
        record,
        visitId: visit.id,
        day: visit.visitedOn,
      })
    ) {
      this.record.reload();
    }
  }

  protected async addStudy(
    record: HealthRecord,
    visit: HealthVisit,
  ): Promise<void> {
    if (
      await this.dialogs.study({
        record,
        visitId: visit.id,
        day: visit.visitedOn,
      })
    ) {
      this.record.reload();
    }
  }

  protected documentsOf(data: HealthRecord, visit: HealthVisit) {
    return data.documents.filter(document => document.visitId === visit.id);
  }

  protected async addVisit(): Promise<void> {
    const record = this.data();
    if (record && (await this.dialogs.visit({record}))) {
      this.record.reload();
    }
  }

  protected async editVisit(
    record: HealthRecord,
    visit: HealthVisit,
  ): Promise<void> {
    if (await this.dialogs.visit({record, visit})) {
      this.record.reload();
    }
  }

  protected async removeVisit(visit: HealthVisit): Promise<void> {
    if (
      await this.dialogs.remove(visit.visitedOn, () =>
        this.api.client.removeVisit(visit.id),
      )
    ) {
      this.record.reload();
    }
  }

  protected async addDiagnosis(
    record: HealthRecord,
    visit: HealthVisit,
  ): Promise<void> {
    if (
      await this.dialogs.diagnosis({
        record,
        visitId: visit.id,
        day: visit.visitedOn,
      })
    ) {
      this.record.reload();
    }
  }

  protected async addMedication(
    record: HealthRecord,
    visit: HealthVisit,
  ): Promise<void> {
    if (
      await this.dialogs.medication({
        record,
        visitId: visit.id,
        day: visit.visitedOn,
      })
    ) {
      this.record.reload();
    }
  }

  protected async addDocument(visit?: HealthVisit): Promise<void> {
    const record = this.data();
    if (
      record &&
      (await this.dialogs.document({
        record,
        visitId: visit?.id,
        day: visit?.visitedOn,
      }))
    ) {
      this.record.reload();
    }
  }

  protected async editDocument(
    record: HealthRecord,
    document: HealthDocument,
  ): Promise<void> {
    if (await this.dialogs.document({record, document})) {
      this.record.reload();
    }
  }

  protected async removeDocument(document: HealthDocument): Promise<void> {
    if (
      await this.dialogs.remove(document.name, () =>
        this.api.client.removeDocument(document.id),
      )
    ) {
      this.record.reload();
    }
  }

  protected async review(
    record: HealthRecord,
    document: HealthDocument,
  ): Promise<void> {
    if (await this.dialogs.review({record, document})) {
      this.record.reload();
    }
  }

  /** A recommendation in lines, without the list marks a document puts before them. */
  protected lines(text: string): string[] {
    return text
      .split(/\r?\n/)
      .map(line => line.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim())
      .filter(Boolean);
  }

  /** The line becomes a task of the TODO list (through the core: Health does not know Tasks). */
  protected async toTask(line: string): Promise<void> {
    try {
      await this.api.client.addTask({title: line});
      this.toasts.show({
        icon: 'add_task',
        title: this.transloco.translate('health.visit.taskAdded'),
        text: line,
        route: '/tasks/todo',
      });
    } catch {
      this.toasts.show({
        icon: 'error',
        title: this.transloco.translate('health.visit.taskFailed'),
      });
    }
  }

  protected async open(document: HealthDocument): Promise<void> {
    if (await this.dialogs.openDocument(document)) {
      this.record.reload();
    }
  }
}

function distinct(values: (string | null)[]): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ].sort();
}
