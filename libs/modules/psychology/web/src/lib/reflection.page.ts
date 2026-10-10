import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { PsychologyReflection } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { PsychologyApi } from './psychology.api';

/**
 * A few questions about the week, answered in one's own words. With an AI connected they are
 * written from the week's own data; without one the standard three are asked.
 */
@Component({
  selector: 'pd-psychology-reflection-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    TranslocoPipe,
  ],
  template: `
    <div class="actions">
      <p class="hint">{{ 'psychology.reflection.hint' | transloco }}</p>
      <button matButton="filled" [disabled]="asking()" (click)="askNow()">
        <mat-icon>auto_awesome</mat-icon> {{ 'psychology.reflection.thisWeek' | transloco }}
      </button>
    </div>
    <mat-slide-toggle
      [checked]="settings.value()?.weeklyReview ?? false"
      (change)="setWeekly($event.checked)"
    >
      {{ 'psychology.reflection.weekly' | transloco }}
    </mat-slide-toggle>
    <p class="hint">{{ 'psychology.reflection.checkIn' | transloco }}</p>
    @if (asking()) {
      <mat-progress-bar mode="indeterminate" />
    }

    @for (reflection of reflections.value(); track reflection.id) {
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-card-title>
            {{
              'psychology.reflection.weekOf'
                | transloco: { date: (reflection.week | date: 'd MMM y') }
            }}
          </mat-card-title>
          <mat-card-subtitle>
            {{
              (reflection.byAi ? 'psychology.reflection.byAi' : 'psychology.reflection.standard')
                | transloco
            }}
          </mat-card-subtitle>
        </mat-card-header>
        <mat-card-content class="questions">
          @for (question of reflection.questions; track $index) {
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ question }}</mat-label>
              <textarea
                matInput
                rows="3"
                maxlength="5000"
                [value]="reflection.answers[$index]"
                (change)="answer(reflection, $index, $any($event.target).value)"
              ></textarea>
            </mat-form-field>
          }
        </mat-card-content>
        <mat-card-actions align="end">
          @if (saved() === reflection.id) {
            <span class="hint saved">{{ 'psychology.saved' | transloco }}</span>
          }
          <button matButton (click)="remove(reflection)">
            <mat-icon>delete</mat-icon> {{ 'core.actions.delete' | transloco }}
          </button>
        </mat-card-actions>
      </mat-card>
    } @empty {
      @if (!reflections.isLoading() && !asking()) {
        <p class="hint">{{ 'psychology.reflection.empty' | transloco }}</p>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .hint {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .questions {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-top: 12px;
    }
    .saved {
      margin-right: auto;
      padding-left: 16px;
    }
  `,
})
export class ReflectionPage {
  private readonly api = inject(PsychologyApi);
  private readonly transloco = inject(TranslocoService);

  protected readonly reflections = this.api.reflections();
  protected readonly settings = this.api.settings();
  /** The questions are being written: with an AI it takes a while. */
  protected readonly asking = signal(false);
  /** The reflection whose answer was just saved. */
  protected readonly saved = signal<string | null>(null);

  protected async askNow(): Promise<void> {
    this.asking.set(true);
    try {
      await firstValueFrom(this.api.reflectOnThisWeek());
      this.reflections.reload();
    } finally {
      this.asking.set(false);
    }
  }

  /** Saved when the field is left: nothing to press. */
  protected async answer(
    reflection: PsychologyReflection,
    index: number,
    text: string,
  ): Promise<void> {
    const answers = reflection.answers.map((value, i) => (i === index ? text : value));
    await firstValueFrom(this.api.answerReflection(reflection.id, answers));
    this.saved.set(reflection.id);
    this.reflections.reload();
  }

  protected async setWeekly(weeklyReview: boolean): Promise<void> {
    await firstValueFrom(this.api.saveSettings({ weeklyReview }));
    this.settings.reload();
  }

  protected async remove(reflection: PsychologyReflection): Promise<void> {
    if (confirm(this.transloco.translate('psychology.reflection.confirmDelete'))) {
      await firstValueFrom(this.api.removeReflection(reflection.id));
      this.reflections.reload();
    }
  }
}
