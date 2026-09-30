import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DIARY_PHOTO_MAX_BYTES, DiaryPhoto, LocalDate } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { DiaryApi } from './diary.api';

/**
 * Photos of a day that are not placed in the text: thumbnails, upload and a full-size view.
 * Images need the auth header, so they are fetched as blobs and shown via object URLs.
 */
@Component({
  selector: 'pd-diary-photos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, TranslocoPipe],
  host: { '(document:keydown.escape)': 'opened.set(null)' },
  template: `
    <div class="photos">
      @for (photo of visible(); track photo.id) {
        <div class="photo">
          <button type="button" class="thumb" (click)="open(photo)" [title]="photo.caption ?? ''">
            @if (urls()[photo.id]; as url) {
              <img [src]="url" [alt]="photo.caption ?? ''" />
            }
          </button>
          <button
            matIconButton
            class="remove"
            type="button"
            [matTooltip]="'diary.photos.remove' | transloco"
            [attr.aria-label]="'diary.photos.remove' | transloco"
            (click)="remove(photo)"
          >
            <mat-icon>close</mat-icon>
          </button>
        </div>
      }
      <label class="add" [class.busy]="uploading()">
        <input type="file" accept="image/*" multiple (change)="upload($event)" hidden />
        <mat-icon>add_photo_alternate</mat-icon>
        <span>{{ 'diary.photos.add' | transloco }}</span>
      </label>
    </div>
    @if (error(); as message) {
      <p class="error">{{ message }}</p>
    }

    @if (opened(); as photo) {
      <div
        class="lightbox"
        role="dialog"
        aria-modal="true"
        (click)="opened.set(null)"
        (keydown.escape)="opened.set(null)"
        tabindex="-1"
      >
        <img [src]="urls()[photo.id]" [alt]="photo.caption ?? ''" />
        @if (photo.caption) {
          <p class="caption">{{ photo.caption }}</p>
        }
        <button
          matIconButton
          type="button"
          class="close"
          [attr.aria-label]="'diary.photos.close' | transloco"
        >
          <mat-icon>close</mat-icon>
        </button>
      </div>
    }
  `,
  styles: `
    .photos {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .photo {
      position: relative;
    }
    .thumb {
      display: block;
      width: 96px;
      height: 96px;
      padding: 0;
      border: 1px solid var(--pd-border);
      border-radius: 12px;
      overflow: hidden;
      cursor: zoom-in;
      background: var(--mat-sys-surface-container);
    }
    .thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .remove {
      position: absolute;
      top: -10px;
      right: -10px;
      transform: scale(0.75);
      background: var(--mat-sys-surface-container-high);
      opacity: 0;
      transition: opacity 120ms ease;
    }
    .photo:hover .remove,
    .remove:focus-visible {
      opacity: 1;
    }
    .add {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      width: 96px;
      height: 96px;
      box-sizing: border-box;
      border: 1px dashed var(--pd-border);
      border-radius: 12px;
      color: var(--mat-sys-on-surface-variant);
      font: 0.7rem / 1.2 var(--pd-font);
      text-align: center;
      cursor: pointer;
    }
    .add:hover {
      border-color: var(--mat-sys-primary);
      color: var(--mat-sys-primary);
    }
    .add.busy {
      opacity: 0.5;
      pointer-events: none;
    }
    .error {
      color: var(--mat-sys-error);
      font: 0.8rem / 1.3 var(--pd-font);
    }
    .lightbox {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 24px;
      background: rgb(0 0 0 / 85%);
      cursor: zoom-out;
    }
    .lightbox img {
      max-width: 100%;
      max-height: 85vh;
      border-radius: 12px;
    }
    .caption {
      color: #fff;
      margin: 0;
    }
    .close {
      position: absolute;
      top: 16px;
      right: 16px;
      color: #fff;
    }
  `,
})
export class DiaryPhotosComponent {
  readonly day = input.required<LocalDate>();
  /** Photos placed in the entry text: they are already shown there. */
  readonly hiddenIds = input<string[]>([]);

  private readonly api = inject(DiaryApi);
  private readonly transloco = inject(TranslocoService);

  protected readonly photos = this.api.photos(this.day);
  protected readonly visible = computed(() =>
    this.photos.value().filter((photo) => !this.hiddenIds().includes(photo.id)),
  );
  /** Object URLs of loaded images by photo id. */
  protected readonly urls = signal<Record<string, string>>({});
  protected readonly opened = signal<DiaryPhoto | null>(null);
  protected readonly uploading = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Ids already requested — the effect may run again before a download finishes. */
  private readonly requested = new Set<string>();

  constructor() {
    effect(() => {
      for (const photo of this.visible()) {
        if (!this.requested.has(photo.id)) {
          this.requested.add(photo.id);
          void this.load(photo.id);
        }
      }
    });
    // Object URLs keep the image in memory until revoked.
    inject(DestroyRef).onDestroy(() => Object.values(this.urls()).forEach(URL.revokeObjectURL));
  }

  protected open(photo: DiaryPhoto): void {
    this.opened.set(photo);
  }

  protected async upload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    this.error.set(null);
    this.uploading.set(true);
    try {
      for (const file of files) {
        if (file.size > DIARY_PHOTO_MAX_BYTES) {
          this.error.set(this.transloco.translate('diary.photos.tooLarge'));
          continue;
        }
        await firstValueFrom(this.api.uploadPhoto(this.day(), file));
      }
    } catch {
      this.error.set(this.transloco.translate('diary.photos.uploadFailed'));
    } finally {
      this.uploading.set(false);
      this.photos.reload();
    }
  }

  protected async remove(photo: DiaryPhoto): Promise<void> {
    await firstValueFrom(this.api.removePhoto(photo.id));
    this.photos.reload();
  }

  private async load(id: string): Promise<void> {
    const blob = await firstValueFrom(this.api.photoBlob(id));
    this.urls.update((urls) => ({ ...urls, [id]: URL.createObjectURL(blob) }));
  }
}
