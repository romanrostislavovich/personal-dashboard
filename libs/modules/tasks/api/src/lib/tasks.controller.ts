import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { AuthUser, CurrentUser, ZodValidationPipe } from '@pd/api-core';
import {
  Reminder,
  reminderInputSchema,
  ReminderSnooze,
  reminderSnoozeSchema,
  reminderUpdateSchema,
  Task,
  taskInputSchema,
  TaskList,
  TaskListInput,
  taskListInputSchema,
  taskUpdateSchema,
} from '@pd/contracts';
import { z } from 'zod';
import { RemindersService } from './reminders.service';
import { TasksService } from './tasks.service';

const id = () => Param('id', ParseUUIDPipe);

/** The TODO list, its lists and the reminders: `/api/tasks`. */
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly reminders: RemindersService,
  ) {}

  // --- Lists ---

  @Get('lists')
  lists(@CurrentUser() user: AuthUser): Promise<TaskList[]> {
    return this.tasks.lists(user.id);
  }

  @Post('lists')
  @HttpCode(204)
  createList(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(taskListInputSchema)) input: TaskListInput,
  ): Promise<void> {
    return this.tasks.createList(user.id, input.name);
  }

  @Put('lists/:id')
  @HttpCode(204)
  renameList(
    @CurrentUser() user: AuthUser,
    @id() listId: string,
    @Body(new ZodValidationPipe(taskListInputSchema)) input: TaskListInput,
  ): Promise<void> {
    return this.tasks.renameList(user.id, listId, input.name);
  }

  /** Its tasks go back to the inbox. */
  @Delete('lists/:id')
  @HttpCode(204)
  removeList(@CurrentUser() user: AuthUser, @id() listId: string): Promise<void> {
    return this.tasks.removeList(user.id, listId);
  }

  // --- Reminders (before `:id` of the tasks, so "reminders" is not taken for a task id) ---

  @Get('reminders')
  listReminders(@CurrentUser() user: AuthUser): Promise<Reminder[]> {
    return this.reminders.list(user.id);
  }

  @Post('reminders')
  createReminder(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(reminderInputSchema)) input: z.output<typeof reminderInputSchema>,
  ): Promise<Reminder> {
    return this.reminders.create(user.id, input);
  }

  @Patch('reminders/:id')
  @HttpCode(204)
  updateReminder(
    @CurrentUser() user: AuthUser,
    @id() reminderId: string,
    @Body(new ZodValidationPipe(reminderUpdateSchema))
    changes: z.output<typeof reminderUpdateSchema>,
  ): Promise<void> {
    return this.reminders.update(user.id, reminderId, changes);
  }

  @Post('reminders/:id/done')
  @HttpCode(204)
  reminderDone(@CurrentUser() user: AuthUser, @id() reminderId: string): Promise<void> {
    return this.reminders.done(user.id, reminderId);
  }

  /** Remind again at another moment. */
  @Post('reminders/:id/snooze')
  @HttpCode(204)
  snoozeReminder(
    @CurrentUser() user: AuthUser,
    @id() reminderId: string,
    @Body(new ZodValidationPipe(reminderSnoozeSchema)) input: ReminderSnooze,
  ): Promise<void> {
    return this.reminders.snooze(user.id, reminderId, new Date(input.remindAt));
  }

  @Delete('reminders/:id')
  @HttpCode(204)
  removeReminder(@CurrentUser() user: AuthUser, @id() reminderId: string): Promise<void> {
    return this.reminders.remove(user.id, reminderId);
  }

  // --- Tasks ---

  /** Open tasks and the ones done in the last month. */
  @Get()
  list(@CurrentUser() user: AuthUser): Promise<Task[]> {
    return this.tasks.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(taskInputSchema)) input: z.output<typeof taskInputSchema>,
  ): Promise<Task> {
    return this.tasks.create(user.id, input);
  }

  @Patch(':id')
  @HttpCode(204)
  update(
    @CurrentUser() user: AuthUser,
    @id() taskId: string,
    @Body(new ZodValidationPipe(taskUpdateSchema)) changes: z.output<typeof taskUpdateSchema>,
  ): Promise<void> {
    return this.tasks.update(user.id, taskId, changes);
  }

  /** A repeating task comes back as a new one on its next day. */
  @Post(':id/complete')
  @HttpCode(204)
  complete(@CurrentUser() user: AuthUser, @id() taskId: string): Promise<void> {
    return this.tasks.complete(user.id, taskId);
  }

  @Post(':id/reopen')
  @HttpCode(204)
  reopen(@CurrentUser() user: AuthUser, @id() taskId: string): Promise<void> {
    return this.tasks.reopen(user.id, taskId);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @id() taskId: string): Promise<void> {
    return this.tasks.remove(user.id, taskId);
  }
}
