import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  EVENT_FEELINGS,
  EventExportFormat,
  EventFeeling,
  eventTouches,
  PsychologyEvent,
} from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { PsychologyApi, today } from './psychology.api';

const ICONS: Record<string, string> = {
  '-2': 'sentiment_very_dissatisfied',
  '-1': 'sentiment_dissatisfied',
  '0': 'sentiment_neutral',
  '1': 'sentiment_satisfied',
  '2': 'sentiment_very_satisfied',
};

interface Draft {
  title: string;
  description: string;
  /** How the time of the event is told: by dates, or by the age it happened at. */
  by: 'dates' | 'age';
  startedOn: string;
  endedOn: string;
  ageFrom: string;
  ageTo: string;
  feeling: EventFeeling;
}

const EMPTY: Draft = {
  title: '',
  description: '',
  by: 'dates',
  startedOn: '',
  endedOn: '',
  ageFrom: '',
  ageTo: '',
  feeling: 0,
};

/** An age as it was typed: a whole number of years, or `null`. */
function toAge(value: string): number | null {
  const age = Number(value);
  return value.trim() !== '' && Number.isInteger(age) && age >= 0 && age <= 120 ? age : null;
}

/**
 * The events of a life: what happened and over which period — a move, an illness, a new job —
 * or at which age, for what is remembered without dates.
 * The list of a period can be saved as an Excel workbook or a Word document.
 */
