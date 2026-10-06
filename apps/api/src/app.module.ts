import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppConfig, CoreModule } from '@pd/api-core';
import { ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { enabledModules } from './modules';

/** Where installed desktop apps look for the code of their shell (apps/desktop/src/update). */
const DESKTOP_UPDATES_PATH = '/desktop-updates';

@Module({
  imports: [
    CoreModule,
    ...enabledModules,
    // In production (Docker) the API also serves the built frontend — one container for everything —
    // and the code of the desktop shell, which installed desktop apps update themselves from.
    ServeStaticModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: AppConfig) => {
        const webDist = config.get('WEB_DIST_PATH', { infer: true });
        const desktopBundle = config.get('DESKTOP_BUNDLE_PATH', { infer: true });
        return [
          ...(desktopBundle
            ? [
                {
                  rootPath: resolve(desktopBundle),
                  serveRoot: DESKTOP_UPDATES_PATH,
                  // Nothing is cached: an app must see a deploy at once.
                  serveStaticOptions: {
                    index: false,
                    cacheControl: false,
                    setHeaders: (response: ServerResponse) =>
                      response.setHeader('Cache-Control', 'no-store'),
                  },
                },
              ]
            : []),
          // Absolute: the SPA fallback sends index.html with res.sendFile, which rejects relative paths.
          ...(webDist
            ? [
                {
                  rootPath: resolve(webDist),
                  exclude: ['/api/{*path}', `${DESKTOP_UPDATES_PATH}/{*path}`],
                },
              ]
            : []),
        ];
      },
    }),
  ],
})
export class AppModule {}
