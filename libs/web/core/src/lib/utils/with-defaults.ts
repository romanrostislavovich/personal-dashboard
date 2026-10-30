/**
 * A form's first values: each field of `value` (a record being edited, a draft), or its default
 * where it has none (`null` or missing). One loop instead of a `?? default` per field, which a
 * form of many optional fields would otherwise repeat a dozen times.
 */
export function withDefaults<T extends object>(
  value: {[K in keyof T]?: T[K] | null} | null | undefined,
  defaults: T,
): T {
  const result = {...defaults};
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const given = value?.[key];
    if (given !== null && given !== undefined) {
      result[key] = given as T[keyof T];
    }
  }
  return result;
}
