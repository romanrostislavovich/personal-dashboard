import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TranslocoPipe } from '@jsverse/transloco';
import { HealthApi } from '../health.api';

/** In and out, this many seconds each: about six breaths a minute, the calming pace. */
const HALF_BREATH_S = 5;
const LENGTHS = [1, 3, 5, 10] as const;

/**
 * A breathing session: a circle that grows on the breath in and shrinks on the breath out. The
 * minutes done (one at least) count toward the day's mindfulness (Health → Band → Mind).
 */
@Component({
  selector: 'pd-breathing-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatButtonToggleModule, MatDialogModule, TranslocoPipe],
  template: `
    <h2 mat-dialog-title>{{ 'health.band.breathing.title' | transloco }}</h2>
    <mat-dialog-content>
      @if (startedAt() === null) {
        <p>{{ 'health.band.breathing.intro' | transloco }}</p>
        <mat-button-toggle-group [value]="minutes()" (change)="minutes.set($event.value)">
          @for (n of lengths; track n) {
            <mat-button-toggle [value]="n">{{
              'health.band.breathing.minutes' | transloco: { count: n }
            }}</mat-button-toggle>
          }
        </mat-button-toggle-group>
      } @else {
        <div class="stage">
          <div class="circle" [class.in]="breathingIn()" [style.transition-duration.s]="half"></div>
          <p class="cue">
            {{
              (breathingIn() ? 'health.band.breathing.in' : 'health.band.breathing.out') | transloco
            }}
          </p>
          <p class="left">{{ left() }}</p>
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (startedAt() === null) {
        <button matButton mat-dialog-close>{{ 'health.band.breathing.cancel' | transloco }}</button>
        <button matButton="filled" (click)="start()">
          {{ 'health.band.breathing.start' | transloco }}
        </button>
      } @else {
        <button matButton (click)="finish()">{{ 'health.band.breathing.stop' | transloco }}</button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    .stage {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 16px 0;
    }
    .circle {
      width: 160px;
      height: 160px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--mat-sys-primary) 35%, transparent);
      transform: scale(0.5);
      transition-property: transform;
      transition-timing-function: ease-in-out;
    }
    .circle.in {
      transform: scale(1);
    }
    .cue {
      font: var(--mat-sys-title-large);
    }
    .left {
      color: var(--mat-sys-on-surface-variant);
      font-variant-numeric: tabular-nums;
    }
    @media (prefers-reduced-motion: reduce) {
      .circle {
        transition: none;
      }
    }
  `,
})
export class BreathingDialog {
  private readonly api = inject(HealthApi);
  private readonly ref = inject(MatDialogRef<BreathingDialog>);

  protected readonly lengths = LENGTHS;
  protected readonly half = HALF_BREATH_S;
  protected readonly minutes = signal<(typeof LENGTHS)[number]>(3);
  protected readonly startedAt = signal<number | null>(null);
  private readonly now = signal(Date.now());
  private timer: ReturnType<typeof setInterval> | undefined;

  protected readonly breathingIn = computed(() => {
    const started = this.startedAt();
    return (
      started !== null && Math.floor((this.now() - started) / (HALF_BREATH_S * 1000)) % 2 === 0
    );
  });

  protected readonly left = computed(() => {
    const started = this.startedAt() ?? this.now();
    const seconds = Math.max(0, Math.ceil(this.minutes() * 60 - (this.now() - started) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
  }

  protected start(): void {
    this.startedAt.set(Date.now());
    this.now.set(Date.now());
    this.timer = setInterval(() => {
      this.now.set(Date.now());
      if (this.left() === '0:00') {
        void this.finish();
      }
    }, 250);
  }

  /** Saves the whole minutes done; less than one is not a session. */
  protected async finish(): Promise<void> {
    clearInterval(this.timer);
    const started = this.startedAt();
    const done = started === null ? 0 : Math.floor((Date.now() - started) / 60_000);
    if (started !== null && done >= 1) {
      try {
        await this.api.client.addMindfulness({
          startAt: new Date(started).toISOString(),
          minutes: Math.min(done, this.minutes()),
        });
      } catch {
        // Kept nowhere: the dialog closes all the same, the breathing was done.
      }
    }
    this.ref.close(done >= 1);
  }
}
