import {httpResource} from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {CORE_READS} from '@pd/client-core';
import {LinksChange, LinksChanges} from '@pd/contracts';
import {LifeApi} from '../life.api';
import {formatValue, moduleColor} from './links-format';

/** The changes listed before "the whole history". */
const LISTED = 6;
/** From this size a change is "large" (the levels a whole spread of the days apart). */
const LARGE = 1;

/**
 * "What changed": the days the level of a number changed, over the whole history, the latest
 * first ("since 12 September: 1 h → 2 h"), each with what else changed within a week of it. A
 * nightly search finds them; the card only reads. Opening one is kept for the achievements.
 */
@Component({
  selector: 'pd-changes-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCardModule, MatIconModule, TranslocoPipe],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>timeline</mat-icon>
        <mat-card-title>{{
          'life.links.changes.title' | transloco
        }}</mat-card-title>
        <mat-card-subtitle>{{
          'life.links.changes.hint' | transloco
        }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (data.error()) {
          <p class="muted">{{ 'life.links.changes.failed' | transloco }}</p>
        } @else if (data.hasValue()) {
          @if (!all().length) {
            <p class="muted">{{ 'life.links.changes.none' | transloco }}</p>
          }
          <ul class="changes">
            @for (change of listed(); track change.id) {
              <li>
                <button
                  type="button"
                  class="change"
                  [attr.aria-expanded]="open() === change.id"
                  (click)="toggle(change)"
                >
                  <span
                    class="dot"
                    [style.background]="color(change)"
                    aria-hidden="true"
                  ></span>
                  <span class="name">{{ name(change) }}</span>
                  <span class="levels">
                    {{ value(change, change.before) }}
                    {{ change.after > change.before ? '↗' : '↘' }}
                    {{ value(change, change.after) }}
                  </span>
                  <span class="muted line">
                    {{
                      'life.links.changes.since'
                        | transloco: {day: date(change.day)}
                    }}
                    ·
                    {{
                      (change.effect >= large
                        ? 'life.links.changes.large'
                        : 'life.links.changes.noticeable'
                      ) | transloco
                    }}
                  </span>
                </button>
                @if (open() === change.id) {
                  <div class="near">
                    @if (nearOf(change); as near) {
                      @if (near.length) {
                        <span class="muted">{{
                          'life.links.changes.near' | transloco
                        }}</span>
                        <ul>
                          @for (other of near; track other.id) {
                            <li>
                              {{ name(other) }}:
                              {{ value(other, other.before) }}
                              {{ other.after > other.before ? '↗' : '↘' }}
                              {{ value(other, other.after) }}
                              <span class="muted">({{ date(other.day) }})</span>
                            </li>
                          }
                        </ul>
                      } @else {
                        <span class="muted">{{
                          'life.links.changes.alone' | transloco
                        }}</span>
                      }
                    }
                  </div>
                }
              </li>
            }
          </ul>
          @if (all().length > listed().length || showAll()) {
            <button matButton (click)="showAll.set(!showAll())">
              {{
                (showAll()
                  ? 'life.links.changes.less'
                  : 'life.links.changes.all'
                ) | transloco: {count: all().length}
              }}
            </button>
          }
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    :host {
      display: block;
    }
    .changes {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .change {
      display: grid;
      grid-template-columns: 10px minmax(0, 1fr) auto;
      gap: 2px 8px;
      align-items: baseline;
      width: 100%;
      padding: 8px;
      border: 0;
      border-radius: 8px;
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .change:hover,
    .change[aria-expanded='true'] {
      background: var(--mat-sys-surface-container);
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .name {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .levels {
      font: var(--mat-sys-title-small);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .line {
      grid-column: 2 / -1;
    }
    .near {
      padding: 0 8px 8px 26px;
    }
    .near ul {
      margin: 4px 0 0;
      padding-inline-start: 18px;
    }
    .muted {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class ChangesCardComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly api = inject(LifeApi);

  protected readonly large = LARGE;
  protected readonly data = httpResource<LinksChanges>(() =>
    CORE_READS.changePoints(),
  );
  protected readonly showAll = signal(false);
  protected readonly open = signal<string | null>(null);

  protected readonly all = computed(() =>
    this.data.hasValue() ? this.data.value().changes : [],
  );
  private readonly byId = computed(
    () => new Map(this.all().map(change => [change.id, change])),
  );
  protected readonly listed = computed(() =>
    this.showAll() ? this.all() : this.all().slice(0, LISTED),
  );

  protected toggle(change: LinksChange): void {
    const opening = this.open() !== change.id;
    this.open.set(opening ? change.id : null);
    if (opening) {
      // For the achievements only: a lost mark is not worth a message.
      this.api
        .seen({kind: 'change', key: change.id})
        .subscribe({error: () => undefined});
    }
  }

  protected nearOf(change: LinksChange): LinksChange[] {
    return change.near.flatMap(id => this.byId().get(id) ?? []);
  }

  protected name(change: LinksChange): string {
    return change.label ?? this.transloco.translate(change.labelKey);
  }

  protected color(change: LinksChange): string {
    return moduleColor(change.module);
  }

  protected date(day: string): string {
    return new Date(`${day}T00:00:00`).toLocaleDateString(
      this.transloco.getActiveLang(),
      {day: 'numeric', month: 'long', year: 'numeric'},
    );
  }

  protected value(change: LinksChange, value: number): string {
    return formatValue(change, value, this.transloco.getActiveLang(), hours =>
      this.transloco.translate('life.hours', {value: hours}),
    );
  }
}
