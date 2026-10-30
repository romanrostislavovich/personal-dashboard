import {
  TelemetryPage,
  TelemetryQuery,
  telemetryQuerySchema,
  Workstate,
  WorkstateInput,
  WorkstatePage,
  WorkstateQuery,
  WorkstateRestorePlan,
  workstateIdSchema,
  workstateInputSchema,
  workstateQuerySchema,
  workstateRestorePlanSchema,
} from '@pd/contracts';
import {ApiClient, apiRequest} from '../api-client';

const BASE = '/api/activity/workstates';
export const WORKSTATE_CAPTURE_PATH = '/api/activity/ingest/workstates';
export const WORKSTATE_READS = {
  list: (query: WorkstateQuery = {}) =>
    apiRequest(BASE, workstateQuerySchema.parse(query)),
  get: (id: string) => apiRequest(`${BASE}/${workstateIdSchema.parse(id)}`),
};
export const TELEMETRY_READS = {
  list: (query: TelemetryQuery = {}) =>
    apiRequest('/api/activity/telemetry', telemetryQuerySchema.parse(query)),
};

export function workstatesApi(api: ApiClient) {
  return {
    list: (query: WorkstateQuery = {}) =>
      api.read<WorkstatePage>(WORKSTATE_READS.list(query)),
    get: (id: string) => api.read<Workstate>(WORKSTATE_READS.get(id)),
    capture: (input: WorkstateInput) =>
      api.post<Workstate>(BASE, workstateInputSchema.parse(input)),
    restore: async (id: string): Promise<WorkstateRestorePlan> =>
      workstateRestorePlanSchema.parse(
        await api.post<WorkstateRestorePlan>(
          `${BASE}/${workstateIdSchema.parse(id)}/restore`,
          {},
        ),
      ),
    remove: (id: string) =>
      api.delete(`${BASE}/${workstateIdSchema.parse(id)}`),
    clear: () => api.delete(BASE),
    prune: () => api.delete(`${BASE}/expired`),
  };
}

/** Read/delete companion to the existing telemetryApi recorder. */
export function telemetryHistoryApi(api: ApiClient) {
  return {
    list: (query: TelemetryQuery = {}) =>
      api.read<TelemetryPage>(TELEMETRY_READS.list(query)),
    remove: (id: string) =>
      api.delete(`/api/activity/telemetry/${workstateIdSchema.parse(id)}`),
    clear: () => api.delete('/api/activity/telemetry'),
    prune: () => api.delete('/api/activity/telemetry/expired'),
  };
}
