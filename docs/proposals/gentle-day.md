# Proposal: a gentle day

Status: partial — stage 1 is built (Psychology → Gentle day and a home widget); the later stages are
proposals, and the models below are sketches of the idea rather than the exact code.

## The problem

On a day with little energy a long list of tasks makes things worse: every open item is one more
decision and one more reminder of what is not done. The dashboard should be able to step back on
such a day instead of pushing.

## The scenario

1. The user turns the mode on by themselves — on the home page or in Psychology. Nothing turns
   it on from the mood, the time at the computer or the typing speed.
2. They pick one to three small steps from their own library: "drink water", "write to a
   friend", "open the document I need", "go outside for five minutes".
3. Each step can be done, made smaller ("open the document" → "find the document"), put off with
   "not today", or replaced with "rest". None of these asks for a reason.
4. At the end of the day the plan just ends. Nothing is carried over, nothing is counted as
   missed.

The usual tasks stay where they are; the mode does not move or rewrite their dates. Medical
reminders (medications) and important system messages keep coming.

## The first version

- A personal library of small steps (added, edited and removed by the user).
- The plan of the day: up to three steps, their states, an optional quiet reminder chosen by the
  user.
- A card in Psychology and a home page widget.
- Works fully without the AI and without any wearable.

## Data

```ts
// A sketch, not a contract.
GentleStep { id, userId, text, smallerText?, createdAt }
GentleDayPlan {
  id, userId, localDate,
  steps: { stepId, state: 'open' | 'done' | 'smaller' | 'not-today' | 'rest' }[],
  reminderPreference: 'none' | 'once',
}
```

Mood and energy are not needed. If the user wants to add them, they come from the existing
diary and Psychology records, never as a required field.

## Where it goes

- `libs/modules/psychology/api` and `libs/modules/psychology/web`: the tables, the service, the
  card.
- `libs/shared/contracts`: the schemas; `libs/client/core`: the requests.
- The home page widget and the reminder through the existing mechanisms of the core.
- A link to a task (a step "pay the bill" that is a task) is a reference or an action through
  the core, never an import of Tasks into Psychology.

## Stages

1. The library and the plan picked by hand, the card.
2. The widget and the optional quiet reminder.
3. Only if the user asks: drafts of small steps from the AI ("make this smaller"). The AI never
   rates the user's state.

## Limits

- No streaks, no XP or achievements for how a person feels, no red overdue marks, no catch-up
  list.
- A reminder that got no answer is not repeated louder.
- Leaving the mode and deleting a plan work at once.
- The dashboard helps to organise a day; it does not replace professional help and does not
  promise fewer symptoms.

## Ready when

- The whole scenario works without the AI and without a wearable.
- Every state ("not today", "rest") is as easy to pick as "done".
- Nothing in the rest of the dashboard counts a gentle day as a bad one.
