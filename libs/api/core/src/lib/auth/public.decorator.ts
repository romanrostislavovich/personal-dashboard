import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** По умолчанию все эндпоинты требуют авторизации; `@Public()` снимает это требование. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
