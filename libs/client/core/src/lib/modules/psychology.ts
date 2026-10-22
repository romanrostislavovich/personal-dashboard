import {
  AppointmentBrief,
  AppointmentBriefInput,
  EventExportFormat,
  GentleDay,
  GentleDayInput,
  GentleStep,
  GentleStepInput,
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
  /** The library of small steps of a gentle day. */
  gentleSteps: () => apiRequest(`${BASE}/gentle/steps`),
  /** The plan of a gentle day; `on` `false` — the mode is off that day. */
  gentleDay: (date: string) => apiRequest(`${BASE}/gentle/day`, { date }),
  briefs: () => apiRequest(`${BASE}/briefs`),
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

    gentleSteps: () => api.read<GentleStep[]>(PSYCHOLOGY_READS.gentleSteps()),
    saveGentleStep: (input: GentleStepInput, id?: string) =>
      id
        ? api.put<GentleStep>(`${BASE}/gentle/steps/${id}`, input)
        : api.post<GentleStep>(`${BASE}/gentle/steps`, input),
    removeGentleStep: (id: string) => api.delete(`${BASE}/gentle/steps/${id}`),
    gentleDay: (date: string) => api.read<GentleDay>(PSYCHOLOGY_READS.gentleDay(date)),
    /** Turns the mode on for the day, or changes its steps. */
    saveGentleDay: (input: GentleDayInput) => api.put<GentleDay>(`${BASE}/gentle/day`, input),
    leaveGentleDay: (date: string) => api.delete(`${BASE}/gentle/day/${date}`),

    briefs: () => api.read<AppointmentBrief[]>(PSYCHOLOGY_READS.briefs()),
    saveBrief: (input: AppointmentBriefInput, id?: string) =>
      id
        ? api.put<AppointmentBrief>(`${BASE}/briefs/${id}`, input)
        : api.post<AppointmentBrief>(`${BASE}/briefs`, input),
    removeBrief: (id: string) => api.delete(`${BASE}/briefs/${id}`),
    /** The brief as a Word document. */
    exportBrief: (id: string) => api.blob(`${BASE}/briefs/${id}/export`),
  };
}
