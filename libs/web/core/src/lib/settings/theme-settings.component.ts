import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  THEME_DENSITIES,
  THEME_FONTS,
  THEME_MODES,
  THEME_PRESET_COLORS,
  THEME_PRESETS,
  THEME_RADIUS,
  ThemePreset,
} from '@pd/contracts';
import { LayoutService } from '../layout/layout.service';
import { ThemeService } from '../theme/theme.service';

/**
 * The look of the dashboard. Every change shows at once and stays on this device; "apply
 * everywhere" makes it the look of the account — the theme together with the layout (hidden
 * sections, the home page) — which the other devices then take.
 */
@Component({
  selector: 'pd-theme-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSliderModule,
    TranslocoPipe,
  ],
  template: `
    @let t = theme.theme();
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>palette</mat-icon>
        <mat-card-title>{{ 'core.settings.theme.colors' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content class="fields">
        <div class="field">
          <span class="label">{{ 'core.settings.theme.mode' | transloco }}</span>
          <mat-button-toggle-group
            hideSingleSelectionIndicator
            [value]="t.mode"
            [attr.aria-label]="'core.settings.theme.mode' | transloco"
            (change)="theme.update({ mode: $event.value })"
          >
            @for (mode of modes; track mode) {
              <mat-button-toggle [value]="mode">
                {{ 'core.settings.theme.modes.' + mode | transloco }}
              </mat-button-toggle>
            }
          </mat-button-toggle-group>
        </div>

        <div class="field">
          <span class="label">{{ 'core.settings.theme.accent' | transloco }}</span>
          <div class="swatches" role="radiogroup">
            @for (preset of presets; track preset) {
              <button
                type="button"
                class="swatch"
                role="radio"
                [class.selected]="!t.accent && t.preset === preset"
                [attr.aria-checked]="!t.accent && t.preset === preset"
                [attr.aria-label]="'core.settings.theme.presets.' + preset | transloco"
                [title]="'core.settings.theme.presets.' + preset | transloco"
                [style.background]="colors[preset]"
                (click)="pick(preset)"
              ></button>
            }
            <!-- An accent of the user's own: the browser's colour picker. -->
            <label
              class="swatch custom"
              [class.selected]="t.accent"
              [title]="'core.settings.theme.custom' | transloco"
              [style.background]="t.accent"
            >
              <mat-icon>colorize</mat-icon>
              <input
                type="color"
                [value]="t.accent ?? colors[t.preset]"
                [attr.aria-label]="'core.settings.theme.custom' | transloco"
                (input)="pickCustom($any($event.target).value)"
              />
            </label>
          </div>
        </div>

        <mat-slide-toggle [checked]="t.black" (change)="theme.update({ black: $event.checked })">
          {{ 'core.settings.theme.black' | transloco }}
        </mat-slide-toggle>
        <mat-slide-toggle [checked]="t.glow" (change)="theme.update({ glow: $event.checked })">
          {{ 'core.settings.theme.glow' | transloco }}
        </mat-slide-toggle>
      </mat-card-content>
    </mat-card>

    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>format_size</mat-icon>
        <mat-card-title>{{ 'core.settings.theme.shape' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content class="fields">
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>{{ 'core.settings.theme.font' | transloco }}</mat-label>
          <mat-select [value]="t.font" (selectionChange)="theme.update({ font: $event.value })">
            @for (font of fonts; track font) {
              <mat-option [value]="font">
                {{ 'core.settings.theme.fonts.' + font | transloco }}
              </mat-option>
            }
          </mat-select>
        </mat-form-field>

        <div class="field">
          <span class="label">{{ 'core.settings.theme.density' | transloco }}</span>
          <mat-button-toggle-group
            hideSingleSelectionIndicator
            [value]="t.density"
            [attr.aria-label]="'core.settings.theme.density' | transloco"
            (change)="theme.update({ density: $event.value })"
          >
            @for (density of densities; track density) {
              <mat-button-toggle [value]="density">
                {{ 'core.settings.theme.densities.' + density | transloco }}
              </mat-button-toggle>
            }
          </mat-button-toggle-group>
        </div>

        <div class="field">
          <span class="label">
            {{ 'core.settings.theme.radius' | transloco }}: {{ t.radius }} px
          </span>
          <mat-slider [min]="radius.min" [max]="radius.max" step="2" discrete>
            <input
              matSliderThumb
              [value]="t.radius"
              [attr.aria-label]="'core.settings.theme.radius' | transloco"
              (valueChange)="theme.update({ radius: $event })"
            />
          </mat-slider>
        </div>
      </mat-card-content>
    </mat-card>

    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>devices</mat-icon>
        <mat-card-title>{{ 'core.settings.theme.devices' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <p>{{ (isOwn() ? 'core.settings.theme.own' : status()) | transloco }}</p>
        <p class="hint">{{ 'core.settings.theme.devicesHint' | transloco }}</p>
      </mat-card-content>
      <mat-card-actions>
        <button matButton="filled" (click)="applyEverywhere()" [disabled]="busy()">
          {{ 'core.settings.theme.applyEverywhere' | transloco }}
        </button>
        @if (isOwn()) {
          <button matButton (click)="useAccount()">
            {{ 'core.settings.theme.useAccount' | transloco }}
          </button>
        }
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    :host {
      display: contents;
    }
    .fields {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding-top: 12px;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .label {
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-on-surface-variant);
    }
    .swatches {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .swatch {
      width: 36px;
      height: 36px;
      padding: 0;
      border: 2px solid transparent;
      border-radius: 50%;
      outline: 2px solid transparent;
      outline-offset: 2px;
      cursor: pointer;
    }
    .swatch.selected {
      outline-color: var(--mat-sys-on-surface);
    }
    /* The picker itself is invisible: its label is the swatch. */
    .custom {
      position: relative;
      display: grid;
      place-items: center;
      border-color: var(--mat-sys-outline);
      color: var(--mat-sys-on-surface);
    }
    .custom.selected {
      border-color: transparent;
      color: #fff;
    }
    .custom mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .custom input {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: pointer;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class ThemeSettingsComponent {
  protected readonly theme = inject(ThemeService);
  /** Hidden sections and the home page: kept per device the same way, applied together. */
  private readonly layout = inject(LayoutService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly modes = THEME_MODES;
  protected readonly presets = THEME_PRESETS;
  protected readonly colors = THEME_PRESET_COLORS;
  protected readonly fonts = THEME_FONTS;
  protected readonly densities = THEME_DENSITIES;
  protected readonly radius = THEME_RADIUS;
  protected readonly busy = signal(false);

  /** This device differs from the account in the theme or in the layout. */
  protected readonly isOwn = computed(() => this.theme.isOwn() || this.layout.isOwn());

  /** What a device without its own look shows. */
  protected readonly status = computed(() =>
    this.theme.account() || this.layout.account()
      ? 'core.settings.theme.shared'
      : 'core.settings.theme.builtIn',
  );

  protected useAccount(): void {
    this.theme.useAccountTheme();
    this.layout.useAccountLayout();
  }

  protected pick(preset: ThemePreset): void {
    this.theme.update({ preset, accent: null });
  }

  protected pickCustom(accent: string): void {
    this.theme.update({ accent });
  }

  protected async applyEverywhere(): Promise<void> {
    this.busy.set(true);
    try {
      await this.theme.applyEverywhere();
      await this.layout.applyEverywhere();
      this.snackBar.open(this.transloco.translate('core.settings.theme.applied'), 'OK', {
        duration: 4000,
      });
    } catch {
      this.snackBar.open(this.transloco.translate('core.settings.theme.notApplied'), 'OK', {
        duration: 6000,
      });
    } finally {
      this.busy.set(false);
    }
  }
}
