import {toSignal} from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {
  MatSlideToggleChange,
  MatSlideToggleModule,
} from '@angular/material/slide-toggle';
import {RouterLink} from '@angular/router';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {needsSetup, SparklineComponent} from '@pd/web-core';
import {LifeApi} from '../life.api';
import {nameOf, valueOf, Wording} from './question-wording';

/**
 * Overload: the last days that are over against the user's own usual — more phone at night,
 * less sleep, deep work and mood… — calm, not an alarm and not a diagnosis; what pulls most, the
 * last two months, and whether the gentle warning is sent. On Home (`compact`) the score only.
 */
@Component({
  selector: 'pd-overload-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatSlideToggleModule,
    RouterLink,
    SparklineComponent,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        @if (!compact()) {
          <mat-icon mat-card-avatar>battery_alert</mat-icon>
        }
        <mat-card-title>{{ 'life.overload.title' | transloco }}</mat-card-title>
        @if (!compact()) {
          <mat-card-subtitle>{{
            'life.overload.hint' | transloco
          }}</mat-card-subtitle>
        }
      </mat-card-header>
      <mat-card-content>
        @if (data.error()) {
          <p class="muted">{{ 'life.overload.failed' | transloco }}</p>
        } @else if (data.hasValue()) {
          @let status = data.value();
          @if (status.score === null) {
            <p class="muted">{{ 'life.overload.few' | transloco }}</p>
          } @else {
            <p class="state" [class.high]="status.high">
              {{
                (status.high
                  ? 'life.overload.high'
                  : status.threshold === null
                    ? 'life.overload.learning'
                    : 'life.overload.usual'
                ) | transloco
              }}
            </p>
            <ul class="parts">
              @for (part of parts(); track part.key) {
                <li>
                  <span class="name">{{ part.name }}</span>
                  <span class="value">{{ part.line }}</span>
                </li>
              }
            </ul>
            @if (!compact() && status.history.length > 1) {
              <p class="caption">{{ 'life.overload.history' | transloco }}</p>
              <pd-sparkline
                [points]="points()"
                [label]="'life.overload.history' | transloco"
                [showAxis]="true"
              />
            }
          }
          @if (!compact()) {
            <mat-slide-toggle
              [checked]="status.enabled"
              [disabled]="saving()"
              (change)="setEnabled($event)"
            >
              {{ 'life.overload.warn' | transloco }}
            </mat-slide-toggle>
            @if (failed()) {
              <p class="error" role="alert">
                {{ 'life.overload.saveFailed' | transloco }}
              </p>
            }
            <p class="muted">{{ 'life.overload.caution' | transloco }}</p>
          }
        }
      </mat-card-content>
      @if (compact()) {
        <mat-card-actions align="end">
          <a matButton routerLink="/life/links">{{
            'life.overload.open' | transloco
          }}</a>
        </mat-card-actions>
      }
    </mat-card>
  `,
  styles: `
    :host {
      display: block;
    }
    .state {
      margin: 8px 0;
      font: var(--mat-sys-title-medium);
    }
    .state.high {
      color: var(--mat-sys-error);
    }
    .parts {
      margin: 0 0 12px;
      padding: 0;
      list-style: none;
    }
    /* The name, then the numbers under it: on a phone a line of both does not fit. */
    .parts li {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 4px 0;
      border-bottom: 1px solid var(--pd-border);
    }
    .name {
      overflow-wrap: anywhere;
    }
    .value {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      font-variant-numeric: tabular-nums;
    }
    .caption {
      margin: 0 0 4px;
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    mat-slide-toggle {
      margin-top: 12px;
    }
    .muted {
      margin: 8px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      margin: 4px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-error);
    }
  `,
})
export class OverloadCardComponent {
  private readonly api = inject(LifeApi);
  private readonly transloco = inject(TranslocoService);
  private readonly language = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  /** On Home: the score and what pulls, nothing to set. */
  readonly compact = input(false);

  protected readonly data = this.api.overload();
  protected readonly saving = signal(false);
  protected readonly failed = signal(false);

  constructor() {
    // On Home: without enough days the widget waits, it is not an empty card.
    needsSetup(
      () =>
        this.compact() &&
        this.data.hasValue() &&
        this.data.value().score === null,
    );
  }

  /** Each number lately against usually, heaviest first (two on Home). */
  protected readonly parts = computed(() => {
    if (!this.data.hasValue()) {
      return [];
    }
    const wording: Wording = {
      locale: this.language(),
      translate: (key, params) => this.transloco.translate(key, params),
    };
    const parts = this.data.value().parts;
    return (this.compact() ? parts.slice(0, 2) : parts).map(part => ({
      key: part.key,
      name: nameOf(part, wording),
      line: this.transloco.translate('life.overload.part', {
        recent: valueOf(part, part.recent, wording),
        usual: valueOf(part, part.usual, wording),
      }),
    }));
  });

  protected readonly points = computed(() =>
    this.data.hasValue()
      ? this.data.value().history.map(one => ({at: one.day, value: one.score}))
      : [],
  );

  protected setEnabled(change: MatSlideToggleChange): void {
    const enabled = change.checked;
    this.saving.set(true);
    this.failed.set(false);
    this.api.setOverloadEnabled(enabled).subscribe({
      next: () => {
        this.saving.set(false);
        this.data.reload();
      },
      error: () => {
        this.saving.set(false);
        this.failed.set(true);
        // Back to what is kept: the same value from the server would not move it.
        change.source.checked = !enabled;
      },
    });
  }
}
