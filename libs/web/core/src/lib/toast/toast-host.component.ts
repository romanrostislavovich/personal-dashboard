import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Toast, ToastService } from './toast.service';

/** Renders the toasts in the bottom-right corner (announced to screen readers). */
@Component({
  selector: 'pd-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, TranslocoPipe],
  template: `
    <div class="stack" aria-live="polite">
      @for (toast of toasts.toasts(); track toast.id) {
        <div class="toast" [class]="'toast rarity-' + (toast.rarity ?? 'none')">
          <button type="button" class="body" (click)="open(toast)">
            <span class="icon" aria-hidden="true">{{ toast.icon }}</span>
            <span class="text">
              @if (toast.label) {
                <span class="label">{{ toast.label }}</span>
              }
              <span class="title">{{ toast.title }}</span>
              @if (toast.text) {
                <span class="description">{{ toast.text }}</span>
              }
            </span>
          </button>
          <button
            type="button"
            class="close"
            [attr.aria-label]="'core.toast.close' | transloco"
            (click)="toasts.dismiss(toast.id)"
          >
            <mat-icon>close</mat-icon>
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .stack {
      position: fixed;
      right: 20px;
      bottom: calc(20px + env(safe-area-inset-bottom, 0px));
      z-index: 1100;
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: min(380px, calc(100vw - 32px));
      pointer-events: none;
    }
    .toast {
      --rarity: var(--mat-sys-primary);
      display: flex;
      pointer-events: auto;
      border-radius: 18px;
      border: 1px solid color-mix(in srgb, var(--rarity) 55%, var(--pd-border));
      background:
        radial-gradient(
          160px 100px at 0% 0%,
          color-mix(in srgb, var(--rarity) 22%, transparent),
          transparent 70%
        ),
        var(--mat-sys-surface-container-high);
      box-shadow: 0 18px 40px -20px var(--rarity);
      animation: slide-in 280ms cubic-bezier(0.2, 0.9, 0.3, 1.2);
    }
    .rarity-common {
      --rarity: var(--pd-rarity-common);
    }
    .rarity-rare {
      --rarity: var(--pd-rarity-rare);
    }
    .rarity-epic {
      --rarity: var(--pd-rarity-epic);
    }
    .rarity-legendary {
      --rarity: var(--pd-rarity-legendary);
    }
    .body {
      display: flex;
      align-items: center;
      gap: 14px;
      flex: 1;
      min-width: 0;
      padding: 14px 8px 14px 14px;
      border: 0;
      background: none;
      color: inherit;
      text-align: left;
      font: inherit;
      cursor: pointer;
    }
    .icon {
      display: grid;
      place-items: center;
      flex: none;
      width: 48px;
      height: 48px;
      border-radius: 14px;
      font-size: 26px;
      background: color-mix(in srgb, var(--rarity) 20%, var(--mat-sys-surface-container));
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--rarity) 55%, transparent);
    }
    .text {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }
    .label {
      font: 700 0.68rem / 1 var(--pd-font);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--rarity);
    }
    .title {
      font: 700 0.95rem / 1.3 var(--pd-font-heading);
    }
    .description {
      font: 0.8rem / 1.4 var(--pd-font);
      color: var(--mat-sys-on-surface-variant);
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
      white-space: pre-line;
    }
    .close {
      align-self: flex-start;
      margin: 6px 6px 0 0;
      padding: 4px;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--mat-sys-on-surface-variant);
      cursor: pointer;
    }
    .close:hover {
      background: color-mix(in srgb, var(--mat-sys-on-surface) 8%, transparent);
    }
    @keyframes slide-in {
      from {
        opacity: 0;
        transform: translateY(16px) scale(0.96);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .toast {
        animation: none;
      }
    }
  `,
})
export class ToastHostComponent {
  protected readonly toasts = inject(ToastService);
  private readonly router = inject(Router);

  protected open(toast: Toast): void {
    this.toasts.dismiss(toast.id);
    if (toast.route) {
      void this.router.navigateByUrl(toast.route);
    }
  }
}
