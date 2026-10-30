import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {TranslocoPipe} from '@jsverse/transloco';
import {ActivityRuleSuggestion} from '@pd/contracts';
import {DurationPipe} from '@pd/web-core';
import {firstValueFrom} from 'rxjs';
import {ActivityApi} from '../activity.api';

/**
 * Rules the dashboard offers: windows and sites that keep turning up in work on a project (the
 * app on localhost between two moments in the IDE). The AI picks them once a day; each becomes
 * a rule only when accepted here, and a rejected one is not offered again.
 */
@Component({
  selector: 'pd-activity-rule-suggestions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    TranslocoPipe,
    DurationPipe,
  ],
  template: `
    <div class="head">
      <span class="title">{{
        'activity.rules.suggestions.title' | transloco
      }}</span>
      <button matButton [disabled]="refreshing()" (click)="refresh()">
        <mat-icon>auto_awesome</mat-icon>
        {{ 'activity.rules.suggestions.refresh' | transloco }}
      </button>
    </div>
    @for (item of suggestions.value(); track item.id) {
      <div class="suggestion">
        <mat-icon>{{ item.kind === 'site' ? 'public' : 'web_asset' }}</mat-icon>
        <span class="body">
          <span>«{{ item.pattern }}» → {{ item.projectName }}</span>
          <span class="hint">
            {{
              'activity.rules.suggestions.near'
                | transloco: {time: item.seconds | pdDuration}
            }}
            @if (item.reason) {
              · {{ item.reason }}
            }
          </span>
        </span>
        <button
          matIconButton
          [matTooltip]="'activity.rules.suggestions.accept' | transloco"
          [attr.aria-label]="'activity.rules.suggestions.accept' | transloco"
          (click)="accept(item)"
        >
          <mat-icon>check</mat-icon>
        </button>
        <button
          matIconButton
          [matTooltip]="'activity.rules.suggestions.reject' | transloco"
          [attr.aria-label]="'activity.rules.suggestions.reject' | transloco"
          (click)="reject(item)"
        >
          <mat-icon>close</mat-icon>
        </button>
      </div>
    } @empty {
      <p class="hint">
        {{
          (refreshed()
            ? 'activity.rules.suggestions.nothing'
            : 'activity.rules.suggestions.hint'
          ) | transloco
        }}
      </p>
    }
  `,
  styles: `
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-top: 16px;
    }
    .title {
      font: var(--mat-sys-title-small);
    }
    .suggestion {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 0;
      border-top: 1px solid var(--pd-border);
    }
    .body {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .hint {
      margin: 4px 0 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class RuleSuggestionsComponent {
  private readonly api = inject(ActivityApi);

  /** A suggestion became a rule: the list of rules is out of date. */
  readonly accepted = output<void>();

  protected readonly suggestions = this.api.ruleSuggestions();
  protected readonly refreshing = signal(false);
  protected readonly refreshed = signal(false);

  protected async refresh(): Promise<void> {
    this.refreshing.set(true);
    try {
      await firstValueFrom(this.api.refreshRuleSuggestions());
      this.refreshed.set(true);
      this.suggestions.reload();
    } finally {
      this.refreshing.set(false);
    }
  }

  protected async accept(item: ActivityRuleSuggestion): Promise<void> {
    await firstValueFrom(this.api.acceptRuleSuggestion(item.id));
    this.suggestions.reload();
    this.accepted.emit();
  }

  protected async reject(item: ActivityRuleSuggestion): Promise<void> {
    await firstValueFrom(this.api.rejectRuleSuggestion(item.id));
    this.suggestions.reload();
  }
}
