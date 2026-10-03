import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarkdownPipe } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { FinanceApi } from '../finance.api';

/**
 * The AI's review of a month: where the money went, what changed, where to save. Written on
 * request (or for the summary on the 1st) and kept; it can be written again.
 */
@Component({
  selector: 'pd-report-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MarkdownPipe,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>auto_awesome</mat-icon>
        <mat-card-title>{{ 'finance.report.title' | transloco }}</mat-card-title>
        <mat-card-subtitle>
          @if (report(); as r) {
            {{
              'finance.report.written' | transloco: { date: (r.createdAt | date: 'd MMM, HH:mm') }
            }}
          } @else {
            {{ 'finance.report.subtitle' | transloco }}
          }
        </mat-card-subtitle>
      </mat-card-header>
      @if (writing()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <mat-card-content>
        @if (report(); as r) {
          <p class="summary">{{ r.summary }}</p>
          <div class="text" [innerHTML]="r.text | markdown"></div>
        } @else if (empty()) {
          <p class="hint">{{ 'finance.report.nothing' | transloco }}</p>
        }
        @if (error()) {
          <p class="error">{{ 'finance.report.error' | transloco }}</p>
        }
      </mat-card-content>
      <mat-card-actions align="end">
        <button matButton (click)="write()" [disabled]="writing()">
          <mat-icon>{{ report() ? 'refresh' : 'auto_awesome' }}</mat-icon>
          {{ (report() ? 'finance.report.rewrite' : 'finance.report.write') | transloco }}
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    mat-icon[mat-card-avatar] {
      display: grid;
      place-items: center;
      color: var(--mat-sys-primary);
    }
    .summary {
      font: var(--mat-sys-title-medium);
    }
    .text {
      font: var(--mat-sys-body-medium);
    }
    .text :is(h1, h2, h3) {
      font: var(--mat-sys-title-small);
      margin: 12px 0 4px;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class ReportCardComponent {
  /** `YYYY-MM`. */
  readonly month = input.required<string>();

  private readonly api = inject(FinanceApi);
  private readonly kept = this.api.report(this.month);
  protected readonly report = computed(() => this.kept.value()?.report ?? null);
  protected readonly writing = signal(false);
  protected readonly error = signal(false);
  /** The AI was asked, but the month has no transactions. */
  protected readonly empty = signal(false);

  protected async write(): Promise<void> {
    this.writing.set(true);
    this.error.set(false);
    this.empty.set(false);
    try {
      const { report } = await firstValueFrom(this.api.writeReport(this.month()));
      this.empty.set(!report);
      this.kept.reload();
    } catch {
      this.error.set(true);
    } finally {
      this.writing.set(false);
    }
  }
}
