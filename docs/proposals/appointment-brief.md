# Proposal: ready for an appointment

Status: partial — stage 1 is built (Psychology → For an appointment, a Word file); the later stages are
proposals, and the models below are sketches of the idea rather than the exact code.

## The problem

At an appointment with a doctor or a psychologist it is hard to remember what happened in the
last weeks, and painful to tell a heavy history from the start every time. The records are in
the dashboard already; what is missing is a way to gather the right part of them into one page.

This is an organizer of one's own notes — not an AI therapist and not a diagnostic system.

## The scenario

1. Pick a period ("since the last visit") and the specialist.
2. Pick the records to include, one by one, with a preview: life events and questionnaires of
   Psychology first; diary entries and Health records only when chosen separately.
3. Add what changed, the questions to ask, one's own observations.
4. Read the one-page brief, remove any part of it.
5. Export it by hand (PDF or print). Nothing is sent anywhere by itself.

## The first version

- A brief from the user's own notes and Psychology's data (events, questionnaire results as
  numbers with their dates).
- Export to PDF.
- No AI.

## Data

```ts
// A sketch, not a contract.
AppointmentBrief {
  id, userId,
  period: { from, to },
  specialist?: string,
  selectedSourceRefs: { module, entityType, entityId }[],
  questions: string[],
  personalNotes: string,
  draftText?: string,   // written by the AI, kept apart from the user's own words
  reviewedAt?: Date,
}
```

Each line of the brief keeps its source and date. What the user wrote and what the AI drafted
look different on the page.

## Where it goes

- `libs/modules/psychology/`: the forms, the brief and the export.
- Records of other modules (the diary, Health) through owner-scoped providers in the core, the
  way `LifeSource` gathers a day — never by reading another module's tables.
- `libs/shared/contracts` and `libs/client/core` as usual.
- Sensitive text uses the existing encryption, deletion and access rules. A hidden module is
  never included by itself.

## Stages

1. The brief from one's notes and Psychology, the export.
2. Records of the diary and Health picked with a preview.
3. Optional: the AI shortens the picked records, with explicit consent to the chosen provider
   (a local model is offered first). The user approves the final text.

## Limits

- No treatment advice, no dose changes, no diagnoses added.
- A questionnaire result is shown as a number with its date, never as a diagnosis.
- No automatic sending, no sharing link by default.

## Ready when

- Every statement of the brief can be checked against its source.
- Any section can be removed, and the brief can be made without the AI.
- The export contains only what was picked.
