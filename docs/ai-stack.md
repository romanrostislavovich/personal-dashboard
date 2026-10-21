# The AI stack

The AI of the dashboard, layer by layer — the five layers of a generative AI product as Google
lays them out (Gen AI Leader): **application, agents, platform, model, infrastructure**.

The code is not organised by these layers, and should not be: it is cut by the sections of a
life (finance, health, music…, see [architecture.md](architecture.md)), and every section has
its piece in several layers. This page is the other cut — where each layer lives, and what is
still missing in it.

```
 Application     web · desktop · PWA · browser extension · Telegram — where a person meets the AI
 Agents          the assistant with tools · Security Agent · automations · device tools
 Platform        AiService · connections · usage and limits · tools registry · MCP · evals
 Model           DeepSeek · OpenAI (text, vision, speech) · Ollama (local) · any OpenAI-compatible
 Infrastructure  your server (Docker) · your computer (desktop app, Ollama) · providers' clouds
```

## Application — where the AI is seen

| Feature                                                            | Where                                                                                        |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| The chat with the assistant over all your data, files and pictures | `libs/modules/ai/web`, `libs/api/core/src/lib/ai/ai.controller.ts`                           |
| The assistant in Telegram (text, voice, documents)                 | `ai-telegram.assistant.ts`                                                                   |
| The assistant beside a web page                                    | `apps/extension/src/sidepanel`                                                               |
| The morning digest                                                 | `ai/morning-digest.job.ts` + `<module>.digest.ts` of each section                            |
| The story of a month or a year ("Wrapped")                         | `life/life-stories.service.ts`                                                               |
| A receipt photo → an expense, a statement PDF → transactions       | `finance/api/src/lib/bank`, `health/.../documents/document-reader.service.ts`                |
| The writing check and rewrites                                     | `libs/modules/writing`, the extension, the desktop app                                       |
| Letters to cancel a contract, summaries of the diary and of health | `finance/.../recurring/contract-letter.ts`, `diary-summary.service.ts`, `health/.../summary` |

## Agents — the AI that acts

- **The assistant** (`AiService.ask`, `ai/tool-loop.ts`): every section gives it tools
  (`<module>.ai-tools.ts`, see `ai/ai-tool.ts`); it reads and changes data. A deletion or an
  overwrite waits for "yes" (`ai/pending-confirmations.ts`); every change is logged
  (`ai/ai-actions.service.ts`).
- **Security Agent** (`security/security-agent.service.ts`): every morning it investigates what
  the security sources saw and tells what to fix.
- **Automations** (`automations/automations.service.ts`): "if X, then Y" across sections, built
  from one sentence by the AI.
- **Device tools** (`devices/device-tools.service.ts`): a browser or a computer that is online
  lends its tools — the page in front, the open tabs, the window in front.

## Platform — what the agents are built on

- **One gateway to any model** — `ai/ai.service.ts` over `ai/openai-compatible.client.ts`
  (Chat Completions, tools, pictures, speech).
- **Connections** — `ai/ai-connections.service.ts`: several per user, an active one, one of its
  own for a section, one for pictures, one for speech, one for light tasks; keys encrypted by
  `secrets/secrets.service.ts`.
- **Usage, prices and monthly limits** — `ai/ai-usage.service.ts`; past the limit background
  work goes on with a local model.
- **Privacy switches** — a section can be off for the AI, or kept to its own connection.
- **MCP server** — `mcp/`: the same tools for Claude, Cursor and other MCP clients, with access
  tokens.
- **Files for the model** — `ai/attachment-text.ts`: PDF, Excel, CSV, text, pictures.
- **Evals** — `apps/api/evals`: cases a model must pass before it is trusted with a job
  (`npm run ai:eval`), see below.

## Model — which model does what

| Job                                                        | Model                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| The chat, the digest, stories, letters (writing)           | the active connection (DeepSeek, OpenAI…)                                             |
| Sorting, extracting, short JSON (light tasks)              | the light-task connection when set (e.g. a local Qwen in Ollama), else the active one |
| A section with its own connection (e.g. Health kept local) | that connection, always                                                               |
| Pictures (receipts, screenshots, documents)                | the picture connection and its vision model                                           |
| Voice messages                                             | OpenAI speech-to-text (Whisper)                                                       |
| Past the monthly limit                                     | a local model, for background work                                                    |

## Infrastructure — where it runs

- **Your server** — Docker: the API, Postgres, LanguageTool, Caddy (`deploy/compose.yml`).
- **Your computer** — the desktop app (activity, screenshots, the writing check in every
  program) and, if installed, Ollama with local models.
