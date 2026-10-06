import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { desktopBridge, DesktopFocusStatus, ProjectsApi } from '@pd/web-core';

/** The page asks the shell for the timer's state this often; the countdown runs between. */
const POLL_MS = 5_000;

/** Starts, shows and stops the focus timer of this computer (the desktop app runs it). */
@Component({
  selector: 'pd-activity-focus-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-content class="content">
        @if (!focus) {
          <p class="hint">{{ 'activity.focus.browser' | transloco }}</p>
        } @else if (status(); as s) {
          @if (!s.available) {
            <p class="hint">{{ 'activity.focus.enableTracker' | transloco }}</p>
          } @else if (s.phase === 'idle') {
            <div class="start">
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>{{ 'activity.focus.project' | transloco }}</mat-label>
                <mat-select [value]="projectId()" (valueChange)="projectId.set($event)">
                  <mat-option [value]="null">{{
                    'activity.focus.noProject' | transloco
                  }}</mat-option>
                  @for (project of projects.value(); track project.id) {
                    <mat-option [value]="project.id">{{ project.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>{{ 'activity.focus.note' | transloco }}</mat-label>
                <input
                  matInput
                  maxlength="200"
                  [value]="note()"
                  (input)="note.set($any($event.target).value)"
                />
              </mat-form-field>
              <button matButton="filled" (click)="start()">
                <mat-icon>play_arrow</mat-icon>
                {{ 'activity.focus.start' | transloco: { minutes: focusMinutes() } }}
              </button>
            </div>
          } @else {
            <div class="running" [class.break]="s.phase !== 'focus'">
              <span class="phase">{{ 'activity.focus.phases.' + s.phase | transloco }}</span>
              <span class="clock">{{ left() }}</span>
              @if (s.phase === 'focus') {
                <span class="hint">
                  {{
                    'activity.focus.round'
                      | transloco: { round: s.round + 1, rounds: s.roundsBeforeLongBreak }
                  }}
                  @if (s.note) {
                    · {{ s.note }}
                  }
                </span>
              }
              <button matButton (click)="stop()">
                <mat-icon>{{ s.phase === 'focus' ? 'stop' : 'skip_next' }}</mat-icon>
                {{
                  (s.phase === 'focus' ? 'activity.focus.stop' : 'activity.focus.skipBreak')
                    | transloco
                }}
              </button>
            </div>
          }
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .content {
      padding-top: 16px;
    }
    .hint {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .start {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
    }
    .start mat-form-field {
      flex: 1 1 200px;
    }
    .running {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .phase {
      font: var(--mat-sys-title-medium);
      color: var(--mat-sys-primary);
    }
    .running.break .phase {
      color: var(--pd-success);
    }
    .clock {
      font: var(--mat-sys-display-medium);
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class FocusControlComponent {
  /** The length of a focus part, from the settings. */
  readonly focusMinutes = input(25);
  /** A session ended or started: the statistics below change. */
  readonly changed = output<void>();

  protected readonly focus = desktopBridge()?.focus ?? null;
  protected readonly projects = inject(ProjectsApi).list();
  protected readonly status = signal<DesktopFocusStatus | null>(null);
  protected readonly projectId = signal<string | null>(null);
  protected readonly note = signal('');
  private readonly now = signal(Date.now());

  protected readonly left = computed(() => {
    const endsAt = this.status()?.endsAt;
    const seconds = endsAt ? Math.max(0, Math.round((Date.parse(endsAt) - this.now()) / 1000)) : 0;
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  });

  constructor() {
    if (!this.focus) {
      return;
    }
    void this.refresh();
    const poll = setInterval(() => void this.refresh(), POLL_MS);
    const tick = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(poll);
      clearInterval(tick);
    });
  }

  protected async start(): Promise<void> {
    await this.focus?.start({ projectId: this.projectId(), note: this.note() || null });
    await this.refresh();
  }

  protected async stop(): Promise<void> {
    const wasFocus = this.status()?.phase === 'focus';
    await this.focus?.stop();
    await this.refresh();
    if (wasFocus) {
      this.changed.emit();
    }
  }

  private async refresh(): Promise<void> {
    const before = this.status()?.phase;
    const status = (await this.focus?.status()) ?? null;
    this.status.set(status);
    this.now.set(Date.now());
    // A focus part that ran out became a session: it is in the statistics after the next upload.
    if (before === 'focus' && status?.phase !== 'focus') {
      setTimeout(() => this.changed.emit(), 65_000);
    }
  }
}
