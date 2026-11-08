import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {ActivatedRoute, Router} from '@angular/router';
import {TranslocoPipe} from '@jsverse/transloco';
import {LifeApi} from '../life.api';
import {ExperimentCardComponent} from './experiment-card.component';
import {ExperimentFormComponent} from './experiment-form.component';

/**
 * Life → Lab: small everyday changes tried on random days chosen before the start, each with
 * what came of it. "Check it" of a finding or a question opens it with the form filled
 * (`?hypothesis=…&metric=…`).
 */
@Component({
  selector: 'pd-lab-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ExperimentCardComponent,
    ExperimentFormComponent,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    TranslocoPipe,
  ],
  template: `
    <section class="lab">
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-icon mat-card-avatar>science</mat-icon>
          <mat-card-title>{{ 'life.lab.title' | transloco }}</mat-card-title>
          <mat-card-subtitle>{{
            'life.lab.hint' | transloco
          }}</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          @if (adding()) {
            <pd-experiment-form
              [numbers]="numbers()"
              [preset]="preset()"
              (started)="started()"
              (cancelled)="closeForm()"
            />
          } @else {
            <button matButton="filled" type="button" (click)="adding.set(true)">
              <mat-icon>add</mat-icon>
              {{ 'life.lab.add' | transloco }}
            </button>
          }
        </mat-card-content>
      </mat-card>

      @if (lab.error()) {
        <p class="muted" role="alert">
          {{ 'life.lab.loadFailed' | transloco }}
        </p>
      } @else if (lab.hasValue()) {
        @for (item of lab.value().experiments; track item.id) {
          <pd-experiment-card
            [experiment]="item"
            [today]="lab.value().today"
            (changed)="lab.reload()"
          />
        } @empty {
          <p class="muted">{{ 'life.lab.empty' | transloco }}</p>
        }
      }
    </section>
  `,
  styles: `
    .lab {
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 880px;
    }
    .muted {
      margin: 0;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class LabPage {
  private readonly api = inject(LifeApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  protected readonly lab = this.api.experiments();
  // The daily numbers a question may be made of are the ones an experiment can measure.
  private readonly catalog = this.api.questions();

  protected readonly preset = computed(() => ({
    hypothesis: this.query().get('hypothesis') ?? undefined,
    metric: this.query().get('metric') ?? undefined,
  }));

  /** "Check it" from a finding opens the form at once. */
  protected readonly adding = signal(
    Boolean(this.preset().hypothesis || this.preset().metric),
  );

  protected readonly numbers = computed(() =>
    this.catalog.hasValue() ? this.catalog.value().numbers : [],
  );

  protected started(): void {
    this.closeForm();
    this.lab.reload();
  }

  /** Closes the form and drops the "check it" parameters, so a reload starts clean. */
  protected closeForm(): void {
    this.adding.set(false);
    if (this.preset().hypothesis || this.preset().metric) {
      void this.router.navigate([], {relativeTo: this.route, queryParams: {}});
    }
  }
}
