import {DatePipe, TitleCasePipe} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {TranslocoPipe} from '@jsverse/transloco';
import {isMobileApp} from '../mobile/mobile-app';
import {
  checkPhoneSensors,
  PhoneSensorsCheck,
  VoiceStatus,
} from '../mobile/phone-sensors';

type Plugin = NonNullable<PhoneSensorsCheck['plugin']>;

/** While the model downloads, its progress is read this often. */
const POLL_MS = 2_000;

/**
 * Settings → Devices, in the Android app: the voice assistant called by its name ("Люцифер, how
 * long was I on the phone today?"). On or off, the name (one word the phone's speech model knows),
 * the model's download, a try without saying the name, and the last question with its answer.
 * The phone listens all the time; only what follows the name goes to the dashboard.
 */
@Component({
  selector: 'pd-voice-assistant',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    TitleCasePipe,
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
    @if (inApp) {
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-icon mat-card-avatar>record_voice_over</mat-icon>
          <mat-card-title>{{
            'core.settings.voice.title' | transloco
          }}</mat-card-title>
          <mat-card-subtitle>{{
            'core.settings.voice.hint' | transloco
          }}</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content class="content">
          @if (unsupported()) {
            <p>{{ 'core.settings.phone.update' | transloco }}</p>
          } @else if (status(); as s) {
            <mat-slide-toggle
              [checked]="s.enabled"
              [disabled]="busy()"
              (change)="save($event.checked)"
            >
              {{
                'core.settings.voice.enable'
                  | transloco: {name: s.name | titlecase}
              }}
            </mat-slide-toggle>
            @if (!s.microphone) {
              <p class="warn">
                {{ 'core.settings.voice.noMicrophone' | transloco }}
              </p>
            }
            <form class="name" (ngSubmit)="save(s.enabled)">
              <mat-form-field subscriptSizing="dynamic">
                <mat-label>{{
                  'core.settings.voice.name' | transloco
                }}</mat-label>
                <input
                  matInput
                  name="name"
                  [(ngModel)]="name"
                  autocomplete="off"
                />
              </mat-form-field>
              <button
                matButton
                type="submit"
                [disabled]="
                  busy() || !name.trim() || name.trim().toLowerCase() === s.name
                "
              >
                {{ 'core.actions.save' | transloco }}
              </button>
            </form>
            @if (s.known === false) {
              <p class="warn">
                {{
                  'core.settings.voice.unknownName'
                    | transloco: {name: s.name | titlecase}
                }}
              </p>
            }
            @if (s.model === 'downloading') {
              <p class="hint">
                {{
                  'core.settings.voice.downloading'
                    | transloco: {progress: s.progress}
                }}
              </p>
              <mat-progress-bar mode="determinate" [value]="s.progress" />
            } @else if (s.model === 'failed') {
              <p class="warn">
                {{ 'core.settings.voice.failed' | transloco }} {{ s.error }}
              </p>
            } @else if (s.error) {
              <p class="warn">{{ s.error }}</p>
            }
            @if (s.enabled && s.model === 'ready') {
              <button matButton="tonal" (click)="tryIt()">
                <mat-icon>mic</mat-icon>
                {{ 'core.settings.voice.try' | transloco }}
              </button>
            }
            @if (s.lastQuestion || s.lastAnswer) {
              <div class="last">
                <span class="hint">{{ s.lastAt | date: 'd MMM, HH:mm' }}</span>
                <span
                  ><b>{{ s.lastQuestion }}</b></span
                >
                <span>{{ s.lastAnswer }}</span>
              </div>
            }
            <p class="hint">{{ 'core.settings.voice.about' | transloco }}</p>
          }
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: `
    .content {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .name {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .name mat-form-field {
      flex: 1;
      min-width: 160px;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
    .warn {
      color: var(--mat-sys-error);
    }
    .last {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 12px;
      border-radius: 12px;
      background: var(--mat-sys-surface-container);
    }
  `,
})
export class VoiceAssistantComponent implements OnInit {
  protected readonly inApp = isMobileApp();
  protected readonly status = signal<VoiceStatus | null>(null);
  protected readonly unsupported = signal(false);
  protected readonly busy = signal(false);
  protected name = '';
  private plugin: Plugin | null = null;
  private poll: ReturnType<typeof setInterval> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.poll));
  }

  async ngOnInit(): Promise<void> {
    if (!this.inApp) {
      return;
    }
    const check = await checkPhoneSensors();
    this.plugin = check.plugin;
    await this.read();
    // The model downloads in the background: its progress, and the name's check after it.
    this.poll = setInterval(() => {
      const status = this.status();
      if (
        status?.model === 'downloading' ||
        (status?.enabled && status.model === 'none')
      ) {
        void this.read();
      }
    }, POLL_MS);
  }

  async save(enabled: boolean): Promise<void> {
    if (!this.plugin?.voiceConfigure) {
      return;
    }
    this.busy.set(true);
    try {
      const name = (
        this.name.trim() ||
        this.status()?.name ||
        ''
      ).toLowerCase();
      this.status.set(await this.plugin.voiceConfigure({enabled, name}));
      this.name = this.status()?.name ?? name;
    } catch {
      // A name of more than one word: the field keeps it, the status stays.
      await this.read();
    } finally {
      this.busy.set(false);
    }
  }

  async tryIt(): Promise<void> {
    await this.plugin?.voiceTry?.();
  }

  private async read(): Promise<void> {
    try {
      const status = await this.plugin?.voiceStatus?.();
      if (!status) {
        this.unsupported.set(true);
        return;
      }
      this.status.set(status);
      this.name ||= status.name;
    } catch {
      // An APK built before the voice assistant: its plugin has no such method.
      this.unsupported.set(true);
    }
  }
}
