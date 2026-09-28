import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppConfig, CoreModule } from '@pd/api-core';
import { resolve } from 'node:path';
import { enabledModules } from './modules';

@Module({
  imports: [
    CoreModule,
    ...enabledModules,
    // In production (Docker) the API also serves the built frontend — one container for everything.
    ServeStaticModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: AppConfig) => {
        const webDist = config.get('WEB_DIST_PATH', { infer: true });
        // Absolute: the SPA fallback sends index.html with res.sendFile, which rejects relative paths.
        return webDist ? [{ rootPath: resolve(webDist), exclude: ['/api/{*path}'] }] : [];
      },
    }),
  ],
})
export class AppModule {}
