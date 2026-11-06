import {ChangeDetectionStrategy, Component} from '@angular/core';
import {IndicesCardComponent} from './indices-card.component';

/** Home widget: the first of Links v2's indices of today against the owner's norm. */
@Component({
  selector: 'pd-activity-indices-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IndicesCardComponent],
  template: '<pd-activity-indices-card [compact]="true" />',
})
export class IndicesWidgetComponent {}
