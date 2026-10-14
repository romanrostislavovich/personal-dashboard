import { answerShape, parseDraft, parseLabs } from './draft-parse';

describe('parseDraft', () => {
  it('reads the JSON of a visit, even inside a code fence', () => {
    const draft = parseDraft(
      'Here it is:\n```json\n' +
        JSON.stringify({
          kind: 'visit',
          language: 'pl',
          day: '2026-10-13',
          country: 'pl',
          doctor: 'lek. Anna Nowak',
          speciality: 'psychiatrist',
          diagnoses: [
            { code: 'F41.1', title: 'Zaburzenie lękowe uogólnione', status: 'confirmed' },
          ],
          medications: [{ name: 'Escitalopram', dose: '10 mg', schedule: '1 × dziennie rano' }],
        }) +
        '\n```',
    );
    expect(draft?.kind).toBe('visit');
    expect(draft?.country).toBe('PL');
    expect(draft?.diagnoses).toEqual([
      { code: 'F41.1', title: 'Zaburzenie lękowe uogólnione', status: 'confirmed' },
    ]);
    expect(draft?.medications[0].name).toBe('Escitalopram');
  });

  it('drops what the AI got wrong and keeps the rest', () => {
    const draft = parseDraft(
      JSON.stringify({
        kind: 'something',
        day: '13.10.2026',
        country: 'Poland',
        laboratory: 'Diagnostyka',
        labValues: [
          { name: 'Glukoza', result: '92', unit: 'mg/dl', range: '70-99' },
          { name: '', result: '1' },
        ],
        diagnoses: 'none',
      }),
    );
    expect(draft).toMatchObject({
      kind: 'other',
      day: null,
      country: null,
      laboratory: 'Diagnostyka',
      diagnoses: [],
    });
    expect(draft?.labValues).toEqual([
      { name: 'Glukoza', result: '92', unit: 'mg/dl', range: '70-99' },
    ]);
  });

  it('gives nothing for an answer without JSON', () => {
    expect(parseDraft('I cannot read this document.')).toBeNull();
    expect(parseDraft('{ not json }')).toBeNull();
  });

  it('takes the lists in the other shapes the models answer in', () => {
    const draft = parseDraft(
      JSON.stringify({
        kind: 'visit',
        diagnosis: ['F41.1 Generalised anxiety disorder', 'Insomnia'],
        prescriptions: [
          'Escitalopram 10 mg in the morning',
          { drug: 'Melatonin', dose: '3 mg', schedule: 'at night' },
        ],
      }),
    );
    expect(draft?.diagnoses).toEqual([
      { code: 'F41.1', title: 'Generalised anxiety disorder', status: 'confirmed' },
      { title: 'Insomnia', status: 'confirmed' },
    ]);
    expect(draft?.medications.map((m) => m.name)).toEqual([
      'Escitalopram 10 mg in the morning',
      'Melatonin',
    ]);
    expect(draft?.medications[1].dose).toBe('3 mg');
  });

  it('tells the shape of an answer without its words', () => {
    expect(answerShape('{"kind":"labs","diagnoses":[],"labValues":[{"name":"x"}]}')).toBe(
      'kind, diagnoses[0], labValues[1]',
    );
    expect(answerShape('Sorry, I cannot read it')).toBe('no JSON (23 characters)');
  });

  it('reads the answer to the second question about lab results', () => {
    expect(
      parseLabs(
        '```json\n{"laboratory":"Synevo","labValues":[{"name":"TSH","result":2.1,"unit":"mIU/L"}],"orderedTests":0}\n```',
      ),
    ).toEqual({
      laboratory: 'Synevo',
      labValues: [{ name: 'TSH', result: '2.1', unit: 'mIU/L' }],
      orderedTests: 0,
    });
    expect(parseLabs('{"labValues":[],"orderedTests":3}')).toMatchObject({
      labValues: [],
      orderedTests: 3,
    });
    expect(parseLabs('No results here')).toEqual({
      laboratory: null,
      labValues: [],
      orderedTests: 0,
    });
  });
});
