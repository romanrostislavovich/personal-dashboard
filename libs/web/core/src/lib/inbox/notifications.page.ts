import {httpResource} from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {TranslocoPipe} from '@jsverse/transloco';
import {CORE_READS} from '@pd/client-core';
import {InboxItem} from '@pd/contracts';
import {EmptyStateComponent} from '../ui/empty-state.component';
import {InboxListComponent} from './inbox-list.component';
import {InboxStore} from './inbox.store';

/** How many a page of the list holds; "more" reads the next one. */
const PAGE = 50;

/** Every notification of 90 days: all of them, or only the questions waiting for an answer. */
@Component({
  selector: 'pd-notifications-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    TranslocoPipe,
    EmptyStateComponent,
    InboxListComponent,
  ],
  template: `
    <header class="page-header">
      <h1 class="page-title">{{ 'core.inbox.title' | transloco }}</h1>
      @if (store.summary().unread) {
        <button matButton="tonal" (click)="store.markAllRead()">
          {{ 'core.inbox.readAll' | transloco }}
        </button>
      }
    </header>

    <mat-button-toggle-group
      [value]="filter()"
      (change)="filter.set($event.value)"
      [attr.aria-label]="'core.inbox.title' | transloco"
    >
      <mat-button-toggle value="all">{{
        'core.inbox.filterAll' | transloco
      }}</mat-button-toggle>
      <mat-button-toggle value="questions">
        {{ 'core.inbox.questions' | transloco }}
        @if (store.summary().waiting) {
          ({{ store.summary().waiting }})
        }
      </mat-button-toggle>
    </mat-button-toggle-group>

    @if (items.value().length) {
      <pd-inbox-list class="list" [items]="items.value()" />
      @if (items.value().length >= limit()) {
        <button matButton class="more" (click)="limit.set(limit() + PAGE)">
          {{ 'core.inbox.more' | transloco }}
        </button>
      }
    } @else if (!items.isLoading()) {
      <pd-empty-state
        icon="notifications_none"
        [title]="
          (filter() === 'questions'
            ? 'core.inbox.noQuestions'
            : 'core.inbox.empty'
          ) | transloco
        "
      />
    }
  `,
  styles: `
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .list {
      margin-top: 16px;
      max-width: 760px;
    }
    .more {
      margin-top: 8px;
    }
  `,
})
export class NotificationsPage {
  protected readonly store = inject(InboxStore);
  protected readonly PAGE = PAGE;

  protected readonly filter = signal<'all' | 'questions'>('all');
  protected readonly limit = signal(PAGE);
  protected readonly items = httpResource<InboxItem[]>(
    () => {
      this.store.version();
      return CORE_READS.inbox({
        filter: this.filter(),
        limit: Math.min(this.limit(), 500),
      });
    },
    {defaultValue: []},
  );

  constructor() {
    this.store.start();
  }
}
