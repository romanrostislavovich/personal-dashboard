import {ChangeDetectionStrategy, Component} from '@angular/core';
import {InsightsCardComponent} from './insights-card.component';

/** Home widget: today's finding of the week (Links), a different one each day. */
@Component({
  selector: 'pd-insight-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InsightsCardComponent],
  template: '<pd-insights-card [compact]="true" />',
})
export class InsightWidgetComponent {}
