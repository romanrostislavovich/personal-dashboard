import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser, CurrentUser } from '@pd/api-core';
import { Screenshot, SCREENSHOT_MAX_BYTES } from '@pd/contracts';
import { ScreenshotsService } from './screenshots.service';

/** The part of a multer upload we use (multer's own types are not installed). */
interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
}

const upload = FileInterceptor('file', { limits: { fileSize: SCREENSHOT_MAX_BYTES } });

/** `/api/screenshots`: the list, the files, and what the folders of the computers change. */
@Controller('screenshots')
export class ScreenshotsController {
  constructor(private readonly screenshots: ScreenshotsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<Screenshot[]> {
    return this.screenshots.list(user.id);
  }

  /** A new one: the file in `file`, its path in the folder in `name`. */
  @Post()
  @UseInterceptors(upload)
  add(
    @CurrentUser() user: AuthUser,
    @Body('name') name: string | undefined,
    @UploadedFile() file: UploadedImage | undefined,
  ): Promise<Screenshot> {
    return this.screenshots.add(user.id, name ?? '', image(file));
  }

  @Put(':id')
  @UseInterceptors(upload)
  replace(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedImage | undefined,
  ): Promise<Screenshot> {
    return this.screenshots.replace(user.id, id, image(file));
  }

  /** The file as it is. The browser loads it with the auth header, so it is fetched as a blob. */
  @Get(':id/file')
  @Header('Cache-Control', 'private, max-age=60')
  async file(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const { data, mimeType } = await this.screenshots.file(user.id, id);
    return new StreamableFile(data, { type: mimeType });
  }

  @Get(':id/thumbnail')
  @Header('Cache-Control', 'private, max-age=86400')
  async thumbnail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const { data, mimeType } = await this.screenshots.file(user.id, id, true);
    return new StreamableFile(data, { type: mimeType });
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.screenshots.remove(user.id, id);
  }
}

function image(file: UploadedImage | undefined) {
  if (!file) {
    throw new BadRequestException('Expected an image in the "file" field');
  }
  return { data: file.buffer, mimeType: file.mimetype };
}
