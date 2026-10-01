import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoPipe } from '@jsverse/transloco';
import { TrackedRepo, TrackedRepoUpdate } from '@pd/contracts';
import { SparklineComponent } from '@pd/web-core';

/**
 * What a table row opens into: the description, the star chart, the release and the npm
 * package, and the switches of the repository — notifications and "hide".
 */
@Component({
  selector: 'pd-repo-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    TranslocoPipe,
    SparklineComponent,
  ],
  template: `
    @let r = repo();
    @if (r.syncError) {
      <p class="error">
        <mat-icon inline>warning</mat-icon> {{ 'development.oss.syncError' | transloco }}:
        {{ r.syncError }}
      </p>
    }
    @if (r.description) {
      <p class="description">{{ r.description }}</p>
    }

    <div class="columns">
      <div class="chart">
        <span class="label">
          {{ 'development.oss.starsHistory' | transloco }}
          @if (r.starsDelta.month > 0) {
            <span class="up">+{{ r.starsDelta.month | number }}</span>
          }
        </span>
        @if (starsHistory().length > 1) {
          <pd-sparkline
            [points]="starsHistory()"
            [label]="'development.oss.starsHistory' | transloco"
          />
        } @else {
          <p class="hint">{{ 'development.oss.historyCollecting' | transloco }}</p>
        }
      </div>

      <dl class="facts">
        <div>
          <dt>{{ 'development.oss.source' | transloco }}</dt>
          <dd>{{ 'development.oss.relations.' + r.relation | transloco }}</dd>
        </div>
        <div>
          <dt>{{ 'development.oss.release' | transloco }}</dt>
          <dd>
            @if (r.latestRelease; as release) {
              <a [href]="r.htmlUrl + '/releases'" target="_blank" rel="noopener">{{
                release.tag
              }}</a>
              · {{ release.publishedAt | date: 'd MMM y' }}
            } @else {
              —
            }
          </dd>
        </div>
        <div>
          <dt>{{ 'development.oss.npmPackageShort' | transloco }}</dt>
          <dd>
            @if (r.npmPackage) {
              <a
                [href]="'https://www.npmjs.com/package/' + r.npmPackage"
                target="_blank"
                rel="noopener"
                >{{ r.npmPackage }}</a
              >
            } @else {
              —
            }
            <button
              matIconButton
              class="inline-button"
              [attr.aria-label]="'development.oss.editNpm' | transloco"
              (click)="editNpm.emit(r)"
            >
              <mat-icon>edit</mat-icon>
            </button>
          </dd>
        </div>
      </dl>
    </div>

    <div class="actions">
      <mat-slide-toggle [checked]="r.notify" (change)="update.emit({ notify: $event.checked })">
        {{ 'development.oss.notify' | transloco }}
      </mat-slide-toggle>
      <mat-slide-toggle [checked]="r.hidden" (change)="update.emit({ hidden: $event.checked })">
        {{ 'development.oss.hide' | transloco }}
      </mat-slide-toggle>
      <span class="spacer"></span>
      <a matButton [href]="r.htmlUrl" target="_blank" rel="noopener">
        <mat-icon>open_in_new</mat-icon> {{ 'development.oss.openRepo' | transloco }}
      </a>
      <!-- A repository of the account would come back with the next sync: it is hidden instead. -->
      @if (r.relation === 'manual') {
        <button matButton (click)="remove.emit(r)">
          <mat-icon>delete</mat-icon> {{ 'development.oss.remove' | transloco }}
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px 16px 16px;
    }
    p {
      margin: 0;
    }
    .columns {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
      gap: 16px 32px;
    }
    .label,
    dt {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .up {
      margin-left: 6px;
      color: var(--mat-sys-primary);
    }
    .facts {
      display: grid;
      gap: 8px;
      margin: 0;
    }
    dd {
      display: flex;
      align-items: center;
      gap: 4px;
      margin: 0;
    }
    a {
      color: var(--mat-sys-primary);
      text-decoration: none;
    }
    .inline-button {
      --mat-icon-button-state-layer-size: 28px;
      --mat-icon-button-icon-size: 16px;
      padding: 6px;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .error {
      color: var(--mat-sys-error);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 24px;
    }
    .spacer {
      flex: 1;
    }
  `,
})
export class RepoDetailsComponent {
  readonly repo = input.required<TrackedRepo>();
  /** A switch was flipped: the fields to change. */
  readonly update = output<TrackedRepoUpdate>();
  readonly editNpm = output<TrackedRepo>();
  readonly remove = output<TrackedRepo>();

  protected readonly starsHistory = computed(() =>
    this.repo().history.map((point) => ({ at: point.day, value: point.stars })),
  );
}
