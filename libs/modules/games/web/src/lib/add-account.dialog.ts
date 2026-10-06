import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  Game,
  GameAccountInput,
  WOW_REGIONS,
  WOW_VERSIONS,
  WowRegion,
  WowVersion,
} from '@pd/contracts';

/** Adding a game account: a Steam profile, a Steam ID for Dota or region/realm/name for WoW. */
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
          <mat-button-toggle value="steam">Steam</mat-button-toggle>
          <mat-button-toggle value="dota2">Dota 2</mat-button-toggle>
          <mat-button-toggle value="wow">World of Warcraft</mat-button-toggle>
        </mat-button-toggle-group>

        @if (game() === 'steam') {
          <mat-form-field>
            <mat-label>{{ 'games.steam.profile' | transloco }}</mat-label>
            <input matInput formControlName="steamProfile" cdkFocusInitial />
            <mat-hint>{{ 'games.steam.profileHint' | transloco }}</mat-hint>
          </mat-form-field>
        } @else if (game() === 'dota2') {
          <mat-form-field>
            <mat-label>{{ 'games.dota.steamId' | transloco }}</mat-label>
            <input matInput formControlName="steamId" cdkFocusInitial />
            <mat-hint>{{ 'games.dota.steamIdHint' | transloco }}</mat-hint>
          </mat-form-field>
        } @else {
          <mat-form-field>
            <mat-label>{{ 'games.wow.version' | transloco }}</mat-label>
            <mat-select formControlName="version">
              @for (version of versions; track version) {
                <mat-option [value]="version">
                  {{ 'games.wow.versions.' + version | transloco }}
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
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
              <input matInput formControlName="realm" />
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
  /** The game to open on; Dota 2 unless the page asks for another. */
  private readonly initialGame = inject<Game | null>(MAT_DIALOG_DATA, { optional: true });

  protected readonly regions = WOW_REGIONS;
  protected readonly versions = WOW_VERSIONS;
  protected readonly form = inject(NonNullableFormBuilder).group({
    game: [this.initialGame ?? ('dota2' as Game)],
    steamProfile: ['', Validators.required],
    steamId: ['', Validators.required],
    region: ['eu' as WowRegion],
    version: ['retail' as WowVersion],
    realm: ['', Validators.required],
    name: ['', Validators.required],
  });
  protected readonly game = toSignal(this.form.controls.game.valueChanges, {
    initialValue: this.form.controls.game.value,
  });

  /** Validate only the fields of the selected game. */
  protected isValid(): boolean {
    const c = this.form.controls;
    switch (this.game()) {
      case 'steam':
        return c.steamProfile.valid;
      case 'dota2':
        return c.steamId.valid;
      case 'wow':
        return c.realm.valid && c.name.valid;
    }
  }

  save(): void {
    const v = this.form.getRawValue();
    const input: Record<Game, GameAccountInput> = {
      steam: { game: 'steam', steamId: v.steamProfile },
      dota2: { game: 'dota2', steamId: v.steamId },
      wow: { game: 'wow', region: v.region, version: v.version, realm: v.realm, name: v.name },
    };
    this.dialogRef.close(input[v.game]);
  }
}
