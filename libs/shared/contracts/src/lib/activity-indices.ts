import {LocalDate} from './local-date';

/** Links v2's indices of the days kept by the server (activity_day_indices), in short. */
export interface ActivityIndex {
  /** `deepWork`, `phone.restlessness`… (its Links key is `activity.index.<key>`). */
  key: string;
  unit: 'hours' | 'count' | 'score' | 'percent';
  /** `null` — nothing counted today yet. */
  today: number | null;
  /** The average of the 7 days before today with a value (today, half counted, left out). */
  week: number | null;
  /** The owner's own norm: the median of the 28 days before those 7. */
  norm: number | null;
}

export interface ActivityIndices {
  today: LocalDate;
  /** In a fixed order: the main ones first. */
  indices: ActivityIndex[];
}
