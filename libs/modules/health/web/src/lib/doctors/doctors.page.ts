import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {TranslocoPipe} from '@jsverse/transloco';
import {HealthClinic, HealthDoctor, HealthRecord} from '@pd/contracts';
import {HealthDialogs} from '../dialogs/health-dialogs.service';
import {HealthApi} from '../health.api';
import {CountryPipe, SpecialityPipe} from '../health-labels';

/** The clinics and doctors of every country, with their contacts. */
@Component({
  selector: 'pd-health-doctors-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CountryPipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    SpecialityPipe,
    TranslocoPipe,
  ],
  template: `
    @if (record.isLoading()) {
      <mat-progress-bar mode="indeterminate" />
    }
    @if (record.error()) {
      <p class="error" role="alert">{{ 'health.errors.load' | transloco }}</p>
    } @else if (data(); as data) {
      <section>
        <div class="toolbar">
          <h2 class="section">{{ 'health.doctor.title' | transloco }}</h2>
          <button matButton="tonal" (click)="addDoctor(data)">
            <mat-icon>add</mat-icon> {{ 'health.doctor.add' | transloco }}
          </button>
        </div>
        @for (doctor of data.doctors; track doctor.id) {
          <mat-card appearance="outlined">
            <mat-card-content class="item">
              <mat-icon>stethoscope</mat-icon>
              <span class="body">
                <b>{{ doctor.name }}</b>
                <span class="hint">
                  {{ doctor.speciality | pdSpeciality }}
                  @if (clinicOf(data, doctor); as clinic) {
                    @if (doctor.speciality) {
                      ·
                    }
                    {{ clinic.name }}
                  }
                </span>
                @if (doctor.contacts) {
                  <span class="words">{{ doctor.contacts }}</span>
                }
              </span>
              <button
                matIconButton
                [attr.aria-label]="'core.actions.edit' | transloco"
                (click)="editDoctor(data, doctor)"
              >
                <mat-icon>edit</mat-icon>
              </button>
              <button
                matIconButton
                [attr.aria-label]="'core.actions.delete' | transloco"
                (click)="removeDoctor(doctor)"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </mat-card-content>
          </mat-card>
        } @empty {
          <p class="hint">{{ 'health.doctor.empty' | transloco }}</p>
        }
      </section>

      <section>
        <div class="toolbar">
          <h2 class="section">{{ 'health.clinic.title' | transloco }}</h2>
          <button matButton="tonal" (click)="addClinic()">
            <mat-icon>add</mat-icon> {{ 'health.clinic.add' | transloco }}
          </button>
        </div>
        @for (clinic of data.clinics; track clinic.id) {
          <mat-card appearance="outlined">
            <mat-card-content class="item">
              <mat-icon>local_hospital</mat-icon>
              <span class="body">
                <b>{{ clinic.name }}</b>
                <span class="hint">
                  {{ clinic.city }}
                  @if (clinic.city && clinic.country) {
                    ·
                  }
                  {{ clinic.country | pdCountry }}
                </span>
                @if (clinic.contacts) {
                  <span class="words">{{ clinic.contacts }}</span>
                }
              </span>
              <button
                matIconButton
                [attr.aria-label]="'core.actions.edit' | transloco"
                (click)="editClinic(clinic)"
              >
                <mat-icon>edit</mat-icon>
              </button>
              <button
                matIconButton
                [attr.aria-label]="'core.actions.delete' | transloco"
                (click)="removeClinic(clinic)"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </mat-card-content>
          </mat-card>
        } @empty {
          <p class="hint">{{ 'health.clinic.empty' | transloco }}</p>
        }
      </section>
    }
  `,
  styles: `
    :host,
    section {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    :host {
      gap: 24px;
    }
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .section {
      margin: 0;
      font: var(--mat-sys-title-medium);
    }
    .item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding-top: 16px;
    }
    .item > mat-icon {
      color: var(--mat-sys-primary);
    }
    .body {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .words {
      white-space: pre-wrap;
    }
    .hint {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class DoctorsPage {
  private readonly api = inject(HealthApi);
  private readonly dialogs = inject(HealthDialogs);

  protected readonly record = this.api.record();
  protected readonly data = computed(() =>
    this.record.hasValue() ? this.record.value() : undefined,
  );

  protected clinicOf(
    data: HealthRecord,
    doctor: HealthDoctor,
  ): HealthClinic | undefined {
    return data.clinics.find(clinic => clinic.id === doctor.clinicId);
  }

  protected async addDoctor(record: HealthRecord): Promise<void> {
    if (await this.dialogs.doctor({clinics: record.clinics})) {
      this.record.reload();
    }
  }

  protected async editDoctor(
    record: HealthRecord,
    doctor: HealthDoctor,
  ): Promise<void> {
    if (await this.dialogs.doctor({clinics: record.clinics, doctor})) {
      this.record.reload();
    }
  }

  protected async removeDoctor(doctor: HealthDoctor): Promise<void> {
    if (
      await this.dialogs.remove(doctor.name, () =>
        this.api.client.removeDoctor(doctor.id),
      )
    ) {
      this.record.reload();
    }
  }

  protected async addClinic(): Promise<void> {
    if (await this.dialogs.clinic(null)) {
      this.record.reload();
    }
  }

  protected async editClinic(clinic: HealthClinic): Promise<void> {
    if (await this.dialogs.clinic(clinic)) {
      this.record.reload();
    }
  }

  protected async removeClinic(clinic: HealthClinic): Promise<void> {
    if (
      await this.dialogs.remove(clinic.name, () =>
        this.api.client.removeClinic(clinic.id),
      )
    ) {
      this.record.reload();
    }
  }
}
