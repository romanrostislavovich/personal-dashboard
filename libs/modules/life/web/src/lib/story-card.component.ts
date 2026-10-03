import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { LifeApi } from './life.api';

/** The AI's story of a month or a year, written on request (or by itself on the 1st). */
@Component({
  selector: 'pd-story-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>auto_awesome</mat-icon>
        <mat-card-title>{{ 'life.story.title' | transloco }}</mat-card-title>
        @if (story(); as s) {
          <mat-card-subtitle>
            {{ 'life.story.written' | transloco: { date: (s.createdAt | date: 'd MMM, HH:mm') } }}
          </mat-card-subtitle>
        }
      </mat-card-header>
      @if (writing()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <mat-card-content>
        @if (story(); as s) {
          <p class="text">{{ s.text }}</p>
        } @else if (nothing()) {
          <p class="hint">{{ 'life.story.nothing' | transloco }}</p>
        }
        @if (error()) {
          <p class="error">{{ 'life.story.error' | transloco }}</p>
        }
      </mat-card-content>
      <mat-card-actions align="end">
        <button matButton (click)="write()" [disabled]="writing()">
          <mat-icon>{{ story() ? 'refresh' : 'auto_awesome' }}</mat-icon>
          {{ (story() ? 'life.story.rewrite' : 'life.story.write') | transloco }}
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    mat-icon[mat-card-avatar] {
      display: grid;
      place-items: center;
      color: var(--mat-sys-primary);
    }
    .text {
      white-space: pre-line;
      font: var(--mat-sys-body-large);
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class StoryCardComponent {
  /** `YYYY-MM` or `YYYY`. */
  readonly period = input.required<string>();

  private readonly api = inject(LifeApi);
  private readonly kept = this.api.story(this.period);
  protected readonly story = computed(() => this.kept.value()?.story ?? null);
  protected readonly writing = signal(false);
  protected readonly error = signal(false);
  protected readonly nothing = signal(false);

  protected async write(): Promise<void> {
    this.writing.set(true);
    this.error.set(false);
    this.nothing.set(false);
    try {
      const { story } = await firstValueFrom(this.api.writeStory(this.period()));
      this.nothing.set(!story);
      this.kept.reload();
    } catch {
      this.error.set(true);
    } finally {
      this.writing.set(false);
    }
  }
}
