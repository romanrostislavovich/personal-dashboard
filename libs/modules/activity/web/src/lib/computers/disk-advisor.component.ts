import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ACTIVITY_LOW_DISK_SHARE, DiskAdvice, DiskSuggestion } from '@pd/contracts';
import { desktopBridge, DesktopDiskStatus, DesktopTrashResult } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { ActivityApi } from '../activity.api';

const GB = 1024 ** 3;
const POLL_MS = 1000;

/**
 * Disk cleanup of this computer: the desktop app scans a disk, the AI (or the built-in rules)
 * says what can go, and what the user ticks is moved to the Recycle Bin by the app.
 */
@Component({
  selector: 'pd-activity-disk-advisor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
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
  /** The disks of this computer, from its last reading. */
  readonly disks = input.required<{ mount: string; total: number; free: number }[]>();

  private readonly api = inject(ActivityApi);
  private readonly transloco = inject(TranslocoService);
  protected readonly disk = desktopBridge()?.disk ?? null;
  protected readonly gb = GB;
  protected readonly lowShare = ACTIVITY_LOW_DISK_SHARE;

  protected readonly status = signal<DesktopDiskStatus>({ state: 'idle' });
  protected readonly advice = signal<DiskAdvice | null>(null);
  protected readonly thinking = signal(false);
  protected readonly picked = signal<ReadonlySet<string>>(new Set());
  protected readonly results = signal<DesktopTrashResult[] | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;

  protected readonly pickedBytes = computed(() =>
    (this.advice()?.suggestions ?? [])
      .filter((item) => this.picked().has(item.path))
      .reduce((sum, item) => sum + item.bytes, 0),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopPolling());
    void this.refresh();
  }

  protected async scan(mount: string): Promise<void> {
    this.advice.set(null);
    this.results.set(null);
    this.picked.set(new Set());
    await this.disk?.scan(mount);
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

  /** The app refuses protected paths anyway; the user confirms the exact list first. */
  protected async trash(): Promise<void> {
    const items = (this.advice()?.suggestions ?? []).filter((item) => this.picked().has(item.path));
    const list = items
      .map((item) => `• ${item.path} (${(item.bytes / GB).toFixed(1)} GB)`)
      .join('\n');
    if (
      !items.length ||
      !confirm(`${this.transloco.translate('activity.disk.confirm')}\n\n${list}`)
    ) {
      return;
    }
    const results = (await this.disk?.trash(items.map((item) => item.path))) ?? [];
    this.results.set(results);
    const done = new Set(results.filter((result) => result.ok).map((result) => result.path));
    this.picked.set(new Set());
    const advice = this.advice();
    if (advice) {
      this.advice.set({
        ...advice,
        suggestions: advice.suggestions.filter((item) => !done.has(item.path)),
      });
    }
  }

  protected openRecycleBin(): void {
    void this.disk?.openRecycleBin();
  }

  protected async copy(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
  }

  private async refresh(): Promise<void> {
    if (!this.disk) {
      return;
    }
    const status = await this.disk.status();
    this.status.set(status);
    if (status.state === 'scanning') {
      this.startPolling();
    } else {
      this.stopPolling();
    }
    if (status.state === 'done' && !this.advice() && !this.thinking()) {
      await this.ask(status);
    }
  }

  private async ask(status: Extract<DesktopDiskStatus, { state: 'done' }>): Promise<void> {
    this.thinking.set(true);
    try {
      this.advice.set(await firstValueFrom(this.api.diskAdvice(status.report)));
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
