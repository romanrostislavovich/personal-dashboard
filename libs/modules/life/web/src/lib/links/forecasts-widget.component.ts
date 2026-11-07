import {ChangeDetectionStrategy, Component} from '@angular/core';
import {ForecastsCardComponent} from './forecasts-card.component';

/** Home widget: today's (and in the evening tomorrow's) trusted forecasts (Links). */
@Component({
  selector: 'pd-forecasts-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ForecastsCardComponent],
  template: '<pd-forecasts-card [compact]="true" />',
})
export class ForecastsWidgetComponent {}
