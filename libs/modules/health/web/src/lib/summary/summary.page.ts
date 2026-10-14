import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoPipe } from '@jsverse/transloco';
import { HEALTH_READS } from '@pd/client-core';
import {
  HealthShare,
  HealthSummaryOptionsInput,
  SHARE_DAYS,
  SUMMARY_LANGUAGES,
  SummaryLanguage,
} from '@pd/contracts';
import { HealthApi } from '../health.api';
import { SpecialityPipe } from '../health-labels';

type Section =
  | 'profile'
  | 'conditions'
  | 'pastConditions'
  | 'medications'
  | 'pastMedications'
  | 'labs'
  | 'studies'
  | 'visits'
  | 'visitTexts';

const SECTIONS: Section[] = [
  'profile',
  'conditions',
  'pastConditions',
  'medications',
  'pastMedications',
  'labs',
  'studies',
  'visits',
  'visitTexts',
];

/**
 * A summary for a new doctor: the user picks the language and what goes in (no psychiatry for
 * a dentist), then opens it to print or save as PDF, downloads it for Word, or makes a link the
 * doctor opens for a few days without signing in. The links can be revoked at any time.
 */
@Component({
  selector: 'pd-health-summary-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    SpecialityPipe,
    TranslocoPipe,
  ],
  templateUrl: './summary.page.html',
  styleUrl: './summary.page.scss',
})
export class SummaryPage {
  private readonly api = inject(HealthApi);

  protected readonly languages = SUMMARY_LANGUAGES;
  protected readonly sections = SECTIONS;
  protected readonly shareDays = SHARE_DAYS;

  protected readonly language = signal<SummaryLanguage>('pl');
  protected readonly translate = signal(false);
  protected readonly included = signal<Record<Section, boolean>>({
    profile: true,
    conditions: true,
    pastConditions: false,
    medications: true,
    pastMedications: false,
    labs: true,
    studies: true,
    visits: true,
    visitTexts: false,
  });
  protected readonly excluded = signal<string[]>([]);
  protected readonly from = signal('');
  protected readonly days = signal<(typeof SHARE_DAYS)[number]>(3);
  protected readonly note = signal('');

  protected readonly busy = signal(false);
  protected readonly failed = signal(false);
  /** The address of the link just made: shown once. */
  protected readonly created = signal<string | null>(null);
  protected readonly copied = signal(false);

  private readonly record = this.api.record();
  /** The specialities of the history, to leave some of them out. */
  protected readonly specialities = computed(() => {
    const visits = this.record.hasValue() ? (this.record.value()?.visits ?? []) : [];
    return [...new Set(visits.map((v) => v.speciality).filter((s): s is string => !!s))].sort();
  });

  protected readonly shares = httpResource<HealthShare[]>(() => HEALTH_READS.shares(), {
    defaultValue: [],
  });
  protected readonly shareList = computed(() =>
    this.shares.hasValue() ? this.shares.value() : [],
  );

  protected set(section: Section, value: boolean): void {
    this.included.update((included) => ({ ...included, [section]: value }));
  }

  protected toggleExcluded(speciality: string, excluded: boolean): void {
    this.excluded.update((list) =>
      excluded ? [...list, speciality] : list.filter((item) => item !== speciality),
    );
  }

  private options(): HealthSummaryOptionsInput {
    return {
      language: this.language(),
      translate: this.translate(),
      ...this.included(),
      excludeSpecialities: this.excluded(),
      from: this.from() || null,
    };
  }

  /** The page in a new tab, where the browser prints it or saves it as PDF. */
  protected async open(): Promise<void> {
    const tab = window.open('', '_blank');
    await this.run(async () => {
      const blob = await this.api.client.summaryHtml(this.options());
      const url = URL.createObjectURL(new Blob([blob], { type: 'text/html' }));
      if (tab) {
        tab.location.href = url;
      } else {
        // No new tab (the desktop app, a blocked pop-up): the page is saved as a file rather
        // than put in place of the app, where there is no way back from it.
        const link = document.createElement('a');
        link.href = url;
        link.download = 'medical-summary.html';
        link.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  }

  protected async download(): Promise<void> {
    await this.run(async () => {
      const blob = await this.api.client.summaryDocx(this.options());
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'medical-summary.docx';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    });
  }

  protected async share(): Promise<void> {
    this.copied.set(false);
    await this.run(async () => {
      const { url } = await this.api.client.share({
        options: this.options(),
        days: this.days(),
        note: this.note().trim() || null,
      });
      this.created.set(url);
      this.note.set('');
      this.shares.reload();
    });
  }

  protected async copy(url: string): Promise<void> {
    await navigator.clipboard.writeText(url);
    this.copied.set(true);
  }

  protected async revoke(share: HealthShare): Promise<void> {
    await this.run(async () => {
      await this.api.client.revokeShare(share.id);
      this.shares.reload();
    });
  }

  protected state(share: HealthShare): 'active' | 'expired' | 'revoked' {
    if (share.revokedAt) {
      return 'revoked';
    }
    return Date.parse(share.expiresAt) > Date.now() ? 'active' : 'expired';
  }

  private async run(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.failed.set(false);
    try {
      await work();
    } catch {
      this.failed.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
