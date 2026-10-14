import { strToU8, zipSync } from 'fflate';
import { SummaryBlock } from './summary-blocks';

/**
 * A summary as a Word document: a ZIP of XML written by hand (as Psychology's export does),
 * no library. Titles and headings are bold, the tables have thin borders, muted paragraphs are
 * grey; a row out of range has its result in bold.
 */
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const MAIN = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export function summaryDocx(blocks: SummaryBlock[]): Buffer {
  const body = blocks.map(block).join('');
  return Buffer.from(
    zipSync({
      '[Content_Types].xml': strToU8(
        `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
          '</Types>',
      ),
      '_rels/.rels': strToU8(
        `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
          '</Relationships>',
      ),
      'word/document.xml': strToU8(
        `${XML}<w:document xmlns:w="${MAIN}"><w:body>${body}` +
          '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
          '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>' +
          '</w:body></w:document>',
      ),
    }),
  );
}

function block(item: SummaryBlock): string {
  switch (item.kind) {
    case 'title':
      return paragraph(item.text, { bold: true, size: 32 });
    case 'heading':
      return paragraph(item.text, { bold: true, size: 26, before: 240 });
    case 'paragraph':
      return paragraph(item.text, { color: item.muted ? '5D5B66' : undefined });
    case 'table':
      return table(item.head, item.rows, item.marked ?? []);
  }
}

interface Look {
  bold?: boolean;
  size?: number;
  color?: string;
  before?: number;
}

/** A line break of the text is a line break of the paragraph. */
function paragraph(text: string, look: Look = {}): string {
  const spacing = look.before ? `<w:pPr><w:spacing w:before="${look.before}"/></w:pPr>` : '';
  return `<w:p>${spacing}${run(text, look)}</w:p>`;
}

function run(text: string, { bold, size = 20, color }: Look): string {
  const props =
    (bold ? '<w:b/>' : '') +
    (color ? `<w:color w:val="${color}"/>` : '') +
    `<w:sz w:val="${size}"/>`;
  const lines = text
    .split(/\r?\n/)
    .map((line) => `<w:t xml:space="preserve">${xmlText(line)}</w:t>`);
  return `<w:r><w:rPr>${props}</w:rPr>${lines.join('<w:br/>')}</w:r>`;
}

function table(head: string[], rows: string[][], marked: boolean[]): string {
  const border = (side: string) =>
    `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="C8C6D0"/>`;
  const cell = (text: string, look: Look) => `<w:tc>${paragraph(text, look)}</w:tc>`;
  return (
    '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>' +
    ['top', 'bottom', 'insideH'].map(border).join('') +
    '</w:tblBorders></w:tblPr>' +
    `<w:tr>${head.map((text) => cell(text, { bold: true, size: 18, color: '5D5B66' })).join('')}</w:tr>` +
    rows
      .map(
        (row, index) =>
          `<w:tr>${row
            .map((text, column) => cell(text, { size: 18, bold: marked[index] && column === 1 }))
            .join('')}</w:tr>`,
      )
      .join('') +
    '</w:tbl><w:p/>'
  );
}

/** Text as XML takes it; characters XML does not allow at all are dropped. */
export function xmlText(value: string): string {
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  );
}
