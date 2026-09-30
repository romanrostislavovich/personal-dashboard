import { Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { TrashItem } from '@pd/contracts';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { TrashService } from './trash.service';

/** Deleted data for 30 days: bring it back or delete it for good. */
@Controller('trash')
export class TrashController {
  constructor(private readonly trash: TrashService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<TrashItem[]> {
    return this.trash.list(user.id);
  }

  @Post(':id/restore')
  @HttpCode(204)
  restore(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trash.restore(user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trash.remove(user.id, id);
  }
}
