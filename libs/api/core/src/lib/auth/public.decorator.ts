import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** By default every endpoint requires authentication; `@Public()` lifts that requirement. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
