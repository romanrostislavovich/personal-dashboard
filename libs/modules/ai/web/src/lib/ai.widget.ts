import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/** Home widget: a quick AI question — opens the chat and sends it right away. */
@Component({
  selector: 'pd-ai-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatCardModule, MatButtonModule, MatIconModule, TranslocoPipe],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>✨ {{ 'ai.title' | transloco }}</mat-card-title>
        <mat-card-subtitle>{{ 'ai.widget.subtitle' | transloco }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <form class="ask" (ngSubmit)="ask()">
          <input
            name="question"
            [ngModel]="question()"
            (ngModelChange)="question.set($event)"
            [placeholder]="'ai.suggestions.spending' | transloco"
          />
          <button matIconButton type="submit" [disabled]="!question().trim()">
            <mat-icon>send</mat-icon>
          </button>
        </form>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .ask {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 12px;
    }
    input {
      flex: 1;
      min-width: 0;
      padding: 10px 14px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 20px;
      background: var(--mat-sys-surface-container-lowest);
      color: inherit;
      font: var(--mat-sys-body-medium);
    }
    input:focus {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: -1px;
    }
  `,
})
export class AiWidget {
  private readonly router = inject(Router);
  protected readonly question = signal('');

  ask(): void {
    this.router.navigate(['/ai'], { queryParams: { q: this.question().trim() } });
  }
}
