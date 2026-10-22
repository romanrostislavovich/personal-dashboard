# Proposal: a personal lab

Status: research — the method has to be checked before it is built. A proposal for later work —
the models below are sketches, not an agreed contract or an existing API.

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
