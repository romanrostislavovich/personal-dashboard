import {Injectable, OnModuleInit} from '@nestjs/common';
import {ServerActions} from '@pd/api-core';
import {icdLoadSchema} from '@pd/contracts';
import {IcdDictionaryService} from './icd/icd-dictionary.service';

/** Downloads from outside services run on the server (see ServerActions). */
export const HEALTH_ACTIONS = {
  loadIcd: 'health.load-icd',
} as const;

@Injectable()
export class HealthServerActions implements OnModuleInit {
  constructor(
    private readonly actions: ServerActions,
    private readonly icd: IcdDictionaryService,
  ) {}

  onModuleInit(): void {
    this.actions.register(HEALTH_ACTIONS.loadIcd, (userId, args) =>
      this.icd.load(userId, icdLoadSchema.parse(args).source),
    );
  }
}
