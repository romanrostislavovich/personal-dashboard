import {ChangeDetectionStrategy, Component} from '@angular/core';
import {WindowCardComponent} from './window-card.component';

/** Home widget: today's productive window (Links). */
@Component({
  selector: 'pd-window-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WindowCardComponent],
  template: '<pd-window-card [compact]="true" />',
})
export class WindowWidgetComponent {}
