import { app, dialog, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { sanitizeTelemetryUrl, WorkstateCapture, workstateRestorePlanSchema } from '@pd/contracts';
import { ActivityTracker } from '../activity/tracker';
import { loadSettings, saveSettings } from '../settings-store';
import { gitBranch, launchProject, localPath } from './local-path';
import { workstateMessages } from './messages';

const canceledResult = () => ({ opened: 0, failed: 0, canceled: true });

/** Explicit native actions only. No background snapshots or renderer-supplied capture fields. */
export class DesktopWorkstates {
  private busy = false;

  constructor(
    private readonly tracker: ActivityTracker,
    private readonly serverUrl: () => string | null,
    private readonly saved: () => void,
  ) {}

  private context() {
    const context = loadSettings().workstateContext;
    return context?.serverUrl === this.serverUrl() &&
      context?.deviceId === this.tracker.status().deviceId
      ? context
      : null;
  }

  async choose(kind: 'directory' | 'exe'): Promise<void> {
    if (this.busy) return;
    const server = this.serverUrl();
    const deviceId = this.tracker.status().deviceId;
    if (!server || !deviceId) return;
    this.busy = true;
    const messages = workstateMessages(app.getLocale());
    try {
      const result = await dialog.showOpenDialog({
        title: kind === 'directory' ? messages.chooseProject : messages.chooseIde,
        properties: [kind === 'directory' ? 'openDirectory' : 'openFile'],
        ...(kind === 'exe' ? { filters: [{ name: 'IDE (.exe)', extensions: ['exe'] }] } : {}),
      });
      if (result.canceled || !result.filePaths[0]) return;
      const path = await localPath(result.filePaths[0], kind);
      if (server !== this.serverUrl() || deviceId !== this.tracker.status().deviceId) return;
      saveSettings({
        ...loadSettings(),
        workstateContext: {
          serverUrl: server,
          deviceId,
          projectPath: this.context()?.projectPath ?? null,
          idePath: this.context()?.idePath ?? null,
          ...(kind === 'directory' ? { projectPath: path } : { idePath: path }),
        },
      });
      await dialog.showMessageBox({ message: messages.selected, detail: path });
    } catch {
      await this.failure();
    } finally {
      this.busy = false;
    }
  }

  clear(): void {
    saveSettings({ ...loadSettings(), workstateContext: null });
    this.tracker.resetTelemetry();
  }

  private async failure(): Promise<void> {
    await dialog.showMessageBox({
      type: 'warning',
      message: workstateMessages(app.getLocale()).failed,
    });
  }

  /** A revoked gate stays revoked even if the screen is unlocked before confirmation finishes. */
  private lease(trusted: () => boolean) {
    const permit = this.tracker.workstatePermit();
    if (!permit || !trusted()) return null;
    const controller = new AbortController();
    const valid = () => {
      if (!trusted() || this.tracker.workstatePermit()?.key !== permit.key) controller.abort();
      return !controller.signal.aborted;
    };
    const timer = setInterval(valid, 250);
    return { permit, valid, signal: controller.signal, close: () => clearInterval(timer) };
  }

  async capture(trusted: () => boolean = () => true): Promise<boolean> {
    if (this.busy) return false;
    const lease = this.lease(trusted);
    if (!lease) {
      await this.failure();
      return false;
    }
    this.busy = true;
    try {
      const messages = workstateMessages(app.getLocale());
      const capture: WorkstateCapture = { browserUrls: [] };
      if (lease.permit.activeApp) capture.activeApp = lease.permit.activeApp;
      const project = this.context()?.projectPath;
      if (project) {
        capture.projectPath = await localPath(project, 'directory');
        capture.gitBranch = await gitBranch(capture.projectPath);
      }
      if (
        !Object.values(capture).every(
          (value) => typeof value !== 'string' || this.tracker.workstateTextAllowed(value),
        )
      )
        throw new Error('Private context');
      if (!lease.valid()) return false;
      const result = await dialog.showMessageBox({
        type: 'question',
        message: messages.capturePrompt,
        detail: [
          `${messages.server}: ${this.serverUrl()}`,
          capture.activeApp && `${messages.app}: ${capture.activeApp}`,
          capture.projectPath && `${messages.project}: ${capture.projectPath}`,
          capture.gitBranch && `${messages.branch}: ${capture.gitBranch}`,
          messages.noText,
        ]
          .filter(Boolean)
          .join('\n\n'),
        buttons: [messages.cancel, messages.save],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (result.response !== 1) return false;
      if (!lease.valid()) {
        await this.failure();
        return false;
      }
      const sent = await this.tracker.saveWorkstate(
        {
          id: randomUUID(),
          capturedAt: new Date().toISOString(),
          capture,
        },
        lease.permit.key,
        lease.signal,
      );
      if (sent) this.saved();
      else await this.failure();
      return sent;
    } catch {
      await this.failure();
      return false;
    } finally {
      lease.close();
      this.busy = false;
    }
  }

  async resume(input: unknown, trusted: () => boolean = () => true) {
    if (this.busy) return canceledResult();
    const parsed = workstateRestorePlanSchema.safeParse(input);
    if (!parsed.success) return { opened: 0, failed: 1, canceled: false };
    const lease = this.lease(trusted);
    if (!lease) return canceledResult();
    this.busy = true;
    const result = { opened: 0, failed: 0, canceled: false };
    try {
      const messages = workstateMessages(app.getLocale());
      const plan = parsed.data;
      const ide = this.context()?.idePath;
      const executable = ide ? await localPath(ide, 'exe') : null;
      const lines = [
        `${messages.server}: ${this.serverUrl()}`,
        executable ? `${messages.ide}: ${executable}` : messages.folder,
      ];
      for (const action of plan.actions) {
        if (action.kind === 'openProject') {
          action.path = await localPath(action.path, 'directory');
          lines.push(`${messages.project}: ${action.path}`);
        } else if (action.kind === 'openUrl') {
          if (sanitizeTelemetryUrl(action.url) !== action.url) throw new Error('Unsafe URL');
          lines.push(action.url);
        } else lines.push(`${action.field}: ${action.text}`);
      }
      if (!lease.valid()) return canceledResult();
      const confirmation = await dialog.showMessageBox({
        type: 'question',
        message: messages.resumePrompt,
        detail: lines.join('\n\n'),
        buttons: [messages.cancel, messages.resume],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (confirmation.response !== 1) return canceledResult();
      for (const action of plan.actions) {
        if (!lease.valid()) {
          result.canceled = true;
          break;
        }
        if (action.kind === 'reference') continue;
        try {
          if (action.kind === 'openUrl') {
            if (sanitizeTelemetryUrl(action.url) !== action.url) throw new Error('Unsafe URL');
            await shell.openExternal(action.url);
          } else {
            const path = await localPath(action.path, 'directory');
            const exe = executable ? await localPath(executable, 'exe') : null;
            if (!lease.valid()) {
              result.canceled = true;
              break;
            }
            if (exe) await launchProject(exe, path);
            else if (await shell.openPath(path)) throw new Error('Folder could not be opened');
          }
          result.opened++;
        } catch {
          result.failed++;
        }
      }
      return result;
    } catch {
      return { ...result, failed: result.failed + 1 };
    } finally {
      lease.close();
      this.busy = false;
    }
  }
}
