import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ActivityApi } from '../activity.api';

/** Words of window titles never recorded: the tracker keeps only the program for them. */
@Component({
  selector: 'pd-activity-privacy-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>visibility_off</mat-icon>
        <mat-card-title>{{ 'activity.privacy.title' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <p class="hint">{{ 'activity.privacy.hint' | transloco }}</p>
        <form class="add" (submit)="$event.preventDefault(); add()">
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'activity.privacy.word' | transloco }}</mat-label>
            <input
              matInput
              maxlength="60"
              [value]="draft()"
              (input)="draft.set($any($event.target).value)"
            />
          </mat-form-field>
          <button matButton="filled" type="submit" [disabled]="draft().trim().length < 2">
            {{ 'activity.privacy.add' | transloco }}
          </button>
        </form>
        <mat-chip-set>
          @for (word of words(); track word) {
            <mat-chip (removed)="remove(word)">
              {{ word }}
              <button matChipRemove [attr.aria-label]="'core.actions.delete' | transloco">
                <mat-icon>cancel</mat-icon>
              </button>
            </mat-chip>
          }
        </mat-chip-set>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .hint {
      margin: 0 0 12px;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .add {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }
    .add mat-form-field {
      flex: 0 1 280px;
    }
  `,
})
export class PrivacySettingsComponent {
  private readonly api = inject(ActivityApi);
  private readonly settings = this.api.settings();
  protected readonly draft = signal('');
  protected readonly words = computed(() => this.settings.value()?.privateWords ?? []);

  protected async add(): Promise<void> {
    const word = this.draft().trim();
    if (
      word.length < 2 ||
      this.words().some((known) => known.toLowerCase() === word.toLowerCase())
    ) {
      return;
    }
    await this.save([...this.words(), word]);
    this.draft.set('');
  }

  protected async remove(word: string): Promise<void> {
    await this.save(this.words().filter((known) => known !== word));
  }

  private async save(privateWords: string[]): Promise<void> {
    await firstValueFrom(this.api.saveSettings({ privateWords }));
    this.settings.reload();
  }
}
