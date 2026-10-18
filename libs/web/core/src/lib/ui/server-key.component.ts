import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import { errorStatus } from '../client/core-requests';

/** A field of a server key: a token, a Client ID, an address. */
export interface ServerKeyField {
  name: string;
  /** Translation key of the label. */
  label: string;
  /** Typed as a password, and never shown again once saved. */
  secret?: boolean;
  /** Several lines: a private key (PEM). Never shown again once saved either. */
  multiline?: boolean;
  placeholder?: string;
}

/**
 * The owner's part of an integration card: the server's own key at the service (the Telegram
 * bot, the Spotify app, the LanguageTool server), once for every user of the dashboard. Shown
 * only to the owner; the server checks the key with the service before it keeps it.
 */
@Component({
  selector: 'pd-server-key',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, TranslocoPipe],
  template: `
    <section>
      <p class="title">
        <mat-icon>key</mat-icon>
        {{ 'core.serverKey.title' | transloco }}
      </p>
      @if (set() && !editing()) {
        <p>
          {{ 'core.serverKey.set' | transloco }}
          @if (summary()) {
            · <code>{{ summary() }}</code>
          }
        </p>
        @if (problem()) {
          <p class="error">{{ problem() }}</p>
        }
        <div class="actions">
          <button matButton (click)="edit()">{{ 'core.serverKey.change' | transloco }}</button>
          <button matButton (click)="clear()" [disabled]="busy()">
            {{ 'core.serverKey.remove' | transloco }}
          </button>
        </div>
      } @else {
        <form (submit)="submit($event)">
          @for (field of fields(); track field.name) {
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ field.label | transloco }}</mat-label>
              @if (field.multiline) {
                <textarea
                  matInput
                  rows="4"
                  class="multiline"
                  autocomplete="off"
                  spellcheck="false"
                  [placeholder]="field.placeholder ?? ''"
                  [value]="values()[field.name] ?? ''"
                  (input)="type(field.name, $event)"
                ></textarea>
              } @else {
                <input
                  matInput
                  [type]="field.secret ? 'password' : 'text'"
                  autocomplete="off"
                  spellcheck="false"
                  [placeholder]="field.placeholder ?? ''"
                  [value]="values()[field.name] ?? ''"
                  (input)="type(field.name, $event)"
                />
              }
            </mat-form-field>
          }
          @if (failure(); as failure) {
            <p class="error">{{ 'core.serverKey.' + failure | transloco }}</p>
          }
          <div class="actions">
            <button matButton="filled" type="submit" [disabled]="busy() || !complete()">
              {{ (busy() ? 'core.serverKey.checking' : 'core.serverKey.save') | transloco }}
            </button>
            @if (set()) {
              <button matButton type="button" (click)="editing.set(false)">
                {{ 'core.serverKey.cancel' | transloco }}
              </button>
            }
          </div>
        </form>
      }
    </section>
  `,
  styles: `
    section {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }
    .title {
      display: flex;
      align-items: center;
      gap: 8px;
      font: var(--mat-sys-title-small);
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .error {
      color: var(--mat-sys-error);
    }
    code {
      word-break: break-all;
    }
    .multiline {
      font-family: ui-monospace, Consolas, monospace;
      font-size: 12px;
    }
  `,
})
export class ServerKeyComponent {
  readonly fields = input.required<ServerKeyField[]>();
  /** The key is saved. */
  readonly set = input(false);
  /** What tells the saved key apart: the bot's name, the Client ID, the address. */
  readonly summary = input<string | null>(null);
  /** Why the saved key does not work now. */
  readonly problem = input<string | null>(null);
  /** The fields that are not secret, as saved. */
  readonly initial = input<Record<string, string | null>>({});
  readonly save = input.required<(values: Record<string, string>) => Promise<unknown>>();
  readonly remove = input.required<() => Promise<unknown>>();
  /** Saved or removed: the card reads its state again. */
  readonly changed = output<void>();

  protected readonly editing = signal(false);
  protected readonly busy = signal(false);
  protected readonly failure = signal<'rejected' | 'failed' | null>(null);
  private readonly typed = signal<Record<string, string>>({});
  protected readonly values = computed(() => ({
    ...this.nonEmpty(this.initial()),
    ...this.typed(),
  }));
  protected readonly complete = computed(() =>
    this.fields().every((field) => this.values()[field.name]?.trim()),
  );

  protected edit(): void {
    this.typed.set({});
    this.failure.set(null);
    this.editing.set(true);
  }

  protected type(name: string, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.typed.update((typed) => ({ ...typed, [name]: value }));
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const values = Object.fromEntries(
      this.fields().map((field) => [field.name, (this.values()[field.name] ?? '').trim()]),
    );
    await this.run(() => this.save()(values));
  }

  protected clear(): Promise<void> {
    return this.run(() => this.remove()());
  }

  private async run(request: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);
    try {
      await request();
      this.typed.set({});
      this.editing.set(false);
      this.changed.emit();
    } catch (error) {
      // 400 — the service did not take the key (or the format is wrong).
      this.failure.set(errorStatus(error) === 400 ? 'rejected' : 'failed');
    } finally {
      this.busy.set(false);
    }
  }

  private nonEmpty(values: Record<string, string | null>): Record<string, string> {
    return Object.fromEntries(
      Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
  }
}
