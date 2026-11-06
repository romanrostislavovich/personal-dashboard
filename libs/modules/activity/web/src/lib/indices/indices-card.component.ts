import {DecimalPipe} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {RouterLink} from '@angular/router';
import {TranslocoPipe} from '@jsverse/transloco';
import {ActivityIndex} from '@pd/contracts';
import {DurationPipe} from '@pd/web-core';
import {ActivityApi} from '../activity.api';

/** On the Home widget: the indices shown first. */
const COMPACT = 4;
/** Today differs from the norm when it is this much off (a fifth), else it is "as usual". */
const NOTABLE = 0.2;

/**
 * Links v2's indices of the day (deep work, draining time, the restless phone…): today, the
 * week and the owner's own norm. Calm on purpose: no colours for good or bad, only "more" or
 * "less than usual" — the numbers describe, they do not judge. The Activity overview shows all
 * of them; the Home widget (`compact`) the first few.
 */
@Component({
  selector: 'pd-activity-indices-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCardModule, RouterLink, TranslocoPipe],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{
          'activity.indices.title' | transloco
        }}</mat-card-title>
        @if (!compact()) {
          <mat-card-subtitle>{{
            'activity.indices.hint' | transloco
          }}</mat-card-subtitle>
        }
      </mat-card-header>
      <mat-card-content>
        @if (data.error()) {
          <p class="muted">{{ 'activity.indices.failed' | transloco }}</p>
        } @else {
          <dl class="rows">
            @for (index of shown(); track index.key) {
              <div class="row">
                <dt>{{ 'activity.links.index.' + index.key | transloco }}</dt>
                <dd>
                  <span class="value">{{ value(index, index.today) }}</span>
                  @if (!compact()) {
                    <span class="muted">
                      {{
                        'activity.indices.week'
                          | transloco: {value: value(index, index.week)}
                      }}
                    </span>
                  }
                  @if (compare(index); as against) {
                    <span class="muted">{{
                      'activity.indices.' + against
                        | transloco: {value: value(index, index.norm)}
                    }}</span>
                  }
                </dd>
              </div>
            } @empty {
              @if (!data.isLoading()) {
                <p class="muted">{{ 'activity.indices.empty' | transloco }}</p>
              }
            }
          </dl>
        }
      </mat-card-content>
      @if (compact()) {
        <mat-card-actions align="end">
          <a matButton routerLink="/activity">{{
            'activity.widget.open' | transloco
          }}</a>
        </mat-card-actions>
      }
    </mat-card>
  `,
  styles: `
    .rows {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 8px 0 0;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 4px 12px;
    }
    dt {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    dd {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 8px;
      margin: 0;
      font-variant-numeric: tabular-nums;
    }
    .value {
      font: var(--mat-sys-title-small);
    }
    .muted {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class IndicesCardComponent {
  private readonly duration = new DurationPipe();
  private readonly decimal = new DecimalPipe('en-US');

  /** The Home widget's few, without the week. */
  readonly compact = input(false);

  protected readonly data = inject(ActivityApi).indices();
  protected readonly shown = computed(() => {
    const all = this.data.hasValue() ? this.data.value().indices : [];
    return this.compact() ? all.slice(0, COMPACT) : all;
  });

  /** "more than usual", "less than usual", "as usual"; `null` — no norm or no today. */
  protected compare(index: ActivityIndex): string | null {
    if (index.today === null || index.norm === null) {
      return null;
    }
    const scale = Math.max(Math.abs(index.norm), 0.1);
    const off = (index.today - index.norm) / scale;
    return off > NOTABLE ? 'more' : off < -NOTABLE ? 'less' : 'usual';
  }

  protected value(index: ActivityIndex, value: number | null): string {
    if (value === null) {
      return '—';
    }
    switch (index.unit) {
      case 'hours':
        return this.duration.transform(Math.round(value * 3600));
      case 'count':
        // The minute counts: after bedtime, to the first work, the longest block.
        return this.duration.transform(Math.round(value * 60));
      case 'percent':
        return `${Math.round(value)}%`;
      default:
        return this.decimal.transform(value, '1.0-1') ?? String(value);
    }
  }
}
