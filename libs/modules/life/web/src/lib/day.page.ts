import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { CORE_READS } from '@pd/client-core';
import { LifeDay } from '@pd/contracts';
import { todayLocalDate } from '@pd/web-core';

/** A day across every module: the diary, the money, what was done, played and listened to. */
@Component({
  selector: 'pd-life-day-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatButtonModule, MatCardModule, MatIconModule, RouterLink, TranslocoPipe],
  template: `
    <header class="toolbar">
      <button matIconButton [attr.aria-label]="'life.previous' | transloco" (click)="shift(-1)">
        <mat-icon>chevron_left</mat-icon>
      </button>
      <input
        type="date"
        [value]="day()"
        [max]="today"
        [attr.aria-label]="'life.day' | transloco"
        (change)="pick($any($event.target).value)"
      />
      <button
        matIconButton
        [attr.aria-label]="'life.next' | transloco"
        [disabled]="day() >= today"
        (click)="shift(1)"
      >
        <mat-icon>chevron_right</mat-icon>
      </button>
      <span class="date">{{ day() | date: 'EEEE, d MMMM y' }}</span>
    </header>

    <ul class="events">
      @for (event of events(); track $index) {
        <li>
          <mat-icon class="icon">{{ event.icon }}</mat-icon>
          <span class="text">
            <span class="module">{{ event.module + '.title' | transloco }}</span>
            {{ event.key | transloco: event.params ?? {} }}
          </span>
          @if (event.at) {
            <span class="time">{{ event.at | date: 'HH:mm' }}</span>
          }
          @if (event.link) {
            <a matIconButton [routerLink]="event.link" [attr.aria-label]="'life.open' | transloco">
              <mat-icon>arrow_forward</mat-icon>
            </a>
          }
        </li>
      } @empty {
        @if (!timeline.isLoading()) {
          <li class="hint">{{ 'life.empty' | transloco }}</li>
        }
      }
    </ul>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 860px;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
    }
    input {
      padding: 6px 8px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
      background: transparent;
      color: inherit;
      font: inherit;
      color-scheme: inherit;
    }
    .date {
      margin-left: 12px;
      font: var(--mat-sys-title-medium);
      text-transform: capitalize;
    }
    .events {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .events li {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 10px 0;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }
    .events li:first-child {
      border-top: 0;
    }
    .icon {
      color: var(--mat-sys-primary);
    }
    .text {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .module {
      font: var(--mat-sys-label-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .time,
    .hint {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class DayPage {
  protected readonly today = todayLocalDate();
  /** `/life/day?day=2026-10-03` (links of the AI's answers) opens that day. */
  protected readonly day = signal(
    validDay(inject(ActivatedRoute).snapshot.queryParamMap.get('day'), this.today),
  );
  protected readonly timeline = httpResource<LifeDay>(() => CORE_READS.lifeDay(this.day()));
  protected readonly events = computed(() => this.timeline.value()?.events ?? []);

  protected pick(day: string): void {
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day <= this.today) {
      this.day.set(day);
    }
  }

  protected shift(days: number): void {
    const at = new Date(`${this.day()}T12:00:00`);
    at.setDate(at.getDate() + days);
    const pad = (value: number) => String(value).padStart(2, '0');
    this.pick(`${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`);
  }
}

function validDay(value: string | null, today: string): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && value <= today ? value : today;
}
