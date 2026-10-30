import {Injectable, Logger} from '@nestjs/common';
import {VoiceAnswer} from '@pd/contracts';
import {coreMessages} from '../i18n/core.messages';
import {UsersService} from '../users/users.service';
import {AiConnectionsService} from './ai-connections.service';
import {AiConversationsService} from './ai-conversations.service';
import {AiLimitException, AiService} from './ai.service';
import {AudioFile, transcribe} from './openai-compatible.client';

/** A sentence for the speech synthesizer: the emoji of the chat texts are not said. */
function spoken(text: string): string {
  return text.replace(/\p{Extended_Pictographic}️?\s*/gu, '').trim();
}

/**
 * The voice assistant of the phone ("Люцифер, how long was I on the phone today?"): the words
 * are recognised by the speech connection of the AI settings (as Telegram's voice messages), and
 * the assistant answers in the same conversation as the web chat and Telegram — with every
 * section's tools, writes too ("put it in the diary"), and a short answer meant to be heard. The
 * audio is not kept. A section with its own device token (Activity, for the phone) calls it.
 */
@Injectable()
export class VoiceAssistantService {
  private readonly logger = new Logger(VoiceAssistantService.name);

  constructor(
    private readonly ai: AiService,
    private readonly connections: AiConnectionsService,
    private readonly conversations: AiConversationsService,
    private readonly users: UsersService,
  ) {}

  async answer(userId: string, audio: AudioFile): Promise<VoiceAnswer> {
    const user = await this.users.findById(userId);
    const messages = coreMessages(user?.locale);
    const fail = (text: string): VoiceAnswer => ({
      ok: false,
      question: '',
      answer: spoken(text),
      awaitsConfirmation: false,
    });
    if (!(await this.ai.isConfigured(userId))) {
      return fail(messages.askNotConfigured);
    }
    const connection = await this.connections.speech(userId);
    if (!connection) {
      return fail(messages.voiceNotConfigured);
    }
    let question: string;
    try {
      question = (await transcribe(connection, audio, user?.locale)).trim();
    } catch (error) {
      this.logger.warn(`Voice recognition failed for ${userId}: ${error}`);
      return fail(messages.voiceFailed);
    }
    if (!question) {
      return fail(messages.voiceEmpty);
    }
    try {
      const {reply, awaitsConfirmation} = await this.conversations.ask(
        userId,
        {content: question},
        {plainText: true, spoken: true, allowWrites: true},
      );
      return {
        ok: true,
        question,
        answer: spoken(reply) || '…',
        awaitsConfirmation: !!awaitsConfirmation,
      };
    } catch (error) {
      this.logger.warn(`The voice assistant failed for ${userId}: ${error}`);
      const text =
        error instanceof AiLimitException
          ? messages.assistantLimit(error.connectionName)
          : messages.assistantFailed;
      return {...fail(text), question};
    }
  }
}
