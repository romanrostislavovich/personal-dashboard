import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { BLOOD_TYPES, BloodType } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { HealthDialogs } from '../dialogs/health-dialogs.service';
import { HealthApi } from '../health.api';
import { CountryPipe } from '../health-labels';
import { ProfileItemData, ProfileItemDialog, ProfileItemKind } from './profile-item.dialog';

/**
 * What a doctor asks first: the blood type, the allergies (a severe one on top), the
 * vaccinations with the next dose, the operations, and notes for an emergency.
 */
@Component({
  selector: 'pd-health-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CountryPipe,
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    TranslocoPipe,
  ],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.scss',
})
export class ProfilePage {
  private readonly api = inject(HealthApi);
  private readonly dialogs = inject(HealthDialogs);
  private readonly dialog = inject(MatDialog);

  protected readonly bloodTypes = BLOOD_TYPES;
  protected readonly record = this.api.record();
  protected readonly profile = computed(() =>
    this.record.hasValue() ? this.record.value()?.profile : undefined,
  );
  /** The notes as typed, until saved; `null` — as stored. */
  protected readonly notes = signal<string | null>(null);
  protected readonly failed = signal(false);

  protected async setBloodType(bloodType: BloodType | ''): Promise<void> {
    await this.saveProfile({ bloodType: bloodType || null });
  }

  protected async saveNotes(): Promise<void> {
    await this.saveProfile({ notes: this.notes() });
    this.notes.set(null);
  }

  private async saveProfile(change: { bloodType?: BloodType | null; notes?: string | null }) {
    const current = this.profile();
    this.failed.set(false);
    try {
      await this.api.client.saveProfile({
        bloodType: current?.bloodType ?? null,
        notes: current?.notes ?? null,
        ...change,
      });
      this.record.reload();
    } catch {
      this.failed.set(true);
    }
  }

  protected async edit(kind: ProfileItemKind, item?: ProfileItemData['item']): Promise<void> {
    const ref = this.dialog.open<ProfileItemDialog, ProfileItemData, boolean>(ProfileItemDialog, {
      data: { kind, item },
      autoFocus: 'first-tabbable',
    });
    if (await firstValueFrom(ref.afterClosed())) {
      this.record.reload();
    }
  }

  protected async remove(kind: ProfileItemKind, id: string, what: string): Promise<void> {
    const client = this.api.client;
    const remove = {
      allergy: () => client.removeAllergy(id),
      vaccination: () => client.removeVaccination(id),
      operation: () => client.removeOperation(id),
    }[kind];
    if (await this.dialogs.remove(what, remove)) {
      this.record.reload();
    }
  }

  /** A dose due within a month, or overdue. */
  protected dueSoon(day: string | null): boolean {
    if (!day) {
      return false;
    }
    return Date.parse(day) - Date.now() < 30 * 86_400_000;
  }

  /** The item as the dialog takes it. */
  protected asItem(item: object): ProfileItemData['item'] {
    return item as ProfileItemData['item'];
  }
}
