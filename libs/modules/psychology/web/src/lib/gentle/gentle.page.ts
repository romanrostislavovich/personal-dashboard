import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { TranslocoPipe } from '@jsverse/transloco';
import { GentleDayComponent } from './gentle-day.component';
import { GentleStepsComponent } from './gentle-steps.component';

/** The tab of a gentle day: today's plan and the library of small steps. */
@Component({
  selector: 'pd-gentle-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, TranslocoPipe, GentleDayComponent, GentleStepsComponent],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{ 'psychology.gentle.today' | transloco }}</mat-card-title>
        <mat-card-subtitle>{{ 'psychology.gentle.about' | transloco }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content class="padded">
        <pd-gentle-day />
      </mat-card-content>
    </mat-card>
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{ 'psychology.gentle.library' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content class="padded">
        <pd-gentle-steps />
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .padded {
      padding-top: 12px;
    }
  `,
})
export class GentlePage {}
