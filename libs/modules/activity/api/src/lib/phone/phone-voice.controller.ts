import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {Public, RateLimit, VoiceAssistantService} from '@pd/api-core';
import {VoiceAnswer} from '@pd/contracts';
import {DevicesService} from '../devices.service';

/** A question is a few seconds; this is over a minute of 16 kHz WAV. */
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

interface UploadedAudio {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

/**
 * The phone's voice assistant: after its name is heard, the phone sends what was said (WAV) with
 * its device token, and gets the answer to read aloud. The audio is not kept.
 */
@Controller('activity/device')
export class PhoneVoiceController {
  constructor(
    private readonly devices: DevicesService,
    private readonly voice: VoiceAssistantService,
  ) {}

  @Public()
  @RateLimit(60, 3600)
  @Post('voice')
  @UseInterceptors(
    FileInterceptor('audio', {limits: {fileSize: MAX_AUDIO_BYTES}}),
  )
  async ask(
    @Headers('authorization') authorization: string | undefined,
    @UploadedFile() audio: UploadedAudio | undefined,
  ): Promise<VoiceAnswer> {
    const device = await this.devices.authenticate(authorization);
    if (!audio?.buffer.length) {
      throw new BadRequestException('Expected the audio in the "audio" field');
    }
    return this.voice.answer(device.userId, {
      data: audio.buffer,
      fileName: audio.originalname || 'voice.wav',
      mimeType: audio.mimetype || 'audio/wav',
    });
  }
}
