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
import { ApiClient, apiRequest } from '../api-client';

const BASE = '/api/psychology';

export const PSYCHOLOGY_READS = {
  /** The mood over a period: by weekday, by week, low runs, during the events. */
  patterns: (from: string, to: string) => apiRequest(`${BASE}/patterns`, { from, to }),
  notes: () => apiRequest(`${BASE}/notes`),
  events: () => apiRequest(`${BASE}/events`),
  /** Every filled-in questionnaire, the latest first. */
  assessments: () => apiRequest(`${BASE}/assessments`),
  reflections: () => apiRequest(`${BASE}/reflections`),
  settings: () => apiRequest(`${BASE}/settings`),
};

export function psychologyApi(api: ApiClient) {
  return {
    patterns: (from: string, to: string) =>
      api.read<PsychologyPatterns>(PSYCHOLOGY_READS.patterns(from, to)),

    notes: () => api.read<PsychologyNote[]>(PSYCHOLOGY_READS.notes()),
    saveNote: (input: PsychologyNoteInput, id?: string) =>
      id ? api.put<void>(`${BASE}/notes/${id}`, input) : api.post<void>(`${BASE}/notes`, input),
    removeNote: (id: string) => api.delete(`${BASE}/notes/${id}`),

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

    reflections: () => api.read<PsychologyReflection[]>(PSYCHOLOGY_READS.reflections()),
    /** The questions of this week; written now when there are none (the AI may take a while). */
    reflectOnThisWeek: () => api.post<PsychologyReflection>(`${BASE}/reflections/this-week`, {}),
    answerReflection: (id: string, answers: string[]) =>
      api.put<PsychologyReflection>(`${BASE}/reflections/${id}`, { answers }),
    removeReflection: (id: string) => api.delete(`${BASE}/reflections/${id}`),

    settings: () => api.read<PsychologySettings>(PSYCHOLOGY_READS.settings()),
    saveSettings: (settings: PsychologySettings) => api.put<void>(`${BASE}/settings`, settings),
  };
}

export type PsychologyClient = ReturnType<typeof psychologyApi>;
