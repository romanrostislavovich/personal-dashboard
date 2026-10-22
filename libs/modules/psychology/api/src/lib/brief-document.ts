import {
  AppointmentBrief,
  PsychologyAssessment,
  PsychologyEvent,
  QUESTIONNAIRES,
} from '@pd/contracts';
import { DocBlock } from './brief-export';
import { psychologyMessages } from './psychology.messages';

type Texts = ReturnType<typeof psychologyMessages>;

/**
 * The brief as blocks of a document: only what the user picked, each part in its own section,
 * an empty section left out. Numbers of the questionnaires are shown as they are, with their
 * dates and the band of the questionnaire — never a conclusion.
 */
export function briefBlocks(
  brief: AppointmentBrief,
  events: PsychologyEvent[],
  assessments: PsychologyAssessment[],
  text: Texts,
  feeling: (event: PsychologyEvent) => string,
): DocBlock[] {
  const b = text.brief;
  const blocks: DocBlock[] = [
    { kind: 'title', text: brief.title },
    { kind: 'paragraph', text: b.period(brief.from, brief.to), muted: true },
  ];
  if (brief.appointmentOn) {
    blocks.push({ kind: 'paragraph', text: b.appointment(brief.appointmentOn), muted: true });
  }
  if (brief.changes) {
    blocks.push({ kind: 'heading', text: b.changes }, { kind: 'paragraph', text: brief.changes });
  }

  const picked = assessments
    .filter((item) => brief.assessmentIds.includes(item.id))
    .sort((x, y) => x.takenOn.localeCompare(y.takenOn));
  if (picked.length) {
    const trends = QUESTIONNAIRES.flatMap((questionnaire) => {
      const of = picked.filter((item) => item.test === questionnaire.id);
      return of.length
        ? [b.trend(questionnaire.id.toUpperCase(), of[0].score, of[of.length - 1].score, of.length)]
        : [];
    });
    blocks.push(
      { kind: 'heading', text: b.checkups },
      { kind: 'list', items: trends },
      {
        kind: 'table',
        headers: b.checkupHeaders,
        rows: picked.map((item) => {
          const careItem = QUESTIONNAIRES.find((q) => q.id === item.test)?.careItem;
          const band = b.bands[item.band] ?? item.band;
          return [
            item.takenOn,
            b.tests[item.test],
            String(item.score),
            item.care && careItem ? `${band}\n${b.care(item.answers[careItem - 1])}` : band,
          ];
        }),
      },
    );
  }

  // The earliest first: a story.
  const told = events.filter((event) => brief.eventIds.includes(event.id)).reverse();
  if (told.length) {
    blocks.push(
      { kind: 'heading', text: b.events },
      {
        kind: 'table',
        headers: b.eventHeaders,
        rows: told.map((event) => [
          [event.startedOn ?? text.age(event.ageFrom ?? 0, event.ageTo), event.endedOn]
            .filter(Boolean)
            .join(' – '),
          event.title,
          feeling(event),
          event.description ?? '',
        ]),
      },
    );
  }
  if (brief.questions.length) {
    blocks.push(
      { kind: 'heading', text: b.questions },
      { kind: 'list', items: brief.questions, numbered: true },
    );
  }
  if (brief.notes) {
    blocks.push({ kind: 'heading', text: b.notes }, { kind: 'paragraph', text: brief.notes });
  }
  blocks.push({ kind: 'paragraph', text: b.footer, muted: true });
  return blocks;
}
