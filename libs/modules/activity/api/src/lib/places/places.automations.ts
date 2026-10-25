import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AutomationsService, DB, Database } from '@pd/api-core';
import { eq } from 'drizzle-orm';
import { namedAt } from './frequent';
import { activityPlacePresence } from './places.schema';
import { PlacesService } from './places.service';
import { stayNow } from './stays';

/** The fixes read to tell where the user is now. */
const RECENT_MS = 3 * 3_600_000;

type Params = Record<string, string>;

/** `place` of a rule: empty — any named place; else the name, case aside. */
function samePlace(params: Params, vars: Params): boolean {
  const wanted = params['place']?.trim().toLowerCase();
  return !wanted || vars['place'].toLowerCase() === wanted;
}

/**
 * Places in the rules "if X, then Y": came to a named place (ten minutes there), left it. Told
 * after each batch of fixes the phone sends, so up to a quarter of an hour late; once per change.
 */
@Injectable()
export class PlacesAutomations implements OnModuleInit {
  private readonly logger = new Logger(PlacesAutomations.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly automations: AutomationsService,
    private readonly places: PlacesService,
  ) {}

  onModuleInit(): void {
    const params = [
      { name: 'place', type: 'text' as const, labelKey: 'activity.automations.place' },
    ];
    this.automations.registerTrigger({
      id: 'activity.place.arrive',
      module: 'activity',
      labelKey: 'activity.automations.arrive',
      description:
        'The user came to one of their named places (Activity → Places) and stayed ten ' +
        'minutes; `place` — only this one (its name), empty — any',
      params,
      variables: ['place', 'time'],
      matches: samePlace,
    });
    this.automations.registerTrigger({
      id: 'activity.place.leave',
      module: 'activity',
      labelKey: 'activity.automations.leave',
      description:
        'The user left one of their named places; `place` — only this one (its name), empty — any',
      params,
      variables: ['place', 'time'],
      matches: samePlace,
    });
  }

  /** After new fixes: where the user is now against where they were, told on a change. */
  async check(userId: string): Promise<void> {
    try {
      const now = Date.now();
      const [fixes, named] = await Promise.all([
        this.places.fixesBetween(userId, now - RECENT_MS, now + 60_000),
        this.places.named(userId),
      ]);
      const stay = stayNow(fixes);
      const place = stay ? namedAt(stay, named) : null;
      const [presence] = await this.db
        .select()
        .from(activityPlacePresence)
        .where(eq(activityPlacePresence.userId, userId));
      const before = presence?.placeId ?? null;
      if (before === (place?.id ?? null)) {
        return;
      }
      await this.db
        .insert(activityPlacePresence)
        .values({ userId, placeId: place?.id ?? null, changedAt: new Date() })
        .onConflictDoUpdate({
          target: activityPlacePresence.userId,
          set: { placeId: place?.id ?? null, changedAt: new Date() },
        });
      const time = new Date().toISOString();
      const left = named.find((one) => one.id === before);
      if (left) {
        await this.automations.emit(userId, 'activity.place.leave', { place: left.name, time });
      }
      if (place) {
        await this.automations.emit(userId, 'activity.place.arrive', { place: place.name, time });
      }
    } catch (error) {
      this.logger.warn(`Places were not checked for rules: ${String(error).slice(0, 200)}`);
    }
  }
}
