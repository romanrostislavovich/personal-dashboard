import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  WorkstateInput,
  WorkstateQuery,
  WorkstateRestorePlan,
  sanitizeTelemetryUrl,
  workstateInputSchema,
  workstateQuerySchema,
} from '@pd/contracts';
import { desktopBridge, errorStatus } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { ActivityApi } from '../activity.api';
import { DigitalConsentComponent } from './digital-consent.component';

@Component({
  selector: 'pd-workstate-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoPipe,
    DigitalConsentComponent,
  ],
  templateUrl: './workstate-timeline.component.html',
  styleUrl: './workstate-timeline.component.scss',
})
export class WorkstateTimelineComponent {
  private readonly api = inject(ActivityApi);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly desktop = desktopBridge()?.workstates;
  protected readonly query = signal<WorkstateQuery>({ limit: 50 });
  protected readonly timeline = this.api.workstateTimeline(this.query);
  protected readonly page = computed(() =>
    !this.timeline.isLoading() && !this.timeline.error() ? this.timeline.value() : undefined,
  );
  protected readonly plan = signal<WorkstateRestorePlan | null>(null);
  protected readonly busy = signal(false);
  protected readonly message = signal('');
  protected readonly failure = signal('');
  protected readonly filterError = signal(false);
  protected readonly captureError = signal(false);
  protected readonly pendingDelete = signal<string | null>(null);
  protected readonly resumeResult = signal<{
    opened: number;
    failed: number;
    canceled: boolean;
  } | null>(null);
  protected readonly timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  protected search = '';
  protected from = '';
  protected to = '';
  protected note = '';
  protected projectPath = '';
  protected gitBranch = '';
  protected browserUrls = '';
  private revision = 0;
  private pendingCapture: WorkstateInput | null = null;

  constructor() {
    effect(() => {
      if (this.timeline.error()) {
        this.plan.set(null);
        this.pendingDelete.set(null);
      }
    });
  }

  protected applyFilters(): void {
    const parsed = workstateQuerySchema.safeParse({
      limit: 50,
      search: this.search.trim() || undefined,
      from: this.instant(this.from),
      to: this.instant(this.to),
    });
    this.filterError.set(!parsed.success);
    if (parsed.success) this.changeQuery(parsed.data);
  }

  protected next(): void {
    const cursor = this.page()?.nextCursor;
    if (cursor) this.changeQuery({ ...this.query(), ...cursor });
  }

  protected first(): void {
    this.changeQuery({ ...this.query(), before: undefined, beforeId: undefined });
  }

  protected refresh(): void {
    this.clearPreview();
    this.timeline.reload();
  }

  protected closePreview(): void {
    this.clearPreview();
  }

  protected async preview(id: string): Promise<void> {
    this.clearPreview();
    const revision = this.revision;
    await this.run(async () => {
      const plan = await firstValueFrom(this.api.restoreWorkstate(id));
      if (revision === this.revision && !this.destroyRef.destroyed && !this.timeline.error()) {
        this.plan.set(plan);
      }
    });
  }

  protected async resume(): Promise<void> {
    const plan = this.plan();
    const desktop = this.desktop;
    if (!plan || !desktop) return;
    const revision = this.revision;
    await this.run(async () => {
      const result = await desktop.resume(plan);
      if (revision === this.revision && !this.destroyRef.destroyed) this.resumeResult.set(result);
    });
  }

  protected async remove(id: string): Promise<void> {
    if (this.pendingDelete() !== id) return;
    await this.run(async () => {
      await firstValueFrom(this.api.removeWorkstate(id));
      this.message.set('activity.workstates.deleted');
      this.refresh();
    });
  }

  protected async capture(): Promise<void> {
    if (this.busy()) return;
    const parsed = workstateInputSchema.safeParse({
      id: this.pendingCapture?.id ?? crypto.randomUUID(),
      capturedAt: this.pendingCapture?.capturedAt ?? new Date().toISOString(),
      capture: {
        note: this.note.trim() || undefined,
        projectPath: this.projectPath.trim() || undefined,
        gitBranch: this.gitBranch.trim() || undefined,
        browserUrls: this.browserUrls
          .split(/\r?\n/)
          .map((url) => url.trim())
          .filter(Boolean),
      },
    });
    this.captureError.set(!parsed.success);
    if (!parsed.success) return;
    // Keep a failed submission's identity for a safe retry after a lost response.
    if (
      this.pendingCapture &&
      JSON.stringify(this.pendingCapture.capture) !== JSON.stringify(parsed.data.capture)
    ) {
      parsed.data.id = crypto.randomUUID();
      parsed.data.capturedAt = new Date().toISOString();
    }
    this.pendingCapture = parsed.data;
    await this.run(async () => {
      await firstValueFrom(this.api.captureWorkstate(parsed.data));
      this.pendingCapture = null;
      this.note = this.projectPath = this.gitBranch = this.browserUrls = '';
      this.message.set('activity.workstates.saved');
      this.first();
    });
  }

  protected async quickCapture(): Promise<void> {
    const desktop = this.desktop;
    if (!desktop) return;
    await this.run(async () => {
      const captured = await desktop.capture();
      this.message.set(
        captured ? 'activity.workstates.captured' : 'activity.workstates.notCaptured',
      );
      if (captured) this.first();
    });
  }

  protected safeUrl(value: string): string | null {
    return sanitizeTelemetryUrl(value) === value ? value : null;
  }

  protected errorKey(error: unknown): string {
    const status = errorStatus(error);
    return status === 401 || status === 403
      ? 'activity.workstates.authError'
      : 'activity.workstates.error';
  }

  private changeQuery(query: WorkstateQuery): void {
    this.clearPreview();
    this.query.set(query);
  }

  private clearPreview(): void {
    this.revision++;
    this.plan.set(null);
    this.resumeResult.set(null);
    this.pendingDelete.set(null);
  }

  private instant(value: string): string | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : value;
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.message.set('');
    this.failure.set('');
    try {
      await action();
    } catch (error) {
      this.failure.set(this.errorKey(error));
      if ([401, 403].includes(errorStatus(error))) this.clearPreview();
    } finally {
      this.busy.set(false);
    }
  }
}
