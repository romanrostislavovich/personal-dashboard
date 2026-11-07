import {toSignal} from '@angular/core/rxjs-interop';
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
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {LinksQuestionCard} from '@pd/contracts';
import {LifeApi} from '../life.api';
import {QuestionFormComponent} from './question-form.component';
import {
  answerSentence,
  confounderLines,
  nameOf,
  valueOf,
  Wording,
} from './question-wording';

/**
 * The owner's questions of their numbers: the built-in hypotheses and their own, each answered
 * from the days there are ("not enough days yet" otherwise), with whether it holds within
 * weekends, rain, illness and travel, and — asked so — only when another number is high or low.
 */
@Component({
  selector: 'pd-questions-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    QuestionFormComponent,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>help_center</mat-icon>
        <mat-card-title>{{
          'life.questions.title' | transloco
        }}</mat-card-title>
        <mat-card-subtitle>{{
          'life.questions.hint' | transloco
        }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (data.error()) {
          <p class="muted">{{ 'life.questions.failed' | transloco }}</p>
        } @else if (data.hasValue()) {
          <ul class="cards">
            @for (item of items(); track item.card.question.id) {
              <li [class.weak]="!item.card.answer.strong">
                <div class="head">
                  <span class="name">{{ item.title }}</span>
                  @if (!item.card.question.builtIn) {
                    <button
                      matIconButton
                      type="button"
                      [attr.aria-label]="'life.questions.remove' | transloco"
                      [disabled]="removing() === item.card.question.id"
                      (click)="remove(item.card)"
                    >
                      <mat-icon>delete</mat-icon>
                    </button>
                  }
                </div>
                <p class="answer">{{ item.sentence }}</p>
                @if (item.card.answer.status === 'answered') {
                  <p class="muted">
                    {{
                      (item.card.answer.strong
                        ? 'life.questions.strong'
                        : 'life.questions.unsure'
                      ) | transloco
                    }}
                    @for (line of item.lines; track line) {
                      · {{ line }}
                    }
                  </p>
                }
              </li>
            }
          </ul>
          @if (adding()) {
            <pd-question-form [catalog]="data.value()" (saved)="added()" />
          } @else {
            <button matButton type="button" (click)="adding.set(true)">
              <mat-icon>add</mat-icon>
              {{ 'life.questions.add' | transloco }}
            </button>
          }
          @if (removeFailed()) {
            <p class="error" role="alert">
              {{ 'life.questions.removeFailed' | transloco }}
            </p>
          }
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    :host {
      display: block;
    }
    .cards {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 8px 0 12px;
      padding: 0;
      list-style: none;
    }
    .head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .name {
      min-width: 0;
      font: var(--mat-sys-title-small);
      overflow-wrap: anywhere;
    }
    .answer {
      margin: 2px 0 0;
      overflow-wrap: anywhere;
    }
    .weak .answer {
      color: var(--mat-sys-on-surface-variant);
    }
    .muted {
      margin: 2px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      margin: 8px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-error);
    }
  `,
})
export class QuestionsCardComponent {
  private readonly api = inject(LifeApi);
  private readonly transloco = inject(TranslocoService);
  private readonly language = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  protected readonly data = this.api.questions();
  protected readonly adding = signal(false);
  protected readonly removing = signal<string | null>(null);
  protected readonly removeFailed = signal(false);

  /** The cards worded once per answer and language. */
  protected readonly items = computed(() => {
    if (!this.data.hasValue()) {
      return [];
    }
    const wording: Wording = {
      locale: this.language(),
      translate: (key, params) => this.transloco.translate(key, params),
    };
    return this.data.value().cards.map(card => ({
      card,
      title: this.titleOf(card, wording),
      sentence:
        card.cause && card.effect
          ? answerSentence(
              card.cause,
              card.effect,
              card.question.when,
              card.answer,
              wording,
            )
          : this.transloco.translate('life.questions.missing'),
      lines: [
        ...confounderLines(card.answer, wording),
        ...this.conditionLines(card, wording),
      ],
    }));
  });

  protected added(): void {
    this.adding.set(false);
    this.data.reload();
  }

  protected remove(card: LinksQuestionCard): void {
    this.removing.set(card.question.id);
    this.removeFailed.set(false);
    this.api.removeQuestion(card.question.id).subscribe({
      next: () => {
        this.removing.set(null);
        this.data.reload();
      },
      error: () => {
        this.removing.set(null);
        this.removeFailed.set(true);
      },
    });
  }

  /** The owner's own words, else "A → B". */
  private titleOf(card: LinksQuestionCard, wording: Wording): string {
    if (card.question.title) {
      return card.question.title;
    }
    const name = (key: string, number: LinksQuestionCard['cause']) =>
      number ? nameOf(number, wording) : key;
    return `${name(card.question.cause, card.cause)} → ${name(card.question.effect, card.effect)}`;
  }

  /** "Only when sleep is low: −1.5; when high: −0.1". */
  private conditionLines(card: LinksQuestionCard, wording: Wording): string[] {
    const {condition} = card.answer;
    const {effect} = card;
    if (!condition || !card.condition || !effect) {
      return [];
    }
    const value = (difference: number | null) =>
      difference === null
        ? '—'
        : `${difference > 0 ? '+' : '−'}${valueOf(effect, Math.abs(difference), wording)}`;
    return [
      this.transloco.translate('life.questions.condition', {
        what: nameOf(card.condition, wording),
        high: value(condition.whenHigh),
        low: value(condition.whenLow),
      }),
    ];
  }
}
