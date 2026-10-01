import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { Repeat, REPEAT_UNITS, RepeatUnit } from '@pd/contracts';

/** "Repeat: every 2 weeks" — the same pair of fields for a task and for a reminder. */
@Component({
  selector: 'pd-repeat-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatInputModule, MatSelectModule, TranslocoPipe],
  template: `
    <mat-form-field subscriptSizing="dynamic" class="unit">
      <mat-label>{{ 'tasks.repeat.label' | transloco }}</mat-label>
      <mat-select [value]="value()?.unit ?? null" (selectionChange)="setUnit($event.value)">
        <mat-option [value]="null">{{ 'tasks.repeat.never' | transloco }}</mat-option>
        @for (unit of units; track unit) {
          <mat-option [value]="unit">{{ 'tasks.repeat.units.' + unit | transloco }}</mat-option>
        }
      </mat-select>
    </mat-form-field>
    @if (value(); as repeat) {
      <mat-form-field subscriptSizing="dynamic" class="every">
        <mat-label>{{ 'tasks.repeat.every' | transloco }}</mat-label>
        <input
          matInput
          type="number"
          min="1"
          max="365"
          [value]="repeat.every"
          (change)="setEvery($any($event.target).value)"
        />
      </mat-form-field>
    }
  `,
  styles: `
    :host {
      display: flex;
      gap: 8px;
    }
    .unit {
      flex: 2 1 160px;
    }
    .every {
      flex: 1 1 90px;
    }
  `,
})
export class RepeatFieldComponent {
  /** `null` — it does not repeat. */
  readonly value = model<Repeat | null>(null);

  protected readonly units = REPEAT_UNITS;

  protected setUnit(unit: RepeatUnit | null): void {
    this.value.set(unit ? { unit, every: this.value()?.every ?? 1 } : null);
  }

  protected setEvery(every: string): void {
    const current = this.value();
    if (current) {
      this.value.set({
        ...current,
        every: Math.min(365, Math.max(1, Math.round(Number(every)) || 1)),
      });
    }
  }
}
