import {Module} from '@nestjs/common';
import {VaultAchievements} from './vault.achievements';
import {VaultController} from './vault.controller';
import {VaultService} from './vault.service';

/**
 * The password vault: logins and secure notes encrypted on the device with a key of the master
 * password — the server keeps ciphertext only, and the AI never sees it. API: `/api/vault`.
 */
@Module({
  controllers: [VaultController],
  providers: [VaultService, VaultAchievements],
})
export class VaultModule {}
