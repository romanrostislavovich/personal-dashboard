import {ChangeDetectionStrategy, Component} from '@angular/core';
import {OverloadCardComponent} from './overload-card.component';

/** Home widget: whether the last days are heavier than usual (Links). */
@Component({
  selector: 'pd-overload-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OverloadCardComponent],
  template: '<pd-overload-card [compact]="true" />',
})
export class OverloadWidgetComponent {}
