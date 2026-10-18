import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { todayLocalDate, ToastService } from '@pd/web-core';
import { HealthDocument, HealthLabPanel, HealthRecord, HealthVisit } from '@pd/contracts';
import { HealthDialogs } from '../dialogs/health-dialogs.service';
import { HealthApi } from '../health.api';
import { CountryPipe, SpecialityPipe } from '../health-labels';

interface Filters {
  country: string;
  speciality: string;
  doctorId: string;
}

const NO_FILTERS: Filters = { country: '', speciality: '', doctorId: '' };

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
  template: `
    <div class="toolbar">
      <button matButton="filled" (click)="addVisit()">
        <mat-icon>add</mat-icon> {{ 'health.visit.add' | transloco }}
      </button>
      <button matButton="tonal" (click)="addDocument()">
        <mat-icon>upload_file</mat-icon> {{ 'health.document.add' | transloco }}
      </button>
      @if (countries().length > 1 || specialities().length > 1 || doctors().length > 1) {
        <span class="spacer"></span>
        <mat-form-field subscriptSizing="dynamic" class="filter">
          <mat-label>{{ 'health.country' | transloco }}</mat-label>
          <mat-select
            [value]="filters().country"
            (selectionChange)="filter({ country: $event.value })"
          >
            <mat-option [value]="''">{{ 'health.all' | transloco }}</mat-option>
            @for (code of countries(); track code) {
              <mat-option [value]="code">{{ code | pdCountry }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic" class="filter">
          <mat-label>{{ 'health.doctor.speciality' | transloco }}</mat-label>
          <mat-select
            [value]="filters().speciality"
            (selectionChange)="filter({ speciality: $event.value })"
          >
            <mat-option [value]="''">{{ 'health.all' | transloco }}</mat-option>
            @for (speciality of specialities(); track speciality) {
              <mat-option [value]="speciality">{{ speciality | pdSpeciality }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic" class="filter">
          <mat-label>{{ 'health.visit.doctor' | transloco }}</mat-label>
          <mat-select
            [value]="filters().doctorId"
            (selectionChange)="filter({ doctorId: $event.value })"
          >
            <mat-option [value]="''">{{ 'health.all' | transloco }}</mat-option>
            @for (doctor of doctors(); track doctor.id) {
              <mat-option [value]="doctor.id">{{ doctor.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      }
    </div>

    @if (record.isLoading()) {
      <mat-progress-bar mode="indeterminate" />
    }
    @if (record.error()) {
      <p class="error" role="alert">{{ 'health.errors.load' | transloco }}</p>
    } @else if (data(); as data) {
      @if (drafts().length) {
        <div class="drafts" role="status">
          <mat-icon>auto_awesome</mat-icon>
          <span>{{ 'health.drafts.waiting' | transloco: { count: drafts().length } }}</span>
          <button matButton="filled" (click)="review(data, drafts()[0])">
            {{ 'health.drafts.checkOne' | transloco }}
          </button>
        </div>
      }
      @if (upcoming(); as next) {
        <!-- The next visit a doctor asked for: on top, not inside the card of the last one. -->
        <div class="upcoming" role="status">
          <mat-icon>event_upcoming</mat-icon>
          <span>
            <b>{{
              next.days === 0
                ? ('health.upcoming.today' | transloco)
                : ('health.upcoming.title' | transloco: { days: next.days })
            }}</b>
            {{ next.visit.nextVisitOn | date: 'd MMMM y' }}
            @if (next.visit.speciality) {
              · {{ next.visit.speciality | pdSpeciality }}
            }
            @if (doctorName(data, next.visit); as name) {
              · {{ name }}
            }
          </span>
        </div>
      }
      @for (visit of visits(); track visit.id) {
        <mat-card appearance="outlined">
          <mat-card-content class="visit">
            <div class="head">
              <span class="when">{{ visit.visitedOn | date: 'd MMMM y' }}</span>
              <span class="where">
                @if (visit.speciality) {
                  <b>{{ visit.speciality | pdSpeciality }}</b>
                }
                @if (doctorName(data, visit); as name) {
                  · {{ name }}
                }
                @if (clinicName(data, visit); as name) {
                  · {{ name }}
                }
                @if (visit.country) {
                  · {{ visit.country | pdCountry }}
                }
              </span>
              <span class="spacer"></span>
              <button
                matIconButton
                [attr.aria-label]="'core.actions.edit' | transloco"
                [matTooltip]="'core.actions.edit' | transloco"
                (click)="editVisit(data, visit)"
              >
                <mat-icon>edit</mat-icon>
              </button>
              <button
                matIconButton
                [attr.aria-label]="'core.actions.delete' | transloco"
                [matTooltip]="'core.actions.delete' | transloco"
                (click)="removeVisit(visit)"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </div>

            @for (field of texts; track field) {
              @if (visit[field]; as text) {
                <div class="text">
                  <span class="label">{{ 'health.visit.' + field | transloco }}</span>
                  @if (field === 'recommendations') {
                    <!-- Every line of the recommendations can become a task. -->
                    @for (line of lines(text); track $index) {
                      <span class="recommendation">
                        <span class="words">{{ line }}</span>
                        <button
                          matIconButton
                          [attr.aria-label]="'health.visit.toTask' | transloco"
                          [matTooltip]="'health.visit.toTask' | transloco"
                          (click)="toTask(line)"
                        >
                          <mat-icon>add_task</mat-icon>
                        </button>
                      </span>
                    }
                  } @else {
                    <span class="words">{{ text }}</span>
                  }
                </div>
              }
            }

            @for (diagnosis of diagnosesOf(data, visit); track diagnosis.id) {
              <div class="line">
                <mat-icon>diagnosis</mat-icon>
                <span>
                  @if (diagnosis.code) {
                    <b>{{ diagnosis.code }}</b>
                  }
                  {{ diagnosis.title }}
                  <span class="hint"
                    >· {{ 'health.statuses.' + diagnosis.status | transloco }}</span
                  >
                </span>
              </div>
            }
            @for (medication of medicationsOf(data, visit); track medication.id) {
              <div class="line">
                <mat-icon>medication</mat-icon>
                <span>
                  <b>{{ medication.name }}</b>
                  @if (medication.dose) {
                    {{ medication.dose }}
                  }
                  @if (medication.schedule) {
                    · {{ medication.schedule }}
                  }
                </span>
              </div>
            }
            @for (panel of panelsOf(data, visit); track panel.id) {
              <div class="line">
                <mat-icon>labs</mat-icon>
                <span>
                  {{ 'health.labs.one' | transloco }}
                  @if (panel.laboratory) {
                    · {{ panel.laboratory }}
                  }
                  <span class="hint">
                    · {{ 'health.labs.lines' | transloco: { count: panel.values.length } }}
                    @if (outOfRange(panel); as out) {
                      · {{ 'health.labs.outOfRange' | transloco: { count: out } }}
                    }
                  </span>
                </span>
              </div>
            }
            @for (study of studiesOf(data, visit); track study.id) {
              <div class="line">
                <mat-icon>radiology</mat-icon>
                <span>
                  <b>{{ 'health.studyKinds.' + study.kind | transloco }}</b>
                  @if (study.area) {
                    {{ study.area }}
                  }
                  @if (study.conclusion) {
                    <span class="hint">· {{ study.conclusion }}</span>
                  }
                </span>
              </div>
            }
            @for (document of documentsOf(data, visit); track document.id) {
              <button matButton class="document" (click)="open(document)">
                <mat-icon>{{
                  document.mimeType === 'application/pdf' ? 'picture_as_pdf' : 'image'
                }}</mat-icon>
                {{ document.name }}
                @if (document.pages > 1) {
                  · {{ 'health.document.pages' | transloco: { count: document.pages } }}
                }
              </button>
            }
            @if (visit.nextVisitOn) {
              <p class="hint">
                {{
                  'health.visit.next' | transloco: { day: (visit.nextVisitOn | date: 'd MMMM y') }
                }}
              </p>
            }

            <div class="actions">
              <button matButton (click)="addDiagnosis(data, visit)">
                <mat-icon>add</mat-icon> {{ 'health.diagnosis.one' | transloco }}
              </button>
              <button matButton (click)="addMedication(data, visit)">
                <mat-icon>add</mat-icon> {{ 'health.medication.one' | transloco }}
              </button>
              <button matButton (click)="addPanel(data, visit)">
                <mat-icon>add</mat-icon> {{ 'health.labs.one' | transloco }}
              </button>
              <button matButton (click)="addStudy(data, visit)">
                <mat-icon>add</mat-icon> {{ 'health.study.one' | transloco }}
              </button>
              <button matButton (click)="addDocument(visit)">
                <mat-icon>add</mat-icon> {{ 'health.document.one' | transloco }}
              </button>
            </div>
          </mat-card-content>
        </mat-card>
      } @empty {
        <p class="hint">
          {{
            (data.visits.length ? 'health.history.nothingFound' : 'health.history.empty')
              | transloco
          }}
        </p>
      }

      @if (looseDocuments().length) {
        <h2 class="section">{{ 'health.history.otherDocuments' | transloco }}</h2>
        @for (document of looseDocuments(); track document.id) {
          <div class="line">
            <button matButton class="document" (click)="open(document)">
              <mat-icon>{{
                document.mimeType === 'application/pdf' ? 'picture_as_pdf' : 'image'
              }}</mat-icon>
              {{ document.name }}
              @if (document.pages > 1) {
                · {{ 'health.document.pages' | transloco: { count: document.pages } }}
              }
            </button>
            <span class="hint">
              {{ 'health.documentKinds.' + document.kind | transloco }}
              @if (document.documentedOn) {
                · {{ document.documentedOn | date: 'd MMM y' }}
              }
            </span>
            <span class="spacer"></span>
            @if (document.hasDraft) {
              <button matButton="tonal" (click)="review(data, document)">
                <mat-icon>fact_check</mat-icon> {{ 'health.drafts.checkOne' | transloco }}
              </button>
            } @else {
              <button
                matIconButton
                [attr.aria-label]="'health.drafts.readWithAi' | transloco"
                [matTooltip]="'health.drafts.readWithAi' | transloco"
                (click)="review(data, document)"
              >
                <mat-icon>auto_awesome</mat-icon>
              </button>
            }
            <button
              matIconButton
              [attr.aria-label]="'core.actions.edit' | transloco"
              (click)="editDocument(data, document)"
            >
              <mat-icon>edit</mat-icon>
            </button>
            <button
              matIconButton
              [attr.aria-label]="'core.actions.delete' | transloco"
              (click)="removeDocument(document)"
            >
              <mat-icon>delete</mat-icon>
            </button>
          </div>
        }
      }
    }
  `,
  styles: `
    .upcoming {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      border-radius: var(--pd-radius);
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .filter {
      width: 180px;
    }
    .spacer {
      flex: 1;
    }
    .visit {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-top: 12px;
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .when {
      font: var(--mat-sys-title-medium);
    }
    .where {
      color: var(--mat-sys-on-surface-variant);
      overflow-wrap: anywhere;
    }
    .text {
      display: flex;
      flex-direction: column;
    }
    .label {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .words {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .recommendation {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .recommendation .words {
      flex: 1;
    }
    .line {
      display: flex;
      align-items: center;
      gap: 8px;
      overflow-wrap: anywhere;
    }
    .line > mat-icon {
      flex-shrink: 0;
      color: var(--mat-sys-primary);
    }
    .document {
      align-self: flex-start;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      border-top: 1px solid var(--pd-border);
      padding-top: 4px;
    }
    .drafts {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-radius: var(--pd-radius-small);
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
    .drafts span {
      flex: 1;
    }
    .section {
      margin: 8px 0 0;
      font: var(--mat-sys-title-small);
    }
    .hint {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
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
  protected readonly texts = ['complaints', 'findings', 'recommendations', 'notes'] as const;
  protected readonly filters = signal<Filters>(NO_FILTERS);

  private readonly allVisits = computed(() => this.data()?.visits ?? []);
  protected readonly countries = computed(() => distinct(this.allVisits().map((v) => v.country)));
  protected readonly specialities = computed(() =>
    distinct(this.allVisits().map((v) => v.speciality)),
  );
  protected readonly doctors = computed(() => this.data()?.doctors ?? []);

  protected readonly visits = computed(() => {
    const { country, speciality, doctorId } = this.filters();
    return this.allVisits().filter(
      (visit) =>
        (!country || visit.country === country) &&
        (!speciality || visit.speciality === speciality) &&
        (!doctorId || visit.doctorId === doctorId),
    );
  });

  /** The nearest visit still ahead that a past visit set, with the days left until it. */
  protected readonly upcoming = computed(() => {
    const today = todayLocalDate();
    const next = this.allVisits()
      .filter((visit) => visit.nextVisitOn && visit.nextVisitOn >= today)
      .sort((a, b) => (a.nextVisitOn ?? '').localeCompare(b.nextVisitOn ?? ''))[0];
    if (!next?.nextVisitOn) {
      return null;
    }
    const days = Math.round(
      (Date.parse(`${next.nextVisitOn}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86_400_000,
    );
    return { visit: next, days };
  });

  /** Documents the AI has read whose drafts wait to be checked. */
  protected readonly drafts = computed(() =>
    (this.data()?.documents ?? []).filter((document) => document.hasDraft),
  );

  protected readonly looseDocuments = computed(() =>
    (this.data()?.documents ?? []).filter((document) => !document.visitId),
  );

  constructor() {
    // `?draft=<document>`: the link of the Telegram reply opens that document's draft.
    effect(() => {
      const data = this.data();
      const id = this.route.snapshot.queryParamMap.get('draft');
      const document = data?.documents.find((d) => d.id === id);
      if (data && id) {
        void this.router.navigate([], { queryParams: { draft: null }, replaceUrl: true });
        if (document) {
          void untracked(() => this.review(data, document));
        }
      }
    });
  }

  protected filter(change: Partial<Filters>): void {
    this.filters.update((filters) => ({ ...filters, ...change }));
  }

  protected doctorName(data: HealthRecord, visit: HealthVisit): string | undefined {
    return data.doctors.find((doctor) => doctor.id === visit.doctorId)?.name;
  }

  protected clinicName(data: HealthRecord, visit: HealthVisit): string | undefined {
    return data.clinics.find((clinic) => clinic.id === visit.clinicId)?.name;
  }

  protected diagnosesOf(data: HealthRecord, visit: HealthVisit) {
    return data.diagnoses.filter((diagnosis) => diagnosis.visitId === visit.id);
  }

  protected medicationsOf(data: HealthRecord, visit: HealthVisit) {
    return data.medications.filter((medication) => medication.visitId === visit.id);
  }

  protected panelsOf(data: HealthRecord, visit: HealthVisit) {
    return data.labPanels.filter((panel) => panel.visitId === visit.id);
  }

  protected studiesOf(data: HealthRecord, visit: HealthVisit) {
    return data.studies.filter((study) => study.visitId === visit.id);
  }

  /** How many lines are out of the laboratory's range; `0` is not shown. */
  protected outOfRange(panel: HealthLabPanel): number {
    return panel.values.filter((line) => line.flag).length;
  }

  protected async addPanel(record: HealthRecord, visit: HealthVisit): Promise<void> {
    if (await this.dialogs.labPanel({ record, visitId: visit.id, day: visit.visitedOn })) {
      this.record.reload();
    }
  }

  protected async addStudy(record: HealthRecord, visit: HealthVisit): Promise<void> {
    if (await this.dialogs.study({ record, visitId: visit.id, day: visit.visitedOn })) {
      this.record.reload();
    }
  }

  protected documentsOf(data: HealthRecord, visit: HealthVisit) {
    return data.documents.filter((document) => document.visitId === visit.id);
  }

  protected async addVisit(): Promise<void> {
    const record = this.data();
    if (record && (await this.dialogs.visit({ record }))) {
      this.record.reload();
    }
  }

  protected async editVisit(record: HealthRecord, visit: HealthVisit): Promise<void> {
    if (await this.dialogs.visit({ record, visit })) {
      this.record.reload();
    }
  }

  protected async removeVisit(visit: HealthVisit): Promise<void> {
    if (await this.dialogs.remove(visit.visitedOn, () => this.api.client.removeVisit(visit.id))) {
      this.record.reload();
    }
  }

  protected async addDiagnosis(record: HealthRecord, visit: HealthVisit): Promise<void> {
    if (await this.dialogs.diagnosis({ record, visitId: visit.id, day: visit.visitedOn })) {
      this.record.reload();
    }
  }

  protected async addMedication(record: HealthRecord, visit: HealthVisit): Promise<void> {
    if (await this.dialogs.medication({ record, visitId: visit.id, day: visit.visitedOn })) {
      this.record.reload();
    }
  }

  protected async addDocument(visit?: HealthVisit): Promise<void> {
    const record = this.data();
    if (
      record &&
      (await this.dialogs.document({ record, visitId: visit?.id, day: visit?.visitedOn }))
    ) {
      this.record.reload();
    }
  }

  protected async editDocument(record: HealthRecord, document: HealthDocument): Promise<void> {
    if (await this.dialogs.document({ record, document })) {
      this.record.reload();
    }
  }

  protected async removeDocument(document: HealthDocument): Promise<void> {
    if (
      await this.dialogs.remove(document.name, () => this.api.client.removeDocument(document.id))
    ) {
      this.record.reload();
    }
  }

  protected async review(record: HealthRecord, document: HealthDocument): Promise<void> {
    if (await this.dialogs.review({ record, document })) {
      this.record.reload();
    }
  }

  /** A recommendation in lines, without the list marks a document puts before them. */
  protected lines(text: string): string[] {
    return text
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim())
      .filter(Boolean);
  }

  /** The line becomes a task of the TODO list (through the core: Health does not know Tasks). */
  protected async toTask(line: string): Promise<void> {
    try {
      await this.api.client.addTask({ title: line });
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
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}
