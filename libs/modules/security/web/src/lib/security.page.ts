import {DatePipe} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatChipsModule} from '@angular/material/chips';
import {MatExpansionModule} from '@angular/material/expansion';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatSelectModule} from '@angular/material/select';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatSnackBar} from '@angular/material/snack-bar';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {
  SecurityFinding,
  SecuritySettings,
  SecuritySeverity,
} from '@pd/contracts';
import {EmptyStateComponent, errorStatus, MarkdownPipe} from '@pd/web-core';
import {firstValueFrom, Observable} from 'rxjs';
import {SecurityApi} from './security.api';

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
    MatTooltipModule,
    EmptyStateComponent,
    TranslocoPipe,
    MarkdownPipe,
  ],
  templateUrl: './security.page.html',
  styleUrl: './security.page.scss',
})
export class SecurityPage {
  private readonly api = inject(SecurityApi);
  private readonly transloco = inject(TranslocoService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly status = this.api.status();
  /** The agent reports to the owner of the instance only. */
  protected readonly forbidden = computed(
    () => errorStatus(this.status.error()) === 403,
  );
  /** What runs now: the key of its text (`scanning`, `investigating`). */
  protected readonly busy = signal<'scanning' | 'investigating' | null>(null);

  /** A finding of the rules the AI's one covers is shown under it, not on its own. */
  private readonly findings = computed(() =>
    (this.status.value()?.findings ?? []).filter(f => !f.coveredBy),
  );
  protected readonly open = computed(() =>
    this.findings().filter(f => f.status === 'open'),
  );
  protected readonly ignored = computed(() =>
    this.findings().filter(f => f.status === 'ignored'),
  );
  protected readonly resolved = computed(() =>
    this.findings()
      .filter(f => f.status === 'resolved')
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

  protected async setStatus(
    finding: SecurityFinding,
    status: 'open' | 'ignored',
  ): Promise<void> {
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
        status === 400
          ? 'security.noAi'
          : status === 502
            ? 'security.aiFailed'
            : 'security.failed',
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

  private async run(
    step: 'scanning' | 'investigating',
    request: Observable<unknown>,
  ) {
    this.busy.set(step);
    try {
      await firstValueFrom(request);
    } catch (error) {
      const status = errorStatus(error);
      this.notify(
        status === 400
          ? 'security.noAi'
          : status === 502
            ? 'security.aiFailed'
            : 'security.failed',
      );
    } finally {
      this.busy.set(null);
      this.status.reload();
    }
  }

  private notify(key: string): void {
    this.snackBar.open(this.transloco.translate(key), 'OK', {duration: 6000});
  }
}
