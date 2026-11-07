import {
  InsightFact,
  QuestionAnswer,
  QuestionNumber,
  QuestionWhen,
} from '@pd/contracts';
import {formatValue} from './links-format';

/*
 * How a question's answer and a finding read when no AI worded them: one plain sentence from the
 * numbers, and the lines of its proof. Pure: the translation comes in as a function.
 */

export type Translate = (
  key: string,
  params?: Record<string, unknown>,
) => string;

export interface Wording {
  translate: Translate;
  locale: string;
}

/**
 * A number's name: its own label, else its translation; `inside` — in the middle of a sentence,
 * so its first letter small (a label of the user's own stays as written).
 */
export function nameOf(
  number: QuestionNumber,
  {translate, locale}: Wording,
  inside = false,
): string {
  if (number.label) {
    return number.label;
  }
  const name = translate(number.labelKey);
  return inside
    ? name.charAt(0).toLocaleLowerCase(locale) + name.slice(1)
    : name;
}

/** A day as the language writes it ("12 October 2026"). */
export function dayOf(day: string, {locale}: Wording): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** How often chance alone gives this, as a share: "< 0.01 %", "3.1 %". */
export function chanceOf(p: number, {locale}: Wording): string {
  const percent = (digits: number) =>
    new Intl.NumberFormat(locale, {
      style: 'percent',
      maximumFractionDigits: digits,
    });
  // Below a hundredth of a percent it is "less than that", with the digits to say so.
  return p < 0.0001 ? `< ${percent(2).format(0.0001)}` : percent(1).format(p);
}

/** A value in the number's unit: minutes as minutes, the rest as the links show them. */
export function valueOf(
  number: Pick<QuestionNumber, 'unit'>,
  value: number,
  {translate, locale}: Wording,
): string {
  if (number.unit === 'minutes') {
    return translate('life.hourly.minutes', {value: Math.round(value)});
  }
  return formatValue({unit: number.unit}, value, locale, hours =>
    translate('life.hours', {value: hours}),
  );
}

/** "Deep work on the same day: 2 h on the days of more interruptions, 3 h on the others (90 days)". */
export function answerSentence(
  cause: QuestionNumber,
  effect: QuestionNumber,
  when: QuestionWhen,
  answer: QuestionAnswer,
  wording: Wording,
): string {
  const {translate} = wording;
  if (answer.status === 'missing') {
    return translate('life.questions.missing');
  }
  if (answer.status === 'few' || answer.high === null || answer.low === null) {
    return translate(
      when === 'hourAfter' ? 'life.questions.fewTimes' : 'life.questions.few',
      {n: answer.n},
    );
  }
  if (when === 'hourAfter') {
    return translate('life.questions.after', {
      effect: nameOf(effect, wording),
      cause: nameOf(cause, wording),
      after: valueOf(effect, answer.high, wording),
      usual: valueOf(effect, answer.low, wording),
      n: answer.n,
    });
  }
  return translate('life.questions.pair', {
    effect: nameOf(effect, wording),
    when: translate(`life.questions.when.${when}`),
    cause: nameOf(cause, wording, true),
    threshold: valueOf(cause, answer.threshold ?? 0, wording),
    high: valueOf(effect, answer.high, wording),
    low: valueOf(effect, answer.low, wording),
    n: answer.n,
  });
}

/** The proof's lines of the confounders: held within them, or maybe explained by them. */
export function confounderLines(
  answer: QuestionAnswer,
  {translate}: Wording,
): string[] {
  return answer.confounders.flatMap(({confounder, holds}) =>
    holds === null
      ? []
      : [
          translate(
            holds ? 'life.questions.holds' : 'life.questions.explains',
            {what: translate(`life.questions.confounder.${confounder}`)},
          ),
        ],
  );
}

/** A finding as one sentence. */
export function insightSentence(fact: InsightFact, wording: Wording): string {
  switch (fact.kind) {
    case 'change':
      return wording.translate('life.insights.change', {
        number: nameOf(fact.number, wording),
        day: dayOf(fact.day, wording),
        before: valueOf(fact.number, fact.before, wording),
        after: valueOf(fact.number, fact.after, wording),
      });
    case 'after':
      return wording.translate('life.questions.after', {
        effect: nameOf(fact.effect, wording),
        cause: nameOf(fact.cause, wording),
        after: valueOf(fact.effect, fact.after, wording),
        usual: valueOf(fact.effect, fact.usual, wording),
        n: fact.events,
      });
    default:
      return answerSentence(
        fact.cause,
        fact.effect,
        fact.when,
        fact.answer,
        wording,
      );
  }
}
