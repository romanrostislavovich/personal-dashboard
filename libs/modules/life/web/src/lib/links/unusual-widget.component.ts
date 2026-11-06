import {ChangeDetectionStrategy, Component} from '@angular/core';
import {UnusualCardComponent} from './unusual-card.component';

/** Home widget: the rarest of today's and yesterday's unusual numbers (Links). */
@Component({
  selector: 'pd-unusual-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UnusualCardComponent],
  template: '<pd-unusual-card [compact]="true" />',
})
export class UnusualWidgetComponent {}
