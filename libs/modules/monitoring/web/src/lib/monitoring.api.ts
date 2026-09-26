import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Monitor, MonitorInput } from '@pd/contracts';

const BASE = '/api/monitoring';

@Injectable({ providedIn: 'root' })
export class MonitoringApi {
  private readonly http = inject(HttpClient);

  monitors() {
    return httpResource<Monitor[]>(() => `${BASE}/monitors`, { defaultValue: [] });
  }

  add(input: MonitorInput) {
    return this.http.post<void>(`${BASE}/monitors`, input);
  }

  remove(id: string) {
    return this.http.delete<void>(`${BASE}/monitors/${id}`);
  }
}
