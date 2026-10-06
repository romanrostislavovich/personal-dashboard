import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { AutomationCatalog, AutomationParamDef, AutomationRuleInput } from '@pd/contracts';

export interface AutomationRuleData {
  catalog: AutomationCatalog;
  /** An existing rule, or a draft of the AI to check. */
  rule: AutomationRuleInput | null;
}

/** A rule: when (a trigger with its fields) and then (an action with its fields). */
@Component({
  selector: 'pd-automation-rule-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'core.automations.edit' | transloco }}</h2>
    <mat-dialog-content class="form">
      <mat-form-field>
        <mat-label>{{ 'core.automations.name' | transloco }}</mat-label>
        <input matInput [ngModel]="name()" (ngModelChange)="name.set($event)" maxlength="100" />
      </mat-form-field>

      <h3>{{ 'core.automations.when' | transloco }}</h3>
      <mat-form-field>
        <mat-label>{{ 'core.automations.when' | transloco }}</mat-label>
        <mat-select [ngModel]="trigger()" (ngModelChange)="pickTrigger($event)">
          @for (item of data.catalog.triggers; track item.id) {
            <mat-option [value]="item.id">
              {{ moduleKey(item.module) | transloco }} · {{ item.labelKey | transloco }}
            </mat-option>
          }
        </mat-select>
      </mat-form-field>
      @for (param of triggerDef()?.params ?? []; track param.name) {
        <mat-form-field>
          <mat-label>{{ param.labelKey | transloco }}</mat-label>
          @if (param.type === 'select') {
            <mat-select
              [ngModel]="triggerParams()[param.name] ?? ''"
              (ngModelChange)="setTrigger(param.name, $event)"
            >
              @for (option of param.options ?? []; track option.value) {
                <mat-option [value]="option.value">{{ option.labelKey | transloco }}</mat-option>
              }
            </mat-select>
          } @else {
            <input
              matInput
              [type]="inputType(param)"
              [ngModel]="triggerParams()[param.name] ?? ''"
              (ngModelChange)="setTrigger(param.name, $event)"
            />
          }
        </mat-form-field>
      }

      <h3>{{ 'core.automations.then' | transloco }}</h3>
      <mat-form-field>
        <mat-label>{{ 'core.automations.then' | transloco }}</mat-label>
        <mat-select [ngModel]="action()" (ngModelChange)="pickAction($event)">
          @for (item of data.catalog.actions; track item.id) {
            <mat-option [value]="item.id">
              {{ moduleKey(item.module) | transloco }} · {{ item.labelKey | transloco }}
            </mat-option>
          }
        </mat-select>
      </mat-form-field>
      @for (param of actionDef()?.params ?? []; track param.name) {
        <mat-form-field>
          <mat-label>{{ param.labelKey | transloco }}</mat-label>
          @switch (param.type) {
            @case ('select') {
              <mat-select
                [ngModel]="actionParams()[param.name] ?? ''"
                (ngModelChange)="setAction(param.name, $event)"
              >
                @for (option of param.options ?? []; track option.value) {
                  <mat-option [value]="option.value">{{ option.labelKey | transloco }}</mat-option>
                }
              </mat-select>
            }
            @default {
              <input
                matInput
                [type]="inputType(param)"
                [ngModel]="actionParams()[param.name] ?? ''"
                (ngModelChange)="setAction(param.name, $event)"
              />
            }
          }
          @if (param.template && variables()) {
            <!-- Not through transloco: it would take {{site}} for its own placeholder. -->
            <mat-hint>{{ 'core.automations.variables' | transloco }} {{ variables() }}</mat-hint>
          }
        </mat-form-field>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>{{ 'core.actions.cancel' | transloco }}</button>
      <button matButton="filled" [disabled]="!valid()" (click)="save()">
        {{ 'core.actions.save' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      min-width: min(480px, 80vw);
    }
    h3 {
      margin: 8px 0 4px;
      font: var(--mat-sys-title-small);
    }
  `,
})
export class AutomationRuleDialog {
  protected readonly data = inject<AutomationRuleData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<AutomationRuleDialog, AutomationRuleInput>);

  protected readonly name = signal(this.data.rule?.name ?? '');
  protected readonly trigger = signal(this.data.rule?.trigger ?? '');
  protected readonly action = signal(this.data.rule?.action ?? '');
  protected readonly triggerParams = signal<Record<string, string>>({
    ...this.data.rule?.triggerParams,
  });
  protected readonly actionParams = signal<Record<string, string>>({
    ...this.data.rule?.actionParams,
  });

  protected readonly triggerDef = computed(() =>
    this.data.catalog.triggers.find((item) => item.id === this.trigger()),
  );
  protected readonly actionDef = computed(() =>
    this.data.catalog.actions.find((item) => item.id === this.action()),
  );
  protected readonly variables = computed(() =>
    ['rule', ...(this.triggerDef()?.variables ?? [])].map((name) => `{{${name}}}`).join(', '),
  );
  protected readonly valid = computed(() => {
    const trigger = this.triggerDef();
    const action = this.actionDef();
    const filled = (defs: AutomationParamDef[], values: Record<string, string>) =>
      defs.every((def) => !def.required || (values[def.name] ?? '').trim());
    return (
      !!this.name().trim() &&
      !!trigger &&
      !!action &&
      filled(trigger.params, this.triggerParams()) &&
      filled(action.params, this.actionParams())
    );
  });

  /** The core's own triggers and actions are "General". */
  protected moduleKey(module: string): string {
    return module === 'core' ? 'core.automations.general' : `${module}.title`;
  }

  protected inputType(param: AutomationParamDef): string {
    return param.type === 'number' ? 'number' : param.type === 'time' ? 'time' : 'text';
  }

  protected pickTrigger(id: string): void {
    this.trigger.set(id);
    this.triggerParams.set({});
  }

  protected pickAction(id: string): void {
    this.action.set(id);
    this.actionParams.set({});
  }

  protected setTrigger(name: string, value: string | number): void {
    this.triggerParams.update((params) => ({ ...params, [name]: String(value ?? '') }));
  }

  protected setAction(name: string, value: string | number): void {
    this.actionParams.update((params) => ({ ...params, [name]: String(value ?? '') }));
  }

  protected save(): void {
    // Empty optional fields are left out: the server checks only what is there.
    const clean = (values: Record<string, string>) =>
      Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim() !== ''));
    this.dialogRef.close({
      name: this.name().trim(),
      trigger: this.trigger(),
      triggerParams: clean(this.triggerParams()),
      action: this.action(),
      actionParams: clean(this.actionParams()),
      isActive: this.data.rule?.isActive ?? true,
    });
  }
}
