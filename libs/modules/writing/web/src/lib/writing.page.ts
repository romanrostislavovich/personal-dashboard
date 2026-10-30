import {
  ChangeDetectionStrategy,
  Component,
  inject,
  viewChild,
} from '@angular/core';
import {MatTabsModule} from '@angular/material/tabs';
import {TranslocoPipe} from '@jsverse/transloco';
import {WritingConfig} from '@pd/contracts';
import {firstValueFrom} from 'rxjs';
import {WritingEditorComponent} from './writing-editor.component';
import {WritingSettingsComponent} from './writing-settings.component';
import {DesktopWritingService} from './desktop-writing.service';
import {WritingApi} from './writing.api';

/**
 * Writing: a text checked as it is typed and rewritten by the AI on request, and the settings
 * the browser extension and the desktop app follow too.
 */
@Component({
  selector: 'pd-writing-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatTabsModule,
    TranslocoPipe,
    WritingEditorComponent,
    WritingSettingsComponent,
  ],
  template: `
    <h1 class="page-title">{{ 'writing.title' | transloco }}</h1>
    <p class="intro">{{ 'writing.intro' | transloco }}</p>
    @if (config.value(); as current) {
      <mat-tab-group mat-stretch-tabs="false" animationDuration="0">
        <mat-tab [label]="'writing.tabs.check' | transloco">
          <div class="tab">
            <pd-writing-editor [config]="current" (ignored)="ignore($event)" />
          </div>
        </mat-tab>
        <mat-tab [label]="'writing.tabs.settings' | transloco">
          <div class="tab">
            <pd-writing-settings [config]="current" (changed)="saved($event)" />
          </div>
        </mat-tab>
      </mat-tab-group>
    }
  `,
  styles: `
    .intro {
      margin: 0 0 8px;
      color: var(--mat-sys-on-surface-variant);
    }
    .tab {
      padding-top: 16px;
      max-width: 960px;
    }
  `,
})
export class WritingPage {
  private readonly api = inject(WritingApi);
  private readonly editor = viewChild(WritingEditorComponent);
  private readonly desktop = inject(DesktopWritingService);

  protected readonly config = this.api.settings();

  /** A word into the dictionary or a rule switched off: the text is checked again. */
  protected async ignore(
    what: {word: string} | {ruleId: string},
  ): Promise<void> {
    this.saved(await firstValueFrom(this.api.ignore(what)));
    this.editor()?.recheck();
  }

  protected saved(config: WritingConfig): void {
    this.config.set(config);
    this.desktop.apply(config);
  }
}
