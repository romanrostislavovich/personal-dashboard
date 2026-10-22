import { AppointmentBrief, PsychologyAssessment, PsychologyEvent } from '@pd/contracts';
import { briefBlocks } from './brief-document';
import { toDocxDocument } from './brief-export';
import { psychologyMessages } from './psychology.messages';

const brief: AppointmentBrief = {
  id: 'b1',
  title: 'Psychiatrist',
  appointmentOn: '2026-11-05',
  from: '2026-10-01',
  to: '2026-10-31',
  eventIds: ['e1'],
  assessmentIds: ['a1', 'a2'],
  changes: 'Sleeping better',
  questions: ['Can the dose stay?'],
  notes: '',
  createdAt: '',
  updatedAt: '',
};

function assessment(id: string, takenOn: string, answers: number[]): PsychologyAssessment {
  const sum = answers.reduce((a, b) => a + b, 0);
  return {
    id,
    test: 'phq9',
    takenOn,
    answers,
    sum,
    score: sum,
    band: 'moderate',
    care: answers[8] > 0,
  } as PsychologyAssessment;
}

function event(id: string, title: string): PsychologyEvent {
  return {
    id,
    title,
    description: null,
    startedOn: '2026-10-10',
    endedOn: null,
    ageFrom: null,
    ageTo: null,
    feeling: -1,
    createdAt: '',
  } as PsychologyEvent;
}

describe('the brief for an appointment', () => {
  const text = psychologyMessages('en');
  const blocks = briefBlocks(
    brief,
    [event('e1', 'New job'), event('e2', 'Not picked')],
    [
      assessment('a2', '2026-10-20', [1, 1, 1, 1, 1, 1, 1, 1, 1]),
      assessment('a1', '2026-10-02', [2, 2, 2, 2, 2, 1, 1, 1, 0]),
      assessment('a3', '2026-10-25', [0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ],
    text,
    () => 'Hard',
  );
  const all = JSON.stringify(blocks);

  it('holds only what was picked', () => {
    expect(all).toContain('New job');
    expect(all).not.toContain('Not picked');
    // a3 is not picked: the trend is of the two picked, the earliest first.
    expect(all).toContain('PHQ9: 13 → 9 (2 times)');
  });

  it('tells the answer to the item about self-harm as it is, with no conclusion', () => {
    expect(all).toContain('Item 9 (thoughts of self-harm): 1 of 3');
  });

  it('leaves out an empty section and ends with whose words these are', () => {
    expect(all).not.toContain(text.brief.notes);
    expect(blocks.at(-1)).toEqual({ kind: 'paragraph', text: text.brief.footer, muted: true });
  });

  it('makes a Word file', () => {
    expect(toDocxDocument(blocks).subarray(0, 2).toString()).toBe('PK');
  });
});