- **Providers' clouds** — DeepSeek, OpenAI, or any OpenAI-compatible host.
- **Sync** — a local copy of the dashboard that works offline and syncs both ways
  ([sync.md](sync.md)).

## The gaps

| Layer          | Gap                                                                               | State                                                                                        |
| -------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Platform       | No checks of answer quality: a wrong digest was found by the user, not by a test  | ✅ evals (`npm run ai:eval`): the digest, sorting bank operations, search by meaning         |
| Model          | One model for every job: a cloud model sorts merchants a local one sorts for free | ✅ a light-task connection (Settings → AI)                                                   |
| Platform       | No memory between conversations, no search by meaning over your history           | ✅ memory (`ai/ai-memory.service.ts`) and search by meaning (`recall/`)                      |
| Agents         | A change made by the assistant cannot be undone                                   | ✅ undo from the log or by asking (`ai/ai-undo.ts`)                                          |
| Infrastructure | A local model only on your computer                                               | ✅ an optional Ollama service next to the API ([deploy.md](deploy.md))                       |
| Agents         | Nothing works while you sleep                                                     | later: the night shift ([Night Butler](https://github.com/romanrostislavovich/night-butler)) |

**Undo** needs no code of its own in a tool: a write tool names its tables (`undoTables`), the
user's rows of them are read before and after the call, and the difference is the way back —
what was added goes, what was changed gets its old values, what was deleted comes back from
the trash. A row changed again since is left alone.

**Search by meaning** keeps only vectors, in a schema of its own (`search`, not synced): the
text stays in its section, encrypted where the section encrypts it. Every hour the sections'
items (`<module>.recall.ts`) get a vector from the embedding connection; a question is compared
with all of them — a person's history is a few thousand items, no vector database is needed.
The default model is `paraphrase-multilingual`: the evals showed `nomic-embed-text` does not
understand Russian. Sections switched off for the AI or kept to their own connection are left
out.

**What the evals said about models** (on a laptop CPU): `qwen2.5:7b` passes the digest and the
sorting; `qwen2.5:3b` and `1.5b` do not. The assistant itself (the chat with all its tools) is
too much for a local model on a CPU — it is for the cloud connection.

## Training a model on your own data

Can a neural network be trained on everything the dashboard holds? Yes — but "train an LLM on
my life" is rarely the right tool. What fits each wish:

| What you want                                                                                          | The right tool                                                                                                                             | Why                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The assistant knows my history" (when did I last have this symptom?)                                  | **Retrieval (RAG)**: embeddings of diary entries, notes, visits; the model reads the relevant ones at question time                        | facts change every day; a fine-tuned model would be stale tomorrow and would make up details; retrieval cites the real entry                                                      |
| "It remembers what I told it"                                                                          | **Memory**: short facts kept and given to the model                                                                                        | a few lines of text, edited and deleted by you                                                                                                                                    |
| Predict or classify from numbers (the category of a payment, tomorrow's mood, a bill that is too high) | **A small supervised model** on your own history: a gradient-boosted tree or a tiny network; or **TabPFN**, which needs no training at all | you already have labelled data: thousands of categorised payments, daily mood with sleep, steps, focus, spending; a model of kilobytes, trained in seconds on a CPU, runs offline |
| "It writes like me" (diary prompts, messages in my voice)                                              | **LoRA fine-tuning** of a small open model (Qwen, Llama, Gemma) on your own texts                                                          | the only case where fine-tuning helps — style, not facts; needs a GPU for hours (rented, ~$1–5), and the result is private and yours                                              |

How it is done here:

1. ✅ **A category model for payments** (`finance/.../categories/category-model.ts`): a naive
   Bayes over the words and the pieces of words of the counterparty and the title, and the size
   of the amount, trained in a moment on the user's sorted transactions. It is measured on
   counterparties it never saw; once it is right in 90% of the cases it is sure of (60 examples
   at least), a bank import's new counterparty gets its category from it, and only the rest goes
   to the AI. It also fills the category in the form of a new transaction.
2. ✅ **Forecasts for Life** (`links/forecast.ts`): today's mood from yesterday's numbers of
   every section, by a ridge regression over the user's own days, with what pulls the mood up and
   down. It learns on the earlier days and is measured on the latest ones against "like the last
   week"; it is shown (Life → Summary, and to the assistant) only when it beats it.
3. ✅ **Retrieval over the history** — search by meaning (above), the assistant's
   `core_recall`, and its memory (`core_remember`, `core_forget`).
4. **Your voice (optional)** — LoRA on the diary and your messages, on a rented GPU, served by
   Ollama like any local model. Only after 1–3, and only if you want it.

What stays the same in all of them: the data never leaves your server unless you choose a cloud
model, every model is a file you can delete, and every job has evals before it is trusted.
