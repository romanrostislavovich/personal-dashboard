import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  PsychologyAssessment,
  Questionnaire,
  QuestionnaireId,
  QUESTIONNAIRES,
} from '@pd/contracts';
import { SparklineComponent, SparklinePoint } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { PsychologyApi, today } from './psychology.api';

/**
 * Check-ups: short standard questionnaires filled in from time to time, so a change is seen
 * over months. They are self-observation, not a diagnosis — the page says so, and says where
 * to turn when an answer speaks of thoughts of self-harm.
 */
@Component({
  selector: 'pd-psychology-checkups-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    TranslocoPipe,
    SparklineComponent,
  ],
  template: `
    <p class="notice">
      <mat-icon inline>info</mat-icon> {{ 'psychology.checkups.notDiagnosis' | transloco }}
    </p>

    @if (taking(); as test) {
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-card-title>{{ 'psychology.tests.' + test.id + '.name' | transloco }}</mat-card-title>
          <mat-card-subtitle>
            {{ 'psychology.tests.' + test.id + '.intro' | transloco }}
          </mat-card-subtitle>
        </mat-card-header>
        <mat-card-content class="items">
          @for (item of itemsOf(test); track item) {
            <div class="item">
              <span
                >{{ item }}.
                {{ 'psychology.tests.' + test.id + '.items.' + item | transloco }}</span
              >
              <mat-button-toggle-group
                hideSingleSelectionIndicator
                [value]="answers()[item - 1]"
                (change)="setAnswer(item - 1, $event.value)"
              >
                @for (option of optionsOf(test); track option) {
                  <mat-button-toggle [value]="option">
                    {{ 'psychology.tests.' + test.id + '.answers.' + option | transloco }}
                  </mat-button-toggle>
                }
              </mat-button-toggle-group>
            </div>
          }
        </mat-card-content>
        <mat-card-actions align="end">
          <button matButton (click)="taking.set(null)">
            {{ 'core.actions.cancel' | transloco }}
          </button>
          <button matButton="filled" [disabled]="!complete()" (click)="save(test)">
            {{ 'core.actions.save' | transloco }}
          </button>
        </mat-card-actions>
      </mat-card>
    } @else {
      <div class="cards">
        @for (test of questionnaires; track test.id) {
          @let history = historyOf(test.id);
          @let last = history[0];
          <mat-card appearance="outlined">
            <mat-card-header>
              <mat-card-title>{{
                'psychology.tests.' + test.id + '.name' | transloco
              }}</mat-card-title>
              <mat-card-subtitle>
                {{ 'psychology.tests.' + test.id + '.about' | transloco }}
              </mat-card-subtitle>
            </mat-card-header>
            <mat-card-content class="result">
              @if (last) {
                <span class="score"
                  >{{ last.score }}<span class="of">/{{ maxOf(test) }}</span></span
                >
                <span>{{ 'psychology.tests.' + test.id + '.bands.' + last.band | transloco }}</span>
                <span class="hint">{{ last.takenOn | date: 'd MMMM y' }}</span>
                @if (history.length > 1) {
                  <pd-sparkline
                    [points]="pointsOf(history)"
                    dateFormat="d MMM y"
                    [label]="'psychology.tests.' + test.id + '.name' | transloco"
                  />
                }
              } @else {
                <span class="hint">{{ 'psychology.checkups.never' | transloco }}</span>
              }
            </mat-card-content>
            <mat-card-actions align="end">
              @if (last) {
                <button matButton (click)="remove(last)">
                  {{ 'psychology.checkups.deleteLast' | transloco }}
                </button>
              }
              <button matButton="tonal" (click)="start(test)">
                {{ 'psychology.checkups.take' | transloco }}
              </button>
            </mat-card-actions>
          </mat-card>
        }
      </div>
    }

    @if (care()) {
      <mat-card appearance="outlined" class="care">
        <mat-card-content>
          <p>
            <b>{{ 'psychology.checkups.careTitle' | transloco }}</b>
          </p>
          <p>{{ 'psychology.checkups.careText' | transloco }}</p>
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .notice,
    .hint {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
      align-items: start;
      gap: 16px;
    }
    .result {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-top: 12px;
    }
    .score {
      font: var(--mat-sys-headline-medium);
    }
    .of {
      font: var(--mat-sys-title-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .items {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding-top: 12px;
    }
    .item {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .item mat-button-toggle-group {
      flex-wrap: wrap;
      align-self: flex-start;
    }
    .care {
      border-color: var(--mat-sys-tertiary);
    }
    .care p {
      margin: 0 0 8px;
    }
  `,
})
export class CheckupsPage {
  private readonly api = inject(PsychologyApi);
  private readonly transloco = inject(TranslocoService);

  protected readonly questionnaires = QUESTIONNAIRES;
  protected readonly assessments = this.api.assessments();
  /** The questionnaire being filled in. */
  protected readonly taking = signal<Questionnaire | null>(null);
  /** An answer an item; `null` — not answered yet. */
  protected readonly answers = signal<(number | null)[]>([]);
  protected readonly complete = computed(() => this.answers().every((answer) => answer !== null));
  /** The latest check-up of some kind speaks of thoughts of self-harm. */
  protected readonly care = computed(() =>
    QUESTIONNAIRES.some((test) => this.historyOf(test.id)[0]?.care),
  );

  protected itemsOf(test: Questionnaire): number[] {
    return Array.from({ length: test.items }, (_, index) => index + 1);
  }

  protected optionsOf(test: Questionnaire): number[] {
    return Array.from({ length: test.maxAnswer + 1 }, (_, index) => index);
  }

  protected maxOf(test: Questionnaire): number {
    return test.items * test.maxAnswer * test.scale;
  }

  protected historyOf(id: QuestionnaireId): PsychologyAssessment[] {
    return this.assessments.value().filter((assessment) => assessment.test === id);
  }

  /** Oldest first, as a chart reads. */
  protected pointsOf(history: PsychologyAssessment[]): SparklinePoint[] {
    return [...history].reverse().map(({ takenOn, score }) => ({ at: takenOn, value: score }));
  }

  protected start(test: Questionnaire): void {
    this.answers.set(Array.from({ length: test.items }, () => null));
    this.taking.set(test);
  }

  protected setAnswer(index: number, value: number): void {
    this.answers.update((answers) => answers.map((answer, i) => (i === index ? value : answer)));
  }

  protected async save(test: Questionnaire): Promise<void> {
    const answers = this.answers().map((answer) => answer ?? 0);
    await firstValueFrom(this.api.addAssessment({ test: test.id, takenOn: today(), answers }));
    this.taking.set(null);
    this.assessments.reload();
  }

  protected async remove(assessment: PsychologyAssessment): Promise<void> {
    if (confirm(this.transloco.translate('psychology.checkups.confirmDelete'))) {
      await firstValueFrom(this.api.removeAssessment(assessment.id));
      this.assessments.reload();
    }
  }
}
