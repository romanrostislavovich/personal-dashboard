import {httpResource} from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {Router, RouterLink} from '@angular/router';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {CORE_READS} from '@pd/client-core';
import {InboxAction, InboxItem} from '@pd/contracts';
import {errorBody} from '../client/core-requests';
import {inboxTime, InboxStore} from './inbox.store';

/** After an answer, the next question comes by itself after this long. */
const NEXT_AFTER_MS = 1500;

/** Buttons as rows: where they say (ratings 1–5, 6–10), else as many as fit. */
export function buttonRows(actions: InboxAction[]): InboxAction[][] {
  if (!actions.some(action => action.newRow)) {
    return [actions];
  }
  const rows: InboxAction[][] = [];
  for (const action of actions) {
    if (!rows.length || action.newRow) {
      rows.push([]);
    }
    rows[rows.length - 1].push(action);
  }
  return rows;
}

/**
 * A notification's card — what a tap on the phone and a row of the bell open: its text, its
 * buttons, the words a button asks for, and then the next question waiting, so a morning's
 * questions are answered one after another.
 */
@Component({
  selector: 'pd-notification-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, RouterLink, TranslocoPipe],
  template: `
    <a matButton class="back" routerLink="/notifications">
      <mat-icon>arrow_back</mat-icon> {{ 'core.inbox.title' | transloco }}
    </a>

    @if (item.value(); as n) {
      <article class="card">
        <p class="time">{{ time(n.createdAt) }}</p>
        <h1>{{ n.title }}</h1>
        @if (n.body) {
          <p class="body">{{ n.body }}</p>
        }

        @if (reply(); as text) {
          <p class="reply">
            <mat-icon inline>check_circle</mat-icon> {{ text }}
          </p>
        } @else if (n.answeredAt) {
          <p class="reply">
            <mat-icon inline>check_circle</mat-icon>
            {{ 'core.inbox.answered' | transloco: {answer: n.answer} }}
            @if (n.answeredVia) {
              · {{ 'core.inbox.via.' + n.answeredVia | transloco }}
            }
          </p>
        }

        @if (askingWords()) {
          <form class="words" (submit)="$event.preventDefault(); sendWords()">
            <textarea
              rows="3"
              [placeholder]="'core.inbox.wordsHint' | transloco"
              [value]="words()"
              (input)="words.set($any($event.target).value)"
            ></textarea>
            <div class="row">
              <button
                matButton="filled"
                type="submit"
                [disabled]="busy() || !words().trim()"
              >
                {{ 'core.inbox.save' | transloco }}
              </button>
              <button matButton type="button" (click)="skipWords()">
                {{ 'core.inbox.skip' | transloco }}
              </button>
            </div>
          </form>
        } @else if (!n.answeredAt && n.actions.length && !reply()) {
          <div class="buttons">
            @for (row of rows(); track $index) {
              <div class="row">
                @for (button of row; track button.action) {
                  <button
                    matButton="tonal"
                    [disabled]="busy()"
                    (click)="press(button.action)"
                  >
                    {{ button.label }}
                  </button>
                }
              </div>
            }
          </div>
        }

        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }

        <footer>
          <a matButton [routerLink]="n.link">{{
            'core.inbox.openSection' | transloco
          }}</a>
          @if (done()) {
            @if (next(); as following) {
              <a
                matButton="filled"
                [routerLink]="['/notifications', following.id]"
              >
                {{ 'core.inbox.next' | transloco: {count: nextCount()} }}
              </a>
            } @else {
              <span class="all-done">{{
                'core.inbox.allAnswered' | transloco
              }}</span>
            }
          }
        </footer>
      </article>
    } @else if (item.error()) {
      <p class="error">{{ 'core.inbox.gone' | transloco }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
      max-width: 640px;
    }
    .back {
      margin-bottom: 8px;
    }
    .card {
      padding: 20px;
      border-radius: 20px;
      background: var(--mat-sys-surface-container);
    }
    .time {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-medium);
    }
    h1 {
      margin: 4px 0 8px;
      font: var(--mat-sys-headline-small);
    }
    .body {
      margin: 0 0 16px;
      white-space: pre-line;
    }
    .buttons,
    .words {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 16px 0;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .buttons button {
      min-width: 48px;
    }
    textarea {
      padding: 10px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
      background: transparent;
      color: inherit;
      font: var(--mat-sys-body-medium);
      resize: vertical;
    }
    .reply {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--pd-success);
    }
    .error {
      color: var(--mat-sys-error);
    }
    footer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-top: 12px;
    }
    .all-done {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class NotificationPage {
  private readonly store = inject(InboxStore);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  /** From the route (`/notifications/:id`). */
  readonly id = input.required<string>();

  protected readonly item = httpResource<InboxItem>(() => {
    this.store.version();
    return CORE_READS.inboxItem(this.id());
  });
  private readonly waiting = httpResource<InboxItem[]>(
    () => {
      this.store.version();
      return CORE_READS.inbox({filter: 'questions', limit: 20});
    },
    {defaultValue: []},
  );

  protected readonly reply = signal<string | null>(null);
  protected readonly askingWords = signal(false);
  protected readonly words = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly rows = computed(() =>
    buttonRows(this.item.value()?.actions ?? []),
  );
  /** Nothing more to do here: answered, or nothing to answer. */
  protected readonly done = computed(() => {
    const item = this.item.value();
    return (
      !!item && !this.askingWords() && (!item.waiting || this.reply() !== null)
    );
  });
  private readonly others = computed(() =>
    this.waiting.value().filter(one => one.id !== this.id()),
  );
  protected readonly next = computed(() => this.others()[0] ?? null);
  protected readonly nextCount = computed(() => this.others().length);

  constructor() {
    this.store.start();
    // Another card: its own state.
    effect(() => {
      this.id();
      untracked(() => {
        this.reply.set(null);
        this.askingWords.set(false);
        this.words.set('');
        this.error.set(null);
      });
    });
    // Opened is read; and words its answer asked for (pressed in the phone's shade or in
    // Telegram a moment ago) are asked for here too.
    effect(() => {
      const item = this.item.value();
      if (item && !item.readAt) {
        untracked(() => void this.store.markRead(item.id));
      }
      if (item?.awaitsWords) {
        untracked(() => this.askingWords.set(true));
      }
    });
  }

  protected time(iso: string): string {
    return inboxTime(
      iso,
      this.transloco.getActiveLang(),
      this.transloco.translate('core.inbox.yesterday'),
    );
  }

  protected async press(action: string): Promise<void> {
    await this.run(async () => {
      const result = await this.store.answer(this.id(), {action});
      this.reply.set(result.reply);
      this.askingWords.set(result.expectsText);
      if (!result.expectsText) {
        this.goNextSoon();
      }
    });
  }

  protected async sendWords(): Promise<void> {
    await this.run(async () => {
      const result = await this.store.answer(this.id(), {
        text: this.words().trim(),
      });
      this.reply.set(result.reply);
      this.askingWords.set(false);
      this.goNextSoon();
    });
  }

  protected skipWords(): void {
    this.askingWords.set(false);
    this.goNextSoon();
  }

  private async run(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await work();
    } catch (error) {
      // The section's own words ("nothing waits for words…"), or a plain "did not work".
      const message = (errorBody(error) as {message?: unknown} | null)?.message;
      this.error.set(
        typeof message === 'string'
          ? message
          : this.transloco.translate('core.inbox.failed'),
      );
    } finally {
      this.busy.set(false);
    }
  }

  /** The next question waiting, by itself — the morning's questions one after another. */
  private goNextSoon(): void {
    const id = this.id();
    setTimeout(() => {
      const next = this.next();
      if (next && this.id() === id) {
        void this.router.navigate(['/notifications', next.id]);
      }
    }, NEXT_AFTER_MS);
  }
}
