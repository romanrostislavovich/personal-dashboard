import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { CORE_READS } from '@pd/client-core';
import { LifeSummary } from '@pd/contracts';

/** "Wrapped": the numbers of every module for a month or a year. */
@Component({
  selector: 'pd-life-summary-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    TranslocoPipe,
  ],
  template: `
    <header class="toolbar">
      <mat-button-toggle-group
        hideSingleSelectionIndicator
        [value]="kind()"
        [attr.aria-label]="'life.period' | transloco"
        (change)="kind.set($event.value)"
      >
        <mat-button-toggle value="month">{{ 'life.month' | transloco }}</mat-button-toggle>
        <mat-button-toggle value="year">{{ 'life.year' | transloco }}</mat-button-toggle>
      </mat-button-toggle-group>
      @if (kind() === 'month') {
        <input
          type="month"
          [value]="month()"
          [max]="thisMonth"
          [attr.aria-label]="'life.month' | transloco"
          (change)="pickMonth($any($event.target).value)"
        />
        <span class="title">{{ month() + '-01' | date: 'LLLL y' }}</span>
      } @else {
        <input
          type="number"
          [value]="year()"
          [max]="thisYear"
          min="2000"
          [attr.aria-label]="'life.year' | transloco"
          (change)="pickYear($any($event.target).valueAsNumber)"
        />
      }
    </header>

    <div class="cards">
      @for (card of cards(); track card.key) {
        <mat-card appearance="outlined">
          <mat-card-content class="card">
            <mat-icon class="icon">{{ card.icon }}</mat-icon>
            <span class="label">{{ card.key | transloco }}</span>
            <span class="value">
              @switch (card.format) {
                @case ('money') {
                  {{ card.value | currency: card.currency : 'symbol' : '1.0-0' }}
                }
                @case ('hours') {
                  {{ 'life.hours' | transloco: { value: (card.value | number: '1.0-0') } }}
                }
                @default {
                  {{ card.value | number: '1.0-1' }}
                }
              }
            </span>
            @if (card.detailKey) {
              <span class="detail">{{ card.detailKey | transloco: card.detailParams ?? {} }}</span>
            }
          </mat-card-content>
        </mat-card>
      } @empty {
        @if (!summary.isLoading()) {
          <p class="hint">{{ 'life.nothing' | transloco }}</p>
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
    }
    input {
      padding: 6px 8px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
      background: transparent;
      color: inherit;
      font: inherit;
      color-scheme: inherit;
    }
    input[type='number'] {
      width: 90px;
    }
    .title {
      font: var(--mat-sys-title-medium);
      text-transform: capitalize;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr));
      gap: 16px;
    }
    .card {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-top: 16px;
    }
    .icon {
      color: var(--mat-sys-primary);
    }
    .label {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .value {
      font: var(--mat-sys-headline-medium);
    }
    .detail,
    .hint {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class SummaryPage {
  private readonly now = new Date();
  protected readonly thisMonth = `${this.now.getFullYear()}-${String(this.now.getMonth() + 1).padStart(2, '0')}`;
  protected readonly thisYear = this.now.getFullYear();

  protected readonly kind = signal<'month' | 'year'>('month');
  /** `/life/summary?month=2026-09` (the link of the monthly message) opens that month. */
  protected readonly month = signal(
    inject(ActivatedRoute).snapshot.queryParamMap.get('month') ?? this.thisMonth,
  );
  protected readonly year = signal(this.thisYear);

  private readonly period = computed(() => {
    if (this.kind() === 'year') {
      return { from: `${this.year()}-01-01`, to: `${this.year()}-12-31` };
    }
    const [year, month] = this.month().split('-').map(Number);
    const last = new Date(year, month, 0).getDate();
    return { from: `${this.month()}-01`, to: `${this.month()}-${String(last).padStart(2, '0')}` };
  });
  protected readonly summary = httpResource<LifeSummary>(() =>
    CORE_READS.lifeSummary(this.period().from, this.period().to),
  );
  protected readonly cards = computed(() => this.summary.value()?.cards ?? []);

  protected pickMonth(month: string): void {
    if (/^\d{4}-\d{2}$/.test(month) && month <= this.thisMonth) {
      this.month.set(month);
    }
  }

  protected pickYear(year: number): void {
    if (Number.isInteger(year) && year >= 2000 && year <= this.thisYear) {
      this.year.set(year);
    }
  }
}
