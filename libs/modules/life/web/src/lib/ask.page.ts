import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MarkdownPipe } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { LifeApi } from './life.api';

const EXAMPLES = ['life.ask.example1', 'life.ask.example2', 'life.ask.example3'];

/**
 * A question about one's own life ("when was I in Prague?"): the AI searches the diary and the
 * other modules with its tools and answers with links to the days.
 */
@Component({
  selector: 'pd-life-ask-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Links in the answer are plain anchors: caught here to open them inside the app.
  host: { '(click)': 'follow($event)' },
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MarkdownPipe,
    TranslocoPipe,
  ],
  template: `
    <form class="question" (ngSubmit)="ask()">
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>{{ 'life.ask.label' | transloco }}</mat-label>
        <input
          matInput
          name="question"
          maxlength="500"
          [ngModel]="question()"
          (ngModelChange)="question.set($event)"
          [placeholder]="'life.ask.placeholder' | transloco"
        />
      </mat-form-field>
      <button
        matButton="filled"
        type="submit"
        [disabled]="asking() || question().trim().length < 2"
      >
        <mat-icon>search</mat-icon> {{ 'life.ask.submit' | transloco }}
      </button>
    </form>

    @if (!answer() && !asking()) {
      <div class="examples">
        @for (example of examples; track example) {
          <button matButton="outlined" (click)="askExample(example)">
            {{ example | transloco }}
          </button>
        }
      </div>
      <p class="hint">{{ 'life.ask.hint' | transloco }}</p>
    }

    @if (asking()) {
      <mat-progress-bar mode="indeterminate" />
    }
    @if (answer(); as text) {
      <div class="answer" [innerHTML]="text | markdown"></div>
    }
    @if (error()) {
      <p class="error">{{ 'life.ask.error' | transloco }}</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 860px;
    }
    .question {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
    }
    .question mat-form-field {
      flex: 1;
      min-width: min(320px, 100%);
    }
    .examples {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .answer {
      font: var(--mat-sys-body-large);
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class AskPage {
  private readonly api = inject(LifeApi);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  protected readonly examples = EXAMPLES;

  /** `/life/ask?q=…` (from the command palette) asks right away. */
  protected readonly question = signal(
    inject(ActivatedRoute).snapshot.queryParamMap.get('q') ?? '',
  );
  protected readonly answer = signal<string | null>(null);
  protected readonly asking = signal(false);
  protected readonly error = signal(false);

  constructor() {
    if (this.question().trim().length >= 2) {
      void this.ask();
    }
  }

  protected async ask(): Promise<void> {
    const question = this.question().trim();
    if (question.length < 2 || this.asking()) {
      return;
    }
    this.asking.set(true);
    this.error.set(false);
    this.answer.set(null);
    try {
      this.answer.set((await firstValueFrom(this.api.ask(question))).answer);
    } catch {
      this.error.set(true);
    } finally {
      this.asking.set(false);
    }
  }

  protected askExample(key: string): Promise<void> {
    this.question.set(this.transloco.translate(key));
    return this.ask();
  }

  /** The answer's links to the days open inside the app, not as a new page load. */
  protected follow(event: MouseEvent): void {
    const link = (event.target as HTMLElement).closest('a');
    const href = link?.getAttribute('href');
    if (href?.startsWith('/')) {
      event.preventDefault();
      void this.router.navigateByUrl(href);
    }
  }
}
