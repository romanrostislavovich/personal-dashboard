import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoPipe } from '@jsverse/transloco';
import { AiPreferences, AiSettings } from '@pd/contracts';

/**
 * What the AI sees, per section: off, the shared connection, or a connection of the section's
 * own (a local model for Health) — then its data never reaches the shared one.
 */
@Component({
  selector: 'pd-ai-module-access',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatSelectModule, MatSlideToggleModule, TranslocoPipe],
  template: `
    @for (module of modules(); track module.id) {
      <div class="module">
        <mat-slide-toggle
          [checked]="!settings().disabledModules.includes(module.id)"
          (change)="setVisible(module.id, $event.checked)"
        >
          {{ module.name }}
        </mat-slide-toggle>
        <mat-form-field subscriptSizing="dynamic" class="connection">
          <mat-select
            [value]="settings().moduleConnections[module.id] ?? null"
            [disabled]="settings().disabledModules.includes(module.id)"
            [attr.aria-label]="'ai.privacy.connection' | transloco: { module: module.name }"
            (selectionChange)="setConnection(module.id, $event.value)"
          >
            <mat-option [value]="null">{{ 'ai.privacy.shared' | transloco }}</mat-option>
            @for (c of settings().connections; track c.id) {
              <mat-option [value]="c.id">{{ c.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>
    }
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 8px 24px;
    }
    .module {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .connection {
      width: 160px;
      flex-shrink: 0;
    }
  `,
})
export class AiModuleAccessComponent {
  readonly settings = input.required<AiSettings>();
  /** Sections that give the AI data, with their names in the user's language. */
  readonly modules = input.required<{ id: string; name: string }[]>();
  readonly save = output<AiPreferences>();

  protected setVisible(module: string, visible: boolean): void {
    const others = this.settings().disabledModules.filter((m) => m !== module);
    this.save.emit({ disabledModules: visible ? others : [...others, module] });
  }

  /** `null` — back to the shared connection. */
  protected setConnection(module: string, connectionId: string | null): void {
    const others = Object.fromEntries(
      Object.entries(this.settings().moduleConnections).filter(([id]) => id !== module),
    );
    this.save.emit({
      moduleConnections: connectionId ? { ...others, [module]: connectionId } : others,
    });
  }
}
