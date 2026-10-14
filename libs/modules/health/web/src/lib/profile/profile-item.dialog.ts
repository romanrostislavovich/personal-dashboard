import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { ALLERGY_SEVERITIES } from '@pd/contracts';
import { HealthApi } from '../health.api';
import { today } from '../health-labels';

export type ProfileItemKind = 'allergy' | 'vaccination' | 'operation';

interface Field {
  name: string;
  type: 'text' | 'date' | 'textarea' | 'select';
  required?: boolean;
  max?: number;
  /** For a select: the values, translated as `health.profile.<option>.<value>`. */
  options?: { key: string; values: readonly string[] };
}

/** The fields of each kind; their labels are `health.profile.fields.<name>`. */
const FIELDS: Record<ProfileItemKind, Field[]> = {
  allergy: [
    { name: 'substance', type: 'text', required: true, max: 200 },
    { name: 'reaction', type: 'text', max: 1000 },
    {
      name: 'severity',
      type: 'select',
      options: { key: 'severities', values: ALLERGY_SEVERITIES },
    },
    { name: 'since', type: 'date' },
  ],
  vaccination: [
    { name: 'vaccine', type: 'text', required: true, max: 200 },
    { name: 'dose', type: 'text', max: 50 },
    { name: 'givenOn', type: 'date', required: true },
    { name: 'country', type: 'text', max: 2 },
    { name: 'nextDueOn', type: 'date' },
    { name: 'notes', type: 'textarea', max: 2000 },
  ],
  operation: [
    { name: 'title', type: 'text', required: true, max: 500 },
    { name: 'performedOn', type: 'date', required: true },
    { name: 'clinic', type: 'text', max: 200 },
    { name: 'notes', type: 'textarea', max: 5000 },
  ],
};

export interface ProfileItemData {
  kind: ProfileItemKind;
  /** The item to change, as the server gave it; none — a new one. */
  item?: { id: string } & Record<string, unknown>;
}

/** Adds or changes an allergy, a vaccination or an operation; closes with `true` once saved. */
@Component({
  selector: 'pd-health-profile-item-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    ReactiveFormsModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ 'health.profile.' + data.kind + (data.item ? '.edit' : '.add') | transloco }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form">
        @for (field of fields; track field.name) {
          <mat-form-field>
            <mat-label>{{ 'health.profile.fields.' + field.name | transloco }}</mat-label>
            @switch (field.type) {
              @case ('textarea') {
                <textarea
                  matInput
                  rows="3"
                  [attr.maxlength]="field.max"
                  [formControlName]="field.name"
                ></textarea>
              }
              @case ('select') {
                <mat-select [formControlName]="field.name">
                  <mat-option [value]="''">—</mat-option>
                  @for (value of field.options?.values ?? []; track value) {
                    <mat-option [value]="value">
                      {{ 'health.profile.' + field.options?.key + '.' + value | transloco }}
                    </mat-option>
                  }
                </mat-select>
              }
              @default {
                <input
                  matInput
                  [type]="field.type"
                  [attr.maxlength]="field.max"
                  [required]="!!field.required"
                  [formControlName]="field.name"
                />
              }
            }
          </mat-form-field>
        }
        @if (error()) {
          <p class="error" role="alert">{{ 'health.errors.save' | transloco }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>
          {{ 'core.actions.cancel' | transloco }}
        </button>
        <button matButton="filled" type="submit" [disabled]="form.invalid || busy()">
          {{ 'core.actions.save' | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: min(420px, 80vw);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class ProfileItemDialog {
  protected readonly data = inject<ProfileItemData>(MAT_DIALOG_DATA);
  private readonly api = inject(HealthApi);
  private readonly ref = inject(MatDialogRef<ProfileItemDialog, boolean>);

  protected readonly fields = FIELDS[this.data.kind];
  protected readonly busy = signal(false);
  protected readonly error = signal(false);

  protected readonly form = new FormGroup(
    Object.fromEntries(
      this.fields.map((field) => {
        const value = this.data.item?.[field.name];
        // A new vaccination or operation is today's until another day is picked.
        const initial =
          typeof value === 'string'
            ? value
            : field.required && field.type === 'date'
              ? today()
              : '';
        return [
          field.name,
          new FormControl(initial, {
            nonNullable: true,
            validators: field.required ? [Validators.required] : [],
          }),
        ];
      }),
    ),
  );

  protected async save(): Promise<void> {
    // An emptied field is "nothing" for the server.
    const input = Object.fromEntries(
      Object.entries(this.form.getRawValue()).map(([name, value]) => [
        name,
        value.trim() ? (name === 'country' ? value.trim().toUpperCase() : value.trim()) : null,
      ]),
    );
    const id = this.data.item?.id;
    const client = this.api.client;
    this.busy.set(true);
    this.error.set(false);
    try {
      switch (this.data.kind) {
        case 'allergy':
          await client.saveAllergy(input as Parameters<typeof client.saveAllergy>[0], id);
          break;
        case 'vaccination':
          await client.saveVaccination(input as Parameters<typeof client.saveVaccination>[0], id);
          break;
        case 'operation':
          await client.saveOperation(input as Parameters<typeof client.saveOperation>[0], id);
          break;
      }
      this.ref.close(true);
    } catch {
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
