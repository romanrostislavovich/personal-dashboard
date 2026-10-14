import { SummaryLanguage } from '@pd/contracts';
import { SummaryBlock } from './summary-blocks';

/**
 * A summary as one page of HTML with nothing outside it — no script, no font, no image — that
 * a doctor opens from a link or the user prints to PDF. Every text is escaped.
 */
export function summaryHtml(language: SummaryLanguage, blocks: SummaryBlock[]): string {
  const title = blocks.find((block) => block.kind === 'title')?.text ?? '';
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escape(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
${blocks.map(render).join('\n')}
</main>
</body>
</html>`;
}

function render(block: SummaryBlock): string {
  switch (block.kind) {
    case 'title':
      return `<h1>${escape(block.text)}</h1>`;
    case 'heading':
      return `<h2>${escape(block.text)}</h2>`;
    case 'paragraph':
      return `<p${block.muted ? ' class="muted"' : ''}>${escape(block.text)}</p>`;
    case 'table':
      return `<div class="table"><table>
<thead><tr>${block.head.map((cell) => `<th>${escape(cell)}</th>`).join('')}</tr></thead>
<tbody>
${block.rows
  .map(
    (row, index) =>
      `<tr${block.marked?.[index] ? ' class="marked"' : ''}>${row
        .map((cell) => `<td>${escape(cell)}</td>`)
        .join('')}</tr>`,
  )
  .join('\n')}
</tbody></table></div>`;
  }
}

export function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Light, as on paper; it prints the same. */
const STYLE = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; background: #fff; color: #1b1b1f; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 900px; margin: 0 auto; padding: 32px 16px 48px; }
h1 { margin: 0 0 8px; font-size: 24px; }
h2 { margin: 28px 0 8px; padding-bottom: 4px; font-size: 17px; border-bottom: 1px solid #c8c6d0; }
p { margin: 4px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.muted { color: #5d5b66; font-size: 13px; }
.table { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { text-align: left; color: #5d5b66; font-weight: 600; }
th, td { padding: 5px 10px 5px 0; border-bottom: 1px solid #e3e1ea; vertical-align: top; }
tr.marked td:nth-child(2) { font-weight: 700; }
@media print {
  main { padding: 0; max-width: none; }
  h2 { break-after: avoid; }
  tr { break-inside: avoid; }
}
`;
