import {DatePipe} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {
  MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS,
  MatSlideToggleModule,
} from '@angular/material/slide-toggle';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {LifelogNarrative} from '@pd/contracts';
import {todayLocalDate} from '@pd/web-core';
import {firstValueFrom} from 'rxjs';
import {DayPage} from './day.page';
import {isLifelogDay} from './lifelog-dates';
import {LifelogApi} from './lifelog.api';

@Component({
  selector: 'pd-lifelog-narrative',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS,
      useValue: {disableToggleValue: true},
    },
  ],
  imports: [
    DatePipe,
    DayPage,
    MatButtonModule,
    MatCardModule,
    MatSlideToggleModule,
    RouterLink,
    TranslocoPipe,
  ],
  templateUrl: './lifelog-narrative.component.html',
  styleUrl: './lifelog-narrative.component.scss',
})
export class LifelogNarrativeComponent {
  private readonly api = inject(LifelogApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  protected readonly today = todayLocalDate();
  protected readonly day = computed(() => {
    const day = this.query().get('day') ?? this.today;
    return isLifelogDay(day) && day <= this.today ? day : this.today;
  });
  protected readonly narrative = this.api.day(this.day);
  protected readonly record = computed(() =>
    this.narrative.hasValue() ? this.narrative.value() : null,
  );
  protected readonly settings = this.api.settings();
  protected readonly nightlyEnabled = computed(
    () => this.settings.hasValue() && this.settings.value().enabled,
  );
  private readonly drafts = signal<Record<string, string>>({});
  protected readonly note = computed(
    () => this.drafts()[this.day()] ?? this.record()?.note ?? '',
  );
  protected readonly dirty = computed(
    () => this.note() !== (this.record()?.note ?? ''),
  );
  protected readonly busy = signal(false);
  protected readonly configuring = signal(false);
  protected readonly settingsError = signal(false);
  private readonly feedback = signal<{
    day: string;
    key: string;
    error: boolean;
  } | null>(null);
  protected readonly message = computed(() =>
    this.feedback()?.day === this.day() ? this.feedback() : null,
  );

  protected pick(day: string): void {
    if (isLifelogDay(day) && day <= this.today) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {day},
        queryParamsHandling: 'merge',
      });
    }
  }

  protected edit(note: string): void {
    this.drafts.update(drafts => ({...drafts, [this.day()]: note}));
    this.feedback.set(null);
  }

  protected async saveNote(): Promise<void> {
    if (
      this.busy() ||
      this.narrative.isLoading() ||
      this.narrative.error() ||
      this.note().length > 2000
    )
      return;
    const day = this.day();
    const note = this.note();
    await this.mutate(day, async () => {
      const result = await firstValueFrom(this.api.note(day, note));
      if (this.destroyRef.destroyed) return;
      // A response must never replace typing done after Save, even after changing dates.
      this.drafts.update(drafts =>
        drafts[day] === note ? {...drafts, [day]: result.note} : drafts,
      );
      this.accept(day, result);
      this.feedback.set({day, key: 'life.chronicle.saved', error: false});
    });
  }

  protected async generate(): Promise<void> {
    if (this.busy() || this.narrative.isLoading() || this.narrative.error())
      return;
    const day = this.day();
    await this.mutate(day, async () => {
      const result = await firstValueFrom(this.api.generate(day));
      if (this.destroyRef.destroyed) return;
      if (result) this.accept(day, result);
      this.feedback.set({
        day,
        key: result ? 'life.chronicle.generated' : 'life.chronicle.noFacts',
        error: false,
      });
    });
  }

  protected async remove(): Promise<void> {
    if (this.busy() || this.narrative.isLoading() || this.narrative.error())
      return;
    const day = this.day();
    if (
      !confirm(this.transloco.translate('life.chronicle.confirmDelete', {day}))
    )
      return;
    const note = this.note();
    await this.mutate(day, async () => {
      await firstValueFrom(this.api.remove(day));
      if (this.destroyRef.destroyed) return;
      this.drafts.update(drafts => {
        if (drafts[day] !== undefined && drafts[day] !== note) return drafts;
        const kept = {...drafts};
        delete kept[day];
        return kept;
      });
      this.accept(day, null);
      this.feedback.set({day, key: 'life.chronicle.deleted', error: false});
    });
  }

  protected async configure(enabled: boolean): Promise<void> {
    if (
      this.configuring() ||
      this.settings.isLoading() ||
      this.settings.error()
    )
      return;
    this.configuring.set(true);
    this.settingsError.set(false);
    try {
      const settings = await firstValueFrom(this.api.configure(enabled));
      if (!this.destroyRef.destroyed) this.settings.set(settings);
    } catch {
      if (!this.destroyRef.destroyed) this.settingsError.set(true);
    } finally {
      if (!this.destroyRef.destroyed) this.configuring.set(false);
    }
  }

  private accept(day: string, result: LifelogNarrative | null): void {
    if (this.day() === day && !this.destroyRef.destroyed) {
      this.narrative.set(result);
    }
  }

  private async mutate(
    day: string,
    action: () => Promise<void>,
  ): Promise<void> {
    this.busy.set(true);
    this.feedback.set(null);
    try {
      await action();
    } catch {
      if (!this.destroyRef.destroyed)
        this.feedback.set({
          day,
          key: 'life.chronicle.actionError',
          error: true,
        });
    } finally {
      if (!this.destroyRef.destroyed) this.busy.set(false);
    }
  }
}
