import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { automationsApi, CORE_READS } from '@pd/client-core';
import { AutomationRule, BirthdayInput, daysUntilNearest, UpcomingBirthday } from '@pd/contracts';
import { DASHBOARD_CLIENT } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { BirthdayFormDialog } from './birthday-form.dialog';
import { BirthdayWhenComponent } from './birthday-when.component';
import { BirthdaysApi } from './birthdays.api';

const GIFT_TRIGGER = 'birthdays.upcoming';

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
    MatTooltipModule,
    TranslocoPipe,
    BirthdayWhenComponent,
  ],
  template: `
    <header class="page-header">
      <h1 class="page-title">{{ 'birthdays.pageTitle' | transloco }}</h1>
      <button
        matButton
        [disabled]="hasGiftRule()"
        [matTooltip]="'birthdays.automations.giftHint' | transloco"
        (click)="addGiftRule()"
      >
        <mat-icon>redeem</mat-icon>
        {{
          (hasGiftRule() ? 'birthdays.automations.giftOn' : 'birthdays.automations.gift')
            | transloco
        }}
      </button>
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

  private readonly automations = automationsApi(inject(DASHBOARD_CLIENT).api);
  private readonly rules = httpResource<AutomationRule[]>(() => CORE_READS.automations(), {
    defaultValue: [],
  });
  /** A rule on the coming birthday is there already (made here or in the settings). */
  protected readonly hasGiftRule = computed(() =>
    this.rules.value().some((rule) => rule.trigger === GIFT_TRIGGER),
  );

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

  /**
   * "A week before a birthday, add a task to buy a gift": a rule of the automations. The task
   * is another section's — the rule only names its action, the core joins the two.
   */
  async addGiftRule(): Promise<void> {
    await this.automations.save({
      name: this.transloco.translate('birthdays.automations.giftRule'),
      trigger: GIFT_TRIGGER,
      triggerParams: { days: '7' },
      action: 'tasks.create',
      // The braces are the rule's own variables, filled in when it runs.
      actionParams: {
        title: this.transloco.translate('birthdays.automations.giftTask', {
          name: '{{name}}',
          date: '{{date}}',
        }),
        due: 'none',
      },
      isActive: true,
    });
    this.rules.reload();
  }

  async remove(birthday: UpcomingBirthday): Promise<void> {
    if (confirm(this.transloco.translate('birthdays.confirmDelete', { name: birthday.name }))) {
      await firstValueFrom(this.api.remove(birthday.id));
      this.birthdays.reload();
    }
  }
}
