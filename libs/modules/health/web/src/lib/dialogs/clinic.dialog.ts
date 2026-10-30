import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {TranslocoPipe} from '@jsverse/transloco';
import {HealthClinic} from '@pd/contracts';
import {HealthApi} from '../health.api';
import {orNull} from '../health-labels';
import {CountryFieldComponent} from './country-field.component';

/** Adds or changes a clinic; closes with `true` once saved. */
@Component({
  selector: 'pd-health-clinic-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CountryFieldComponent,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ (clinic ? 'health.clinic.edit' : 'health.clinic.add') | transloco }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form">
        <mat-form-field>
          <mat-label>{{ 'health.clinic.name' | transloco }}</mat-label>
          <input matInput maxlength="200" formControlName="name" required />
        </mat-form-field>
        <div class="row">
          <pd-health-country-field formControlName="country" />
          <mat-form-field>
            <mat-label>{{ 'health.clinic.city' | transloco }}</mat-label>
            <input matInput maxlength="100" formControlName="city" />
          </mat-form-field>
        </div>
        <mat-form-field>
          <mat-label>{{ 'health.contacts' | transloco }}</mat-label>
          <textarea
            matInput
            rows="2"
            maxlength="1000"
            formControlName="contacts"
          ></textarea>
        </mat-form-field>
        @if (error()) {
          <p class="error" role="alert">
            {{ 'health.errors.save' | transloco }}
          </p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>
          {{ 'core.actions.cancel' | transloco }}
        </button>
        <button
          matButton="filled"
          type="submit"
          [disabled]="form.invalid || busy()"
        >
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
      min-width: min(440px, 80vw);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .row > * {
      flex: 1 1 160px;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class ClinicDialog {
  protected readonly clinic = inject<HealthClinic | null>(MAT_DIALOG_DATA);
  private readonly api = inject(HealthApi);
  private readonly ref = inject(MatDialogRef<ClinicDialog, boolean>);

  protected readonly busy = signal(false);
  protected readonly error = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [this.clinic?.name ?? '', Validators.required],
    country: this.clinic?.country ?? '',
    city: this.clinic?.city ?? '',
    contacts: this.clinic?.contacts ?? '',
  });

  protected async save(): Promise<void> {
    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(false);
    try {
      await this.api.client.saveClinic(
        {
          name: value.name.trim(),
          country: orNull(value.country),
          city: orNull(value.city),
          contacts: orNull(value.contacts),
        },
        this.clinic?.id,
      );
      this.ref.close(true);
    } catch {
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
