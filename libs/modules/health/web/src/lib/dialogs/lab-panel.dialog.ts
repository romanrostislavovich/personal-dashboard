import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  FormArray,
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
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {TranslocoPipe} from '@jsverse/transloco';
import {
  formatLabRange,
  guessAnalyte,
  HealthLabPanel,
  HealthLabValue,
  HealthRecord,
  LAB_ANALYTES,
  parseLabRange,
  parseLabResult,
} from '@pd/contracts';
import {HealthApi} from '../health.api';
import {orNull, today} from '../health-labels';
import {CountryFieldComponent} from './country-field.component';

export interface LabPanelDialogData {
  record: HealthRecord;
  panel?: HealthLabPanel;
  visitId?: string;
  day?: string;
}

/**
 * Adds or changes a lab report: its day and laboratory, and its lines as the report gives them —
 * the name, the result, the unit and the laboratory's range (`3,9–5,5`, `<5.2`). The analyte is
 * recognised by the name in any of the languages and can be picked by hand; it puts the line on
 * the chart of that analyte.
 */
@Component({
  selector: 'pd-health-lab-panel-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CountryFieldComponent,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    ReactiveFormsModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ (data.panel ? 'health.labs.edit' : 'health.labs.add') | transloco }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form">
        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'health.labs.takenOn' | transloco }}</mat-label>
            <input matInput type="date" formControlName="takenOn" required />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'health.labs.laboratory' | transloco }}</mat-label>
            <input matInput maxlength="200" formControlName="laboratory" />
          </mat-form-field>
          <pd-health-country-field formControlName="country" />
        </div>

        <div formArrayName="lines" class="lines">
          @for (line of lines.controls; track line; let i = $index) {
            <div class="line" [formGroupName]="i">
              <mat-form-field subscriptSizing="dynamic" class="name">
                <mat-label>{{ 'health.labs.name' | transloco }}</mat-label>
                <input
                  matInput
                  maxlength="200"
                  formControlName="name"
                  (blur)="recognise(i)"
                />
              </mat-form-field>
              <mat-form-field subscriptSizing="dynamic" class="short">
                <mat-label>{{ 'health.labs.result' | transloco }}</mat-label>
                <input matInput maxlength="200" formControlName="result" />
              </mat-form-field>
              <mat-form-field subscriptSizing="dynamic" class="short">
                <mat-label>{{ 'health.labs.unit' | transloco }}</mat-label>
                <input matInput maxlength="30" formControlName="unit" />
              </mat-form-field>
              <mat-form-field subscriptSizing="dynamic" class="short">
                <mat-label>{{ 'health.labs.range' | transloco }}</mat-label>
                <input
                  matInput
                  maxlength="200"
                  formControlName="range"
                  placeholder="3,9–5,5"
                />
              </mat-form-field>
              <mat-form-field subscriptSizing="dynamic" class="analyte">
                <mat-label>{{ 'health.labs.analyte' | transloco }}</mat-label>
                <mat-select formControlName="analyte">
                  <mat-option [value]="''">—</mat-option>
                  @for (analyte of analytes; track analyte.key) {
                    <mat-option [value]="analyte.key">
                      {{ 'health.analytes.' + analyte.key | transloco }}
                    </mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <button
                matIconButton
                type="button"
                [attr.aria-label]="'core.actions.delete' | transloco"
                [disabled]="lines.length === 1"
                (click)="lines.removeAt(i)"
              >
                <mat-icon>close</mat-icon>
              </button>
            </div>
          }
        </div>
        <button matButton type="button" class="add" (click)="addLine()">
          <mat-icon>add</mat-icon> {{ 'health.labs.addLine' | transloco }}
        </button>

        <div class="row">
          <mat-form-field>
            <mat-label>{{ 'health.visit.one' | transloco }}</mat-label>
            <mat-select formControlName="visitId">
              <mat-option [value]="''">—</mat-option>
              @for (visit of data.record.visits; track visit.id) {
                <mat-option [value]="visit.id">{{
                  visit.visitedOn
                }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'health.document.one' | transloco }}</mat-label>
            <mat-select formControlName="documentId">
              <mat-option [value]="''">—</mat-option>
              @for (document of data.record.documents; track document.id) {
                <mat-option [value]="document.id">{{
                  document.name
                }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
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
      min-width: min(860px, 86vw);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .row > * {
      flex: 1 1 180px;
    }
    .lines {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .line {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--pd-border);
    }
    .name {
      flex: 2 1 200px;
    }
    .short {
      flex: 1 1 100px;
    }
    .analyte {
      flex: 1 1 160px;
    }
    .add {
      align-self: flex-start;
      margin-bottom: 8px;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class LabPanelDialog {
  protected readonly data = inject<LabPanelDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(HealthApi);
  private readonly ref = inject(MatDialogRef<LabPanelDialog, boolean>);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly analytes = LAB_ANALYTES;
  protected readonly busy = signal(false);
  protected readonly error = signal(false);

  private readonly panel = this.data.panel;
  protected readonly form = this.fb.group({
    takenOn: [
      this.panel?.takenOn ?? this.data.day ?? today(),
      Validators.required,
    ],
    laboratory: this.panel?.laboratory ?? '',
    country: this.panel?.country ?? '',
    visitId: this.panel?.visitId ?? this.data.visitId ?? '',
    documentId: this.panel?.documentId ?? '',
    notes: this.panel?.notes ?? '',
    lines: this.fb.array(
      this.panel?.values.length
        ? this.panel.values.map(v => this.line(v))
        : [this.line()],
    ),
  });

  protected get lines(): FormArray<ReturnType<LabPanelDialog['line']>> {
    return this.form.controls.lines;
  }

  private line(value?: HealthLabValue) {
    return this.fb.group({
      name: [value?.name ?? '', Validators.required],
      result: [
        value
          ? value.value !== null
            ? String(value.value)
            : (value.textValue ?? '')
          : '',
        Validators.required,
      ],
      unit: value?.unit ?? '',
      range: value
        ? formatLabRange(value.refLow, value.refHigh, value.refText)
        : '',
      analyte: value?.analyte ?? '',
    });
  }

  protected addLine(): void {
    this.lines.push(this.line());
  }

  /** The analyte from the name, unless one is picked already; its usual unit, if none typed. */
  protected recognise(index: number): void {
    const line = this.lines.at(index);
    const key =
      line.controls.analyte.value || guessAnalyte(line.controls.name.value);
    if (key && !line.controls.analyte.value) {
      line.controls.analyte.setValue(key);
    }
    const analyte = LAB_ANALYTES.find(candidate => candidate.key === key);
    if (analyte?.unit && !line.controls.unit.value) {
      line.controls.unit.setValue(analyte.unit);
    }
  }

  protected async save(): Promise<void> {
    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(false);
    try {
      await this.api.client.saveLabPanel(
        {
          takenOn: value.takenOn,
          laboratory: orNull(value.laboratory),
          country: orNull(value.country),
          visitId: orNull(value.visitId),
          documentId: orNull(value.documentId),
          notes: orNull(value.notes),
          values: value.lines.map(line => ({
            name: line.name.trim(),
            analyte: line.analyte || guessAnalyte(line.name) || null,
            unit: orNull(line.unit),
            ...parseLabResult(line.result),
            ...parseLabRange(line.range),
          })),
        },
        this.panel?.id,
      );
      this.ref.close(true);
    } catch {
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
