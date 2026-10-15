import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppInfo, AppInstall, AppInstallReport, AppKind, AppsOverview } from '@pd/contracts';
import { and, desc, eq } from 'drizzle-orm';
import { AppConfig } from '../config/env';
import { DB, Database } from '../database/database.module';
import { bundleVersion, desktopDownloads, extensionDownloads } from './app-files';
import { AppInstallRow, appInstalls } from './apps.schema';

/** Settings → Apps: what can be installed, and which devices run which version. */
@Injectable()
export class AppsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
  ) {}

  async overview(userId: string): Promise<AppsOverview> {
    const apps = this.apps();
    const versions = new Map(apps.map((app) => [app.kind, app.version]));
    const rows = await this.db
      .select()
      .from(appInstalls)
      .where(eq(appInstalls.userId, userId))
      .orderBy(desc(appInstalls.lastSeenAt));
    return { apps, installs: rows.map((row) => toInstall(row, versions.get(row.kind) ?? null)) };
  }

  /** An app says it runs on a device: a new line, or the same one with its version and time. */
  async report(userId: string, report: AppInstallReport): Promise<void> {
    const fields = {
      kind: report.kind,
      name: report.name,
      platform: report.platform,
      version: report.version,
      lastSeenAt: new Date(),
    };
    await this.db
      .insert(appInstalls)
      .values({ id: report.installId, userId, ...fields })
      // The id is the device's own: another user's row with it is left alone.
      .onConflictDoUpdate({
        target: appInstalls.id,
        set: fields,
        setWhere: eq(appInstalls.userId, userId),
      });
  }

  /** A device that is gone: it comes back when its app reports again. */
  async remove(userId: string, id: string): Promise<void> {
    await this.db
      .delete(appInstalls)
      .where(and(eq(appInstalls.id, id), eq(appInstalls.userId, userId)));
  }

  private apps(): AppInfo[] {
    const desktopBundle = this.config.get('DESKTOP_BUNDLE_PATH', { infer: true });
    const extensionBundle = this.config.get('EXTENSION_BUNDLE_PATH', { infer: true });
    const installers = this.config.get('DESKTOP_INSTALLERS_PATH', { infer: true });
    return [
      {
        kind: 'desktop',
        soon: false,
        version: bundleVersion(desktopBundle),
        downloads: desktopDownloads(installers),
      },
      {
        kind: 'extension',
        soon: false,
        version: bundleVersion(extensionBundle),
        downloads: extensionDownloads(extensionBundle),
      },
      { kind: 'mobile', soon: true, version: null, downloads: [] },
    ];
  }
}

function toInstall(row: AppInstallRow, serverVersion: string | null): AppInstall {
  return {
    id: row.id,
    kind: row.kind as AppKind,
    name: row.name,
    platform: row.platform,
    version: row.version,
    lastSeenAt: row.lastSeenAt.toISOString(),
    current: serverVersion !== null && row.version === serverVersion,
  };
}
