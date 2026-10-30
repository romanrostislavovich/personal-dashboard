import {Habit, HabitDayInput, HabitInput} from '@pd/contracts';
import {ApiClient, apiRequest} from '../api-client';

const BASE = '/api/habits';

export const HABITS_READS = {
  /** Every habit with its numbers and the marks of the last weeks. */
  list: () => apiRequest(BASE),
};

export function habitsApi(api: ApiClient) {
  return {
    list: () => api.read<Habit[]>(HABITS_READS.list()),
    create: (input: HabitInput) => api.post<Habit>(BASE, input),
    update: (id: string, input: HabitInput) =>
      api.put<Habit>(`${BASE}/${id}`, input),
    remove: (id: string) => api.delete(`${BASE}/${id}`),
    /** A day with it (and how much) or clean. */
    mark: (id: string, day: string, input: HabitDayInput) =>
      api.put<Habit>(`${BASE}/${id}/days/${day}`, input),
    /** The mark taken off: the day counts as clean again. */
    unmark: (id: string, day: string) =>
      api.delete<Habit>(`${BASE}/${id}/days/${day}`),
  };
}
