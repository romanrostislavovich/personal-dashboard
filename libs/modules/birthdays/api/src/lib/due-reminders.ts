import { UpcomingBirthday } from '@pd/contracts';

/**
 * What a reminder is about:
 * - `birthday` — a birthday to congratulate on, today or in a few days;
 * - `birthday-in-memory` — the birthday of someone who has died;
 * - `memorial` — a day of memory, today or in a few days.
 */
export interface DueReminder {
  kind: 'birthday' | 'birthday-in-memory' | 'memorial';
  person: UpcomingBirthday;
}

/**
 * The reminders to send this morning. A birthday of someone who has died is told on the day
 * only, and in other words: there is nothing to prepare and nobody to congratulate.
 */
export function dueReminders(people: UpcomingBirthday[]): DueReminder[] {
  const due: DueReminder[] = [];
  for (const person of people) {
    if (person.daysUntil !== null) {
      if (person.memorial) {
        if (person.daysUntil === 0) {
          due.push({ kind: 'birthday-in-memory', person });
        }
      } else if (person.remindDaysBefore.includes(person.daysUntil)) {
        due.push({ kind: 'birthday', person });
      }
    }
    if (person.memorial && person.memorialRemindDaysBefore.includes(person.memorial.daysUntil)) {
      due.push({ kind: 'memorial', person });
    }
  }
  return due;
}
