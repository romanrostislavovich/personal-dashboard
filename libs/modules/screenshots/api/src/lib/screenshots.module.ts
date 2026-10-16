import { Module } from '@nestjs/common';
import { ScreenshotsController } from './screenshots.controller';
import { ScreenshotsService } from './screenshots.service';

/**
 * Screenshots of the desktop app, the server's copy of the folder of every computer (the page
 * in the desktop app keeps the two the same). API: `/api/screenshots`.
 */
@Module({
  controllers: [ScreenshotsController],
  providers: [ScreenshotsService],
})
export class ScreenshotsModule {}
