import { httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { PSYCHOLOGY_READS, psychologyApi } from '@pd/client-core';
import {
  EventExportFormat,
  PsychologyAssessment,
  PsychologyAssessmentInput,
  PsychologyEvent,
  PsychologyEventInput,
  PsychologyNote,
  PsychologyNoteInput,
  PsychologyPatterns,
  PsychologyReflection,
  PsychologySettings,
} from '@pd/contracts';
import { DASHBOARD_CLIENT, fromCore } from '@pd/web-core';

/** The Psychology requests of the client core (`@pd/client-core`) for Angular. */
@Injectable({ providedIn: 'root' })
export class PsychologyApi {
  private readonly psychology = psychologyApi(inject(DASHBOARD_CLIENT).api);

  patterns(period: () => { from: string; to: string }) {
    return httpResource<PsychologyPatterns>(() =>
      PSYCHOLOGY_READS.patterns(period().from, period().to),
    );
  }

  notes() {
    return httpResource<PsychologyNote[]>(() => PSYCHOLOGY_READS.notes(), { defaultValue: [] });
  }

  saveNote(input: PsychologyNoteInput, id?: string) {
    return fromCore(() => this.psychology.saveNote(input, id));
  }

  removeNote(id: string) {
    return fromCore(() => this.psychology.removeNote(id));
  }

  events() {
    return httpResource<PsychologyEvent[]>(() => PSYCHOLOGY_READS.events(), { defaultValue: [] });
  }

  saveEvent(input: PsychologyEventInput, id?: string) {
    return fromCore(() => this.psychology.saveEvent(input, id));
  }

  removeEvent(id: string) {
    return fromCore(() => this.psychology.removeEvent(id));
  }

  exportEvents(format: EventExportFormat, from?: string, to?: string) {
    return fromCore(() => this.psychology.exportEvents(format, from, to));
  }

  assessments() {
    return httpResource<PsychologyAssessment[]>(() => PSYCHOLOGY_READS.assessments(), {
      defaultValue: [],
    });
  }

  addAssessment(input: PsychologyAssessmentInput) {
    return fromCore(() => this.psychology.addAssessment(input));
  }

  removeAssessment(id: string) {
    return fromCore(() => this.psychology.removeAssessment(id));
  }

  reflections() {
    return httpResource<PsychologyReflection[]>(() => PSYCHOLOGY_READS.reflections(), {
      defaultValue: [],
    });
  }

  reflectOnThisWeek() {
    return fromCore(() => this.psychology.reflectOnThisWeek());
  }

  answerReflection(id: string, answers: string[]) {
    return fromCore(() => this.psychology.answerReflection(id, answers));
  }

  removeReflection(id: string) {
    return fromCore(() => this.psychology.removeReflection(id));
  }

  settings() {
    return httpResource<PsychologySettings>(() => PSYCHOLOGY_READS.settings());
  }

  saveSettings(settings: PsychologySettings) {
    return fromCore(() => this.psychology.saveSettings(settings));
  }
}

/** Today as `YYYY-MM-DD` on the user's own clock. */
export function today(): string {
  return localDate(new Date());
}

export function localDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
