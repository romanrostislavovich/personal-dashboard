import { Injectable, signal } from '@angular/core';
import { AchievementRarity } from '@pd/contracts';

export interface Toast {
  id: number;
  icon: string;
  /** Small caption above the title, e.g. "New achievement!". */
  label?: string;
  title: string;
  text?: string;
  /** Tints the toast with the rarity colour. */
  rarity?: AchievementRarity;
  /** Where a click leads. */
  route?: string;
}

const LIFETIME_MS = 8_000;
const MAX_VISIBLE = 4;

/** Small cards in the corner of the screen that disappear by themselves. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  readonly toasts = signal<Toast[]>([]);

  show(toast: Omit<Toast, 'id'>): void {
    const id = this.nextId++;
    this.toasts.update((toasts) => [...toasts, { ...toast, id }].slice(-MAX_VISIBLE));
    setTimeout(() => this.dismiss(id), LIFETIME_MS);
  }

  dismiss(id: number): void {
    this.toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }
}
