import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DiskAdvice, DiskSuggestion } from '@pd/contracts';
import {
  desktopBridge,
  DesktopDiskStatus,
  DesktopFixResult,
  DesktopTrashResult,
} from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { ActivityApi } from '../activity.api';

const GB = 1024 ** 3;
const POLL_MS = 1000;
/** A scan older than this no longer tells how the disk is: the AI is not asked about it. */
const FRESH_MS = 10 * 60_000;

/** What happened to one suggestion: moved, cleaned, or why not. */
type Outcome = { ok: boolean; text: string };

/**
 * Disk cleanup of this computer: the desktop app scans a disk (started from the disk's row of
 * the card), the AI — or the built-in rules — says what can go, and the app acts on a click:
 * moves to the Recycle Bin, runs its own cleanup command, shows a path in Explorer.
 */
@Component({
  selector: 'pd-activity-disk-advisor',
  exportAs: 'diskAdvisor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    TranslocoPipe,
  ],
  templateUrl: './disk-advisor.component.html',
  styleUrl: './disk-advisor.component.scss',
})
export class DiskAdvisorComponent {
  /** Every disk of this computer: the AI may suggest moving things to another one. */
  readonly disks = input.required<{ mount: string; total: number; free: number }[]>();
  /** The card is of the computer the page is opened on: only then is there a disk to clean. */
  readonly active = input(false);

  private readonly api = inject(ActivityApi);
  private readonly transloco = inject(TranslocoService);
  private readonly bridge = desktopBridge()?.disk ?? null;
  /** The app's disk cleanup, on the card of this computer only. */
  readonly disk = computed(() => (this.active() ? this.bridge : null));
  protected readonly gb = GB;

  protected readonly status = signal<DesktopDiskStatus>({ state: 'idle' });
  protected readonly advice = signal<DiskAdvice | null>(null);
  protected readonly thinking = signal(false);
  protected readonly picked = signal<ReadonlySet<string>>(new Set());
  /** Per path: what the last action on it did. */
  protected readonly outcomes = signal<ReadonlyMap<string, Outcome>>(new Map());
  /** A path being acted on: its buttons wait. */
  protected readonly working = signal<string | null>(null);
  /** Something went to the Recycle Bin: offer to empty it. */
  protected readonly trashed = signal(false);
  protected readonly binMessage = signal<string | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;

  /** A scan or the AI is running: the analyze buttons of the card wait. */
  readonly busy = computed(() => this.status().state === 'scanning' || this.thinking());

