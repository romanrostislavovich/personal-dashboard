import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  OnDestroy,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DashboardCommand, DASHBOARD_MODULES } from '../dashboard-module';
import { LayoutService } from '../layout/layout.service';
import { ShareInbox } from '../mobile/share-inbox';
import { SharedContent } from '../mobile/share-target';
import { desktopBridge } from '../realtime/desktop-bridge';

/**
 * What the desktop app captured with a shortcut — copied text or a piece of the screen — or what
 * another app shared into the Android app, and where it can go: every module offers its own
 * commands (a task, a diary note, a reminder, a photo for the diary, a film to watch). On the
 * desktop the page lives in a small window of its own, without the menu.
 */
@Component({
  selector: 'pd-capture-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, TranslocoPipe],
  template: `
    @let c = captured();
    <main>
      @if (!c) {
        <p class="hint">{{ 'core.capture.nothing' | transloco }}</p>
      } @else {
        @if (c.kind === 'text') {
          <textarea
            [value]="text()"
            [attr.aria-label]="'core.capture.text' | transloco"
            (input)="text.set($any($event.target).value)"
          ></textarea>
        } @else {
          <img [src]="imageUrl()" [alt]="'core.capture.image' | transloco" />
        }
        @if (done(); as d) {
          <p class="done"><mat-icon inline>check_circle</mat-icon> {{ d }}</p>
        } @else {
          <div class="actions">
            @for (command of commands(); track command.id) {
              <button matButton="tonal" [disabled]="busy()" (click)="run(command)">
                <mat-icon>{{ command.icon }}</mat-icon> {{ command.labelKey | transloco }}
              </button>
            }
          </div>
        }
      }
      <button matButton class="close" (click)="close()">
        {{ 'core.capture.close' | transloco }}
      </button>
    </main>
  `,
  styles: `
    main {
      display: flex;
      flex-direction: column;
      gap: 12px;
      height: 100vh;
      box-sizing: border-box;
      padding: 16px;
      background: var(--mat-sys-surface);
    }
    textarea {
      flex: 1;
      min-height: 120px;
      padding: 10px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
      background: transparent;
      color: inherit;
      font: var(--mat-sys-body-medium);
      resize: none;
    }
    img {
      flex: 1;
      min-height: 0;
      object-fit: contain;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .done {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      color: var(--pd-success);
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
    .close {
      align-self: flex-end;
    }
  `,
})
export class CapturePage implements OnDestroy {
  private readonly injector = inject(Injector);
  private readonly transloco = inject(TranslocoService);
  private readonly modules = inject(DASHBOARD_MODULES);
  private readonly layout = inject(LayoutService);
  private readonly router = inject(Router);
  private readonly capture = desktopBridge()?.capture ?? null;

  protected readonly captured = signal<SharedContent | null>(null);
  protected readonly text = signal('');
  protected readonly busy = signal(false);
  protected readonly done = signal<string | null>(null);
  private objectUrl: string | null = null;

  protected readonly imageUrl = computed(() => {
    const c = this.captured();
    if (c?.kind !== 'image') {
      return '';
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }
    this.objectUrl = URL.createObjectURL(c.image);
    return this.objectUrl;
  });

  /** The commands of the visible modules that take this kind of capture. */
  protected readonly commands = computed(() => {
    const kind = this.captured()?.kind;
    return this.modules
      .filter((module) => !this.layout.isHidden(module.id))
      .flatMap((module) => module.commands ?? [])
      .filter((command) => (kind === 'image' ? command.loadImageAction : command.loadAction));
  });

  constructor() {
    const shared = inject(ShareInbox).take();
    if (shared) {
      this.show(shared);
      return;
    }
    void this.capture?.pending().then((captured) => {
      if (captured?.kind === 'image') {
        const image = new File([toBytes(captured.base64)], `screenshot-${Date.now()}.png`, {
          type: 'image/png',
        });
        this.show({ kind: 'image', image });
      } else if (captured) {
        this.show(captured);
      }
    });
  }

  private show(content: SharedContent): void {
    this.captured.set(content);
    if (content.kind === 'text') {
      this.text.set(content.text);
    }
  }

  ngOnDestroy(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }
  }

  protected async run(command: DashboardCommand): Promise<void> {
    const c = this.captured();
    if (!c) {
      return;
    }
    this.busy.set(true);
    try {
      if (c.kind === 'image') {
        const act = await command.loadImageAction?.();
        await act?.(c.image, this.injector);
      } else {
        const text = this.text().trim();
        if (!text) {
          return;
        }
        const act = await command.loadAction?.();
        await act?.(text, this.injector);
      }
      this.done.set(this.transloco.translate(command.labelKey));
      setTimeout(() => this.close(), 1200);
    } finally {
      this.busy.set(false);
    }
  }

  protected close(): void {
    if (this.capture) {
      void this.capture.close();
    } else if (this.router.url.startsWith('/capture')) {
      // The Android app: back to the dashboard (a command may have opened a page already).
      void this.router.navigateByUrl('/');
    }
  }
}

function toBytes(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}
