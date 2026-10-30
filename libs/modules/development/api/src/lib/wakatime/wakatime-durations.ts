/** What a stretch of coding is told by: the project it was on, or the computer. */
export type WakatimeSlice = 'project' | 'machine';

/** A stretch of coding: WakaTime joins the editor's heartbeats into these. */
export interface WakatimeDuration {
  name: string;
  startedAt: Date;
  endedAt: Date;
}

/** One stretch of the durations answer (only the fields we use). */
export interface RawDuration {
  project?: string | null;
  /** With `slice_by=machine`: the computer, as the id of its machine name. */
  machine_name_id?: string | null;
  machine?: string | null;
  /** Seconds since 1970, with fractions. */
  time: number;
  /** Seconds. */
  duration: number;
}

/**
 * The stretches of the durations answer, each with its project or computer. A computer comes
 * as the id of its machine name: `machineNames` gives the name the summaries show. A stretch
 * without a name or without length is left out.
 */
export function parseDurations(
  data: RawDuration[],
  slice: WakatimeSlice,
  machineNames: ReadonlyMap<string, string> = new Map(),
): WakatimeDuration[] {
  return data.flatMap(raw => {
    const value =
      slice === 'project' ? raw.project : (raw.machine_name_id ?? raw.machine);
    const name = value ? (machineNames.get(value) ?? value) : null;
    if (!name || !(raw.duration > 0)) {
      return [];
    }
    // To the second, like the tracker's spans: a fraction would make the same stretch new.
    const startedAt = new Date(Math.round(raw.time) * 1000);
    return [
      {
        name,
        startedAt,
        endedAt: new Date(
          startedAt.getTime() + Math.round(raw.duration) * 1000,
        ),
      },
    ];
  });
}
