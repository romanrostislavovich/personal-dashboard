import { strFromU8, unzipSync } from 'fflate';
import { toDocx, toXlsx, xmlText } from './events-export';

const table = {
  title: 'Events',
  subtitle: '1 Sep 2026 – 30 Sep 2026',
  headers: ['From', 'To', 'Event', 'How it felt', 'Description'],
  rows: [
    [
      '2026-09-03',
      '2026-09-10',
      'Moved to a new flat',
      'Good',
      'Boxes & "chaos" <for a week>\nThen calm.',
    ],
    ['2026-09-20', '', 'Переезд офиса', 'Hard', ''],
  ],
};
const files = (archive: Buffer) =>
  Object.fromEntries(
    Object.entries(unzipSync(archive)).map(([name, data]) => [name, strFromU8(data)]),
  );

describe('events export', () => {
  it('escapes what XML does not take as it is, and drops what it does not take at all', () => {
    expect(xmlText('a < b & "c"\u0001')).toBe('a &lt; b &amp; &quot;c&quot;');
  });

  it('makes a workbook with the title, a header row and a row an event', () => {
    const xlsx = files(toXlsx(table));
    expect(Object.keys(xlsx)).toEqual(
      expect.arrayContaining([
        '[Content_Types].xml',
        'xl/workbook.xml',
        'xl/worksheets/sheet1.xml',
      ]),
    );
    const sheet = xlsx['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain('<c r="A4" t="inlineStr" s="1">');
    expect(sheet).toContain('Moved to a new flat');
    expect(sheet).toContain('Переезд офиса');
    expect(sheet).toContain('Boxes &amp; &quot;chaos&quot; &lt;for a week&gt;');
    // The last row of the two events is the sixth of the sheet.
    expect(sheet).toContain('<row r="6">');
    expect(sheet).not.toContain('<row r="7">');
  });

  it('makes a document with a table; a line break is a paragraph of the cell', () => {
    const document = files(toDocx(table))['word/document.xml'];
    expect(document.match(/<w:tr>/g)).toHaveLength(3);
    expect(document).toContain('Then calm.');
    expect(document).toContain('Переезд офиса');
    expect(document).toContain('w:orient="landscape"');
  });
});
