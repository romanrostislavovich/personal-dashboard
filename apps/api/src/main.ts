import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppConfig } from '@pd/api-core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // The AI chat sends its whole history, and it may include the text of attached files.
  app.useBodyParser('json', { limit: '5mb' });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  const port = app.get<AppConfig>(ConfigService).get('API_PORT', { infer: true });
  await app.listen(port);
  Logger.log(`API is running on http://localhost:${port}/api`);
}

bootstrap();
