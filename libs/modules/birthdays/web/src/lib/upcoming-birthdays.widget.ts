import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { upcomingDates } from '@pd/contracts';
import { BirthdayWhenComponent } from './birthday-when.component';
import { BirthdaysApi } from './birthdays.api';

const WIDGET_DAYS_AHEAD = 30;
const WIDGET_MAX_ITEMS = 5;

/** Home widget: birthdays and days of memory in the coming month. */
@Component({
  selector: 'pd-upcoming-birthdays-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    MatCardModule,
    MatListModule,
    MatButtonModule,
    TranslocoPipe,
    BirthdayWhenComponent,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>📅 {{ 'birthdays.widget.title' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <mat-list>
          @for (item of upcoming(); track item.person.id + item.kind) {
            <mat-list-item>
              <span matListItemTitle>{{ item.person.name }}</span>
              <span matListItemLine>
                {{ item.date | date: 'd MMMM' }}
                @if (item.kind === 'memorial') {
                  · {{ 'birthdays.widget.memorial' | transloco }}
                } @else if (item.person.memorial) {
                  · {{ 'birthdays.widget.birthdayInMemory' | transloco }}
                }
              </span>
              <pd-birthday-when
                matListItemMeta
                [daysUntil]="item.daysUntil"
                [quiet]="!!item.person.memorial"
              />
            </mat-list-item>
          } @empty {
            <p class="empty">{{ 'birthdays.widget.empty' | transloco }}</p>
          }
        </mat-list>
      </mat-card-content>
      <mat-card-actions align="end">
        <a matButton routerLink="/birthdays">{{ 'birthdays.widget.all' | transloco }}</a>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    pd-birthday-when {
      align-self: center;
    }
  `,
})
export class UpcomingBirthdaysWidget {
  private readonly birthdays = inject(BirthdaysApi).list();

  protected readonly upcoming = computed(() =>
    upcomingDates(this.birthdays.value())
      .filter((date) => date.daysUntil <= WIDGET_DAYS_AHEAD)
      .slice(0, WIDGET_MAX_ITEMS),
  );
}
