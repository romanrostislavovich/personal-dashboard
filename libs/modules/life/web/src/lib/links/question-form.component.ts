import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {toSignal} from '@angular/core/rxjs-interop';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {errorBody, errorStatus} from '@pd/web-core';
import {
  LinksQuestions,
  QUESTION_WHEN,
  QUESTION_REJECTIONS,
  QuestionInput,
  QuestionNumber,
  QuestionRejection,
  QuestionWhen,
} from '@pd/contracts';
import {LifeApi} from '../life.api';

/**
 * A new question: picked from the numbers ("A → B", when, and optionally "only when C is high or
 * low"), or put in words for the AI to turn into the same choice to check and keep.
 */
@Component({
  selector: 'pd-question-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    TranslocoPipe,
  ],
  template: `
    <mat-button-toggle-group
      hideSingleSelectionIndicator
      [value]="mode()"
      (change)="mode.set($event.value)"
      [attr.aria-label]="'life.questions.form.mode' | transloco"
    >
      <mat-button-toggle value="pick">{{
        'life.questions.form.pick' | transloco
      }}</mat-button-toggle>
      <mat-button-toggle value="words">{{
        'life.questions.form.words' | transloco
      }}</mat-button-toggle>
    </mat-button-toggle-group>

    @if (mode() === 'words') {
      <mat-form-field class="wide" subscriptSizing="dynamic">
        <mat-label>{{ 'life.questions.form.text' | transloco }}</mat-label>
        <textarea
          matInput
          rows="2"
          maxlength="500"
          [(ngModel)]="text"
        ></textarea>
      </mat-form-field>
      <button
        matButton="tonal"
        type="button"
        [disabled]="busy() || text().trim().length < 3"
        (click)="draft()"
      >
        {{ 'life.questions.form.draft' | transloco }}
      </button>
    }

    @if (mode() === 'pick' || picked()) {
      <div class="fields">
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>{{ 'life.questions.form.when' | transloco }}</mat-label>
          <mat-select [(ngModel)]="when" (ngModelChange)="edited()">
            @for (option of whens; track option) {
              <mat-option [value]="option">{{
                'life.questions.when.' + option | transloco
              }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>{{ 'life.questions.form.cause' | transloco }}</mat-label>
          <mat-select [(ngModel)]="cause" (ngModelChange)="edited()">
            @for (option of causes(); track option.key) {
              <mat-option [value]="option.key">{{ option.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>{{ 'life.questions.form.effect' | transloco }}</mat-label>
          <mat-select [(ngModel)]="effect" (ngModelChange)="edited()">
            @for (option of effects(); track option.key) {
              <mat-option [value]="option.key">{{ option.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (when() !== 'hourAfter') {
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{
              'life.questions.form.condition' | transloco
            }}</mat-label>
            <mat-select [(ngModel)]="condition">
              <mat-option [value]="''">{{
                'life.questions.form.always' | transloco
              }}</mat-option>
              @for (option of numbers(); track option.key) {
                <mat-option [value]="option.key">{{ option.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          @if (condition()) {
            <mat-button-toggle-group
              hideSingleSelectionIndicator
              [value]="conditionHigh()"
              (change)="conditionHigh.set($event.value)"
              [attr.aria-label]="'life.questions.form.condition' | transloco"
            >
              <mat-button-toggle [value]="true">{{
                'life.questions.form.high' | transloco
              }}</mat-button-toggle>
              <mat-button-toggle [value]="false">{{
                'life.questions.form.low' | transloco
              }}</mat-button-toggle>
            </mat-button-toggle-group>
          }
        }
      </div>
      <button
        matButton="filled"
        type="button"
        [disabled]="busy() || !ready()"
        (click)="save()"
      >
        {{ 'life.questions.form.save' | transloco }}
      </button>
    }
    <button matButton type="button" (click)="cancelled.emit()">
      {{ 'core.actions.cancel' | transloco }}
    </button>
    @if (error(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: flex-start;
      margin-top: 12px;
    }
    .wide,
    .fields {
      width: 100%;
    }
    .fields {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
      gap: 8px 12px;
      align-items: center;
    }
    .error {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-error);
    }
  `,
})
export class QuestionFormComponent {
  private readonly api = inject(LifeApi);
  private readonly transloco = inject(TranslocoService);

