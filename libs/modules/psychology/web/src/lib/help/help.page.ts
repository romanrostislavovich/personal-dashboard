import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  CRISIS_LINES,
  CRISIS_LINES_CHECKED_ON,
  crisisCountryOf,
  CrisisCountry,
  FIND_A_HELPLINE,
  telegramContact,
} from '@pd/contracts';
import { AuthService } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { PsychologyApi } from '../psychology.api';

/**
 * When it is too hard: a close person to write to in one tap, the crisis lines of the user's
 * country (its own first, the others folded), the emergency number. Opened from the gentle day,
 * the menu of Psychology and the command palette; it works offline too — the numbers are in the
 * app, not asked of the server.
 */
@Component({
  selector: 'pd-help-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    NgTemplateOutlet,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{ 'psychology.help.title' | transloco }}</mat-card-title>
        <mat-card-subtitle>{{ 'psychology.help.about' | transloco }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content class="content">
        @if (contact(); as person) {
          @if (!editing()) {
            <a
              class="big"
              matButton="filled"
              [href]="'https://t.me/' + person.telegram"
              target="_blank"
              rel="noopener"
            >
              <mat-icon>send</mat-icon>
              {{ 'psychology.help.write' | transloco: { name: person.name } }}
            </a>
            <button matButton (click)="edit()">{{ 'psychology.help.change' | transloco }}</button>
          }
        } @else if (!editing()) {
          <p class="hint">{{ 'psychology.help.noPerson' | transloco }}</p>
          <button matButton="tonal" (click)="edit()">
            <mat-icon>person_add</mat-icon>
            {{ 'psychology.help.addPerson' | transloco }}
          </button>
        }
        @if (editing()) {
          <form class="person" (ngSubmit)="savePerson()">
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ 'psychology.help.name' | transloco }}</mat-label>
              <input matInput name="name" [(ngModel)]="name" maxlength="60" />
            </mat-form-field>
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ 'psychology.help.telegram' | transloco }}</mat-label>
              <input
                matInput
                name="telegram"
                [(ngModel)]="telegram"
                placeholder="@username, +48…"
                autocapitalize="off"
              />
            </mat-form-field>
            @if (invalid()) {
              <p class="error">{{ 'psychology.help.invalid' | transloco }}</p>
            }
            <div class="actions">
              <button matButton="filled" type="submit">
                {{ 'psychology.help.save' | transloco }}
              </button>
              @if (contact()) {
                <button matButton type="button" (click)="removePerson()">
                  {{ 'psychology.help.remove' | transloco }}
                </button>
              }
              <button matButton type="button" (click)="editing.set(false)">
                {{ 'psychology.help.cancel' | transloco }}
              </button>
            </div>
          </form>
        }
      </mat-card-content>
    </mat-card>

    @if (home(); as country) {
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-card-title>{{ 'psychology.help.lines' | transloco }}</mat-card-title>
        </mat-card-header>
        <mat-card-content class="content">
          <ng-container *ngTemplateOutlet="lines; context: { $implicit: country }" />
        </mat-card-content>
      </mat-card>
    }

    <mat-accordion>
      <mat-expansion-panel>
        <mat-expansion-panel-header>
          <mat-panel-title>{{ 'psychology.help.otherCountries' | transloco }}</mat-panel-title>
        </mat-expansion-panel-header>
        @for (country of others(); track country.code) {
          <h3>{{ 'psychology.help.countries.' + country.code | transloco }}</h3>
          <ng-container *ngTemplateOutlet="lines; context: { $implicit: country }" />
        }
        <p>
          <a [href]="findAHelpline" target="_blank" rel="noopener">
            {{ 'psychology.help.anyCountry' | transloco }}
          </a>
        </p>
      </mat-expansion-panel>
    </mat-accordion>

    <p class="checked">
      {{ 'psychology.help.checked' | transloco: { date: checkedOn } }}
    </p>

    <ng-template #lines let-country>
      @for (line of $any(country).lines; track line.phone) {
        <div class="line">
          <a matButton="tonal" [href]="'tel:' + line.phone.replaceAll(' ', '')">
            <mat-icon>call</mat-icon>
            {{ line.phone }}
          </a>
          <div>
            <div>{{ line.name }}</div>
            <div class="hint">
              {{ (line.allDay ? 'psychology.help.allDay' : 'psychology.help.hours') | transloco }}
              @if (line.url) {
                · <a [href]="line.url" target="_blank" rel="noopener">{{ host(line.url) }}</a>
              }
            </div>
          </div>
        </div>
      }
      <p class="hint">
        {{ 'psychology.help.emergency' | transloco: { number: $any(country).emergency } }}
      </p>
    </ng-template>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .content {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
      padding-top: 12px;
    }
    .big {
      font-size: 1.1rem;
    }
    .person {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: min(400px, 100%);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .line {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .line > a {
      flex: none;
      white-space: nowrap;
    }
    .hint,
    .checked {
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      color: var(--mat-sys-error);
      margin: 0;
    }
  `,
})
export class HelpPage {
  private readonly api = inject(PsychologyApi);
  private readonly auth = inject(AuthService);
  private readonly settings = this.api.settings();

  protected readonly findAHelpline = FIND_A_HELPLINE;
  protected readonly checkedOn = CRISIS_LINES_CHECKED_ON;
  protected readonly editing = signal(false);
  protected readonly invalid = signal(false);
  protected name = '';
  protected telegram = '';

  protected readonly contact = computed(() => {
    const value = this.settings.value();
    return value?.closeName && value.closeTelegram
      ? { name: value.closeName, telegram: value.closeTelegram }
      : null;
  });
  /** The user's own country (by the time zone of their device); `null` — none listed. */
  protected readonly home = computed<CrisisCountry | null>(() => {
    const code = crisisCountryOf(this.auth.user()?.timeZone);
    return CRISIS_LINES.find((country) => country.code === code) ?? null;
  });
  protected readonly others = computed(() =>
    CRISIS_LINES.filter((country) => country !== this.home()),
  );

  protected edit(): void {
    this.name = this.contact()?.name ?? '';
    this.telegram = this.contact()?.telegram ?? '';
    this.invalid.set(false);
    this.editing.set(true);
  }

  protected async savePerson(): Promise<void> {
    if (!this.name.trim() || !telegramContact(this.telegram)) {
      this.invalid.set(true);
      return;
    }
    await firstValueFrom(
      this.api.saveSettings({ closeName: this.name.trim(), closeTelegram: this.telegram }),
    );
    this.editing.set(false);
    this.settings.reload();
  }

  protected async removePerson(): Promise<void> {
    await firstValueFrom(this.api.saveSettings({ closeName: null, closeTelegram: null }));
    this.editing.set(false);
    this.settings.reload();
  }

  protected host(url: string): string {
    return new URL(url).hostname.replace(/^www\./, '');
  }
}
