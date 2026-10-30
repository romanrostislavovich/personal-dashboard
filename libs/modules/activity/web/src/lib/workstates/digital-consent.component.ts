import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {
  MatSlideToggleChange,
  MatSlideToggleModule,
} from '@angular/material/slide-toggle';
import {TranslocoPipe} from '@jsverse/transloco';
import {
  DesktopTelemetryDiagnostics,
  desktopTelemetryDiagnosticsSchema,
} from '@pd/contracts';
import {desktopBridge} from '@pd/web-core';
import {TelemetryDiagnosticsComponent} from './telemetry-diagnostics.component';

type ConsentKind = 'telemetry' | 'smartBreak';
interface ConsentStatus {
  enabled: boolean;
  available: boolean;
}

@Component({
  selector: 'pd-activity-digital-consent',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatSlideToggleModule,
    TranslocoPipe,
    TelemetryDiagnosticsComponent,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-content>
        <h3>{{ 'activity.digital.title' | transloco }}</h3>
        <p>{{ 'activity.digital.hint' | transloco }}</p>
        @for (kind of kinds; track kind) {
          <section>
            <mat-slide-toggle
              [checked]="statuses()[kind]?.enabled ?? false"
              [disabled]="
                busy() ||
                !statuses()[kind] ||
                (!statuses()[kind]?.available && !statuses()[kind]?.enabled)
              "
              (change)="toggle(kind, $event)"
              >{{ 'activity.digital.' + kind | transloco }}</mat-slide-toggle
            >
            <p class="hint">
              {{ 'activity.digital.' + kind + 'Hint' | transloco }}
            </p>
            @if (!bridge?.[kind]) {
              <p>{{ 'activity.digital.desktopOnly' | transloco }}</p>
            } @else if (statuses()[kind]; as status) {
              @if (!status.available) {
                <p>{{ unavailableKey(kind) | transloco }}</p>
              }
            }
          </section>
        }
        <pd-telemetry-diagnostics [diagnostics]="diagnostics()" />
        @if (!bridge) {
          <p>{{ 'activity.diagnostics.browserOnly' | transloco }}</p>
        } @else if (!bridge.telemetry?.diagnostics) {
          <p>{{ 'activity.diagnostics.oldDesktop' | transloco }}</p>
        } @else if (diagnosticsFailed()) {
          <p role="alert">{{ 'activity.diagnostics.error' | transloco }}</p>
        }
        @if (busy()) {
          <p role="status">{{ 'activity.workstates.working' | transloco }}</p>
        }
        @if (failed()) {
          <p role="alert">{{ 'activity.digital.error' | transloco }}</p>
        }
        @if (bridge?.telemetry || bridge?.smartBreak) {
          <button matButton [disabled]="busy()" (click)="refresh()">
            {{ 'activity.workstates.refresh' | transloco }}
          </button>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    section {
      margin: 16px 0;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class DigitalConsentComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  protected readonly bridge = desktopBridge();
  protected readonly kinds: ConsentKind[] = ['telemetry', 'smartBreak'];
  protected readonly statuses = signal<
    Partial<Record<ConsentKind, ConsentStatus>>
  >({});
  protected readonly busy = signal(false);
  protected readonly failed = signal(false);
  protected readonly diagnostics = signal<DesktopTelemetryDiagnostics | null>(
    null,
  );
  protected readonly diagnosticsFailed = signal(false);

  ngOnInit(): void {
    void this.refresh();
  }

  protected async refresh(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.failed.set(false);
    await this.readAll();
    this.busy.set(false);
  }

  protected unavailableKey(kind: ConsentKind): string {
    const d = this.diagnostics();
    if (!d) return 'activity.digital.unavailable';
    if (!d.supported) return 'activity.diagnostics.collection.unsupported';
    if (!d.serverConfigured) return 'activity.diagnostics.collection.no-server';
    if (!d.registered) return 'activity.diagnostics.collection.unregistered';
    if (kind === 'smartBreak' && !d.telemetryConsent)
      return 'activity.diagnostics.breaksNeedTelemetry';
    return 'activity.digital.unavailable';
  }

  protected toggle(kind: ConsentKind, event: MatSlideToggleChange): void {
    event.source.checked = this.statuses()[kind]?.enabled ?? false;
    void this.setConsent(kind, event.checked);
  }

  private async setConsent(kind: ConsentKind, enabled: boolean): Promise<void> {
    const control = this.bridge?.[kind];
    if (!control || this.busy()) return;
    this.busy.set(true);
    this.failed.set(false);
    try {
      await this.withTimeout(control.setConsent(enabled));
      // The return boolean is not a status snapshot; read back the actual setting.
      await this.readAll();
      if (!this.destroyRef.destroyed) {
        this.failed.set(
          this.failed() || this.statuses()[kind]?.enabled !== enabled,
        );
      }
    } catch {
      this.failed.set(true);
      await this.readAll();
    } finally {
      this.busy.set(false);
    }
  }

  private async readStatus(kind: ConsentKind): Promise<void> {
    const control = this.bridge?.[kind];
    if (!control) return;
    try {
      const status = await this.withTimeout(control.status());
      if (!this.destroyRef.destroyed)
        this.statuses.update(statuses => ({...statuses, [kind]: status}));
    } catch {
      this.failed.set(true);
      this.statuses.update(statuses => ({...statuses, [kind]: undefined}));
    }
  }

  private async readAll(): Promise<void> {
    await Promise.all([
      ...this.kinds.map(kind => this.readStatus(kind)),
      this.readDiagnostics(),
    ]);
  }

  private async readDiagnostics(): Promise<void> {
    const control = this.bridge?.telemetry;
    if (!control?.diagnostics) return;
    this.diagnosticsFailed.set(false);
    try {
      const result = desktopTelemetryDiagnosticsSchema.parse(
        await this.withTimeout(control.diagnostics()),
      );
      if (!this.destroyRef.destroyed) this.diagnostics.set(result);
    } catch {
      if (!this.destroyRef.destroyed) {
        this.diagnostics.set(null);
        this.diagnosticsFailed.set(true);
      }
    }
  }

  private async withTimeout<T>(request: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        request,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Desktop request timed out')),
            15_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
