import { Injectable, OnModuleInit } from '@nestjs/common';
import { EncryptExistingService } from '@pd/api-core';
import { birthdays } from './birthdays.schema';

/** The notes about people written before they were encrypted. */
@Injectable()
export class BirthdaysEncryption implements OnModuleInit {
  constructor(private readonly encryptExisting: EncryptExistingService) {}

  onModuleInit(): void {
    this.encryptExisting.register({
      table: birthdays,
      id: birthdays.id,
      columns: { note: birthdays.note },
    });
  }
}
