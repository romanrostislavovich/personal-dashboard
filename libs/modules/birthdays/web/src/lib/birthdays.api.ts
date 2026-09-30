import { httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { BIRTHDAYS_READS, birthdaysApi } from '@pd/client-core';
import { BirthdayInput, UpcomingBirthday } from '@pd/contracts';
import { DASHBOARD_CLIENT, fromCore } from '@pd/web-core';

/** The birthday requests of the client core (`@pd/client-core`) for Angular. */
@Injectable({ providedIn: 'root' })
export class BirthdaysApi {
  private readonly birthdays = birthdaysApi(inject(DASHBOARD_CLIENT).api);

  /** Reactive list (upcoming first); call it in a component field. */
  list() {
    return httpResource<UpcomingBirthday[]>(() => BIRTHDAYS_READS.list(), { defaultValue: [] });
  }

  create(input: BirthdayInput) {
    return fromCore(() => this.birthdays.create(input));
  }

  update(id: string, input: BirthdayInput) {
    return fromCore(() => this.birthdays.update(id, input));
  }

  remove(id: string) {
    return fromCore(() => this.birthdays.remove(id));
  }
}
