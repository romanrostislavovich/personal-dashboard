import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { errorStatus } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { FinanceApi } from './finance.api';

/**
 * "Import a PKO statement": the history exported from iPKO (CSV or XML) becomes transactions —
 * the ones typed by hand matched, nothing doubled when a file is imported again.
 */
@Component({
  selector: 'pd-statement-import',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, TranslocoPipe],
  template: `
    <input
      #picker
      type="file"
      hidden
      accept=".csv,.xml,text/csv,text/xml,application/xml"
      (change)="pick($event)"
    />
    <button
      [matButton]="appearance()"
      [disabled]="busy()"
      [matTooltip]="'finance.statement.hint' | transloco"
      (click)="picker.click()"
    >
      <mat-icon>upload_file</mat-icon>
      {{ (busy() ? 'finance.statement.importing' : 'finance.statement.import') | transloco }}
    </button>
  `,
})
export class StatementImportButton {
  private readonly api = inject(FinanceApi);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  readonly appearance = input<'text' | 'tonal' | 'outlined'>('tonal');
  /** Imported: the page reads its transactions again. */
  readonly imported = output<void>();

  protected readonly busy = signal(false);

  protected async pick(event: Event): Promise<void> {
    const field = event.target as HTMLInputElement;
    const file = field.files?.[0];
    field.value = '';
    if (!file) {
      return;
    }
    this.busy.set(true);
    try {
      const result = await firstValueFrom(this.api.importStatement(file));
      this.snackBar.open(this.transloco.translate('finance.bank.syncResult', result), 'OK', {
        duration: 6000,
      });
      this.imported.emit();
    } catch (error) {
      const key = errorStatus(error) === 400 ? 'finance.statement.notPko' : 'finance.bank.failed';
      this.snackBar.open(this.transloco.translate(key), 'OK', { duration: 8000 });
    } finally {
      this.busy.set(false);
    }
  }
}
