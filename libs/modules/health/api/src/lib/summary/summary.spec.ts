import { HealthSummary } from '@pd/contracts';
import { summaryBlocks } from './summary-blocks';
import { summaryDocx } from './summary-docx';
import { escape, summaryHtml } from './summary-html';
import { parseTranslations, translatableTexts, withTranslations } from './summary-translate';
import { unzipSync, strFromU8 } from 'fflate';

const summary: HealthSummary = {
  language: 'pl',
  patient: 'Roman <script>',
  madeOn: '2026-10-14',
  from: null,
  translated: false,
  conditions: [
    {
      system: 'icd10',
      code: 'F41.1',
      title: 'Генерализованное тревожное расстройство',
      status: 'confirmed',
      firstOn: '2019-03-01',
      lastOn: '2026-10-13',
    },
  ],
  medications: [
    {
      name: 'Escitalopram',
      substance: 'escitalopram',
      dose: '10 мг',
      schedule: 'утром',
      startedOn: '2026-10-13',
      stoppedOn: null,
      stopReason: null,
    },
  ],
  labs: [
    {
      name: 'Глюкоза',
      value: 6.1,
      unit: 'mmol/L',
      low: 3.9,
      high: 5.5,
      flag: 'high',
      day: '2026-09-01',
      earlier: [{ day: '2021-01-01', value: 5.2 }],
    },
  ],
  studies: [],
  visits: null,
};

describe('summary blocks', () => {
  it('writes the headings in the doctor language and leaves out what was not asked for', () => {
    const blocks = summaryBlocks(summary);
    const text = JSON.stringify(blocks);
    expect(blocks[0]).toEqual({ kind: 'title', text: 'Podsumowanie historii choroby' });
    expect(text).toContain('Rozpoznania');
    expect(text).toContain('13.10.2026');
    expect(text).toContain('6.1 mmol/L (powyżej normy)');
    expect(text).toContain('Brak danych.');
    expect(text).not.toContain('Wizyty');
  });
});

describe('summary html', () => {
  it('escapes every text', () => {
    const html = summaryHtml('pl', summaryBlocks(summary));
    expect(html).toContain('Roman &lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<html lang="pl">');
    expect(escape(`a"b'c&`)).toBe('a&quot;b&#39;c&amp;');
  });
});

describe('summary docx', () => {
  it('is a Word archive with the texts in it', () => {
    const files = unzipSync(new Uint8Array(summaryDocx(summaryBlocks(summary))));
    const document = strFromU8(files['word/document.xml']);
    expect(Object.keys(files)).toContain('[Content_Types].xml');
    expect(document).toContain('Escitalopram');
    expect(document).toContain('Roman &lt;script&gt;');
  });
});

describe('summary translation', () => {
  it('translates the words, not the codes or the names of medications', () => {
    const texts = translatableTexts(summary);
    expect(texts).toEqual(['Генерализованное тревожное расстройство', '10 мг', 'утром', 'Глюкоза']);
    const translations = parseTranslations(
      texts,
      '```json\n["Zaburzenie lękowe uogólnione", "10 mg", "rano", "Glukoza"]\n```',
    );
    const translated = withTranslations(summary, translations);
    expect(translated.translated).toBe(true);
    expect(translated.conditions?.[0]).toMatchObject({
      code: 'F41.1',
      title: 'Zaburzenie lękowe uogólnione',
    });
    expect(translated.medications?.[0]).toMatchObject({ name: 'Escitalopram', schedule: 'rano' });
  });

  it('keeps the originals when the answer does not fit', () => {
    expect(parseTranslations(['a', 'b'], '["only one"]').size).toBe(0);
    expect(parseTranslations(['a'], 'no json').size).toBe(0);
    expect(withTranslations(summary, new Map()).translated).toBe(false);
  });
});
