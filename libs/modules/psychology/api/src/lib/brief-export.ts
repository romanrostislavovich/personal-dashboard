import {xmlText, zip} from '@pd/api-core';

/**
 * A document of blocks — headings, paragraphs, lists and tables — as a Word file (`.docx`),
 * written by hand like the export of events: a brief for an appointment is a page or two.
 */
export type DocBlock =
  | {kind: 'title'; text: string}
  | {kind: 'heading'; text: string}
  | {kind: 'paragraph'; text: string; muted?: boolean}
  | {kind: 'list'; items: string[]; numbered?: boolean}
  | {kind: 'table'; headers: string[]; rows: string[][]};

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const MAIN = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function run(
  value: string,
  options: {bold?: boolean; size?: number; muted?: boolean} = {},
) {
  const props =
    (options.bold ? '<w:b/>' : '') +
    (options.muted ? '<w:color w:val="666666"/>' : '') +
    `<w:sz w:val="${options.size ?? 22}"/>`;
  return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${xmlText(value)}</w:t></w:r>`;
}

/** A line break inside a text is a new paragraph. */
function paragraphs(
  value: string,
  options: Parameters<typeof run>[1] = {},
  spaceAfter = 120,
) {
  return value
    .split(/\r?\n/)
    .map(
      line =>
        `<w:p><w:pPr><w:spacing w:after="${spaceAfter}"/></w:pPr>${run(line, options)}</w:p>`,
    )
    .join('');
}

function table(headers: string[], rows: string[][]): string {
  const cell = (value: string, bold = false) =>
    `<w:tc><w:tcPr/>${paragraphs(value, {bold}, 0)}</w:tc>`;
  const row = (values: string[], bold = false) =>
    `<w:tr>${values.map(value => cell(value, bold)).join('')}</w:tr>`;
  const border = (side: string) =>
    `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`;
  return (
    '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map(border)
      .join('') +
    '</w:tblBorders></w:tblPr>' +
    row(headers, true) +
    rows.map(values => row(values)).join('') +
    '</w:tbl><w:p/>'
  );
}

function block(item: DocBlock): string {
  switch (item.kind) {
    case 'title':
      return paragraphs(item.text, {bold: true, size: 32});
    case 'heading':
      return `<w:p><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>${run(item.text, {bold: true, size: 26})}</w:p>`;
    case 'paragraph':
      return paragraphs(item.text, {muted: item.muted});
    case 'list':
      return item.items
        .map((text, index) =>
          paragraphs(
            `${item.numbered ? `${index + 1}.` : '•'} ${text}`,
            {},
            60,
          ),
        )
        .join('');
    case 'table':
      return table(item.headers, item.rows);
  }
}

export function toDocxDocument(blocks: DocBlock[]): Buffer {
  return zip({
    '[Content_Types].xml':
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>',
    '_rels/.rels':
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
    'word/document.xml':
      `${XML}<w:document xmlns:w="${MAIN}"><w:body>` +
      blocks.map(block).join('') +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>' +
      '</w:body></w:document>',
  });
}
