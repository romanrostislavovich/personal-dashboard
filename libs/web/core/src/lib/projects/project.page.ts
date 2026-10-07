import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { CORE_READS } from '@pd/client-core';
import { ProjectMonth, ProjectOverview } from '@pd/contracts';
import { DurationPipe } from '../ui/duration.pipe';

const PERIODS = [30, 90, 365] as const;
const MONTHS = 6;

function localDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * One project across the sections: the hours, the money, the tasks, the sites and the latest
 * changes — each section tells what it knows (see LinksService on the server).
 */
@Component({
  selector: 'pd-project-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    DurationPipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    RouterLink,
    TranslocoPipe,
  ],
  template: `
    <header class="page-header">
      <a matIconButton routerLink="/projects" [attr.aria-label]="'core.projects.title' | transloco">
        <mat-icon>arrow_back</mat-icon>
      </a>
      <h1 class="page-title">{{ overview.value()?.project?.name }}</h1>
      <mat-button-toggle-group
        hideSingleSelectionIndicator
        [value]="days()"
        [attr.aria-label]="'core.projects.period' | transloco"
        (change)="days.set($event.value)"
      >
        @for (option of periods; track option) {
          <mat-button-toggle [value]="option">
            {{ 'core.projects.days' | transloco: { days: option } }}
          </mat-button-toggle>
        }
      </mat-button-toggle-group>
    </header>

    @if (overview.value(); as data) {
      @if (data.project.url) {
        <a class="url" [href]="data.project.url" target="_blank" rel="noopener">
          {{ data.project.url }}
        </a>
      }

      @if (data.perHour; as rate) {
        <p class="rate">
          {{ 'core.projects.perHour' | transloco }}
          <b>{{ rate.income | currency: rate.currency }}</b>
          {{ 'core.projects.income' | transloco }} ·
          <b>{{ rate.expense | currency: rate.currency }}</b>
          {{ 'core.projects.expense' | transloco }}
        </p>
      }

      <div class="cards">
        @for (fact of data.facts; track fact.labelKey) {
          <mat-card appearance="outlined">
            <mat-card-content class="card">
              <span class="label">{{ fact.labelKey | transloco }}</span>
              <span class="value">
                @switch (fact.unit) {
                  @case ('seconds') {
                    {{ fact.value | pdDuration }}
                  }
                  @case ('money') {
                    {{ fact.value | currency: fact.currency : 'symbol' : '1.0-0' }}
                  }
                  @case ('percent') {
                    {{ fact.value | number: '1.0-2' }}%
                  }
                  @default {
                    {{ fact.value | number }}
                  }
                }
              </span>
              @if (fact.note) {
                <span class="hint">{{ fact.note }}</span>
              }
              @if (fact.link) {
                <a class="more" [routerLink]="fact.link">
                  {{ fact.module + '.title' | transloco }}
                </a>
              }
            </mat-card-content>
          </mat-card>
        } @empty {
          <p class="hint">{{ 'core.projects.nothing' | transloco }}</p>
        }
      </div>

      @if (data.changes.length) {
        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ 'core.projects.changes' | transloco }}</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @for (change of data.changes; track change.at + change.title) {
              <div class="change">
                <span class="hint">{{ change.at | date: 'd MMM, HH:mm' }}</span>
                @if (change.url) {
                  <a [href]="change.url" target="_blank" rel="noopener">{{ change.title }}</a>
                } @else {
                  <span>{{ change.title }}</span>
                }
                <span class="hint">{{ change.where }}</span>
              </div>
            }
          </mat-card-content>
        </mat-card>
      }

      @if (hasMonths()) {
        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ 'core.projects.months' | transloco }}</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="months">
              <span class="head"></span>
              <span class="head">{{ 'core.projects.monthTime' | transloco }}</span>
              <span class="head">{{ 'core.projects.monthCoding' | transloco }}</span>
              <span class="head">{{ 'core.projects.monthIncome' | transloco }}</span>
              <span class="head">{{ 'core.projects.monthExpense' | transloco }}</span>
              @for (month of months.value(); track month.month) {
                <span>{{ month.month + '-01' | date: 'LLL y' }}</span>
                <span class="number">{{ month.seconds ? (month.seconds | pdDuration) : '—' }}</span>
                <span class="number">
                  {{ month.codingSeconds ? (month.codingSeconds | pdDuration) : '—' }}
                </span>
                <span class="number">
                  {{
                    month.currency && month.income
                      ? (month.income | currency: month.currency : 'symbol' : '1.0-0')
                      : '—'
                  }}
                </span>
                <span class="number">
                  {{
                    month.currency && month.expense
                      ? (month.expense | currency: month.currency : 'symbol' : '1.0-0')
                      : '—'
                  }}
                </span>
              }
            </div>
          </mat-card-content>
        </mat-card>
      }

      <p class="hint">
        {{ 'core.projects.aliasesHint' | transloco }}
        @if (data.project.aliases.length) {
          <b>{{ data.project.aliases.join(', ') }}</b>
        }
      </p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .page-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
    }
    .page-title {
      flex: 1;
      margin: 0;
    }
    .rate {
      margin: 0;
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
    .label {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .value {
      font: var(--mat-sys-headline-medium);
    }
    .hint {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      overflow-wrap: anywhere;
    }
    .more,
    .url,
    .change a {
      color: var(--mat-sys-primary);
      text-decoration: none;
    }
    .more {
      font: var(--mat-sys-label-medium);
    }
    .months {
      display: grid;
      grid-template-columns: minmax(0, 1fr) repeat(4, auto);
      gap: 6px 20px;
      padding-top: 12px;
      max-width: 640px;
    }
    .head {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
      text-align: right;
    }
    .number {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .change {
      display: grid;
      grid-template-columns: 110px 1fr auto;
      gap: 12px;
      padding: 6px 0;
      border-top: 1px solid var(--pd-border);
      overflow-wrap: anywhere;
    }
    @media (max-width: 600px) {
      .change {
        grid-template-columns: 1fr;
        gap: 2px;
      }
    }
  `,
})
export class ProjectPage {
  /** The `:id` of the route. */
  readonly id = input.required<string>();

  protected readonly periods = PERIODS;
  protected readonly days = signal<number>(PERIODS[0]);
  private readonly period = computed(() => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - this.days() + 1);
    return { from: localDate(from), to: localDate(to) };
  });
  /** The last half-year month by month, whatever the period above. */
  protected readonly months = httpResource<ProjectMonth[]>(
    () => CORE_READS.projectMonths(this.id(), MONTHS),
    { defaultValue: [] },
  );
  protected readonly hasMonths = computed(() =>
    this.months
      .value()
      .some((month) => month.seconds || month.codingSeconds || month.income || month.expense),
  );
  protected readonly overview = httpResource<ProjectOverview>(() =>
    CORE_READS.projectOverview(this.id(), this.period().from, this.period().to),
  );
}
