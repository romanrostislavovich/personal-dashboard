/**
 * Diary Markdown → plain text for previews and snippets, on the server and in the list of
 * entries: marks keep their emoji, links keep their text, images, table borders and task
 * checkboxes go away.
 */
export function diaryPlainText(content: string): string {
  return content
    .replace(/==/g, '')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/\[[ xX]]/g, ' ')
    .replace(/[#*_`>~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
