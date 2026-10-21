import { TelemetryBucket, telemetryIngestSchema } from '@pd/contracts';
import { ApiClient } from '../api-client';

export const TELEMETRY_INGEST_PATH = '/api/activity/ingest/telemetry';

export function telemetryApi(api: ApiClient) {
  return {
    record: (buckets: TelemetryBucket[]) =>
      api.post<{ saved: number }>(
        '/api/activity/telemetry',
        telemetryIngestSchema.parse({ buckets }),
      ),
  };
}
