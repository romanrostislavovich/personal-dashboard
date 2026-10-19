import { ContractLetterInput, LocalDate, RecurringPayment } from '@pd/contracts';
import { nextCancelBy } from './contract-dates';

type Letter = { subject: string; body: string };

/** The facts of a payment the letter is about, the same for the AI and the template. */
function facts(payment: RecurringPayment, today: LocalDate) {
  const contract = payment.contract;
  return {
    name: payment.name,
    price: `${payment.amount.toFixed(2)} ${payment.currency}`,
    period: payment.period,
    startedOn: contract?.startedOn ?? null,
    termEndsOn: contract?.termEndsOn ?? null,
    cancelBy: contract ? nextCancelBy(payment, contract) : null,
    noticeDays: payment.noticeDays,
    priceLockedUntil: payment.priceLockedUntil,
    previousPrice: payment.priceHistory.at(-1)?.amount ?? null,
    today,
  };
}

const LANGUAGE = { en: 'English', pl: 'Polish' } as const;

/** What the AI is asked: a short formal letter, as JSON, nothing invented. */
export function letterPrompt(
  payment: RecurringPayment,
  input: ContractLetterInput,
  today: LocalDate,
): { instruction: string; text: string } {
  const goal =
    input.kind === 'cancel'
      ? 'ends the contract (a notice of termination) at the end of the current term, or at the earliest date the terms allow, and asks for a written confirmation'
      : 'asks for a better price or terms: mentions being a customer since the start date, the price rises if any, that cheaper offers exist on the market, and that the customer considers leaving otherwise';
  return {
    instruction:
      `Write a short, polite, formal letter in ${LANGUAGE[input.language]} to the provider of a ` +
      `service. The letter ${goal}. Use only the facts given; where a fact the letter needs is ` +
      `missing (a customer or contract number, an address), put a placeholder in square ` +
      `brackets. Answer with JSON only: {"subject": "...", "body": "..."}.`,
    text: JSON.stringify({ ...facts(payment, today), sender: input.details ?? null }),
  };
}

/** The AI's JSON answer, or `null` when it is not one. */
export function parseLetter(answer: string): Letter | null {
  const json = answer.slice(answer.indexOf('{'), answer.lastIndexOf('}') + 1);
  try {
    const parsed = JSON.parse(json) as Partial<Letter>;
    return typeof parsed.subject === 'string' && typeof parsed.body === 'string' && parsed.body
      ? { subject: parsed.subject.trim(), body: parsed.body.trim() }
      : null;
  } catch {
    return null;
  }
}

/** The letter without an AI: a plain template with the facts filled in. */
export function contractLetter(
  payment: RecurringPayment,
  input: ContractLetterInput,
  today: LocalDate,
): Letter {
  const f = facts(payment, today);
  const sender = input.details?.trim() || '[Imię i nazwisko / Name]';
  if (input.language === 'pl') {
    const since = f.startedOn ? ` od ${f.startedOn}` : '';
    return input.kind === 'cancel'
      ? {
          subject: `Wypowiedzenie umowy — ${f.name}`,
          body: [
            'Szanowni Państwo,',
            '',
            `niniejszym wypowiadam umowę na usługę „${f.name}” [numer umowy / klienta]` +
              (f.termEndsOn
                ? ` z końcem bieżącego okresu umowy, tj. ${f.termEndsOn}`
                : ' z zachowaniem okresu wypowiedzenia przewidzianego w umowie') +
              '.',
            'Proszę o pisemne potwierdzenie przyjęcia wypowiedzenia oraz daty zakończenia umowy.',
            '',
            'Z poważaniem,',
            sender,
          ].join('\n'),
        }
      : {
          subject: `Prośba o obniżenie ceny — ${f.name}`,
          body: [
            'Szanowni Państwo,',
            '',
            `jestem Państwa klientem${since} [numer klienta] i obecnie płacę ${f.price} za usługę „${f.name}”.` +
              (f.previousPrice !== null
                ? ` Wcześniej cena wynosiła ${f.previousPrice.toFixed(2)}.`
                : ''),
            'Na rynku dostępne są tańsze oferty o podobnych warunkach. Zanim podejmę decyzję o zmianie dostawcy, proszę o przedstawienie lepszej oferty lub obniżenie ceny.',
            '',
            'Z poważaniem,',
            sender,
          ].join('\n'),
        };
  }
  const since = f.startedOn ? ` since ${f.startedOn}` : '';
  return input.kind === 'cancel'
    ? {
        subject: `Notice of termination — ${f.name}`,
        body: [
          'Dear Sir or Madam,',
          '',
          `I hereby give notice to terminate my contract for "${f.name}" [contract / customer number]` +
            (f.termEndsOn
              ? ` at the end of the current term, on ${f.termEndsOn}`
              : ' with the notice period set out in the contract') +
            '.',
          'Please confirm in writing that you have received this notice and the date the contract ends.',
          '',
          'Yours faithfully,',
          sender,
        ].join('\n'),
      }
    : {
        subject: `Request for a better price — ${f.name}`,
        body: [
          'Dear Sir or Madam,',
          '',
          `I have been your customer${since} [customer number] and currently pay ${f.price} for "${f.name}".` +
            (f.previousPrice !== null
              ? ` The price used to be ${f.previousPrice.toFixed(2)}.`
              : ''),
          'Cheaper offers with similar terms are available elsewhere. Before I decide to switch providers, I would like to ask for a better offer or a lower price.',
          '',
          'Yours faithfully,',
          sender,
        ].join('\n'),
      };
}
