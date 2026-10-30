import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {RouterLink} from '@angular/router';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {InboxItem} from '@pd/contracts';
import {inboxTime} from './inbox.store';

/** Notifications as rows: a question waiting is marked, an answer is shown; a row opens its card. */
@Component({
  selector: 'pd-inbox-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, RouterLink, TranslocoPipe],
  template: `
    @for (item of items(); track item.id) {
      <a
        class="row"
        [class.unread]="!item.readAt"
        [routerLink]="['/notifications', item.id]"
        (click)="opened.emit()"
      >
        <mat-icon class="kind" [class.question]="item.waiting">{{
          item.waiting ? 'help' : item.answeredAt ? 'task_alt' : 'notifications'
        }}</mat-icon>
        <span class="text">
          <span class="title">{{ item.title }}</span>
          <span class="body">{{ item.body }}</span>
          @if (item.waiting) {
            <span class="state waiting">{{
              'core.inbox.waiting' | transloco
            }}</span>
          } @else if (item.answer) {
            <span class="state">{{ item.answer }}</span>
          }
        </span>
        <span class="time">{{ time(item.createdAt) }}</span>
      </a>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
    }
    .row {
      display: grid;
      grid-template-columns: 24px 1fr auto;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 12px;
      color: inherit;
      text-decoration: none;
    }
    .row:hover {
      background: var(--mat-sys-surface-container-high);
    }
    .row.unread .title {
      font-weight: 600;
    }
    .kind {
      color: var(--mat-sys-on-surface-variant);
    }
    .kind.question {
      color: var(--mat-sys-primary);
    }
    .text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .title,
    .body {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .body {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .state {
      align-self: flex-start;
      padding: 0 8px;
      border-radius: 8px;
      background: var(--mat-sys-surface-container-highest);
      font: var(--mat-sys-label-small);
      line-height: 20px;
    }
    .state.waiting {
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }
    .time {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-small);
      white-space: nowrap;
    }
  `,
})
export class InboxListComponent {
  private readonly transloco = inject(TranslocoService);

  readonly items = input.required<InboxItem[]>();
  /** A row was clicked (the bell's panel closes). */
  readonly opened = output();

  protected time(iso: string): string {
    return inboxTime(
      iso,
      this.transloco.getActiveLang(),
      this.transloco.translate('core.inbox.yesterday'),
    );
  }
}
