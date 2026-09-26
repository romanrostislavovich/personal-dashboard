import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { BirthdayInput, UpcomingBirthday } from '@pd/contracts';

@Injectable({ providedIn: 'root' })
export class BirthdaysApi {
  private readonly http = inject(HttpClient);

  /** Реактивный список (ближайшие — первыми); вызывать в поле компонента. */
  list() {
    return httpResource<UpcomingBirthday[]>(() => '/api/birthdays', { defaultValue: [] });
  }

  create(input: BirthdayInput) {
    return this.http.post<UpcomingBirthday>('/api/birthdays', input);
  }

  update(id: string, input: BirthdayInput) {
    return this.http.put<UpcomingBirthday>(`/api/birthdays/${id}`, input);
  }

  remove(id: string) {
    return this.http.delete<void>(`/api/birthdays/${id}`);
  }
}
