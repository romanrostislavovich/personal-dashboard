import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { DOTA_MATCH_MODES, DotaHeroStats, DotaMatchMode } from '@pd/contracts';
import { GamesApi } from '../games.api';
import { DotaMatchListComponent } from './dota-match-list.component';

const PAGE_SIZE = 25;

type Result = 'win' | 'loss';

/** Every match, a page at a time, filtered by hero, mode and result (Dotabuff's matches page). */
@Component({
  selector: 'pd-dota-matches',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonToggleModule,
    MatFormFieldModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSelectModule,
    TranslocoPipe,
    DotaMatchListComponent,
  ],
  template: `
    <div class="filters">
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>{{ 'games.dota.table.hero' | transloco }}</mat-label>
        <mat-select [value]="heroId()" (valueChange)="setHero($event)">
          <mat-option [value]="null">{{ 'games.dota.filters.anyHero' | transloco }}</mat-option>
          @for (h of heroesByName(); track h.hero.id) {
            <mat-option [value]="h.hero.id">{{ h.hero.name }} ({{ h.matches }})</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>{{ 'games.dota.filters.mode' | transloco }}</mat-label>
        <mat-select [value]="mode()" (valueChange)="setMode($event)">
          <mat-option [value]="null">{{ 'games.dota.filters.anyMode' | transloco }}</mat-option>
          @for (m of modes; track m) {
            <mat-option [value]="m">{{ 'games.dota.modes.' + m | transloco }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-button-toggle-group
        [value]="result()"
        (change)="setResult($event.value)"
        [hideSingleSelectionIndicator]="true"
      >
        <mat-button-toggle [value]="null">{{
          'games.dota.filters.all' | transloco
        }}</mat-button-toggle>
        <mat-button-toggle value="win">{{ 'games.dota.win' | transloco }}</mat-button-toggle>
        <mat-button-toggle value="loss">{{ 'games.dota.loss' | transloco }}</mat-button-toggle>
      </mat-button-toggle-group>
    </div>

    @if (page.isLoading()) {
      <mat-progress-bar mode="indeterminate" />
    }
    <pd-dota-match-list
      [matches]="page.value()?.items ?? []"
      [accountNames]="accountNames()"
      [lang]="lang()"
    />
    <mat-paginator
      [length]="page.value()?.total ?? 0"
      [pageSize]="pageSize"
      [pageIndex]="pageIndex()"
      [hidePageSize]="true"
      (page)="turn($event)"
    />
  `,
  styles: `
    .filters {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    mat-form-field {
      width: 220px;
    }
    mat-paginator {
      background: transparent;
    }
  `,
})
export class DotaMatchesComponent {
  readonly accountId = input.required<string | null>();
  readonly heroes = input.required<DotaHeroStats[]>();
  readonly accountNames = input<Record<string, string>>({});
  readonly lang = input.required<string>();

  protected readonly modes = DOTA_MATCH_MODES;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly heroId = signal<number | null>(null);
  protected readonly mode = signal<DotaMatchMode | null>(null);
  protected readonly result = signal<Result | null>(null);
  protected readonly pageIndex = signal(0);

  protected readonly heroesByName = computed(() =>
    [...this.heroes()].sort((a, b) => a.hero.name.localeCompare(b.hero.name)),
  );

  protected readonly page = inject(GamesApi).dotaMatches(() => ({
    accountId: this.accountId() ?? undefined,
    heroId: this.heroId() ?? undefined,
    mode: this.mode() ?? undefined,
    result: this.result() ?? undefined,
    page: this.pageIndex(),
    pageSize: PAGE_SIZE,
  }));

  // A new filter starts from the first page.
  protected setHero(heroId: number | null): void {
    this.heroId.set(heroId);
    this.pageIndex.set(0);
  }

  protected setMode(mode: DotaMatchMode | null): void {
    this.mode.set(mode);
    this.pageIndex.set(0);
  }

  protected setResult(result: Result | null): void {
    this.result.set(result);
    this.pageIndex.set(0);
  }

  protected turn(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
  }
}
