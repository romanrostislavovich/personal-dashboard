import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { PsychologyNote } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { PsychologyApi, today } from './psychology.api';

/** Notes about oneself: what one noticed — a reaction, a habit, a thought — a day each. */
@Component({
  selector: 'pd-psychology-notes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-content class="form">
        <mat-form-field subscriptSizing="dynamic" class="text">
          <mat-label>{{ 'psychology.notes.placeholder' | transloco }}</mat-label>
          <textarea
            matInput
            rows="3"
            maxlength="5000"
            [value]="text()"
            (input)="text.set($any($event.target).value)"
          ></textarea>
        </mat-form-field>
        <div class="row">
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'psychology.day' | transloco }}</mat-label>
            <input
              matInput
              type="date"
              [value]="day()"
              [max]="today"
              (change)="day.set($any($event.target).value)"
            />
          </mat-form-field>
          <button matButton="filled" [disabled]="!text().trim() || !day()" (click)="save()">
            {{ (editing() ? 'core.actions.save' : 'core.actions.add') | transloco }}
          </button>
          @if (editing()) {
            <button matButton (click)="cancel()">{{ 'core.actions.cancel' | transloco }}</button>
          }
        </div>
      </mat-card-content>
    </mat-card>

    @for (note of notes.value(); track note.id) {
      <mat-card appearance="outlined">
        <mat-card-content class="note">
          <span class="body">
            <span class="hint">{{ note.day | date: 'd MMMM y' }}</span>
            <span class="words">{{ note.text }}</span>
          </span>
          <button
            matIconButton
            [attr.aria-label]="'core.actions.edit' | transloco"
            (click)="edit(note)"
          >
            <mat-icon>edit</mat-icon>
          </button>
          <button
            matIconButton
            [attr.aria-label]="'core.actions.delete' | transloco"
            (click)="remove(note)"
          >
            <mat-icon>delete</mat-icon>
          </button>
        </mat-card-content>
      </mat-card>
    } @empty {
      @if (!notes.isLoading()) {
        <p class="hint">{{ 'psychology.notes.empty' | transloco }}</p>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-top: 16px;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
    }
    .note {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding-top: 16px;
    }
    .body {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .words {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .hint {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class NotesPage {
  private readonly api = inject(PsychologyApi);
  private readonly transloco = inject(TranslocoService);

  protected readonly today = today();
  protected readonly notes = this.api.notes();
  protected readonly text = signal('');
  protected readonly day = signal(this.today);
  /** The id of the note being changed; `null` — a new one is written. */
  protected readonly editing = signal<string | null>(null);

  protected async save(): Promise<void> {
    await firstValueFrom(
      this.api.saveNote({ day: this.day(), text: this.text().trim() }, this.editing() ?? undefined),
    );
    this.cancel();
    this.notes.reload();
  }

  protected edit(note: PsychologyNote): void {
    this.editing.set(note.id);
    this.text.set(note.text);
    this.day.set(note.day);
  }

  protected cancel(): void {
    this.editing.set(null);
    this.text.set('');
    this.day.set(this.today);
  }

  protected async remove(note: PsychologyNote): Promise<void> {
    if (confirm(this.transloco.translate('psychology.notes.confirmDelete'))) {
      await firstValueFrom(this.api.removeNote(note.id));
      this.notes.reload();
    }
  }
}
