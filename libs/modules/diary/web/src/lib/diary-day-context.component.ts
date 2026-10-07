import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { CORE_READS } from '@pd/client-core';
import { LifeDay } from '@pd/contracts';

/**
 * What the other sections know about the day being written about: the hours at the computer,
 * the money, the music, the tasks — something to start an entry from. The core gathers it
 * (the life timeline); the diary's own line is left out.
 */
@Component({
  selector: 'pd-diary-day-context',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatIconModule, RouterLink, TranslocoPipe],
  template: `
    @if (events().length) {
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-card-title>{{ 'diary.dayContext.title' | transloco }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <ul>
            @for (event of events(); track $index) {
              <li>
                <mat-icon inline>{{ event.icon }}</mat-icon>
                @if (event.link) {
                  <a [routerLink]="event.link">{{ event.key | transloco: event.params ?? {} }}</a>
                } @else {
                  <span>{{ event.key | transloco: event.params ?? {} }}</span>
                }
              </li>
            }
          </ul>
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: `
    ul {
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    li {
      display: flex;
      align-items: baseline;
      gap: 8px;
      font: var(--mat-sys-body-medium);
    }
    mat-icon {
      color: var(--mat-sys-primary);
    }
    a {
      color: inherit;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  `,
})
export class DiaryDayContextComponent {
  /** The day of the entry, `YYYY-MM-DD`. */
  readonly day = input.required<string>();

  private readonly timeline = httpResource<LifeDay>(() => CORE_READS.lifeDay(this.day()));
  protected readonly events = computed(() =>
    (this.timeline.value()?.events ?? []).filter((event) => event.module !== 'diary'),
  );
}
