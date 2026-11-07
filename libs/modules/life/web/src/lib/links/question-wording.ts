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

/** A number's name: its own label, else its translation. */
export function nameOf(number: QuestionNumber, {translate}: Wording): string {
  return number.label ?? translate(number.labelKey);
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
    return translate('life.questions.few', {n: answer.n});
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
    cause: nameOf(cause, wording),
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
        day: fact.day,
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
