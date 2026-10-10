import { strToU8, zipSync } from 'fflate';

/**
 * A table as an Excel workbook or a Word document. Both are ZIP archives of XML: written by
 * hand here, a few files each, so no library is needed for one table.
 */
export interface ExportTable {
  title: string;
  /** A line under the title: the period, when it was made. */
  subtitle: string;
  headers: string[];
  rows: string[][];
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

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

/** `A`, `B` … `Z`, `AA`: the letter of a column. */
function column(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

function zip(files: Record<string, string>): Buffer {
  return Buffer.from(
    zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)]))),
  );
}

/** `.xlsx`: one sheet, the title, the subtitle, a bold header row and the rows. */
export function toXlsx(table: ExportTable): Buffer {
  const cell = (value: string, row: number, col: number, style = 0) =>
    `<c r="${column(col)}${row}" t="inlineStr"${style ? ` s="${style}"` : ''}>` +
    `<is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
  const row = (values: string[], index: number, style = 0) =>
    `<row r="${index}">${values.map((value, col) => cell(value, index, col, style)).join('')}</row>`;
  const rows = [
    row([table.title], 1, 1),
    row([table.subtitle], 2),
    row(table.headers, 4, 1),
    ...table.rows.map((values, index) => row(values, index + 5)),
  ];
  // The first column is dates, the last — a long text.
  const widths = table.headers
    .map((_, index) => {
      const width = index === table.headers.length - 1 ? 60 : index < 2 ? 14 : 28;
      return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
    })
    .join('');
  const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rels = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return zip({
    '[Content_Types].xml':
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>',
    '_rels/.rels':
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${rels}/officeDocument" Target="xl/workbook.xml"/>` +
      '</Relationships>',
    'xl/workbook.xml':
      `${XML}<workbook xmlns="${main}" xmlns:r="${rels}">` +
      `<sheets><sheet name="${xmlText(table.title).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets>` +
      '</workbook>',
    'xl/_rels/workbook.xml.rels':
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${rels}/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="${rels}/styles" Target="styles.xml"/>` +
      '</Relationships>',
    // Style 1 is bold: the title and the header row.
    'xl/styles.xml':
      `${XML}<styleSheet xmlns="${main}">` +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
      '</styleSheet>',
    'xl/worksheets/sheet1.xml':
      `${XML}<worksheet xmlns="${main}"><cols>${widths}</cols>` +
      `<sheetData>${rows.join('')}</sheetData></worksheet>`,
  });
}

/** `.docx`: the title, the subtitle and the table with a bold header row. */
export function toDocx(table: ExportTable): Buffer {
  const run = (value: string, bold = false, size = 22) =>
    `<w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/></w:rPr>` +
    `<w:t xml:space="preserve">${xmlText(value)}</w:t></w:r>`;
  // A line break inside a description is a new paragraph of the cell.
  const paragraphs = (value: string, bold = false) =>
    value
      .split(/\r?\n/)
      .map((line) => `<w:p>${run(line, bold)}</w:p>`)
      .join('');
  const cell = (value: string, bold = false) => `<w:tc><w:tcPr/>${paragraphs(value, bold)}</w:tc>`;
  const row = (values: string[], bold = false) =>
    `<w:tr>${values.map((value) => cell(value, bold)).join('')}</w:tr>`;
  const border = (side: string) =>
    `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`;
  const main = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
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
      `${XML}<w:document xmlns:w="${main}"><w:body>` +
      `<w:p>${run(table.title, true, 32)}</w:p>` +
      `<w:p>${run(table.subtitle)}</w:p>` +
      '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>' +
      ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('') +
      '</w:tblBorders></w:tblPr>' +
      row(table.headers, true) +
      table.rows.map((values) => row(values)).join('') +
      '</w:tbl>' +
      // Landscape: the description needs the width.
      '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>' +
      '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>' +
      '</w:body></w:document>',
  });
}
