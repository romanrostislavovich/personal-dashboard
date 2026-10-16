import { Clipboard } from '@angular/cdk/clipboard';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  applyFix,
  pieces,
  WRITING_REWRITE_MODES,
  WritingConfig,
  WritingIssue,
  WritingRewriteMode,
} from '@pd/contracts';
import { errorStatus } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { WritingApi } from './writing.api';

/** A pause in typing this long and the text is checked. */
const CHECK_AFTER_MS = 800;

/**
 * A text checked as it is typed: the mistakes underlined behind the field (a copy of the text
 * with marks lies under a transparent textarea), the list of them with their fixes, and the
 * AI's rewrites of the whole text.
 */
@Component({
  selector: 'pd-writing-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-content>
        <div class="editor">
          <div class="marks" aria-hidden="true" #marks>
            <!-- Text only through properties: the spaces must stay exactly as typed. -->
            @for (piece of marked(); track $index) {
              <span
                [class]="piece.issue ? 'mark ' + piece.issue.kind : null"
                [class.active]="!!piece.issue && piece.issue === active()"
                [textContent]="piece.text"
              ></span>
            }
            <!-- A last empty line keeps its height. -->
            <br />
          </div>
          <textarea
            #field
            spellcheck="false"
            [attr.aria-label]="'writing.editor.label' | transloco"
            [placeholder]="'writing.editor.placeholder' | transloco"
            [value]="text()"
            (input)="typed($any($event.target).value)"
            (scroll)="syncScroll()"
            (click)="pick()"
            (keyup)="pick()"
          ></textarea>
        </div>
        @if (checking()) {
          <mat-progress-bar mode="indeterminate" />
        }
        <div class="toolbar">
          <span class="status">
            @if (error(); as key) {
              <span class="error">{{ key | transloco }}</span>
            } @else if (text().trim()) {
              {{ 'writing.editor.found' | transloco: { count: issues().length } }}
              @if (language(); as code) {
                · {{ code }}
              }
            }
          </span>
          <button
            matIconButton
            [matTooltip]="'writing.editor.copy' | transloco"
            [attr.aria-label]="'writing.editor.copy' | transloco"
            [disabled]="!text()"
            (click)="clipboard.copy(text())"
          >
            <mat-icon>content_copy</mat-icon>
          </button>
        </div>
        @if (config().canRewrite) {
          <div class="rewrite">
            @for (mode of modes; track mode) {
              <button
                matButton="tonal"
                [disabled]="!text().trim() || rewriting()"
                (click)="rewrite(mode)"
              >
                {{ 'writing.rewrite.' + mode | transloco }}
              </button>
            }
          </div>
        }
      </mat-card-content>
    </mat-card>

    @if (rewritten(); as proposal) {
      <mat-card appearance="outlined" class="proposal">
        <mat-card-header>
          <mat-card-title>✨ {{ 'writing.rewrite.title' | transloco }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <p class="proposal-text">{{ proposal }}</p>
        </mat-card-content>
        <mat-card-actions>
          <button matButton="filled" (click)="accept(proposal)">
            {{ 'writing.rewrite.accept' | transloco }}
          </button>
          <button matButton (click)="clipboard.copy(proposal)">
            {{ 'writing.editor.copy' | transloco }}
          </button>
          <button matButton (click)="rewritten.set(null)">
            {{ 'writing.rewrite.discard' | transloco }}
          </button>
        </mat-card-actions>
      </mat-card>
    }

    @if (issues().length) {
      <mat-card appearance="outlined">
        <mat-card-content>
          <ul class="issues">
            @for (issue of issues(); track issue.offset + ':' + issue.ruleId) {
              <li [class.active]="issue === active()" (mouseenter)="active.set(issue)">
                <span class="kind" [class]="issue.kind">
                  {{ 'writing.kinds.' + issue.kind | transloco }}
                </span>
                <span class="body">
                  <span class="word">{{ wordOf(issue) }}</span>
                  <span class="message">{{ issue.message }}</span>
                  <span class="fixes">
                    @for (replacement of issue.replacements; track replacement) {
                      <button matButton="tonal" (click)="fix(issue, replacement)">
                        {{ replacement || ('writing.editor.remove' | transloco) }}
                      </button>
                    }
                    @if (issue.kind === 'spelling') {
                      <button matButton (click)="ignored.emit({ word: wordOf(issue) })">
                        {{ 'writing.editor.addWord' | transloco }}
                      </button>
                    }
                    <button matButton (click)="ignored.emit({ ruleId: issue.ruleId })">
                      {{ 'writing.editor.neverShow' | transloco }}
                    </button>
                  </span>
                </span>
              </li>
            }
          </ul>
        </mat-card-content>
      </mat-card>
    }
  `,
  styleUrl: './writing-editor.component.scss',
})
export class WritingEditorComponent {
  private readonly api = inject(WritingApi);
  protected readonly clipboard = inject(Clipboard);

  readonly config = input.required<WritingConfig>();
  /** A word for the dictionary or a rule to switch off: the page saves it and checks again. */
  readonly ignored = output<{ word: string } | { ruleId: string }>();

  private readonly field = viewChild.required<ElementRef<HTMLTextAreaElement>>('field');
  private readonly marksBox = viewChild.required<ElementRef<HTMLDivElement>>('marks');

  protected readonly modes = WRITING_REWRITE_MODES;
  protected readonly text = signal('');
  protected readonly issues = signal<WritingIssue[]>([]);
  protected readonly language = signal<string | null>(null);
  protected readonly active = signal<WritingIssue | null>(null);
  protected readonly checking = signal(false);
  protected readonly rewriting = signal(false);
  protected readonly rewritten = signal<string | null>(null);
  /** A translation key. */
  protected readonly error = signal<string | null>(null);
  protected readonly marked = computed(() => pieces(this.text(), this.issues()));

  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Only the answer to the latest check counts. */
  private checkNumber = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timer && clearTimeout(this.timer));
  }

  /** Checks the text again now (a word was added to the dictionary, a rule switched off). */
  recheck(): void {
    void this.check();
  }

  protected typed(value: string): void {
    this.text.set(value);
    // The marks are stale the moment the text changes: they go until the next answer.
    this.issues.set([]);
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => void this.check(), CHECK_AFTER_MS);
  }

  protected syncScroll(): void {
    this.marksBox().nativeElement.scrollTop = this.field().nativeElement.scrollTop;
  }

  /** The mistake under the caret is the one shown in the list. */
  protected pick(): void {
    const caret = this.field().nativeElement.selectionStart;
    this.active.set(
      this.issues().find(
        (issue) => caret >= issue.offset && caret <= issue.offset + issue.length,
      ) ?? null,
    );
  }

  protected wordOf(issue: WritingIssue): string {
    return this.text().slice(issue.offset, issue.offset + issue.length);
  }

  protected fix(issue: WritingIssue, replacement: string): void {
    const fixed = applyFix(this.text(), this.issues(), issue, replacement);
    this.text.set(fixed.text);
    this.issues.set(fixed.issues);
    this.active.set(null);
  }

  protected async rewrite(mode: WritingRewriteMode): Promise<void> {
    this.rewriting.set(true);
    this.error.set(null);
    try {
      const { text } = await firstValueFrom(this.api.rewrite({ text: this.text(), mode }));
      this.rewritten.set(text);
    } catch {
      this.error.set('writing.errors.rewrite');
    } finally {
      this.rewriting.set(false);
    }
  }

  protected accept(text: string): void {
    this.rewritten.set(null);
    this.typed(text);
  }

  private async check(): Promise<void> {
    const text = this.text();
    if (!this.config().canCheck || !text.trim()) {
      this.issues.set([]);
      return;
    }
    const number = ++this.checkNumber;
    this.checking.set(true);
    try {
      const result = await firstValueFrom(this.api.check({ text }));
      if (number === this.checkNumber && text === this.text()) {
        this.issues.set(result.issues);
        this.language.set(result.language);
        this.error.set(null);
      }
    } catch (error) {
      if (number === this.checkNumber) {
        this.error.set(
          errorStatus(error) === 429 ? 'writing.errors.tooOften' : 'writing.errors.check',
        );
      }
    } finally {
      if (number === this.checkNumber) {
        this.checking.set(false);
      }
    }
  }
}
