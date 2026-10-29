import { httpResource } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CORE_READS } from '@pd/client-core';
import { InboxItem } from '@pd/contracts';
import { InboxListComponent } from './inbox-list.component';
import { InboxStore } from './inbox.store';

/** How many of the latest the bell's panel shows; the page has them all. */
const PANEL_ITEMS = 8;

/**
 * The bell: how many questions wait for an answer (a number) and whether anything is unread (a
 * dot). On a wide screen it opens a panel — the questions first, then the latest; on the phone
 * it opens the page.
 */
@Component({
  selector: 'pd-inbox-bell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    RouterLink,
    TranslocoPipe,
    InboxListComponent,
  ],
  template: `
    @let s = store.summary();
    @if (compact()) {
      <button matIconButton [attr.aria-label]="label()" (click)="openPage()">
        <ng-container *ngTemplateOutlet="bell" />
      </button>
    } @else {
      <button
        matIconButton
        [attr.aria-label]="label()"
        [matMenuTriggerFor]="panel"
        (menuOpened)="open.set(true)"
        (menuClosed)="open.set(false)"
      >
        <ng-container *ngTemplateOutlet="bell" />
      </button>
    }
    <ng-template #bell>
      <mat-icon>{{ s.waiting || s.unread ? 'notifications_active' : 'notifications' }}</mat-icon>
      @if (s.waiting) {
        <span class="count">{{ s.waiting > 99 ? '99+' : s.waiting }}</span>
      } @else if (s.unread) {
        <span class="dot"></span>
      }
    </ng-template>

    <mat-menu #panel="matMenu" class="pd-inbox-panel" xPosition="after">
      <div
        class="panel"
        tabindex="-1"
        (click)="$event.stopPropagation()"
        (keydown)="$event.stopPropagation()"
      >
        <header>
          <span class="heading">{{ 'core.inbox.title' | transloco }}</span>
          @if (s.unread) {
            <button matButton (click)="store.markAllRead()">
              {{ 'core.inbox.readAll' | transloco }}
            </button>
          }
        </header>
        @if (waiting().length) {
          <h3>{{ 'core.inbox.questions' | transloco }}</h3>
          <pd-inbox-list [items]="waiting()" (opened)="close()" />
        }
        @if (rest().length) {
          <h3>{{ 'core.inbox.latest' | transloco }}</h3>
          <pd-inbox-list [items]="rest()" (opened)="close()" />
        } @else if (!waiting().length && !latest.isLoading()) {
          <p class="empty">{{ 'core.inbox.empty' | transloco }}</p>
        }
        <a matButton class="all" routerLink="/notifications" (click)="close()">
          {{ 'core.inbox.all' | transloco }}
        </a>
      </div>
    </mat-menu>
  `,
  styles: `
    :host {
      position: relative;
      display: inline-flex;
    }
    .count,
    .dot {
      position: absolute;
      top: 4px;
      right: 2px;
      pointer-events: none;
    }
    .count {
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      box-sizing: border-box;
      border-radius: 8px;
      background: var(--mat-sys-error);
      color: var(--mat-sys-on-error);
      font: var(--mat-sys-label-small);
      line-height: 16px;
      text-align: center;
    }
    .dot {
      top: 8px;
      right: 8px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--mat-sys-primary);
    }
    .panel {
      width: min(380px, calc(100vw - 32px));
      max-height: 70vh;
      overflow-y: auto;
      padding: 4px 8px 8px;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 4px 4px 12px;
    }
    .heading {
      font: var(--mat-sys-title-medium);
    }
    h3 {
      margin: 8px 12px 2px;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-medium);
    }
    .empty {
      margin: 16px 12px;
      color: var(--mat-sys-on-surface-variant);
    }
    .all {
      width: 100%;
      margin-top: 4px;
    }
  `,
})
export class InboxBellComponent {
  protected readonly store = inject(InboxStore);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  /** The phone: the bell opens the page, a panel would not fit. */
  readonly compact = input(false);

  protected readonly open = signal(false);
  /** Read when the panel opens, and again on every change while it is open. */
  protected readonly latest = httpResource<InboxItem[]>(
    () => {
      this.store.version();
      return this.open() ? CORE_READS.inbox({ limit: 30 }) : undefined;
    },
    { defaultValue: [] },
  );
  protected readonly waiting = computed(() => this.latest.value().filter((item) => item.waiting));
  protected readonly rest = computed(() =>
    this.latest
      .value()
      .filter((item) => !item.waiting)
      .slice(0, PANEL_ITEMS),
  );
  protected readonly label = computed(() =>
    this.transloco.translate('core.inbox.bell', this.store.summary()),
  );
  private readonly trigger = viewChild(MatMenuTrigger);

  constructor() {
    this.store.start();
  }

  protected openPage(): void {
    void this.router.navigateByUrl('/notifications');
  }

  /** A row or "all" was clicked: the panel goes, the page opens. */
  protected close(): void {
    this.trigger()?.closeMenu();
  }
}
