import {DatePipe} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {AppointmentBrief, eventTouches} from '@pd/contracts';
import {firstValueFrom} from 'rxjs';
import {localDate, PsychologyApi, today} from '../psychology.api';

interface Draft {
  title: string;
  appointmentOn: string;
  from: string;
  to: string;
  eventIds: string[];
  assessmentIds: string[];
  changes: string;
  /** One question a line. */
  questions: string;
  notes: string;
}

function emptyDraft(from: string): Draft {
  return {
    title: '',
    appointmentOn: '',
    from,
    to: today(),
    eventIds: [],
    assessmentIds: [],
    changes: '',
    questions: '',
    notes: '',
  };
}

/** A month back: the usual time between two appointments when there was none before. */
function monthAgo(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return localDate(date);
}

/**
 * Briefs for an appointment with a specialist: a period, the questionnaires and events of it
 * picked one by one, what changed, the questions and one's own notes — saved, and exported as
 * a Word document by hand. An organizer of one's own records; nothing is concluded from them.
 */
@Component({
  selector: 'pd-psychology-briefs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    TranslocoPipe,
  ],
  template: `
    <p class="hint">{{ 'psychology.brief.about' | transloco }}</p>

    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>
          {{
            (editing() ? 'psychology.brief.edit' : 'psychology.brief.add')
              | transloco
          }}
        </mat-card-title>
      </mat-card-header>
      <mat-card-content class="form">
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>{{ 'psychology.brief.title' | transloco }}</mat-label>
          <input
            matInput
            maxlength="200"
            [placeholder]="'psychology.brief.titleHint' | transloco"
            [value]="draft().title"
            (input)="set({title: $any($event.target).value})"
          />
        </mat-form-field>
        <div class="row">
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{
              'psychology.brief.appointmentOn' | transloco
            }}</mat-label>
            <input
              matInput
              type="date"
              [value]="draft().appointmentOn"
              (change)="set({appointmentOn: $any($event.target).value})"
            />
          </mat-form-field>
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'psychology.brief.from' | transloco }}</mat-label>
            <input
              matInput
              type="date"
              [value]="draft().from"
              (change)="set({from: $any($event.target).value})"
            />
          </mat-form-field>
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'psychology.brief.to' | transloco }}</mat-label>
            <input
              matInput
              type="date"
              [min]="draft().from"
              [value]="draft().to"
              (change)="set({to: $any($event.target).value})"
            />
          </mat-form-field>
        </div>

        <h3>{{ 'psychology.brief.checkups' | transloco }}</h3>
        @for (item of checkupsInPeriod(); track item.id) {
          <mat-checkbox
            [checked]="pickedCheckups().includes(item.id)"
            (change)="pick('assessmentIds', item.id, $event.checked)"
          >
            {{ item.takenOn | date: 'd MMM y' }} ·
            {{ 'psychology.tests.' + item.test + '.name' | transloco }} ·
            {{ item.score }} ·
            {{
              'psychology.tests.' + item.test + '.bands.' + item.band
                | transloco
            }}
          </mat-checkbox>
        } @empty {
          <p class="hint">{{ 'psychology.brief.noCheckups' | transloco }}</p>
        }

        <h3>{{ 'psychology.brief.events' | transloco }}</h3>
        @for (event of eventsInPeriod(); track event.id) {
          <mat-checkbox
            [checked]="draft().eventIds.includes(event.id)"
            (change)="pick('eventIds', event.id, $event.checked)"
          >
            {{ event.startedOn ? (event.startedOn | date: 'd MMM y') : '' }} ·
            {{ event.title }}
          </mat-checkbox>
        } @empty {
          <p class="hint">{{ 'psychology.brief.noEvents' | transloco }}</p>
        }

        <mat-form-field subscriptSizing="dynamic">
          <mat-label>{{ 'psychology.brief.changes' | transloco }}</mat-label>
          <textarea
            matInput
            rows="4"
            maxlength="5000"
            [placeholder]="'psychology.brief.changesHint' | transloco"
            [value]="draft().changes"
            (input)="set({changes: $any($event.target).value})"
          ></textarea>
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>{{ 'psychology.brief.questions' | transloco }}</mat-label>
          <textarea
            matInput
            rows="4"
            [placeholder]="'psychology.brief.questionsHint' | transloco"
            [value]="draft().questions"
            (input)="set({questions: $any($event.target).value})"
          ></textarea>
          <mat-hint>{{ 'psychology.brief.onePerLine' | transloco }}</mat-hint>
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>{{ 'psychology.brief.notes' | transloco }}</mat-label>
          <textarea
            matInput
            rows="3"
            maxlength="5000"
            [value]="draft().notes"
            (input)="set({notes: $any($event.target).value})"
          ></textarea>
        </mat-form-field>
      </mat-card-content>
      <mat-card-actions align="end">
        @if (editing()) {
          <button matButton (click)="cancel()">
            {{ 'core.actions.cancel' | transloco }}
          </button>
        }
        <button
          matButton="filled"
          [disabled]="!valid() || busy()"
          (click)="save()"
        >
          {{
            (editing() ? 'core.actions.save' : 'core.actions.add') | transloco
          }}
        </button>
      </mat-card-actions>
    </mat-card>

    @for (brief of briefs.value(); track brief.id) {
      <mat-card appearance="outlined">
        <mat-card-content class="brief">
          <div class="body">
            <strong>{{ brief.title }}</strong>
            <span class="hint">
              {{ brief.from | date: 'd MMM y' }} –
              {{ brief.to | date: 'd MMM y' }}
              @if (brief.appointmentOn) {
                · {{ 'psychology.brief.appointmentOn' | transloco }}:
                {{ brief.appointmentOn | date: 'd MMM y' }}
              }
            </span>
            <span class="hint">
              {{
                'psychology.brief.counts'
                  | transloco
                    : {
                        checkups: brief.assessmentIds.length,
                        events: brief.eventIds.length,
                        questions: brief.questions.length,
                      }
              }}
            </span>
          </div>
          <button matButton="tonal" [disabled]="busy()" (click)="export(brief)">
            <mat-icon>download</mat-icon>
            {{ 'psychology.brief.export' | transloco }}
          </button>
          <button
            matIconButton
            [attr.aria-label]="'core.actions.edit' | transloco"
            (click)="edit(brief)"
          >
            <mat-icon>edit</mat-icon>
          </button>
          <button
            matIconButton
            [attr.aria-label]="'core.actions.delete' | transloco"
            (click)="remove(brief)"
          >
            <mat-icon>delete</mat-icon>
          </button>
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-top: 12px;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    h3 {
      margin: 8px 0 0;
      font: var(--mat-sys-title-small);
    }
    .brief {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      padding-top: 16px;
    }
    .body {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 200px;
      overflow-wrap: anywhere;
    }
    .hint {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class BriefsPage {
  private readonly api = inject(PsychologyApi);
  private readonly transloco = inject(TranslocoService);

  protected readonly briefs = this.api.briefs();
  private readonly events = this.api.events();
  private readonly assessments = this.api.assessments();
  private readonly settings = this.api.settings();

  protected readonly draft = signal<Draft>(emptyDraft(monthAgo()));
  protected readonly editing = signal<string | null>(null);
  protected readonly busy = signal(false);
  /** The questionnaires of a new brief start picked; the user unticks what is not for here. */
  private readonly fresh = signal(true);

  protected readonly valid = computed(() => {
    const {title, from, to} = this.draft();
    return Boolean(title.trim() && from && to && to >= from);
  });

  protected readonly checkupsInPeriod = computed(() => {
    const {from, to} = this.draft();
    return this.assessments
      .value()
      .filter(item => item.takenOn >= from && item.takenOn <= to)
      .sort((a, b) => a.takenOn.localeCompare(b.takenOn));
  });

  protected readonly eventsInPeriod = computed(() => {
    const {from, to} = this.draft();
    const birthYear = this.settings.value()?.birthYear ?? null;
    return this.events
      .value()
      .filter(event => eventTouches(event, birthYear, {from, to}));
  });

  /** The questionnaires ticked: all of the period while a new brief is untouched. */
  protected readonly pickedCheckups = computed(() =>
    this.fresh()
      ? this.checkupsInPeriod().map(item => item.id)
      : this.draft().assessmentIds,
  );

  protected set(change: Partial<Draft>): void {
    this.draft.update(draft => ({...draft, ...change}));
  }

  protected pick(
    field: 'eventIds' | 'assessmentIds',
    id: string,
    checked: boolean,
  ): void {
    const base =
      field === 'assessmentIds' ? this.pickedCheckups() : this.draft().eventIds;
    this.fresh.set(false);
    this.draft.update(draft => ({
      ...draft,
      [field]: checked ? [...base, id] : base.filter(item => item !== id),
    }));
  }

  /** What is picked and still in the period goes into the brief. */
  private chosen(): {eventIds: string[]; assessmentIds: string[]} {
    const checkups = new Set(this.checkupsInPeriod().map(item => item.id));
    const events = new Set(this.eventsInPeriod().map(event => event.id));
    return {
      assessmentIds: this.pickedCheckups().filter(id => checkups.has(id)),
      eventIds: this.draft().eventIds.filter(id => events.has(id)),
    };
  }

  protected async save(): Promise<void> {
    const draft = this.draft();
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.api.saveBrief(
          {
            title: draft.title.trim(),
            appointmentOn: draft.appointmentOn || null,
            from: draft.from,
            to: draft.to,
            ...this.chosen(),
            changes: draft.changes.trim(),
            questions: draft.questions
              .split('\n')
              .map(line => line.trim())
              .filter(Boolean),
            notes: draft.notes.trim(),
          },
          this.editing() ?? undefined,
        ),
      );
      this.cancel();
      this.briefs.reload();
    } finally {
      this.busy.set(false);
    }
  }

  protected edit(brief: AppointmentBrief): void {
    this.editing.set(brief.id);
    this.fresh.set(false);
    this.draft.set({
      title: brief.title,
      appointmentOn: brief.appointmentOn ?? '',
      from: brief.from,
      to: brief.to,
      eventIds: brief.eventIds,
      assessmentIds: brief.assessmentIds,
      changes: brief.changes,
      questions: brief.questions.join('\n'),
      notes: brief.notes,
    });
    window.scrollTo({top: 0, behavior: 'smooth'});
  }

  /** A new brief starts where the last one ended: the time since the last appointment. */
  protected cancel(): void {
    this.editing.set(null);
    this.fresh.set(true);
    this.draft.set(emptyDraft(this.briefs.value()[0]?.to ?? monthAgo()));
  }

  protected async remove(brief: AppointmentBrief): Promise<void> {
    if (
      confirm(
        this.transloco.translate('psychology.brief.confirmDelete', {
          title: brief.title,
        }),
      )
    ) {
      await firstValueFrom(this.api.removeBrief(brief.id));
      this.briefs.reload();
    }
  }

  protected async export(brief: AppointmentBrief): Promise<void> {
    this.busy.set(true);
    try {
      const blob = await firstValueFrom(this.api.exportBrief(brief.id));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `brief-${brief.appointmentOn ?? brief.to}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      this.busy.set(false);
    }
  }
}
