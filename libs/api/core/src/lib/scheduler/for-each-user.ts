import {Logger} from '@nestjs/common';

/**
 * Runs `work` for every user in turn. An error of one user is logged and the others go on —
 * a revoked token or a broken record of one person never stops everyone's reminders. At the
 * end the failures become one error, so the run is marked failed and the owner is told
 * (Settings → System); a job is not retried (see ScheduledJob.retry), so nothing already sent
 * goes out again.
 *
 * `users` — user ids, or rows with an `id`.
 */
export async function forEachUser<T extends string | {id: string}>(
  job: string,
  users: readonly T[],
  work: (user: T) => Promise<unknown>,
): Promise<void> {
  const failures: string[] = [];
  for (const user of users) {
    try {
      await work(user);
    } catch (error) {
      const id = typeof user === 'string' ? user : user.id;
      const message = error instanceof Error ? error.message : String(error);
      new Logger(job).warn(`Failed for ${id}: ${message}`);
      failures.push(message);
    }
  }
  if (failures.length) {
    throw new Error(
      `${failures.length} of ${users.length} users failed; the first: ${failures[0]}`,
    );
  }
}
