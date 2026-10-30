import {DEFAULT_EMBEDDING_MODEL} from '@pd/contracts';
import {completionSystem} from './ai-prompt';
import {chatCompletion, embed} from './openai-compatible.client';

/*
 * The model the evals ask (`npm run ai:eval`, files `*.eval.ts`): a job's real instruction and
 * a made-up input, the answer checked like a test. Any OpenAI-compatible model:
 *
 *   EVAL_AI_URL    default http://127.0.0.1:11434/v1 (Ollama on this computer)
 *   EVAL_AI_MODEL  default qwen2.5:7b
 *   EVAL_AI_KEY    for a cloud provider
 *
 * Run them before trusting a model with a job, and after changing a prompt.
 */

export interface EvalOptions {
  /** The user's language, as production adds it; `null` — the content's own. */
  language?: string | null;
}

export async function evalAnswer(
  instruction: string,
  content: string,
  {language = 'English'}: EvalOptions = {},
): Promise<string> {
  const message = await chatCompletion(
    {
      baseUrl: process.env['EVAL_AI_URL'] ?? 'http://127.0.0.1:11434/v1',
      model: process.env['EVAL_AI_MODEL'] ?? 'qwen2.5:7b',
      apiKey: process.env['EVAL_AI_KEY'] ?? null,
    },
    [
      {role: 'system', content: completionSystem(instruction, language)},
      {role: 'user', content},
    ],
  );
  return message.content ?? '';
}

/**
 * Vectors from the embedding model the evals use (EVAL_EMBED_MODEL, default the dashboard's
 * own default, at EVAL_AI_URL).
 */
export async function evalEmbed(texts: string[]): Promise<number[][]> {
  return embed(
    {
      baseUrl: process.env['EVAL_AI_URL'] ?? 'http://127.0.0.1:11434/v1',
      model: evalEmbedModel(),
      apiKey: process.env['EVAL_AI_KEY'] ?? null,
    },
    texts,
  );
}

/** The embedding model the evals use, for the task prefixes (see recall-math.ts). */
export const evalEmbedModel = (): string =>
  process.env['EVAL_EMBED_MODEL'] ?? DEFAULT_EMBEDDING_MODEL;
