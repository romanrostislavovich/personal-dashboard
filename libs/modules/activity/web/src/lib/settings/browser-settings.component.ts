import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatChipsModule} from '@angular/material/chips';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {MatTooltipModule} from '@angular/material/tooltip';
import {TranslocoPipe} from '@jsverse/transloco';
import {ActivityLimitInput, siteDomainSchema} from '@pd/contracts';
import {DurationPipe} from '@pd/web-core';
import {firstValueFrom} from 'rxjs';
import {ActivityApi} from '../activity.api';

const SITE_LIMITS = [15, 30, 45, 60, 90, 120, 180];

/**
 * What the browser extension does in Activity: whether it counts the time on each site, the
 * sites it keeps closed during a focus session of the desktop app, and the daily limits of sites.
 */
@Component({
  selector: 'pd-activity-browser-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule,
    TranslocoPipe,
    DurationPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>public</mat-icon>
        <mat-card-title>{{
          'activity.browser.title' | transloco
        }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <p class="hint">{{ 'activity.browser.hint' | transloco }}</p>
        @if (settings.value(); as current) {
          <mat-slide-toggle
            [checked]="current.trackSites"
            (change)="save({trackSites: $event.checked})"
          >
            {{ 'activity.browser.track' | transloco }}
          </mat-slide-toggle>

          <h3>{{ 'activity.browser.distracting' | transloco }}</h3>
          <p class="hint">
            {{ 'activity.browser.distractingHint' | transloco }}
          </p>
          <mat-chip-set
            [attr.aria-label]="'activity.browser.distracting' | transloco"
          >
            @for (site of current.distractingSites; track site) {
              <mat-chip (removed)="removeDistracting(site)">
                {{ site }}
                <button
                  matChipRemove
                  [attr.aria-label]="'core.actions.delete' | transloco"
                >
                  <mat-icon>cancel</mat-icon>
                </button>
              </mat-chip>
            }
          </mat-chip-set>
          <form
            class="row"
            (submit)="$event.preventDefault(); addDistracting()"
          >
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ 'activity.browser.site' | transloco }}</mat-label>
              <input
                matInput
                placeholder="youtube.com"
                [value]="newDistracting()"
                (input)="newDistracting.set($any($event.target).value)"
              />
            </mat-form-field>
            <button
              matButton="tonal"
              type="submit"
              [disabled]="!domain(newDistracting())"
            >
              {{ 'core.actions.add' | transloco }}
            </button>
          </form>
        }

        <h3>{{ 'activity.browser.limits' | transloco }}</h3>
        <p class="hint">{{ 'activity.browser.limitsHint' | transloco }}</p>
        @for (limit of siteLimits(); track limit.app) {
          <div class="row">
            <span class="name">{{ limit.app }}</span>
            <mat-form-field subscriptSizing="dynamic" class="narrow">
              <mat-select
                [value]="limit.minutes"
                [attr.aria-label]="'activity.wellbeing.perDay' | transloco"
                (valueChange)="setLimit(limit.app ?? '', $event)"
              >
                @for (minutes of limitOptions; track minutes) {
                  <mat-option [value]="minutes">{{
                    minutes * 60 | pdDuration
                  }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <button
              matIconButton
              [matTooltip]="'core.actions.delete' | transloco"
              [attr.aria-label]="'core.actions.delete' | transloco"
              (click)="setLimit(limit.app ?? '', 0)"
            >
              <mat-icon>delete</mat-icon>
            </button>
          </div>
        }
        <form class="row" (submit)="$event.preventDefault(); addLimit()">
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'activity.browser.site' | transloco }}</mat-label>
            <input
              matInput
              placeholder="youtube.com"
              [value]="newLimit()"
              (input)="newLimit.set($any($event.target).value)"
            />
          </mat-form-field>
          <button
            matButton="tonal"
            type="submit"
            [disabled]="!domain(newLimit())"
          >
            {{ 'activity.browser.addLimit' | transloco }}
          </button>
        </form>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .hint {
      margin: 0 0 12px;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    h3 {
      margin: 16px 0 4px;
      font: var(--mat-sys-title-small);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      margin: 8px 0;
    }
    .row mat-form-field {
      flex: 0 1 240px;
    }
    .row mat-form-field.narrow {
      flex: 0 1 160px;
    }
    .name {
      flex: 0 1 240px;
      overflow-wrap: anywhere;
    }
  `,
})
export class BrowserSettingsComponent {
  private readonly api = inject(ActivityApi);

  protected readonly limitOptions = SITE_LIMITS;
  protected readonly settings = this.api.settings();
  private readonly limitsResource = this.api.limits();
  /** Changed at once on the page, saved to the server behind it. */
  private readonly limits = signal<ActivityLimitInput[] | null>(null);
  private readonly current = computed(
    () =>
      this.limits() ??
      this.limitsResource
        .value()
        .map(({kind, app, minutes}) => ({kind, app, minutes})),
  );
  protected readonly siteLimits = computed(() =>
    this.current().filter(limit => limit.kind === 'site'),
  );
  protected readonly newDistracting = signal('');
  protected readonly newLimit = signal('');

  /** The domain of what was typed (`https://www.youtube.com/feed` → `youtube.com`); null — none. */
  protected domain(typed: string): string | null {
    const parsed = siteDomainSchema.safeParse(typed);
    return parsed.success ? parsed.data : null;
  }

  protected async save(update: {
    trackSites?: boolean;
    distractingSites?: string[];
  }): Promise<void> {
    await firstValueFrom(this.api.saveSettings(update));
    this.settings.reload();
  }

  protected addDistracting(): void {
    const site = this.domain(this.newDistracting());
    const sites = this.settings.value()?.distractingSites ?? [];
    if (site && !sites.includes(site)) {
      void this.save({distractingSites: [...sites, site]});
    }
    this.newDistracting.set('');
  }

  protected removeDistracting(site: string): void {
    const sites = this.settings.value()?.distractingSites ?? [];
    void this.save({distractingSites: sites.filter(one => one !== site)});
  }

  protected addLimit(): void {
    const site = this.domain(this.newLimit());
    if (site && !this.siteLimits().some(limit => limit.app === site)) {
      this.setLimit(site, 60);
    }
    this.newLimit.set('');
  }

  /** `0` removes the site's limit; the limits of programs and games stay as they are. */
  protected setLimit(site: string, minutes: number): void {
    const others = this.current().filter(
      limit => !(limit.kind === 'site' && limit.app === site),
    );
    void this.saveLimits(
      minutes ? [...others, {kind: 'site', app: site, minutes}] : others,
    );
  }

  private async saveLimits(limits: ActivityLimitInput[]): Promise<void> {
    this.limits.set(limits);
    await firstValueFrom(
      this.api.replaceLimits(
        ['site'],
        limits.filter(limit => limit.kind === 'site'),
      ),
    );
    this.limitsResource.reload();
  }
}
