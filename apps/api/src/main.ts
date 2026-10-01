import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppConfig, SystemLogger } from '@pd/api-core';
import { AppModule } from './app.module';

async function bootstrap() {
  // Errors and warnings also go to the system log (Settings → System).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new SystemLogger(),
  });
  // The AI chat sends its whole history, and it may include the text of attached files.
  app.useBodyParser('json', { limit: '5mb' });
  app.setGlobalPrefix('api');
  // Behind Caddy (a private address): the client's address comes from X-Forwarded-For, and
  // `request.secure` from X-Forwarded-Proto — the sign-in throttle and the cookie need both.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.enableShutdownHooks();

  const port = app.get<AppConfig>(ConfigService).get('API_PORT', { infer: true });
  await app.listen(port);
  Logger.log(`API is running on http://localhost:${port}/api`);
}

bootstrap();
