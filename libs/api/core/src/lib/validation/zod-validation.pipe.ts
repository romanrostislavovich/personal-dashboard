import { BadRequestException, PipeTransform } from '@nestjs/common';
import { z } from 'zod';

/**
 * Validates input with a schema from `@pd/contracts` —
 * the same one the frontend builds its types from.
 *
 * Example: `create(@Body(new ZodValidationPipe(birthdayInputSchema)) input: BirthdayInput)`
 */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: z.flattenError(result.error).fieldErrors,
      });
    }
    return result.data;
  }
}
