import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MusicApi } from './music.api';
import { NowPlayingComponent } from './now-playing.component';

/** Home widget: what is playing now (or what played last) and how many plays today. */
@Component({
  selector: 'pd-music-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    TranslocoPipe,
    NowPlayingComponent,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>🎧 {{ 'music.title' | transloco }}</mat-card-title>
        @if (stats.value(); as s) {
          <mat-card-subtitle>{{
            'music.widget.today' | transloco: { count: s.today }
          }}</mat-card-subtitle>
        }
      </mat-card-header>
      <mat-card-content class="content">
        @if (nowPlaying.value(); as track) {
          <pd-now-playing [track]="track" />
        } @else if (stats.value()?.recent?.[0]; as last) {
          <p>
            <b>{{ last.track }}</b> — {{ last.artist }}
            <span class="muted">· {{ last.playedAt | date: 'd MMM, HH:mm' }}</span>
          </p>
        } @else {
          <p class="muted">{{ 'music.widget.empty' | transloco }}</p>
        }
      </mat-card-content>
      <mat-card-actions align="end">
        <a matButton routerLink="/music">{{ 'music.widget.open' | transloco }}</a>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    .content {
      padding-top: 12px;
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class MusicWidget {
  private readonly api = inject(MusicApi);
  protected readonly nowPlaying = this.api.nowPlaying();
  protected readonly stats = this.api.stats();
}
