import {aiApi, ApiError} from '@pd/client-core';
import {AI_ATTACHMENT_MAX_BYTES} from '@pd/contracts';
import type {ChatAttachResult} from '../shared/messages';
import {signedInClient} from './account';

/**
 * A file the side panel attaches to the next message: the server reads its text (a picture —
 * with the AI connection that reads pictures), and the panel sends it back with the message.
 */
export async function chatAttach(file: {
  name: string;
  mimeType: string;
  base64: string;
}): Promise<ChatAttachResult> {
  const bytes = Uint8Array.from(atob(String(file.base64)), char =>
    char.charCodeAt(0),
  );
  if (bytes.length > AI_ATTACHMENT_MAX_BYTES) {
    return {failure: 'too-large'};
  }
  const blob = new Blob([bytes], {type: String(file.mimeType)});
  try {
    const api = aiApi((await signedInClient()).api);
    return {
      attachment: await api.uploadAttachment(
        blob,
        String(file.name).slice(0, 200),
      ),
    };
  } catch (error) {
    if (error instanceof ApiError && error.status !== 401) {
      return {failure: failureOf(error)};
    }
    throw error;
  }
}

function failureOf(
  error: ApiError,
): Exclude<ChatAttachResult, {attachment: unknown}>['failure'] {
  if (error.status === 413) {
    return 'too-large';
  }
  const reason = (error.body as {reason?: string} | null)?.reason;
  return reason === 'unsupported' ||
    reason === 'empty' ||
    reason === 'no-vision'
    ? reason
    : 'failed';
}
