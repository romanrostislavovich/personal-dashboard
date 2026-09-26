import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppConfig } from '@pd/api-core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  const port = app.get<AppConfig>(ConfigService).get('API_PORT', { infer: true });
  await app.listen(port);
  Logger.log(`API is running on http://localhost:${port}/api`);
}

bootstrap();
