import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {TranslocoPipe} from '@jsverse/transloco';
import {GentleStep} from '@pd/contracts';
import {firstValueFrom} from 'rxjs';
import {PsychologyApi} from '../psychology.api';

/**
 * One's own library of small steps, made on a better day for a hard one: each with an
 * optional smaller version ("tidy the room" → "take one cup to the kitchen").
 */
@Component({
  selector: 'pd-gentle-steps',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    TranslocoPipe,
  ],
  template: `
    <p class="hint">{{ 'psychology.gentle.libraryAbout' | transloco }}</p>
    <div class="form">
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>{{ 'psychology.gentle.stepText' | transloco }}</mat-label>
        <input
          matInput
          maxlength="200"
          [value]="text()"
          (input)="text.set($any($event.target).value)"
        />
      </mat-form-field>
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>{{ 'psychology.gentle.stepSmaller' | transloco }}</mat-label>
        <input
          matInput
          maxlength="200"
          [value]="smaller()"
          (input)="smaller.set($any($event.target).value)"
        />
        <mat-hint>{{
          'psychology.gentle.stepSmallerHint' | transloco
        }}</mat-hint>
      </mat-form-field>
      <div class="row">
        @if (editing()) {
          <button matButton (click)="cancel()">
            {{ 'core.actions.cancel' | transloco }}
          </button>
        }
        <button matButton="filled" [disabled]="!text().trim()" (click)="save()">
          {{
            (editing() ? 'core.actions.save' : 'core.actions.add') | transloco
          }}
        </button>
      </div>
    </div>
    <ul>
      @for (step of steps.value(); track step.id) {
        <li>
          <span class="text">
            {{ step.text }}
            @if (step.smaller) {
              <span class="smaller">→ {{ step.smaller }}</span>
            }
          </span>
          <button
            matIconButton
            [attr.aria-label]="'core.actions.edit' | transloco"
            (click)="edit(step)"
          >
            <mat-icon>edit</mat-icon>
          </button>
          <button
            matIconButton
            [attr.aria-label]="'core.actions.delete' | transloco"
            (click)="remove(step)"
          >
            <mat-icon>delete</mat-icon>
          </button>
        </li>
      }
    </ul>
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
    }
    .row {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    li {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .text {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .smaller,
    .hint {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .hint {
      margin: 0;
    }
  `,
})
export class GentleStepsComponent {
  private readonly api = inject(PsychologyApi);

  protected readonly steps = this.api.gentleSteps();
  protected readonly text = signal('');
  protected readonly smaller = signal('');
  protected readonly editing = signal<string | null>(null);

  protected async save(): Promise<void> {
    await firstValueFrom(
      this.api.saveGentleStep(
        {text: this.text().trim(), smaller: this.smaller().trim() || null},
        this.editing() ?? undefined,
      ),
    );
    this.cancel();
    this.steps.reload();
  }

  protected edit(step: GentleStep): void {
    this.editing.set(step.id);
    this.text.set(step.text);
    this.smaller.set(step.smaller ?? '');
  }

  protected cancel(): void {
    this.editing.set(null);
    this.text.set('');
    this.smaller.set('');
  }

  /** No confirmation: a step is short to type again, and the days keep their copies. */
  protected async remove(step: GentleStep): Promise<void> {
    await firstValueFrom(this.api.removeGentleStep(step.id));
    this.steps.reload();
  }
}
