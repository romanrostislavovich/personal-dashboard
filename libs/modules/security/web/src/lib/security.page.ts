import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { SecurityFinding, SecuritySettings, SecuritySeverity } from '@pd/contracts';
import { errorStatus, MarkdownPipe } from '@pd/web-core';
import { firstValueFrom, Observable } from 'rxjs';
import { SecurityApi } from './security.api';

/** "The assistant's connection": mat-select treats null as no selection. */
const ASSISTANT = '';

const ICONS: Record<SecuritySeverity, string> = {
  critical: 'gpp_bad',
  high: 'error',
  medium: 'warning',
  low: 'info',
  info: 'lightbulb',
};

/**
 * The security agent: what it found on the dashboard, the server, the computers and in the
 * repository — the worst first, each with what to do — and the AI's own report. The agent only
 * looks and tells; nothing here changes the server.
 */
@Component({
  selector: 'pd-security-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSlideToggleModule,
    TranslocoPipe,
    MarkdownPipe,
  ],
  template: `
    <header class="page-header">
      <h1 class="page-title">{{ 'security.title' | transloco }}</h1>
      <div class="actions">
        <button matButton="outlined" (click)="scan()" [disabled]="busy() !== null || forbidden()">
          <mat-icon>refresh</mat-icon> {{ 'security.scan' | transloco }}
        </button>
        <button
          matButton="filled"
          (click)="investigate()"
          [disabled]="busy() !== null || !status.value()?.aiAvailable"
        >
          <mat-icon>psychology</mat-icon> {{ 'security.investigate' | transloco }}
        </button>
      </div>
    </header>

    @if (busy(); as step) {
      <p class="hint">{{ 'security.' + step | transloco }}</p>
      <mat-progress-bar mode="indeterminate" />
    }

    @if (forbidden()) {
      <p class="hint">{{ 'security.ownerOnly' | transloco }}</p>
    }

    @if (status.value(); as s) {
      <p class="hint">
        @if (s.scannedAt) {
          {{ 'security.checked' | transloco: { date: (s.scannedAt | date: 'd MMM, HH:mm') } }}
        } @else {
          {{ 'security.neverChecked' | transloco }}
        }
        · {{ 'security.readOnly' | transloco }}
      </p>

      <div class="areas">
        @for (area of s.areas; track area.area) {
          <div class="area" [class.off]="!area.available">
            <mat-icon>{{ area.available ? 'check_circle' : 'do_not_disturb_on' }}</mat-icon>
            <span>
              <b>{{ 'security.areas.' + area.area | transloco }}</b>
              <span class="hint">
                {{
                  (area.available ? 'security.areaChecked' : 'security.areaHints.' + area.area)
                    | transloco
                }}
              </span>
            </span>
          </div>
        }
      </div>

      @if (s.report; as report) {
        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-icon mat-card-avatar>psychology</mat-icon>
            <mat-card-title>{{ 'security.report' | transloco }}</mat-card-title>
            <mat-card-subtitle>
              {{ report.createdAt | date: 'd MMM y, HH:mm' }} · {{ report.model }}
            </mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="markdown" [innerHTML]="report.text | markdown"></div>
          </mat-card-content>
        </mat-card>
      }

      <h2 class="section">
        {{ 'security.open' | transloco: { count: open().length } }}
      </h2>
      @for (finding of open(); track finding.id) {
        <mat-card appearance="outlined" class="finding" [class]="finding.severity">
          <mat-card-header>
            <mat-icon mat-card-avatar>{{ icon(finding.severity) }}</mat-icon>
            <mat-card-title>{{ finding.title }}</mat-card-title>
            <mat-card-subtitle>
              {{ 'security.severity.' + finding.severity | transloco }} ·
              {{ 'security.areas.' + finding.area | transloco }} ·
              {{ 'security.origin.' + finding.origin | transloco }} ·
              {{ 'security.since' | transloco: { date: (finding.firstSeenAt | date: 'd MMM y') } }}
            </mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <p>{{ finding.details }}</p>
            <p class="fix">
              <mat-icon inline>build</mat-icon>
              <span>
                <b>{{ 'security.whatToDo' | transloco }}</b>
                {{ finding.fix }}
              </span>
            </p>
            @if (finding.guide && shown() === finding.id) {
              <div class="guide">
                <div class="markdown" [innerHTML]="finding.guide | markdown"></div>
                <p class="hint">
                  {{
                    'security.guideBy'
                      | transloco: { date: (finding.guideAt | date: 'd MMM y, HH:mm') }
                  }}
                  <button matButton (click)="writeGuide(finding)" [disabled]="busy() !== null">
                    {{ 'security.guideAgain' | transloco }}
                  </button>
                </p>
              </div>
            }
            @if (writing() === finding.id) {
              <p class="hint">{{ 'security.guideWriting' | transloco }}</p>
              <mat-progress-bar mode="indeterminate" />
            }
          </mat-card-content>
          <mat-card-actions align="end">
            <button
              matButton
              (click)="showGuide(finding)"
              [disabled]="writing() !== null || (!finding.guide && !s.aiAvailable)"
            >
              <mat-icon>menu_book</mat-icon>
              {{
                (finding.guide && shown() === finding.id
                  ? 'security.guideHide'
                  : 'security.guideShow'
                ) | transloco
              }}
            </button>
            <button matButton (click)="setStatus(finding, 'ignored')">
              <mat-icon>visibility_off</mat-icon> {{ 'security.ignore' | transloco }}
            </button>
          </mat-card-actions>
        </mat-card>
      } @empty {
        <p class="calm">
          <mat-icon>verified_user</mat-icon>
          {{ (s.scannedAt ? 'security.nothing' : 'security.neverChecked') | transloco }}
        </p>
      }

      <mat-accordion multi>
        @if (ignored().length) {
          <mat-expansion-panel>
            <mat-expansion-panel-header>
              <mat-panel-title>
                {{ 'security.ignored' | transloco: { count: ignored().length } }}
              </mat-panel-title>
            </mat-expansion-panel-header>
            @for (finding of ignored(); track finding.id) {
              <div class="row">
                <span class="body">
                  <span>{{ finding.title }}</span>
                  <span class="hint">{{ finding.details }}</span>
                </span>
                <button matButton (click)="setStatus(finding, 'open')">
                  {{ 'security.watchAgain' | transloco }}
                </button>
              </div>
            }
          </mat-expansion-panel>
        }
        @if (resolved().length) {
          <mat-expansion-panel>
            <mat-expansion-panel-header>
              <mat-panel-title>
                {{ 'security.resolved' | transloco: { count: resolved().length } }}
              </mat-panel-title>
            </mat-expansion-panel-header>
            @for (finding of resolved(); track finding.id) {
              <div class="row">
                <span class="body">
                  <span>{{ finding.title }}</span>
                  <span class="hint">
                    {{
                      'security.resolvedOn'
                        | transloco: { date: (finding.resolvedAt | date: 'd MMM y') }
                    }}
                  </span>
                </span>
              </div>
            }
          </mat-expansion-panel>
        }
        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title>{{ 'security.settings.title' | transloco }}</mat-panel-title>
          </mat-expansion-panel-header>
          <div class="settings">
            <mat-slide-toggle [(ngModel)]="aiEnabled">
              {{ 'security.settings.ai' | transloco }}
            </mat-slide-toggle>
            <p class="hint">{{ 'security.settings.aiHint' | transloco }}</p>
            <mat-form-field>
              <mat-label>{{ 'security.settings.connection' | transloco }}</mat-label>
              <mat-select [(ngModel)]="connectionId">
                <mat-option [value]="assistant">
                  {{ 'security.settings.assistant' | transloco }}
                </mat-option>
                @for (connection of s.connections; track connection.id) {
                  <mat-option [value]="connection.id">{{ connection.name }}</mat-option>
                }
              </mat-select>
              <mat-hint>{{ 'security.settings.connectionHint' | transloco }}</mat-hint>
            </mat-form-field>
            <div>
              <button matButton="filled" (click)="saveSettings()" [disabled]="busy() !== null">
                {{ 'core.actions.save' | transloco }}
              </button>
            </div>
          </div>
        </mat-expansion-panel>
      </mat-accordion>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 960px;
    }
    .page-header,
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .hint {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .areas {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr));
      gap: 12px;
    }
    .area {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      color: var(--mat-sys-primary);
    }
    .area span {
      display: flex;
      flex-direction: column;
      color: var(--mat-sys-on-surface);
    }
    .area.off {
      color: var(--mat-sys-on-surface-variant);
    }
    .section {
      margin: 8px 0 0;
      font: var(--mat-sys-title-medium);
    }
    mat-icon[mat-card-avatar] {
      display: grid;
      place-items: center;
      color: var(--mat-sys-on-surface-variant);
    }
    .critical mat-icon[mat-card-avatar],
    .high mat-icon[mat-card-avatar] {
      color: var(--mat-sys-error);
    }
    .medium mat-icon[mat-card-avatar] {
      color: var(--mat-sys-tertiary);
    }
    .critical {
      border-color: var(--mat-sys-error);
    }
    .finding p {
      margin: 8px 0;
      overflow-wrap: anywhere;
    }
    .guide {
      margin-top: 12px;
      padding-top: 4px;
      border-top: 1px solid var(--pd-border);
      overflow-wrap: anywhere;
    }
    .guide pre {
      overflow-x: auto;
    }
    .fix {
      display: flex;
      gap: 8px;
      padding: 8px 12px;
      border-radius: var(--pd-radius-small, 8px);
      background: var(--mat-sys-surface-container-high);
    }
    .calm {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--mat-sys-primary);
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
      border-bottom: 1px solid var(--pd-border);
    }
    .body {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .settings {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 520px;
    }
  `,
})
export class SecurityPage {
  private readonly api = inject(SecurityApi);
  private readonly transloco = inject(TranslocoService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly status = this.api.status();
  /** The agent reports to the owner of the instance only. */
  protected readonly forbidden = computed(() => errorStatus(this.status.error()) === 403);
  /** What runs now: the key of its text (`scanning`, `investigating`). */
  protected readonly busy = signal<'scanning' | 'investigating' | null>(null);

  private readonly findings = computed(() => this.status.value()?.findings ?? []);
  protected readonly open = computed(() => this.findings().filter((f) => f.status === 'open'));
  protected readonly ignored = computed(() =>
    this.findings().filter((f) => f.status === 'ignored'),
  );
  protected readonly resolved = computed(() =>
    this.findings()
      .filter((f) => f.status === 'resolved')
      .sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? ''))
      .slice(0, 30),
  );

  // The settings form: filled from the server once its answer is here.
  protected readonly assistant = ASSISTANT;
  protected aiEnabled = true;
  protected connectionId = ASSISTANT;

  /** The finding whose guide is open, and the one a guide is being written for. */
  protected readonly shown = signal<string | null>(null);
  protected readonly writing = signal<string | null>(null);

  constructor() {
    effect(() => {
      const settings = this.status.value()?.settings;
      if (settings) {
        this.aiEnabled = settings.aiEnabled;
        this.connectionId = settings.connectionId ?? ASSISTANT;
      }
    });
  }

  protected icon(severity: SecuritySeverity): string {
    return ICONS[severity];
  }

  protected scan(): Promise<void> {
    return this.run('scanning', this.api.scan());
  }

  protected investigate(): Promise<void> {
    return this.run('investigating', this.api.investigate());
  }

  protected async setStatus(finding: SecurityFinding, status: 'open' | 'ignored'): Promise<void> {
    await firstValueFrom(this.api.setFindingStatus(finding.id, status));
    this.status.reload();
  }

  /** Opens the guide of a finding; the first time the AI writes it. */
  protected async showGuide(finding: SecurityFinding): Promise<void> {
    if (this.shown() === finding.id) {
      this.shown.set(null);
    } else if (finding.guide) {
      this.shown.set(finding.id);
    } else {
      await this.writeGuide(finding);
    }
  }

  protected async writeGuide(finding: SecurityFinding): Promise<void> {
    this.writing.set(finding.id);
    try {
      await firstValueFrom(this.api.writeGuide(finding.id));
      this.shown.set(finding.id);
    } catch (error) {
      const status = errorStatus(error);
      this.notify(
        status === 400 ? 'security.noAi' : status === 502 ? 'security.aiFailed' : 'security.failed',
      );
    } finally {
      this.writing.set(null);
      this.status.reload();
    }
  }

  protected async saveSettings(): Promise<void> {
    const settings: SecuritySettings = {
      aiEnabled: this.aiEnabled,
      connectionId: this.connectionId || null,
    };
    try {
      await firstValueFrom(this.api.saveSettings(settings));
      this.notify('security.settings.saved');
      this.status.reload();
    } catch {
      this.notify('security.failed');
    }
  }

  private async run(step: 'scanning' | 'investigating', request: Observable<unknown>) {
    this.busy.set(step);
    try {
      await firstValueFrom(request);
    } catch (error) {
      const status = errorStatus(error);
      this.notify(
        status === 400 ? 'security.noAi' : status === 502 ? 'security.aiFailed' : 'security.failed',
      );
    } finally {
      this.busy.set(null);
      this.status.reload();
    }
  }

  private notify(key: string): void {
    this.snackBar.open(this.transloco.translate(key), 'OK', { duration: 6000 });
  }
}