@Component({
  selector: 'pd-psychology-events-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>
          {{ (editing() ? 'psychology.events.edit' : 'psychology.events.add') | transloco }}
        </mat-card-title>
      </mat-card-header>
      <mat-card-content class="form">
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>{{ 'psychology.events.title' | transloco }}</mat-label>
          <input
            matInput
            maxlength="200"
            [value]="draft().title"
            (input)="set({ title: $any($event.target).value })"
          />
        </mat-form-field>
        <mat-button-toggle-group
          hideSingleSelectionIndicator
          [attr.aria-label]="'psychology.events.when' | transloco"
          [value]="draft().by"
          (change)="set({ by: $event.value })"
        >
          <mat-button-toggle value="dates">
            {{ 'psychology.events.byDates' | transloco }}
          </mat-button-toggle>
          <mat-button-toggle value="age">
            {{ 'psychology.events.byAge' | transloco }}
          </mat-button-toggle>
        </mat-button-toggle-group>
        <div class="row">
          @if (draft().by === 'dates') {
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ 'psychology.events.from' | transloco }}</mat-label>
              <input
                matInput
                type="date"
                [value]="draft().startedOn"
                (change)="set({ startedOn: $any($event.target).value })"
              />
            </mat-form-field>
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ 'psychology.events.to' | transloco }}</mat-label>
              <input
                matInput
                type="date"
                [value]="draft().endedOn"
                [min]="draft().startedOn"
                (change)="set({ endedOn: $any($event.target).value })"
              />
              <mat-hint>{{ 'psychology.events.toHint' | transloco }}</mat-hint>
            </mat-form-field>
          } @else {
            <mat-form-field subscriptSizing="dynamic" class="age">
              <mat-label>{{ 'psychology.events.ageFrom' | transloco }}</mat-label>
              <input
                matInput
                type="number"
                min="0"
                max="120"
                [value]="draft().ageFrom"
                (input)="set({ ageFrom: $any($event.target).value })"
              />
              <mat-hint>{{ 'psychology.events.ageHint' | transloco }}</mat-hint>
            </mat-form-field>
            <mat-form-field subscriptSizing="dynamic" class="age">
              <mat-label>{{ 'psychology.events.ageTo' | transloco }}</mat-label>
              <input
                matInput
                type="number"
                min="0"
                max="120"
                [value]="draft().ageTo"
                (input)="set({ ageTo: $any($event.target).value })"
              />
              <mat-hint>{{ 'psychology.events.ageToHint' | transloco }}</mat-hint>
            </mat-form-field>
          }
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'psychology.events.feeling' | transloco }}</mat-label>
            <mat-select
              [value]="draft().feeling"
              (selectionChange)="set({ feeling: $event.value })"
            >
              @for (feeling of feelings; track feeling) {
                <mat-option [value]="feeling">
                  {{ 'psychology.feelings.' + feeling | transloco }}
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>{{ 'psychology.events.description' | transloco }}</mat-label>
          <textarea
            matInput
            rows="3"
            maxlength="5000"
            [value]="draft().description"
            (input)="set({ description: $any($event.target).value })"
          ></textarea>
        </mat-form-field>
        @if (draft().by === 'age') {
          <mat-form-field subscriptSizing="dynamic" class="birth">
            <mat-label>{{ 'psychology.events.birthYear' | transloco }}</mat-label>
            <input
              matInput
              type="number"
              min="1900"
              max="2100"
              [value]="birthYear() ?? ''"
              (change)="setBirthYear($any($event.target).value)"
            />
            <mat-hint>{{ 'psychology.events.birthYearHint' | transloco }}</mat-hint>
          </mat-form-field>
        }
      </mat-card-content>
      <mat-card-actions align="end">
        @if (editing()) {
          <button matButton (click)="cancel()">{{ 'core.actions.cancel' | transloco }}</button>
        }
        <button matButton="filled" [disabled]="!valid()" (click)="save()">
          {{ (editing() ? 'core.actions.save' : 'core.actions.add') | transloco }}
        </button>
      </mat-card-actions>
    </mat-card>

    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{ 'psychology.events.export' | transloco }}</mat-card-title>
        <mat-card-subtitle>{{ 'psychology.events.exportHint' | transloco }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content class="row padded">
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>{{ 'psychology.events.from' | transloco }}</mat-label>
          <input
            matInput
            type="date"
            [value]="exportFrom()"
            (change)="exportFrom.set($any($event.target).value)"
          />
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>{{ 'psychology.events.to' | transloco }}</mat-label>
          <input
            matInput
            type="date"
            [value]="exportTo()"
            [min]="exportFrom()"
            (change)="exportTo.set($any($event.target).value)"
          />
        </mat-form-field>
        <button matButton="tonal" [disabled]="exporting()" (click)="export('xlsx')">
          <mat-icon>table_view</mat-icon> Excel
        </button>
        <button matButton="tonal" [disabled]="exporting()" (click)="export('docx')">
          <mat-icon>description</mat-icon> Word
        </button>
        <span class="hint">
          {{ 'psychology.events.inPeriod' | transloco: { count: inPeriod() } }}
        </span>
      </mat-card-content>
    </mat-card>

    @for (event of events.value(); track event.id) {
      <mat-card appearance="outlined">
        <mat-card-content class="event">
          <mat-icon
            [class.hard]="event.feeling < 0"
            [class.good]="event.feeling > 0"
            [attr.aria-label]="'psychology.feelings.' + event.feeling | transloco"
          >
            {{ icons[event.feeling] }}
          </mat-icon>
          <span class="body">
            <b>{{ event.title }}</b>
            <span class="hint">
              @if (event.startedOn) {
                {{ event.startedOn | date: 'd MMM y' }}
                @if (event.endedOn) {
                  – {{ event.endedOn | date: 'd MMM y' }}
                }
              } @else {
                {{ 'psychology.events.age' | transloco: { age: ages(event) } }}
                @if (years(event); as years) {
                  · ≈ {{ years }}
                }
              }
            </span>
            @if (event.description) {
              <span class="words">{{ event.description }}</span>
            }
          </span>
          <button
            matIconButton
            [attr.aria-label]="'core.actions.edit' | transloco"
            (click)="edit(event)"
          >
            <mat-icon>edit</mat-icon>
          </button>
          <button
            matIconButton
            [attr.aria-label]="'core.actions.delete' | transloco"
            (click)="remove(event)"
          >
            <mat-icon>delete</mat-icon>
          </button>
        </mat-card-content>
      </mat-card>
    } @empty {
      @if (!events.isLoading()) {
        <p class="hint">{{ 'psychology.events.empty' | transloco }}</p>
      }
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
      align-items: center;
      gap: 12px;
    }
    .padded {
      padding-top: 12px;
    }
    mat-button-toggle-group {
      align-self: flex-start;
    }
    .form .row {
      align-items: flex-start;
    }
    .age {
      width: 220px;
    }
    .birth {
      align-self: flex-start;
      width: min(100%, 372px);
    }
    .event {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding-top: 16px;
    }
    .event > mat-icon {
      color: var(--mat-sys-on-surface-variant);
    }
    .event > mat-icon.hard {
      color: var(--mat-sys-error);
    }
    .event > mat-icon.good {
      color: var(--pd-success);
    }
    .body {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .words {
      white-space: pre-wrap;
    }
    .hint {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class EventsPage {
  private readonly api = inject(PsychologyApi);
  private readonly transloco = inject(TranslocoService);

  protected readonly feelings = [...EVENT_FEELINGS].reverse();
  protected readonly icons = ICONS;
  protected readonly events = this.api.events();
  private readonly settings = this.api.settings();
  /** Places the events told by age among the dated ones. */
  protected readonly birthYear = computed(() => this.settings.value()?.birthYear ?? null);
  protected readonly draft = signal<Draft>({ ...EMPTY, startedOn: today() });
  protected readonly editing = signal<string | null>(null);
  protected readonly valid = computed(() => {
    const { title, by, startedOn, endedOn, ageFrom, ageTo } = this.draft();
    if (!title.trim()) {
      return false;
    }
    if (by === 'dates') {
      return Boolean(startedOn && (!endedOn || endedOn >= startedOn));
    }
    const [from, to] = [toAge(ageFrom), toAge(ageTo)];
    return from !== null && (ageTo.trim() === '' || (to !== null && to >= from));
  });

  /** The period of the export; empty — everything. */
  protected readonly exportFrom = signal('');
  protected readonly exportTo = signal('');
  protected readonly exporting = signal(false);
  /** How many events the export will hold: those that touch the period. */
  protected readonly inPeriod = computed(() => {
    const period = { from: this.exportFrom() || undefined, to: this.exportTo() || undefined };
    return this.events.value().filter((event) => eventTouches(event, this.birthYear(), period))
      .length;
  });

  protected set(change: Partial<Draft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  protected async save(): Promise<void> {
    const { title, description, by, startedOn, endedOn, ageFrom, ageTo, feeling } = this.draft();
    await firstValueFrom(
      this.api.saveEvent(
        {
          title: title.trim(),
          description: description.trim() || null,
          // One way of telling the time only: the other is cleared.
          startedOn: by === 'dates' ? startedOn : null,
          endedOn: by === 'dates' ? endedOn || null : null,
          ageFrom: by === 'age' ? toAge(ageFrom) : null,
          ageTo: by === 'age' ? toAge(ageTo) : null,
          feeling,
        },
        this.editing() ?? undefined,
      ),
    );
    this.cancel();
    this.events.reload();
  }

  protected edit(event: PsychologyEvent): void {
    this.editing.set(event.id);
    this.draft.set({
      title: event.title,
      description: event.description ?? '',
      by: event.startedOn ? 'dates' : 'age',
      startedOn: event.startedOn ?? '',
      endedOn: event.endedOn ?? '',
      ageFrom: event.ageFrom?.toString() ?? '',
      ageTo: event.ageTo?.toString() ?? '',
      feeling: event.feeling,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected cancel(): void {
    this.editing.set(null);
    this.draft.set({ ...EMPTY, startedOn: today() });
  }

  /** `3`, or `6–9` for several years of life. */
  protected ages(event: PsychologyEvent): string {
    return event.ageTo === null ? `${event.ageFrom}` : `${event.ageFrom}–${event.ageTo}`;
  }

  /** The calendar years of an age, when the year of birth is known: a year of life lies across two. */
  protected years(event: PsychologyEvent): string {
    const born = this.birthYear();
    return born === null || event.ageFrom === null
      ? ''
      : `${born + event.ageFrom}–${born + (event.ageTo ?? event.ageFrom) + 1}`;
  }

  /** An empty field forgets the year; one that is not a year is left as it was. */
  protected async setBirthYear(value: string): Promise<void> {
    const year = value.trim() === '' ? null : Number(value);
    if (year !== null && !(Number.isInteger(year) && year >= 1900 && year <= 2100)) {
      return;
    }
    await firstValueFrom(this.api.saveSettings({ birthYear: year }));
    this.settings.reload();
    this.events.reload(); // The order depends on it.
  }

  protected async remove(event: PsychologyEvent): Promise<void> {
    if (
      confirm(this.transloco.translate('psychology.events.confirmDelete', { title: event.title }))
    ) {
      await firstValueFrom(this.api.removeEvent(event.id));
      this.events.reload();
    }
  }

  /** Asks the server for the file and hands it to the browser as a download. */
  protected async export(format: EventExportFormat): Promise<void> {
    this.exporting.set(true);
    try {
      const blob = await firstValueFrom(
        this.api.exportEvents(format, this.exportFrom() || undefined, this.exportTo() || undefined),
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `events-${today()}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      this.exporting.set(false);
    }
  }
}
