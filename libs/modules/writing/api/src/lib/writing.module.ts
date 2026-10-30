import {Module} from '@nestjs/common';
import {WritingAchievements} from './writing.achievements';
import {WritingController} from './writing.controller';
import {WritingIntegrations} from './writing.integrations';
import {WritingService} from './writing.service';

/**
 * Writing: spelling, grammar and punctuation checked by LanguageTool on this server, and the
 * AI's rewrites — for the Writing page, the browser extension and the desktop app.
 * API: `/api/writing`.
 */
@Module({
  controllers: [WritingController],
  providers: [WritingService, WritingAchievements, WritingIntegrations],
})
export class WritingModule {}
