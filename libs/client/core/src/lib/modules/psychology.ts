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
import { ApiClient, apiRequest } from '../api-client';

const BASE = '/api/psychology';

export const PSYCHOLOGY_READS = {
  /** The mood over a period: by weekday, by week, low runs, during the events. */
  patterns: (from: string, to: string) => apiRequest(`${BASE}/patterns`, { from, to }),
  events: () => apiRequest(`${BASE}/events`),
  /** Every filled-in questionnaire, the latest first. */
  assessments: () => apiRequest(`${BASE}/assessments`),
  settings: () => apiRequest(`${BASE}/settings`),
};

export function psychologyApi(api: ApiClient) {
  return {
    patterns: (from: string, to: string) =>
      api.read<PsychologyPatterns>(PSYCHOLOGY_READS.patterns(from, to)),

    events: () => api.read<PsychologyEvent[]>(PSYCHOLOGY_READS.events()),
    saveEvent: (input: PsychologyEventInput, id?: string) =>
      id
        ? api.put<PsychologyEvent>(`${BASE}/events/${id}`, input)
        : api.post<PsychologyEvent>(`${BASE}/events`, input),
    removeEvent: (id: string) => api.delete(`${BASE}/events/${id}`),
    /** The events that touch the period as an Excel workbook or a Word document. */
    exportEvents: (format: EventExportFormat, from?: string, to?: string) => {
      const query = new URLSearchParams({ format, ...(from && { from }), ...(to && { to }) });
      return api.blob(`${BASE}/events/export?${query}`);
    },

    assessments: () => api.read<PsychologyAssessment[]>(PSYCHOLOGY_READS.assessments()),
    addAssessment: (input: PsychologyAssessmentInput) =>
      api.post<PsychologyAssessment>(`${BASE}/assessments`, input),
    removeAssessment: (id: string) => api.delete(`${BASE}/assessments/${id}`),

    settings: () => api.read<PsychologySettings>(PSYCHOLOGY_READS.settings()),
    saveSettings: (settings: PsychologySettingsInput) =>
      api.put<void>(`${BASE}/settings`, settings),
  };
}

export type PsychologyClient = ReturnType<typeof psychologyApi>;
