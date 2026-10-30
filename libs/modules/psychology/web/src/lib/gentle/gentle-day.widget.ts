import {ChangeDetectionStrategy, Component} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {RouterLink} from '@angular/router';
import {TranslocoPipe} from '@jsverse/transloco';
import {GentleDayComponent} from './gentle-day.component';

/** Home widget: the gentle day, turned on and marked without leaving the home page. */
@Component({
  selector: 'pd-gentle-day-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    RouterLink,
    TranslocoPipe,
    GentleDayComponent,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title
          >🌿 {{ 'psychology.gentle.title' | transloco }}</mat-card-title
        >
      </mat-card-header>
      <mat-card-content class="padded">
        <pd-gentle-day [compact]="true" />
      </mat-card-content>
      <mat-card-actions align="end">
        <a matButton routerLink="/psychology/help">
          <mat-icon>support</mat-icon>
          {{ 'psychology.tabs.help' | transloco }}
        </a>
        <a matButton routerLink="/psychology/gentle">
          {{ 'psychology.gentle.library' | transloco }}
        </a>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    .padded {
      padding-top: 12px;
    }
  `,
})
export class GentleDayWidget {}
