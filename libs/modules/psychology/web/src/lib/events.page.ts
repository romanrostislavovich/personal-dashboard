import {DatePipe} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {
  EVENT_FEELINGS,
  EventExportFormat,
  EventFeeling,
  eventTouches,
  PsychologyEvent,
} from '@pd/contracts';
import {firstValueFrom} from 'rxjs';
import {PsychologyApi, today} from './psychology.api';
import {EditedAtComponent, ResourceStateComponent} from '@pd/web-core';

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
  return value.trim() !== '' && Number.isInteger(age) && age >= 0 && age <= 120
    ? age
    : null;
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
    ResourceStateComponent,
    EditedAtComponent,
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
  templateUrl: './events.page.html',
  styleUrl: './events.page.scss',
})
export class EventsPage {
  private readonly api = inject(PsychologyApi);
  private readonly transloco = inject(TranslocoService);

  protected readonly feelings = [...EVENT_FEELINGS].reverse();
  protected readonly icons = ICONS;
  protected readonly events = this.api.events();
  private readonly settings = this.api.settings();
  /** Places the events told by age among the dated ones. */
  protected readonly birthYear = computed(
    () => this.settings.value()?.birthYear ?? null,
  );
  protected readonly draft = signal<Draft>({...EMPTY, startedOn: today()});
  protected readonly editing = signal<string | null>(null);
  /** When the event being edited was last changed. */
  protected readonly editedAt = computed(
    () =>
      (this.events.value() ?? []).find(event => event.id === this.editing())
        ?.updatedAt ?? null,
  );
  protected readonly valid = computed(() => {
    const {title, by, startedOn, endedOn, ageFrom, ageTo} = this.draft();
    if (!title.trim()) {
      return false;
    }
    if (by === 'dates') {
      return Boolean(startedOn && (!endedOn || endedOn >= startedOn));
    }
    const [from, to] = [toAge(ageFrom), toAge(ageTo)];
    return (
      from !== null && (ageTo.trim() === '' || (to !== null && to >= from))
    );
  });

  /** The period of the export; empty — everything. */
  protected readonly exportFrom = signal('');
  protected readonly exportTo = signal('');
  protected readonly exporting = signal(false);
  /** How many events the export will hold: those that touch the period. */
  protected readonly inPeriod = computed(() => {
    const period = {
      from: this.exportFrom() || undefined,
      to: this.exportTo() || undefined,
    };
    return this.events
      .value()
      .filter(event => eventTouches(event, this.birthYear(), period)).length;
  });

  protected set(change: Partial<Draft>): void {
    this.draft.update(draft => ({...draft, ...change}));
  }

  protected async save(): Promise<void> {
    const {
      title,
      description,
      by,
      startedOn,
      endedOn,
      ageFrom,
      ageTo,
      feeling,
    } = this.draft();
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
    window.scrollTo({top: 0, behavior: 'smooth'});
  }

  protected cancel(): void {
    this.editing.set(null);
    this.draft.set({...EMPTY, startedOn: today()});
  }

  /** `3`, or `6–9` for several years of life. */
  protected ages(event: PsychologyEvent): string {
    return event.ageTo === null
      ? `${event.ageFrom}`
      : `${event.ageFrom}–${event.ageTo}`;
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
    if (
      year !== null &&
      !(Number.isInteger(year) && year >= 1900 && year <= 2100)
    ) {
      return;
    }
    await firstValueFrom(this.api.saveSettings({birthYear: year}));
    this.settings.reload();
    this.events.reload(); // The order depends on it.
  }

  protected async remove(event: PsychologyEvent): Promise<void> {
    if (
      confirm(
        this.transloco.translate('psychology.events.confirmDelete', {
          title: event.title,
        }),
      )
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
        this.api.exportEvents(
          format,
          this.exportFrom() || undefined,
          this.exportTo() || undefined,
        ),
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