  readonly catalog = input.required<LinksQuestions>();
  readonly saved = output<void>();
  readonly cancelled = output<void>();
  private readonly language = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  protected readonly whens = QUESTION_WHEN;
  protected readonly mode = signal<'pick' | 'words'>('pick');
  protected readonly text = signal('');
  protected readonly when = signal<QuestionWhen>('sameDay');
  protected readonly cause = signal('');
  protected readonly effect = signal('');
  protected readonly condition = signal('');
  protected readonly conditionHigh = signal(true);
  /** The AI's card came back: the choice is shown to check before keeping it. */
  protected readonly picked = signal(false);
  private readonly title = signal<string | undefined>(undefined);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  /** By name in the language, so a list reads and stays in order. */
  private readonly named = (list: QuestionNumber[]) => {
    const language = this.language();
    return list
      .map(one => ({
        key: one.key,
        name: one.label ?? this.transloco.translate<string>(one.labelKey),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, language));
  };
  protected readonly numbers = computed(() =>
    this.named(this.catalog().numbers),
  );
  /** An event before the hour after it; a daily number before a day. */
  protected readonly causes = computed(() =>
    this.when() === 'hourAfter'
      ? this.named(this.catalog().events)
      : this.numbers(),
  );
  protected readonly effects = computed(() =>
    this.when() === 'hourAfter'
      ? this.named(this.catalog().hourly)
      : this.numbers(),
  );
  protected readonly ready = computed(
    () =>
      this.causes().some(one => one.key === this.cause()) &&
      this.effects().some(one => one.key === this.effect()) &&
      this.cause() !== this.effect(),
  );

  /** The words to the AI; its card fills the choice, nothing is kept yet. */
  protected draft(): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.draftQuestion(this.text().trim()).subscribe({
      next: input => {
        this.busy.set(false);
        this.fill(input);
        this.picked.set(true);
      },
      error: (failure: unknown) => {
        this.busy.set(false);
        this.error.set(this.refusal(failure, 'draftFailed'));
      },
    });
  }

  protected save(): void {
    this.busy.set(true);
    this.error.set(null);
    const input: QuestionInput = {
      ...(this.title() ? {title: this.title()} : {}),
      cause: this.cause(),
      effect: this.effect(),
      when: this.when(),
      ...(this.when() !== 'hourAfter' && this.condition()
        ? {condition: {key: this.condition(), high: this.conditionHigh()}}
        : {}),
    };
    this.api.addQuestion(input).subscribe({
      next: () => {
        this.busy.set(false);
        this.reset();
        this.saved.emit();
      },
      error: (failure: unknown) => {
        this.busy.set(false);
        this.error.set(this.refusal(failure, 'saveFailed'));
      },
    });
  }

  /** A choice changed by hand: the AI's words no longer name it. */
  protected edited(): void {
    this.title.set(undefined);
  }

  /**
   * Why it did not go, in the page's language: a reason the server names, else the AI's own
   * words (a 422 without one), else the general failure.
   */
  private refusal(failure: unknown, otherwise: string): string {
    const body = errorBody(failure) as {
      reason?: unknown;
      message?: unknown;
    } | null;
    const reason = body?.reason;
    if (
      typeof reason === 'string' &&
      (QUESTION_REJECTIONS as readonly string[]).includes(reason)
    ) {
      return this.transloco.translate(
        `life.questions.form.reason.${reason as QuestionRejection}`,
      );
    }
    if (errorStatus(failure) === 422 && typeof body?.message === 'string') {
      return body.message;
    }
    return this.transloco.translate(`life.questions.form.${otherwise}`);
  }

  private fill(input: QuestionInput): void {
    this.title.set(input.title);
    this.when.set(input.when);
    this.cause.set(input.cause);
    this.effect.set(input.effect);
    this.condition.set(input.condition?.key ?? '');
    this.conditionHigh.set(input.condition?.high ?? true);
  }

  private reset(): void {
    this.fill({cause: '', effect: '', when: 'sameDay'});
    this.text.set('');
    this.picked.set(false);
  }
}
