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
import {RouterLink} from '@angular/router';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {LinksInsight} from '@pd/contracts';
import {needsSetup} from '@pd/web-core';
import {LifeApi} from '../life.api';
import {
  chanceOf,
  confounderLines,
  dayOf,
  insightSentence,
  valueOf,
  Wording,
} from './question-wording';

/**
 * The week's findings: what the engine found about the user's own days, worded by the AI (or,
 * without one, by the page), each with its proof on a button — the numbers behind it and
 * whether it holds within weekends, rain, illness and travel. On Home (`compact`) today's one.
 */
@Component({
  selector: 'pd-insights-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    RouterLink,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        @if (!compact()) {
          <mat-icon mat-card-avatar>lightbulb</mat-icon>
        }
        <mat-card-title>{{
          (compact() ? 'life.insights.today' : 'life.insights.title')
            | transloco
        }}</mat-card-title>
        @if (!compact()) {
          <mat-card-subtitle>{{
            'life.insights.hint' | transloco
          }}</mat-card-subtitle>
        }
      </mat-card-header>
      <mat-card-content>
        @if (data.error()) {
          <p class="muted">{{ 'life.insights.failed' | transloco }}</p>
        } @else if (data.hasValue()) {
          @if (items().length) {
            <ul class="insights">
              @for (item of items(); track item.insight.id) {
                @let insight = item.insight;
                <li>
                  <p class="text">{{ item.sentence }}</p>
                  @if (!compact() && item.proof.length) {
                    <button
                      matButton
                      type="button"
                      [attr.aria-expanded]="open() === insight.id"
                      (click)="toggle(insight)"
                    >
                      {{ 'life.insights.proof' | transloco }}
                    </button>
                    @if (open() === insight.id) {
                      <ul class="proof">
                        @for (line of item.proof; track line) {
                          <li>{{ line }}</li>
                        }
                      </ul>
                    }
                  }
                  @if (!compact() && item.check) {
                    <a
                      matButton
                      routerLink="/life/lab"
                      [queryParams]="item.check"
                    >
                      <mat-icon>science</mat-icon>
                      {{ 'life.lab.check' | transloco }}
                    </a>
                  }
                </li>
              }
            </ul>
          } @else {
            <p class="muted">
              {{
                (compact() ? 'life.insights.noneToday' : 'life.insights.none')
                  | transloco
              }}
            </p>
          }
          @if (!compact()) {
            <div class="actions">
              <button
                matButton
                type="button"
                [disabled]="refreshing()"
                (click)="refresh()"
              >
                <mat-icon>refresh</mat-icon>
                {{ 'life.insights.refresh' | transloco }}
              </button>
              @if (failed()) {
                <span class="error" role="alert">{{
                  'life.insights.refreshFailed' | transloco
                }}</span>
              }
            </div>
            <p class="muted">{{ 'life.insights.caution' | transloco }}</p>
          }
        }
      </mat-card-content>
      @if (compact()) {
        <mat-card-actions align="end">
          <a matButton routerLink="/life/links">{{
            'life.insights.open' | transloco
          }}</a>
        </mat-card-actions>
      }
    </mat-card>
  `,
  styles: `
    :host {
      display: block;
    }
    .insights {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
    }
    .text {
      margin: 0;
      font: var(--mat-sys-body-large);
      overflow-wrap: anywhere;
    }
    .proof {
      margin: 4px 0 0;
      padding-inline-start: 20px;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin-top: 12px;
    }
    .error {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-error);
    }
    .muted {
      margin: 8px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class InsightsCardComponent {
  private readonly api = inject(LifeApi);
  private readonly transloco = inject(TranslocoService);
  private readonly language = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  /** On Home: today's finding only. */
  readonly compact = input(false);

  protected readonly data = this.api.insights();
  protected readonly open = signal<string | null>(null);
  protected readonly refreshing = signal(false);
  protected readonly failed = signal(false);

  constructor() {
    // On Home: no findings yet is a widget waiting, not an empty card.
    needsSetup(
      () =>
        this.compact() &&
        this.data.hasValue() &&
        !this.data.value().insights.length,
    );
  }

  private readonly wording = computed<Wording>(() => ({
    locale: this.language(),
    translate: (key, params) => this.transloco.translate(key, params),
  }));

  /** The findings shown, worded once per answer and language. */
  protected readonly items = computed(() => {
    if (!this.data.hasValue()) {
      return [];
    }
    const {insights, today} = this.data.value();
    const shown = this.compact() ? insights.slice(today, today + 1) : insights;
    return shown.map(insight => ({
      insight,
      sentence: this.sentence(insight),
      proof: this.compact() ? [] : this.proof(insight),
      check: this.checkOf(insight),
    }));
  });

  /** A link of two daily numbers can be tried in the lab: its effect is the main number. */
  private checkOf(
    insight: LinksInsight,
  ): {hypothesis: string; metric: string} | null {
    const {fact} = insight;
    if (
      (fact.kind !== 'pair' && fact.kind !== 'question') ||
      fact.when === 'hourAfter'
    ) {
      return null;
    }
    return {hypothesis: this.sentence(insight), metric: fact.effect.key};
  }

  private sentence(insight: LinksInsight): string {
    return insight.text ?? insightSentence(insight.fact, this.wording());
  }

  /** The numbers behind a finding, and what it holds within. */
  private proof(insight: LinksInsight): string[] {
    const wording = this.wording();
    const {fact} = insight;
    const lines: string[] = [];
    if (insight.text) {
      // The AI's sentence: the plain one is the proof of it.
      lines.push(insightSentence(fact, wording));
    }
    if (fact.kind === 'pair' || fact.kind === 'question') {
      if (fact.answer.p !== null) {
        lines.push(
          this.transloco.translate('life.insights.sure', {
            p: chanceOf(fact.answer.p, wording),
          }),
        );
      }
      lines.push(...confounderLines(fact.answer, wording));
    }
    if (fact.kind === 'after') {
      lines.push(
        this.transloco.translate('life.insights.afterProof', {
          events: fact.events,
          difference: `${fact.difference > 0 ? '+' : '−'}${valueOf(fact.effect, Math.abs(fact.difference), wording)}`,
        }),
      );
    }
    if (fact.kind === 'change') {
      lines.push(
        this.transloco.translate('life.insights.changeProof', {
          day: dayOf(fact.day, wording),
          before: valueOf(fact.number, fact.before, wording),
          after: valueOf(fact.number, fact.after, wording),
        }),
      );
    }
    return lines;
  }

  /** Opens a finding's proof; opening one is counted (for the achievements). */
  protected toggle(insight: LinksInsight): void {
    if (this.open() === insight.id) {
      this.open.set(null);
      return;
    }
    this.open.set(insight.id);
    this.api
      .seen({kind: 'insight', key: insight.key})
      .subscribe({error: () => undefined});
  }

  protected refresh(): void {
    this.refreshing.set(true);
    this.failed.set(false);
    this.api.refreshInsights().subscribe({
      next: () => {
        this.refreshing.set(false);
        this.data.reload();
      },
      error: () => {
        this.refreshing.set(false);
        this.failed.set(true);
      },
    });
  }
}
