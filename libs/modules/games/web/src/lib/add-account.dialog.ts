import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { Game, GameAccountInput, WOW_REGIONS, WowRegion } from '@pd/contracts';

/** Добавление игрового аккаунта: Steam ID для Dota или регион/реалм/имя для WoW. */
@Component({
  selector: 'pd-add-game-account-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'games.add' | transloco }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form">
        <mat-button-toggle-group formControlName="game" class="game">
          <mat-button-toggle value="dota2">Dota 2</mat-button-toggle>
          <mat-button-toggle value="wow">World of Warcraft</mat-button-toggle>
        </mat-button-toggle-group>

        @if (game() === 'dota2') {
          <mat-form-field>
            <mat-label>{{ 'games.dota.steamId' | transloco }}</mat-label>
            <input matInput formControlName="steamId" cdkFocusInitial />
            <mat-hint>{{ 'games.dota.steamIdHint' | transloco }}</mat-hint>
          </mat-form-field>
        } @else {
          <div class="row">
            <mat-form-field>
              <mat-label>{{ 'games.wow.region' | transloco }}</mat-label>
              <mat-select formControlName="region">
                @for (region of regions; track region) {
                  <mat-option [value]="region">{{ region.toUpperCase() }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'games.wow.realm' | transloco }}</mat-label>
              <input matInput formControlName="realm" placeholder="howling-fjord" />
            </mat-form-field>
          </div>
          <mat-form-field>
            <mat-label>{{ 'games.wow.character' | transloco }}</mat-label>
            <input matInput formControlName="name" />
            <mat-hint>{{ 'games.wow.realmHint' | transloco }}</mat-hint>
          </mat-form-field>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>
          {{ 'core.actions.cancel' | transloco }}
        </button>
        <button matButton="filled" type="submit" [disabled]="!isValid()">
          {{ 'core.actions.add' | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: min(440px, 80vw);
    }
    .game {
      align-self: flex-start;
      margin-bottom: 8px;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 2fr;
      gap: 8px;
    }
  `,
})
export class AddGameAccountDialog {
  private readonly dialogRef = inject(MatDialogRef<AddGameAccountDialog, GameAccountInput>);

  protected readonly regions = WOW_REGIONS;
  protected readonly form = inject(NonNullableFormBuilder).group({
    game: ['dota2' as Game],
    steamId: ['', Validators.required],
    region: ['eu' as WowRegion],
    realm: ['', Validators.required],
    name: ['', Validators.required],
  });
  protected readonly game = toSignal(this.form.controls.game.valueChanges, {
    initialValue: this.form.controls.game.value,
  });

  /** Проверяем только поля выбранной игры. */
  protected isValid(): boolean {
    const c = this.form.controls;
    return this.game() === 'dota2' ? c.steamId.valid : c.realm.valid && c.name.valid;
  }

  save(): void {
    const v = this.form.getRawValue();
    this.dialogRef.close(
      v.game === 'dota2'
        ? { game: 'dota2', steamId: v.steamId }
        : { game: 'wow', region: v.region, realm: v.realm, name: v.name },
    );
  }
}
