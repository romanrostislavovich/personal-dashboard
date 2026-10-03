import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { desktopBridge } from '@pd/web-core';
import { ActivityApi } from '../activity.api';
import { ComputerCardComponent } from './computer-card.component';

/** The computers with a tracker: their state now and over the last day. */
@Component({
  selector: 'pd-activity-computers-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, ComputerCardComponent],
  template: `
    @for (computer of computers.value(); track computer.deviceId) {
      <pd-activity-computer-card
        [computer]="computer"
        [isThis]="computer.deviceId === thisDevice()"
      />
    } @empty {
      @if (!computers.isLoading()) {
        <p class="hint">{{ 'activity.computers.empty' | transloco }}</p>
      }
    }
    <p class="hint">{{ 'activity.computers.hint' | transloco }}</p>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 960px;
    }
    .hint {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class ComputersPage {
  protected readonly computers = inject(ActivityApi).computers();
  /** The device of the desktop app the page is opened in; `null` in a browser. */
  protected readonly thisDevice = signal<string | null>(null);

  constructor() {
    void desktopBridge()
      ?.activity?.status()
      .then((status) => this.thisDevice.set(status.deviceId));
  }
}
