# Proposal: a personal lab

Status: built 2026-11-08 (Links v2's last stage) — see "Decisions" at the end; the sketches
below were the starting point, the contract is `libs/shared/contracts/src/lib/links-lab.ts`.

## The problem

Life → Links finds numbers that go together, but a correlation does not tell what causes what.
To learn whether a small change helps, one has to try it by rules chosen beforehand, not read
meaning into the days afterwards.

Not to be confused with the ML experiments of Study (W&B / MLflow runs).

## The scenario

1. A safe everyday question: "is the first block of work easier without notifications?"
2. One main number, chosen beforehand: for example a voluntary rating of comfort, 1–5, at the
   end of the block. Other numbers may be shown, but do not decide.
3. A schedule of ordinary and changed days, made before the start.
4. Observations day by day. A missed day stays missing — never a zero.
5. A calm summary: the two kinds of days side by side, how many days of each there are, how
   much they vary. The user can stop or pause at any time without "finishing".

## The first version

- A protocol typed by hand and observations.
- A descriptive result with its coverage and spread, and "not enough data yet" when it is so.
- No randomisation, no statistics beyond the description.

## Data

```ts
// A sketch, not a contract.
PersonalExperiment {
  id, userId, hypothesis,
  primaryMetricId,          // a daily number of Links, or a voluntary rating
  schedule: { localDate, condition: 'ordinary' | 'changed' }[],
  startOn, endOn,
  status: 'draft' | 'running' | 'paused' | 'stopped' | 'done',
  protocolVersion,          // a change of the rules makes a new version
}
Observation { id, experimentId, localDate, condition, value?, sourceRef?, adherenceNote? }
```

## Where it goes

- The orchestration next to Life and Links in the core (`libs/api/core/src/lib/links/` uses the
  daily numbers already), the page in Life.
- `libs/shared/contracts` and `libs/client/core` as usual.
- The user's time zone and the existing daily series.

## Things to account for

- Weekends, the order of the conditions, an effect that carries over to the next day, outside
  changes (an illness, a trip).
- No promise of a fixed length or that any number of days is enough.

## Stages

1. The protocol and the observations by hand, the descriptive result.
2. After the method is checked: optional alternation or randomisation of the conditions and an
   estimate of the uncertainty.

## Limits

- No experiments with medications, sleep deprivation, food or self-prescribed exposure.
- No causal and no medical conclusions — the summary describes, it does not prove.

## Ready when

- Pause and stop work correctly; the history of protocol changes is kept.
- "Not enough data" is shown instead of a verdict.
- Missed days never turn into zeros.

## Decisions (2026-11-08, the owner's)

- **The schedule:** randomised at once, not stage 2 — half and half ordinary and changed days
  within weekdays and within weekends, drawn when the experiment starts and never again.
- **The main number:** any daily number of Links, or a rating 1–5 of the user's own that the bot
  asks at a chosen hour with five buttons (the page can mark it too).
- **Which day it is:** a separate message in the morning at a chosen hour (the quiet hours wait).
- **The result:** each kind's mean and spread, the difference and its 95 % range from 2000
  resamples; "not enough days yet" before six days of each; a day not kept as planned is left
  out, a missed one is missing, never zero; told as a description, never a proof.
- **The rules:** 14–60 days (28 by default); new words or hours make a new version, the old ones
  listed; the schedule and the number stay. Pause, go on, stop, delete; past its end it is done.
- **Safety:** a required "an everyday change: no medications, food or less sleep" box; the
  assistant refuses those.
- **Where:** the Lab tab in Life; "Check it" under a finding or a question opens the form with
  the question and its effect as the number; the assistant's `core_experiments` and
  `core_start_experiment` (confirmed first, undoable); achievements for an experiment seen to the
  end and for days kept as planned — never for its result.

- **After the team review:** a start in the past is refused (the days must be drawn before
  they come); the page shows every day of the plan, the ones to come faint, and today can be
  marked; a paused experiment is still done past its end, told once; a stopped one takes no more
  days; a forged rating button is refused, and a question held for the quiet hours is not sent
  once the day is rated on the page; a day and a version keep the same id on both instances, so
  a sync never makes two; stop and delete are asked first; the assistant's confirmation says the
  change is an everyday one. Five buttons stay: the phone's shade shows no buttons for more than
  three, so a tap opens the card with all five.

**Built (2026-11-08):** all of the above.
