import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { BirthdayInput, UpcomingBirthday } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { BirthdayFormDialog } from './birthday-form.dialog';
import { BirthdayWhenComponent } from './birthday-when.component';
import { BirthdaysApi } from './birthdays.api';

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
      <h1 class="page-title">{{ 'birthdays.title' | transloco }}</h1>
      <button matButton="filled" (click)="openForm()">
        <mat-icon>add</mat-icon> {{ 'birthdays.add' | transloco }}
      </button>
    </header>

    <mat-card appearance="outlined">
      <mat-list>
        @for (birthday of birthdays.value(); track birthday.id) {
          <mat-list-item>
            <mat-icon matListItemIcon>cake</mat-icon>
            <span matListItemTitle>{{ birthday.name }}</span>
            <span matListItemLine>
              {{ birthday.nextDate | date: 'd MMMM' }}
              @if (birthday.turningAge) {
                · {{ 'birthdays.turning' | transloco: { age: birthday.turningAge } }}
              }
              @if (birthday.note) {
                · {{ birthday.note }}
              }
            </span>
            <div matListItemMeta class="meta">
              <pd-birthday-when [daysUntil]="birthday.daysUntil" />
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
