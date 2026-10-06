import { Injectable, OnModuleInit } from '@nestjs/common';
import { ServerActions } from '@pd/api-core';
import { soundcloudConnectSchema } from '@pd/contracts';
import { SoundcloudService } from './soundcloud.service';

/** SoundCloud requests run on the server (see ServerActions). */
export const SOUNDCLOUD_ACTIONS = {
  connect: 'music.connect-soundcloud',
  sync: 'music.sync-soundcloud',
} as const;

@Injectable()
export class SoundcloudServerActions implements OnModuleInit {
  constructor(
    private readonly actions: ServerActions,
    private readonly soundcloud: SoundcloudService,
  ) {}

  onModuleInit(): void {
    this.actions.register(SOUNDCLOUD_ACTIONS.connect, (userId, args) =>
      this.soundcloud.connect(userId, soundcloudConnectSchema.parse(args)),
    );
    // The news are for the hourly job's notifications; a manual refresh returns nothing.
    this.actions.register(SOUNDCLOUD_ACTIONS.sync, async (userId) => {
      await this.soundcloud.sync(userId);
    });
  }
}
