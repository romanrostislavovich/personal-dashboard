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
      @if (settings().moduleConnections[module.id]) {
        <!-- A section kept on its own connection is hidden from outside AI clients too, unless… -->
        <mat-slide-toggle
          class="mcp"
          [checked]="settings().mcpModules.includes(module.id)"
          (change)="setMcp(module.id, $event.checked)"
        >
          {{ 'ai.privacy.mcp' | transloco: { module: module.name } }}
        </mat-slide-toggle>
      }
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
    .mcp {
      grid-column: 1 / -1;
      margin: -4px 0 4px 16px;
      font: var(--mat-sys-body-small);
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

  /** Outside AI clients (MCP) may read a section kept on a connection of its own. */
  protected setMcp(module: string, allowed: boolean): void {
    const others = this.settings().mcpModules.filter((m) => m !== module);
    this.save.emit({ mcpModules: allowed ? [...others, module] : others });
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
