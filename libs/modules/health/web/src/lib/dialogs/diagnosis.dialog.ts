import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {MatAutocompleteModule} from '@angular/material/autocomplete';
import {MatButtonModule} from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {TranslocoPipe} from '@jsverse/transloco';
import {
  CLOSING_STATUSES,
  DIAGNOSIS_STATUSES,
  DiagnosisStatus,
  HealthDiagnosis,
  HealthRecord,
  ICD_SYSTEMS,
  IcdEntry,
  IcdSystem,
} from '@pd/contracts';
import {firstValueFrom} from 'rxjs';
import {HealthApi} from '../health.api';
import {orNull, today} from '../health-labels';

export interface DiagnosisDialogData {
  record: HealthRecord;
  diagnosis?: HealthDiagnosis;
  /** A new diagnosis of a visit: its id and day. */
  visitId?: string;
  day?: string;
  /**
   * Taking a condition's diagnosis off: a new entry of the same code, recovered by default
   * (or ruled out, or in remission), on today.
   */
  closing?: {system: IcdSystem; code: string | null; title: string};
}

const SEARCH_DELAY_MS = 250;

/**
 * Adds or changes a diagnosis. The code and its title can be picked from the ICD dictionary the
 * user loaded (Settings → Integrations); the wording of the document is what is kept.
 */
@Component({
  selector: 'pd-health-diagnosis-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatAutocompleteModule,
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
      {{
        (data.closing
          ? 'health.diagnosis.close'
          : data.diagnosis
            ? 'health.diagnosis.edit'
            : 'health.diagnosis.add'
        ) | transloco
      }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form">
        <mat-form-field>
          <mat-label>{{ 'health.diagnosis.search' | transloco }}</mat-label>
          <input
            matInput
            [matAutocomplete]="icd"
            (input)="search($any($event.target).value)"
          />
          <mat-autocomplete
            #icd="matAutocomplete"
            [displayWith]="display"
            (optionSelected)="pick($event.option.value)"
          >
            @for (
              entry of found();
              track entry.system + entry.code + entry.language
            ) {
              <mat-option [value]="entry">
                <b>{{ entry.code }}</b> {{ entry.title }}
              </mat-option>
            }
          </mat-autocomplete>
          <mat-hint>{{ 'health.diagnosis.searchHint' | transloco }}</mat-hint>
        </mat-form-field>
        <div class="row">
          <mat-form-field class="system">
            <mat-label>{{ 'health.diagnosis.system' | transloco }}</mat-label>
            <mat-select formControlName="system">
              @for (system of systems; track system) {
                <mat-option [value]="system">
                  {{ 'health.systems.' + system | transloco }}
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="code">
            <mat-label>{{ 'health.diagnosis.code' | transloco }}</mat-label>
            <input matInput maxlength="20" formControlName="code" />
          </mat-form-field>
        </div>
        <mat-form-field>
          <mat-label>{{ 'health.diagnosis.title' | transloco }}</mat-label>
          <input matInput maxlength="500" formControlName="title" required />
          <mat-hint>{{ 'health.diagnosis.titleHint' | transloco }}</mat-hint>
        </mat-form-field>
        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'health.diagnosis.status' | transloco }}</mat-label>
            <mat-select formControlName="status">
              @for (status of statuses; track status) {
                <mat-option [value]="status">
                  {{ 'health.statuses.' + status | transloco }}
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'health.diagnosis.date' | transloco }}</mat-label>
            <input
              matInput
              type="date"
              formControlName="diagnosedOn"
              required
            />
          </mat-form-field>
        </div>
        <mat-form-field>
          <mat-label>{{ 'health.visit.one' | transloco }}</mat-label>
          <mat-select formControlName="visitId">
            <mat-option [value]="''">—</mat-option>
            @for (visit of data.record.visits; track visit.id) {
              <mat-option [value]="visit.id">{{ visit.visitedOn }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'health.visit.notes' | transloco }}</mat-label>
          <textarea
            matInput
            rows="2"
            maxlength="5000"
            formControlName="notes"
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
      min-width: min(520px, 80vw);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .row > * {
      flex: 1 1 180px;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class DiagnosisDialog implements OnDestroy {
  protected readonly data = inject<DiagnosisDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(HealthApi);
  private readonly ref = inject(MatDialogRef<DiagnosisDialog, boolean>);

  protected readonly systems = ICD_SYSTEMS;
  protected readonly statuses = this.data.closing
    ? CLOSING_STATUSES
    : DIAGNOSIS_STATUSES;
  protected readonly found = signal<IcdEntry[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  private readonly diagnosis = this.data.diagnosis;
  private readonly start = startValues(this.data);
  protected readonly form = inject(NonNullableFormBuilder).group({
    system: this.start.system,
    code: this.start.code,
    title: [this.start.title, Validators.required],
    status: this.start.status,
    diagnosedOn: [this.start.diagnosedOn, Validators.required],
    visitId: this.start.visitId,
    notes: this.start.notes,
  });

  protected readonly display = (entry: IcdEntry | string | null) =>
    entry && typeof entry === 'object'
      ? `${entry.code} ${entry.title}`
      : (entry ?? '');

  protected search(text: string): void {
    clearTimeout(this.timer);
    if (text.trim().length < 2) {
      this.found.set([]);
      return;
    }
    this.timer = setTimeout(async () => {
      try {
        this.found.set(await firstValueFrom(this.api.searchIcd(text.trim())));
      } catch {
        this.found.set([]);
      }
    }, SEARCH_DELAY_MS);
  }

  /** The code from the dictionary; the title only if none is typed from the document yet. */
  protected pick(entry: IcdEntry): void {
    this.form.patchValue({system: entry.system, code: entry.code});
    if (!this.form.controls.title.value.trim()) {
      this.form.controls.title.setValue(entry.title);
    }
  }

  protected async save(): Promise<void> {
    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(false);
    try {
      await this.api.client.saveDiagnosis(
        {
          system: value.system,
          code: orNull(value.code),
          title: value.title.trim(),
          status: value.status,
          diagnosedOn: value.diagnosedOn,
          visitId: orNull(value.visitId),
          notes: orNull(value.notes),
        },
        this.diagnosis?.id,
      );
      this.ref.close(true);
    } catch {
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }
}

/** What the form starts with: the diagnosis edited, the condition taken off, or a new one. */
function startValues(data: DiagnosisDialogData) {
  const diagnosis = data.diagnosis;
  if (diagnosis) {
    return {
      system: diagnosis.system,
      code: diagnosis.code ?? '',
      title: diagnosis.title,
      status: diagnosis.status,
      diagnosedOn: diagnosis.diagnosedOn,
      visitId: diagnosis.visitId ?? '',
      notes: diagnosis.notes ?? '',
    };
  }
  const closing = data.closing;
  return {
    system: closing?.system ?? ('icd10' as IcdSystem),
    code: closing?.code ?? '',
    title: closing?.title ?? '',
    status: (closing ? 'resolved' : 'confirmed') as DiagnosisStatus,
    diagnosedOn: data.day ?? today(),
    visitId: data.visitId ?? '',
    notes: '',
  };
}
