import {NgTemplateOutlet} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  contentChild,
  input,
  TemplateRef,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {TranslocoPipe} from '@jsverse/transloco';

/** What the component needs of an `httpResource` (or any Angular resource). */
export interface LoadedResource {
  hasValue(): boolean;
  isLoading(): boolean;
  error(): unknown;
  reload(): unknown;
}

/**
 * A list's three states that are not its contents: still loading (a bar, not "nothing yet"), a
 * failed request (what happened and "Try again"), and the loaded value — the template inside,
 * made only once the value is there, so its `@empty` means really empty. A reload keeps the
 * value shown with the bar above it.
 *
 *   <pd-resource-state [resource]="birthdays">
 *     <ng-template>
 *       @for (b of birthdays.value(); track b.id) { … } @empty { nothing yet }
 *     </ng-template>
 *   </pd-resource-state>
 */
@Component({
  selector: 'pd-resource-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoPipe,
  ],
  template: `
    @let r = resource();
    @if (r.isLoading()) {
      <mat-progress-bar
        mode="indeterminate"
        [attr.aria-label]="'core.resource.loading' | transloco"
      />
    }
    @if (r.hasValue()) {
      <ng-container [ngTemplateOutlet]="content() ?? null" />
    } @else if (r.error() && !r.isLoading()) {
      <div class="failed" role="alert">
        <mat-icon>cloud_off</mat-icon>
        <span>{{ 'core.resource.failed' | transloco }}</span>
        <button matButton (click)="r.reload()">
          {{ 'core.resource.retry' | transloco }}
        </button>
      </div>
    }
  `,
  styles: `
    /* Transparent to the layout: in a grid or a flex row the items stay the parent's items. */
    :host {
      display: contents;
    }
    mat-progress-bar,
    .failed {
      grid-column: 1 / -1;
    }
    mat-progress-bar {
      margin-bottom: 8px;
    }
    .failed {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      padding: 12px 0;
      color: var(--mat-sys-error);
    }
  `,
})
export class ResourceStateComponent {
  readonly resource = input.required<LoadedResource>();
  protected readonly content = contentChild(TemplateRef);
}
