import {DatePipe, DecimalPipe} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {TranslocoPipe} from '@jsverse/transloco';
import {
  formatLabRange,
  HealthLabPanel,
  HealthRecord,
  HealthStudy,
  labSeries,
  LabSeries,
} from '@pd/contracts';
import {HealthDialogs} from '../dialogs/health-dialogs.service';
import {HealthApi} from '../health.api';
import {CountryPipe} from '../health-labels';
import {LabChartComponent} from './lab-chart.component';

/**
 * Lab results and studies. On top, every analyte with its latest value — one line across
 * laboratories and countries, in one unit — and its chart over the years; under it the reports
 * as they were, and the studies with their conclusions.
 */
@Component({
  selector: 'pd-health-results-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CountryPipe,
    DatePipe,
    DecimalPipe,
    LabChartComponent,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoPipe,
  ],
  template: `
    <div class="toolbar">
      <button matButton="filled" [disabled]="!data()" (click)="addPanel()">
        <mat-icon>add</mat-icon> {{ 'health.labs.add' | transloco }}
      </button>
      <button matButton="tonal" [disabled]="!data()" (click)="addStudy()">
        <mat-icon>add</mat-icon> {{ 'health.study.add' | transloco }}
      </button>
    </div>
    @if (record.isLoading()) {
      <mat-progress-bar mode="indeterminate" />
    }
    @if (record.error()) {
      <p class="error" role="alert">{{ 'health.errors.load' | transloco }}</p>
    } @else if (data(); as data) {
      @if (series().length) {
        <h2 class="section">{{ 'health.labs.analytes' | transloco }}</h2>
        <div class="series">
          @for (s of series(); track s.key) {
            @let latest = s.points[s.points.length - 1];
            <mat-card appearance="outlined" [class.open]="opened() === s.key">
              <button
                class="summary"
                (click)="toggle(s.key)"
                [attr.aria-expanded]="opened() === s.key"
              >
                <span class="name">
                  {{
                    s.analyte
                      ? ('health.analytes.' + s.analyte | transloco)
                      : s.name
                  }}
                </span>
                <span class="latest">
                  {{ latest.value | number: '1.0-3' }}
                  <small>{{ s.unit }}</small>
                </span>
                @if (latest.flag) {
                  <span class="flag">
                    <mat-icon>{{
                      latest.flag === 'high' ? 'arrow_upward' : 'arrow_downward'
                    }}</mat-icon>
                    {{ 'health.labs.flags.' + latest.flag | transloco }}
                  </span>
                }
                <span class="hint">
                  {{ latest.day | date: 'd MMM y' }}
                  @if (s.points.length > 1) {
                    ·
                    {{
                      'health.labs.results'
                        | transloco: {count: s.points.length}
                    }}
                  }
                </span>
                <mat-icon class="chevron">
                  {{ opened() === s.key ? 'expand_less' : 'expand_more' }}
                </mat-icon>
              </button>
              @if (opened() === s.key) {
                <mat-card-content class="detail">
                  <pd-health-lab-chart [series]="s" [label]="chartLabel(s)" />
                  <table>
                    <thead>
                      <tr>
                        <th>{{ 'health.labs.takenOn' | transloco }}</th>
                        <th class="number">{{ s.unit }}</th>
                        <th>{{ 'health.labs.range' | transloco }}</th>
                        <th>{{ 'health.labs.laboratory' | transloco }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (point of reversed(s); track $index) {
                        <tr [class.out]="point.flag">
                          <td>{{ point.day | date: 'd MMM y' }}</td>
                          <td class="number">
                            {{ point.value | number: '1.0-3' }}
                            @if (point.flag) {
                              {{ point.flag === 'high' ? '↑' : '↓' }}
                            }
                          </td>
                          <td>{{ range(point.low, point.high) }}</td>
                          <td>
                            {{ point.laboratory }}
                            @if (point.country) {
                              · {{ point.country | pdCountry }}
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </mat-card-content>
              }
            </mat-card>
          }
        </div>
      }

      <h2 class="section">{{ 'health.labs.reports' | transloco }}</h2>
      @for (panel of data.labPanels; track panel.id) {
        <mat-card appearance="outlined">
          <mat-card-content class="panel">
            <div class="head">
              <b>{{ panel.takenOn | date: 'd MMMM y' }}</b>
              <span class="hint">
                {{ panel.laboratory }}
                @if (panel.country) {
                  · {{ panel.country | pdCountry }}
                }
              </span>
              <span class="spacer"></span>
              <button
                matIconButton
                [attr.aria-label]="'core.actions.edit' | transloco"
                (click)="editPanel(data, panel)"
              >
                <mat-icon>edit</mat-icon>
              </button>
              <button
                matIconButton
                [attr.aria-label]="'core.actions.delete' | transloco"
                (click)="removePanel(panel)"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </div>
            <table>
              <tbody>
                @for (line of panel.values; track line.id) {
                  <tr [class.out]="line.flag">
                    <td>{{ line.name }}</td>
                    <td class="number">
                      {{
                        line.value !== null
                          ? (line.value | number: '1.0-3')
                          : line.textValue
                      }}
                      @if (line.flag) {
                        {{ line.flag === 'high' ? '↑' : '↓' }}
                      }
                    </td>
                    <td>{{ line.unit }}</td>
                    <td class="hint">
                      {{ range(line.refLow, line.refHigh, line.refText) }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            @if (panel.notes) {
              <p class="words">{{ panel.notes }}</p>
            }
          </mat-card-content>
        </mat-card>
      } @empty {
        <p class="hint">{{ 'health.labs.empty' | transloco }}</p>
      }

      <h2 class="section">{{ 'health.study.title' | transloco }}</h2>
      @for (study of data.studies; track study.id) {
        <mat-card appearance="outlined">
          <mat-card-content class="panel">
            <div class="head">
              <b>{{ 'health.studyKinds.' + study.kind | transloco }}</b>
              @if (study.area) {
                <span>{{ study.area }}</span>
              }
              <span class="hint">{{
                study.performedOn | date: 'd MMMM y'
              }}</span>
              <span class="spacer"></span>
              <button
                matIconButton
                [attr.aria-label]="'core.actions.edit' | transloco"
                (click)="editStudy(data, study)"
              >
                <mat-icon>edit</mat-icon>
              </button>
              <button
                matIconButton
                [attr.aria-label]="'core.actions.delete' | transloco"
                (click)="removeStudy(study)"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </div>
            @if (study.conclusion) {
              <p class="words">{{ study.conclusion }}</p>
            }
          </mat-card-content>
        </mat-card>
      } @empty {
        <p class="hint">{{ 'health.study.empty' | transloco }}</p>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .section {
      margin: 12px 0 0;
      font: var(--mat-sys-title-small);
    }
    .series {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .summary {
      all: unset;
      box-sizing: border-box;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 12px;
      width: 100%;
      padding: 12px 16px;
      cursor: pointer;
      border-radius: inherit;
    }
    .summary:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
    }
    .name {
      flex: 1 1 160px;
      font: var(--mat-sys-title-small);
    }
    .latest {
      font: var(--mat-sys-title-medium);
      font-variant-numeric: tabular-nums;
    }
    .latest small {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .flag {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 0 8px 0 4px;
      border-radius: 12px;
      font: var(--mat-sys-label-medium);
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
    .flag mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .chevron {
      color: var(--mat-sys-on-surface-variant);
    }
    .detail {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding-top: 24px;
      overflow-x: auto;
    }
    .panel {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-top: 12px;
      overflow-x: auto;
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .spacer {
      flex: 1;
    }
    table {
      border-collapse: collapse;
      font: var(--mat-sys-body-medium);
    }
    th {
      text-align: left;
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    th,
    td {
      padding: 4px 12px 4px 0;
      border-bottom: 1px solid var(--pd-border);
    }
    .number {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    tr.out .number {
      color: var(--mat-sys-error);
      font-weight: 600;
    }
    .words {
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .hint {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class ResultsPage {
  private readonly api = inject(HealthApi);
  private readonly dialogs = inject(HealthDialogs);

  protected readonly record = this.api.record();
  protected readonly data = computed(() =>
    this.record.hasValue() ? this.record.value() : undefined,
  );
  protected readonly series = computed(() =>
    labSeries(this.data()?.labPanels ?? []),
  );
  /** The analyte whose chart is open. */
  protected readonly opened = signal<string | null>(null);

  protected toggle(key: string): void {
    this.opened.update(current => (current === key ? null : key));
  }

  protected reversed(series: LabSeries) {
    return [...series.points].reverse();
  }

  protected range(
    low: number | null,
    high: number | null,
    text: string | null = null,
  ): string {
    return formatLabRange(low, high, text);
  }

  protected chartLabel(series: LabSeries): string {
    const last = series.points[series.points.length - 1];
    return `${series.name}: ${series.points.length} × ${series.unit}, ${last.day} ${last.value}`;
  }

  protected async addPanel(): Promise<void> {
    const record = this.data();
    if (record && (await this.dialogs.labPanel({record}))) {
      this.record.reload();
    }
  }

  protected async editPanel(
    record: HealthRecord,
    panel: HealthLabPanel,
  ): Promise<void> {
    if (await this.dialogs.labPanel({record, panel})) {
      this.record.reload();
    }
  }

  protected async removePanel(panel: HealthLabPanel): Promise<void> {
    if (
      await this.dialogs.remove(panel.takenOn, () =>
        this.api.client.removeLabPanel(panel.id),
      )
    ) {
      this.record.reload();
    }
  }

  protected async addStudy(): Promise<void> {
    const record = this.data();
    if (record && (await this.dialogs.study({record}))) {
      this.record.reload();
    }
  }

  protected async editStudy(
    record: HealthRecord,
    study: HealthStudy,
  ): Promise<void> {
    if (await this.dialogs.study({record, study})) {
      this.record.reload();
    }
  }

  protected async removeStudy(study: HealthStudy): Promise<void> {
    if (
      await this.dialogs.remove(study.performedOn, () =>
        this.api.client.removeStudy(study.id),
      )
    ) {
      this.record.reload();
    }
  }
}
