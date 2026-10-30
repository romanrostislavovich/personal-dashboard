import {defineConfig} from 'vitest/config';
import {API_TEST_ENV} from './libs/api/core/test-env.mts';

/**
 * The evals of the AI jobs (`*.eval.ts`): real instructions, made-up inputs, a live model —
 * so not a part of `npm test` and CI. Run: `npm run ai:eval`; the model is chosen by
 * EVAL_AI_URL / EVAL_AI_MODEL / EVAL_AI_KEY (see libs/api/core/src/lib/ai/eval-model.ts).
 */
export default defineConfig({
  resolve: {tsconfigPaths: true},
  test: {
    name: 'ai-evals',
    env: API_TEST_ENV,
    globals: true,
    environment: 'node',
    include: ['libs/**/src/**/*.eval.ts'],
    // A local model on a CPU takes its time.
    testTimeout: 300_000,
    fileParallelism: false,
    watch: false,
  },
});
