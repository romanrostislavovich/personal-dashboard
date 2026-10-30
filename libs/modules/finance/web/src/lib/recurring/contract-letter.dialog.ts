import {Clipboard} from '@angular/cdk/clipboard';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MAT_DIALOG_DATA, MatDialogModule} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatSelectModule} from '@angular/material/select';
import {TranslocoPipe} from '@jsverse/transloco';
import {
  CONTRACT_LETTER_KINDS,
  CONTRACT_LETTER_LANGUAGES,
  ContractLetter,
  RecurringPayment,
} from '@pd/contracts';
import {firstValueFrom} from 'rxjs';
import {FinanceApi} from '../finance.api';

/**
 * A letter about a contract: to end it, or to ask for a better price, in English or Polish.
 * The AI writes it from the payment's facts; it is copied and sent by the user.
 */
@Component({
  selector: 'pd-contract-letter-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ 'finance.letter.title' | transloco: {name: payment.name} }}
    </h2>
    <mat-dialog-content class="form">
      <div class="row">
        <mat-form-field>
          <mat-label>{{ 'finance.letter.kind' | transloco }}</mat-label>
          <mat-select [(ngModel)]="kind">
            @for (one of kinds; track one) {
              <mat-option [value]="one">{{
                'finance.letter.kinds.' + one | transloco
              }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'finance.letter.language' | transloco }}</mat-label>
          <mat-select [(ngModel)]="language">
            @for (one of languages; track one) {
              <mat-option [value]="one">{{
                'finance.letter.languages.' + one | transloco
              }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>
      <mat-form-field>
        <mat-label>{{ 'finance.letter.details' | transloco }}</mat-label>
        <textarea
          matInput
          rows="2"
          maxlength="500"
          [(ngModel)]="details"
        ></textarea>
        <mat-hint>{{ 'finance.letter.detailsHint' | transloco }}</mat-hint>
      </mat-form-field>

      @if (busy()) {
        <mat-progress-bar mode="indeterminate" />
      }
      @if (error()) {
        <p class="error">{{ 'finance.letter.failed' | transloco }}</p>
      }
      @if (letter(); as l) {
        <mat-form-field>
          <mat-label>{{ 'finance.letter.subject' | transloco }}</mat-label>
          <input matInput [value]="l.subject" readonly />
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'finance.letter.body' | transloco }}</mat-label>
          <textarea matInput rows="12" [value]="l.body" readonly></textarea>
          @if (!l.byAi) {
            <mat-hint>{{ 'finance.letter.template' | transloco }}</mat-hint>
          }
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>
        {{ 'finance.letter.close' | transloco }}
      </button>
      @if (letter(); as l) {
        <button matButton (click)="copy(l)">
          <mat-icon>{{ copied() ? 'check' : 'content_copy' }}</mat-icon>
          {{ 'finance.letter.copy' | transloco }}
        </button>
      }
      <button matButton="filled" [disabled]="busy()" (click)="write()">
        <mat-icon>edit_note</mat-icon>
        {{
          (letter() ? 'finance.letter.again' : 'finance.letter.write')
            | transloco
        }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      min-width: min(560px, 80vw);
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class ContractLetterDialog {
  protected readonly payment = inject<RecurringPayment>(MAT_DIALOG_DATA);
  private readonly api = inject(FinanceApi);
  private readonly clipboard = inject(Clipboard);

  protected readonly kinds = CONTRACT_LETTER_KINDS;
  protected readonly languages = CONTRACT_LETTER_LANGUAGES;
  protected kind: (typeof CONTRACT_LETTER_KINDS)[number] = 'cancel';
  protected language: (typeof CONTRACT_LETTER_LANGUAGES)[number] = 'pl';
  protected details = '';

  protected readonly letter = signal<ContractLetter | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal(false);
  protected readonly copied = signal(false);

  async write(): Promise<void> {
    this.busy.set(true);
    this.error.set(false);
    try {
      this.letter.set(
        await firstValueFrom(
          this.api.contractLetter(this.payment.id, {
            kind: this.kind,
            language: this.language,
            details: this.details.trim() || null,
          }),
        ),
      );
      this.copied.set(false);
    } catch {
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  copy(letter: ContractLetter): void {
    this.copied.set(this.clipboard.copy(`${letter.subject}\n\n${letter.body}`));
  }
}
