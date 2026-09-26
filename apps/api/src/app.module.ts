import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppConfig, CoreModule } from '@pd/api-core';
import { enabledModules } from './modules';

@Module({
  imports: [
    CoreModule,
    ...enabledModules,
    // В продакшене (Docker) API раздаёт и собранный фронтенд — один контейнер на всё.
    ServeStaticModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: AppConfig) => {
        const rootPath = config.get('WEB_DIST_PATH', { infer: true });
        return rootPath ? [{ rootPath, exclude: ['/api/{*path}'] }] : [];
      },
    }),
  ],
})
export class AppModule {}
