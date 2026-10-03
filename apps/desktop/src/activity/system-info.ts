import { app } from 'electron';
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** What Windows tells about the computer beyond the basics (ActivitySystem in contracts). */
export type SystemInfo = Record<string, unknown>;

/** The script waits a moment between two samples and asks several system parts: give it time. */
const TIMEOUT_MS = 60_000;
/** The battery's capacity changes over months: its report is made once a day. */
const BATTERY_REPORT_EVERY_MS = 24 * 60 * 60 * 1000;

/**
 * Runs assets/system-info.ps1: temperature zones, processor speed, graphics load, battery,
 * Wi-Fi, disk health, Windows and Defender, the busiest processes — all without administrator
 * rights. Windows only; elsewhere, and when the script fails, there is simply nothing.
 */
export class SystemInfoReader {
  private batteryReportAt = 0;

  async read(): Promise<SystemInfo | null> {
    if (process.platform !== 'win32') {
      return null;
    }
    // PowerShell cannot run a file from inside the app's archive: the script is copied out.
    const script = join(app.getPath('userData'), 'system-info.ps1');
    writeFileSync(script, readFileSync(join(__dirname, 'assets', 'system-info.ps1')));
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script];
    if (Date.now() - this.batteryReportAt >= BATTERY_REPORT_EVERY_MS) {
      args.push('-BatteryReport');
      this.batteryReportAt = Date.now();
    }
    return new Promise((resolve) => {
      execFile(
        'powershell.exe',
        args,
        { windowsHide: true, timeout: TIMEOUT_MS, encoding: 'utf8', maxBuffer: 1024 * 1024 },
        (error, stdout) => {
          try {
            resolve(error ? null : (JSON.parse(stdout.trim()) as SystemInfo));
          } catch {
            resolve(null);
          }
        },
      );
    });
  }

  /** The capacity from the last report, to send with the readings in between. */
  remember(previous: SystemInfo | null, next: SystemInfo): SystemInfo {
    const battery = next['battery'] as Record<string, unknown> | undefined;
    const known = previous?.['battery'] as Record<string, unknown> | undefined;
    if (battery && known && battery['designCapacity'] === undefined) {
      battery['designCapacity'] = known['designCapacity'];
      battery['fullCapacity'] = known['fullCapacity'];
    }
    return next;
  }
}
