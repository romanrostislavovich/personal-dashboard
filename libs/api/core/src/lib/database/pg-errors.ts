/** Коды ошибок PostgreSQL: https://www.postgresql.org/docs/current/errcodes-appendix.html */
const FOREIGN_KEY_VIOLATION = '23503';

export function isForeignKeyViolation(error: unknown): boolean {
  return pgErrorCode(error) === FOREIGN_KEY_VIOLATION;
}

/** Drizzle оборачивает ошибку драйвера, поэтому код может лежать в `cause`. */
function pgErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  if ('code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return 'cause' in error ? pgErrorCode(error.cause) : undefined;
}
