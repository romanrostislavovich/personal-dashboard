import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoPipe } from '@jsverse/transloco';
import { desktopBridge } from '@pd/web-core';

type ConsentKind = 'telemetry' | 'smartBreak';
interface ConsentStatus {
  enabled: boolean;
  available: boolean;
}

@Component({
  selector: 'pd-activity-digital-consent',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCardModule, MatSlideToggleModule, TranslocoPipe],
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
            <p class="hint">{{ 'activity.digital.' + kind + 'Hint' | transloco }}</p>
            @if (!bridge?.[kind]) {
              <p>{{ 'activity.digital.desktopOnly' | transloco }}</p>
            } @else if (statuses()[kind]; as status) {
              @if (!status.available) {
                <p>{{ 'activity.digital.unavailable' | transloco }}</p>
              }
            }
          </section>
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
  protected readonly statuses = signal<Partial<Record<ConsentKind, ConsentStatus>>>({});
  protected readonly busy = signal(false);
  protected readonly failed = signal(false);

  ngOnInit(): void {
    void this.refresh();
  }

  protected async refresh(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.failed.set(false);
    await Promise.all(this.kinds.map((kind) => this.readStatus(kind)));
    this.busy.set(false);
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
      await control.setConsent(enabled);
      // The return boolean is not a status snapshot; read back the actual setting.
      const status = await control.status();
      if (!this.destroyRef.destroyed) {
        this.statuses.update((statuses) => ({ ...statuses, [kind]: status }));
        this.failed.set(status.enabled !== enabled);
      }
    } catch {
      this.failed.set(true);
      await this.readStatus(kind);
    } finally {
      this.busy.set(false);
    }
  }

  private async readStatus(kind: ConsentKind): Promise<void> {
    const control = this.bridge?.[kind];
    if (!control) return;
    try {
      const status = await control.status();
      if (!this.destroyRef.destroyed)
        this.statuses.update((statuses) => ({ ...statuses, [kind]: status }));
    } catch {
      this.failed.set(true);
      this.statuses.update((statuses) => ({ ...statuses, [kind]: undefined }));
    }
  }
}
