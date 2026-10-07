import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { BirthdayInput, daysUntilNearest, UpcomingBirthday } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { BirthdayFormDialog } from './birthday-form.dialog';
import { BirthdayWhenComponent } from './birthday-when.component';
import { BirthdaysApi } from './birthdays.api';

/**
 * The people and their dates: a birthday and, for someone who has died, the day of memory —
 * the one with the nearest date first.
 */
@Component({
  selector: 'pd-birthdays-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatCardModule,
    MatListModule,
    MatButtonModule,
    MatIconModule,
    TranslocoPipe,
    BirthdayWhenComponent,
  ],
  template: `
    <header class="page-header">
      <h1 class="page-title">{{ 'birthdays.pageTitle' | transloco }}</h1>
      <button matButton="filled" (click)="openForm()">
        <mat-icon>add</mat-icon> {{ 'birthdays.add' | transloco }}
      </button>
    </header>

    <mat-card appearance="outlined">
      <mat-list>
        @for (birthday of birthdays.value(); track birthday.id) {
          <mat-list-item [lines]="birthday.memorial && birthday.nextDate ? 3 : 2">
            <mat-icon matListItemIcon>{{ birthday.memorial ? 'local_florist' : 'cake' }}</mat-icon>
            <span matListItemTitle>{{ birthday.name }}</span>
            @if (birthday.nextDate) {
              <span matListItemLine>
                @if (birthday.memorial) {
                  {{ 'birthdays.bornOn' | transloco }}
                }
                {{ birthday.nextDate | date: 'd MMMM' }}
                @if (birthday.turningAge) {
                  ·
                  {{
                    (birthday.memorial ? 'birthdays.wouldTurn' : 'birthdays.turning')
                      | transloco: { age: birthday.turningAge }
                  }}
                }
                @if (birthday.note && !birthday.memorial) {
                  · {{ birthday.note }}
                }
              </span>
            }
            @if (birthday.memorial; as memorial) {
              <span matListItemLine>
                {{ 'birthdays.memorialOn' | transloco }}
                {{ memorial.nextDate | date: 'd MMMM' }}
                @if (memorial.years) {
                  · {{ 'birthdays.yearsSince' | transloco: { years: memorial.years } }}
                }
                @if (birthday.note) {
                  · {{ birthday.note }}
                }
              </span>
            }
            <div matListItemMeta class="meta">
              <pd-birthday-when [daysUntil]="nearest(birthday)" [quiet]="!!birthday.memorial" />
              <button matIconButton (click)="openForm(birthday)"><mat-icon>edit</mat-icon></button>
              <button matIconButton (click)="remove(birthday)"><mat-icon>delete</mat-icon></button>
            </div>
          </mat-list-item>
        } @empty {
          <p class="empty padded">{{ 'birthdays.empty' | transloco }}</p>
        }
      </mat-list>
    </mat-card>
  `,
  styles: `
    .meta {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .padded {
      padding: 16px;
    }
  `,
})
export class BirthdaysPage {
  private readonly api = inject(BirthdaysApi);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  protected readonly birthdays = this.api.list();
  /** Days until the nearest date of a person: the birthday or the day of memory. */
  protected readonly nearest = daysUntilNearest;

  async openForm(birthday?: UpcomingBirthday): Promise<void> {
    const input = await firstValueFrom(
      this.dialog
        .open<BirthdayFormDialog, UpcomingBirthday | null, BirthdayInput>(BirthdayFormDialog, {
          data: birthday ?? null,
        })
        .afterClosed(),
    );
    if (!input) {
      return;
    }
    await firstValueFrom(birthday ? this.api.update(birthday.id, input) : this.api.create(input));
    this.birthdays.reload();
  }

  async remove(birthday: UpcomingBirthday): Promise<void> {
    if (confirm(this.transloco.translate('birthdays.confirmDelete', { name: birthday.name }))) {
      await firstValueFrom(this.api.remove(birthday.id));
      this.birthdays.reload();
    }
  }
}
