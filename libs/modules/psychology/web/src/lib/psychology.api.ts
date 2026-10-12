import { httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { PSYCHOLOGY_READS, psychologyApi } from '@pd/client-core';
import {
  EventExportFormat,
  PsychologyAssessment,
  PsychologyAssessmentInput,
  PsychologyEvent,
  PsychologyEventInput,
  PsychologyPatterns,
  PsychologySettings,
  PsychologySettingsInput,
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

  settings() {
    return httpResource<PsychologySettings>(() => PSYCHOLOGY_READS.settings());
  }

  saveSettings(settings: PsychologySettingsInput) {
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
