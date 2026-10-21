import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
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
    @if (!selectedDay()) {
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
    }

    @if (timeline.error()) {
      <p role="alert">{{ 'life.chronicle.timelineError' | transloco }}</p>
      <button matButton (click)="timeline.reload()">{{ 'life.chronicle.retry' | transloco }}</button>
    }

    @if (allDay().length) {
      <!-- What belongs to the whole day: the money, the diary, the weather. -->
      <div class="cards">
        @for (event of allDay(); track $index) {
          <a class="card" [routerLink]="event.link ?? null" [class.static]="!event.link">
            <span class="module">
              <mat-icon>{{ event.icon }}</mat-icon>
              {{ event.module + '.title' | transloco }}
            </span>
            <span class="text">{{ event.key | transloco: event.params ?? {} }}</span>
          </a>
        }
      </div>
    }

    @if (timed().length) {
      <!-- What happened at an hour: a line down the day. -->
      <ol class="timeline">
        @for (event of timed(); track $index) {
          <li>
            <span class="time">{{ event.at | date: 'HH:mm' }}</span>
            <span class="dot"
              ><mat-icon>{{ event.icon }}</mat-icon></span
            >
            <span class="text">
              <span class="module">{{ event.module + '.title' | transloco }}</span>
              {{ event.key | transloco: event.params ?? {} }}
            </span>
            @if (event.link) {
              <a
                matIconButton
                [routerLink]="event.link"
                [attr.aria-label]="'life.open' | transloco"
              >
                <mat-icon>arrow_forward</mat-icon>
              </a>
            }
          </li>
        }
      </ol>
    }

    @if (!events().length && !timeline.isLoading() && !timeline.error()) {
      <p class="hint">{{ 'life.empty' | transloco }}</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
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
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr));
      gap: 12px;
    }
    .card {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 16px;
      border: 1px solid var(--pd-border);
      border-radius: var(--pd-radius);
      background: var(--pd-card);
      color: inherit;
      text-decoration: none;
      overflow-wrap: anywhere;
    }
    a.card:not(.static):hover {
      border-color: var(--mat-sys-primary);
    }
    .card .module {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--mat-sys-primary);
    }
    .card .text {
      font: var(--mat-sys-body-large);
    }
    .timeline {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .timeline li {
      display: grid;
      grid-template-columns: 52px 32px 1fr auto;
      align-items: center;
      gap: 12px;
      min-height: 52px;
    }
    .dot {
      position: relative;
      display: flex;
      align-self: stretch;
      align-items: center;
      justify-content: center;
    }
    /* The line through the dots, from the first to the last. */
    .dot::before {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      background: var(--mat-sys-outline-variant);
    }
    li:first-child .dot::before {
      top: 50%;
    }
    li:last-child .dot::before {
      bottom: 50%;
    }
    .dot mat-icon {
      position: relative;
      padding: 4px;
      border-radius: 50%;
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: var(--mat-sys-on-primary-container);
      background: var(--mat-sys-primary-container);
    }
    .text {
      display: flex;
      flex-direction: column;
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
  readonly selectedDay = input<string>();
  protected readonly today = todayLocalDate();
  /** `/life/day?day=2026-10-03` (links of the AI's answers) opens that day. */
  protected readonly day = signal(
    validDay(inject(ActivatedRoute).snapshot.queryParamMap.get('day'), this.today),
  );
  protected readonly timeline = httpResource<LifeDay>(() => CORE_READS.lifeDay(this.selectedDay() ?? this.day()));
  protected readonly events = computed(() => this.timeline.hasValue() ? this.timeline.value().events : []);
  protected readonly allDay = computed(() => this.events().filter((event) => !event.at));
  protected readonly timed = computed(() => this.events().filter((event) => event.at));

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