  protected readonly pickedBytes = computed(() =>
    (this.advice()?.suggestions ?? [])
      .filter((item) => this.picked().has(item.path))
      .reduce((sum, item) => sum + item.bytes, 0),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopPolling());
    // A scan that runs (or has finished) in the app shows up when the card is this computer's.
    effect(() => {
      if (this.disk()) {
        untracked(() => void this.refresh());
      }
    });
  }

  async scan(mount: string): Promise<void> {
    const disk = this.disk();
    if (!disk || this.busy()) {
      return;
    }
    this.advice.set(null);
    this.outcomes.set(new Map());
    this.picked.set(new Set());
    this.trashed.set(false);
    this.binMessage.set(null);
    await disk.scan(mount);
    this.startPolling();
  }

  protected toggle(item: DiskSuggestion, on: boolean): void {
    const next = new Set(this.picked());
    if (on) {
      next.add(item.path);
    } else {
      next.delete(item.path);
    }
    this.picked.set(next);
  }

  /** The picked ones; the app refuses protected paths anyway, the user confirms the list. */
  protected async trashPicked(): Promise<void> {
    const items = (this.advice()?.suggestions ?? []).filter((item) => this.picked().has(item.path));
    await this.trash(items);
  }

  protected async trashOne(item: DiskSuggestion): Promise<void> {
    await this.trash([item]);
  }

  /** Runs the app's own cleanup for this place (a package cache, Docker). */
  protected async fix(item: DiskSuggestion): Promise<void> {
    const run = this.disk()?.fix;
    if (!item.fix || !run) {
      return;
    }
    const question = this.transloco.translate(`activity.disk.fixes.${item.fix}.confirm`);
    if (item.fix !== 'storage-settings' && !confirm(question)) {
      return;
    }
    this.working.set(item.path);
    try {
      const result: DesktopFixResult = await run(item.fix);
      this.setOutcome(item.path, {
        ok: result.ok,
        text: result.ok
          ? result.output || this.transloco.translate('activity.disk.done')
          : `${this.transloco.translate('activity.disk.fixFailed')}: ${result.output}`,
      });
    } finally {
      this.working.set(null);
    }
  }

  protected reveal(item: DiskSuggestion): void {
    void this.disk()?.reveal?.(item.path);
  }

  protected openRecycleBin(): void {
    void this.disk()?.openRecycleBin();
  }

  /** For good: the files cannot be brought back after this. */
  protected async emptyRecycleBin(): Promise<void> {
    const mount = this.mountScanned();
    const empty = this.disk()?.emptyRecycleBin;
    if (!empty || !confirm(this.transloco.translate('activity.disk.confirmEmpty', { mount }))) {
      return;
    }
    const result = await empty();
    this.binMessage.set(
      result.ok
        ? this.transloco.translate('activity.disk.emptied')
        : `${this.transloco.translate('activity.disk.fixFailed')}: ${result.output}`,
    );
    if (result.ok) {
      this.trashed.set(false);
    }
  }

  /** Closes the panel; the next analysis starts from a new scan. */
  protected async dismiss(): Promise<void> {
    await this.disk()?.dismiss?.();
    this.advice.set(null);
    this.outcomes.set(new Map());
    this.picked.set(new Set());
    this.trashed.set(false);
    this.binMessage.set(null);
    this.status.set({ state: 'idle' });
  }

  /** The scan the panel shows, and whether it is too old to ask the AI about. */
  protected readonly scanned = computed(() => {
    const status = this.status();
    if (status.state !== 'done' || !status.scannedAt) {
      return null;
    }
    return {
      at: status.scannedAt,
      mount: status.report.mount,
      stale: !this.advice() && Date.now() - Date.parse(status.scannedAt) >= FRESH_MS,
    };
  });

  protected async copy(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
  }

  private async trash(items: DiskSuggestion[]): Promise<void> {
    const list = items
      .map((item) => `• ${item.path} (${(item.bytes / GB).toFixed(1)} GB)`)
      .join('\n');
    const disk = this.disk();
    if (
      !disk ||
      !items.length ||
      !confirm(`${this.transloco.translate('activity.disk.confirm')}\n\n${list}`)
    ) {
      return;
    }
    this.working.set(items.length === 1 ? items[0].path : '*');
    try {
      const results: DesktopTrashResult[] = await disk.trash(items.map((item) => item.path));
      for (const result of results) {
        this.setOutcome(result.path, {
          ok: result.ok,
          text: result.ok
            ? this.transloco.translate('activity.disk.moved')
            : this.transloco.translate(`activity.disk.reasons.${result.reason}`),
        });
      }
      if (results.some((result) => result.ok)) {
        this.trashed.set(true);
      }
      const done = new Set(results.filter((result) => result.ok).map((result) => result.path));
      this.picked.set(new Set([...this.picked()].filter((path) => !done.has(path))));
    } finally {
      this.working.set(null);
    }
  }

  private setOutcome(path: string, outcome: Outcome): void {
    this.outcomes.set(new Map(this.outcomes()).set(path, outcome));
  }

  private mountScanned(): string {
    const status = this.status();
    return status.state === 'done' ? status.report.mount : '';
  }

  private async refresh(): Promise<void> {
    const disk = this.disk();
    if (!disk) {
      return;
    }
    const status = await disk.status();
    this.status.set(status);
    if (status.state === 'scanning') {
      this.startPolling();
    } else {
      this.stopPolling();
    }
    if (status.state !== 'done' || this.advice() || this.thinking()) {
      return;
    }
    if (status.advice) {
      this.advice.set(status.advice);
    } else if (!status.scannedAt || Date.now() - Date.parse(status.scannedAt) < FRESH_MS) {
      await this.ask(status);
    }
  }

  private async ask(status: Extract<DesktopDiskStatus, { state: 'done' }>): Promise<void> {
    this.thinking.set(true);
    try {
      const otherDisks = this.disks().filter((disk) => disk.mount !== status.report.mount);
      const advice = await firstValueFrom(this.api.diskAdvice({ ...status.report, otherDisks }));
      this.advice.set(advice);
      await this.disk()?.keepAdvice?.(advice);
    } finally {
      this.thinking.set(false);
    }
  }

  private startPolling(): void {
    this.timer ??= setInterval(() => void this.refresh(), POLL_MS);
  }

  private stopPolling(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
