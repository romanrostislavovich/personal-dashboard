import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { automationsApi, CORE_READS } from '@pd/client-core';
import { AutomationCatalog, AutomationRule, AutomationRuleInput } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { DASHBOARD_CLIENT } from '../client/dashboard-client';
import { AutomationRuleData, AutomationRuleDialog } from './automation-rule.dialog';

/**
 * Settings → Automations: the rules "if X, then Y" of the user, made by hand or described in a
 * sentence for the AI to fill in.
 */
@Component({
  selector: 'pd-automations-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>{{ 'core.automations.title' | transloco }}</mat-card-title>
        <mat-card-subtitle>{{ 'core.automations.intro' | transloco }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <form class="compose" (ngSubmit)="compose()">
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'core.automations.describe' | transloco }}</mat-label>
            <input
              matInput
              name="text"
              maxlength="500"
              [ngModel]="text()"
              (ngModelChange)="text.set($event)"
              [placeholder]="'core.automations.describePlaceholder' | transloco"
            />
            <mat-hint>{{ 'core.automations.composeHint' | transloco }}</mat-hint>
          </mat-form-field>
          <button
            matButton="tonal"
            type="submit"
            [disabled]="composing() || text().trim().length < 5"
          >
            <mat-icon>auto_awesome</mat-icon> {{ 'core.automations.compose' | transloco }}
          </button>
          <button matButton type="button" (click)="open()">
            <mat-icon>add</mat-icon> {{ 'core.automations.add' | transloco }}
          </button>
        </form>
        @if (composing()) {
          <mat-progress-bar mode="indeterminate" />
        }
        @if (composeError(); as error) {
          <p class="error">{{ 'core.automations.composeError' | transloco }}: {{ error }}</p>
        }

        <ul class="rules">
          @for (rule of rules.value(); track rule.id) {
            <li [class.off]="!rule.isActive">
              <mat-slide-toggle
                [checked]="rule.isActive"
                [attr.aria-label]="'core.automations.active' | transloco"
                (change)="toggle(rule, $event.checked)"
              />
              <div class="body">
                <b>{{ rule.name }}</b>
                <span class="flow">
                  {{ label(rule.trigger, 'trigger') }} → {{ label(rule.action, 'action') }}
                </span>
                <span class="meta">
                  @if (rule.lastFiredAt) {
                    {{
                      'core.automations.fired'
                        | transloco
                          : {
                              count: rule.fireCount,
                              date: (rule.lastFiredAt | date: 'd MMM, HH:mm'),
                            }
                    }}
                  } @else {
                    {{ 'core.automations.never' | transloco }}
                  }
                </span>
                @if (rule.lastError) {
                  <span class="error">
                    {{ 'core.automations.error' | transloco: { error: rule.lastError } }}
                  </span>
                }
              </div>
              <button
                matIconButton
                [attr.aria-label]="'core.actions.edit' | transloco"
                (click)="open(rule)"
              >
                <mat-icon>edit</mat-icon>
              </button>
              <button
                matIconButton
                [attr.aria-label]="'core.actions.delete' | transloco"
                (click)="remove(rule)"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </li>
          } @empty {
            @if (!rules.isLoading()) {
              <li class="meta">{{ 'core.automations.empty' | transloco }}</li>
            }
          }
        </ul>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .compose {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      margin: 8px 0 16px;
    }
    .compose mat-form-field {
      flex: 1;
      min-width: min(320px, 100%);
    }
    .rules {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .rules li {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }
    .rules li.off .body {
      opacity: 0.6;
    }
    .body {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .flow,
    .meta {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .error {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class AutomationsSettingsComponent {
  private readonly api = automationsApi(inject(DASHBOARD_CLIENT).api);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  protected readonly rules = httpResource<AutomationRule[]>(() => CORE_READS.automations(), {
    defaultValue: [],
  });
  private readonly catalog = httpResource<AutomationCatalog>(() => CORE_READS.automationsCatalog());
  private readonly labels = computed(() => {
    const catalog = this.catalog.value();
    return new Map(
      [...(catalog?.triggers ?? []), ...(catalog?.actions ?? [])].map((item) => [
        item.id,
        item.labelKey,
      ]),
    );
  });

  protected readonly text = signal('');
  protected readonly composing = signal(false);
  protected readonly composeError = signal<string | null>(null);

  protected label(id: string, _kind: 'trigger' | 'action'): string {
    const key = this.labels().get(id);
    return key ? this.transloco.translate(key) : id;
  }

  protected async compose(): Promise<void> {
    this.composing.set(true);
    this.composeError.set(null);
    try {
      const draft = await this.api.draft(this.text().trim());
      if (await this.open(undefined, draft)) {
        this.text.set('');
      }
    } catch (error) {
      this.composeError.set(errorText(error));
    } finally {
      this.composing.set(false);
    }
  }

  /** Opens the editor; `true` — a rule was saved. */
  protected async open(rule?: AutomationRule, draft?: AutomationRuleInput): Promise<boolean> {
    const catalog = this.catalog.value();
    if (!catalog) {
      return false;
    }
    const input = await firstValueFrom(
      this.dialog
        .open<AutomationRuleDialog, AutomationRuleData, AutomationRuleInput>(AutomationRuleDialog, {
          data: { catalog, rule: rule ?? draft ?? null },
        })
        .afterClosed(),
    );
    if (!input) {
      return false;
    }
    await this.api.save(input, rule?.id);
    this.rules.reload();
    return true;
  }

  protected async toggle(rule: AutomationRule, isActive: boolean): Promise<void> {
    const { name, trigger, triggerParams, action, actionParams } = rule;
    await this.api.save({ name, trigger, triggerParams, action, actionParams, isActive }, rule.id);
    this.rules.reload();
  }

  protected async remove(rule: AutomationRule): Promise<void> {
    if (confirm(this.transloco.translate('core.automations.confirmDelete', { name: rule.name }))) {
      await this.api.remove(rule.id);
      this.rules.reload();
    }
  }
}

/** The server's message ("AI is not configured", why the AI could not make a rule). */
function errorText(error: unknown): string {
  const body = (error as { body?: { message?: unknown } })?.body;
  const message = body?.message ?? (error as Error)?.message;
  return typeof message === 'string' ? message : String(message ?? error);
}
