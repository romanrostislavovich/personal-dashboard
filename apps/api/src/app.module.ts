import {Module} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {
  ServeStaticModule,
  ServeStaticModuleOptions,
} from '@nestjs/serve-static';
import {
  AppConfig,
  CoreModule,
  DESKTOP_DOWNLOADS_PATH,
  DESKTOP_UPDATES_PATH,
  EXTENSION_UPDATES_PATH,
  MOBILE_DOWNLOADS_PATH,
  MOBILE_UPDATES_PATH,
} from '@pd/api-core';
import {ServerResponse} from 'node:http';
import {resolve} from 'node:path';
import {enabledModules} from './modules';

/**
 * A folder the apps fetch from: nothing is cached, so an app sees a deploy at once (the code of
 * the desktop app, the browser extension; Settings → Apps, apps/api/core apps/app-files.ts).
 */
function appFiles(
  dir: string | undefined,
  serveRoot: string,
): ServeStaticModuleOptions[] {
  return dir
    ? [
        {
          rootPath: resolve(dir),
          serveRoot,
          serveStaticOptions: {
            index: false,
            cacheControl: false,
            setHeaders: (response: ServerResponse) =>
              response.setHeader('Cache-Control', 'no-store'),
          },
        },
      ]
    : [];
}

@Module({
  imports: [
    CoreModule,
    ...enabledModules,
    // In production (Docker) the API also serves the built frontend — one container for everything —
    // and what the apps update themselves from and are installed with.
    ServeStaticModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: AppConfig) => {
        const webDist = config.get('WEB_DIST_PATH', {infer: true});
        return [
          ...appFiles(
            config.get('DESKTOP_BUNDLE_PATH', {infer: true}),
            DESKTOP_UPDATES_PATH,
          ),
          ...appFiles(
            config.get('EXTENSION_BUNDLE_PATH', {infer: true}),
            EXTENSION_UPDATES_PATH,
          ),
          ...appFiles(
            config.get('DESKTOP_INSTALLERS_PATH', {infer: true}),
            DESKTOP_DOWNLOADS_PATH,
          ),
          ...appFiles(
            config.get('MOBILE_BUNDLE_PATH', {infer: true}),
            MOBILE_UPDATES_PATH,
          ),
          ...appFiles(
            config.get('MOBILE_APK_PATH', {infer: true}),
            MOBILE_DOWNLOADS_PATH,
          ),
          // Absolute: the SPA fallback sends index.html with res.sendFile, which rejects relative paths.
          ...(webDist
            ? [
                {
                  rootPath: resolve(webDist),
                  exclude: [
                    '/api/{*path}',
                    `${DESKTOP_UPDATES_PATH}/{*path}`,
                    `${EXTENSION_UPDATES_PATH}/{*path}`,
                    `${DESKTOP_DOWNLOADS_PATH}/{*path}`,
                    `${MOBILE_UPDATES_PATH}/{*path}`,
                    `${MOBILE_DOWNLOADS_PATH}/{*path}`,
                  ],
                },
              ]
            : []),
        ];
      },
    }),
  ],
})
export class AppModule {}
